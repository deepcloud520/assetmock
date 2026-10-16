import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";
import { ACTIVE_ORDERS, PaperError, chinaDay, continuous, json } from "../../domain/paper-trading";
import { account, closeOrder, digest, environment, reconcile, rulesFor, transaction } from "./service";
import { applyMarketReview, marketReviewSchema } from "./maintenance";
import { refreshQuotes } from "./market";
import { closeConditionsForAccount } from "./conditions";

type Blocker = { code: string; message: string; action: "REFRESH_QUOTE" | "MARKET_REVIEW" | "WAIT_SESSION" | "RECHECK_ACCOUNT" | "START_WORKER" | "SELECT_SECURITY" };
function blocker(message: string): Blocker {
  if (/行情、费用及规则/.test(message)) return { code: "RULE_UNVERIFIED", message, action: "MARKET_REVIEW" };
  if (/日历/.test(message)) return { code: "CALENDAR_UNKNOWN", message, action: "MARKET_REVIEW" };
  if (/休市|连续竞价/.test(message)) return { code: "SESSION_CLOSED", message, action: "WAIT_SESSION" };
  if (/证券不在/.test(message)) return { code: "UNSUPPORTED_SECURITY", message, action: "SELECT_SECURITY" };
  if (/证券状态|公司行为|价格限制|价格范围/.test(message)) return { code: "SECURITY_REVIEW_REQUIRED", message, action: "MARKET_REVIEW" };
  if (/新鲜行情/.test(message)) return { code: "QUOTE_STALE", message, action: "REFRESH_QUOTE" };
  if (/撮合/.test(message)) return { code: "WORKER_UNAVAILABLE", message, action: "START_WORKER" };
  return { code: "ACCOUNT_REVIEW_REQUIRED", message, action: "RECHECK_ACCOUNT" };
}

export async function tradingStatus(db: PrismaClient, workspaceId: string, accountId: string, instrumentId?: string, now = new Date()) {
  return db.$transaction(async tx => {
    const a = await account(tx, workspaceId, accountId, false), rules = await rulesFor(tx, a.ruleId);
    if (a.mode === "REPLAY") {
      const session = await tx.paperReplaySession.findUnique({ where: { accountId } });
      if (!session) throw new PaperError("回放会话尚未建立");
      const env = instrumentId ? await environment(tx, a, instrumentId, session.clock, false) : null;
      const messages = [...(env?.blockers ?? []), ...(a.status !== "ACTIVE" ? ["账户已归档"] : []), ...(a.health !== "OK" ? ["账户账务待核对"] : [])];
      return { accountId, accountVersion: a.version, accountHealth: a.health, asOf: session.clock, day: chinaDay(session.clock), supportedSessionOpen: session.status === "RUNNING", replay: session,
        calendar: null, worker: null, source: null, quote: env?.quote ?? null, security: env?.state ?? null, blockers: [...new Set(messages)].map(blocker),
        canSubmit: !!instrumentId && !messages.length, canMatch: !!instrumentId && !messages.length, note: "历史回放按已保存模拟时钟校验，只能查看当前时间之前的数据" };
    }
    const [calendar, worker, source] = await Promise.all([
      tx.marketCalendar.findUnique({ where: { day: chinaDay(now) } }), tx.paperWorkerLease.findUnique({ where: { id: "matching" } }),
      tx.marketSourceHealth.findUnique({ where: { provider: rules.provider } }),
    ]);
    const env = instrumentId ? await environment(tx, a, instrumentId, now) : null;
    const messages = env?.blockers ?? [
      ...(!rules.qualified || rules.qualifiedUntil < chinaDay(now) ? ["行情、费用及规则尚未通过盘中验证，或验证已过期"] : []),
      ...(!calendar ? ["交易日历待核实"] : !calendar.isOpen ? ["今天休市"] : []),
      ...(!continuous(now) ? ["当前不在支持的连续竞价时段"] : []),
      ...(!worker || worker.status !== "RUNNING" || worker.expiresAt <= now ? ["撮合服务未运行或正在恢复"] : []),
    ];
    if (a.status !== "ACTIVE") messages.push("账户已归档");
    if (a.health !== "OK") messages.push(a.health === "PAUSED" ? "账户已暂停，需要核对后恢复" : "账户账务待核对");
    return { accountId, accountVersion: a.version, accountHealth: a.health, asOf: now, day: chinaDay(now),
      supportedSessionOpen: !!calendar?.isOpen && continuous(now), calendar, worker, source,
      quote: env?.quote ?? null, security: env?.state ?? null, blockers: [...new Set(messages)].map(blocker),
      canSubmit: a.mode === "LIVE" && !!instrumentId && !messages.length && a.purpose === "MANUAL",
      canMatch: a.mode === "LIVE" && !!instrumentId && !messages.length,
      note: a.mode === "REPLAY" ? "历史回放使用独立模拟时钟与数据集；以上为实时市场状态" : a.purpose === "AI" ? "AI 账户委托由已授权策略运行提交" : "状态与委托预览共用交易规则；提交时再次校验" };
  });
}

export async function healthSummary(db: PrismaClient, workspaceId: string, accountId: string, now = new Date()) {
  const a = await account(db, workspaceId, accountId, false);
  const [worker, sources, reconciliations, operations] = await Promise.all([
    db.paperWorkerLease.findUnique({ where: { id: "matching" } }), db.marketSourceHealth.findMany(),
    db.paperReconciliation.findMany({ where: { workspaceId, accountId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20 }),
    db.paperOperationalEvent.findMany({ where: { workspaceId, accountId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 30 }),
  ]);
  return { accountId, accountVersion: a.version, accountHealth: a.health, worker,
    workerAvailable: !!worker && worker.status === "RUNNING" && worker.expiresAt > now, sources, reconciliations, operations, asOf: now };
}

export async function operateAccount(db: PrismaClient, workspaceId: string, accountId: string, raw: unknown, now = new Date()) {
  const input = z.object({ action: z.enum(["PAUSE", "RECHECK", "RESUME"]), expectedVersion: z.number().int().nonnegative(), reason: z.string().trim().min(1).max(1000) }).strict().parse(raw);
  const owned = await account(db, workspaceId, accountId, false);
  if (owned.purpose === "AI" && input.action !== "RECHECK") throw new PaperError("AI 策略账户请使用实验暂停或恢复入口，以同步授权状态");
  if (input.action !== "PAUSE") {
    const a = await account(db, workspaceId, accountId, false);
    if (a.version !== input.expectedVersion) throw new PaperError("账户已变化，请刷新", 409);
  }
  // Reconciliation owns its own short transaction. It never invokes a model or
  // network; resume still validates the account version inside the final commit.
  const issues = input.action === "PAUSE" ? [] : await reconcile(db, accountId);
  return transaction(db, async tx => {
    const a = await account(tx, workspaceId, accountId, false);
    if (a.status !== "ACTIVE" || a.version !== input.expectedVersion) throw new PaperError("账户已变化或归档，请刷新", 409);
    if (input.action === "RESUME" && issues.length) throw new PaperError("账务核对仍有差异，不能恢复交易");
    if (input.action === "PAUSE") {
      await closeConditionsForAccount(tx, a, now);
      for (const o of await tx.paperOrder.findMany({ where: { workspaceId, accountId, status: { in: ACTIVE_ORDERS } } })) await closeOrder(tx, a, o, "CANCELLED", now);
      await tx.paperAccount.update({ where: { id: accountId }, data: { health: "PAUSED", version: { increment: 1 } } });
    } else if (input.action === "RESUME") await tx.paperAccount.update({ where: { id: accountId }, data: { health: "OK", version: { increment: 1 } } });
    const operation = await tx.paperOperationalEvent.create({ data: { workspaceId, accountId, type: input.action, status: issues.length ? "REVIEW_REQUIRED" : "RECORDED", detailJson: json({ reason: input.reason, issues, source: "USER_CONFIRMED", accountVersion: a.version }), createdAt: now } });
    return { operationId: operation.id, action: input.action, issues };
  });
}

export async function retryMarket(db: PrismaClient, workspaceId: string, accountId: string, now = new Date()) {
  const a = await account(db, workspaceId, accountId, false), rules = await rulesFor(db, a.ruleId);
  const [watchlist, positions] = await Promise.all([db.paperWatchlist.findMany({ where: { workspaceId, accountId } }), db.paperPosition.findMany({ where: { workspaceId, accountId, quantity: { gt: 0 } } })]);
  const symbols = [...new Set([...watchlist.map(w => w.instrumentId), ...positions.map(p => p.instrumentId)])];
  let error = "", refreshed = 0;
  try { refreshed = (await refreshQuotes(db, symbols, rules.provider)).length; }
  catch (e) { error = e instanceof Error ? e.message : "行情重试失败"; }
  await transaction(db, tx => tx.paperOperationalEvent.create({ data: { workspaceId, accountId, type: "RETRY_MARKET", status: error ? "FAILED" : "RECORDED", detailJson: json({ symbols, provider: rules.provider, refreshed, error, note: "刷新行情不修改证券资料或账户健康，不解除交易阻断" }), createdAt: now } }));
  return { refreshed, error: error || null };
}

const draftSchema = marketReviewSchema.omit({ confirmed: true }).strict();
type ReviewInput = z.infer<typeof marketReviewSchema>;
type ReadClient = Prisma.TransactionClient;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => [key, canonical(v)]));
  return value;
}
async function marketBefore(tx: ReadClient, input: ReviewInput) {
  const [calendar, states, instruments, rule] = await Promise.all([
    tx.marketCalendar.findMany({ where: { day: { in: input.calendar.map(c => c.day) } }, orderBy: { day: "asc" } }),
    tx.marketDailyState.findMany({ where: { OR: input.states.map(s => ({ instrumentId: s.instrumentId, day: s.day })) }, orderBy: [{ instrumentId: "asc" }, { day: "asc" }] }),
    tx.marketInstrument.findMany({ where: { id: { in: input.states.map(s => s.instrumentId) } }, orderBy: { id: "asc" } }),
    input.rule ? tx.paperRuleVersion.findUnique({ where: { id: input.rule.id } }) : null,
  ]);
  return { calendar, states, instruments, rule };
}
async function marketPreflight(tx: ReadClient, input: ReviewInput, now: Date) {
  const before = await marketBefore(tx, input), errors: string[] = [], warnings: string[] = [];
  const calendarIds = input.calendar.map(c => c.day), stateIds = input.states.map(s => `${s.instrumentId}:${s.day}`);
  if (new Set(calendarIds).size !== calendarIds.length || new Set(stateIds).size !== stateIds.length) errors.push("同一草稿含重复日期或证券状态");
  for (const s of input.states) {
    if (!before.instruments.some(i => i.id === s.instrumentId)) errors.push(`${s.instrumentId}尚未建立证券资料`);
    if (s.lowerMinor <= 0n || s.upperMinor < s.lowerMinor) errors.push(`${s.instrumentId}价格范围无效`);
    if (s.status !== "NORMAL" || !s.eventCoverage) warnings.push(`${s.instrumentId} ${s.day}仍需核对，发布不会解除该证券阻断`);
  }
  if (input.rule) {
    if (input.rule.validation.sampledOn > chinaDay(now) || !input.rule.config.qualified || input.rule.config.qualifiedUntil < chinaDay(now) || !input.rule.config.evidence.trim()) errors.push("规则验证日期、有效期或证据无效");
    if (before.rule && (before.rule.configJson !== json(input.rule.config) || before.rule.source !== json({ source: input.source, validation: input.rule.validation }))) errors.push("已发布规则不可覆盖，请使用新编号");
  } else warnings.push("没有发布新规则，不会将未验证行情自动开放为可交易");
  const changedCalendar = input.calendar.filter(c => { const old = before.calendar.find(p => p.day === c.day); return !old || old.isOpen !== c.isOpen || old.source !== input.source; });
  const changedStates = input.states.filter(s => { const old = before.states.find(p => p.day === s.day && p.instrumentId === s.instrumentId); return !old || old.status !== s.status || old.eventCoverage !== s.eventCoverage || old.lowerMinor !== s.lowerMinor || old.upperMinor !== s.upperMinor || old.source !== input.source; });
  return { valid: !errors.length, errors, warnings, changes: { calendar: changedCalendar, states: changedStates, ruleId: input.rule?.id ?? null }, before, signature: digest(canonical(JSON.parse(json({ input, before })))) };
}
export async function prepareMarketReview(db: PrismaClient, workspaceId: string, raw: unknown, now = new Date()) {
  const input = { ...draftSchema.parse(raw), confirmed: true as const };
  return transaction(db, async tx => {
    await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    const preflight = await marketPreflight(tx, input, now);
    const draft = await tx.paperMarketDraft.create({ data: { workspaceId, dataJson: json(input), signature: preflight.signature, expiresAt: new Date(now.getTime() + 600000), createdAt: now } });
    return { draftId: draft.id, version: draft.version, expiresAt: draft.expiresAt, ...preflight, source: input.source, note: "仅保存维护草稿；当前资料没有变化。发布后市场资料供所有本地模拟账户使用。" };
  });
}
export async function confirmMarketReview(db: PrismaClient, workspaceId: string, draftId: string, expectedVersion: number, now = new Date()) {
  return transaction(db, async tx => {
    const d = await tx.paperMarketDraft.findFirst({ where: { id: draftId, workspaceId } });
    if (!d) throw new PaperError("维护草稿不存在", 404);
    if (d.status === "PUBLISHED") return { draftId, status: "PUBLISHED" };
    if (d.status !== "PENDING" || d.version !== expectedVersion || d.expiresAt <= now) throw new PaperError("维护草稿已过期或变化", 409);
    const input = marketReviewSchema.parse(JSON.parse(d.dataJson)), preflight = await marketPreflight(tx, input, now);
    if (!preflight.valid) throw new PaperError(preflight.errors.join("；"));
    if (preflight.signature !== d.signature) throw new PaperError("市场资料已变化，请重新生成预检草稿", 409);
    const result = await applyMarketReview(tx, input, now);
    await tx.paperMarketDraft.update({ where: { id: draftId }, data: { status: "PUBLISHED", version: { increment: 1 }, publishedAt: now } });
    return { ...result, draftId, status: "PUBLISHED" };
  });
}

export async function publishBenchmark(db: PrismaClient, raw: unknown, now = new Date()) {
  const input = z.object({ confirmed: z.literal(true), source: z.string().min(10).max(4000), points: z.array(z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), closeMinor: z.string().regex(/^[1-9]\d{0,13}$/).transform(BigInt) }).strict()).min(1).max(1000) }).strict().parse(raw);
  if (new Set(input.points.map(p => p.day)).size !== input.points.length || input.points.some(p => p.day > chinaDay(now) || !Number.isFinite(Date.parse(p.day)) || !new Date(p.day).toISOString().startsWith(p.day))) throw new PaperError("基准日期重复、无效或来自未来");
  return transaction(db, async tx => {
    for (const p of input.points) {
      const old = await tx.paperBenchmarkPoint.findUnique({ where: { symbol_day: { symbol: "sh000300", day: p.day } } });
      if (old && (old.closeMinor !== p.closeMinor || old.source !== input.source)) throw new PaperError("已有基准价格不可静默覆盖，请核对来源", 409);
      if (!old) await tx.paperBenchmarkPoint.create({ data: { ...p, symbol: "sh000300", source: input.source, createdAt: now } });
    }
    return { symbol: "sh000300", points: input.points.length, basis: "价格指数，不含红利再投资" };
  });
}
