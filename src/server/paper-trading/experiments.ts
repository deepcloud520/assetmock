import { modelConfig } from "@/lib/model-config";
import { z } from "zod";
import type { PrismaClient, PaperAccount, PaperStrategyRun } from "@prisma/client";
import { ACTIVE_ORDERS, PaperError, chinaDay, continuous, json, orderInputSchema, symbolSchema, fees } from "../../domain/paper-trading";
import { AVAILABLE_STRATEGY_DATA, DEFAULT_STRATEGY_LIMITS, STRATEGY_PROMPT_VERSION, normalizeStrategyDataCode, strategyDecisionSchema, strategyDefinitionSchema, strategyDraftPrompt, strategyExecutionPrompt, strategyLimitsSchema, strategySlot, type StrategyLimits } from "../../domain/paper-strategy";
import { account, closeOrder, createAccountInTransaction, digest, environment, previewOrder, rulesFor, snapshot, submitOrder, transaction, valuation, type Tx } from "./service";

export type StrategyModel = (prompt: string, input: unknown, schemaName: string, schema: object) => Promise<unknown>;
const defaultModel: StrategyModel = async (prompt, input, name, schema) => (await import("../agent-runtime")).structuredResponse(prompt, input, name, schema, 45000);
const modelName = () => modelConfig('OPENAI').MODEL?.trim() || "not-configured";
const versionSchema = z.number().int().min(0);
const createSchema = z.object({ name: z.string().trim().min(1).max(80).default("AI 策略实验"), initialYuan: z.number().int().positive().max(1_000_000_000).default(100000), requestId: z.string().min(8).max(120).optional() }).strict();
const poolSchema = z.object({ expectedVersion: versionSchema, confirmed: z.literal(true), instrumentIds: z.array(symbolSchema).min(1).max(50) }).strict();
const draftSchema = z.object({ expectedVersion: versionSchema, text: z.string().trim().min(1).max(6000) }).strict();
const confirmSchema = z.object({ expectedVersion: versionSchema, strategyId: z.string().min(1), confirmed: z.literal(true) }).strict();
const authorizationSchema = z.object({ expectedVersion: versionSchema, strategyId: z.string().min(1), stockPoolId: z.string().min(1), confirmed: z.literal(true), days: z.number().int().min(1).max(7).default(7), limits: strategyLimitsSchema.default(DEFAULT_STRATEGY_LIMITS) }).strict();
const archiveSchema = z.object({ expectedVersion: versionSchema, confirmed: z.literal(true), allowOpenPositions: z.boolean().default(false) }).strict();

async function experiment(tx: Tx, workspaceId: string, id: string, expectedVersion?: number) {
  const e = await tx.paperStrategyExperiment.findFirst({ where: { workspaceId, id } });
  if (!e) throw new PaperError("策略实验不存在", 404);
  if (e.status === "ARCHIVED") throw new PaperError("策略实验已归档");
  if (expectedVersion !== undefined && e.version !== expectedVersion) throw new PaperError("实验已变化，请刷新后确认", 409);
  const a = await account(tx, workspaceId, e.accountId, false);
  if (a.purpose !== "AI" || !["LIVE", "REPLAY"].includes(a.mode)) throw new PaperError("账户用途与策略实验不一致", 403);
  return { e, a };
}
async function cancelOpen(tx: Tx, a: PaperAccount, now: Date) {
  const orders = await tx.paperOrder.findMany({ where: { accountId: a.id, status: { in: ACTIVE_ORDERS } } });
  for (const o of orders) await closeOrder(tx, a, o, "CANCELLED", now);
}
async function pauseInTransaction(tx: Tx, workspaceId: string, id: string, reason: string, now: Date) {
  const { e, a } = await experiment(tx, workspaceId, id);
  await tx.paperStrategyAuthorization.updateMany({ where: { workspaceId, experimentId: id, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: now } });
  await tx.paperStrategyRun.updateMany({ where: { workspaceId, experimentId: id, status: "RUNNING" }, data: { status: "CANCELLED", reason, completedAt: now } });
  const updated = await tx.paperStrategyExperiment.update({ where: { id: e.id }, data: { status: "PAUSED", stopReason: reason, stoppedAt: now, version: { increment: 1 } } });
  // Authorization is revoked before cancellation. Both changes commit together.
  await cancelOpen(tx, a, now);
  return updated;
}
export async function createExperiment(db: PrismaClient, workspaceId: string, raw: unknown, now = new Date()) {
  const input = createSchema.parse(raw);
  return transaction(db, async tx => {
    const key = input.requestId ? `experiment:create:${input.requestId}` : null, signature = digest({ name: input.name, initialYuan: input.initialYuan });
    if (key) {
      const prior = await tx.paperRequest.findUnique({ where: { workspaceId_key: { workspaceId, key } } });
      if (prior) { if (prior.signature !== signature) throw new PaperError("重复请求标识对应不同实验设置", 409); return tx.paperStrategyExperiment.findFirstOrThrow({ where: { workspaceId, id: JSON.parse(prior.resultJson).experimentId }, include: { account: true } }); }
    }
    const a = await createAccountInTransaction(tx, workspaceId, now, { purpose: "AI", mode: "LIVE", name: input.name, initialMinor: BigInt(input.initialYuan) * 100n });
    const e = await tx.paperStrategyExperiment.create({ data: { workspaceId, accountId: a.id, name: input.name, createdAt: now }, include: { account: true } });
    if (key) await tx.paperRequest.create({ data: { workspaceId, accountId: a.id, key, signature, resultJson: json({ experimentId: e.id }) } });
    return e;
  });
}
export async function listExperiments(db: PrismaClient, workspaceId: string) {
  return db.paperStrategyExperiment.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, include: { account: true, strategies: { orderBy: { version: "desc" } }, pools: { orderBy: { version: "desc" } }, authorizations: { orderBy: { confirmedAt: "desc" } }, runs: { orderBy: { startedAt: "desc" }, take: 100, include: { order: { select: { id: true, status: true, quantity: true, filled: true } } } } } });
}
export async function updateStockPool(db: PrismaClient, workspaceId: string, id: string, raw: unknown, now = new Date()) {
  const input = poolSchema.parse(raw), symbols = [...new Set(input.instrumentIds)].sort();
  return transaction(db, async tx => {
    const { e, a } = await experiment(tx, workspaceId, id, input.expectedVersion);
    const known = await tx.marketInstrument.count({ where: { id: { in: symbols } } });
    if (known !== symbols.length) throw new PaperError("股票池包含未登记证券，请先核对证券资料");
    await pauseInTransaction(tx, workspaceId, id, "股票池已修改，需要重新确认授权", now);
    const latest = await tx.paperStockPoolVersion.aggregate({ where: { experimentId: id }, _max: { version: true } });
    const pool = await tx.paperStockPoolVersion.create({ data: { workspaceId, experimentId: id, version: (latest._max.version ?? 0) + 1, instrumentIdsJson: json(symbols), confirmedAt: now } });
    await tx.paperWatchlist.deleteMany({ where: { accountId: a.id } });
    for (const instrumentId of symbols) await tx.paperWatchlist.create({ data: { workspaceId, accountId: a.id, instrumentId } });
    return { pool, experiment: await tx.paperStrategyExperiment.findUniqueOrThrow({ where: { id: e.id } }) };
  });
}
export async function draftStrategy(db: PrismaClient, workspaceId: string, id: string, raw: unknown, options: { model?: StrategyModel; now?: Date } = {}) {
  const input = draftSchema.parse(raw), now = options.now ?? new Date();
  const source = await transaction(db, async tx => {
    await experiment(tx, workspaceId, id, input.expectedVersion);
    const e = await pauseInTransaction(tx, workspaceId, id, "正在整理新策略，等待确认", now);
    const [a, pool, positions] = await Promise.all([
      account(tx, workspaceId, e.accountId, false),
      tx.paperStockPoolVersion.findFirst({ where: { workspaceId, experimentId: id }, orderBy: { version: "desc" } }),
      tx.paperPosition.findMany({ where: { workspaceId, accountId: e.accountId, quantity: { gt: 0 } }, include: { lots: true } }),
    ]);
    return { version: e.version, stockPool: pool ? { confirmationStatus: "CONFIRMED", versionId: pool.id, version: pool.version, instrumentIds: JSON.parse(pool.instrumentIdsJson), confirmedAt: pool.confirmedAt } : { confirmationStatus: "NOT_PROVIDED", instrumentIds: [] },
      accountFacts: { source: "SIMULATED_LEDGER", accountId: a.id, accountVersion: a.version, initialMinor: a.initialMinor, cashMinor: a.cashMinor, frozenMinor: a.frozenMinor, availableMinor: a.cashMinor - a.frozenMinor, currency: "CNY", amountUnit: "MINOR" },
      positionFacts: { asOf: now, source: "SIMULATED_LEDGER", items: positions.map(p => ({ instrumentId: p.instrumentId, quantity: p.quantity, frozen: p.frozen, costMinor: p.costMinor, sellable: p.lots.filter(l => l.sellableOn <= chinaDay(now)).reduce((n, l) => n + l.quantity, 0) - p.frozen })) } };
  });
  // The model runs outside a database write transaction and cannot execute tools.
  const rawDefinition = await (options.model ?? defaultModel)(strategyDraftPrompt, JSON.parse(json({ text: input.text, availableData: AVAILABLE_STRATEGY_DATA, stockPool: source.stockPool, accountFacts: source.accountFacts, positionFacts: source.positionFacts,
    programRules: { tPlusOne: "ENFORCED_BY_PROGRAM", sellableQuantity: "FROM_CONFIRMED_LEDGER_AND_TRADING_CALENDAR", lotSize: "ENFORCED_BY_BOARD_RULES", positionSizing: "模型可在用户确认的仓位范围内按最新净资产与报价选择数量，程序再次校验", maxOrdersPerDecision: 1 },
    programLimits: { status: "PROPOSED_DEFAULTS", requiresSeparateAuthorization: true, values: DEFAULT_STRATEGY_LIMITS } })), "paper_strategy_draft", z.toJSONSchema(strategyDefinitionSchema));
  const parsedDefinition = strategyDefinitionSchema.parse(rawDefinition);
  const definition = { ...parsedDefinition, requiredData: [...new Set(parsedDefinition.requiredData.map(normalizeStrategyDataCode))] };
  const missing = [...new Set([...definition.missingData, ...definition.requiredData.filter(x => !AVAILABLE_STRATEGY_DATA.includes(x)).map(x => `当前未提供数据：${x}`)])];
  return transaction(db, async tx => {
    await experiment(tx, workspaceId, id, source.version);
    const latest = await tx.paperStrategyVersion.aggregate({ where: { experimentId: id }, _max: { version: true } });
    const strategy = await tx.paperStrategyVersion.create({ data: { workspaceId, experimentId: id, version: (latest._max.version ?? 0) + 1, status: missing.length ? "NEEDS_DATA" : "DRAFT", originalText: input.text, strategyJson: json(definition), missingJson: json(missing), model: modelName(), promptVersion: STRATEGY_PROMPT_VERSION, createdAt: now } });
    const e = await tx.paperStrategyExperiment.update({ where: { id }, data: { version: { increment: 1 } } });
    return { strategy, experiment: e };
  });
}
export async function confirmStrategy(db: PrismaClient, workspaceId: string, id: string, raw: unknown, now = new Date()) {
  const input = confirmSchema.parse(raw);
  return transaction(db, async tx => {
    await experiment(tx, workspaceId, id, input.expectedVersion);
    const s = await tx.paperStrategyVersion.findFirst({ where: { workspaceId, experimentId: id, id: input.strategyId } });
    if (!s) throw new PaperError("策略版本不存在", 404);
    if (JSON.parse(s.missingJson).length) throw new PaperError("策略依赖资料尚未提供，请修改策略后重新整理");
    if (s.status === "CONFIRMED") return { strategy: s, experiment: await tx.paperStrategyExperiment.findUniqueOrThrow({ where: { id } }) };
    if (s.status !== "DRAFT") throw new PaperError("该策略不能确认");
    await pauseInTransaction(tx, workspaceId, id, "策略已确认，等待授权启动", now);
    const strategy = await tx.paperStrategyVersion.update({ where: { id: s.id }, data: { status: "CONFIRMED", confirmedAt: now } });
    return { strategy, experiment: await tx.paperStrategyExperiment.findUniqueOrThrow({ where: { id } }) };
  });
}
export async function authorizeExperiment(db: PrismaClient, workspaceId: string, id: string, raw: unknown, now = new Date()) {
  const input = authorizationSchema.parse(raw);
  return transaction(db, async tx => {
    const { e, a } = await experiment(tx, workspaceId, id, input.expectedVersion);
    if (a.status !== "ACTIVE" || a.health !== "OK") throw new PaperError("账户状态不允许启动策略");
    const busy = await tx.paperStrategyExperiment.findFirst({ where: { workspaceId, id: { not: id }, status: "RUNNING" } });
    if (busy) throw new PaperError("工作区已有运行中的实时实验，请先暂停", 409);
    const [strategy, pool] = await Promise.all([
      tx.paperStrategyVersion.findFirst({ where: { workspaceId, experimentId: id, id: input.strategyId, status: "CONFIRMED" } }),
      tx.paperStockPoolVersion.findFirst({ where: { workspaceId, experimentId: id, id: input.stockPoolId }, orderBy: { version: "desc" } }),
    ]);
    const latestPool = await tx.paperStockPoolVersion.findFirst({ where: { experimentId: id }, orderBy: { version: "desc" } });
    const latestStrategy = await tx.paperStrategyVersion.findFirst({ where: { experimentId: id }, orderBy: { version: "desc" } });
    if (!strategy || !pool || pool.id !== latestPool?.id || strategy.id !== latestStrategy?.id) throw new PaperError("请选择最新已确认策略和股票池", 409);
    if (JSON.parse(strategy.missingJson).length) throw new PaperError("策略仍缺少必要资料");
    await tx.paperStrategyAuthorization.updateMany({ where: { workspaceId, experimentId: id, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: now } });
    const authorization = await tx.paperStrategyAuthorization.create({ data: { workspaceId, experimentId: id, strategyId: strategy.id, stockPoolId: pool.id, limitsJson: json(input.limits), confirmedAt: now, expiresAt: new Date(now.getTime() + input.days * 86400000) } });
    const updated = await tx.paperStrategyExperiment.update({ where: { id: e.id }, data: { status: "RUNNING", version: { increment: 1 }, startedAt: e.startedAt ?? now, stoppedAt: null, stopReason: "" } });
    return { authorization, experiment: updated };
  });
}
export async function pauseExperiment(db: PrismaClient, workspaceId: string, id: string, reason = "用户停止实验", now = new Date()) {
  return transaction(db, tx => pauseInTransaction(tx, workspaceId, id, reason.slice(0, 300), now));
}
export async function archiveExperiment(db: PrismaClient, workspaceId: string, id: string, raw: unknown, now = new Date()) {
  const input = archiveSchema.parse(raw);
  return transaction(db, async tx => {
    const { a } = await experiment(tx, workspaceId, id, input.expectedVersion);
    const held = await tx.paperPosition.count({ where: { accountId: a.id, quantity: { gt: 0 } } });
    if (held && !input.allowOpenPositions) throw new PaperError("账户仍有持仓，请明确确认按最终可用估值归档");
    await pauseInTransaction(tx, workspaceId, id, "实验已归档", now);
    const updated = await tx.paperAccount.update({ where: { id: a.id }, data: { status: "ARCHIVED", archivedAt: now, version: { increment: 1 } } });
    await snapshot(tx, updated, "archive", now);
    return tx.paperStrategyExperiment.update({ where: { id }, data: { status: "ARCHIVED", version: { increment: 1 } } });
  });
}

async function currentAuthorization(tx: Tx, workspaceId: string, id: string, now: Date) {
  const { e, a } = await experiment(tx, workspaceId, id);
  if (e.status !== "RUNNING") throw new PaperError("实验已暂停或授权失效", 409);
  const auth = await tx.paperStrategyAuthorization.findFirst({ where: { workspaceId, experimentId: id, status: "ACTIVE" }, orderBy: { confirmedAt: "desc" }, include: { strategy: true, stockPool: true } });
  if (!auth || auth.expiresAt <= (a.mode === 'REPLAY' ? new Date() : now) || auth.strategy.status !== "CONFIRMED") throw new PaperError("实验授权已过期或策略未确认", 409);
  if (auth.strategy.experimentId !== id || auth.stockPool.experimentId !== id) throw new PaperError("授权关联的策略或股票池不属于本实验", 409);
  return { e, a, auth, limits: strategyLimitsSchema.parse(JSON.parse(auth.limitsJson)), symbols: JSON.parse(auth.stockPool.instrumentIdsJson) as string[] };
}
async function riskContext(tx: Tx, a: PaperAccount, limits: StrategyLimits, now: Date) {
  const v = await valuation(tx, a, now);
  if (v.quality !== "CURRENT" || v.equityMinor === null || v.equityMinor <= 0n) throw new PaperError("估值不足，禁止自动下单");
  const day = chinaDay(now);
  const snapshots = await tx.paperEquitySnapshot.findMany({ where: { accountId: a.id, quality: "CURRENT", equityMinor: { not: null }, createdAt: { lte: now } }, orderBy: { createdAt: "asc" } });
  const priorCloses = snapshots.filter(s => (a.mode === "REPLAY" || s.key.startsWith("close:")) && chinaDay(s.createdAt) < day);
  const priorClose = priorCloses[priorCloses.length - 1];
  const dailyBase = priorClose?.equityMinor ?? (chinaDay(a.createdAt) === day ? a.initialMinor : null);
  if (dailyBase === null) throw new PaperError("缺少上一有效收盘估值，需核对后恢复");
  const peak = snapshots.reduce((p, s) => s.equityMinor !== null && s.equityMinor > p ? s.equityMinor : p, a.initialMinor);
  if ((dailyBase - v.equityMinor) * 10000n >= dailyBase * BigInt(limits.dailyLossBps)) throw new PaperError("当日亏损达到停止线");
  if ((peak - v.equityMinor) * 10000n >= peak * BigInt(limits.maxDrawdownBps)) throw new PaperError("实验最大回撤达到停止线");
  const orders = await tx.paperOrder.findMany({ where: { accountId: a.id, day } });
  if (orders.length >= limits.dailyOrders) throw new PaperError("每日委托次数达到上限");
  const openBuys = await tx.paperOrder.findMany({ where: { accountId: a.id, side: "BUY", status: { in: ACTIVE_ORDERS } } });
  return { v, orders, openBuys, dailyBase, peak };
}
async function validateTrade(tx: Tx, a: PaperAccount, input: ReturnType<typeof orderInputSchema.parse>, symbols: string[], limits: StrategyLimits, now: Date) {
  const context = await riskContext(tx, a, limits, now);
  if (input.side === "SELL") return context;
  if (!symbols.includes(input.instrumentId)) throw new PaperError("买入证券不在已确认股票池", 403);
  const rules = await rulesFor(tx, a.ruleId), turnover = input.limitMinor * BigInt(input.quantity), newFee = fees(turnover, "BUY", rules), committed = turnover + newFee;
  const equity = context.v.equityMinor!;
  if (committed * 10000n > equity * BigInt(limits.singleBuyBps)) throw new PaperError("单笔买入超过授权上限（含费用）");
  const pending = context.openBuys.reduce((s, o) => s + o.limitMinor * BigInt(o.quantity - o.filled), 0n);
  const pendingFees = context.openBuys.reduce((s, o) => s + o.frozenMinor - o.limitMinor * BigInt(o.quantity - o.filled), 0n);
  const projectedEquity = equity - newFee - pendingFees;
  if (projectedEquity <= 0n) throw new PaperError("费用后的预计净资产不足");
  const samePending = context.openBuys.filter(o => o.instrumentId === input.instrumentId).reduce((s, o) => s + o.limitMinor * BigInt(o.quantity - o.filled), 0n);
  const sameHeld = context.v.positions.find(p => p.instrumentId === input.instrumentId)?.marketMinor ?? 0n;
  if ((sameHeld + samePending + turnover) * 10000n > projectedEquity * BigInt(limits.singleStockBps)) throw new PaperError("单股仓位超过上限，含未成交买单及预计费用");
  if ((context.v.marketMinor! + pending + turnover) * 10000n > projectedEquity * BigInt(limits.totalStockBps)) throw new PaperError("股票总仓位超过上限，含未成交买单及预计费用");
  return context;
}
async function finishRun(db: PrismaClient, id: string, status: string, reason: string, now: Date, decision?: unknown, risk?: unknown) {
  await transaction(db, tx => tx.paperStrategyRun.updateMany({ where: { id, status: "RUNNING" }, data: { status, reason, completedAt: now, ...(decision ? { decisionJson: json(decision) } : {}), ...(risk ? { riskJson: json(risk) } : {}) } }));
  return db.paperStrategyRun.findUniqueOrThrow({ where: { id } });
}
function safeFailure(error: unknown) { return error instanceof PaperError ? error.message : error instanceof z.ZodError ? "模型输出不符合交易结构，已跳过" : "模型或资料暂时不可用，已跳过本轮"; }
export async function executeStrategyRun(db: PrismaClient, workspaceId: string, id: string, options: { model?: StrategyModel; now?: Date; beforeSubmit?: (tx: Tx) => Promise<void> } = {}) {
  const origin = await db.paperStrategyExperiment.findFirst({where:{id,workspaceId},include:{account:true}});
  const replay = origin?.account.mode === 'REPLAY' ? await db.paperReplaySession.findUniqueOrThrow({where:{accountId:origin.accountId}}) : null;
  const clock = () => replay?.clock ?? options.now ?? new Date(), now = clock();
  if (!replay && !continuous(now)) return { status: "OUTSIDE_SESSION" };
  const source = await transaction(db, async tx => {
    const existing = await tx.paperStrategyRun.findUnique({ where: { experimentId_slot: { experimentId: id, slot: strategySlot(now) } } });
    if (existing) { if (existing.workspaceId !== workspaceId) throw new PaperError("实验不存在", 404); return { prior: existing }; }
    const c = await currentAuthorization(tx, workspaceId, id, now);
    if (c.a.status !== "ACTIVE" || c.a.health !== "OK") throw new PaperError("账户状态不允许策略执行");
    let input: unknown, blocker = "";
    try {
      const r = await riskContext(tx, c.a, c.limits, now);
      const symbols = [...new Set([...c.symbols, ...r.v.positions.map(p => p.instrumentId)])];
      const quotes = [];
      for (const instrumentId of symbols) {
        const env = await environment(tx, c.a, instrumentId, now);
        if (env.blockers.length) throw new PaperError(env.blockers.join("；"));
        quotes.push({ instrumentId, ...env.quote, evidenceId: `QUOTE:${env.quote!.id}` });
      }
      input = { asOf: now, account: c.a, positions: r.v.positions, equityMinor: r.v.equityMinor, stockPool: c.symbols, strategy: JSON.parse(c.auth.strategy.strategyJson), limits: c.limits, quotes, recentTrades: await tx.paperFill.findMany({ where: { accountId: c.a.id }, orderBy: { createdAt: "desc" }, take: 30 }), evidenceIds: [`ACCOUNT:${c.a.id}:v${c.a.version}`, ...quotes.map(q => q.evidenceId), ...r.v.positions.map(p => `POSITION:${p.id}`)] };
    } catch (error) { blocker = safeFailure(error); input = { blocker, asOf: now, accountId: c.a.id }; }
    const run = await tx.paperStrategyRun.create({ data: { workspaceId, experimentId: id, authorizationId: c.auth.id, strategyId: c.auth.strategyId, stockPoolId: c.auth.stockPoolId, slot: strategySlot(now), experimentVersion: c.e.version, accountVersion: c.a.version, model: modelName(), inputJson: json(input), startedAt: now } });
    return { run, blocker, input, accountId: c.a.id };
  });
  if ("prior" in source && source.prior) return source.prior;
  const run = source.run!;
  if (source.blocker) {
    if (/停止线/.test(source.blocker)) await pauseExperiment(db, workspaceId, id, source.blocker, clock());
    return finishRun(db, run.id, "SKIPPED", source.blocker, clock());
  }
  let proposedDecision: unknown;
  try {
    const raw = await (options.model ?? defaultModel)(strategyExecutionPrompt, JSON.parse(json(source.input)), "paper_strategy_decision", z.toJSONSchema(strategyDecisionSchema));
    const decision = strategyDecisionSchema.parse(raw), evidence = (source.input as { evidenceIds: string[] }).evidenceIds;
    proposedDecision = decision;
    if (!decision.evidenceIds.length || decision.evidenceIds.some(x => !evidence.includes(x))) throw new PaperError("决策引用的依据无法核对");
    if (decision.action === "HOLD") {
      await transaction(db, async tx => { await options.beforeSubmit?.(tx); await validateRun(tx, run, clock()); });
      return finishRun(db, run.id, "NO_TRADE", decision.reason, clock(), decision, { result: "PASS_NO_TRADE" });
    }
    const input = { instrumentId: decision.instrumentId!, side: decision.action, quantity: decision.quantity!, limitMinor: decision.limitMinor!, reason: decision.reason };
    await transaction(db, async tx => { const c = await validateRun(tx, run, clock()); await validateTrade(tx, c.a, orderInputSchema.parse(input), c.symbols, c.limits, clock()); });
    const preview = await previewOrder(db, workspaceId, source.accountId!, input, clock());
    if (preview.blockers.length) throw new PaperError(preview.blockers.join("；"));
    await submitOrder(db, workspaceId, source.accountId!, preview.previewId, `strategy:${run.id}`, clock(), {
      source: "STRATEGY",
      validate: async (tx, a, parsed) => { await options.beforeSubmit?.(tx); const c = await validateRun(tx, run, clock()); if (a.id !== c.a.id) throw new PaperError("策略账户不一致", 403); await validateTrade(tx, a, parsed, c.symbols, c.limits, clock()); },
      onSubmitted: async (tx, orderId) => { const claim = await tx.paperStrategyRun.updateMany({ where: { id: run.id, workspaceId, status: "RUNNING" }, data: { status: "SUBMITTED", orderId, reason: decision.reason, decisionJson: json(decision), riskJson: json({ result: "PASS", ruleId: preview.ruleId, quoteTime: clock() }), completedAt: clock() } }); if (claim.count !== 1) throw new PaperError("本次运行已停止", 409); },
    });
    return db.paperStrategyRun.findUniqueOrThrow({ where: { id: run.id } });
  } catch (error) {
    const reason = safeFailure(error);
    if (/停止线/.test(reason)) await pauseExperiment(db, workspaceId, id, reason, clock());
    return finishRun(db, run.id, error instanceof PaperError ? "REJECTED" : "SKIPPED", reason, clock(), proposedDecision, { result: "REJECTED", reason });
  }
}
async function validateRun(tx: Tx, run: PaperStrategyRun, now: Date) {
  const c = await currentAuthorization(tx, run.workspaceId, run.experimentId, now);
  const current = await tx.paperStrategyRun.findFirst({ where: { workspaceId: run.workspaceId, id: run.id, status: "RUNNING" } });
  if (!current || c.auth.id !== run.authorizationId || c.auth.strategyId !== run.strategyId || c.auth.stockPoolId !== run.stockPoolId || c.e.version !== run.experimentVersion || c.a.version !== run.accountVersion || strategySlot(now) !== run.slot) throw new PaperError("授权、策略、账户或时间片已变化，本轮不能提交", 409);
  return c;
}
export async function pauseExperimentsOnRestart(db: PrismaClient, now = new Date()) {
  return transaction(db, async tx => {
    const experiments = await tx.paperStrategyExperiment.findMany({ where: { status: "RUNNING" } });
    for (const e of experiments) await pauseInTransaction(tx, e.workspaceId, e.id, "服务重启，需核对后重新授权恢复", now);
    return { paused: experiments.length };
  });
}
