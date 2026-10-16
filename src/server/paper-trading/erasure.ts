import { db } from "@/lib/db";
import { exclusively } from "@/lib/database-maintenance";
import { clearManagedBackups, createBackup } from "../database-backup";
import { deletionPreview } from "./maintenance";
import { paperErasureScope } from "./erasure-scope";
import { PaperError } from "../../domain/paper-trading";
import type { Tx } from "./service";

export async function purgePaperAccount(tx: Tx, workspaceId: string, accountId: string) {
  const scope = await paperErasureScope(tx, workspaceId, accountId), now = new Date();
  if (scope.unknownOwnerTypes.length) throw new PaperError("存在尚不能安全清理的旧依赖类型，请先完成依赖核对；未报告彻底删除成功", 409);
  const sessionIds = scope.sessions.map(s => s.id);
  await tx.agentConstraintRevision.updateMany({ where: { constraintId: { in: scope.constraintIds } }, data: { content: "已删除", category: "REDACTED", status: "REDACTED" } });
  await tx.agentConstraint.updateMany({ where: { id: { in: scope.constraintIds } }, data: { content: "已删除", category: "REDACTED", status: "REDACTED" } });
  await tx.agentMessage.updateMany({ where: { sessionId: { in: sessionIds } }, data: { content: "相关模拟账户资料已删除", displayJson: "{}" } });
  await tx.agentStep.updateMany({ where: { sessionId: { in: sessionIds } }, data: { inputJson: "{}", outputJson: "{}", status: "CANCELLED", errorCode: null } });
  await tx.agentProposal.updateMany({ where: { workspaceId, runId: { in: scope.runIds } }, data: { dataJson: "{}", resultJson: "{}", title: "资料已删除", status: "REDACTED", sourceSignature: "REDACTED", version: { increment: 1 } } });
  await tx.agentRun.updateMany({ where: { workspaceId, sessionId: { in: sessionIds } }, data: { inputJson: "{}", resultJson: '{"status":"REDACTED"}', sourceSignature: "REDACTED", status: "CANCELLED", errorCode: null, leaseUntil: null, completedAt: now } });
  await tx.agentSession.updateMany({ where: { workspaceId, id: { in: sessionIds } }, data: { title: "资料已删除", objective: null, goalDraftJson: "{}", summaryJson: "{}", status: "CANCELLED", version: { increment: 1 } } });
  const ownerIds = [accountId, ...sessionIds, ...scope.runIds, ...scope.proposalIds, ...scope.messageIds, ...scope.stepIds, ...scope.constraintIds];
  await tx.dataDependency.deleteMany({ where: { workspaceId, OR: [{ sourceType: "PAPER_ACCOUNT", sourceId: accountId }, { ownerId: { in: ownerIds } }, { sourceId: { in: ownerIds } }] } });
  // Remove restrictive child references before the account's ordinary cascades.
  const experiment = await tx.paperStrategyExperiment.findFirst({ where: { workspaceId, accountId } });
  if (experiment) {
    await tx.paperStrategyRun.deleteMany({ where: { workspaceId, experimentId: experiment.id } });
    await tx.paperStrategyAuthorization.deleteMany({ where: { workspaceId, experimentId: experiment.id } });
    await tx.paperStrategyVersion.deleteMany({ where: { workspaceId, experimentId: experiment.id } });
    await tx.paperStockPoolVersion.deleteMany({ where: { workspaceId, experimentId: experiment.id } });
    await tx.paperStrategyExperiment.delete({ where: { id: experiment.id } });
  }
  await tx.paperCondition.deleteMany({ where: { workspaceId, accountId } });
  await tx.paperReplaySession.deleteMany({ where: { workspaceId, accountId } });
  await tx.paperAccount.delete({ where: { workspaceId_id: { workspaceId, id: accountId } } });
  if (scope.replaySessionId) await tx.marketQuote.deleteMany({ where: { provider: `REPLAY:${scope.replaySessionId}` } });
  if (scope.removableDataset) await tx.paperReplayDataset.delete({ where: { id: scope.removableDataset.id } });
  // Invalidate cached reads and any model/proposal commit captured before deletion.
  await tx.workspace.update({ where: { id: workspaceId }, data: { dataEpoch: { increment: 1 } } });
}

export async function erasePaperAccount(workspaceId: string, accountId: string, signature: string, retryId?: string) {
  return exclusively(async () => {
    let job = retryId ? await db.deletionJob.findFirst({ where: { id: retryId, workspaceId, entityType: "PAPER_ACCOUNT", entityId: accountId } }) : null;
    if (retryId && !job) throw new PaperError("删除任务不存在", 404);
    if (!job) {
      const preview = await deletionPreview(db, workspaceId, accountId);
      if (!preview.canDelete) throw new PaperError("删除依赖待核对，请查看预览中的未知类型", 409);
      if (preview.signature !== signature) throw new PaperError("删除预览已变化", 409);
      job = await db.deletionJob.create({ data: { workspaceId, entityType: "PAPER_ACCOUNT", entityId: accountId } });
    }
    if (job.status === "DONE") return { jobId: job.id, cacheReset: true };
    try {
      if (job.phase === "DATABASE") await db.$transaction(async tx => {
        await purgePaperAccount(tx, workspaceId, accountId);
        await tx.deletionJob.update({ where: { id: job!.id }, data: { phase: "FILES", status: "PROCESSING", error: null } });
      }, { timeout: 15000 });
      await clearManagedBackups();
      await db.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE)");
      await db.$executeRawUnsafe("VACUUM");
      await db.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE)");
      await createBackup("MANUAL");
      await db.deletionJob.update({ where: { id: job.id }, data: { status: "DONE", phase: "COMPLETE", completedAt: new Date(), error: null } });
      return { jobId: job.id, cacheReset: true };
    } catch {
      await db.deletionJob.update({ where: { id: job.id }, data: { status: "FAILED", error: "数据或文件清理未完成，可用原任务编号重试" } });
      throw new PaperError(`彻底删除尚未完成，请重试任务 ${job.id}`, 503);
    }
  });
}
