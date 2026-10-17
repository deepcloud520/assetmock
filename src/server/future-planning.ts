import { z } from "zod";
import { db } from "@/lib/db";
import { parseFuturePlanningOutput } from "./agent-runtime";
import { ApiError, serialize } from "./portfolio";

const revisionSchema = z.number().int().min(0);
const priority = { P0: 1, P1: 2, P2: 3 } as const;

export async function adoptFuturePlanningReport(workspaceId: string, reportId: string, expectedRevisionValue: unknown) {
  const expectedRevision = revisionSchema.parse(expectedRevisionValue);
  return db.$transaction(async (tx) => {
    const [workspace, report, task] = await Promise.all([
      tx.workspace.findUnique({ where: { id: workspaceId }, select: { portfolioRevision: true } }),
      tx.futurePlanningReport.findFirst({ where: { id: reportId, workspaceId } }),
      tx.agentTask.findFirst({ where: { workspaceId, resultId: reportId, type: "FUTURE_PLANNING_ACTION_REPORT", status: "COMPLETED" }, orderBy: { createdAt: "desc" } }),
    ]);
    if (!workspace || !report) throw new ApiError("行动清单不存在", 404);
    if (workspace.portfolioRevision !== expectedRevision || report.sourceRevision !== workspace.portfolioRevision) {
      throw new ApiError("财富信息已变化，请重新生成行动清单", 409);
    }
    if (!report.goalId || !report.planSetId || !report.planKey || !report.resultJson || !task) {
      throw new ApiError("这份历史报告不能直接采用，请重新生成", 422);
    }
    const planSet = await tx.planSet.findFirst({ where: { id: report.planSetId, workspaceId, goalId: report.goalId } });
    if (!planSet || planSet.sourceRevision !== workspace.portfolioRevision || planSet.selectedPlanKey !== report.planKey) {
      throw new ApiError("所选方案已经变化，请重新生成行动清单", 409);
    }
    const output = parseFuturePlanningOutput(JSON.parse(report.resultJson));
    if (!output.actions.length) throw new ApiError("请先补充规划所需信息，再生成可执行清单", 422);

    const adoptedAt = report.adoptedAt ?? new Date();
    for (const action of output.actions) {
      const sourceKey = `FUTURE_PLANNING:${report.id}:${action.id}`;
      const existing = await tx.action.findUnique({ where: { sourceKey } });
      if (existing) continue;
      const dueDate = new Date(adoptedAt);
      dueDate.setUTCDate(dueDate.getUTCDate() + action.due_in_days);
      await tx.action.create({ data: {
        sourceKey,
        workspaceId,
        goalId: report.goalId,
        generationTaskId: task.id,
        planSetId: report.planSetId,
        planKey: report.planKey,
        sourceRevision: report.sourceRevision,
        kind: "FUTURE_PLANNING",
        title: action.title,
        reason: action.reason,
        amountMinor: action.amount === null ? null : BigInt(action.amount),
        priority: priority[action.priority],
        dueDate,
        status: "ACCEPTED",
        verificationType: "REQUIRES_REVIEW",
        detailsJson: JSON.stringify({ sourceActionId: action.id, steps: action.steps, prerequisites: action.prerequisites, completionCriteria: action.completion_criteria, verificationRequired: action.verification_required }),
      } });
    }
    if (!report.adoptedAt) await tx.futurePlanningReport.update({ where: { id: report.id }, data: { adoptedAt } });
    const actions = await tx.action.findMany({ where: { workspaceId, sourceKey: { startsWith: `FUTURE_PLANNING:${report.id}:` } }, orderBy: { priority: "asc" } });
    return serialize({ reportId: report.id, adoptedAt, actions });
  });
}
