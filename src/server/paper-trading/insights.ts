import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";
import { ACTIVE_ORDERS, PaperError, chinaDay, fees, reserve, ruleSchema } from "../../domain/paper-trading";
import { account, overview } from "./service";

const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => Number.isFinite(Date.parse(s)) && new Date(s).toISOString().startsWith(s));
export const historySchema = z.object({
  kind: z.enum(["ORDERS", "FILLS", "ENTRIES", "NOTES", "SNAPSHOTS", "ADJUSTMENTS"]),
  cursor: z.string().min(1).max(120).nullable().default(null), take: z.number().int().min(1).max(100).default(50),
  from: daySchema.optional(), to: daySchema.optional(),
}).strict();
export type HistoryQuery = z.input<typeof historySchema>;
export function dateRange(from?: string, to?: string, now = new Date()) {
  if (from && to && to < from) throw new PaperError("日期区间无效");
  const gte = from ? new Date(`${from}T00:00:00+08:00`) : undefined;
  const end = to ? new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 86400000) : undefined;
  return { ...(gte ? { gte } : {}), lte: now, ...(end ? { lt: end } : {}) };
}

/** Cursor and all record lookups belong to this exact workspace AND account. */
export async function historyPage(db: PrismaClient, workspaceId: string, accountId: string, raw: HistoryQuery, now = new Date()) {
  return db.$transaction(tx => historyInTransaction(tx, workspaceId, accountId, raw, now));
}
async function historyInTransaction(db: Prisma.TransactionClient, workspaceId: string, accountId: string, raw: HistoryQuery, now: Date) {
  const input = historySchema.parse(raw), where = { workspaceId, accountId, createdAt: dateRange(input.from, input.to, now) };
  const a = await account(db, workspaceId, accountId, false);
  const page = { where, orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }], take: input.take + 1, ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}) };
  // Delegate union methods have different generic signatures. Validate ownership
  // through common selected fields rather than weakening any Prisma input type.
  if (input.cursor) {
    const found = input.kind === "ORDERS" ? await db.paperOrder.findFirst({ where: { ...where, id: input.cursor }, select: { id: true } })
      : input.kind === "FILLS" ? await db.paperFill.findFirst({ where: { ...where, id: input.cursor }, select: { id: true } })
      : input.kind === "ENTRIES" ? await db.paperCashEntry.findFirst({ where: { ...where, id: input.cursor }, select: { id: true } })
      : input.kind === "NOTES" ? await db.paperReviewNote.findFirst({ where: { ...where, id: input.cursor }, select: { id: true } })
      : input.kind === "SNAPSHOTS" ? await db.paperEquitySnapshot.findFirst({ where: { ...where, id: input.cursor }, select: { id: true } })
      : await db.paperAdjustment.findFirst({ where: { ...where, id: input.cursor }, select: { id: true } });
    if (!found) throw new PaperError("分页位置不属于当前账户、工作区或查询区间");
  }
  const rows = input.kind === "ORDERS" ? await db.paperOrder.findMany({ ...page, include: { instrument: true } })
    : input.kind === "FILLS" ? await db.paperFill.findMany({ ...page, include: { order: { include: { instrument: true } } } })
    : input.kind === "ENTRIES" ? await db.paperCashEntry.findMany(page)
    : input.kind === "NOTES" ? await db.paperReviewNote.findMany(page)
    : input.kind === "SNAPSHOTS" ? await db.paperEquitySnapshot.findMany(page)
    : await db.paperAdjustment.findMany(page);
  const records = rows.slice(0, input.take);
  return { kind: input.kind, accountId, accountVersion: a.version, records, nextCursor: rows.length > input.take ? records.at(-1)?.id ?? null : null, asOf: now };
}

export async function orderDetails(db: PrismaClient, workspaceId: string, orderId: string, now = new Date()) {
  const order = await db.paperOrder.findFirst({ where: { id: orderId, workspaceId }, include: {
    instrument: true, rule: true, fills: { include: { quote: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
    events: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
  } });
  if (!order) throw new PaperError("委托不存在", 404);
  const a = await account(db, workspaceId, order.accountId, false);
  const entries = await db.paperCashEntry.findMany({ where: { workspaceId, accountId: order.accountId, reference: { in: order.fills.map(f => f.id) } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const rules = ruleSchema.parse(JSON.parse(order.rule.configJson));
  let filled = 0, turnover = 0n, paid = 0n;
  let previous = reserve(order.limitMinor, order.quantity, turnover, paid, order.side, rules);
  const resources = [{ type: "SUBMITTED", at: order.createdAt, remainingQuantity: order.quantity, cashFrozenMinor: previous, sharesFrozen: order.side === "SELL" ? order.quantity : 0, fillId: null as string | null }];
  for (const fill of order.fills) {
    filled += fill.quantity; turnover += fill.priceMinor * BigInt(fill.quantity); paid += fill.feeMinor;
    const remaining = order.quantity - filled;
    previous = reserve(order.limitMinor, remaining, turnover, paid, order.side, rules);
    resources.push({ type: "FILLED", at: fill.createdAt, remainingQuantity: remaining, cashFrozenMinor: previous, sharesFrozen: order.side === "SELL" ? remaining : 0, fillId: fill.id });
  }
  if (!ACTIVE_ORDERS.includes(order.status)) resources.push({ type: order.status, at: order.events.at(-1)?.createdAt ?? order.createdAt, remainingQuantity: order.quantity - order.filled, cashFrozenMinor: 0n, sharesFrozen: 0, fillId: null });
  return { accountId: a.id, accountVersion: a.version, order, entries, resources,
    remainingQuantity: order.quantity - order.filled, expectedCumulativeFeeMinor: fees(order.turnoverMinor, order.side, rules),
    resourceBasis: "按该委托保存的规则和成交事实重建，冻结不作为现金扣款", asOf: now };
}

type Observation = { id: string; createdAt: Date; equityMinor: bigint | null; quality: string };
export function observationMetrics(points: Observation[]) {
  const ordered = [...points].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  let peak = 0n, maxDrawdownBps = 0;
  const invalid: string[] = [], valid: Observation[] = [];
  for (const point of ordered) {
    if (point.quality !== "CURRENT" || point.equityMinor === null || point.equityMinor < 0n) { invalid.push(point.id); continue; }
    valid.push(point);
    if (point.equityMinor > peak) peak = point.equityMinor;
    const drop = peak > 0n ? Number((peak - point.equityMinor) * 10000n / peak) : 0;
    maxDrawdownBps = Math.max(maxDrawdownBps, drop);
  }
  // Use one terminal observation per real day; an invalid terminal point means
  // that day is missing, rather than silently selecting an earlier valuation.
  const byDay = new Map<string, Observation>();
  for (const p of ordered) byDay.set(chinaDay(p.createdAt), p);
  const daily = [...byDay.entries()].map(([day, p]) => ({ day, id: p.id, equityMinor: p.quality === "CURRENT" ? p.equityMinor : null, quality: p.quality, at: p.createdAt }));
  const pricedDays = daily.filter((p): p is typeof p & { equityMinor: bigint } => p.equityMinor !== null && p.equityMinor >= 0n);
  return { maxDrawdownBps: valid.length >= 2 ? maxDrawdownBps : null, validCount: valid.length, invalidIds: invalid,
    first: valid[0] ?? null, last: valid.at(-1) ?? null, daily,
    dailyEquitySumMinor: pricedDays.reduce((n, p) => n + p.equityMinor, 0n), dailyEquityCount: pricedDays.length,
    note: "仅基于真实有效估值点；缺失区间不插值，可能低估区间最大回撤" };
}
const bps = (numerator: bigint, denominator: bigint): number | null => denominator > 0n ? Number(numerator * 10000n / denominator) : null;

export async function accountInsights(db: PrismaClient, workspaceId: string, accountId: string, raw: { from?: string; to?: string } = {}, now = new Date()) {
  const input = z.object({ from: daySchema.optional(), to: daySchema.optional() }).strict().parse(raw);
  const data = await overview(db, workspaceId, accountId, now);
  if (!data.account) throw new PaperError("模拟账户不存在", 404);
  if ("replaySession" in data && data.replaySession) now = data.replaySession.clock;
  const a = data.account, range = dateRange(input.from, input.to, now);
  const replayDataset = "replaySession" in data && data.replaySession ? await db.paperReplayDataset.findFirst({ where: { id: data.replaySession.datasetId, workspaceId } }) : null;
  const calendarRange = { gte: input.from ?? chinaDay(a.createdAt), lte: input.to && input.to < chinaDay(now) ? input.to : chinaDay(now) };
  const historicalCalendar = replayDataset ? JSON.parse(replayDataset.calendarJson) as { day: string; isOpen: boolean }[] : null;
  const [points, fills, adjustments, calendar] = await Promise.all([
    db.paperEquitySnapshot.findMany({ where: { workspaceId, accountId, createdAt: range }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    db.paperFill.findMany({ where: { workspaceId, accountId, createdAt: range } }),
    db.paperAdjustment.findMany({ where: { workspaceId, accountId, createdAt: range } }),
    historicalCalendar ? historicalCalendar.filter(c => c.day >= calendarRange.gte && c.day <= calendarRange.lte) : db.marketCalendar.findMany({ where: { day: calendarRange }, orderBy: { day: "asc" } }),
  ]);
  const observations = observationMetrics(points);
  const turnover = fills.reduce((s, f) => s + f.priceMinor * BigInt(f.quantity), 0n), periodFees = fills.reduce((s, f) => s + f.feeMinor, 0n);
  const dailyByDay = new Map(observations.daily.map(p => [p.day, p]));
  // Turnover uses trading days, one latest actual valuation per day, not every
  // intraday snapshot. Sparse calendar coverage is explicitly reported.
  const openDays = calendar.filter(c => c.isOpen);
  const measuredDays = openDays.map(c => dailyByDay.get(c.day)).filter((p): p is NonNullable<typeof p> & { equityMinor: bigint } => !!p && p.equityMinor !== null && p.equityMinor >= 0n);
  const dailySum = measuredDays.reduce((s, p) => s + p.equityMinor, 0n);
  const turnoverBps = dailySum > 0n ? bps(turnover * BigInt(measuredDays.length), dailySum) : null;
  const expectedDays = openDays.map(c => c.day), missingDays = expectedDays.filter(d => dailyByDay.get(d)?.equityMinor == null);
  const firstDay = input.from ?? chinaDay(a.createdAt), lastDay = input.to && input.to < chinaDay(now) ? input.to : chinaDay(now);
  const firstDayAt = Date.parse(`${firstDay}T00:00:00Z`), lastDayAt = Date.parse(`${lastDay}T00:00:00Z`);
  if (lastDayAt - firstDayAt > 3660 * 86400000) throw new PaperError("分析区间最长十年");
  const knownDays = new Set(calendar.map(c => c.day)), unknownCalendarDays: string[] = [];
  for (let at = firstDayAt; at <= lastDayAt; at += 86400000) { const day = new Date(at).toISOString().slice(0, 10); if (!knownDays.has(day)) unknownCalendarDays.push(day); }
  const terminalMissing = observations.daily.at(-1)?.equityMinor === null;
  const closePoints = points.filter(p => p.key.startsWith("close:") && p.quality === "CURRENT" && p.equityMinor !== null && p.equityMinor > 0n);
  const start = closePoints[0] ?? null, end = terminalMissing ? null : closePoints.at(-1) ?? null;
  let benchmark: { symbol: string; startDay: string; endDay: string; accountReturnBps: number; benchmarkReturnBps: number; sources: string[]; evidenceIds: string[]; basis: string } | null = null;
  let benchmarkMissing = "缺少两个有效账户估值点";
  if (start?.equityMinor && end?.equityMinor && start.id !== end.id) {
    const startDay = chinaDay(start.createdAt), endDay = chinaDay(end.createdAt);
    // Benchmark data is stored by DATE with no exchange intraday stamp. Only
    // actual close snapshots can be compared to official daily closing prices.
    const closeStart = points.find(p => p.id === start.id)?.key.startsWith("close:");
    const closeEnd = points.find(p => p.id === end.id)?.key.startsWith("close:");
    const prices = await db.paperBenchmarkPoint.findMany({ where: { symbol: "sh000300", day: { in: [startDay, endDay] } } });
    const first = prices.find(p => p.day === startDay), last = prices.find(p => p.day === endDay);
    benchmarkMissing = "账户起止必须为同日收盘估值，且基准起止日期必须完整一致";
    if (closeStart && closeEnd && first && last && first.closeMinor > 0n && last.closeMinor > 0n && startDay < endDay) {
      benchmark = { symbol: "sh000300", startDay, endDay, accountReturnBps: bps(end.equityMinor - start.equityMinor, start.equityMinor)!, benchmarkReturnBps: bps(last.closeMinor - first.closeMinor, first.closeMinor)!, sources: [first.source, last.source], evidenceIds: [first.id, last.id], basis: "沪深 300 价格指数，不含红利再投资；只比较相同收盘区间" };
      benchmarkMissing = "";
    }
  }
  const valued = "positions" in data ? data.positions as { marketMinor: bigint | string | null; costMinor: bigint | string }[] : [];
  const validEquity = "quality" in data && data.quality === "CURRENT" && "equityMinor" in data ? data.equityMinor : null;
  const currentMarket = "marketMinor" in data ? data.marketMinor : null;
  const knownPositionValues = valued.map(p => typeof p.marketMinor === "bigint" ? p.marketMinor : typeof p.marketMinor === "string" && /^\d+$/.test(p.marketMinor) ? BigInt(p.marketMinor) : null).filter((v): v is bigint => v !== null);
  const largest = knownPositionValues.reduce((v, p) => p > v ? p : v, 0n);
  const allPositionsPriced = knownPositionValues.length === valued.length;
  const corporateIncome = data.adjustments.reduce((n, p) => n + p.cashMinor, 0n);
  const floating = validEquity !== null && allPositionsPriced ? knownPositionValues.reduce((n, p) => n + p, 0n) - valued.reduce((n, p) => n + BigInt(p.costMinor), 0n) : null;
  return { accountId, accountVersion: a.version, asOf: now, from: input.from ?? chinaDay(a.createdAt), to: input.to ?? chinaDay(now),
    cashMinor: a.cashMinor, initialMinor: a.initialMinor, feesMinor: a.feesMinor, realizedMinor: a.realizedMinor,
    floatingMinor: floating, corporateIncomeMinor: corporateIncome, valuationQuality: "quality" in data ? data.quality : "INCOMPLETE", valuationAt: "valuationAt" in data ? data.valuationAt : now,
    equityMinor: validEquity, accountPnlMinor: validEquity !== null ? validEquity - a.initialMinor : null, accountReturnBps: validEquity !== null ? bps(validEquity - a.initialMinor, a.initialMinor) : null,
    feeTreatment: "买入费用计入持仓成本，卖出费用计入已实现盈亏；展示费用用于解释，不再从账户收益重复扣减。初始资金不计收益。公司行为现金单列。",
    period: { turnoverMinor: turnover, feeMinor: periodFees, realizedMinor: fills.reduce((n, f) => n + f.realizedMinor, 0n), corporateIncomeMinor: adjustments.reduce((n, p) => n + p.cashMinor, 0n),
      turnoverBps, feeToTurnoverBps: bps(periodFees, turnover), feeToInitialBps: bps(periodFees, a.initialMinor), validDailyCount: measuredDays.length, expectedDailyCount: openDays.length,
      coverage: expectedDays.length && !missingDays.length && !unknownCalendarDays.length ? "COMPLETE_OBSERVED_CALENDAR" : "PARTIAL", missingDays, unknownCalendarDays, turnoverBasis: "双边成交额÷有效交易日日均净资产；按日取最后一个实际估值点，缺失日期不填充" },
    maxDrawdownBps: observations.maxDrawdownBps, observations, benchmark, benchmarkMissing,
    concentration: { largestPositionBps: validEquity && allPositionsPriced ? bps(largest, validEquity) : null, stockAllocationBps: validEquity && currentMarket !== null ? bps(currentMarket, validEquity) : null },
    evidenceIds: [a.id, ...points.map(p => p.id), ...fills.map(f => f.id), ...adjustments.map(p => p.id), ...(benchmark?.evidenceIds ?? [])],
  };
}
