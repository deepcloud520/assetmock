import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getWealthCalculation } from "./calculation";
import { getExecutionResults, transitionAction } from "./execution-results";
import { createResource } from "./portfolio";

const workspaces: string[] = [];
afterAll(async () => {
  for (const id of workspaces) await db.workspace.delete({ where: { id } });
});

describe("action verification evidence", () => {
  async function setup(cash: bigint) {
    const workspace = await db.workspace.create({ data: {
      profile: { create: { essentialExpenseMinor: 10000n } },
      assets: { create: { name: "现金", type: "CASH", currentValueMinor: cash, liquidityLevel: "T0", riskLevel: 1 } },
    } });
    workspaces.push(workspace.id);
    await getWealthCalculation(workspace.id);
    const action = await db.action.create({ data: {
      workspaceId: workspace.id, generationTaskId: "test", planSetId: "test", planKey: "A",
      sourceRevision: 0, kind: "BUILD_EMERGENCY_FUND", title: "补足应急金", reason: "测试",
      priority: 1, status: "USER_MARKED_COMPLETED", verificationType: "EMERGENCY_COVERAGE_3M",
    } });
    return { workspace, action };
  }

  it("does not verify using an already healthy unchanged ledger", async () => {
    const { workspace, action } = await setup(40000n);
    await getExecutionResults(workspace.id);
    expect((await db.action.findUniqueOrThrow({ where: { id: action.id } })).status).toBe("USER_MARKED_COMPLETED");
  });

  it("verifies an improvement supported by a new ledger", async () => {
    const { workspace, action } = await setup(10000n);
    await createResource("asset", workspace.id, {
      name: "新增应急现金", type: "CASH", currentValueMinor: "30000", currency: "CNY",
      liquidityLevel: "T0", riskLevel: 1, isInvestable: true, isAdjustable: true, goalId: null,
    });
    await getExecutionResults(workspace.id);
    expect((await db.action.findUniqueOrThrow({ where: { id: action.id } })).status).toBe("VERIFIED_COMPLETED");
  });

  it("retains older actions and allows progress updates after the ledger changes", async () => {
    const { workspace, action } = await setup(10000n);
    await db.action.update({ where: { id: action.id }, data: { status: "ACCEPTED" } });
    await db.workspace.update({ where: { id: workspace.id }, data: { portfolioRevision: 1 } });
    const task = await db.agentTask.create({ data: { workspaceId: workspace.id, sourceRevision: 1, type: "ACTION_PLANNING", status: "COMPLETED" } });
    const newer = await db.action.create({ data: {
      workspaceId: workspace.id, generationTaskId: task.id, planSetId: "new", planKey: "B", sourceRevision: 1,
      kind: "REVIEW_DEBT", title: "复核负债", reason: "测试", priority: 2, verificationType: "DEBT_REVIEW_REQUIRED",
    } });
    const result = await getExecutionResults(workspace.id);
    expect(result.actions?.items.map((item) => item.id)).toEqual([action.id]);
    expect(result.actions?.items.find((item) => item.id === action.id)?.isStale).toBe(true);
    await transitionAction(workspace.id, action.id, "DEFERRED", "需要先处理临时支出");
    expect((await getExecutionResults(workspace.id)).actions?.items.map((item) => item.id)).toContain(action.id);
    await transitionAction(workspace.id, action.id, "ACCEPTED");
    await transitionAction(workspace.id, action.id, "DEFERRED", "再次暂缓");
    await transitionAction(workspace.id, action.id, "PROPOSED");
    await expect(transitionAction(workspace.id, action.id, "ACCEPTED")).rejects.toThrow("旧底账");
    await transitionAction(workspace.id, newer.id, "ACCEPTED");
    expect(await db.auditEvent.count({ where: { workspaceId: workspace.id, entityType: "ACTION" } })).toBe(5);
  });

  it("requires a reason and preserves feedback history across restored actions", async () => {
    const { workspace, action } = await setup(10000n);
    await db.action.update({ where: { id: action.id }, data: { status: "ACCEPTED" } });
    await expect(transitionAction(workspace.id, action.id, "DEFERRED", "  ")).rejects.toThrow("请填写");
    expect(await db.actionFeedback.count({ where: { actionId: action.id } })).toBe(0);
    await transitionAction(workspace.id, action.id, "DEFERRED", "需要先确认还款日期");
    await transitionAction(workspace.id, action.id, "PROPOSED");
    await transitionAction(workspace.id, action.id, "DISMISSED", "目标已调整");
    const result = await getExecutionResults(workspace.id);
    expect(result.actions?.items ?? []).toHaveLength(0);
    expect((await db.actionFeedback.findMany({ where: { actionId: action.id }, orderBy: { createdAt: "desc" } })).map((item) => item.reason)).toEqual(["目标已调整", "需要先确认还款日期"]);
    await expect(transitionAction("other-workspace", action.id, "PROPOSED", "越权反馈")).rejects.toThrow("行动不存在");
    expect(await db.actionFeedback.count({ where: { actionId: action.id } })).toBe(2);
  });

  it("does not show a suggestion deferred before it was accepted", async () => {
    const { workspace } = await setup(10000n);
    const suggestion = await db.action.create({ data: {
      workspaceId: workspace.id, generationTaskId: "diagnosis-test", sourceRevision: 0,
      kind: "DIAGNOSIS", title: "核对支出", reason: "测试", priority: 1, verificationType: "REQUIRES_REVIEW",
    } });
    await transitionAction(workspace.id, suggestion.id, "DEFERRED", "先收集账单");
    expect((await getExecutionResults(workspace.id)).actions?.items.map((item) => item.id)).not.toContain(suggestion.id);
    await expect(transitionAction(workspace.id, suggestion.id, "ACCEPTED")).rejects.toThrow("尚未采纳");
  });
});
