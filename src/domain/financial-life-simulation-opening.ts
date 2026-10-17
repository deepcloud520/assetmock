import type { FrozenSimulationOpening, GoalFundingBasis, SimulationOpening, SimulationStrategy } from "./financial-life-simulation.types";

type MoneyValue = string | bigint;
type PlanKey = "A" | "B" | "C";
type FundingKind = GoalFundingBasis["kind"];
export type ZeroConfirmation = "MONTHLY_INCOME" | "ESSENTIAL_EXPENSE" | "DEBT_PAYMENT";

export type OpeningInput = {
  asOfDate: string;
  capturedAt: string;
  portfolio: {
    id: string;
    portfolioRevision: number;
    ledgerConfirmedAt: string | null;
    profile: null | {
      age: number | null;
      familyStatus: string | null;
      stableMonthlyIncomeMinor: MoneyValue;
      otherMonthlyIncomeMinor: MoneyValue;
      rentExpenseMinor: MoneyValue;
      transportExpenseMinor: MoneyValue;
      essentialExpenseMinor: MoneyValue;
    };
    assets: Array<{
      id: string;
      currentValueMinor: MoneyValue;
      currency: string;
      liquidityLevel: string;
      goalId: string | null;
    }>;
    liabilities: Array<{ id: string; outstandingBalanceMinor: MoneyValue; monthlyPaymentMinor: MoneyValue }>;
    goals: Array<{
      id: string;
      name: string;
      type: string;
      preparedAmountMinor: MoneyValue;
      isFlexible: boolean;
    }>;
  };
  planning: null | {
    id: string;
    sourceRevision: number;
    isStale: boolean;
    goalId: string;
    selectedPlanKey: string | null;
    plans: Array<{
      key: PlanKey;
      targetDate: string;
      targetAmountMinor: MoneyValue;
      monthlyContributionMinor: MoneyValue;
    }>;
  };
};

export type OpeningConfirmation = {
  flexibleExpenseMinor?: MoneyValue;
  goalFundingKind?: FundingKind;
  confirmedZeroFields?: ZeroConfirmation[];
};

export type OpeningIssue = { code: string; field: string; message: string };
export type OpeningRequest = {
  field: "flexibleExpenseMinor" | "goalFundingKind" | ZeroConfirmation;
  message: string;
  options?: FundingKind[];
};
export type OpeningResult =
  | { status: "INVALID"; issues: OpeningIssue[] }
  | { status: "NEEDS_CONFIRMATION"; requests: OpeningRequest[] }
  | { status: "READY"; opening: FrozenSimulationOpening };

function parseNonnegativeMoney(value: MoneyValue | undefined, field: string, issues: OpeningIssue[]): bigint | null {
  const raw = typeof value === "bigint" ? value.toString() : value;
  if (typeof raw !== "string" || !/^(0|[1-9]\d*)$/.test(raw)) {
    issues.push({ code: "INVALID_AMOUNT", field, message: `${field}需要填写非负整数分金额。` });
    return null;
  }
  return BigInt(raw);
}

function parseDate(value: string, field: string, issues: OpeningIssue[]): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    issues.push({ code: "INVALID_DATE", field, message: `${field}需要有效的 YYYY-MM-DD 日期。` });
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    issues.push({ code: "INVALID_DATE", field, message: `${field}需要有效的 YYYY-MM-DD 日期。` });
    return null;
  }
  return date;
}

function isValidIsoTimestamp(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function monthAt(date: Date, offset: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1)).toISOString().slice(0, 7);
}

function monthSpan(first: string, last: string) {
  const [firstYear, firstMonth] = first.split("-").map(Number);
  const [lastYear, lastMonth] = last.split("-").map(Number);
  return (lastYear - firstYear) * 12 + lastMonth - firstMonth + 1;
}

function frozen<T extends object>(value: T): T {
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (child && typeof child === "object" && !Object.isFrozen(child)) frozen(child);
  }
  return value;
}

function strategyFor(planKey: PlanKey): SimulationStrategy {
  const strategies: Record<PlanKey, SimulationStrategy> = { A: "GOAL_FIRST", B: "BALANCED", C: "SAFETY_FIRST" };
  return strategies[planKey];
}

type Portfolio = OpeningInput["portfolio"];
type Profile = NonNullable<Portfolio["profile"]>;
type Planning = NonNullable<OpeningInput["planning"]>;
type Plan = Planning["plans"][number];
type Goal = Portfolio["goals"][number];

function validateBase(input: OpeningInput, issues: OpeningIssue[]) {
  const { portfolio } = input;
  if (!isValidIsoTimestamp(input.capturedAt)) issues.push({ code: "INVALID_DATE", field: "capturedAt", message: "采集时间无效。" });
  if (!portfolio.id.trim()) issues.push({ code: "MISSING_WORKSPACE", field: "portfolio.id", message: "缺少财务空间。" });
  if (!Number.isSafeInteger(portfolio.portfolioRevision) || portfolio.portfolioRevision < 0) issues.push({ code: "INVALID_REVISION", field: "portfolio.portfolioRevision", message: "底账版本无效。" });
  if (!portfolio.ledgerConfirmedAt) issues.push({ code: "LEDGER_UNCONFIRMED", field: "portfolio.ledgerConfirmedAt", message: "请先确认财务底账。" });
  else if (!isValidIsoTimestamp(portfolio.ledgerConfirmedAt)) issues.push({ code: "INVALID_DATE", field: "portfolio.ledgerConfirmedAt", message: "底账确认时间无效。" });
  if (!portfolio.profile) issues.push({ code: "MISSING_PROFILE", field: "portfolio.profile", message: "请先补充个人财务画像。" });
}

function resolveSelection(input: OpeningInput, issues: OpeningIssue[]) {
  const planning = input.planning;
  if (!planning) {
    issues.push({ code: "MISSING_PLAN", field: "planning", message: "请先生成并选定规划方案。" });
    return null;
  }
  const plan = planning.plans.find((item) => item.key === planning.selectedPlanKey);
  const goal = input.portfolio.goals.find((item) => item.id === planning.goalId);
  if (!plan) issues.push({ code: "MISSING_SELECTED_PLAN", field: "planning.selectedPlanKey", message: "请先选定有效的规划方案。" });
  if (planning.isStale || planning.sourceRevision !== input.portfolio.portfolioRevision) issues.push({ code: "STALE_PLAN", field: "planning.sourceRevision", message: "规划基于旧底账，请重新生成。" });
  if (!planning.id.trim()) issues.push({ code: "MISSING_PLAN_ID", field: "planning.id", message: "缺少方案版本。" });
  if (!goal) issues.push({ code: "MISSING_GOAL", field: "planning.goalId", message: "找不到规划对应的目标。" });
  if (goal && (!goal.name.trim() || !goal.type.trim())) issues.push({ code: "INVALID_GOAL", field: "goal", message: "目标名称或类型缺失。" });
  return plan && goal ? { planning, plan, goal } : null;
}

function resolveTimeline(asOfDate: string, targetDate: string | undefined, issues: OpeningIssue[]) {
  const asOf = parseDate(asOfDate, "asOfDate", issues);
  const validFormat = targetDate !== undefined && (/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || isValidIsoTimestamp(targetDate));
  if (targetDate !== undefined && !validFormat) issues.push({ code: "INVALID_DATE", field: "planning.targetDate", message: "目标日期格式无效。" });
  const target = validFormat ? parseDate(targetDate!.slice(0, 10), "planning.targetDate", issues) : null;
  if (!asOf || !target) return null;
  const startMonth = monthAt(asOf, 1);
  const endMonth = monthAt(target, 0);
  const span = monthSpan(startMonth, endMonth);
  if (span < 1) issues.push({ code: "TARGET_EXPIRED", field: "planning.targetDate", message: "目标日期早于下一个完整自然月。" });
  if (span > 240) issues.push({ code: "HORIZON_TOO_LONG", field: "planning.targetDate", message: "模拟跨度不能超过 240 个月。" });
  return { startMonth, endMonth };
}

function readProfile(profile: Profile | null, issues: OpeningIssue[]) {
  if (!profile) return null;
  const stableIncome = parseNonnegativeMoney(profile.stableMonthlyIncomeMinor, "profile.stableMonthlyIncomeMinor", issues);
  const otherIncome = parseNonnegativeMoney(profile.otherMonthlyIncomeMinor, "profile.otherMonthlyIncomeMinor", issues);
  const rent = parseNonnegativeMoney(profile.rentExpenseMinor, "profile.rentExpenseMinor", issues);
  const transport = parseNonnegativeMoney(profile.transportExpenseMinor, "profile.transportExpenseMinor", issues);
  const essential = parseNonnegativeMoney(profile.essentialExpenseMinor, "profile.essentialExpenseMinor", issues);
  if (profile.age !== null && (!Number.isInteger(profile.age) || profile.age < 0 || profile.age > 120)) issues.push({ code: "INVALID_AGE", field: "profile.age", message: "年龄需要在 0 到 120 岁之间。" });
  if ([stableIncome, otherIncome, rent, transport, essential].some((value) => value === null)) return null;
  return { stableIncome: stableIncome!, otherIncome: otherIncome!, essentialExpense: rent! + transport! + essential! };
}

function readAssets(portfolio: Portfolio, goalId: string | undefined, issues: OpeningIssue[]) {
  let unrestrictedLiquid = 0n;
  let linkedAssets = 0n;
  let otherAssets = 0n;
  for (const [index, asset] of portfolio.assets.entries()) {
    const value = parseNonnegativeMoney(asset.currentValueMinor, `assets.${index}.currentValueMinor`, issues);
    if (asset.currency !== "CNY") issues.push({ code: "UNSUPPORTED_CURRENCY", field: `assets.${index}.currency`, message: "当前模拟只支持人民币资产。" });
    if (!asset.id.trim()) issues.push({ code: "INVALID_ASSET", field: `assets.${index}.id`, message: "资产缺少 ID。" });
    if (value === null) continue;
    if (goalId && asset.goalId === goalId) linkedAssets += value;
    else if (!asset.goalId && ["T0", "D7", "D30"].includes(asset.liquidityLevel)) unrestrictedLiquid += value;
    else otherAssets += value;
  }
  return { unrestrictedLiquid, linkedAssets, otherAssets };
}

function readLiabilities(portfolio: Portfolio, issues: OpeningIssue[]) {
  const liabilities: SimulationOpening["liabilities"] = [];
  for (const [index, liability] of portfolio.liabilities.entries()) {
    const balance = parseNonnegativeMoney(liability.outstandingBalanceMinor, `liabilities.${index}.outstandingBalanceMinor`, issues);
    const payment = parseNonnegativeMoney(liability.monthlyPaymentMinor, `liabilities.${index}.monthlyPaymentMinor`, issues);
    if (!liability.id.trim()) issues.push({ code: "INVALID_LIABILITY", field: `liabilities.${index}.id`, message: "负债缺少 ID。" });
    if (balance !== null && payment !== null) liabilities.push({ id: liability.id, balanceMinor: balance.toString(), scheduledPaymentMinor: payment.toString() });
  }
  return liabilities;
}

function resolveFundingKind(confirmation: OpeningConfirmation, linked: bigint, declared: bigint, requests: OpeningRequest[], issues: OpeningIssue[]) {
  const automaticFundingKind: FundingKind | null = linked > 0n && declared > 0n ? null : declared > 0n ? "DECLARED_ONLY" : "LINKED_ASSETS_ONLY";
  const fundingKind = automaticFundingKind ?? confirmation.goalFundingKind;
  if (!fundingKind) requests.push({ field: "goalFundingKind", message: "请确认目标已准备金额与绑定资产是否重叠。", options: ["LINKED_ASSETS_ONLY", "DECLARED_ONLY", "CONFIRMED_DISJOINT"] });
  if (fundingKind && !["LINKED_ASSETS_ONLY", "DECLARED_ONLY", "CONFIRMED_DISJOINT"].includes(fundingKind)) issues.push({ code: "INVALID_FUNDING_BASIS", field: "goalFundingKind", message: "目标资金口径无效。" });
  if (automaticFundingKind && confirmation.goalFundingKind && confirmation.goalFundingKind !== automaticFundingKind) issues.push({ code: "INVALID_FUNDING_BASIS", field: "goalFundingKind", message: "只有一种非零资金来源时使用自动确认口径。" });
  return { fundingKind, automaticFundingKind };
}

function resolveConfirmations(confirmation: OpeningConfirmation, finances: { income: bigint; expense: bigint; linked: bigint; declared: bigint; liabilities: SimulationOpening["liabilities"] }, issues: OpeningIssue[]) {
  const requests: OpeningRequest[] = [];
  const flexible = confirmation.flexibleExpenseMinor === undefined ? null : parseNonnegativeMoney(confirmation.flexibleExpenseMinor, "flexibleExpenseMinor", issues);
  if (confirmation.flexibleExpenseMinor === undefined) requests.push({ field: "flexibleExpenseMinor", message: "请确认每月可选支出；确实没有时填写 0。" });
  const zeroFields = new Set(confirmation.confirmedZeroFields ?? []);
  if (finances.income === 0n && !zeroFields.has("MONTHLY_INCOME")) requests.push({ field: "MONTHLY_INCOME", message: "请确认月收入确实为 0。" });
  if (finances.expense === 0n && !zeroFields.has("ESSENTIAL_EXPENSE")) requests.push({ field: "ESSENTIAL_EXPENSE", message: "请确认每月必需支出确实为 0。" });
  if (finances.liabilities.some((item) => BigInt(item.balanceMinor) > 0n) && finances.liabilities.every((item) => BigInt(item.scheduledPaymentMinor) === 0n) && !zeroFields.has("DEBT_PAYMENT")) requests.push({ field: "DEBT_PAYMENT", message: "存在负债，请确认每月还款确实为 0。" });
  return { requests, flexible, zeroFields, ...resolveFundingKind(confirmation, finances.linked, finances.declared, requests, issues) };
}

function createRealOpening(input: OpeningInput, selection: { planning: Planning; plan: Plan; goal: Goal }, timeline: { startMonth: string; endMonth: string }, profileAmounts: { stableIncome: bigint; otherIncome: bigint; essentialExpense: bigint }, assetAmounts: { unrestrictedLiquid: bigint; linkedAssets: bigint; otherAssets: bigint }, liabilities: SimulationOpening["liabilities"], declaredPrepared: bigint, target: bigint, contribution: bigint, confirmed: ReturnType<typeof resolveConfirmations>): FrozenSimulationOpening {
  const { portfolio } = input;
  const { planning, plan, goal } = selection;
  const { linkedAssets, unrestrictedLiquid, otherAssets } = assetAmounts;
  const fundingKind = confirmed.fundingKind!;
  const initialGoalFunded = fundingKind === "LINKED_ASSETS_ONLY" ? linkedAssets : fundingKind === "DECLARED_ONLY" ? declaredPrepared : linkedAssets + declaredPrepared;
  const opening: SimulationOpening = {
    source: { kind: "REAL", workspaceId: portfolio.id, portfolioRevision: portfolio.portfolioRevision, planSetId: planning.id, planKey: plan.key, goalId: goal.id, capturedAt: input.capturedAt },
    startMonth: timeline.startMonth, endMonth: timeline.endMonth, currency: "CNY", strategy: strategyFor(plan.key),
    ageAtStart: portfolio.profile!.age, familyStatus: portfolio.profile!.familyStatus?.trim() || null,
    unrestrictedLiquidMinor: unrestrictedLiquid.toString(),
    goalFunding: { kind: fundingKind, linkedAssetsMinor: linkedAssets.toString(), declaredPreparedMinor: declaredPrepared.toString() },
    initialGoalFundedMinor: initialGoalFunded.toString(), otherAssetValueMinor: otherAssets.toString(), liabilities,
    stableIncomeMinor: profileAmounts.stableIncome.toString(), otherIncomeMinor: profileAmounts.otherIncome.toString(),
    essentialExpenseMinor: profileAmounts.essentialExpense.toString(), flexibleExpenseMinor: confirmed.flexible!.toString(),
    goal: { id: goal.id, name: goal.name, type: goal.type, targetMinor: target.toString(), targetMonth: timeline.endMonth, plannedContributionMinor: contribution.toString(), flexible: goal.isFlexible },
    assumptions: [
      { field: "openingFinances", source: "LEDGER", note: `底账版本 ${portfolio.portfolioRevision}` },
      { field: "goalPlan", source: "PLAN", note: `方案 ${plan.key}` },
      { field: "flexibleExpenseMinor", source: "USER_CONFIRMED", note: "本次开局确认的月可选支出" },
      { field: "goalFunding", source: confirmed.automaticFundingKind ? "LEDGER" : "USER_CONFIRMED", note: `目标资金口径：${fundingKind}` },
      ...([...confirmed.zeroFields] as ZeroConfirmation[]).map((field) => ({ field, source: "USER_CONFIRMED" as const, note: "本次开局确认金额为 0" })),
    ],
  };
  return frozen(opening);
}

export function buildRealSimulationOpening(input: OpeningInput, confirmation: OpeningConfirmation = {}): OpeningResult {
  const issues: OpeningIssue[] = [];
  validateBase(input, issues);
  const selection = resolveSelection(input, issues);
  const timeline = resolveTimeline(input.asOfDate, selection?.plan.targetDate, issues);
  const profileAmounts = readProfile(input.portfolio.profile, issues);
  const assetAmounts = readAssets(input.portfolio, selection?.goal.id, issues);
  const liabilities = readLiabilities(input.portfolio, issues);
  const declaredPrepared = selection ? parseNonnegativeMoney(selection.goal.preparedAmountMinor, "goal.preparedAmountMinor", issues) : null;
  const target = selection ? parseNonnegativeMoney(selection.plan.targetAmountMinor, "planning.targetAmountMinor", issues) : null;
  const contribution = selection ? parseNonnegativeMoney(selection.plan.monthlyContributionMinor, "planning.monthlyContributionMinor", issues) : null;
  if (target === 0n) issues.push({ code: "INVALID_TARGET", field: "planning.targetAmountMinor", message: "目标金额必须大于 0。" });
  if (issues.length || !selection || !timeline || !profileAmounts || declaredPrepared === null || target === null || contribution === null) return { status: "INVALID", issues };
  const confirmed = resolveConfirmations(confirmation, { income: profileAmounts.stableIncome + profileAmounts.otherIncome, expense: profileAmounts.essentialExpense, linked: assetAmounts.linkedAssets, declared: declaredPrepared, liabilities }, issues);
  if (issues.length) return { status: "INVALID", issues };
  if (confirmed.requests.length) return { status: "NEEDS_CONFIRMATION", requests: confirmed.requests };
  return { status: "READY", opening: createRealOpening(input, selection, timeline, profileAmounts, assetAmounts, liabilities, declaredPrepared, target, contribution, confirmed) };
}

export function buildDemoSimulationOpening(asOfDate: string, capturedAt: string): OpeningResult {
  const issues: OpeningIssue[] = [];
  const asOf = parseDate(asOfDate, "asOfDate", issues);
  if (!isValidIsoTimestamp(capturedAt)) issues.push({ code: "INVALID_DATE", field: "capturedAt", message: "采集时间无效。" });
  if (issues.length) return { status: "INVALID", issues };
  const startMonth = monthAt(asOf!, 1);
  const endMonth = monthAt(asOf!, 60);
  const opening: SimulationOpening = {
    source: { kind: "DEMO", sampleId: "financial-life-demo-v1", capturedAt },
    startMonth, endMonth, currency: "CNY", strategy: "BALANCED", ageAtStart: 30, familyStatus: "SINGLE",
    unrestrictedLiquidMinor: "2000000",
    goalFunding: { kind: "LINKED_ASSETS_ONLY", linkedAssetsMinor: "3000000", declaredPreparedMinor: "0" },
    initialGoalFundedMinor: "3000000",
    otherAssetValueMinor: "5000000",
    liabilities: [{ id: "demo-housing-debt", balanceMinor: "3000000", scheduledPaymentMinor: "100000" }],
    stableIncomeMinor: "1500000", otherIncomeMinor: "0", essentialExpenseMinor: "700000", flexibleExpenseMinor: "250000",
    goal: { id: "demo-goal", name: "五年后购房", type: "HOME_PURCHASE", targetMinor: "20000000", targetMonth: endMonth, plannedContributionMinor: "300000", flexible: true },
    assumptions: [{ field: "sample", source: "CATALOG_HYPOTHESIS", note: "虚构示例人生；所有金额仅用于试玩" }],
  };
  return { status: "READY", opening: frozen(opening) };
}
