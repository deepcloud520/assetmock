import { paperErasureScope } from "./erasure-scope";
import { z } from "zod";
import type { PrismaClient, Prisma } from "@prisma/client";
import { PaperError, chinaDay, json, minorSchema, ruleSchema, symbolSchema } from "../../domain/paper-trading";
import { transaction, account, bump, cash, digest, snapshot } from "./service";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => Number.isFinite(Date.parse(s)) && new Date(s).toISOString().startsWith(s));
export const marketReviewSchema = z.object({
  source: z.string().min(10).max(4000), confirmed: z.literal(true),
  calendar: z.array(z.object({ day, isOpen: z.boolean() })).max(800),
  states: z.array(z.object({ instrumentId: symbolSchema, day, status: z.enum(["NORMAL", "SUSPENDED", "REVIEW_REQUIRED", "UNSUPPORTED"]), eventCoverage: z.boolean(), lowerMinor: minorSchema, upperMinor: minorSchema })).max(1000),
  rule: z.object({ id: z.string().min(5).max(100), config: ruleSchema, validation: z.object({
    morningMinutes: z.number().min(30), afternoonMinutes: z.number().min(30), successRate: z.number().min(.99).max(1),
    requiredFieldsRate: z.literal(1), sourceAgeP95Ms: z.number().min(0).max(15000),
    mainSamples: z.number().int().min(2), chinextSamples: z.number().int().min(2), starSamples: z.number().int().min(2),
    reportPath: z.string().min(5), rulesAndFeesSource: z.string().min(10), dataUseChecked: z.literal(true), sampledOn: day,
  }) }).optional(),
});
// Operator attestation is explicit; a connectivity check never enables live matching.
export async function reviewMarket(db: PrismaClient, raw: unknown, now = new Date()) {
  const input = marketReviewSchema.parse(raw);
  return transaction(db, tx => applyMarketReview(tx, input, now));
}
export async function applyMarketReview(tx: Prisma.TransactionClient, input: z.infer<typeof marketReviewSchema>, now: Date) {
  if (input.rule && (input.rule.validation.sampledOn > chinaDay(now) || !input.rule.config.qualified || input.rule.config.qualifiedUntil < chinaDay(now) || !input.rule.config.evidence.trim())) throw new PaperError("验证日期、有效期或证据不成立");
    await tx.marketReviewRecord.create({ data: { dataJson: json(input), createdAt: now } });
    for (const c of input.calendar) await tx.marketCalendar.upsert({ where: { day: c.day }, create: { ...c, source: input.source, verifiedAt: now }, update: { ...c, source: input.source, verifiedAt: now } });
    for (const s of input.states) {
      if (s.lowerMinor <= 0n || s.upperMinor < s.lowerMinor) throw new PaperError("当日价格范围无效");
      await tx.marketDailyState.upsert({ where: { instrumentId_day: { instrumentId: s.instrumentId, day: s.day } }, create: { ...s, source: input.source, verifiedAt: now }, update: { ...s, source: input.source, verifiedAt: now } });
    }
    if (input.rule) {
      const old = await tx.paperRuleVersion.findUnique({ where: { id: input.rule.id } });
      const configJson = json(input.rule.config), source = json({ source: input.source, validation: input.rule.validation });
      if (old && (old.configJson !== configJson || old.source !== source)) throw new PaperError("已发布规则不可覆盖，请使用新版本编号", 409);
      if (!old) await tx.paperRuleVersion.create({ data: { id: input.rule.id, configJson, source, createdAt: now } });
      await tx.paperAccount.updateMany({ where: { status: "ACTIVE", mode: "LIVE", ruleId: { not: input.rule.id } }, data: { ruleId: input.rule.id, version: { increment: 1 } } });
    }
    return { calendars: input.calendar.length, states: input.states.length, ruleId: input.rule?.id ?? null };
}

export const adjustmentSchema = z.object({
  instrumentId: symbolSchema, eventKey: z.string().min(5).max(120), kind: z.enum(["DIVIDEND", "BONUS_SHARES"]),
  cashMinor: minorSchema, quantity: z.number().int().min(0).max(100_000_000),
  recordDay: day, effectiveDay: day, sellableOn: day, source: z.string().min(10).max(4000), entitlementQuantity: z.number().int().positive(),
  taxConfirmed: z.literal(true), note: z.string().min(5).max(2000),
});
export async function previewAdjustment(db: PrismaClient, workspaceId: string, accountId: string, raw: unknown, now = new Date()) {
  const input = adjustmentSchema.parse(raw);
  return transaction(db, async tx => {
    const a = await account(tx, workspaceId, accountId);
    if (input.effectiveDay > chinaDay(now) || input.recordDay > input.effectiveDay || input.sellableOn < input.effectiveDay) throw new PaperError("公司行为日期无效或尚未生效");
    if ((input.kind === "DIVIDEND" && (input.cashMinor <= 0n || input.quantity !== 0)) || (input.kind === "BONUS_SHARES" && (input.quantity <= 0 || input.cashMinor !== 0n))) throw new PaperError("金额与股份调整口径不一致");
    if (await tx.paperOrder.count({ where: { accountId, status: { in: ["OPEN", "PARTIALLY_FILLED"] } } }) || await tx.paperCondition.count({ where: { accountId, status: "WAITING" } })) throw new PaperError("请先撤销当前账户的未完成委托和待触发条件单");
    const p = await tx.paperPosition.findUnique({ where: { accountId_instrumentId: { accountId, instrumentId: input.instrumentId } } });
    if (!p) throw new PaperError("无对应持仓历史，请人工核对权益");
    // Entitlement is reconstructed at record date; later trades must not alter it.
    const orders = await tx.paperOrder.findMany({ where: { accountId, instrumentId: input.instrumentId }, include: { fills: true } });
    let entitled = orders.reduce((sum, o) => sum + o.fills.filter(f => chinaDay(f.createdAt) <= input.recordDay).reduce((s, f) => s + (o.side === "BUY" ? f.quantity : -f.quantity), 0), 0);
    const previous = await tx.paperAdjustment.findMany({ where: { accountId, instrumentId: input.instrumentId, kind: "BONUS_SHARES" } });
    entitled += previous.filter(x => chinaDay(x.createdAt) <= input.recordDay).reduce((s, x) => s + x.quantity, 0);
    if (entitled !== input.entitlementQuantity) throw new PaperError("登记日持仓与声明的权益数量不一致");
    const w = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    const result = { ...input, entitlementQuantity: entitled, confirmedBy: "本机用户人工核对，非银行或券商验证" };
    const preview = await tx.paperPreview.create({ data: { workspaceId, accountId, version: a.version, epoch: w.dataEpoch, inputJson: json({ adjustment: result }), resultJson: json(result), expiresAt: new Date(now.getTime() + 300000), createdAt: now } });
    return { ...result, previewId: preview.id, expiresAt: preview.expiresAt };
  });
}
export async function confirmAdjustment(db: PrismaClient, workspaceId: string, accountId: string, previewId: string, now = new Date()) {
  return transaction(db, async tx => {
    const p = await tx.paperPreview.findFirst({ where: { id: previewId, workspaceId, accountId } }); if (!p) throw new PaperError("调整预览不存在");
    const input = adjustmentSchema.parse(JSON.parse(p.inputJson).adjustment);
    const old = await tx.paperAdjustment.findUnique({ where: { accountId_eventKey: { accountId, eventKey: input.eventKey } } });
    if (old) { if (old.source !== json(input)) throw new PaperError("事件编号已用于其他调整，请核对历史记录", 409); return old; }
    const a = await account(tx, workspaceId, accountId), w = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    if (p.expiresAt <= now || p.version !== a.version || p.epoch !== w.dataEpoch) throw new PaperError("调整预览已过期", 409);
    await bump(tx, a);
    const adjustment = await tx.paperAdjustment.create({ data: { workspaceId, accountId, instrumentId: input.instrumentId, eventKey: input.eventKey, kind: input.kind, cashMinor: input.cashMinor, quantity: input.quantity, source: json(input), createdAt: now } });
    if (input.cashMinor) await cash(tx, a, input.cashMinor, "DIVIDEND", `adjustment:${adjustment.id}`, adjustment.id, now);
    if (input.quantity) {
      const position = await tx.paperPosition.update({ where: { accountId_instrumentId: { accountId, instrumentId: input.instrumentId } }, data: { quantity: { increment: input.quantity } } });
      await tx.paperPositionLot.create({ data: { workspaceId, accountId, positionId: position.id, quantity: input.quantity, sellableOn: input.sellableOn, createdAt: now } });
    }
    await snapshot(tx, await account(tx, workspaceId, accountId), `adjustment:${adjustment.id}`, now); return adjustment;
  });
}

export async function deletionPreview(db: PrismaClient, workspaceId: string, accountId: string) {
  return db.$transaction(async tx => {
    const a = await account(tx, workspaceId, accountId, false);
    const [orders, fills, entries, notes, snapshots, previews, adjustments, conditions, operations, reconciliations, experiment, scope, workspace] = await Promise.all([
      tx.paperOrder.count({ where: { accountId } }), tx.paperFill.count({ where: { accountId } }), tx.paperCashEntry.count({ where: { accountId } }),
      tx.paperReviewNote.count({ where: { accountId } }), tx.paperEquitySnapshot.count({ where: { accountId } }), tx.paperPreview.count({ where: { accountId } }), tx.paperAdjustment.count({ where: { accountId } }),
      tx.paperCondition.count({ where: { accountId } }), tx.paperOperationalEvent.count({ where: { accountId } }), tx.paperReconciliation.count({ where: { accountId } }),
      tx.paperStrategyExperiment.findFirst({ where: { workspaceId, accountId }, include: { _count: { select: { strategies: true, pools: true, authorizations: true, runs: true } } } }),
      paperErasureScope(tx, workspaceId, accountId), tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } }),
    ]);
    const impact = { accountId, version: a.version, dataEpoch: workspace.dataEpoch, orders, fills, entries, notes, snapshots, previews, adjustments, conditions, operations, reconciliations,
      experiment: experiment ? { id: experiment.id, version: experiment.version, status: experiment.status, counts: experiment._count } : null,
      agentSessions: scope.sessions.length, agentRuns: scope.runIds.length, agentProposals: scope.proposalIds.length, agentMessages: scope.messageIds.length, agentSteps: scope.stepIds.length,
      replaySessionId: scope.replaySessionId, removableDataset: scope.removableDataset, retainedSharedDataset: scope.retainedSharedDataset, unknownOwnerTypes: scope.unknownOwnerTypes,
      canDelete: scope.unknownOwnerTypes.length === 0 };
    const signature = digest({ ...impact, dependencies: scope.dependencies, sessions: scope.sessions, runs: scope.runs, proposals: scope.proposals });
    return { ...impact, signature, warning: "彻底清除账户、关联交易、策略授权、回放会话和应用管理的旧备份；已引用该账户的对话整段清除。仍被其他回放账户使用的数据集保留并列明。应用外导出副本不受管理。" };
  });
}
