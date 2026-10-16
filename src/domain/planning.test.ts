import { describe, expect, it } from "vitest";
import { calculateWealth } from "./calculator";
import { buildPlanCandidates, recommendPlanKey, type PlanCandidate } from "./planning";

const goal = { id: "home", name: "购房", type: "HOME_PURCHASE", targetAmountMinor: "12000000", targetDate: "2027-09-14", preparedAmountMinor: "0", monthlyContributionMinor: "300000", priority: 1, isFlexible: true };
const calculation = calculateWealth({
  revision: 1,
  asOf: "2026-09-14",
  profile: { riskLevel: "BALANCED", stableMonthlyIncomeMinor: "2000000", otherMonthlyIncomeMinor: "0", rentExpenseMinor: "300000", transportExpenseMinor: "100000", essentialExpenseMinor: "400000" },
  assets: [{ id: "cash", name: "目标资金", type: "BANK_DEPOSIT", currentValueMinor: "3000000", liquidityLevel: "T0", riskLevel: 1, goalId: "home" }],
  liabilities: [],
  goals: [goal],
});

describe("plan recommendation", () => {
  const candidate = (key: PlanCandidate["key"], feasibility: PlanCandidate["feasibility"]): PlanCandidate => ({
    key, feasibility, name: key, principle: key, goalId: "goal-1", goalName: "目标", targetDate: "2028-01-01",
    targetAmountMinor: "100", monthlyContributionMinor: "10", monthlyCashflowAfterContributionMinor: "10",
    immediateReserveGapMinor: "0", projectedAmountMinor: "100", projectedGapMinor: "0",
  });

  it("matches the preferred plan to risk tolerance", () => {
    const plans = [candidate("A", "FEASIBLE"), candidate("B", "FEASIBLE"), candidate("C", "FEASIBLE")];
    expect(recommendPlanKey(plans, "CONSERVATIVE")).toBe("C");
    expect(recommendPlanKey(plans, "BALANCED")).toBe("B");
    expect(recommendPlanKey(plans, "AGGRESSIVE")).toBe("A");
  });

  it("falls back to the safest viable plan and keeps C as the adjustment direction", () => {
    expect(recommendPlanKey([candidate("A", "INFEASIBLE"), candidate("B", "TIGHT"), candidate("C", "INFEASIBLE")], "AGGRESSIVE")).toBe("B");
    expect(recommendPlanKey([candidate("A", "INFEASIBLE"), candidate("B", "INFEASIBLE"), candidate("C", "INFEASIBLE")], "BALANCED")).toBe("C");
  });
});

describe("plan candidate calculator", () => {
  it("always produces three deterministic trade-off candidates", () => {
    const plans = buildPlanCandidates(calculation, [goal]);
    expect(plans.map((plan) => plan.key)).toEqual(["A", "B", "C"]);
    expect(plans[0].targetAmountMinor).toBe("12000000");
    expect(plans[1].targetAmountMinor).toBe("10800000");
    expect(BigInt(plans[2].monthlyContributionMinor)).toBeLessThanOrEqual(BigInt(calculation.cashflow.monthlySurplusMinor) * 40n / 100n);
  });

  it("does not create plans without a goal", () => {
    expect(buildPlanCandidates(calculation, [])).toEqual([]);
  });
});
