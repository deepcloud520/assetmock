import { z } from "zod";
import type { AgentTask } from "@prisma/client";
import { buildPlanCandidates, recommendPlanKey } from "@/domain/planning";
import type { PlanCandidate } from "@/domain/planning";
import { buildActionDrafts, runStressScenarios } from "@/domain/execution";
import { db } from "@/lib/db";
import { getWealthCalculation } from "./calculation";
import { formatFuturePlanningReport, runDiagnosisNarrative, runFuturePlanningReport, runPlanningNarrative, selectFuturePlanningCalculations } from "./agent-runtime";
import { runFourAccountAssessment } from "./four-account-assessment";
import { getPromptOverrides, type PromptOverrides } from "./prompt-settings";
import { ApiError } from "./portfolio";
import type { CalculatorFact } from "@/domain/future-planning-calculator";
import { executeFormulaTemplates, formulaTemplateCatalog } from "@/domain/future-planning-formulas";

export const taskTypeSchema = z.enum(["WEALTH_DIAGNOSIS", "FINANCIAL_PLANNING", "SCENARIO_ANALYSIS", "ACTION_PLANNING", "FUTURE_PLANNING_ACTION_REPORT"]);
export type TaskType = z.infer<typeof taskTypeSchema>;

async function assertCurrentRevision(workspaceId: string, sourceRevision: number) {
  const current = await db.workspace.findUnique({ where: { id: workspaceId }, select: { portfolioRevision: true } });
  if (!current || current.portfolioRevision !== sourceRevision) throw new ApiError("任务执行期间底账已变化，请重新生成", 409);
}

async function assertCurrentAssessment(workspaceId: string, sourceRevision: number) {
  const diagnosis = await db.diagnosis.findFirst({
    where: { workspaceId, sourceRevision },
    orderBy: { createdAt: "desc" },
    select: { resultJson: true },
  });
  const result = diagnosis ? JSON.parse(diagnosis.resultJson) as { fourAccountAssessment?: unknown } : null;
  if (!result?.fourAccountAssessment) throw new ApiError("请先按当前底账完成现状评估", 422);
}

async function buildDiagnosisInput(workspaceId: string, calculation: Awaited<ReturnType<typeof getWealthCalculation>>) {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      profile: true,
      assets: { where: { deletedAt: null } },
      liabilities: { where: { deletedAt: null } },
      goals: { where: { deletedAt: null } },
      diagnoses: { orderBy: { createdAt: "desc" }, take: 1 },
      actions: { where: { status: { not: "VERIFIED_COMPLETED" } }, orderBy: { createdAt: "asc" }, include: { feedback: { orderBy: { createdAt: "desc" } } } },
    },
  });
  if (!workspace) throw new ApiError("工作区不存在", 404);

  const goalMetrics = new Map(calculation.goalHealth.map((goal) => [goal.id, goal]));
  const missingFields = [
    ...(!workspace.ledgerConfirmedAt ? ["balance_sheet.confirmed"] : []),
    ...(!workspace.profile?.age ? ["profile.age"] : []),
    ...(BigInt(calculation.cashflow.monthlyIncomeMinor) <= 0n ? ["cash_flow.monthly_income"] : []),
    ...(!workspace.goals.length ? ["goals"] : []),
    "protection.coverage",
    "asset_exposure.region",
    "asset_exposure.industry",
    "profile.maximum_tolerable_loss",
  ];
  const status = calculation.completeness < 60 || calculation.healthScore === null
    ? "INCOMPLETE"
    : calculation.healthScore < 45 ? "RISK" : calculation.healthScore < 80 ? "ATTENTION" : "HEALTHY";
  const previous = workspace.diagnoses[0];

  return {
    current_state: {
      status,
      source: "CALCULATED",
      source_revision: calculation.sourceRevision,
      formula_version: calculation.formulaVersion,
      health_score: calculation.healthScore,
      data_completeness: calculation.completeness,
    },
    profile: workspace.profile ? {
      source: "USER_CONFIRMED",
      age: workspace.profile.age,
      family_stage: workspace.profile.familyStatus,
      risk_tolerance: workspace.profile.riskLevel,
      base_currency: workspace.profile.baseCurrency,
    } : null,
    balance_sheet: {
      source: "USER_CONFIRMED",
      confirmed: Boolean(workspace.ledgerConfirmedAt),
      money_unit: "CNY_MINOR",
      total_assets_minor: calculation.summary.totalAssetsMinor,
      total_liabilities_minor: calculation.summary.totalLiabilitiesMinor,
      net_worth_minor: calculation.summary.netWorthMinor,
      assets: workspace.assets.map((asset) => ({
        id: asset.id, name: asset.name, type: asset.type, amount_minor: asset.currentValueMinor.toString(),
        currency: asset.currency, liquidity: asset.liquidityLevel, risk_level: asset.riskLevel,
        adjustable: asset.isAdjustable, goal_id: asset.goalId, source: "USER_CONFIRMED",
      })),
      liabilities: workspace.liabilities.map((liability) => ({
        id: liability.id, name: liability.name, type: liability.type,
        outstanding_minor: liability.outstandingBalanceMinor.toString(), monthly_payment_minor: liability.monthlyPaymentMinor.toString(),
        remaining_months: liability.remainingMonths, source: "USER_CONFIRMED",
      })),
    },
    cash_flow: {
      source: "CALCULATED", money_unit: "CNY_MINOR",
      monthly_income_minor: calculation.cashflow.monthlyIncomeMinor,
      monthly_expenses_minor: calculation.cashflow.monthlyExpensesMinor,
      monthly_debt_payments_minor: calculation.cashflow.monthlyDebtPaymentsMinor,
      monthly_surplus_minor: calculation.cashflow.monthlySurplusMinor,
      surplus_rate: calculation.cashflow.surplusRate,
    },
    account_allocation: { source: "CALCULATED", money_unit: "CNY_MINOR", ...calculation.fourAccounts },
    calculated_metrics: {
      source: "CALCULATED",
      safety: calculation.safety,
      concentration: calculation.concentration,
      liquidity: calculation.liquidity,
      dimensions: calculation.dimensions,
    },
    rule_findings: [
      ...calculation.risks.map((risk) => ({ ...risk, source: "CALCULATED" })),
      ...(missingFields.length ? [{
        id: "data-quality", title: "部分诊断信息尚未补全",
        evidence: `缺失字段：${missingFields.join("、")}`, status: "ATTENTION", priority: 99, source: "CALCULATED",
      }] : []),
    ],
    goals: workspace.goals.map((goal) => {
      const metric = goalMetrics.get(goal.id);
      return {
        id: goal.id, name: goal.name, type: goal.type, source: "USER_CONFIRMED",
        target_amount_minor: goal.targetAmountMinor.toString(), target_date: goal.targetDate.toISOString(),
        prepared_amount_minor: goal.preparedAmountMinor.toString(), monthly_contribution_minor: goal.monthlyContributionMinor.toString(),
        priority: goal.priority, flexible: goal.isFlexible,
        calculated: metric ? { source: "CALCULATED", coverage_ratio: metric.coverageRatio, gap_minor: metric.gapMinor, months_remaining: metric.monthsRemaining } : null,
      };
    }),
    adjustable_amounts: [
      ...workspace.assets.filter((asset) => asset.isAdjustable && asset.currentValueMinor > 0n).map((asset) => ({ id: asset.id, field: "asset.current_value", amount_minor: asset.currentValueMinor.toString(), source: "USER_CONFIRMED" })),
      ...workspace.goals.filter((goal) => goal.monthlyContributionMinor > 0n).map((goal) => ({ id: goal.id, field: "goal.monthly_contribution", amount_minor: goal.monthlyContributionMinor.toString(), source: "USER_CONFIRMED" })),
    ],
    data_quality: {
      source: "CALCULATED", missing_fields: missingFields, data_time: calculation.calculatedAt,
      is_stale: false, source_revision: calculation.sourceRevision,
    },
    previous_diagnosis: previous ? {
      source: "AI_INFERRED", is_stale: previous.sourceRevision !== calculation.sourceRevision,
      source_revision: previous.sourceRevision, result: JSON.parse(previous.resultJson),
      unfinished_actions: workspace.actions.map((action) => ({
        id: action.id, title: action.title, status: action.status, source_revision: action.sourceRevision,
        due_date: action.dueDate, amount_minor: action.amountMinor?.toString() ?? null,
        details: action.detailsJson ? JSON.parse(action.detailsJson) : null,
        user_feedback: action.feedback.map((item) => ({ source: "USER_CONFIRMED", reason: item.reason, status: item.toStatus, recorded_at: item.createdAt })),
      })),
    } : null,
  };
}

async function buildFuturePlanningInput(
  workspaceId: string,
  calculation: Awaited<ReturnType<typeof getWealthCalculation>>,
  goalId: string | undefined,
  selectedPlan: PlanCandidate,
) {
  const diagnosisInput = await buildDiagnosisInput(workspaceId, calculation);
  const goals = diagnosisInput.goals as Array<Record<string, unknown>>;
  const goal = goalId ? goals.find((item) => item.id === goalId) ?? null : null;
  const goalCalculation = goal?.calculated as { gap_minor?: string; months_remaining?: number | null } | null | undefined;
  const facts: CalculatorFact[] = [
    ...(typeof goal?.target_amount_minor === "string" ? [{ id: "target_amount_minor", label: "目标金额", value: goal.target_amount_minor, unit: "CNY_MINOR" as const, source: "USER_CONFIRMED" as const }] : []),
    ...(typeof goal?.prepared_amount_minor === "string" ? [{ id: "prepared_amount_minor", label: "已准备金额", value: goal.prepared_amount_minor, unit: "CNY_MINOR" as const, source: "USER_CONFIRMED" as const }] : []),
    ...(goalCalculation?.months_remaining && goalCalculation.months_remaining > 0 ? [{ id: "remaining_months", label: "目标剩余月数", value: String(goalCalculation.months_remaining), unit: "COUNT" as const, source: "CALCULATED" as const }] : []),
    { id: "monthly_saving_capacity_minor", label: "每月可储蓄能力", value: calculation.cashflow.monthlySurplusMinor, unit: "CNY_MINOR", source: "CALCULATED" },
    { id: "monthly_recurring_outflow_minor", label: "每月固定支出与债务还款", value: calculation.cashflow.monthlyExpensesMinor, unit: "CNY_MINOR", source: "CALCULATED" },
    { id: "living_reserve_minor", label: "可用于生活的流动储备", value: calculation.fourAccounts.liquidityMinor, unit: "CNY_MINOR", source: "CALCULATED" },
    { id: "monthly_income_minor", label: "每月收入", value: calculation.cashflow.monthlyIncomeMinor, unit: "CNY_MINOR", source: "CALCULATED" },
  ];
  return {
    user_request: goal ? `围绕“${goal.name}”生成未来规划行动清单。` : "基于当前财务情况生成未来规划行动清单。",
    bound_goal: goal,
    selected_plan: selectedPlan,
    financial_context: diagnosisInput,
    calculator_facts: facts,
    formula_templates: formulaTemplateCatalog(),
    capabilities: { calculator: true, web_search: false, historical_reports: true },
  };
}

export async function executeTask(
  workspaceId: string,
  type: TaskType,
  goalId?: string,
) {
  const calculation = await getWealthCalculation(workspaceId);
  const prompts = await getPromptOverrides(workspaceId);
  const task = await db.agentTask.create({
    data: { workspaceId, type, sourceRevision: calculation.sourceRevision },
  });

  try {
    if (type === "WEALTH_DIAGNOSIS") return await executeDiagnosis(task, calculation, prompts);
    if (type === "FUTURE_PLANNING_ACTION_REPORT") return await executeFuturePlanningReport(task, calculation, goalId, prompts);
    return await executePlanTask(task, calculation, goalId, prompts);
  } catch (error) {
    await db.agentTask.updateMany({ where: { id: task.id, status: "PROCESSING" }, data: { status: "FAILED", errorCode: error instanceof ApiError ? `HTTP_${error.status}` : "EXECUTION_FAILED", completedAt: new Date() } });
    throw error;
  }
}

type Calculation = Awaited<ReturnType<typeof getWealthCalculation>>;

async function executeDiagnosis(task: AgentTask, calculation: Calculation, prompts: PromptOverrides) {
  const { workspaceId } = task;
  const diagnosisInput = await buildDiagnosisInput(workspaceId, calculation);
  let narrative: Awaited<ReturnType<typeof runDiagnosisNarrative>>;
  let fourAccount: Awaited<ReturnType<typeof runFourAccountAssessment>>;
  try {
    [narrative, fourAccount] = await Promise.all([
      runDiagnosisNarrative(diagnosisInput, prompts.diagnosis),
      runFourAccountAssessment({ ...diagnosisInput, previous_diagnosis: undefined, adjustable_amounts: undefined }, calculation, prompts.fourAccount),
    ]);
  } catch (error) {
    console.error("Current assessment generation failed", error instanceof Error ? error.message : "unknown");
    const errorCode = error instanceof z.ZodError
      ? "AI_OUTPUT_INVALID"
      : error instanceof Error ? error.message.match(/^[A-Z][A-Z0-9_]+/)?.[0] ?? error.name : "UNKNOWN";
    await db.agentTask.update({ where: { id: task.id }, data: { status: "FAILED", errorCode, completedAt: new Date() } });
    throw new ApiError(errorCode === "AI_OUTPUT_INVALID" || errorCode.endsWith("INVALID_JSON") || errorCode.startsWith("INVALID_")
      ? "AI 现状评估结果未通过校验，请重新评估"
      : "AI 现状评估暂时不可用，请稍后重试", 503);
  }
  const result = {
    healthScore: calculation.healthScore,
    dimensions: calculation.dimensions,
    summary: narrative.output.overall_assessment.summary,
    overallAssessment: narrative.output.overall_assessment,
    findings: narrative.output.risks,
    threeMonthActions: narrative.output.three_month_actions,
    missingInformation: narrative.output.missing_information,
    disclaimer: narrative.output.disclaimer,
    fourAccountAssessment: fourAccount.output,
  };
  await assertCurrentRevision(workspaceId, calculation.sourceRevision);
  const diagnosis = await db.$transaction(async (tx) => {
    const current = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    if (current.portfolioRevision !== calculation.sourceRevision) throw new ApiError("任务执行期间底账已变化，请重新生成", 409);
    const saved = await tx.diagnosis.create({
      data: { workspaceId, sourceRevision: calculation.sourceRevision, promptVersion: narrative.promptVersion, model: narrative.model, mode: narrative.mode, resultJson: JSON.stringify(result) },
    });
    const existing = await tx.action.findMany({ where: { workspaceId, sourceRevision: calculation.sourceRevision, kind: "DIAGNOSIS" } });
    for (const action of narrative.output.three_month_actions) {
      // Re-running an unchanged diagnosis must not reset accepted actions or their deadlines.
      if (existing.some((item) => item.title === action.title && item.detailsJson && JSON.parse(item.detailsJson).riskId === action.risk_id)) continue;
      const dueDate = new Date(saved.createdAt);
      dueDate.setUTCDate(dueDate.getUTCDate() + action.due_in_days);
      const created = await tx.action.create({ data: {
        workspaceId, generationTaskId: task.id, diagnosisId: saved.id,
        sourceRevision: calculation.sourceRevision, kind: "DIAGNOSIS",
        title: action.title, reason: action.reason,
        amountMinor: action.amount === null ? null : BigInt(action.amount),
        priority: { P0: 1, P1: 2, P2: 3 }[action.priority], dueDate,
        verificationType: "REQUIRES_REVIEW",
        detailsJson: JSON.stringify({ riskId: action.risk_id, sourceActionId: action.id, steps: action.steps, prerequisites: action.prerequisites, completionCriteria: action.completion_criteria, verificationRequired: action.verification_required }),
      } });
      existing.push(created);
    }
    await tx.agentTask.update({ where: { id: task.id }, data: { status: "COMPLETED", resultId: saved.id, completedAt: new Date() } });
    return saved;
  });
  return { ...task, status: "COMPLETED", resultId: diagnosis.id };
}

async function executeFuturePlanningReport(task: AgentTask, calculation: Calculation, goalId: string | undefined, prompts: PromptOverrides) {
  const { workspaceId } = task;
  if (!goalId) throw new ApiError("请先选择需要规划的人生目标", 422);
  await assertCurrentAssessment(workspaceId, calculation.sourceRevision);
  const planSet = await db.planSet.findFirst({ where: { workspaceId, goalId }, orderBy: { createdAt: "desc" } });
  if (!planSet?.selectedPlanKey) throw new ApiError("请先选择一套未来规划方案", 422);
  if (planSet.sourceRevision !== calculation.sourceRevision) throw new ApiError("所选方案已经过期，请重新生成并选择", 409);
  const planResult = JSON.parse(planSet.resultJson) as { plans: PlanCandidate[] };
  const selectedPlan = planResult.plans.find((plan) => plan.key === planSet.selectedPlanKey);
  if (!selectedPlan || selectedPlan.goalId !== goalId) throw new ApiError("所选方案与当前目标不一致，请重新选择", 422);
  const input = await buildFuturePlanningInput(workspaceId, calculation, goalId, selectedPlan);
  let narrative: Awaited<ReturnType<typeof runFuturePlanningReport>>;
  try {
    const selection = await selectFuturePlanningCalculations({
      user_request: input.user_request,
      calculator_facts: input.calculator_facts,
      formula_templates: input.formula_templates,
    });
    const calculatorResult = executeFormulaTemplates(input.calculator_facts, selection.formulaIds, selection.customSteps);
    narrative = await runFuturePlanningReport({ ...input, calculator_selection: selection, calculator_result: calculatorResult }, prompts.actionReport);
  } catch (error) {
    console.error("Future planning report generation failed", error instanceof Error ? error.message : "unknown");
    throw new ApiError("未来规划行动清单暂时不可用，请检查模型配置或稍后重试", 503);
  }
  await assertCurrentRevision(workspaceId, calculation.sourceRevision);
  const saved = await db.$transaction(async (tx) => {
    const current = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    if (current.portfolioRevision !== calculation.sourceRevision) throw new ApiError("任务执行期间底账已变化，请重新生成", 409);
    const report = await tx.futurePlanningReport.create({
      data: {
        workspaceId,
        goalId,
        planSetId: planSet.id,
        planKey: selectedPlan.key,
        sourceRevision: calculation.sourceRevision,
        promptVersion: narrative.promptVersion,
        model: narrative.model,
        mode: narrative.mode,
        informationCompleteness: narrative.output.information_completeness,
        resultText: formatFuturePlanningReport(narrative.output),
        resultJson: JSON.stringify(narrative.output),
      },
    });
    await tx.agentTask.update({ where: { id: task.id }, data: { status: "COMPLETED", resultId: report.id, completedAt: new Date() } });
    return report;
  });
  return {
    ...task,
    status: "COMPLETED",
    resultId: saved.id,
    reportText: saved.resultText,
    informationCompleteness: saved.informationCompleteness,
    report: narrative.output,
  };
}

async function executePlanTask(task: AgentTask, calculation: Calculation, goalId: string | undefined, prompts: PromptOverrides) {
  const { workspaceId, type } = task;
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    include: { profile: true, goals: { where: { deletedAt: null } }, assets: { where: { deletedAt: null } } },
  });
  if (!workspace) throw new ApiError("工作区不存在", 404);
  const planningGoals = goalId ? workspace.goals.filter((goal) => goal.id === goalId) : workspace.goals;
  if (goalId && !planningGoals.length) throw new ApiError("关联目标已删除或不属于当前工作区，请重新确认目标", 422);
  if (type === "FINANCIAL_PLANNING") {
    if (!goalId) throw new ApiError("请先选择需要规划的人生目标", 422);
    await assertCurrentAssessment(workspaceId, calculation.sourceRevision);
    const candidates = buildPlanCandidates(calculation, planningGoals);
    if (candidates.length !== 3) throw new ApiError("当前目标信息不足，无法生成方案", 422);
    const recommendedPlanKey = recommendPlanKey(candidates, workspace.profile?.riskLevel ?? "BALANCED");
    const narrative = await runPlanningNarrative(candidates, prompts.planning);
    const narrativeByKey = new Map(narrative.output.plans.map((plan) => [plan.key, plan]));
    const result = { goalId: candidates[0].goalId, goalName: candidates[0].goalName, recommendedPlanKey, plans: candidates.map((plan) => ({ ...plan, ...narrativeByKey.get(plan.key) })) };
    await assertCurrentRevision(workspaceId, calculation.sourceRevision);
    const planSet = await db.$transaction(async (tx) => {
      const saved = await tx.planSet.create({
        data: { workspaceId, goalId, sourceRevision: calculation.sourceRevision, promptVersion: narrative.promptVersion, model: narrative.model, mode: narrative.mode, recommendedPlanKey, resultJson: JSON.stringify(result) },
      });
      await tx.agentTask.update({ where: { id: task.id }, data: { status: "COMPLETED", resultId: saved.id, completedAt: new Date() } });
      return saved;
    });
    return { ...task, status: "COMPLETED", resultId: planSet.id };
  }

  const { planSet, selectedPlan } = await getExecutionPlan(workspaceId, calculation.sourceRevision, goalId);

  if (type === "SCENARIO_ANALYSIS") {
    const scenarios = runStressScenarios(calculation, selectedPlan, workspace.assets);
    const saved = await db.$transaction(async (tx) => {
      const result = await tx.scenarioResult.create({ data: { workspaceId, planSetId: planSet.id, planKey: selectedPlan.key, sourceRevision: calculation.sourceRevision, resultJson: JSON.stringify({ planName: selectedPlan.name, goalName: selectedPlan.goalName, scenarios }) } });
      await tx.agentTask.update({ where: { id: task.id }, data: { status: "COMPLETED", resultId: result.id, completedAt: new Date() } });
      return result;
    });
    return { ...task, status: "COMPLETED", resultId: saved.id };
  }

  const drafts = buildActionDrafts(calculation, selectedPlan);
  await db.$transaction(async (tx) => {
    if (drafts.length) await tx.action.createMany({ data: drafts.map((draft) => ({ workspaceId, generationTaskId: task.id, planSetId: planSet.id, planKey: selectedPlan.key, sourceRevision: calculation.sourceRevision, kind: draft.kind, title: draft.title, reason: draft.reason, amountMinor: draft.amountMinor === null ? null : BigInt(draft.amountMinor), priority: draft.priority, dueDate: new Date(draft.dueDate), verificationType: draft.verificationType, productConditionsJson: draft.productConditions ? JSON.stringify(draft.productConditions) : null })) });
    await tx.agentTask.update({ where: { id: task.id }, data: { status: "COMPLETED", resultId: task.id, completedAt: new Date() } });
  });
  return { ...task, status: "COMPLETED", resultId: task.id };
}

async function getExecutionPlan(workspaceId: string, sourceRevision: number, goalId: string | undefined) {
  const planSet = await db.planSet.findFirst({ where: { workspaceId, ...(goalId ? { goalId } : {}) }, orderBy: { createdAt: "desc" } });
  if (!planSet?.selectedPlanKey) throw new ApiError("请先生成并选定一套未来规划", 422);
  if (planSet.sourceRevision !== sourceRevision) throw new ApiError("所选方案已经过期，请重新生成并选择", 409);
  const planResult = JSON.parse(planSet.resultJson) as { plans: PlanCandidate[] };
  const selectedPlan = planResult.plans.find((plan) => plan.key === planSet.selectedPlanKey);
  if (!selectedPlan) throw new ApiError("所选方案数据不完整", 422);
  if (goalId && selectedPlan.goalId !== goalId) throw new ApiError("当前所选方案不属于本任务目标，请为关联目标生成并选择方案", 422);
  return { planSet, selectedPlan };
}

export async function getAgentResults(workspaceId: string, goalId?: string) {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      portfolioRevision: true,
      diagnoses: { orderBy: { createdAt: "desc" }, take: 1 },
      planSets: { where: goalId ? { goalId } : undefined, orderBy: { createdAt: "desc" }, take: 1 },
      futurePlanningReports: { where: goalId ? { goalId } : undefined, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!workspace) throw new ApiError("工作区不存在，请刷新页面重试", 404);
  const diagnosis = workspace.diagnoses.find((r) => JSON.parse(r.resultJson).status !== "REDACTED");
  const planSet = workspace.planSets.find((r) => JSON.parse(r.resultJson).status !== "REDACTED");
  const futurePlanning = workspace.futurePlanningReports.find((r) => !r.resultJson || JSON.parse(r.resultJson).status !== "REDACTED");
  return {
    diagnosis: diagnosis ? { id: diagnosis.id, sourceRevision: diagnosis.sourceRevision, isStale: diagnosis.sourceRevision !== workspace.portfolioRevision, mode: diagnosis.mode, model: diagnosis.model, createdAt: diagnosis.createdAt, ...JSON.parse(diagnosis.resultJson) } : null,
    planning: planSet ? { id: planSet.id, sourceRevision: planSet.sourceRevision, isStale: planSet.sourceRevision !== workspace.portfolioRevision, mode: planSet.mode, model: planSet.model, selectedPlanKey: planSet.selectedPlanKey, recommendedPlanKey: planSet.recommendedPlanKey, createdAt: planSet.createdAt, ...JSON.parse(planSet.resultJson) } : null,
    futurePlanning: futurePlanning ? {
      id: futurePlanning.id,
      goalId: futurePlanning.goalId,
      planSetId: futurePlanning.planSetId,
      planKey: futurePlanning.planKey,
      sourceRevision: futurePlanning.sourceRevision,
      isStale: futurePlanning.sourceRevision !== workspace.portfolioRevision,
      mode: futurePlanning.mode,
      model: futurePlanning.model,
      promptVersion: futurePlanning.promptVersion,
      informationCompleteness: futurePlanning.informationCompleteness,
      reportText: futurePlanning.resultText,
      report: futurePlanning.resultJson ? JSON.parse(futurePlanning.resultJson) : null,
      adoptedAt: futurePlanning.adoptedAt,
      createdAt: futurePlanning.createdAt,
    } : null,
  };
}
