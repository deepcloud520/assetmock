import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { z } from "zod";
import { getWealthCalculation } from "./calculation";
import { ApiError, serialize } from "./portfolio";

function isCashflowAction(kind: string) {
  return kind === "CASHFLOW_ADVICE" || kind.startsWith("CASHFLOW_RECOMMENDATION_");
}

async function verifyMarkedActions(workspaceId: string) {
  const calculation = await getWealthCalculation(workspaceId);
  const marked = await db.action.findMany({ where: { workspaceId, status: "USER_MARKED_COMPLETED", kind: { not: "CASHFLOW_ADVICE" }, NOT: { kind: { startsWith: "CASHFLOW_RECOMMENDATION_" } } } });
  for (const action of marked) {
    // Completion requires fresh financial evidence, not an unchanged snapshot.
    if (calculation.sourceRevision <= action.sourceRevision) continue;
    const baseline = await db.calculationSnapshot.findFirst({
      where: { workspaceId, sourceRevision: action.sourceRevision, formulaVersion: calculation.formulaVersion },
      orderBy: { createdAt: "desc" },
    });
    if (!baseline) continue;
    const previous = JSON.parse(baseline.resultJson) as typeof calculation;
    const oldCoverage = previous.safety.emergencyCoverageMonths.value;
    const oldConcentration = previous.concentration.largestHoldingRatio.value;
    const verified = action.verificationType === "EMERGENCY_COVERAGE_3M"
      ? oldCoverage !== null && oldCoverage < 3 && (calculation.safety.emergencyCoverageMonths.value ?? 0) >= 3
      : action.verificationType === "LARGEST_HOLDING_AT_MOST_50"
        ? oldConcentration !== null && oldConcentration > 50 && (calculation.concentration.largestHoldingRatio.value ?? 100) <= 50
        : false;
    if (verified) await db.$transaction(async (tx) => {
      const workspace = await tx.workspace.findUnique({ where: { id: workspaceId } });
      if (workspace?.portfolioRevision !== calculation.sourceRevision) return;
      await tx.action.updateMany({ where: { id: action.id, workspaceId, status: "USER_MARKED_COMPLETED" }, data: { status: "VERIFIED_COMPLETED" } });
    });
  }
  return calculation.sourceRevision;
}

export async function getExecutionResults(workspaceId: string) {
  const currentRevision = await verifyMarkedActions(workspaceId);
  const [scenario, actionTask, workspace] = await Promise.all([
    db.scenarioResult.findFirst({ where: { workspaceId }, orderBy: { createdAt: "desc" } }),
    db.agentTask.findFirst({ where: { workspaceId, type: "ACTION_PLANNING", status: "COMPLETED" }, orderBy: { createdAt: "desc" } }),
    db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { transactionRevision: true } }),
  ]);
  const actions = (await db.action.findMany({ where: { workspaceId, status: { notIn: ["PROPOSED", "DISMISSED"] } }, orderBy: [{ createdAt: "desc" }, { priority: "asc" }], include: { goal: { select: { name: true } }, feedback: { orderBy: { createdAt: "desc" } } } }))
    .filter((action) => action.status !== "DEFERRED" || action.feedback.some((item) => item.fromStatus === "ACCEPTED"));
  const professionalVersion = (await db.workspace.findUnique({ where: { id: workspaceId } }))?.professionalRevision ?? 0;
  const actionRevision = (action: { kind: string; sourceRevision: number }) => action.kind.startsWith("SPECIALIST_") ? professionalVersion : action.kind === "CAR_PLANNING" ? action.sourceRevision : isCashflowAction(action.kind) ? workspace.transactionRevision : currentRevision;
  return serialize({
    scenario: scenario && JSON.parse(scenario.resultJson).status !== "REDACTED" ? { id: scenario.id, sourceRevision: scenario.sourceRevision, isStale: scenario.sourceRevision !== currentRevision, planKey: scenario.planKey, createdAt: scenario.createdAt, ...JSON.parse(scenario.resultJson) } : null,
    actions: actionTask || actions.length ? {
      generationTaskId: actionTask?.id ?? actions[0].generationTaskId,
      sourceRevision: actionTask?.sourceRevision ?? actions[0].sourceRevision,
      isStale: actions.some((action) => action.sourceRevision !== actionRevision(action) && !["VERIFIED_COMPLETED", "DISMISSED"].includes(action.status)),
      items: actions.map((action) => ({
        ...action,
        goalName: action.goal?.name ?? null,
        revisionScope: action.kind.startsWith("SPECIALIST_") ? "PROFESSIONAL" : isCashflowAction(action.kind) ? "TRANSACTION" : "PORTFOLIO",
        isStale: action.sourceRevision !== actionRevision(action),
        isOverdue: Boolean(action.dueDate && action.dueDate < new Date() && ["PROPOSED", "ACCEPTED", "DEFERRED"].includes(action.status)),
        productConditions: action.productConditionsJson ? JSON.parse(action.productConditionsJson) : null,
        details: action.detailsJson ? JSON.parse(action.detailsJson) : null,
      })),
    } : null,
  });
}

const transitions: Record<string, string[]> = {
  PROPOSED: ["ACCEPTED", "DEFERRED", "DISMISSED"],
  ACCEPTED: ["USER_MARKED_COMPLETED", "DEFERRED", "DISMISSED"],
  DEFERRED: ["ACCEPTED", "PROPOSED", "DISMISSED"],
  USER_MARKED_COMPLETED: ["ACCEPTED"],
  DISMISSED: ["PROPOSED"],
  VERIFIED_COMPLETED: [],
};

export async function transitionAction(workspaceId: string, id: string, status: string, reasonValue?: unknown) {
  const reason = z.string().trim().max(500).optional().parse(reasonValue);
  if (["DEFERRED", "DISMISSED"].includes(status) && !reason) throw new ApiError("请填写暂缓或拒绝的原因，便于后续复盘", 422);
  return db.$transaction((tx) => applyActionTransition(tx, workspaceId, id, status, reason));
}
export async function applyActionTransition(tx: Prisma.TransactionClient, workspaceId: string, id: string, status: string, reason?: string) {
    const action = await tx.action.findFirst({ where: { id, workspaceId } });
    if (!action) throw new ApiError("行动不存在", 404);
    if (!transitions[action.status]?.includes(status)) throw new ApiError("当前行动状态不允许此操作", 409);
    if (action.status === "DEFERRED" && status === "ACCEPTED") {
      const acceptedBefore = await tx.actionFeedback.findFirst({ where: { actionId: id, fromStatus: "ACCEPTED", toStatus: "DEFERRED" } });
      if (!acceptedBefore) throw new ApiError("这条建议尚未采纳", 409);
    }
    const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    const professionalVersion = (await tx.workspace.findUnique({ where: { id: workspaceId } }))?.professionalRevision ?? 0;
    const activeRevision = action.kind.startsWith("SPECIALIST_") ? professionalVersion : isCashflowAction(action.kind) ? workspace.transactionRevision : workspace.portfolioRevision;
    if (status === "ACCEPTED" && action.status === "PROPOSED" && action.sourceRevision !== activeRevision) {
      throw new ApiError(isCashflowAction(action.kind) ? "这条建议基于旧流水，请重新分析后再接受" : "这条建议基于旧底账，请重新分析后再接受", 409);
    }
    const updated = await tx.action.updateMany({ where: { id, workspaceId, status: action.status }, data: { status } });
    if (!updated.count) throw new ApiError("行动状态已变化，请刷新后重试", 409);
    if (action.kind.startsWith("SPECIALIST_")) await tx.managerReminder.updateMany({ where: { workspaceId, actionId: action.id }, data: { status: status === "USER_MARKED_COMPLETED" ? "DONE" : status === "DISMISSED" ? "CLOSED" : status === "DEFERRED" ? "SNOOZED" : "OPEN" } });
    if (reason) await tx.actionFeedback.create({ data: { actionId: id, fromStatus: action.status, toStatus: status, reason } });
    await tx.auditEvent.create({ data: { workspaceId, entityType: "ACTION", entityId: id, action: status, revision: activeRevision } });
    return tx.action.findUniqueOrThrow({ where: { id } });
}

