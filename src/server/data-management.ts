import { v2Store } from "./v2/store";
import { addMonths } from "@/domain/car-planning";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { exclusively } from "@/lib/database-maintenance";
import { naturalDate, fen, today } from "@/domain/database-planning";
import { ApiError, serialize } from "./portfolio";
import { ensureUnified, encode, monthlyBudget, seedProducts, recordRevision } from "./unified-store";
import { migrateDecisionMemory, saveConstraint, syncAssumptionDue, verifyAssumption } from "./decision-database";
import { clearManagedBackups, createBackup, dailyBackup, listBackups, restoreBackup, restorePreview } from "./database-backup";
const entityType = z.enum(["ASSET", "LIABILITY", "GOAL", "POLICY", "TRANSACTION"]);
export async function initializeData(workspaceId: string) { await db.$transaction(async (tx) => { await ensureUnified(tx, workspaceId); await seedProducts(tx); await migrateDecisionMemory(tx, workspaceId); await syncAssumptionDue(tx, workspaceId); }, { timeout: 15000 }); }
export async function dataOverview(workspaceId: string) {
  await initializeData(workspaceId); await dailyBackup();
  const [workspace, budgets, items, balances, constraints, assumptions, verifications, reasons, checks, issues, revisions, jobs, products, versions, sources, drafts] = await Promise.all([
    db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, include: { assets: { where: { deletedAt: null } }, liabilities: { where: { deletedAt: null } }, goals: { where: { deletedAt: null } }, insurancePolicies: { where: { deletedAt: null } } } }),
    db.budgetVersion.findMany({ where: { workspaceId }, orderBy: { revision: "desc" } }), db.budgetItem.findMany({ where: { workspaceId } }), db.balanceObservation.findMany({ where: { workspaceId }, orderBy: { observedOn: "desc" }, take: 200 }), db.decisionConstraint.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" } }), db.planAssumption.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" } }), db.assumptionVerification.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" } }), db.decisionReason.findMany({ where: { workspaceId } }), db.redLineCheck.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 100 }), db.migrationIssue.findMany({ where: { workspaceId } }), db.recordRevision.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 100 }), db.deletionJob.findMany({ where: { workspaceId } }), db.product.findMany({ orderBy: { category: "asc" } }), db.productVersion.findMany({ orderBy: { createdAt: "desc" } }), db.productSource.findMany(), db.businessDraft.findMany({ where: { workspaceId } }),
  ]);
  const evidence = await db.sourceEvidence.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 100 });
  const transactions = await db.transaction.findMany({ where: { workspaceId, deletedAt: null }, orderBy: { occurredOn: "desc" }, take: 100 });
  const decisions = (await db.carDecision.findMany({ where: { workspaceId } })).map((d) => ({ id: d.id, name: JSON.parse(d.factsJson).purpose || "买车目标" }));
  const comparison = await db.$transaction((tx) => monthlyBudget(tx, workspaceId, today().slice(0, 7)));
  const monthlyActual = await db.transaction.groupBy({ by: ["direction"], where: { workspaceId, deletedAt: null, analysisTreatment: "COUNT", occurredOn: { gte: new Date(`${today().slice(0, 7)}-01T00:00:00+08:00`), lt: new Date(`${addMonths(today().slice(0, 7), 1)}-01T00:00:00+08:00`) } }, _sum: { amountMinor: true } });
  const integrity = await db.$queryRawUnsafe<{ integrity_check: string }[]>("PRAGMA integrity_check"); const foreignKeys = await db.$queryRawUnsafe<unknown[]>("PRAGMA foreign_key_check");
  const diagnostics = [...(integrity.some((r) => r.integrity_check !== "ok") ? ["数据库完整性检查需处理"] : []), ...(foreignKeys.length ? ["数据库存在失效关联，请停止修改并核对"] : []), ...issues.filter((i) => i.status === "OPEN").map((i) => i.note), ...workspace.goals.filter((g) => !g.priorityConfirmedAt).map((g) => `${g.name}优先级尚未确认`)];
  for (const a of workspace.assets) { const reservations = await db.carFundingReservation.aggregate({ where: { workspaceId, assetId: a.id }, _sum: { amountMinor: true } }); if ((reservations._sum.amountMinor ?? 0n) > a.currentValueMinor) diagnostics.push(`${a.name}预留超过当前余额`); }
  const simulationReports = await db.simulationReport.findMany({where:{workspaceId}});
  return serialize({ simulationReports, workspace, budgets, items, balances, constraints, assumptions, verifications, reasons, checks, issues, revisions, jobs, products, productVersions: versions, productSources: sources, drafts, comparison, monthlyActual, diagnostics, decisions, evidence, transactions, backups: await listBackups(), integrity: { valid: integrity.every((r) => r.integrity_check === "ok") && foreignKeys.length === 0 }, sourceNotice: "原附件不长期保存；来源说明和哈希用于核对，不可恢复原文。" });
}
async function targetExists(tx: Prisma.TransactionClient, workspaceId: string, type: string, id: string) {
  return type === "ASSET" ? tx.asset.findFirst({ where: { id, workspaceId } }) : type === "LIABILITY" ? tx.liability.findFirst({ where: { id, workspaceId } }) : type === "GOAL" ? tx.goal.findFirst({ where: { id, workspaceId } }) : type === "POLICY" ? tx.insurancePolicy.findFirst({ where: { id, workspaceId } }) : tx.transaction.findFirst({ where: { id, workspaceId } });
}
export async function deletionPreview(workspaceId: string, type: string, id: string) {
  await db.$transaction(async (tx) => { if (!await targetExists(tx, workspaceId, type, id)) throw new ApiError("记录不存在", 404); });
  return { entityType: type, entityId: id, dataEpoch: (await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } })).dataEpoch, conservative: true, affected: ["目标记录及其修改历史、来源和导入记录", "本空间历史方案、评估、复盘和生成解释（旧资料依赖不明，整体清除内容）", "本空间对话、偏好、预算历史副本与业务草稿，以及新情景推演快照、游戏、报告与解释", "本空间规划行动及资金预留将停止并重新核对", "页面备份功能管理的全部旧数据库备份；其他空间的当前记录保持", "当前浏览器业务缓存；其他已打开浏览器在下一次读取数据时清理"], unmanaged: "应用外导出、手工备份（包括 backup:all 生成的离线两库备份）须另行删除；已关闭浏览器的缓存下次进入清理。", backups: (await listBackups()).length };
}
async function purgeDatabase(tx: Prisma.TransactionClient, workspaceId: string, type: string, id: string) {
  const target = await targetExists(tx, workspaceId, type, id); if (!target) throw new ApiError("记录不存在", 404);
  await tx.simulationOpening.deleteMany({where:{workspaceId}}); await tx.simulationReport.deleteMany({where:{workspaceId}});
  const now = new Date();
  if (type === "ASSET") { await tx.holdingDetail.deleteMany({ where: { workspaceId, assetId: id } }); await tx.asset.update({ where: { id }, data: { name: "已删除", currentValueMinor: 0n, goalId: null, type: "OTHER", source: "REDACTED", deletedAt: now } }); }
  if (type === "LIABILITY") await tx.liability.update({ where: { id }, data: { name: "已删除", outstandingBalanceMinor: 0n, monthlyPaymentMinor: 0n, totalRepaymentMinor: null, principalMinor: null, interestMinor: null, remainingMonths: null, repaymentMethod: null, source: "REDACTED", deletedAt: now } });
  if (type === "GOAL") { await tx.asset.updateMany({ where: { workspaceId, goalId: id }, data: { goalId: null } }); await tx.goal.update({ where: { id }, data: { name: "已删除", targetAmountMinor: 0n, preparedAmountMinor: 0n, monthlyContributionMinor: 0n, priorityNote: null, priorityConfirmedAt: null, source: "REDACTED", deletedAt: now } }); }
  if (type === "POLICY") await tx.insurancePolicy.update({ where: { id }, data: { dataJson: "{}", insured: null, category: null, premiumMinor: null, coverageMinor: null, paymentMonths: null, startsOn: null, endsOn: null, confirmed: false, cashValueAssetId: null, productVersionId: null, deletedAt: now } });
  if (type === "TRANSACTION") await tx.transaction.update({ where: { id }, data: { amountMinor: 0n, description: "已删除", category: "其他支出", source: "REDACTED", deletedAt: now } });
  const decisions = await tx.carDecision.findMany({ where: { workspaceId } }); const decisionIds = decisions.map((d) => d.id);
  await tx.carFundingReservation.deleteMany({ where: { workspaceId } });
  await tx.carPlanVersion.updateMany({ where: { decisionId: { in: decisionIds } }, data: { factsJson: "{}", snapshotJson: '{"status":"REDACTED"}', reason: "资料已删除，历史解释不完整" } });
  await tx.carMonthlyReview.updateMany({ where: { decisionId: { in: decisionIds } }, data: { factsJson: "{}", resultJson: '{"status":"REDACTED","note":"资料已删除"}' } });
  await tx.carDecision.updateMany({ where: { workspaceId }, data: { status: "DRAFT", factsJson: "{}", conversationJson: "[]", dependenciesJson: "{}", fieldEvidenceJson: "{}", evaluationJson: null, purchaseJson: null, activePlanId: null, version: { increment: 1 } } });
  // Original business records remain; generated goal projections are no longer trustworthy.
  await tx.goal.updateMany({ where: { workspaceId, targetAmountSource: "CAR_PLAN" }, data: { deletedAt: now, preparedAmountMinor: 0n, monthlyContributionMinor: 0n, targetAmountMinor: 0n } });
  await tx.recordRevision.updateMany({ where: { workspaceId }, data: { dataJson: '{"status":"REDACTED"}', reason: "相关资料已删除" } });
  await tx.balanceObservation.updateMany({ where: { workspaceId, entityType: type, entityId: id }, data: { amountMinor: null, confirmed: false, source: "REDACTED" } });
  await tx.businessDraft.deleteMany({ where: { workspaceId } }); await tx.importBatch.deleteMany({ where: { workspaceId } });
  await tx.sourceEvidence.deleteMany({ where: { workspaceId } });
  await tx.decisionReason.updateMany({ where: { workspaceId }, data: { userText: null, assetId: null, category: "REDACTED", evidenceSource: "REDACTED" } });
  await tx.decisionConstraint.updateMany({ where: { workspaceId }, data: { userText: "已删除", thresholdValue: null, assetId: null, goalId: null, memoryId: null, type: "OTHER", operator: "MANUAL", unit: null, currency: null, status: "SUPERSEDED", confirmedAt: null } });
  await tx.planAssumption.updateMany({ where: { workspaceId }, data: { content: "已删除", expectedValue: null, referenceId: null, sourceJson: "{}", lifecycle: "REDACTED" } });
  await tx.assumptionVerification.updateMany({ where: { workspaceId }, data: { actualValue: null, occurredOn: null, evidence: null, historyJson: "[]", status: "PENDING", verifiedBy: null } });
  await tx.redLineCheck.updateMany({ where: { workspaceId }, data: { detailJson: '{"status":"REDACTED"}' } });
  await tx.carEvaluationRecord.updateMany({ where: { workspaceId }, data: { inputJson: "{}", resultJson: '{"status":"REDACTED"}', status: "REDACTED", sourceSignature: "REDACTED" } });
  await tx.professionalEvaluation.updateMany({ where: { workspaceId }, data: { inputJson: "{}", resultJson: '{"status":"REDACTED","summary":"资料已删除，请重新评估","products":[]}', sourceSignature: "REDACTED" } });
  await tx.productSelectionVersion.deleteMany({ where: { workspaceId } }); await tx.productSelection.deleteMany({ where: { workspaceId } });
  await tx.planningMemory.updateMany({ where: { workspaceId }, data: { content: "", quote: "", ruleJson: "{}", dependencyJson: "{}", status: "DELETED", sourceRef: "REDACTED", confirmedAt: null } });
  const sessions = await tx.agentSession.findMany({ where: { workspaceId }, select: { id: true } }); const ids = sessions.map((s) => s.id);
  await tx.agentMessage.updateMany({ where: { sessionId: { in: ids } }, data: { content: "相关资料已删除" } });
  await tx.agentStep.updateMany({ where: { sessionId: { in: ids } }, data: { inputJson: "{}", outputJson: "{}" } });
  const constraints = await tx.agentConstraint.findMany({ where: { sessionId: { in: ids } }, select: { id: true } }); await tx.agentConstraintRevision.updateMany({ where: { constraintId: { in: constraints.map((c) => c.id) } }, data: { content: "已删除", category: "REDACTED", status: "REDACTED" } });
  await tx.agentConstraint.updateMany({ where: { sessionId: { in: ids } }, data: { content: "已删除", category: "REDACTED", status: "REDACTED" } });
  await tx.agentRun.updateMany({ where: { workspaceId }, data: { inputJson: "{}", resultJson: '{"status":"REDACTED"}', sourceSignature: "REDACTED", status: "CANCELLED", errorCode: null } });
  await tx.agentProposal.updateMany({ where: { workspaceId }, data: { dataJson: "{}", resultJson: "{}", title: "资料已删除", status: "REDACTED", sourceSignature: "REDACTED" } });
  await tx.goalFundingReservation.deleteMany({ where: { workspaceId } });
  await tx.goalEvaluationRecord.updateMany({ where: { workspaceId }, data: { inputJson: "{}", resultJson: '{"status":"REDACTED"}', sourceSignature: "REDACTED", status: "REDACTED" } });
  await tx.goalPlanVersion.updateMany({ where: { workspaceId }, data: { snapshotJson: '{"status":"REDACTED"}', status: "REDACTED" } });
  await tx.goalReview.updateMany({ where: { workspaceId }, data: { factsJson: "{}", resultJson: '{"status":"REDACTED"}' } });
  await tx.goalDecision.updateMany({ where: { workspaceId }, data: { title: "资料已删除", factsJson: "{}", activePlanId: null, status: "REDACTED", version: { increment: 1 } } });
  await tx.agentMessage.updateMany({ where: { sessionId: { in: ids } }, data: { displayJson: "{}" } });
  await tx.agentSession.updateMany({ where: { workspaceId }, data: { title: "资料已删除", objective: null, goalDraftJson: "{}", summaryJson: "{}", status: "CANCELLED" } });
  await tx.diagnosis.updateMany({ where: { workspaceId }, data: { resultJson: '{"status":"REDACTED"}' } }); await tx.planSet.updateMany({ where: { workspaceId }, data: { resultJson: '{"status":"REDACTED"}' } });
  await tx.scenarioResult.updateMany({ where: { workspaceId }, data: { resultJson: '{"status":"REDACTED"}' } }); await tx.calculationSnapshot.deleteMany({ where: { workspaceId } });
  await tx.cashflowAnalysis.deleteMany({ where: { workspaceId } }); await tx.futurePlanningReport.updateMany({ where: { workspaceId }, data: { resultJson: '{"status":"REDACTED"}', resultText: "相关资料已删除" } });
  await tx.actionFeedback.updateMany({ where: { action: { workspaceId } }, data: { reason: "相关资料已删除" } });
  await tx.action.updateMany({ where: { workspaceId }, data: { title: "相关资料已删除", reason: "需重新核对", amountMinor: null, detailsJson: null, productConditionsJson: null, status: "DISMISSED" } });
  await tx.managerReminder.updateMany({ where: { workspaceId }, data: { title: "相关资料已删除", detailsJson: "{}", status: "CLOSED" } });
  await tx.budgetItem.deleteMany({ where: { workspaceId } }); await tx.budgetVersion.updateMany({ where: { workspaceId }, data: { status: "REDACTED", dataJson: "{}", incomeMinor: 0n, livingMinor: 0n, reason: "资料已删除" } });
  await tx.insuranceNeed.deleteMany({ where: { workspaceId } }); await tx.investmentNeed.deleteMany({ where: { workspaceId } });
  await tx.migrationIssue.updateMany({ where: { workspaceId }, data: { note: "相关资料已删除", status: "CLOSED" } });
  await tx.workspace.update({ where: { id: workspaceId }, data: { ledgerHeadersJson: "{}", dataEpoch: { increment: 1 }, portfolioRevision: { increment: 1 }, professionalRevision: { increment: 1 } } });
  await tx.dataDependency.deleteMany({ where: { workspaceId } });
}
export async function deletePermanently(workspaceId: string, type: string, id: string, expectedEpoch: number, existingJobId?: string) {
  return exclusively(async () => {
    let job = existingJobId ? await db.deletionJob.findFirst({ where: { id: existingJobId, workspaceId, entityType: type, entityId: id } }) : null;
    if (!existingJobId) { const w = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } }); if (w.dataEpoch !== expectedEpoch) throw new ApiError("删除预览已过期，请重新核对", 409); job = await db.deletionJob.create({ data: { workspaceId, entityType: type, entityId: id } }); }
    if (!job) throw new ApiError("删除任务不存在", 404); if (job.status === "DONE") return { job, cacheReset: true };
    try {
      if (job.phase === "DATABASE") await db.$transaction(async (tx) => { await purgeDatabase(tx, workspaceId, type, id); await tx.deletionJob.update({ where: { id: job!.id }, data: { phase: "FILES", status: "PROCESSING", error: null } }); }, { timeout: 15000 });
      v2Store().purgeWorkspace(workspaceId);
      await clearManagedBackups();
      // Remove free-page remnants before generating the sanitized backup.
      await db.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE)");
      await db.$executeRawUnsafe("VACUUM");
      await db.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE)");
      await createBackup("DAILY");
      job = await db.deletionJob.update({ where: { id: job.id }, data: { phase: "COMPLETE", status: "DONE", completedAt: new Date(), error: null } });
      return { job, cacheReset: true };
    } catch (e) { await db.deletionJob.update({ where: { id: job.id }, data: { status: "FAILED", error: "删除未完成，请重试；相关备份或文件仍可能保留" } }); throw e; }
  });
}
const command = z.discriminatedUnion("command", [
  z.object({ command: z.literal("CONSTRAINT"), expectedRevision: z.number().int().nonnegative(), oldId: z.string().optional(), data: z.unknown() }).strict(),
  z.object({ command: z.literal("VERIFY"), assumptionId: z.string(), period: z.string().regex(/^\d{4}-\d{2}$/), expectedVersion: z.number().int().nonnegative(), actualValue: fen.nullable(), occurredOn: naturalDate.nullable(), evidence: z.string().trim().min(1).max(500), confirm: z.literal(true) }).strict(),
  z.object({ command: z.literal("PRIORITY"), goalId: z.string(), expectedRevision: z.number().int().nonnegative(), priority: z.number().int().min(1).max(5), note: z.string().max(500).nullable(), confirm: z.literal(true) }).strict(),
  z.object({ command: z.literal("BALANCE"), entityType: z.enum(["ASSET", "LIABILITY"]), entityId: z.string(), expectedRevision: z.number().int().nonnegative(), amountMinor: fen, observedOn: naturalDate, confirm: z.literal(true) }).strict(),
  z.object({ command: z.literal("DRAFT"), kind: z.enum(["CAR_FACTS", "CAR_REVIEW", "SIMULATION"]), entityId: z.string(), expectedVersion: z.number().int().nonnegative(), sourceSignature: z.string(), data: z.unknown().refine((v) => encode(v).length <= 500000, "草稿内容过大") }).strict(),
  z.object({ command: z.literal("BACKUP") }).strict(), z.object({ command: z.literal("RESTORE_PREVIEW"), id: z.string() }).strict(), z.object({ command: z.literal("RESTORE"), id: z.string(), hash: z.string(), confirm: z.literal(true) }).strict(),
  z.object({ command: z.literal("DELETE_PREVIEW"), entityType, entityId: z.string() }).strict(), z.object({ command: z.literal("DELETE"), entityType, entityId: z.string(), expectedEpoch: z.number().int(), jobId: z.string().optional(), confirm: z.literal(true) }).strict(),
]);
export async function dataCommand(workspaceId: string, body: unknown) {
  await initializeData(workspaceId); const input = command.parse(body);
  if (input.command === "BACKUP") return createBackup(); if (input.command === "RESTORE_PREVIEW") return restorePreview(input.id); if (input.command === "RESTORE") return restoreBackup(input.id, input.hash);
  if (input.command === "DELETE_PREVIEW") return deletionPreview(workspaceId, input.entityType, input.entityId); if (input.command === "DELETE") return deletePermanently(workspaceId, input.entityType, input.entityId, input.expectedEpoch, input.jobId);
  return db.$transaction(async (tx) => {
    if (input.command === "CONSTRAINT") { const claimed = await tx.workspace.findFirst({ where: { id: workspaceId, professionalRevision: input.expectedRevision } }); if (!claimed) throw new ApiError("约束资料已变化", 409); return serialize(await saveConstraint(tx, workspaceId, input.data, input.oldId)); }
    if (input.command === "VERIFY") return { status: await verifyAssumption(tx, workspaceId, input) };
    if (input.command === "DRAFT") {
      if (input.kind !== "SIMULATION" && !await tx.carDecision.findFirst({ where: { id: input.entityId, workspaceId } })) throw new ApiError("草稿关联决策不存在", 404);
      const key = { workspaceId, kind: input.kind, entityId: input.entityId }; const old = await tx.businessDraft.findUnique({ where: { workspaceId_kind_entityId: key } });
      if ((old?.version ?? 0) !== input.expectedVersion) throw new ApiError("草稿已在其他页面更新", 409);
      return tx.businessDraft.upsert({ where: { workspaceId_kind_entityId: key }, create: { ...key, sourceSignature: input.sourceSignature, dataJson: encode(input.data) }, update: { sourceSignature: input.sourceSignature, dataJson: encode(input.data), version: { increment: 1 } } });
    }
    if (input.command === "BALANCE") { const key = `CHECK:${workspaceId}:${input.expectedRevision}:${input.entityType}:${input.entityId}`; const prior = await tx.balanceObservation.findUnique({ where: { observationKey: key } }); if (prior && prior.amountMinor === BigInt(input.amountMinor) && prior.observedOn === input.observedOn) return serialize(prior); }
    const claimed = await tx.workspace.updateMany({ where: { id: workspaceId, portfolioRevision: input.expectedRevision }, data: { portfolioRevision: { increment: 1 } } }); if (!claimed.count) throw new ApiError("底账已变化，请刷新", 409);
    if (input.command === "PRIORITY") { const goal = await tx.goal.findFirst({ where: { id: input.goalId, workspaceId, deletedAt: null } }); if (!goal) throw new ApiError("目标不存在", 404); await recordRevision(tx, workspaceId, "GOAL", goal.id, goal, "优先级修改前"); return tx.goal.update({ where: { id: goal.id }, data: { priority: input.priority, priorityNote: input.note, priorityConfirmedAt: new Date() } }); }
    const entity = await targetExists(tx, workspaceId, input.entityType, input.entityId); if (!entity) throw new ApiError("账户不存在", 404);
    const amount = "currentValueMinor" in entity ? entity.currentValueMinor : "outstandingBalanceMinor" in entity ? entity.outstandingBalanceMinor : null;
    if (amount !== BigInt(input.amountMinor)) throw new ApiError("余额不同，请先在底账修改真实余额", 409);
    return tx.balanceObservation.create({ data: { workspaceId, entityType: input.entityType, entityId: input.entityId, amountMinor: amount, observedOn: input.observedOn, confirmed: true, source: "USER_CONFIRMATION", observationKey: `CHECK:${workspaceId}:${input.expectedRevision}:${input.entityType}:${input.entityId}` } });
  });
}
