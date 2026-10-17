import BigNumber from "bignumber.js";
import { z } from "zod";

// All public money values are integer fen strings. Month arithmetic is calendar based.
export const carMoneySchema = z.string().max(13).regex(/^\d+$/, "金额须为非负整数分").refine((v) => /^\d+$/.test(v) && BigInt(v) <= 1_000_000_000_000n, "金额超出支持范围");
const money = carMoneySchema;
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "请选择月份").refine((s) => Number(s.slice(0, 4)) >= 2000 && Number(s.slice(0, 4)) <= 2200);
export const carLoanSchema = z.object({
    quoted: z.boolean(), annualRatePercent: z.string().regex(/^\d{1,2}(\.\d{1,6})?$/, "请输入名义年利率（百分比）"),
    rateBasis: z.literal("NOMINAL_ANNUAL"), termMonths: z.number().int().min(1).max(84),
    downPaymentPercent: z.number().min(0).max(100), maxPrincipalMinor: money,
    method: z.enum(["EQUAL_PAYMENT", "EQUAL_PRINCIPAL"]), feeMinor: money,
  }).strict();
export const carFactsSchema = z.object({
  purpose: z.string().trim().max(400).default(""),
  targetMonth: monthSchema.nullable().default(null),
  budgetMinor: money.nullable().default(null),
  maxDelayMonths: z.number().int().min(0).max(60).default(12),
  landingFeesMinor: money.nullable().default(null),
  runningMonthlyMinor: money.nullable().default(null),
  replacedTransportMinor: money.nullable().default(null),
  monthlyIncomeMinor: money.nullable().default(null),
  livingExpensesMinor: money.nullable().default(null),
  monthlyPremiumMinor: money.nullable().default(null),
  reserveFloorMinor: money.nullable().default(null),
  cashflowConfirmed: z.boolean().default(false),
  insuranceConfirmed: z.boolean().default(false),
  coverageNotes: z.string().max(1000).default(""),
  constraintsConfirmed: z.boolean().default(false),
  costsConfirmed: z.boolean().default(false),
  sourcesConfirmed: z.boolean().default(false),
  otherGoalsConfirmed: z.boolean().default(false),
  goalReconciliations: z.array(z.object({ goalId: z.string().min(1), preparedIncludesLinked: z.boolean() }).strict()).max(100).default([]),
  sources: z.array(z.object({ assetId: z.string().min(1), amountMinor: money, availableMonth: monthSchema.nullable(), feeMinor: money.nullable().optional(), detailsConfirmed: z.boolean().optional(), use: z.boolean() }).strict()).max(100).default([]),
  bonuses: z.array(z.object({ id: z.string().min(1).max(80), name: z.string().trim().min(1).max(80), amountMinor: money, month: monthSchema, confirmed: z.boolean() }).strict()).max(24).default([]),
  cuts: z.array(z.object({ id: z.string().min(1).max(80), name: z.string().trim().min(1).max(80), amountMinor: money, impact: z.string().max(240), accepted: z.boolean() }).strict()).max(20).default([]),
  loan: carLoanSchema.nullable().default(null),
  unifiedPlanning: z.boolean().optional(),
  loanOffers: z.array(carLoanSchema.extend({ id: z.string().min(1).max(80), label: z.string().max(100), requestedPrincipalMinor: money.nullable().optional() })).max(8).optional(),
  maxMonthlyPaymentMinor: money.nullable().optional(),

}).strict().superRefine((v, ctx) => {
  for (const [key, ids] of [["loanOffers", (v.loanOffers ?? []).map((o) => o.id)], ["sources", v.sources.map((s) => s.assetId)], ["bonuses", v.bonuses.map((s) => s.id)], ["cuts", v.cuts.map((s) => s.id)], ["goalReconciliations", v.goalReconciliations.map((s) => s.goalId)]] as const) {
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: [key], message: "记录不能重复" });
  }
  const cut = v.cuts.filter((c) => c.accepted).reduce((a, c) => a + BigInt(c.amountMinor), 0n);
  if (v.livingExpensesMinor !== null && cut + BigInt(v.replacedTransportMinor ?? "0") > BigInt(v.livingExpensesMinor)) ctx.addIssue({ code: "custom", path: ["cuts"], message: "削减消费与替代交通费不能超过生活支出，不能重复计算" });
});
export type CarFacts = z.infer<typeof carFactsSchema>;
export type CarSource = { id: string; assetId: string | null; name: string; amountMinor: string; month: string; priority?: number; feeMinor?: string };
export type CarContext = {
  accountAssets?: import("./goal-funding-report").ReportAsset[];
  horizonMonths?: number;
  asOfMonth: string; portfolioRevision: number; transactionRevision: number;
  sources: CarSource[]; protectedSources: { name: string; reason: string; amountMinor: string }[];
  monthlyDebtMinor: string; otherGoalMonthlyMinor: string; otherGoalReserveMinor: string;
  missing: string[]; additionalExpenses?: { month: string; amountMinor: string }[]; cashOnly?: boolean; preferenceEvidence?: { id: string; content: string; nature: string; status: string; evidenceType: string; rule: { kind?: string; assetId?: string }; scope: string; sourceRef: string; quote: string }[];
};
export type LoanPayment = { month: number; principalMinor: string; interestMinor: string; paymentMinor: string };
export type CarScenario = {
  purchaseAssetRemaining?: Record<string, string>; purchaseAccumulatedMinor?: string;
  loanOfferId?: string; loanTerms?: NonNullable<CarFacts["loan"]>; financingCostMinor?: string; requiredSavingMinor?: string;
  key: string; strategy: "ON_TIME" | "LOWER_BUDGET" | "DELAY" | "MORE_ROOM"; method: "CASH" | "LOAN";
  budgetMinor: string; purchaseMonth: string; landingTotalMinor: string; upfrontMinor: string;
  loanPrincipalMinor: string; loanInterestMinor: string; loanPayments: LoanPayment[];
  feasible: boolean; adoptable: boolean; reasons: string[];
  monthlyAfterPurchaseMinor: string; monthlyWithoutCutsMinor: string; minimumBalanceMinor: string;
  monthlySavingMinor: string; balanceBeforePurchaseMinor: string;
  funding: (CarSource & { usedMinor: string })[];
  timeline: { month: string; balanceMinor: string; netMinor: string; loanPaymentMinor: string }[];
};
export type CarEvaluation = {
  report?: import("./goal-funding-report").FundingReport;
  evaluationId?: string; sourceSignature?: string;
  formulaVersion: string; asOfMonth: string; portfolioRevision: number; transactionRevision: number;
  redLineChecks?: import("./database-planning").ConstraintCheck[];
  recommendationReason?: string; preferenceEvidence?: CarContext["preferenceEvidence"];
  missing: string[]; assumptions: string[]; budgetRanges: { method: "CASH" | "LOAN"; maxBudgetMinor: string }[];
  scenarios: CarScenario[]; recommendedKey: string | null;
  protectedSources: CarContext["protectedSources"];
  assessments: { manager: string; conclusion: string; issues: string[] }[];
  savingsSuggestions: { name: string; guidance: string }[];
};
const n = (s: string | null) => BigInt(s ?? "0");
const min = (a: bigint, b: bigint) => a < b ? a : b;
export function currentCarMonth(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit" }).formatToParts(date);
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
}
export function monthIndex(month: string) { return Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1; }
export function addMonths(month: string, offset: number) {
  const index = monthIndex(month) + offset;
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`;
}

export function loanSchedule(principalMinor: string, loan: NonNullable<CarFacts["loan"]>): LoanPayment[] {
  let balance = new BigNumber(principalMinor);
  const principal = balance;
  const rate = new BigNumber(loan.annualRatePercent).div(1200);
  const payment = rate.isZero() ? principal.div(loan.termMonths) : principal.times(rate).times(rate.plus(1).pow(loan.termMonths)).div(rate.plus(1).pow(loan.termMonths).minus(1));
  return Array.from({ length: loan.termMonths }, (_, i) => {
    const interest = balance.times(rate).integerValue(BigNumber.ROUND_HALF_UP);
    const fixedPrincipal = principal.div(loan.termMonths).integerValue(BigNumber.ROUND_DOWN);
    const scheduled = loan.method === "EQUAL_PRINCIPAL" ? fixedPrincipal : payment.integerValue(BigNumber.ROUND_HALF_UP).minus(interest);
    const paid = i === loan.termMonths - 1 ? balance : BigNumber.maximum(0, BigNumber.minimum(balance, scheduled));
    balance = balance.minus(paid);
    return { month: i + 1, principalMinor: paid.toFixed(0), interestMinor: interest.toFixed(0), paymentMinor: paid.plus(interest).toFixed(0) };
  });
}
function savings(facts: CarFacts, includeCuts: boolean) {
  return includeCuts ? facts.cuts.filter((c) => c.accepted).reduce((sum, c) => sum + n(c.amountMinor), 0n) : 0n;
}

export function calculateCarScenario(facts: CarFacts, context: CarContext, strategy: CarScenario["strategy"], method: CarScenario["method"], price: bigint, purchaseMonth: string, includeCuts = true): CarScenario {
  const upfrontFees = n(facts.landingFeesMinor) + (method === "LOAN" ? n(facts.loan?.feeMinor ?? null) : 0n);
  const loanPrincipal = method === "LOAN" && facts.loan ? min(n(facts.loan.maxPrincipalMinor), BigInt(new BigNumber(price.toString()).times(new BigNumber(100).minus(facts.loan.downPaymentPercent)).div(100).integerValue(BigNumber.ROUND_DOWN).toFixed(0))) : 0n;
  const schedule = method === "LOAN" && facts.loan ? loanSchedule(loanPrincipal.toString(), facts.loan) : [];
  const upfront = price + upfrontFees - loanPrincipal;
  const base = n(facts.monthlyIncomeMinor) - n(facts.livingExpensesMinor) - n(facts.monthlyPremiumMinor) - n(context.monthlyDebtMinor) - n(context.otherGoalMonthlyMinor);
  const accepted = savings(facts, includeCuts);
  const runningDelta = n(facts.runningMonthlyMinor) - n(facts.replacedTransportMinor);
  const floor = n(facts.reserveFloorMinor) + n(context.otherGoalReserveMinor);
  const delay = monthIndex(purchaseMonth) - monthIndex(context.asOfMonth);
  const horizon = Math.max(context.horizonMonths ?? 0, delay + Math.max(12, schedule.length), 12);
  const sources = [...context.sources, ...facts.bonuses.filter((b) => b.confirmed && b.month >= context.asOfMonth).map((b) => ({ id: `BONUS:${b.id}`, assetId: null, name: b.name, amountMinor: b.amountMinor, month: b.month }))];
  let balance = 0n; let minimum = 0n; let balanceBeforePurchase = 0n;
  const buckets: (CarSource & { remaining: bigint })[] = [];
  const funding: CarScenario["funding"] = [];
  function withdraw(amount: bigint, record: boolean) {
    let remaining = amount;
    if (facts.unifiedPlanning) buckets.sort((a, b) => (a.priority ?? (a.assetId ? 2 : 1)) - (b.priority ?? (b.assetId ? 2 : 1)) || (BigInt(a.feeMinor ?? "0") < BigInt(b.feeMinor ?? "0") ? -1 : BigInt(a.feeMinor ?? "0") > BigInt(b.feeMinor ?? "0") ? 1 : 0) || a.month.localeCompare(b.month) || a.id.localeCompare(b.id));
    for (const source of buckets) {
      const used = min(remaining, source.remaining);
      source.remaining -= used; remaining -= used;
      if (record && used > 0n) funding.push({ id: source.id, assetId: source.assetId, name: source.name, amountMinor: source.amountMinor, month: source.month, usedMinor: used.toString() });
    }
  }
  let purchaseAssetRemaining: Record<string, string> | undefined; let purchaseAccumulatedMinor: string | undefined;
  const reasons: string[] = []; const timeline: CarScenario["timeline"] = [];
  for (let i = 0; i <= horizon; i++) {
    const month = addMonths(context.asOfMonth, i);
    const arriving = sources.filter((s) => (i === 0 ? s.month <= month : s.month === month));
    const released = arriving.reduce((sum, s) => sum + n(s.amountMinor), 0n);
    buckets.push(...arriving.map((source) => ({ ...source, remaining: n(source.amountMinor) })));
    const payment = i > delay && i <= delay + schedule.length ? n(schedule[i - delay - 1].paymentMinor) : 0n;
    // Current month is the confirmed starting balance; no unconfirmed current-month savings.
    const oneOff = (context.additionalExpenses ?? []).filter((e) => e.month === month).reduce((sum, e) => sum + n(e.amountMinor), 0n);
    const net = (i === 0 ? 0n : base + accepted - (i > delay ? runningDelta + payment : 0n)) - oneOff;
    balance += released + net;
    if (net > 0n) buckets.push({ id: `SURPLUS:${month}`, assetId: null, name: `${month}结余（已扣除其他承诺）`, amountMinor: net.toString(), month, remaining: net });
    else if (net < 0n) withdraw(-net, false);
    if (i === delay) {
      balanceBeforePurchase = balance; withdraw(upfront, true); balance -= upfront;
      if (facts.unifiedPlanning) {
        purchaseAssetRemaining = Object.fromEntries(buckets.filter(b => b.assetId).map(b => [b.assetId!, b.remaining.toString()]));
        purchaseAccumulatedMinor = buckets.filter(b => !b.assetId).reduce((v,b) => v + b.remaining, 0n).toString();
      }
    }
    minimum = i === 0 ? balance : min(minimum, balance);
    if (balance < floor && !reasons.includes("储备底线不足")) reasons.push("储备底线不足");
    if (i > delay && net + oneOff < 0n && !reasons.includes("购车后每月持续入不敷出")) reasons.push("购车后每月持续入不敷出");
    timeline.push({ month, balanceMinor: balance.toString(), netMinor: net.toString(), loanPaymentMinor: payment.toString() });
  }
  if (delay < 0) reasons.push("购车时间已过去");
  if (price <= 0n) reasons.push("预算不足以购买车辆");
  if (funding.reduce((sum, source) => sum + n(source.usedMinor), 0n) < upfront) reasons.push("购车当月可用资金不足");
  const firstPayment = n(schedule[0]?.paymentMinor ?? "0");
  return {
    ...(facts.unifiedPlanning ? { purchaseAssetRemaining, purchaseAccumulatedMinor } : {}),
    key: `${strategy}_${method}`, strategy, method, budgetMinor: price.toString(), purchaseMonth,
    landingTotalMinor: (price + n(facts.landingFeesMinor)).toString(), upfrontMinor: upfront.toString(),
    loanPrincipalMinor: loanPrincipal.toString(), loanInterestMinor: schedule.reduce((s, p) => s + n(p.interestMinor), 0n).toString(), loanPayments: schedule,
    feasible: reasons.length === 0 && context.missing.length === 0,
    adoptable: reasons.length === 0 && context.missing.length === 0 && (method === "CASH" || Boolean(facts.loan?.quoted)),
    monthlySavingMinor: (base + accepted > 0n ? base + accepted : 0n).toString(), balanceBeforePurchaseMinor: balanceBeforePurchase.toString(),
    reasons, monthlyAfterPurchaseMinor: (base + accepted - runningDelta - firstPayment).toString(),
    monthlyWithoutCutsMinor: (base - runningDelta - firstPayment).toString(), minimumBalanceMinor: minimum.toString(), funding, timeline,
  };
}
function maxBudget(facts: CarFacts, context: CarContext, method: CarScenario["method"]) {
  let low = 0n; let high = 1_000_000_000_000n;
  // Price=0 has a semantic error but is a valid mathematical lower bound.
  const affordable = (price: bigint) => calculateCarScenario(facts, context, "LOWER_BUDGET", method, price, facts.targetMonth!).reasons.filter((r) => r !== "预算不足以购买车辆").length === 0;
  if (!affordable(0n)) return 0n;
  while (low < high) {
    const mid = (low + high + 1n) / 2n;
    if (affordable(mid)) low = mid; else high = mid - 1n;
  }
  return low;
}
export function carMissingInformation(facts: CarFacts, rawContext: CarContext, purchased = false): string[] {
  const missing = [...rawContext.missing];
  for (const [key, label] of [["targetMonth", "期望购车月份"], ["landingFeesMinor", "落地费用"], ["runningMonthlyMinor", "养车开支"], ["replacedTransportMinor", "替代交通支出"], ["monthlyIncomeMinor", "持续月收入"], ["livingExpensesMinor", "生活月支出"], ["monthlyPremiumMinor", "月均保费与年度费用预留"], ["reserveFloorMinor", "应急储备底线"]] as const) if (facts[key] === null && !(purchased && key === "targetMonth")) missing.push(label);
  for (const [key, label] of [["cashflowConfirmed", "确认收支与原有债务口径"], ["insuranceConfirmed", "确认已有保障资料及保费"], ["constraintsConfirmed", "确认储备和长期资产使用边界"], ["costsConfirmed", "确认购车及养车费用"], ["sourcesConfirmed", "确认资金来源和可用月份"], ["otherGoalsConfirmed", "确认其他目标占款与月投入"]] as const) if (!facts[key]) missing.push(label);
  if (!purchased && facts.targetMonth && (monthIndex(facts.targetMonth) < monthIndex(rawContext.asOfMonth) || monthIndex(facts.targetMonth) - monthIndex(rawContext.asOfMonth) > 60)) missing.push("购车月份须在当前月份至未来60个月内");
  return [...new Set(missing)];
}
export function evaluateCarPlan(facts: CarFacts, rawContext: CarContext): CarEvaluation {
  if (facts.unifiedPlanning) return evaluateUnifiedCarPlan(facts, rawContext);
  const context = { ...rawContext, missing: carMissingInformation(facts, rawContext) };
  const methods: CarScenario["method"][] = facts.loan && !context.cashOnly ? ["CASH", "LOAN"] : ["CASH"];
  const ranges = context.missing.length ? [] : methods.map((method) => ({ method, maxBudgetMinor: maxBudget(facts, context, method).toString() }));
  const scenarios: CarScenario[] = [];
  if (!context.missing.length && facts.targetMonth) {
    for (const range of ranges) {
      const method = range.method;
      const onTime = facts.budgetMinor === null ? null : calculateCarScenario(facts, context, "ON_TIME", method, n(facts.budgetMinor), facts.targetMonth);
      if (onTime) scenarios.push(onTime);
      if (onTime?.feasible && n(facts.budgetMinor) >= 10000n) {
        const lower = n(facts.budgetMinor) * 4n / 5n / 100n * 100n;
        scenarios.push(calculateCarScenario(facts, context, "MORE_ROOM", method, lower, facts.targetMonth));
      }
      const adjusted = facts.budgetMinor !== null ? min(n(facts.budgetMinor), n(range.maxBudgetMinor)) : n(range.maxBudgetMinor);
      if (!onTime?.feasible || facts.budgetMinor === null || adjusted !== n(facts.budgetMinor)) scenarios.push(calculateCarScenario(facts, context, "LOWER_BUDGET", method, adjusted, facts.targetMonth));
      if (facts.budgetMinor !== null && !onTime?.feasible) {
        let delayed = calculateCarScenario(facts, context, "DELAY", method, n(facts.budgetMinor), facts.targetMonth);
        for (let i = 1; !delayed.feasible && i <= facts.maxDelayMonths; i++) delayed = calculateCarScenario(facts, context, "DELAY", method, n(facts.budgetMinor), addMonths(facts.targetMonth, i));
        scenarios.push(delayed);
      }
    }
  }
  const acceptedCuts = savings(facts, true);
  const assessments = [
    { manager: "收支管家", conclusion: "按持续收入扣除生活、债务、保费及其他目标投入；消费削减仅在确认后计入。", issues: [acceptedCuts > 0n ? "方案依赖已接受的消费调整，复盘须核对实际执行。" : "维持当前消费，尚未计入任何消费削减。"] },
    { manager: "保险管家", conclusion: facts.insuranceConfirmed ? "按用户确认的保障资料与保费承诺预留；不代表保障充分。" : "保障资料与保费尚未确认。", issues: facts.coverageNotes ? [facts.coverageNotes] : ["未记录具体保障内容；可补充现有保单与保障缺口。"] },
    { manager: "目标管家", conclusion: "其他目标关联资产不可动用，并保留已准备资金和月投入。", issues: context.protectedSources.filter((s) => s.reason.includes("目标")).map((s) => `${s.name}：${s.reason}`) },
    { manager: "理财管家", conclusion: "按可用月份安排资金，不计投资收益；长期资产需用户明确允许使用。", issues: context.protectedSources.filter((s) => !s.reason.includes("目标")).map((s) => `${s.name}：${s.reason}`) },
  ];
  const expressed = (context.preferenceEvidence ?? []).filter((m) => m.status === "ACTIVE" && m.evidenceType !== "INFERENCE");
  const recommendable = scenarios.filter((s) => s.adoptable && !expressed.some((m) => (m.rule.kind === "CASH_ONLY" && s.method === "LOAN") || (m.rule.kind === "EXCLUDE_ASSET" && s.funding.some((f) => f.assetId === m.rule.assetId))));
  const preferred = recommendable.find((s) => s.strategy === "ON_TIME") ?? recommendable[0];
  const recommendationReason = expressed.length ? `参考你已表达的取舍：${expressed.map((m) => m.quote).join("；")}。仅在满足资金边界且未涉及明确拒绝的取舍中，优先比较按期方案。${preferred ? "" : "当前没有符合这些取舍的可采纳候选，请先讨论调整。"}` : "根据已确认的目标时间与意向预算，优先核对可执行方案；尚未取得额外偏好，不宣称这是唯一最佳选择。低两成预算仅作取舍对照。";
  return {
    preferenceEvidence: context.preferenceEvidence, recommendationReason,
    formulaVersion: "car-plan-v2", asOfMonth: context.asOfMonth, portfolioRevision: context.portfolioRevision, transactionRevision: context.transactionRevision,
    missing: context.missing, assumptions: ["购车在所选月末完成，首期月供及新增养车开支从次月开始。", "当前月份不预估新增结余；保费及年度费用采用用户确认的月均预留。", "不计投资收益；购车后至少检查12个月，并覆盖完整贷款期限。", "现有债务按当前月还款额持续预留，直至复盘更新；未自动假设提前结清。", ...(facts.loan && !facts.loan.quoted ? ["贷款为假设试算，需取得正式报价后重新计算才能采纳。"] : [])],
    budgetRanges: ranges, scenarios, recommendedKey: preferred?.key ?? null,
    protectedSources: context.protectedSources, assessments,
    savingsSuggestions: [
      { name: "餐饮与外卖", guidance: "核对非必要餐饮，选择愿意减少的频次和金额，保留基本饮食。" },
      { name: "购物与订阅", guidance: "清理闲置订阅、延后可选购物；填写月均可减少金额与影响。" },
      { name: "娱乐与出行", guidance: "比较频次调整的生活影响，避免把购车替代的交通费再次计为节省。" },
    ],
  };
}
export function purchasedMonthlyBalance(facts: CarFacts, context: CarContext, actualPaymentMinor: string) {
  return (n(facts.monthlyIncomeMinor) - n(facts.livingExpensesMinor) - n(facts.monthlyPremiumMinor) - n(context.monthlyDebtMinor) - n(context.otherGoalMonthlyMinor) + savings(facts, true) - n(facts.runningMonthlyMinor) + n(facts.replacedTransportMinor) - n(actualPaymentMinor)).toString();
}

/** Same-date, same-budget candidates; quoted terms are never extrapolated. */
function evaluateUnifiedCarPlan(facts: CarFacts, raw: CarContext): CarEvaluation {
  const missing = carMissingInformation(facts, raw);
  if (!facts.budgetMinor || n(facts.budgetMinor) <= 0n) missing.push("确认正数购车预算");
  const offers = facts.loanOffers ?? (facts.loan ? [{ ...facts.loan, id: "legacy", label: "已有贷款条件", requestedPrincipalMinor: null }] : []);
  const delay = facts.targetMonth ? monthIndex(facts.targetMonth) - monthIndex(raw.asOfMonth) : 0;
  const context = { ...raw, missing, horizonMonths: delay + Math.max(12, ...offers.map(o => o.termMonths)) };
  const scenarios: CarScenario[] = [];
  if (!missing.length && facts.targetMonth && facts.budgetMinor) {
    const price = n(facts.budgetMinor);
    const make = (loan: CarFacts["loan"], key: string, offerId?: string) => {
      const s = calculateCarScenario({ ...facts, loan }, context, "ON_TIME", loan ? "LOAN" : "CASH", price, facts.targetMonth!);
      s.key = key; s.loanOfferId = offerId; if (loan) s.loanTerms = loan;
      s.financingCostMinor = (n(s.loanInterestMinor) + n(loan?.feeMinor ?? "0")).toString();
      const required = s.funding.filter(f => f.id.startsWith("SURPLUS:")).reduce((v, f) => v + n(f.usedMinor), 0n);
      s.requiredSavingMinor = delay > 0 ? ((required + BigInt(delay) - 1n) / BigInt(delay)).toString() : "0";
      if (facts.maxMonthlyPaymentMinor != null && s.loanPayments.some(p => n(p.paymentMinor) > n(facts.maxMonthlyPaymentMinor!))) s.reasons.push("月供超过已确认上限");
      if (s.reasons.length) { s.feasible = false; s.adoptable = false; }
      return s;
    };
    scenarios.push(make(null, "UNIFIED_CASH"));
    if (!context.cashOnly) for (const offer of offers) {
      const { id: _id, label: _label, requestedPrincipalMinor: _requested, ...terms } = offer;
      void _id; void _label; void _requested;
      const max = make(terms, `UNIFIED_${offer.id}_MIN`, offer.id);
      // Before purchase debt cannot affect cashflow. Minimum funding principal is
      // exactly the amount needed to keep the purchase-month reserve intact.
      const floor = n(facts.reserveFloorMinor) + n(context.otherGoalReserveMinor);
      const needed = price + n(facts.landingFeesMinor) + n(terms.feeMinor) + floor - n(max.balanceBeforePurchaseMinor);
      const principal = needed > 0n ? needed : 0n;
      const withinLimit = principal <= n(max.loanPrincipalMinor);
      const minimal = withinLimit ? make({ ...terms, maxPrincipalMinor: principal.toString() }, max.key, offer.id) : max;
      if (!withinLimit) { minimal.reasons = [...new Set([...minimal.reasons, "报价额度不足以保留储备底线"])]; minimal.feasible = false; minimal.adoptable = false; }
      if (n(minimal.loanPrincipalMinor) > 0n || !withinLimit) scenarios.push(minimal);
      if (offer.requestedPrincipalMinor != null && n(offer.requestedPrincipalMinor) !== n(minimal.loanPrincipalMinor)) {
        const requested = make({ ...terms, maxPrincipalMinor: offer.requestedPrincipalMinor }, `UNIFIED_${offer.id}_REQUESTED`, offer.id);
        if (n(offer.requestedPrincipalMinor) > n(max.loanPrincipalMinor)) { requested.reasons.push("指定贷款金额超过报价额度或首付限制"); requested.feasible = false; requested.adoptable = false; }
        scenarios.push(requested);
      }
    }
  }
  scenarios.sort((a,b) => Number(b.adoptable)-Number(a.adoptable) || Number(b.feasible)-Number(a.feasible) || (n(a.financingCostMinor ?? "0") < n(b.financingCostMinor ?? "0") ? -1 : n(a.financingCostMinor ?? "0") > n(b.financingCostMinor ?? "0") ? 1 : 0) || a.loanPayments.length-b.loanPayments.length || a.key.localeCompare(b.key));
  return { formulaVersion: "unified-car-v1", asOfMonth: raw.asOfMonth, portfolioRevision: raw.portfolioRevision, transactionRevision: raw.transactionRevision,
    missing: [...new Set(missing)], scenarios, recommendedKey: scenarios.find(s => s.adoptable)?.key ?? null, budgetRanges: [], protectedSources: raw.protectedSources,
    recommendationReason: "先满足资金底线和月供限制，再优先比较融资成本较低、期限较短的可采用方案。投资赎回与生活调整须另行确认。",
    assumptions: ["购车月末付款，次月开始月供和新增养车开支。", "预计结余不是实际存款，不计未来收益、加薪和未确认奖金。", "现有还款与保费按已确认月预算持续预留；变化后需复盘。", "所有候选覆盖同一时间范围，至少购车后12个月并覆盖最长贷款期限。", "贷款条件逐项核对；假设报价不能采用。"],
    assessments: [{ manager: "资产管家", conclusion: "使用同一底账核对预算、保费、可用时间、资金占用及账户变化。", issues: missing }], savingsSuggestions: [] };
}
