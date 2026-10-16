import { afterAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { adoptFuturePlanningReport } from "./future-planning";

const reportOutput = {
  information_completeness: "BASIC",
  summary: "按当前方案逐步推进目标。",
  assumptions: ["暂不计投资收益"],
  risks: [],
  actions: [
    {
      id: "confirm_budget",
      priority: "P0",
      title: "确认目标预算",
      reason: "先锁定后续执行范围。",
      steps: ["核对目标金额"],
      amount: null,
      currency: "CNY",
      due_in_days: 14,
      prerequisites: [],
      completion_criteria: "形成书面预算。",
      verification_required: "更新目标金额和已准备金额。",
    },
    {
      id: "build_reserve",
      priority: "P1",
      title: "补充应急储备",
      reason: "为规划执行保留现金缓冲。",
      steps: ["核对应急资金"],
      amount: "300000",
      currency: "CNY",
      due_in_days: 30,
      prerequisites: ["完成预算核对"],
      completion_criteria: "应急资金已单独记录。",
      verification_required: "更新现金类资产底账。",
    },
  ],
  missing_information: [],
  disclaimer: "本规划用于资产整理与目标规划参考，不构成投资建议。",
} as const;

async function seedReport() {
  const workspace = await db.workspace.create({ data: { portfolioRevision: 2 } });
  const goal = await db.goal.create({ data: {
    workspaceId: workspace.id,
    name: "购房",
    type: "HOME_PURCHASE",
    targetAmountMinor: 20_000_000n,
    targetDate: new Date("2029-09-22"),
  } });
  const planSet = await db.planSet.create({ data: {
    workspaceId: workspace.id,
    goalId: goal.id,
    sourceRevision: 2,
    promptVersion: "test-plan",
    model: "test-model",
    mode: "FALLBACK",
    resultJson: "{}",
    selectedPlanKey: "B",
    recommendedPlanKey: "B",
  } });
  const report = await db.futurePlanningReport.create({ data: {
    workspaceId: workspace.id,
    goalId: goal.id,
    planSetId: planSet.id,
    planKey: "B",
    sourceRevision: 2,
    promptVersion: "future-planning-action-v2",
    model: "test-model",
    mode: "FALLBACK",
    informationCompleteness: "BASIC",
    resultText: "未来规划行动清单",
    resultJson: JSON.stringify(reportOutput),
  } });
  const task = await db.agentTask.create({ data: {
    workspaceId: workspace.id,
    type: "FUTURE_PLANNING_ACTION_REPORT",
    status: "COMPLETED",
    sourceRevision: 2,
    resultId: report.id,
    completedAt: new Date(),
  } });
  return { workspace, goal, planSet, report, task };
}

describe("future planning adoption", () => {
  const workspaceIds: string[] = [];

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    await db.$disconnect();
  });

  it("creates accepted execution actions once and preserves their state", async () => {
    const seeded = await seedReport();
    workspaceIds.push(seeded.workspace.id);

    const first = await adoptFuturePlanningReport(seeded.workspace.id, seeded.report.id, 2);
    expect(first.actions).toHaveLength(2);
    expect(first.actions[0]).toMatchObject({
      workspaceId: seeded.workspace.id,
      goalId: seeded.goal.id,
      generationTaskId: seeded.task.id,
      planSetId: seeded.planSet.id,
      planKey: "B",
      status: "ACCEPTED",
      kind: "FUTURE_PLANNING",
      sourceKey: `FUTURE_PLANNING:${seeded.report.id}:confirm_budget`,
    });
    expect(new Date(first.actions[0].dueDate!).getTime() - new Date(first.adoptedAt).getTime()).toBe(14 * 86_400_000);

    await db.action.update({ where: { id: first.actions[0].id }, data: { status: "DEFERRED" } });
    const repeated = await adoptFuturePlanningReport(seeded.workspace.id, seeded.report.id, 2);
    expect(repeated.actions).toHaveLength(2);
    expect(repeated.actions.find((action) => action.id === first.actions[0].id)?.status).toBe("DEFERRED");
    expect(await db.action.count({ where: { workspaceId: seeded.workspace.id } })).toBe(2);
    expect((await db.futurePlanningReport.findUniqueOrThrow({ where: { id: seeded.report.id } })).adoptedAt).not.toBeNull();
  });

  it("rejects stale reports and reports whose selected plan changed", async () => {
    const stale = await seedReport();
    workspaceIds.push(stale.workspace.id);
    await db.workspace.update({ where: { id: stale.workspace.id }, data: { portfolioRevision: 3 } });
    await expect(adoptFuturePlanningReport(stale.workspace.id, stale.report.id, 2)).rejects.toThrow("财富信息已变化");
    expect(await db.action.count({ where: { workspaceId: stale.workspace.id } })).toBe(0);

    const changed = await seedReport();
    workspaceIds.push(changed.workspace.id);
    await db.planSet.update({ where: { id: changed.planSet.id }, data: { selectedPlanKey: "A" } });
    await expect(adoptFuturePlanningReport(changed.workspace.id, changed.report.id, 2)).rejects.toThrow("所选方案已经变化");
    expect(await db.action.count({ where: { workspaceId: changed.workspace.id } })).toBe(0);
  });
});
