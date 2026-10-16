import { createHash, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient, PaperAccount, PaperOrder } from "@prisma/client";
import { ACTIVE_ORDERS, DEFAULT_RULES, PaperError, chinaDay, chinaMinute, continuous, fees, feeBreakdown, reserve, checkQuantity, checkPriceCage, json, orderInputSchema, roundRatio, ruleSchema } from "../../domain/paper-trading";
import { withPaperLock } from "../../lib/paper-lock";
import { closeConditionsForAccount } from "./conditions";

export type Tx = Prisma.TransactionClient;
const digest = (value: unknown) => createHash("sha256").update(json(value)).digest("hex");
export const transaction = <T>(db: PrismaClient, fn: (tx: Tx) => Promise<T>) => withPaperLock(() => db.$transaction(fn, { timeout: 8000 }));
async function account(tx: Tx, workspaceId: string, id: string, active = true) {
  const a = await tx.paperAccount.findFirst({ where: { id, workspaceId } });
  if (!a) throw new PaperError("模拟账户不存在", 404);
  if (active && (a.status !== "ACTIVE" || a.health !== "OK")) throw new PaperError("账户已归档或账务待核对");
  return a;
}
async function rulesFor(tx: Tx, id: string) {
  const r = await tx.paperRuleVersion.findUniqueOrThrow({ where: { id } }); return ruleSchema.parse(JSON.parse(r.configJson));
}
async function bump(tx: Tx, a: PaperAccount) {
  const updated = await tx.paperAccount.updateMany({ where: { id: a.id, workspaceId: a.workspaceId, version: a.version }, data: { version: { increment: 1 } } });
  if (updated.count !== 1) throw new PaperError("账户已变化，请刷新", 409);
}
async function cash(tx: Tx, a: PaperAccount, amountMinor: bigint, type: string, eventKey: string, reference: string, now: Date) {
  const updated = await tx.paperAccount.update({ where: { id: a.id }, data: { cashMinor: { increment: amountMinor } } });
  if (updated.cashMinor < 0n) throw new PaperError("资金不足，无法支付成交和费用");
  await tx.paperCashEntry.create({ data: { workspaceId: a.workspaceId, accountId: a.id, amountMinor, balanceMinor: updated.cashMinor, type, eventKey, reference, createdAt: now } });
}
async function event(tx: Tx, o: PaperOrder, type: string, detail: string, now: Date) {
  return tx.paperOrderEvent.create({ data: { workspaceId: o.workspaceId, accountId: o.accountId, orderId: o.id, type, detail, createdAt: now } });
}
async function nextTradingDay(tx: Tx, day: string) {
  const start = new Date(`${day}T00:00:00Z`);
  for (let n = 1; n <= 30; n++) {
    const d = new Date(start.getTime() + n * 86400000).toISOString().slice(0, 10);
    const row = await tx.marketCalendar.findUnique({ where: { day: d } });
    if (!row) return null; if (row.isOpen) return d;
  }
  return null;
}
async function sellable(tx: Tx, accountId: string, instrumentId: string, day: string) {
  const p = await tx.paperPosition.findUnique({ where: { accountId_instrumentId: { accountId, instrumentId } }, include: { lots: true } });
  return { position: p, available: p ? p.lots.filter(l => l.sellableOn <= day).reduce((s, l) => s + l.quantity, 0) - p.frozen : 0 };
}
async function environment(tx: Tx, a: PaperAccount, instrumentId: string, now: Date, requireWorker = true) {
  if (a.mode === "REPLAY") return replayEnvironment(tx, a, instrumentId);
  const day = chinaDay(now), rules = await rulesFor(tx, a.ruleId);
  const [instrument, state, quote, calendar, lease, next] = await Promise.all([
    tx.marketInstrument.findUnique({ where: { id: instrumentId } }),
    tx.marketDailyState.findUnique({ where: { instrumentId_day: { instrumentId, day } } }),
    tx.marketQuote.findFirst({ where: { instrumentId, provider: rules.provider }, orderBy: { sourceAt: "desc" } }),
    tx.marketCalendar.findUnique({ where: { day } }), tx.paperWorkerLease.findUnique({ where: { id: "matching" } }), nextTradingDay(tx, day),
  ]);
  const blockers: string[] = [];
  if (!rules.qualified || rules.qualifiedUntil < day) blockers.push("行情、费用及规则尚未通过盘中验证，或验证已过期");
  if (!calendar) blockers.push("交易日历待核实"); else if (!calendar.isOpen) blockers.push("今天休市");
  if (!continuous(now)) blockers.push("当前不在支持的连续竞价时段");
  if (!instrument || /ST|退|^N|^C/.test(instrument.name)) blockers.push("证券不在已支持的普通股票范围");
  if (state?.status !== "NORMAL" || !state.eventCoverage) blockers.push("当日证券状态或公司行为资料待核实");
  if (!state || state.lowerMinor <= 0n || state.upperMinor < state.lowerMinor) blockers.push("当日价格限制待核实");
  if (state && quote && quote.upperMinor > 0n && (quote.upperMinor !== state.upperMinor || quote.lowerMinor !== state.lowerMinor)) blockers.push("行情与已核实的价格限制不一致");
  if (!next) blockers.push("下一交易日的日历待核实");
  if (!quote || quote.sourceAt.getTime() > now.getTime() + 1000 || now.getTime() - quote.sourceAt.getTime() > rules.maxAgeMs || now.getTime() - quote.fetchedAt.getTime() > 10000 || quote.priceMinor <= 0n) blockers.push("无可用于成交的新鲜行情");
  if (requireWorker && (!lease || lease.status !== "RUNNING" || lease.expiresAt <= now)) blockers.push("撮合服务未运行或正在恢复");
  return { rules, quote, state, blockers, next, day };
}

async function accountClock(tx: Tx, a: PaperAccount, fallback: Date) {
  if (a.mode !== "REPLAY") return fallback;
  const s = await tx.paperReplaySession.findUnique({ where: { accountId: a.id } });
  if (!s) throw new PaperError("历史回放会话不存在");
  return s.clock;
}
async function replayEnvironment(tx: Tx, a: PaperAccount, instrumentId: string) {
  const session = await tx.paperReplaySession.findUnique({ where: { accountId: a.id }, include: { dataset: true } });
  const rules = await rulesFor(tx, a.ruleId);
  if (!session) return { rules, quote: null, state: null, blockers: ["历史回放会话不存在"], next: null, day: "" };
  const day = chinaDay(session.clock), provider = `REPLAY:${session.id}`;
  const [bar, quote, instrument] = await Promise.all([
    tx.paperReplayBar.findFirst({ where: { datasetId: session.datasetId, instrumentId, closeAt: { lte: session.clock } }, orderBy: { closeAt: "desc" } }),
    tx.marketQuote.findFirst({ where: { instrumentId, provider, sourceAt: { lte: session.clock } }, orderBy: { sourceAt: "desc" } }),
    tx.marketInstrument.findUnique({ where: { id: instrumentId } }),
  ]);
  const calendar = JSON.parse(session.dataset.calendarJson) as { day: string; isOpen: boolean }[];
  const next = calendar.filter(c => c.isOpen && c.day > day).sort((x,y) => x.day.localeCompare(y.day))[0]?.day ?? null;
  const blockers: string[] = [];
  if (!bar || !bar.eventCoverage || bar.status !== "NORMAL" || chinaDay(bar.closeAt) !== day) blockers.push("历史证券状态或公司行为资料缺失");
  if (!instrument || /ST|退|^N|^C/.test(instrument.name)) blockers.push("证券不在已支持的普通股票范围");
  if (!quote || !bar || quote.sourceAt.getTime() !== bar.closeAt.getTime()) blockers.push("没有当前回放时点的有效行情");
  if (!next) blockers.push("下一交易日的历史日历待核实");
  if (["COMPLETED", "FINISHED", "BLOCKED"].includes(session.status)) blockers.push("回放已结束或资料待核对");
  const state = bar ? { status: bar.status, eventCoverage: bar.eventCoverage, lowerMinor: bar.lowerMinor, upperMinor: bar.upperMinor } : null;
  return { rules, quote, state, blockers, next, day };
}

export type AccountOptions = { purpose?: "MANUAL" | "AI"; mode?: "LIVE" | "REPLAY"; name?: string; initialMinor?: bigint };
export async function createAccountInTransaction(tx: Tx, workspaceId: string, now: Date, options: AccountOptions = {}) {
    const purpose = options.purpose ?? "MANUAL", mode = options.mode ?? "LIVE";
    const initialMinor = options.initialMinor ?? 10_000_000n;
    if (initialMinor <= 0n || initialMinor > 100_000_000_000n || initialMinor % 100n) throw new PaperError("初始资金须为正整数元，且不超过十亿元");
    await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    if (purpose === "MANUAL" && mode === "LIVE") {
      const existing = await tx.paperAccount.findFirst({ where: { workspaceId, status: "ACTIVE", purpose, mode } }); if (existing) return existing;
    }
    await tx.paperRuleVersion.upsert({ where: { id: "paper-v1-unverified" }, create: { id: "paper-v1-unverified", configJson: json(DEFAULT_RULES), source: "演示假设，待验证" }, update: {} });
    const published = await tx.paperRuleVersion.findMany({ orderBy: { createdAt: "desc" } });
    const current = published.find(r => { const config = ruleSchema.parse(JSON.parse(r.configJson)); return config.qualified && config.qualifiedUntil >= chinaDay(now); });
    const a = await tx.paperAccount.create({ data: { workspaceId, purpose, mode, name: (options.name ?? (purpose === "AI" ? "AI 策略实验" : mode === "REPLAY" ? "历史回放账户" : "手动模拟账户")).trim().slice(0, 80), initialMinor, cashMinor: initialMinor, ruleId: current?.id ?? "paper-v1-unverified", createdAt: now } });
    await tx.paperCashEntry.create({ data: { workspaceId, accountId: a.id, eventKey: `initial:${a.id}`, type: "INITIAL", amountMinor: a.initialMinor, balanceMinor: a.cashMinor, reference: "模拟初始资金，不计收益", createdAt: now } });
    await snapshot(tx, a, "initial", now); return a;
}
export async function createAccount(db: PrismaClient, workspaceId: string, now = new Date(), options: AccountOptions = {}) {
  return transaction(db, tx => createAccountInTransaction(tx, workspaceId, now, options));
}

export async function previewOrder(db: PrismaClient, workspaceId: string, accountId: string, raw: unknown, at?: Date) {
  const input = orderInputSchema.parse(raw);
  return transaction(db, async tx => {
    const a = await account(tx, workspaceId, accountId);
    const now = await accountClock(tx, a, at ?? new Date()), env = await environment(tx, a, input.instrumentId, now);
    const { available } = await sellable(tx, a.id, input.instrumentId, env.day);
    checkQuantity(input, available, env.rules);
    if (!env.blockers.length && env.quote) checkPriceCage(input, env.quote, env.rules);
    if (env.state && (input.limitMinor < env.state.lowerMinor || input.limitMinor > env.state.upperMinor)) throw new PaperError("限价超出已核实的当日价格范围");
    const frozenMinor = reserve(input.limitMinor, input.quantity, 0n, 0n, input.side, env.rules);
    if (a.cashMinor - a.frozenMinor < frozenMinor) throw new PaperError("可用模拟资金不足（含费用）");
    if (input.side === "SELL" && available < input.quantity) throw new PaperError("可卖数量不足，今日买入尚不可卖");
    const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    const result = { ...input, turnoverMinor: input.limitMinor * BigInt(input.quantity), feeMinor: fees(input.limitMinor * BigInt(input.quantity), input.side, env.rules),
      feeBreakdown: feeBreakdown(input.limitMinor * BigInt(input.quantity), input.side, env.rules),
      feePolicy: { commissionPpm: env.rules.commissionPpm, minimumCommissionMinor: env.rules.minimumCommissionMinor, transferPpm: env.rules.transferPpm, stampSellPpm: env.rules.stampSellPpm,
        commissionBasis: "模拟佣金设定（含经手费、证管费，不含过户费及印花税），不是用户实际券商报价" },
      frozenMinor, blockers: env.blockers, ruleId: a.ruleId, evidence: env.rules.evidence };
    const p = await tx.paperPreview.create({ data: { workspaceId, accountId, version: a.version, epoch: workspace.dataEpoch, inputJson: json(input), resultJson: json(result), expiresAt: new Date(now.getTime() + 30000), createdAt: now } });
    return { ...result, previewId: p.id, expiresAt: p.expiresAt };
  });
}

export type OrderExecution = { validate: (tx: Tx, a: PaperAccount, input: ReturnType<typeof orderInputSchema.parse>) => Promise<void>; onSubmitted?: (tx: Tx, orderId: string) => Promise<void>; source: "STRATEGY" };
export async function submitOrder(db: PrismaClient, workspaceId: string, accountId: string, previewId: string, key: string, at?: Date, execution?: OrderExecution) {
  const signature = digest({ accountId, previewId });
  return transaction(db, async tx => {
    let now = at ?? new Date();
    const previous = await tx.paperRequest.findUnique({ where: { workspaceId_key: { workspaceId, key } } });
    if (previous) { if (previous.signature !== signature) throw new PaperError("重复请求编号对应不同内容", 409); return JSON.parse(previous.resultJson) as { orderId: string }; }
    const a = await account(tx, workspaceId, accountId);
    now = await accountClock(tx, a, now);
    const p = await tx.paperPreview.findFirst({ where: { id: previewId, workspaceId, accountId } });
    const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    if (!p || p.expiresAt <= now || p.version !== a.version || p.epoch !== workspace.dataEpoch) throw new PaperError("订单预览已过期，请重新预览", 409);
    const input = orderInputSchema.parse(JSON.parse(p.inputJson)), env = await environment(tx, a, input.instrumentId, now);
    if (a.purpose === "AI" && !execution) throw new PaperError("AI 账户仅接受已授权策略运行的委托", 403);
    if (execution) await execution.validate(tx, a, input);
    if (env.blockers.length) throw new PaperError(env.blockers.join("；"));
    if (env.quote) checkPriceCage(input, env.quote, env.rules);
    if (!env.state || input.limitMinor < env.state.lowerMinor || input.limitMinor > env.state.upperMinor) throw new PaperError("价格限制已变化，请重新预览", 409);
    const { available, position } = await sellable(tx, a.id, input.instrumentId, env.day);
    checkQuantity(input, available, env.rules);
    const frozen = reserve(input.limitMinor, input.quantity, 0n, 0n, input.side, env.rules);
    if (a.cashMinor - a.frozenMinor < frozen || (input.side === "SELL" && available < input.quantity)) throw new PaperError("资金或可卖数量不足");
    await bump(tx, a);
    await tx.paperAccount.update({ where: { id: a.id }, data: { frozenMinor: { increment: frozen } } });
    if (input.side === "SELL" && position) await tx.paperPosition.update({ where: { id: position.id }, data: { frozen: { increment: input.quantity } } });
    const o = await tx.paperOrder.create({ data: { ...input, workspaceId, accountId, day: env.day, ruleId: a.ruleId, frozenMinor: frozen, createdAt: now } });
    await event(tx, o, "SUBMITTED", `${execution ? "已授权策略" : "手动"}限价委托；等待提交后的有效报价`, now);
    const result = { orderId: o.id };
    if (execution?.onSubmitted) await execution.onSubmitted(tx, o.id);
    await tx.paperRequest.create({ data: { workspaceId, accountId, key, signature, resultJson: json(result) } }); return result;
  });
}

async function closeOrder(tx: Tx, a: PaperAccount, o: PaperOrder, status: string, now: Date) {
  if (!ACTIVE_ORDERS.includes(o.status)) return;
  await tx.paperAccount.update({ where: { id: a.id }, data: { frozenMinor: { decrement: o.frozenMinor }, version: { increment: 1 } } });
  if (o.side === "SELL") await tx.paperPosition.update({ where: { accountId_instrumentId: { accountId: a.id, instrumentId: o.instrumentId } }, data: { frozen: { decrement: o.quantity - o.filled } } });
  await tx.paperOrder.update({ where: { id: o.id }, data: { status, frozenMinor: 0n } });
  await event(tx, o, status, "仅释放剩余委托，已成交部分保留", now);
}
export async function cancelOrder(db: PrismaClient, workspaceId: string, orderId: string, now = new Date()) {
  return transaction(db, async tx => {
    const o = await tx.paperOrder.findFirst({ where: { id: orderId, workspaceId } }); if (!o) throw new PaperError("委托不存在", 404);
    const a = await account(tx, workspaceId, o.accountId, false); await closeOrder(tx, a, o, "CANCELLED", now); return { orderId };
  });
}

export async function acquireLease(db: PrismaClient, owner: string, at?: Date) {
  return transaction(db, async tx => {
    const now = at ?? new Date();
    const prior = await tx.paperWorkerLease.findUnique({ where: { id: "matching" } });
    if (prior && prior.owner !== owner && prior.expiresAt > now) return null;
    const token = (prior?.token ?? 0) + 1;
    const startedAt = prior && prior.owner === owner && prior.expiresAt > now ? prior.startedAt : now;
    return tx.paperWorkerLease.upsert({ where: { id: "matching" }, create: { id: "matching", owner, token, status: "RUNNING", expiresAt: new Date(now.getTime() + 15000), heartbeatAt: now, startedAt }, update: { owner, token, status: "RUNNING", expiresAt: new Date(now.getTime() + 15000), heartbeatAt: now, startedAt, error: "" } });
  });
}

export async function matchOrders(db: PrismaClient, owner: string, token: number, at?: Date) {
  const ids = await transaction(db, async tx => {
    const now = at ?? new Date();
    const lease = await tx.paperWorkerLease.findUnique({ where: { id: "matching" } });
    if (!lease || lease.owner !== owner || lease.token !== token || lease.expiresAt <= now) throw new PaperError("撮合租约已失效", 409);
    return tx.paperOrder.findMany({ where: { status: { in: ACTIVE_ORDERS }, account: { mode: "LIVE" } }, select: { id: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  });
  // Each order gets a separate short transaction. Re-read after locking to resolve
  // cancellation races, and fence every commit rather than holding all accounts locked.
  for (const item of ids) await transaction(db, async tx => {
    const now = at ?? new Date();
    const lease = await tx.paperWorkerLease.findUnique({ where: { id: "matching" } });
    if (!lease || lease.owner !== owner || lease.token !== token || lease.expiresAt <= now) throw new PaperError("撮合租约已失效", 409);
    const o = await tx.paperOrder.findUnique({ where: { id: item.id } });
    if (!o || !ACTIVE_ORDERS.includes(o.status)) return;
      const a = await account(tx, o.workspaceId, o.accountId, false);
      if (o.day < chinaDay(now) || (o.day === chinaDay(now) && chinaMinute(now) >= 900)) { await closeOrder(tx, a, o, "EXPIRED", now); return; }
      if (a.status !== "ACTIVE" || a.health !== "OK" || a.ruleId !== o.ruleId) return;
      const env = await environment(tx, a, o.instrumentId, now, false), q = env.quote;
      if (env.blockers.length || !q || !env.next || !env.state || q.fetchedAt < lease.startedAt || q.fetchedAt <= o.createdAt || q.sourceAt.getTime() < Math.floor(o.createdAt.getTime() / 1000) * 1000) return;
      if (await tx.paperFill.findUnique({ where: { orderId_quoteId: { orderId: o.id, quoteId: q.id } } })) return;
      const isBuy = o.side === "BUY", fillPrice = isBuy ? q.askMinor : q.bidMinor;
      if (fillPrice <= 0n || fillPrice < env.state.lowerMinor || fillPrice > env.state.upperMinor) return;
      if (isBuy ? fillPrice > o.limitMinor || q.priceMinor >= env.state.upperMinor : fillPrice < o.limitMinor || q.priceMinor <= env.state.lowerMinor) return;
      const consumed = await tx.paperQuoteConsumption.findUnique({ where: { accountId_quoteId_side: { accountId: a.id, quoteId: q.id, side: o.side } } });
      const available = (isBuy ? q.askQuantity : q.bidQuantity) - (consumed?.quantity ?? 0), n = Math.min(o.quantity - o.filled, available);
      if (n <= 0) return;
      const gross = fillPrice * BigInt(n), cumulativeFee = fees(o.turnoverMinor + gross, o.side, env.rules);
      const newReserve = reserve(o.limitMinor, o.quantity - o.filled - n, o.turnoverMinor + gross, cumulativeFee, o.side, env.rules);
      const newCash = a.cashMinor + (isBuy ? -gross : gross) - (cumulativeFee - o.feesMinor);
      if (newCash < 0n || newCash < a.frozenMinor - o.frozenMinor + newReserve) return;
      await fillOrder(tx, a, o, q.id, fillPrice, n, env.next, env.rules, now);
      await tx.paperQuoteConsumption.upsert({ where: { accountId_quoteId_side: { accountId: a.id, quoteId: q.id, side: o.side } }, create: { accountId: a.id, quoteId: q.id, side: o.side, quantity: n }, update: { quantity: { increment: n } } });
  });
}

async function fillOrder(tx: Tx, a: PaperAccount, o: PaperOrder, quoteId: string, price: bigint, n: number, next: string, rules: ReturnType<typeof ruleSchema.parse>, now: Date) {
  const gross = price * BigInt(n), turnover = o.turnoverMinor + gross, cumulativeFees = fees(turnover, o.side, rules), fee = cumulativeFees - o.feesMinor;
  const remaining = o.quantity - o.filled - n, frozen = reserve(o.limitMinor, remaining, turnover, cumulativeFees, o.side, rules);
  const p = await tx.paperPosition.upsert({ where: { accountId_instrumentId: { accountId: a.id, instrumentId: o.instrumentId } }, create: { workspaceId: a.workspaceId, accountId: a.id, instrumentId: o.instrumentId }, update: {} });
  const cost = o.side === "BUY" ? gross + fee : n === p.quantity ? p.costMinor : roundRatio(p.costMinor * BigInt(n), BigInt(p.quantity));
  const realized = o.side === "BUY" ? 0n : gross - fee - cost;
  const fill = await tx.paperFill.create({ data: { workspaceId: a.workspaceId, accountId: a.id, orderId: o.id, quoteId, quantity: n, priceMinor: price, feeMinor: fee, costMinor: cost, realizedMinor: realized, createdAt: now } });
  await cash(tx, a, o.side === "BUY" ? -gross : gross, o.side === "BUY" ? "BUY" : "SELL", `${fill.id}:principal`, fill.id, now);
  if (fee) await cash(tx, a, -fee, "FEE", `${fill.id}:fee`, fill.id, now);
  if (o.side === "BUY") {
    await tx.paperPosition.update({ where: { id: p.id }, data: { quantity: { increment: n }, costMinor: { increment: cost } } });
    await tx.paperPositionLot.create({ data: { workspaceId: a.workspaceId, accountId: a.id, positionId: p.id, quantity: n, sellableOn: next, createdAt: now } });
  } else {
    let toConsume = n;
    const lots = await tx.paperPositionLot.findMany({ where: { positionId: p.id, sellableOn: { lte: chinaDay(now) }, quantity: { gt: 0 } }, orderBy: [{ sellableOn: "asc" }, { createdAt: "asc" }, { id: "asc" }] });
    for (const lot of lots) { const use = Math.min(toConsume, lot.quantity); if (use) await tx.paperPositionLot.update({ where: { id: lot.id }, data: { quantity: { decrement: use } } }); toConsume -= use; }
    if (toConsume) throw new PaperError("可卖批次不一致，请核对账户");
    await tx.paperPosition.update({ where: { id: p.id }, data: { quantity: { decrement: n }, frozen: { decrement: n }, costMinor: { decrement: cost } } });
  }
  const updated = await tx.paperAccount.update({ where: { id: a.id }, data: { frozenMinor: { increment: frozen - o.frozenMinor }, realizedMinor: { increment: realized }, feesMinor: { increment: fee }, version: { increment: 1 } } });
  if (updated.frozenMinor > updated.cashMinor) throw new PaperError("成交后的冻结资金超过余额");
  await tx.paperOrder.update({ where: { id: o.id }, data: { filled: { increment: n }, turnoverMinor: turnover, feesMinor: cumulativeFees, frozenMinor: frozen, status: remaining ? "PARTIALLY_FILLED" : "FILLED" } });
  await event(tx, o, "FILL", `${n} 股；成交 ${fill.id}`, now);
  await snapshot(tx, updated, `fill:${fill.id}`, now);
}

export async function valuation(tx: Tx, a: PaperAccount, now: Date) {
  const replay = a.mode === "REPLAY" ? await tx.paperReplaySession.findUnique({ where: { accountId: a.id } }) : null;
  if (replay) now = replay.clock;
  const positions = await tx.paperPosition.findMany({ where: { accountId: a.id, quantity: { gt: 0 } }, include: { instrument: true, lots: true } });
  const rules = await rulesFor(tx, a.ruleId), evidence = [];
  let market = 0n, cost = 0n, complete = true;
  for (const p of positions) {
    const q = await tx.marketQuote.findFirst({ where: { instrumentId: p.instrumentId, provider: replay ? `REPLAY:${replay.id}` : rules.provider, sourceAt: { lte: now } }, orderBy: { sourceAt: "desc" } });
    const state = await tx.marketDailyState.findUnique({ where: { instrumentId_day: { instrumentId: p.instrumentId, day: chinaDay(now) } } });
    const historical = replay ? await tx.paperReplayBar.findFirst({ where: { datasetId: replay.datasetId, instrumentId: p.instrumentId, closeAt: { lte: now } }, orderBy: { closeAt: "desc" } }) : null;
    const fresh = replay ? Boolean(q && historical?.eventCoverage && historical.status === "NORMAL" && q.sourceAt.getTime() === historical.closeAt.getTime() && chinaDay(historical.closeAt) === chinaDay(now)) : Boolean(q && now.getTime() - q.sourceAt.getTime() <= rules.maxAgeMs && state?.eventCoverage && state.status === "NORMAL");
    const value = q && q.priceMinor > 0n ? q.priceMinor * BigInt(p.quantity) : null;
    if (!fresh || value === null) complete = false;
    if (value !== null) market += value; cost += p.costMinor;
    evidence.push({ ...p, marketMinor: value, floatingMinor: value === null ? null : value - p.costMinor, quoteId: q?.id ?? null, sourceAt: q?.sourceAt ?? null, quality: fresh ? "CURRENT" : "STALE_OR_UNVERIFIED", sellable: p.lots.filter(l => l.sellableOn <= chinaDay(now)).reduce((sum, l) => sum + l.quantity, 0) - p.frozen });
  }
  const priced = evidence.every(p => p.marketMinor !== null);
  return { positions: evidence, marketMinor: priced ? market : null, equityMinor: priced ? a.cashMinor + market : null, floatingMinor: priced ? market - cost : null, quality: complete ? "CURRENT" : "INCOMPLETE", pnlMinor: complete ? a.cashMinor + market - a.initialMinor : null };
}
async function snapshot(tx: Tx, a: PaperAccount, key: string, now: Date) {
  const v = await valuation(tx, a, now);
  return tx.paperEquitySnapshot.upsert({ where: { accountId_key: { accountId: a.id, key } }, create: { workspaceId: a.workspaceId, accountId: a.id, key, cashMinor: a.cashMinor, marketMinor: v.marketMinor, equityMinor: v.equityMinor, quality: v.quality, evidenceJson: json(v.positions), createdAt: now }, update: {} });
}
export async function archiveAccount(db: PrismaClient, workspaceId: string, accountId: string, expectedVersion: number, now = new Date()) {
  return transaction(db, async tx => {
    const a = await account(tx, workspaceId, accountId, false); if (a.status === "ARCHIVED") return a;
    if (a.version !== expectedVersion) throw new PaperError("账户已变化，请重新确认归档", 409);
    await closeConditionsForAccount(tx, a, await accountClock(tx, a, now));
    await tx.paperStrategyAuthorization.updateMany({ where: { experiment: { accountId }, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: now } });
    await tx.paperStrategyRun.updateMany({ where: { experiment: { accountId }, status: "RUNNING" }, data: { status: "CANCELLED", reason: "账户归档", completedAt: now } });
    await tx.paperStrategyExperiment.updateMany({ where: { accountId, status: { not: "ARCHIVED" } }, data: { status: "ARCHIVED", version: { increment: 1 }, stoppedAt: now } });
    await tx.paperReplaySession.updateMany({ where: { accountId }, data: { status: "FINISHED", version: { increment: 1 }, warning: "账户已归档" } });
    for (const o of await tx.paperOrder.findMany({ where: { accountId, status: { in: ACTIVE_ORDERS } } })) await closeOrder(tx, a, o, "CANCELLED", now);
    const updated = await tx.paperAccount.update({ where: { id: accountId }, data: { status: "ARCHIVED", archivedAt: now, version: { increment: 1 } } });
    await snapshot(tx, updated, "archive", now); return updated;
  });
}
export async function overview(db: PrismaClient, workspaceId: string, accountId?: string, now = new Date()) {
  return db.$transaction(async tx => {
    const accounts = await tx.paperAccount.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" } });
    const a = accountId ? accounts.find(a => a.id === accountId) : accounts.find(a => a.status === "ACTIVE" && a.purpose === "MANUAL" && a.mode === "LIVE") ?? accounts.find(a => a.purpose === "MANUAL" && a.mode === "LIVE");
    if (accountId && !a) throw new PaperError("模拟账户不存在", 404);
    const worker = await tx.paperWorkerLease.findUnique({ where: { id: "matching" } });
    if (!a) return { accounts, account: null, worker };
    const [orders, fills, entries, notes, snapshots, watchlist, adjustments] = await Promise.all([
      tx.paperOrder.findMany({ where: { accountId: a.id }, include: { instrument: true, events: true }, orderBy: { createdAt: "desc" } }),
      tx.paperFill.findMany({ where: { accountId: a.id }, orderBy: { createdAt: "desc" } }),
      tx.paperCashEntry.findMany({ where: { accountId: a.id }, orderBy: { createdAt: "desc" } }),
      tx.paperReviewNote.findMany({ where: { accountId: a.id }, orderBy: { createdAt: "desc" } }),
      tx.paperEquitySnapshot.findMany({ where: { accountId: a.id }, orderBy: { createdAt: "asc" } }),
      tx.paperWatchlist.findMany({ where: { accountId: a.id }, include: { instrument: true } }),
      tx.paperAdjustment.findMany({ where: { accountId: a.id } }),
    ]);
    const valuationAt = a.archivedAt ?? now;
    const value = a.status === "ARCHIVED" ? snapshots.find(s => s.key === "archive") : null;
    const v = value ? { marketMinor: value.marketMinor, equityMinor: value.equityMinor, quality: value.quality, positions: JSON.parse(value.evidenceJson), pnlMinor: value.quality === "CURRENT" && value.equityMinor !== null ? value.equityMinor - a.initialMinor : null, floatingMinor: null } : await valuation(tx, a, valuationAt);
    const replaySession = a.mode === "REPLAY" ? await tx.paperReplaySession.findUnique({ where: { accountId: a.id } }) : null;
    return { accounts, account: a, rules: await rulesFor(tx, a.ruleId), worker, ...v, orders, fills, entries, notes, snapshots, watchlist, adjustments, valuationAt: replaySession?.clock ?? valuationAt, replaySession };
  });
}

export async function reconcile(db: PrismaClient, accountId: string) {
  return transaction(db, async tx => {
    const a = await tx.paperAccount.findUniqueOrThrow({ where: { id: accountId } });
    const [entries, orders, positions, fills, adjustments] = await Promise.all([tx.paperCashEntry.findMany({ where: { accountId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }), tx.paperOrder.findMany({ where: { accountId } }), tx.paperPosition.findMany({ where: { accountId }, include: { lots: true } }), tx.paperFill.findMany({ where: { accountId } }), tx.paperAdjustment.findMany({ where: { accountId } })]);
    const conditions = await tx.paperCondition.findMany({ where: { accountId, status: "WAITING" } });
    const issues: string[] = [];
    if (entries.reduce((s, e) => s + e.amountMinor, 0n) !== a.cashMinor) issues.push("现金与流水不一致");
    if (orders.reduce((s, o) => s + o.frozenMinor, 0n) + conditions.reduce((s,c) => s + c.frozenMinor,0n) !== a.frozenMinor) issues.push("冻结资金不一致");
    if (fills.reduce((s, f) => s + f.feeMinor, 0n) !== a.feesMinor) issues.push("费用累计不一致");
    if (fills.reduce((s, f) => s + f.realizedMinor, 0n) !== a.realizedMinor) issues.push("已实现盈亏不一致");
    if (entries.filter(e => e.type === "INITIAL").reduce((s, e) => s + e.amountMinor, 0n) !== a.initialMinor) issues.push("初始资金不一致");
    const symbols = new Set([...orders.map(o => o.instrumentId), ...adjustments.map(x => x.instrumentId)]);
    for (const symbol of symbols) {
      const symbolOrders = orders.filter(o => o.instrumentId === symbol);
      const quantity = symbolOrders.reduce((total, o) => total + fills.filter(f => f.orderId === o.id).reduce((n, f) => n + (o.side === "BUY" ? f.quantity : -f.quantity), 0), 0)
        + adjustments.filter(x => x.instrumentId === symbol).reduce((n, x) => n + x.quantity, 0);
      if ((positions.find(p => p.instrumentId === symbol)?.quantity ?? 0) !== quantity) issues.push(`${symbol}持仓与成交／公司行为数量不一致`);
    }
    for (const o of orders) {
      const os = fills.filter(f => f.orderId === o.id);
      if (os.reduce((n, f) => n + f.quantity, 0) !== o.filled || os.reduce((n, f) => n + f.priceMinor * BigInt(f.quantity), 0n) !== o.turnoverMinor || os.reduce((n, f) => n + f.feeMinor, 0n) !== o.feesMinor) issues.push(`${o.id}委托与成交不一致`);
      if (!ACTIVE_ORDERS.includes(o.status) && o.frozenMinor !== 0n) issues.push(`${o.id}已结束委托仍有冻结`);
    }
    for (const p of positions) {
      if (p.lots.reduce((s, l) => s + l.quantity, 0) !== p.quantity) issues.push(`${p.instrumentId}批次数量不一致`);
      const frozen = orders.filter(o => o.instrumentId === p.instrumentId && o.side === "SELL" && ACTIVE_ORDERS.includes(o.status)).reduce((s, o) => s + o.quantity - o.filled, 0);
      if (frozen + conditions.filter(c => c.instrumentId === p.instrumentId).reduce((s,c)=>s+c.quantity,0) !== p.frozen) issues.push(`${p.instrumentId}冻结数量不一致`);
      const calculatedCost = orders.filter(o => o.instrumentId === p.instrumentId).reduce((s, o) => s + fills.filter(f => f.orderId === o.id).reduce((v, f) => v + (o.side === "BUY" ? f.costMinor : -f.costMinor), 0n), 0n);
      if (calculatedCost !== p.costMinor) issues.push(`${p.instrumentId}成本不一致`);
    }
    if (a.cashMinor < a.frozenMinor || a.frozenMinor < 0n) issues.push("冻结资金边界异常");
    const latest = await tx.paperReconciliation.findFirst({ where: { accountId }, orderBy: { createdAt: "desc" } });
    if (!latest || latest.accountVersion !== a.version || latest.issuesJson !== json(issues)) await tx.paperReconciliation.create({ data: { workspaceId: a.workspaceId, accountId, accountVersion: a.version, issuesJson: json(issues), status: issues.length ? "FAILED" : "PASSED" } });
    if (a.health !== "PAUSED") await tx.paperAccount.update({ where: { id: a.id }, data: { health: issues.length ? "REVIEW_REQUIRED" : "OK" } }); return issues;
  });
}
export async function dailySnapshots(db: PrismaClient, now = new Date()) {
  if (chinaMinute(now) < 900) return;
  await transaction(db, async tx => {
    const cal = await tx.marketCalendar.findUnique({ where: { day: chinaDay(now) } }); if (!cal?.isOpen) return;
    for (const a of await tx.paperAccount.findMany({ where: { status: "ACTIVE", mode: "LIVE" } })) await snapshot(tx, a, `close:${chinaDay(now)}`, now);
  });
}
export { account, snapshot, cash, bump, digest, randomUUID, environment, rulesFor, sellable, closeOrder, fillOrder, event, nextTradingDay, accountClock };
