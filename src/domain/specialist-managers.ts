import { z } from "zod";
import { categoryLabels, type CatalogProduct } from "./product-catalog";
const money = z.string().regex(/^(0|[1-9]\d{0,14})$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => { const d = new Date(`${s}T00:00:00Z`); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s; }, "请填写有效日期");
export const budgetSchema = z.object({ incomeMinor: money, livingMinor: money, premiumsIncluded: z.boolean(), debtIncluded: z.boolean(), extraFixedMinor: money, proposedPremiumMinor: money.default("0"), proposedPremiumConfirmed: z.boolean().default(false), oneOffMinor: money.default("0"), oneOffMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).nullable().default(null), cuts: z.array(z.object({ name: z.string().trim().min(1).max(60), amountMinor: money, accepted: z.boolean(), impact: z.string().max(160) })).max(10).default([]), confirmed: z.literal(true), note: z.string().max(500).default("") }).strict().superRefine((v, ctx) => { if (BigInt(v.oneOffMinor) > 0n && !v.oneOffMonth) ctx.addIssue({ code: "custom", path: ["oneOffMonth"], message: "一次性费用需要指定月份" }); if (v.cuts.reduce((s, c) => s + (c.accepted ? BigInt(c.amountMinor) : 0n), 0n) > BigInt(v.livingMinor)) ctx.addIssue({ code: "custom", path: ["cuts"], message: "削减金额不能超过生活预算" }); });
export type ManagerBudget = z.infer<typeof budgetSchema>;
export const policySchema = z.object({ name: z.string().trim().min(1).max(100), insured: z.string().trim().min(1).max(80), category: z.enum(["ACCIDENT", "MEDICAL", "TERM_LIFE", "OTHER"]), coverageMinor: money.nullable(), premiumMinor: money.nullable(), paymentMonths: z.number().int().min(1).max(120), startsOn: date.nullable(), endsOn: date.nullable(), nextPaymentOn: date.nullable(), renewalOn: date.nullable(), cashValueAssetId: z.string().nullable(), confirmed: z.boolean(), note: z.string().max(600).default("") }).strict().refine((v) => !v.startsOn || !v.endsOn || v.endsOn >= v.startsOn, "保障结束日期不能早于开始日期");
export type PolicyFacts = z.infer<typeof policySchema>;
export const holdingSchema = z.object({ assetId: z.string().min(1), productName: z.string().max(120), availableOn: date.nullable(), feeMinor: money.nullable(), feeBasis: z.string().max(300), feeIncludedInLanding: z.boolean().default(false), confirmed: z.boolean(), note: z.string().max(500).default("") }).strict().refine((v) => v.feeMinor === null || Boolean(v.feeBasis.trim()), "动用费用需要填写依据");
export type HoldingFacts = z.infer<typeof holdingSchema>;
export const insuranceNeedsSchema = z.object({ status: z.enum(["UNKNOWN", "NONE", "PROVIDED"]), insured: z.string().trim().max(80), age: z.number().int().min(0).max(120).nullable(), category: z.enum(["ACCIDENT", "MEDICAL", "TERM_LIFE"]), annualBudgetMinor: money.nullable(), preference: z.enum(["COVERAGE", "LOW_COST"]), confirmed: z.literal(true) }).strict();
export const investmentNeedsSchema = z.object({ category: z.enum(["DEPOSIT", "MONEY_MARKET", "BOND_FUND"]), amountMinor: money, purpose: z.string().trim().min(1).max(200), neededOn: date, maxRiskLevel: z.number().int().min(1).max(5).nullable(), riskConfirmed: z.boolean(), maxRedemptionDays: z.number().int().min(0).max(365), preference: z.enum(["LIQUIDITY", "RISK"]), assetId: z.string().nullable(), decisionId: z.string().nullable(), confirmed: z.literal(true) }).strict();
export type InsuranceNeeds = z.infer<typeof insuranceNeedsSchema>;
export type InvestmentNeeds = z.infer<typeof investmentNeedsSchema>;
export function monthlyPremium(policies: PolicyFacts[]) {
  return policies.filter((p) => p.confirmed && p.premiumMinor !== null).reduce((sum, p) => sum + (BigInt(p.premiumMinor!) + BigInt(p.paymentMonths - 1)) / BigInt(p.paymentMonths), 0n);
}
export function budgetCapacity(b: ManagerBudget, debt: bigint, premium: bigint, goals: bigint) {
  const effectivePremium = b.premiumsIncluded ? 0n : premium;
  const proposed = b.proposedPremiumConfirmed ? BigInt(b.proposedPremiumMinor) : 0n;
  const base = BigInt(b.incomeMinor) - BigInt(b.livingMinor) - (b.debtIncluded ? 0n : debt) - effectivePremium - proposed - BigInt(b.extraFixedMinor) - goals;
  const accepted = b.cuts.filter((c) => c.accepted).reduce((s, c) => s + BigInt(c.amountMinor), 0n);
  return { baseMinor: base.toString(), withCutsMinor: (base + accepted).toString(), acceptedCutsMinor: accepted.toString(), effectivePremiumMinor: (effectivePremium + proposed).toString(), debtExtraMinor: (b.debtIncluded ? 0n : debt).toString(), assumptions: ["收入和预算为用户确认，流水不证明实际储蓄", b.premiumsIncluded ? "现有保费已包含在生活预算，未再次扣除" : "现有保费在生活预算之外单独预留", b.debtIncluded ? "生活预算已包含债务还款" : "现有债务另行预留", "一次性费用仅影响指定月份，不作为永久月支出"] };
}
export type ProductMatch = { product: CatalogProduct; status: "CANDIDATE" | "PENDING" | "EXCLUDED"; reasons: string[]; missing: string[]; rank: number | null };
export function screenInsurance(products: CatalogProduct[], needs: InsuranceNeeds): ProductMatch[] {
  return products.filter((p) => p.category === needs.category).map((p) => {
    const reasons: string[] = []; const missing = [...p.missing];
    if (needs.age === null) missing.push("被保险人年龄未确认");
    else if ((p.ageMin !== null && needs.age < p.ageMin) || (p.ageMax !== null && needs.age > p.ageMax)) reasons.push("年龄不满足产品明确条件");
    if (p.ageMin === null || p.ageMax === null) missing.push("产品年龄条件待核实");
    if (!needs.insured) missing.push("保障对象待确认");
    missing.push("当前销售状态和最终承保需向渠道核实");
    if (needs.annualBudgetMinor !== null) missing.push("个人报价尚未获取，无法判断是否符合保费预算");
    return { product: p, status: reasons.length ? "EXCLUDED" : missing.length ? "PENDING" : "CANDIDATE", reasons: reasons.length ? reasons : [`属于用户关注的${categoryLabels[needs.category]}`, `优先核对${needs.preference === "LOW_COST" ? "费用与预算" : "保障责任"}；尚不作适配排序`], missing: [...new Set(missing)], rank: null };
  });
}
export function screenInvestments(products: CatalogProduct[], needs: InvestmentNeeds, asOf: string, forbidden = false): ProductMatch[] {
  const rows: ProductMatch[] = products.filter((p) => p.category === needs.category).map((p) => {
    const reasons: string[] = []; const missing: string[] = [];
    if (forbidden) reasons.push("所选资金受保护或已占用，不能推荐动用");
    if (needs.neededOn <= asOf) reasons.push("用款日期已到，需先核对实际安排");
    if (p.minimumMinor === null) missing.push("产品最低投入待核实");
    else if (BigInt(needs.amountMinor) < BigInt(p.minimumMinor)) reasons.push("金额低于最低投入");
    if (p.redemptionDays === null) missing.push("渠道赎回到账时间待核实");
    else if (p.redemptionDays > needs.maxRedemptionDays) reasons.push("到账速度不满足要求");
    if (p.termMonths !== null) { const maturity = new Date(`${asOf}T00:00:00Z`); maturity.setUTCMonth(maturity.getUTCMonth() + p.termMonths); if (maturity.toISOString().slice(0, 10) > needs.neededOn) reasons.push("约定到期日晚于用款日期；提前支取有代价"); }
    if (p.category !== "DEPOSIT") {
      if (!needs.riskConfirmed || needs.maxRiskLevel === null) missing.push("用户风险条件尚未明确确认");
      if (p.riskLevel === null) missing.push("实际渠道风险等级待核实");
      else if (needs.riskConfirmed && needs.maxRiskLevel !== null && p.riskLevel > needs.maxRiskLevel) reasons.push("风险超过确认范围");
    }
    return { product: p, status: reasons.length ? "EXCLUDED" : missing.length ? "PENDING" : "CANDIDATE", reasons: reasons.length ? reasons : ["类别符合本次资金用途筛选", "已知期限、起存及办理条件符合输入；实际办理前仍需核实渠道和报价"], missing, rank: null };
  });
  rows.sort((a, b) => { const score = (x: ProductMatch) => x.status === "CANDIDATE" ? 0 : x.status === "PENDING" ? 1 : 2; const group = score(a) - score(b); if (group) return group; const metric = (x: ProductMatch) => needs.preference === "LIQUIDITY" ? x.product.redemptionDays ?? Infinity : x.product.riskLevel ?? (x.product.category === "DEPOSIT" ? 0 : Infinity); return metric(a) - metric(b) || a.product.id.localeCompare(b.product.id); });
  let rank = 0; for (const row of rows) if (row.status === "CANDIDATE") row.rank = ++rank;
  return rows;
}
