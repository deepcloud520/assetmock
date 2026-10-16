import type { WealthCalculation } from "./calculator";
import type { PlanCandidate } from "./planning";

type ScenarioAsset = {
  type: string;
  currentValueMinor: string | bigint;
  goalId: string | null;
};

export type Scenario = {
  key: "MARKET_DROP_30" | "INCOME_INTERRUPTION_3M" | "GOAL_COST_INCREASE_10";
  name: string;
  assumption: string;
  netWorthBeforeMinor: string;
  netWorthAfterMinor: string;
  liquidityBeforeMinor: string;
  liquidityAfterMinor: string;
  goalCoverageBefore: number;
  goalCoverageAfter: number;
  riskChange: string;
  requiresReplanning: boolean;
};

export type ActionDraft = {
  kind: "BUILD_EMERGENCY_FUND" | "FUND_GOAL" | "REDUCE_CONCENTRATION" | "REVIEW_DEBT";
  title: string;
  reason: string;
  amountMinor: string | null;
  priority: number;
  dueDate: string;
  verificationType: string;
  productConditions: null | {
    assetClasses: string[];
    maxRiskLevel: number;
    liquidity: string[];
    maxTermMonths: number | null;
    currency: "CNY";
  };
};

function ratio(numerator: bigint, denominator: bigint) {
  return denominator > 0n ? Number((numerator * 10_000n) / denominator) / 100 : 0;
}

function nonNegative(value: bigint) {
  return value > 0n ? value : 0n;
}

export function runStressScenarios(calculation: WealthCalculation, plan: PlanCandidate, assets: ScenarioAsset[]): Scenario[] {
  const netWorth = BigInt(calculation.summary.netWorthMinor);
  const liquidity = BigInt(calculation.fourAccounts.liquidityMinor);
  const target = BigInt(plan.targetAmountMinor);
  const projected = BigInt(plan.projectedAmountMinor);
  const marketLoss = assets.filter((asset) => ["EQUITY", "EQUITY_FUND"].includes(asset.type)).reduce((total, asset) => total + BigInt(asset.currentValueMinor) * 30n / 100n, 0n);
  const linkedMarketLoss = assets.filter((asset) => asset.goalId === plan.goalId && ["EQUITY", "EQUITY_FUND"].includes(asset.type)).reduce((total, asset) => total + BigInt(asset.currentValueMinor) * 30n / 100n, 0n);
  const interruptionCost = BigInt(calculation.cashflow.monthlyExpensesMinor) * 3n;
  const missedContributions = BigInt(plan.monthlyContributionMinor) * 3n;
  const raisedTarget = target * 110n / 100n;

  return [
    {
      key: "MARKET_DROP_30", name: "权益市场下跌 30%", assumption: "仅对股票和权益基金当前价值施加一次性 -30% 冲击。",
      netWorthBeforeMinor: netWorth.toString(), netWorthAfterMinor: (netWorth - marketLoss).toString(), liquidityBeforeMinor: liquidity.toString(), liquidityAfterMinor: liquidity.toString(),
      goalCoverageBefore: ratio(projected, target), goalCoverageAfter: ratio(nonNegative(projected - linkedMarketLoss), target), riskChange: marketLoss > 0n ? `净资产减少 ${marketLoss} 分` : "当前没有权益资产暴露", requiresReplanning: linkedMarketLoss > 0n || marketLoss * 10n > nonNegative(netWorth),
    },
    {
      key: "INCOME_INTERRUPTION_3M", name: "收入中断 3 个月", assumption: "三个月没有收入，必要支出持续，并暂停目标投入。",
      netWorthBeforeMinor: netWorth.toString(), netWorthAfterMinor: (netWorth - interruptionCost).toString(), liquidityBeforeMinor: liquidity.toString(), liquidityAfterMinor: nonNegative(liquidity - interruptionCost).toString(),
      goalCoverageBefore: ratio(projected, target), goalCoverageAfter: ratio(nonNegative(projected - missedContributions), target), riskChange: liquidity >= interruptionCost ? "现有流动资金可覆盖三个月必要支出" : "流动资金不足以覆盖三个月必要支出", requiresReplanning: liquidity < interruptionCost,
    },
    {
      key: "GOAL_COST_INCREASE_10", name: "目标成本上涨 10%", assumption: "目标金额上调 10%，其他资产和投入保持不变。",
      netWorthBeforeMinor: netWorth.toString(), netWorthAfterMinor: netWorth.toString(), liquidityBeforeMinor: liquidity.toString(), liquidityAfterMinor: liquidity.toString(),
      goalCoverageBefore: ratio(projected, target), goalCoverageAfter: ratio(projected, raisedTarget), riskChange: `目标资金需求增加 ${(raisedTarget - target).toString()} 分`, requiresReplanning: projected < raisedTarget,
    },
  ];
}

function dueDate(months: number) {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString();
}

export function buildActionDrafts(calculation: WealthCalculation, plan: PlanCandidate): ActionDraft[] {
  const actions: ActionDraft[] = [];
  const reserveGap = BigInt(plan.immediateReserveGapMinor);
  if (reserveGap > 0n) actions.push({
    kind: "BUILD_EMERGENCY_FUND", title: "补足家庭应急资金", reason: "先建立可覆盖三个月必要支出的高流动性安全垫。", amountMinor: reserveGap.toString(), priority: 1, dueDate: dueDate(3), verificationType: "EMERGENCY_COVERAGE_3M",
    productConditions: { assetClasses: ["CASH", "BANK_DEPOSIT", "MONEY_MARKET"], maxRiskLevel: 2, liquidity: ["T0", "D7"], maxTermMonths: 1, currency: "CNY" },
  });
  const contribution = BigInt(plan.monthlyContributionMinor);
  if (contribution > 0n) actions.push({
    kind: "FUND_GOAL", title: `开始为“${plan.goalName}”按月投入`, reason: `执行所选 Plan ${plan.key} 的目标资金路径。`, amountMinor: contribution.toString(), priority: reserveGap > 0n ? 2 : 1, dueDate: dueDate(1), verificationType: "GOAL_CONTRIBUTION_REVIEW",
    productConditions: { assetClasses: plan.targetDate < dueDate(36) ? ["BANK_DEPOSIT", "BOND_FUND"] : ["BOND_FUND", "EQUITY_FUND"], maxRiskLevel: plan.targetDate < dueDate(36) ? 2 : 3, liquidity: ["D7", "D30", "Y1"], maxTermMonths: null, currency: "CNY" },
  });
  if (calculation.concentration.largestHoldingRatio.status === "RISK") actions.push({
    kind: "REDUCE_CONCENTRATION", title: "降低单项资产集中度", reason: `最大单项资产占比为 ${calculation.concentration.largestHoldingRatio.display}。`, amountMinor: null, priority: actions.length + 1, dueDate: dueDate(2), verificationType: "LARGEST_HOLDING_AT_MOST_50", productConditions: null,
  });
  if (calculation.safety.debtServiceRatio.status === "RISK" || calculation.safety.debtToAssetRatio.status === "RISK") actions.push({
    kind: "REVIEW_DEBT", title: "复核家庭负债安排", reason: "当前负债规模或月度偿债压力处于风险区间。", amountMinor: null, priority: actions.length + 1, dueDate: dueDate(1), verificationType: "DEBT_REVIEW_REQUIRED", productConditions: null,
  });
  return actions;
}
