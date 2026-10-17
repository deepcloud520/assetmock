import type { RuleStatus } from "./wealth";

export const FORMULA_VERSION = "wealth-v2";

type CalculationAsset = {
  id: string;
  name: string;
  type: string;
  currentValueMinor: string | bigint;
  liquidityLevel: string;
  riskLevel: number;
  goalId: string | null;
};

type CalculationLiability = {
  id: string;
  outstandingBalanceMinor: string | bigint;
  monthlyPaymentMinor: string | bigint;
  remainingMonths: number | null;
};

type CalculationGoal = {
  id: string;
  name: string;
  targetAmountMinor: string | bigint;
  targetDate: string | Date;
  preparedAmountMinor: string | bigint;
  monthlyContributionMinor: string | bigint;
};

export type CalculationInput = {
  revision: number;
  asOf: string | Date;
  ledgerConfirmed?: boolean;
  profile: {
    riskLevel: string;
    stableMonthlyIncomeMinor: string | bigint;
    otherMonthlyIncomeMinor: string | bigint;
    rentExpenseMinor: string | bigint;
    transportExpenseMinor: string | bigint;
    essentialExpenseMinor: string | bigint;
  } | null;
  assets: CalculationAsset[];
  liabilities: CalculationLiability[];
  goals: CalculationGoal[];
};

export type Metric = {
  value: number | null;
  status: RuleStatus;
  display: string;
};

export type WealthCalculation = {
  formulaVersion: string;
  sourceRevision: number;
  calculatedAt: string;
  completeness: number;
  summary: {
    totalAssetsMinor: string;
    totalLiabilitiesMinor: string;
    netWorthMinor: string;
  };
  cashflow: {
    monthlyIncomeMinor: string;
    monthlyExpensesMinor: string;
    monthlyDebtPaymentsMinor: string;
    monthlySurplusMinor: string;
    surplusRate: Metric;
  };
  fourAccounts: {
    liquidityMinor: string;
    protectionMinor: string;
    goalMinor: string;
    growthMinor: string;
  };
  safety: {
    emergencyCoverageMonths: Metric;
    debtToAssetRatio: Metric;
    debtServiceRatio: Metric;
    shortDebtCoverageRatio: Metric;
  };
  concentration: {
    largestHoldingRatio: Metric;
    topThreeRatio: Metric;
    hhi: Metric;
  };
  liquidity: {
    t0Minor: string;
    d7Minor: string;
    d30Minor: string;
    y1Minor: string;
    overY1Minor: string;
  };
  goalHealth: Array<{
    id: string;
    name: string;
    targetAmountMinor: string;
    preparedAmountMinor: string;
    linkedAssetsMinor: string;
    projectedAmountMinor: string;
    gapMinor: string;
    monthsRemaining: number;
    coverageRatio: Metric;
  }>;
  dimensions: Array<{ id: string; label: string; weight: number; score: number | null; status: RuleStatus }>;
  healthScore: number | null;
  risks: Array<{ id: string; title: string; evidence: string; status: RuleStatus; priority: number }>;
};

const statusScore: Record<Exclude<RuleStatus, "UNKNOWN">, number> = {
  HEALTHY: 100,
  ATTENTION: 60,
  RISK: 20,
};

const liquidityRank: Record<string, number> = { T0: 0, D7: 1, D30: 2, Y1: 3, GT_Y1: 4, ILLIQUID: 5 };

function money(value: string | bigint | undefined) {
  return BigInt(value ?? 0);
}

function sumMoney(values: Array<string | bigint>) {
  return values.reduce<bigint>((total, value) => total + money(value), 0n);
}

function percentage(numerator: bigint, denominator: bigint) {
  if (denominator <= 0n) return null;
  return Number((numerator * 10_000n) / denominator) / 100;
}

function metric(value: number | null, status: RuleStatus, suffix = "%"): Metric {
  return { value, status, display: value === null ? "数据不足" : `${value.toFixed(value % 1 === 0 ? 0 : 1)}${suffix}` };
}

function lowerIsBetter(value: number | null, healthyMax: number, attentionMax: number): RuleStatus {
  if (value === null) return "UNKNOWN";
  if (value <= healthyMax) return "HEALTHY";
  if (value <= attentionMax) return "ATTENTION";
  return "RISK";
}

function higherIsBetter(value: number | null, healthyMin: number, attentionMin: number): RuleStatus {
  if (value === null) return "UNKNOWN";
  if (value >= healthyMin) return "HEALTHY";
  if (value >= attentionMin) return "ATTENTION";
  return "RISK";
}

function aggregateStatus(statuses: RuleStatus[]): { score: number | null; status: RuleStatus } {
  const known = statuses.filter((status): status is Exclude<RuleStatus, "UNKNOWN"> => status !== "UNKNOWN");
  if (!known.length) return { score: null, status: "UNKNOWN" };
  const score = Math.round(known.reduce((total, status) => total + statusScore[status], 0) / known.length);
  return { score, status: score >= 80 ? "HEALTHY" : score >= 45 ? "ATTENTION" : "RISK" };
}

function monthsBetween(asOf: Date, target: Date) {
  const months = (target.getUTCFullYear() - asOf.getUTCFullYear()) * 12 + target.getUTCMonth() - asOf.getUTCMonth();
  return Math.max(0, months);
}

export function calculateWealth(input: CalculationInput): WealthCalculation {
  const asOf = new Date(input.asOf);
  const totalAssets = sumMoney(input.assets.map((asset) => asset.currentValueMinor));
  const totalLiabilities = sumMoney(input.liabilities.map((liability) => liability.outstandingBalanceMinor));
  const monthlyIncome = input.profile ? money(input.profile.stableMonthlyIncomeMinor) + money(input.profile.otherMonthlyIncomeMinor) : 0n;
  const monthlyDebtPayments = sumMoney(input.liabilities.map((liability) => liability.monthlyPaymentMinor));
  const baseExpenses = input.profile ? money(input.profile.rentExpenseMinor) + money(input.profile.transportExpenseMinor) + money(input.profile.essentialExpenseMinor) : 0n;
  const monthlyExpenses = baseExpenses + monthlyDebtPayments;
  const monthlySurplus = monthlyIncome - monthlyExpenses;

  const liquidSafeAssets = sumMoney(input.assets.filter((asset) => liquidityRank[asset.liquidityLevel] <= 1 && asset.riskLevel <= 2 && !asset.goalId).map((asset) => asset.currentValueMinor));
  const emergencyMonths = monthlyExpenses > 0n ? Number((liquidSafeAssets * 10n) / monthlyExpenses) / 10 : null;
  const emergencyMetric = metric(emergencyMonths, higherIsBetter(emergencyMonths, 6, 3), " 个月");
  const debtToAsset = percentage(totalLiabilities, totalAssets);
  const debtToAssetMetric = metric(debtToAsset, lowerIsBetter(debtToAsset, 30, 50));
  const debtService = percentage(monthlyDebtPayments, monthlyIncome);
  const debtServiceMetric = metric(debtService, lowerIsBetter(debtService, 30, 50));
  const surplusRate = percentage(monthlySurplus, monthlyIncome);
  const surplusMetric = metric(surplusRate, higherIsBetter(surplusRate, 20, 0));
  const shortDebt = sumMoney(input.liabilities.map((liability) => {
    const months = BigInt(Math.min(liability.remainingMonths ?? 12, 12));
    const scheduled = money(liability.monthlyPaymentMinor) * months;
    const balance = money(liability.outstandingBalanceMinor);
    return scheduled > 0n && scheduled < balance ? scheduled : balance;
  }));
  const shortDebtCoverage = percentage(liquidSafeAssets, shortDebt);
  const shortDebtMetric = metric(shortDebtCoverage, higherIsBetter(shortDebtCoverage, 100, 60));

  const assetValues = input.assets.filter((asset) => money(asset.currentValueMinor) > 0n).map((asset) => money(asset.currentValueMinor)).sort((a, b) => a > b ? -1 : a < b ? 1 : 0);
  const largest = percentage(assetValues[0] ?? 0n, totalAssets);
  const topThree = percentage(sumMoney(assetValues.slice(0, 3)), totalAssets);
  const hhi = totalAssets > 0n ? assetValues.reduce((total, value) => {
    const share = Number((value * 100_000n) / totalAssets) / 100_000;
    return total + share * share;
  }, 0) : null;
  const largestMetric = metric(largest, lowerIsBetter(largest, 30, 50));
  const topThreeMetric = metric(topThree, lowerIsBetter(topThree, 60, 80));
  const hhiMetric = metric(hhi, lowerIsBetter(hhi, 0.15, 0.25), "");

  const fourAccounts = { liquidityMinor: 0n, protectionMinor: 0n, goalMinor: 0n, growthMinor: 0n };
  for (const asset of input.assets) {
    const value = money(asset.currentValueMinor);
    if (asset.goalId) fourAccounts.goalMinor += value;
    else if (asset.type === "INSURANCE_CASH_VALUE") fourAccounts.protectionMinor += value;
    else if (["CASH", "BANK_DEPOSIT", "MONEY_MARKET"].includes(asset.type)) fourAccounts.liquidityMinor += value;
    else fourAccounts.growthMinor += value;
  }

  function liquidUpTo(maxRank: number) {
    return sumMoney(input.assets.filter((asset) => liquidityRank[asset.liquidityLevel] <= maxRank).map((asset) => asset.currentValueMinor));
  }

  const goalHealth = input.goals.map((goal) => {
    const target = money(goal.targetAmountMinor);
    const linked = sumMoney(input.assets.filter((asset) => asset.goalId === goal.id).map((asset) => asset.currentValueMinor));
    const prepared = money(goal.preparedAmountMinor);
    const monthsRemaining = monthsBetween(asOf, new Date(goal.targetDate));
    const projected = prepared + linked + money(goal.monthlyContributionMinor) * BigInt(monthsRemaining);
    const coverage = percentage(projected, target);
    return {
      id: goal.id,
      name: goal.name,
      targetAmountMinor: target.toString(),
      preparedAmountMinor: prepared.toString(),
      linkedAssetsMinor: linked.toString(),
      projectedAmountMinor: projected.toString(),
      gapMinor: (target > projected ? target - projected : 0n).toString(),
      monthsRemaining,
      coverageRatio: metric(coverage, higherIsBetter(coverage, 100, 70)),
    };
  });

  const safetyDimension = aggregateStatus([emergencyMetric.status, debtToAssetMetric.status, debtServiceMetric.status, surplusMetric.status, shortDebtMetric.status]);
  const structureDimension = aggregateStatus([largestMetric.status, topThreeMetric.status, hhiMetric.status]);
  const riskCapacity = { CONSERVATIVE: 1, MODERATE_CONSERVATIVE: 2, BALANCED: 3, MODERATE_AGGRESSIVE: 4, AGGRESSIVE: 5 }[input.profile?.riskLevel ?? ""];
  const weightedRisk = totalAssets > 0n ? input.assets.reduce((total, asset) => total + Number(money(asset.currentValueMinor)) * asset.riskLevel, 0) / Number(totalAssets) : null;
  const riskStatus: RuleStatus = weightedRisk === null || !riskCapacity ? "UNKNOWN" : weightedRisk <= riskCapacity ? "HEALTHY" : weightedRisk <= riskCapacity + 1 ? "ATTENTION" : "RISK";
  const riskDimension = aggregateStatus([riskStatus]);
  const liquidityDimension = aggregateStatus([emergencyMetric.status]);
  const goalDimension = aggregateStatus(goalHealth.map((goal) => goal.coverageRatio.status));
  const dimensions = [
    { id: "safety", label: "财务安全", weight: 30, ...safetyDimension },
    { id: "structure", label: "资产结构", weight: 20, ...structureDimension },
    { id: "risk", label: "投资风险", weight: 20, ...riskDimension },
    { id: "liquidity", label: "流动性", weight: 15, ...liquidityDimension },
    { id: "goals", label: "目标健康", weight: 15, ...goalDimension },
  ];
  const knownDimensions = dimensions.filter((dimension) => dimension.score !== null);
  const knownWeight = knownDimensions.reduce((total, dimension) => total + dimension.weight, 0);
  const healthScore = knownWeight ? Math.round(knownDimensions.reduce((total, dimension) => total + dimension.score! * dimension.weight, 0) / knownWeight) : null;

  const risks = [
    { id: "emergency", title: "应急资金覆盖不足", evidence: `高流动性安全资产可覆盖 ${emergencyMetric.display}`, status: emergencyMetric.status, priority: 1 },
    { id: "debt", title: "资产负债率偏高", evidence: `当前资产负债率 ${debtToAssetMetric.display}`, status: debtToAssetMetric.status, priority: 2 },
    { id: "debt-service", title: "月度偿债压力偏高", evidence: `月偿债额占收入 ${debtServiceMetric.display}`, status: debtServiceMetric.status, priority: 3 },
    { id: "concentration", title: "单项资产集中度偏高", evidence: `最大单项占全部资产 ${largestMetric.display}`, status: largestMetric.status, priority: 4 },
    ...goalHealth.map((goal, index) => ({ id: `goal-${goal.id}`, title: `${goal.name}资金准备不足`, evidence: `按当前投入路径覆盖 ${goal.coverageRatio.display}，缺口 ${goal.gapMinor} 分`, status: goal.coverageRatio.status, priority: 5 + index })),
  ].filter((risk) => risk.status === "RISK" || risk.status === "ATTENTION").sort((a, b) => (a.status === b.status ? a.priority - b.priority : a.status === "RISK" ? -1 : 1)).slice(0, 3);

  const completionChecks = [Boolean(input.profile), Boolean(input.ledgerConfirmed), monthlyIncome > 0n, totalAssets > 0n, input.goals.length > 0];

  return {
    formulaVersion: FORMULA_VERSION,
    sourceRevision: input.revision,
    calculatedAt: new Date().toISOString(),
    completeness: completionChecks.filter(Boolean).length * 20,
    summary: { totalAssetsMinor: totalAssets.toString(), totalLiabilitiesMinor: totalLiabilities.toString(), netWorthMinor: (totalAssets - totalLiabilities).toString() },
    cashflow: { monthlyIncomeMinor: monthlyIncome.toString(), monthlyExpensesMinor: monthlyExpenses.toString(), monthlyDebtPaymentsMinor: monthlyDebtPayments.toString(), monthlySurplusMinor: monthlySurplus.toString(), surplusRate: surplusMetric },
    fourAccounts: { liquidityMinor: fourAccounts.liquidityMinor.toString(), protectionMinor: fourAccounts.protectionMinor.toString(), goalMinor: fourAccounts.goalMinor.toString(), growthMinor: fourAccounts.growthMinor.toString() },
    safety: { emergencyCoverageMonths: emergencyMetric, debtToAssetRatio: debtToAssetMetric, debtServiceRatio: debtServiceMetric, shortDebtCoverageRatio: shortDebtMetric },
    concentration: { largestHoldingRatio: largestMetric, topThreeRatio: topThreeMetric, hhi: hhiMetric },
    liquidity: { t0Minor: liquidUpTo(0).toString(), d7Minor: liquidUpTo(1).toString(), d30Minor: liquidUpTo(2).toString(), y1Minor: liquidUpTo(3).toString(), overY1Minor: totalAssets.toString() },
    goalHealth,
    dimensions,
    healthScore,
    risks,
  };
}
