import { z } from "zod";
import type { CarContext, CarFacts, CarScenario } from "./car-planning";
export const naturalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => { const d = new Date(`${v}T00:00:00Z`); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v; }, "日期无效");
export const fen = z.string().regex(/^(0|[1-9]\d{0,14})$/);
export const today = (date = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
export const constraintSchema = z.object({ decisionId: z.string().nullable(), scope: z.enum(["GLOBAL", "DECISION"]), type: z.enum(["NO_USE_ASSET", "NO_USE_EMERGENCY", "MAX_DEBT_RATIO", "NO_NEW_DEBT", "NO_USE_GOAL_FUND", "MIN_LIQUID", "OTHER"]), operator: z.enum(["LT", "LTE", "EQ", "GT", "GTE", "NOT_USE", "MANUAL"]), thresholdValue: fen.nullable(), unit: z.enum(["CENTS", "BPS"]).nullable(), currency: z.literal("CNY").nullable(), assetId: z.string().nullable(), goalId: z.string().nullable(), userText: z.string().trim().min(1).max(500), checkScope: z.enum(["RECALC", "RECOMMEND", "BOTH"]).default("BOTH"), confirm: z.literal(true) }).strict().superRefine((v, c) => {
  const issue = (message: string) => c.addIssue({ code: "custom", message });
  if ((v.scope === "DECISION") !== Boolean(v.decisionId)) issue("请明确约束作用域");
  if (["NO_USE_ASSET", "NO_NEW_DEBT", "NO_USE_GOAL_FUND"].includes(v.type) && (v.operator !== "NOT_USE" || v.thresholdValue !== null || v.unit !== null || v.currency !== null)) issue("不动用约束使用NOT_USE且不填阈值");
  if ((v.type === "NO_USE_ASSET") !== Boolean(v.assetId)) issue("指定资产约束必须且仅能关联资产");
  if ((v.type === "NO_USE_GOAL_FUND") !== Boolean(v.goalId)) issue("目标资金约束必须且仅能关联目标");
  if (["MIN_LIQUID", "NO_USE_EMERGENCY"].includes(v.type) && (!v.thresholdValue || v.unit !== "CENTS" || v.currency !== "CNY" || !["GT", "GTE"].includes(v.operator))) issue("资金下限需要金额和GTE或GT");
  if (v.type === "MAX_DEBT_RATIO" && (v.thresholdValue === null || BigInt(v.thresholdValue) > 10000n || v.unit !== "BPS" || v.currency !== null || !["LT", "LTE"].includes(v.operator))) issue("还款比例需要0—10000基点和LTE或LT");
  if (v.type === "OTHER" && (v.operator !== "MANUAL" || v.thresholdValue !== null || v.unit !== null || v.currency !== null)) issue("其他红线需要人工判断");
});
export type ConstraintInput = z.infer<typeof constraintSchema>;
export type ConstraintRule = Omit<ConstraintInput, "confirm"> & { id: string; thresholdValue: string | null };
export type ConstraintCheck = { constraintId: string; candidateKey: string; result: "PASS" | "VIOLATED" | "UNDETERMINED" | "SKIPPED_MANUAL"; detail: { actual: string | null; threshold: string | null; text: string } };
const compare = (a: bigint, b: bigint, op: string) => op === "GTE" ? a >= b : op === "GT" ? a > b : op === "LTE" ? a <= b : op === "LT" ? a < b : a === b;
export function checkRedLine(c: ConstraintRule, s: CarScenario, f: CarFacts, context: CarContext, goalAssets: Record<string, string[]> = {}): ConstraintCheck {
  let actual: bigint | null = null; let pass: boolean | null = null;
  if (c.type === "OTHER") return { constraintId: c.id, candidateKey: s.key, result: "SKIPPED_MANUAL", detail: { actual: null, threshold: null, text: c.userText } };
  if (c.type === "NO_NEW_DEBT") { actual = BigInt(s.loanPrincipalMinor); pass = actual === 0n; }
  if (c.type === "NO_USE_ASSET") { actual = s.funding.filter((x) => x.assetId === c.assetId).reduce((sum, x) => sum + BigInt(x.usedMinor), 0n); pass = f.sourcesConfirmed ? actual === 0n : null; }
  if (c.type === "NO_USE_GOAL_FUND") { const ids = c.goalId ? goalAssets[c.goalId] : undefined; if (ids && f.otherGoalsConfirmed) { actual = s.funding.filter((x) => x.assetId && ids.includes(x.assetId)).reduce((sum, x) => sum + BigInt(x.usedMinor), 0n); pass = actual === 0n; } }
  if (["MIN_LIQUID", "NO_USE_EMERGENCY"].includes(c.type) && f.sourcesConfirmed && f.constraintsConfirmed && !context.missing.length && s.timeline.length) { actual = BigInt(s.minimumBalanceMinor); pass = compare(actual, BigInt(c.thresholdValue!), c.operator); }
  if (c.type === "MAX_DEBT_RATIO" && f.cashflowConfirmed && f.monthlyIncomeMinor !== null && BigInt(f.monthlyIncomeMinor) > 0n) {
    const income = BigInt(f.monthlyIncomeMinor); const repayments = s.timeline.map((t) => BigInt(t.loanPaymentMinor) + BigInt(context.monthlyDebtMinor));
    const peak = repayments.reduce((a, b) => a > b ? a : b, 0n); actual = (peak * 10000n + income - 1n) / income;
    pass = compare(peak * 10000n, BigInt(c.thresholdValue!) * income, c.operator);
  }
  return { constraintId: c.id, candidateKey: s.key, result: pass === null ? "UNDETERMINED" : pass ? "PASS" : "VIOLATED", detail: { actual: actual?.toString() ?? null, threshold: c.thresholdValue, text: c.userText } };
}
export type BudgetInterval = { id: string; validFrom: string; validTo: string | null; livingMinor: bigint; dataJson: string };
export type ScheduledItem = { budgetVersionId: string; kind: string; amountMinor: bigint; allocation: string; dueDay: number | null; dueOn: string | null; includedInLiving: boolean; monthlyEquivalentMinor?: bigint | null };
export function budgetForMonth(versions: BudgetInterval[], items: ScheduledItem[], month: string) {
  const start = `${month}-01`; const [y, m] = month.split("-").map(Number); const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10); const missing: string[] = []; const segments: { id: string; from: string; to: string; days: number }[] = [];
  let numerator = 0n; let includedDue = 0n; let includedUnknown = false; let scheduledExtra = 0n; let expenseUnknown = false; let covered = 0;
  for (const v of versions) { const from = v.validFrom > start ? v.validFrom : start; const to = v.validTo && v.validTo < end ? v.validTo : end; if (from >= to) continue; const count = Math.round((Date.parse(to) - Date.parse(from)) / 86400000); const included = items.filter((i) => i.budgetVersionId === v.id && i.includedInLiving).reduce((sum, i) => sum + (i.monthlyEquivalentMinor ?? i.amountMinor), 0n); let cuts = 0n; try { const data = JSON.parse(v.dataJson) as { cuts?: { accepted: boolean; amountMinor: string }[] }; cuts = (data.cuts ?? []).filter((c) => c.accepted).reduce((sum, c) => sum + BigInt(c.amountMinor), 0n); } catch { missing.push("消费调整口径需核实"); }
    const variable = v.livingMinor - included - cuts;
    if (variable < 0n) missing.push("生活预算不足以包含固定承诺"); numerator += (variable < 0n ? 0n : variable) * BigInt(count); covered += count; segments.push({ id: v.id, from, to, days: count }); }
  if (covered !== days) missing.push(`本月有${days - covered}天预算未确认`);
  const totals: Record<string, bigint> = {};
  for (const item of items) { if (item.allocation === "DAILY") continue; const segment = segments.find((s) => s.id === item.budgetVersionId); if (!segment) continue;
    const due = item.dueOn ?? (item.dueDay ? `${month}-${String(Math.min(item.dueDay, days)).padStart(2, "0")}` : null);
    if (!due && item.amountMinor === 0n) continue;
    if (!due) { if (item.includedInLiving) includedUnknown = true; if (item.kind !== "INCOME") expenseUnknown = true; missing.push(`${item.kind}到账或缴费日期未核实`); continue; }
    if (due >= segment.from && due < segment.to) { totals[item.kind] = (totals[item.kind] ?? 0n) + item.amountMinor; if (item.includedInLiving) includedDue += item.amountMinor; else if (item.kind !== "INCOME") scheduledExtra += item.amountMinor; }
  }
  const living = covered === days && !includedUnknown ? includedDue + (numerator + BigInt(Math.floor(days / 2))) / BigInt(days) : null;
  return { month, expenseMinor: living === null || expenseUnknown ? null : (living + scheduledExtra).toString(), openingVersionId: versions.find((v) => v.validFrom <= start && (!v.validTo || v.validTo > start))?.id ?? null, segments, livingMinor: living?.toString() ?? null, totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, v.toString()])), missing: [...new Set(missing)] };
}
