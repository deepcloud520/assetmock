import type { WealthCalculation } from "./calculator";

export type PlanningGoal = {
  id: string;
  name: string;
  type: string;
  targetAmountMinor: string | bigint;
  targetDate: string | Date;
  preparedAmountMinor: string | bigint;
  monthlyContributionMinor: string | bigint;
  priority: number;
  isFlexible: boolean;
};

export type PlanCandidate = {
  key: "A" | "B" | "C";
  name: string;
  principle: string;
  goalId: string;
  goalName: string;
  targetDate: string;
  targetAmountMinor: string;
  monthlyContributionMinor: string;
  monthlyCashflowAfterContributionMinor: string;
  immediateReserveGapMinor: string;
  projectedAmountMinor: string;
  projectedGapMinor: string;
  feasibility: "FEASIBLE" | "TIGHT" | "INFEASIBLE";
};

export type RiskLevel = "CONSERVATIVE" | "MODERATE_CONSERVATIVE" | "BALANCED" | "MODERATE_AGGRESSIVE" | "AGGRESSIVE" | string;

export function recommendPlanKey(candidates: PlanCandidate[], riskLevel: RiskLevel): PlanCandidate["key"] {
  const preferred: PlanCandidate["key"] = ["CONSERVATIVE", "MODERATE_CONSERVATIVE"].includes(riskLevel)
    ? "C"
    : ["MODERATE_AGGRESSIVE", "AGGRESSIVE"].includes(riskLevel) ? "A" : "B";
  const viable = new Set(candidates.filter((plan) => plan.feasibility !== "INFEASIBLE").map((plan) => plan.key));
  if (viable.has(preferred)) return preferred;
  return (["C", "B", "A"] as const).find((key) => viable.has(key)) ?? "C";
}

function ceilDivide(numerator: bigint, denominator: bigint) {
  if (denominator <= 0n) return numerator;
  return (numerator + denominator - 1n) / denominator;
}

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result.toISOString();
}

function feasibility(contribution: bigint, surplus: bigint): PlanCandidate["feasibility"] {
  if (contribution > surplus) return "INFEASIBLE";
  if (surplus > 0n && contribution * 100n > surplus * 70n) return "TIGHT";
  return "FEASIBLE";
}

export function buildPlanCandidates(calculation: WealthCalculation, goals: PlanningGoal[]): PlanCandidate[] {
  const primary = [...goals].sort((a, b) => a.priority - b.priority || new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime())[0];
  if (!primary) return [];
  const goalHealth = calculation.goalHealth.find((goal) => goal.id === primary.id);
  if (!goalHealth) return [];

  const surplus = BigInt(calculation.cashflow.monthlySurplusMinor) > 0n ? BigInt(calculation.cashflow.monthlySurplusMinor) : 0n;
  const expenses = BigInt(calculation.cashflow.monthlyExpensesMinor);
  const currentLiquidity = BigInt(calculation.fourAccounts.liquidityMinor);
  const reserveGap = expenses * 3n > currentLiquidity ? expenses * 3n - currentLiquidity : 0n;
  const target = BigInt(primary.targetAmountMinor);
  const currentPrepared = BigInt(goalHealth.preparedAmountMinor) + BigInt(goalHealth.linkedAssetsMinor);
  const months = Math.max(goalHealth.monthsRemaining, 1);

  function create(key: PlanCandidate["key"], name: string, principle: string, planTarget: bigint, planMonths: number, contributionCap?: bigint): PlanCandidate {
    const gap = planTarget > currentPrepared ? planTarget - currentPrepared : 0n;
    const required = ceilDivide(gap, BigInt(Math.max(planMonths, 1)));
    const contribution = contributionCap === undefined || required <= contributionCap ? required : contributionCap;
    const projected = currentPrepared + contribution * BigInt(planMonths);
    return {
      key,
      name,
      principle,
      goalId: primary.id,
      goalName: primary.name,
      targetDate: addMonths(new Date(), planMonths),
      targetAmountMinor: planTarget.toString(),
      monthlyContributionMinor: contribution.toString(),
      monthlyCashflowAfterContributionMinor: (surplus - contribution).toString(),
      immediateReserveGapMinor: reserveGap.toString(),
      projectedAmountMinor: projected.toString(),
      projectedGapMinor: (planTarget > projected ? planTarget - projected : 0n).toString(),
      feasibility: feasibility(contribution, surplus),
    };
  }

  const planA = create("A", "目标优先", "保持目标金额与日期，优先补足目标资金。", target, months);
  const balancedTarget = primary.isFlexible ? target * 90n / 100n : target;
  const balancedCap = surplus * 60n / 100n;
  const planB = create("B", "平衡方案", "兼顾目标投入与日常现金流安全垫。", balancedTarget, months, balancedCap);
  const safetyCap = surplus * 40n / 100n > BigInt(primary.monthlyContributionMinor) ? surplus * 40n / 100n : BigInt(primary.monthlyContributionMinor);
  const remaining = target > currentPrepared ? target - currentPrepared : 0n;
  const safetyMonths = safetyCap > 0n ? Math.max(months, Number(ceilDivide(remaining, safetyCap))) : months;
  const planC = create("C", "安全优先", "先保留现金流和应急资金，必要时延后目标。", target, safetyMonths, safetyCap);
  return [planA, planB, planC];
}
