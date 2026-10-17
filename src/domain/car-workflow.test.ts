import { describe, expect, it } from "vitest";
import { carFactsSchema, evaluateCarPlan } from "./car-planning";
import { carWorkflow, explicitFactPatch, invalidateCarConfirmations, isCarIntent } from "./car-workflow";
describe("progressive questions and explicit interpretation", () => {
  it("asks at most two current-stage questions and accepts unknown budget", () => {
    const f = carFactsSchema.parse({ purpose: "通勤买车", targetMonth: "2027-04" });
    const workflow = carWorkflow(f, "100000");
    expect(workflow.step).toBe("cashflow"); expect(workflow.questions.length).toBeLessThanOrEqual(2);
    expect(workflow.notRelevant).toContain("当前全款路径无需贷款报价"); expect(workflow.partialBalanceMinor).toBeNull();
  });
  it("offers a qualified partial cashflow result before knowing costs", () => {
    const f = carFactsSchema.parse({ monthlyIncomeMinor: "1000000", livingExpensesMinor: "500000", cashflowConfirmed: true });
    expect(carWorkflow(f, "100000").partialBalanceMinor).toBe("400000");
    expect(carWorkflow(f, "100000").partialLabel).toContain("不能当作购车预算");
  });
  it("preserves unrelated confirmations when an income fact is changed", () => {
    const f = carFactsSchema.parse({ monthlyIncomeMinor: "1000000", cashflowConfirmed: true, costsConfirmed: true });
    expect(invalidateCarConfirmations(f, { monthlyIncomeMinor: "900000" })).toEqual({ cashflowConfirmed: false });
    expect(invalidateCarConfirmations(f, { budgetMinor: "10000000" })).toEqual({});
  });
  it("extracts only explicit money and precise dates in fallback", () => {
    expect(explicitFactPatch("2027年4月买车，预算12万元，月收入15000元")).toEqual({ targetMonth: "2027-04", budgetMinor: "12000000", monthlyIncomeMinor: "1500000" });
    expect(explicitFactPatch("明年想买车，还不知道预算").targetMonth).toBeUndefined();
    expect(isCarIntent("想买车还是买房")).toBe(false); expect(isCarIntent("不想买车")).toBe(false); expect(isCarIntent("想买辆自行车")).toBe(false);
  });
  it("offers materially cheaper choices even when the desired budget fits, and respects confirmed cash-only", () => {
    const f = carFactsSchema.parse({ purpose: "买车", targetMonth: "2027-04", budgetMinor: "10000000", landingFeesMinor: "1000000", runningMonthlyMinor: "100000", replacedTransportMinor: "0", monthlyIncomeMinor: "1500000", livingExpensesMinor: "700000", monthlyPremiumMinor: "0", reserveFloorMinor: "3000000", cashflowConfirmed: true, costsConfirmed: true, insuranceConfirmed: true, constraintsConfirmed: true, sourcesConfirmed: true, otherGoalsConfirmed: true, loan: { quoted: true, annualRatePercent: "0", rateBasis: "NOMINAL_ANNUAL", termMonths: 12, downPaymentPercent: 50, maxPrincipalMinor: "10000000", method: "EQUAL_PAYMENT", feeMinor: "0" } });
    const result = evaluateCarPlan(f, { asOfMonth: "2026-10", portfolioRevision: 1, transactionRevision: 0, sources: [{ id: "cash", assetId: "cash", name: "存款", amountMinor: "20000000", month: "2026-10" }], protectedSources: [], monthlyDebtMinor: "0", otherGoalMonthlyMinor: "0", otherGoalReserveMinor: "0", missing: [], cashOnly: true });
    expect(result.scenarios.some((s) => s.method === "LOAN")).toBe(false);
    const current = result.scenarios.find((s) => s.strategy === "ON_TIME")!; const lower = result.scenarios.find((s) => s.strategy === "MORE_ROOM")!;
    expect(BigInt(lower.upfrontMinor)).toBeLessThan(BigInt(current.upfrontMinor)); expect(BigInt(lower.minimumBalanceMinor)).toBeGreaterThan(BigInt(current.minimumBalanceMinor));
  });
});
