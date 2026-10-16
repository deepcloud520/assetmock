import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { createResource } from "./portfolio";
import { executeTask, getAgentResults } from "./tasks";
import { getExecutionResults, transitionAction } from "./execution-results";

describe("agent task workflow", () => {
  let workspaceId = "";

  async function seedCurrentAssessment() {
    const workspace = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { portfolioRevision: true } });
    await db.diagnosis.create({
      data: {
        workspaceId,
        sourceRevision: workspace.portfolioRevision,
        promptVersion: "test-assessment",
        model: "test-model",
        mode: "FALLBACK",
        resultJson: JSON.stringify({ fourAccountAssessment: { dataCompleteness: "partially_complete" } }),
      },
    });
  }

  beforeAll(async () => {
    const workspace = await db.workspace.create({
      data: {
        profile: { create: { stableMonthlyIncomeMinor: 2_000_000n, essentialExpenseMinor: 700_000n } },
        assets: { create: { name: "集中持仓", type: "EQUITY", currentValueMinor: 5_000_000n, liquidityLevel: "D7", riskLevel: 5, isInvestable: true } },
        goals: { create: { name: "购房", type: "HOME_PURCHASE", targetAmountMinor: 20_000_000n, targetDate: new Date("2028-09-14"), monthlyContributionMinor: 300_000n } },
      },
    });
    workspaceId = workspace.id;
  });

  afterAll(async () => {
    if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
    await db.$disconnect();
  });

  it("sends the complete ledger to AI and persists its structured diagnosis", async () => {
    vi.stubEnv("OPENAI_BASE_URL", "https://aiping.cn/api/v1");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_MODEL", "test-model");
    vi.stubEnv("ALLOW_AI_IN_TEST", "true");
    const aiOutput = {
      overall_assessment: { status: "RISK", summary: "应急资金不足是当前最需要处理的问题。", positive_foundations: ["已有稳定月收入"] },
      risks: [{
        id: "emergency", priority: 1, severity: "HIGH", category: "FINANCIAL_SAFETY", title: "应急资金不足",
        conclusion: "当前缺少可立即使用的安全资产。", evidence: ["高流动性安全资产可覆盖 0 个月"],
        reason: "现有资产为高风险集中持仓。", impact: "收入中断时可能无法覆盖必要支出。", related_goal_ids: [], direction: "先核对并建立家庭应急储备。",
      }],
      three_month_actions: [{
        id: "action_1", risk_id: "emergency", priority: "P0", title: "核对应急资金", reason: "确认家庭安全垫现状。",
        steps: ["核对可随时使用的现金和存款"], amount: null, currency: "CNY", due_in_days: 60, prerequisites: [],
        completion_criteria: "完成可用应急资金清单。", verification_required: "更新现金及存款底账。",
      }],
      missing_information: [{ field: "protection.coverage", why_needed: "影响保障缺口判断。", question: "家庭目前有哪些有效保障？" }],
      disclaimer: "本诊断用于资产整理与规划参考，不构成投资建议。",
    };
    const allocationOutput = {
      data_completeness: "partially_complete", confidence: "MEDIUM", missing_fields: ["protection.coverage"],
      allocation_rationale: "当前资产集中于增长账户，需要同时补足流动性与保障基础。",
      goal_impacts: [{ goal: "购房", account_impacts: { liquidity: "increase", protection: "neutral", goal: "increase", growth: "decrease" }, reason: "购房目标临近，需要提高目标资金确定性。" }],
      accounts: [
        { account: "liquidity", name: "流动账户", target_ratio: 0.25, target_range: [0.2, 0.3], score: 40, summary: "流动资金不足。", positive_factors: [], issues: ["缺少现金储备"], risk_flags: ["LOW_LIQUIDITY"], key_reasons: ["资产集中于权益类"], suggestions: ["先建立应急储备"] },
        { account: "protection", name: "保障账户", target_ratio: 0.1, target_range: [0.05, 0.15], score: 50, summary: "保障信息不足。", positive_factors: [], issues: ["保障信息缺失"], risk_flags: ["INSURANCE_GAP"], key_reasons: ["未录入保障"], suggestions: ["核对现有保障"] },
        { account: "goal", name: "目标账户", target_ratio: 0.35, target_range: [0.3, 0.4], score: 55, summary: "购房资金仍有缺口。", positive_factors: ["目标明确"], issues: ["资金缺口"], risk_flags: ["GOAL_FUNDING_GAP"], key_reasons: ["目标金额较大"], suggestions: ["单独管理目标资金"] },
        { account: "growth", name: "增长账户", target_ratio: 0.3, target_range: [0.25, 0.35], score: 45, summary: "增长资产过度集中。", positive_factors: ["已有增长资产"], issues: ["集中度较高"], risk_flags: ["HIGH_RISK_CONCENTRATION"], key_reasons: ["单项持仓占比较高"], suggestions: ["降低单一资产集中度"] },
      ],
      classification_uncertain: [], important_assumptions: ["未提供保障信息"],
    };
    const fetchMock = vi.fn().mockImplementation(async (_url, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      const system = body.messages[0].content as string;
      const output = system.includes("Schema 名称：four_account_allocation") ? allocationOutput : aiOutput;
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const diagnosisTask = await executeTask(workspaceId, "WEALTH_DIAGNOSIS");
    const diagnosisRequests = () => fetchMock.mock.calls.map((call) => JSON.parse((call[1] as RequestInit).body as string)).filter((body) => body.messages[0].content.includes("Schema 名称：wealth_diagnosis"));
    const requestBody = diagnosisRequests()[0];
    const diagnosisInput = JSON.parse(requestBody.messages[1].content);
    expect(requestBody.messages[0].content).toContain("AI资产管家");
    expect(diagnosisInput).toMatchObject({
      current_state: { source: "CALCULATED" },
      balance_sheet: { source: "USER_CONFIRMED" },
      cash_flow: { source: "CALCULATED" },
      data_quality: { is_stale: false },
    });
    expect((await getExecutionResults(workspaceId)).actions?.items ?? []).toHaveLength(0);
    const action = await db.action.findFirstOrThrow({ where: { workspaceId, diagnosisId: diagnosisTask.resultId } });
    expect(action).toMatchObject({
      diagnosisId: diagnosisTask.resultId, planSetId: null, status: "PROPOSED", amountMinor: null,
      verificationType: "REQUIRES_REVIEW",
    });
    expect(JSON.parse(action.detailsJson!)).toMatchObject({ riskId: "emergency", steps: aiOutput.three_month_actions[0].steps, completionCriteria: aiOutput.three_month_actions[0].completion_criteria });
    const savedDiagnosis = await db.diagnosis.findUniqueOrThrow({ where: { id: diagnosisTask.resultId } });
    expect(new Date(action.dueDate!).getTime() - savedDiagnosis.createdAt.getTime()).toBe(60 * 86400000);
    await transitionAction(workspaceId, action.id, "ACCEPTED");
    await executeTask(workspaceId, "WEALTH_DIAGNOSIS");
    const repeated = (await getExecutionResults(workspaceId)).actions!.items;
    expect(repeated).toHaveLength(1);
    expect(repeated[0]).toMatchObject({ id: action.id, status: "ACCEPTED", dueDate: action.dueDate?.toISOString() });
    const secondInput = JSON.parse(diagnosisRequests()[1].messages[1].content);
    expect(secondInput.previous_diagnosis.unfinished_actions).toMatchObject([{ id: action.id, status: "ACCEPTED" }]);
    await transitionAction(workspaceId, action.id, "DEFERRED", "需要先核对家庭支出");
    await executeTask(workspaceId, "WEALTH_DIAGNOSIS");
    const feedbackInput = JSON.parse(diagnosisRequests()[2].messages[1].content);
    expect(feedbackInput.previous_diagnosis.unfinished_actions[0].user_feedback).toMatchObject([{ source: "USER_CONFIRMED", reason: "需要先核对家庭支出", status: "DEFERRED" }]);
    await transitionAction(workspaceId, action.id, "PROPOSED");
    await transitionAction(workspaceId, action.id, "ACCEPTED");
    await transitionAction(workspaceId, action.id, "USER_MARKED_COMPLETED");
    expect((await getExecutionResults(workspaceId)).actions!.items[0].status).toBe("USER_MARKED_COMPLETED");
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();

    const primaryGoal = await db.goal.findFirstOrThrow({ where: { workspaceId, name: "购房" } });
    const planningTask = await executeTask(workspaceId, "FINANCIAL_PLANNING", primaryGoal.id);
    expect(diagnosisTask.status).toBe("COMPLETED");
    expect(planningTask.status).toBe("COMPLETED");

    const results = await getAgentResults(workspaceId);
    expect(results.diagnosis?.mode).toBe("OPENAI");
    expect(results.diagnosis?.findings.length).toBeGreaterThan(0);
    expect(results.diagnosis?.threeMonthActions).toHaveLength(1);
    expect(results.diagnosis?.fourAccountAssessment.accounts).toHaveLength(4);
    expect(results.diagnosis?.fourAccountAssessment.accounts.find((account: { account: string }) => account.account === "growth")).toMatchObject({ currentRatio: 1, targetRatio: 0.3 });
    expect(results.planning?.plans.map((plan: { key: string }) => plan.key)).toEqual(["A", "B", "C"]);
    expect(results.planning).toMatchObject({ goalId: primaryGoal.id, recommendedPlanKey: "B" });
    expect(results.planning?.isStale).toBe(false);
  });

  it("marks prior results stale after a ledger mutation", async () => {
    await createResource("asset", workspaceId, {
      name: "新增现金",
      type: "CASH",
      currentValueMinor: "100000",
      currency: "CNY",
      liquidityLevel: "T0",
      riskLevel: 1,
      isInvestable: true,
      isAdjustable: true,
      goalId: null,
    });
    const results = await getAgentResults(workspaceId);
    expect(results.diagnosis?.isStale).toBe(true);
    expect(results.planning?.isStale).toBe(true);
  });

  it.each(["ratios", "prose"])("does not persist partial results when four-account %s are invalid", async (invalidField) => {
    vi.stubEnv("OPENAI_BASE_URL", "https://aiping.cn/api/v1");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_MODEL", "test-model");
    vi.stubEnv("ALLOW_AI_IN_TEST", "true");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const before = await db.diagnosis.count({ where: { workspaceId } });
    const actionsBefore = await db.action.count({ where: { workspaceId } });
    const invalidAllocation = {
      data_completeness: "insufficient", confidence: "LOW", missing_fields: [], allocation_rationale: invalidField === "prose" ? "每月盈余2000000分（CALCULATED）" : "信息不足。", goal_impacts: [],
      accounts: ["liquidity", "protection", "goal", "growth"].map((account) => ({ account, name: `${account}账户`, target_ratio: invalidField === "prose" ? 0.25 : 0.2, target_range: [0.1, 0.3], score: 50, summary: "信息不足。", positive_factors: [], issues: [], risk_flags: [], key_reasons: [], suggestions: [] })),
      classification_uncertain: [], important_assumptions: [],
    };
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_url, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      const allocation = body.messages[0].content.includes("Schema 名称：four_account_allocation");
      const output = allocation ? invalidAllocation : {
        overall_assessment: { status: "INCOMPLETE", summary: "信息不足。", positive_foundations: [] },
        risks: [{ id: "data-quality", priority: 1, severity: "MEDIUM", category: "DATA_QUALITY", title: "信息不足", conclusion: "需要补充信息。", evidence: ["当前底账信息不完整"], reason: "缺少必要数据。", impact: "评估置信度较低。", related_goal_ids: [], direction: "补充底账。" }],
        three_month_actions: [{ id: "action_1", risk_id: "data-quality", priority: "P0", title: "补充信息", reason: "完善底账。", steps: ["补充信息"], amount: null, currency: "CNY", due_in_days: 7, prerequisites: [], completion_criteria: "已补充。", verification_required: "新底账。" }],
        missing_information: [], disclaimer: "本诊断用于资产整理与规划参考，不构成投资建议。",
      };
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }), { status: 200 });
    }));
    await expect(executeTask(workspaceId, "WEALTH_DIAGNOSIS")).rejects.toThrow("AI 现状评估结果未通过校验");
    expect(await db.diagnosis.count({ where: { workspaceId } })).toBe(before);
    expect(await db.action.count({ where: { workspaceId } })).toBe(actionsBefore);
    const expectedCode = invalidField === "prose" ? "INVALID_REPORT_PROSE" : "AI_OUTPUT_INVALID";
    expect((await db.agentTask.findFirst({ where: { workspaceId, type: "WEALTH_DIAGNOSIS" }, orderBy: { createdAt: "desc" } }))?.errorCode).toBe(expectedCode);
    expect(errorLog).toHaveBeenCalledWith("Current assessment generation failed", expect.stringContaining(invalidField === "prose" ? expectedCode : "四账户建议比例之和必须为1"));
    errorLog.mockRestore();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("runs scenarios and the action state machine for a selected current plan", async () => {
    await seedCurrentAssessment();
    const goal = await db.goal.findFirstOrThrow({ where: { workspaceId, name: "购房" } });
    await executeTask(workspaceId, "FINANCIAL_PLANNING", goal.id);
    const current = await getAgentResults(workspaceId, goal.id);
    await db.planSet.update({ where: { id: current.planning!.id }, data: { selectedPlanKey: "B" } });

    await executeTask(workspaceId, "SCENARIO_ANALYSIS");
    await executeTask(workspaceId, "ACTION_PLANNING");
    let execution = await getExecutionResults(workspaceId);
    expect(execution.scenario?.scenarios).toHaveLength(3);
    expect(execution.actions?.items.every((item) => item.status !== "PROPOSED")).toBe(true);

    const actionId = (await db.action.findFirstOrThrow({ where: { workspaceId, generationTaskId: execution.actions!.generationTaskId } })).id;
    await transitionAction(workspaceId, actionId, "ACCEPTED");
    await transitionAction(workspaceId, actionId, "USER_MARKED_COMPLETED");
    execution = await getExecutionResults(workspaceId);
    expect(["USER_MARKED_COMPLETED", "VERIFIED_COMPLETED"]).toContain(execution.actions!.items[0].status);
  });

  it("plans for an explicitly bound non-primary goal and rejects another goal's selected plan", async () => {
    const secondary = await db.goal.create({ data: { workspaceId, name: "进修", type: "OTHER", targetAmountMinor: 1_000_000n, targetDate: new Date("2029-09-16"), priority: 3 } });
    await db.workspace.update({ where: { id: workspaceId }, data: { portfolioRevision: { increment: 1 } } });
    await seedCurrentAssessment();
    await executeTask(workspaceId, "FINANCIAL_PLANNING", secondary.id);
    const results = await getAgentResults(workspaceId, secondary.id);
    expect(results.planning?.goalId).toBe(secondary.id);
    expect(results.planning?.plans.every((plan: { goalId: string }) => plan.goalId === secondary.id)).toBe(true);
    await db.planSet.update({ where: { id: results.planning!.id }, data: { selectedPlanKey: "A" } });
    const primary = await db.goal.findFirstOrThrow({ where: { workspaceId, name: "购房" } });
    await expect(executeTask(workspaceId, "SCENARIO_ANALYSIS", primary.id)).rejects.toThrow("所选方案已经过期");
    await expect(executeTask(workspaceId, "ACTION_PLANNING", primary.id)).rejects.toThrow("所选方案已经过期");
    await expect(executeTask(workspaceId, "FINANCIAL_PLANNING", "missing-goal")).rejects.toThrow("关联目标已删除");
    await expect(executeTask(workspaceId, "FINANCIAL_PLANNING")).rejects.toThrow("请先选择需要规划的人生目标");
  });

  it("marks a rejected task failed without saving a planning result", async () => {
    const before = await db.planSet.count({ where: { workspaceId } });
    await expect(executeTask(workspaceId, "FINANCIAL_PLANNING")).rejects.toThrow("请先选择需要规划的人生目标");
    const task = await db.agentTask.findFirstOrThrow({ where: { workspaceId, type: "FINANCIAL_PLANNING" }, orderBy: { createdAt: "desc" } });
    expect(task).toMatchObject({ status: "FAILED", errorCode: "HTTP_422", resultId: null });
    expect(task.completedAt).not.toBeNull();
    expect(await db.planSet.count({ where: { workspaceId } })).toBe(before);
  });

  it("persists a structured future planning report and marks it stale with the ledger", async () => {
    const goal = await db.goal.findFirstOrThrow({ where: { workspaceId, name: "购房" } });
    await seedCurrentAssessment();
    await executeTask(workspaceId, "FINANCIAL_PLANNING", goal.id);
    const planning = (await getAgentResults(workspaceId, goal.id)).planning!;
    await db.planSet.update({ where: { id: planning.id }, data: { selectedPlanKey: "B" } });
    vi.stubEnv("OPENAI_BASE_URL", "https://aiping.cn/api/v1");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_MODEL", "test-model");
    vi.stubEnv("ALLOW_AI_IN_TEST", "true");
    const report = {
      information_completeness: "BASIC",
      summary: "当前可按平衡方案推进，但需要先确认购房城市和交易成本。",
      assumptions: ["暂不计投资收益"],
      risks: [{ id: "transaction_cost", title: "交易成本尚未确认", reason: "当前底账没有交易费用", impact: "实际资金需求可能高于目标金额", direction: "核对当地政策和必要费用" }],
      actions: [{
        id: "confirm_budget", priority: "P0", title: "确认购房预算范围", reason: "预算是后续资金安排的基础",
        steps: ["确认购房城市", "列出首付和交易费用"], amount: null, currency: "CNY", due_in_days: 14,
        prerequisites: [], completion_criteria: "形成书面预算范围", verification_required: "更新目标金额和已准备金额",
      }],
      missing_information: [{ field: "home_city", why_needed: "影响购房政策和费用", question: "计划在哪个城市购房？" }],
      disclaimer: "本规划用于资产整理与目标规划参考，不构成投资建议。",
    };
    const calculationPlan = { formula_ids: ["goal_funding", "emergency_coverage"], custom_steps: [] };
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_url, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      const content = body.messages[0].content as string;
      const output = content.includes("Schema 名称：future_planning_calculation_plan") ? JSON.stringify(calculationPlan) : JSON.stringify(report);
      return new Response(JSON.stringify({ choices: [{ message: { content: output } }] }), { status: 200 });
    }));
    const task = await executeTask(workspaceId, "FUTURE_PLANNING_ACTION_REPORT", goal.id);
    expect("report" in task && task.report).toEqual(report);
    const results = await getAgentResults(workspaceId, goal.id);
    expect(results.futurePlanning).toMatchObject({ goalId: goal.id, planSetId: planning.id, planKey: "B", isStale: false, informationCompleteness: "BASIC", report });
    expect(results.futurePlanning?.reportText).toContain("未来规划行动清单");
    await createResource("asset", workspaceId, {
      name: "未来规划测试现金", type: "CASH", currentValueMinor: "1", currency: "CNY", liquidityLevel: "T0", riskLevel: 1, isInvestable: true, isAdjustable: true, goalId: null,
    });
    expect((await getAgentResults(workspaceId, goal.id)).futurePlanning?.isStale).toBe(true);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
});
