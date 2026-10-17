import { describe, expect, it } from "vitest";
import { calculateWealth } from "./calculator";
import { buildPlanCandidates } from "./planning";
import { buildActionDrafts, runStressScenarios } from "./execution";

const goal = { id: "goal", name: "购房", type: "HOME_PURCHASE", targetAmountMinor: "10000000", targetDate: "2028-09-14", preparedAmountMinor: "0", monthlyContributionMinor: "100000", priority: 1, isFlexible: false };
const assets = [
  { id: "cash", name: "现金", type: "CASH", currentValueMinor: "1000000", liquidityLevel: "T0", riskLevel: 1, goalId: null },
  { id: "equity", name: "目标基金", type: "EQUITY_FUND", currentValueMinor: "3000000", liquidityLevel: "D7", riskLevel: 4, goalId: "goal" },
];
const calculation = calculateWealth({ revision: 1, asOf: "2026-09-14", profile: { riskLevel: "BALANCED", stableMonthlyIncomeMinor: "1500000", otherMonthlyIncomeMinor: "0", rentExpenseMinor: "300000", transportExpenseMinor: "100000", essentialExpenseMinor: "400000" }, assets, liabilities: [], goals: [goal] });
const plan = buildPlanCandidates(calculation, [goal])[1];

describe("scenario and action rules", () => {
  it("runs all three fixed stress scenarios with deterministic impacts", () => {
    const scenarios = runStressScenarios(calculation, plan, assets);
    expect(scenarios.map((scenario) => scenario.key)).toEqual(["MARKET_DROP_30", "INCOME_INTERRUPTION_3M", "GOAL_COST_INCREASE_10"]);
    expect(BigInt(scenarios[0].netWorthBeforeMinor) - BigInt(scenarios[0].netWorthAfterMinor)).toBe(900_000n);
    expect(scenarios[2].goalCoverageAfter).toBeLessThan(scenarios[2].goalCoverageBefore);
  });

  it("creates actionable tasks and extracts product conditions", () => {
    const actions = buildActionDrafts(calculation, plan);
    expect(actions[0].kind).toBe("BUILD_EMERGENCY_FUND");
    expect(actions.find((action) => action.kind === "FUND_GOAL")?.productConditions?.currency).toBe("CNY");
    expect(actions.every((action) => action.priority > 0)).toBe(true);
  });
});
