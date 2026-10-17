import type { CalculatorFact, CalculatorResult, CalculatorStep } from "./future-planning-calculator";
import { executeCalculator } from "./future-planning-calculator";

export type FormulaTemplate = { id: "goal_funding" | "emergency_coverage" | "resignation_reserve" | "home_initial_fund"; label: string; description: string; requiredFactIds: string[]; steps: CalculatorStep[] };
const fact = (id: string) => ({ type: "FACT" as const, id });
const step = (id: string) => ({ type: "STEP" as const, id });
const literal = (value: string, unit: "CNY_MINOR" | "COUNT" | "MONTHS" | "RATIO" | "DIMENSIONLESS") => ({ type: "LITERAL" as const, value, unit });

export const formulaTemplates: FormulaTemplate[] = [
  { id: "goal_funding", label: "目标资金筹备", description: "计算目标缺口、每月需准备金额和月度资金差额。", requiredFactIds: ["target_amount_minor", "prepared_amount_minor", "remaining_months", "monthly_saving_capacity_minor"], steps: [
    { id: "goal_gap_raw", label: "目标资金差额", operation: "SUBTRACT", operands: [fact("target_amount_minor"), fact("prepared_amount_minor")], unit: "CNY_MINOR" },
    { id: "goal_gap", label: "目标资金缺口", operation: "MAX", operands: [step("goal_gap_raw"), literal("0", "CNY_MINOR")], unit: "CNY_MINOR" },
    { id: "monthly_required", label: "每月需准备金额", operation: "DIVIDE", operands: [step("goal_gap"), fact("remaining_months")], unit: "CNY_MINOR", rounding: "CEIL", decimalPlaces: 0 },
    { id: "monthly_gap", label: "每月资金差额", operation: "SUBTRACT", operands: [step("monthly_required"), fact("monthly_saving_capacity_minor")], unit: "CNY_MINOR" },
  ] },
  { id: "emergency_coverage", label: "生活费覆盖月数", description: "用流动储备除以每月固定支出与债务还款。", requiredFactIds: ["living_reserve_minor", "monthly_recurring_outflow_minor"], steps: [
    { id: "living_coverage_months", label: "生活费覆盖月数", operation: "DIVIDE", operands: [fact("living_reserve_minor"), fact("monthly_recurring_outflow_minor")], unit: "MONTHS", rounding: "HALF_UP", decimalPlaces: 1 },
  ] },
  { id: "resignation_reserve", label: "辞职或创业准备金", description: "根据无收入期、启动资金和用户确认的安全缓冲测算准备金。", requiredFactIds: ["monthly_recurring_outflow_minor", "no_income_months", "startup_capital_minor", "safety_buffer_months"], steps: [
    { id: "reserve_months", label: "需覆盖月数", operation: "ADD", operands: [fact("no_income_months"), fact("safety_buffer_months")], unit: "COUNT" },
    { id: "living_reserve_need", label: "生活储备需求", operation: "MULTIPLY", operands: [fact("monthly_recurring_outflow_minor"), step("reserve_months")], unit: "CNY_MINOR" },
    { id: "resignation_reserve_need", label: "辞职或创业准备金", operation: "ADD", operands: [step("living_reserve_need"), fact("startup_capital_minor")], unit: "CNY_MINOR" },
  ] },
  { id: "home_initial_fund", label: "购房初始资金", description: "汇总首付、税费、中介费、搬家装修预算和月供缓冲。", requiredFactIds: ["down_payment_minor", "taxes_minor", "agent_fee_minor", "moving_budget_minor", "mortgage_buffer_minor"], steps: [
    { id: "home_initial_fund", label: "购房初始资金", operation: "ADD", operands: [fact("down_payment_minor"), fact("taxes_minor"), fact("agent_fee_minor"), fact("moving_budget_minor"), fact("mortgage_buffer_minor")], unit: "CNY_MINOR" },
  ] },
];

export const formulaTemplateIds = formulaTemplates.map((template) => template.id);

export function formulaTemplateCatalog() { return formulaTemplates.map(({ id, label, description, requiredFactIds }) => ({ id, label, description, required_fact_ids: requiredFactIds })); }

export function executeFormulaTemplates(facts: CalculatorFact[], templateIds: string[], customSteps: CalculatorStep[] = []) {
  const available = new Set(facts.map((fact) => fact.id));
  const selected = formulaTemplates.filter((template) => templateIds.includes(template.id));
  const missingInputs = selected.flatMap((template) => template.requiredFactIds.filter((id) => !available.has(id)).map((factId) => ({ templateId: template.id, factId })));
  const runnable = selected.filter((template) => template.requiredFactIds.every((id) => available.has(id)));
  const calculations = [...runnable.flatMap((template) => template.steps), ...customSteps];
  return { appliedTemplateIds: runnable.map((template) => template.id), missingInputs, calculations: calculations.length ? executeCalculator(facts, calculations) : [] as CalculatorResult[] };
}
