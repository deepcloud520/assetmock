import { describe, expect, it } from "vitest";
import { addMonths, calculateCarScenario, carFactsSchema, currentCarMonth, evaluateCarPlan, loanSchedule, type CarContext, type CarFacts } from "./car-planning";

export function factsFixture(overrides: Partial<CarFacts> = {}): CarFacts {
  return carFactsSchema.parse({ targetMonth: "2027-04", budgetMinor: "12000000", landingFeesMinor: "1000000", runningMonthlyMinor: "100000", replacedTransportMinor: "0", monthlyIncomeMinor: "1500000", livingExpensesMinor: "700000", monthlyPremiumMinor: "100000", reserveFloorMinor: "3000000", cashflowConfirmed: true, insuranceConfirmed: true, constraintsConfirmed: true, costsConfirmed: true, sourcesConfirmed: true, otherGoalsConfirmed: true, ...overrides });
}
export function contextFixture(overrides: Partial<CarContext> = {}): CarContext {
  return { asOfMonth: "2026-10", portfolioRevision: 1, transactionRevision: 0, sources: [{ id: "ASSET:cash", assetId: "cash", name: "现金", amountMinor: "20000000", month: "2026-10" }], protectedSources: [], monthlyDebtMinor: "0", otherGoalMonthlyMinor: "0", otherGoalReserveMinor: "0", missing: [], ...overrides };
}
const loan: NonNullable<CarFacts["loan"]> = { quoted: true, annualRatePercent: "3.6", rateBasis: "NOMINAL_ANNUAL", termMonths: 36, downPaymentPercent: 30, maxPrincipalMinor: "15000000", method: "EQUAL_PAYMENT", feeMinor: "100000" };

describe("car decision calculator", () => {
  it("allows an unknown budget and derives a cash ceiling from actual funds and six months of savings", () => {
    const result = evaluateCarPlan(factsFixture({ budgetMinor: null }), contextFixture());
    expect(result.missing).toEqual([]);
    expect(result.budgetRanges).toEqual([{ method: "CASH", maxBudgetMinor: "20200000" }]);
    expect(result.scenarios[0].minimumBalanceMinor).toBe("3000000");
  });
  it("does not treat unconfirmed zeros as facts", () => {
    const result = evaluateCarPlan(carFactsSchema.parse({}), contextFixture());
    expect(result.missing).toContain("可持续月收入".replace("可持续", "持续"));
    expect(result.missing).toContain("确认收支与原有债务口径");
    expect(result.scenarios).toEqual([]);
  });
  it("funding traces add up exactly to own funds, and each surplus month has a distinct identity", () => {
    const result = evaluateCarPlan(factsFixture({ budgetMinor: "20200000" }), contextFixture());
    const scenario = result.scenarios.find((s) => s.strategy === "ON_TIME")!;
    expect(scenario.feasible).toBe(true);
    expect(scenario.funding.reduce((sum, source) => sum + BigInt(source.usedMinor), 0n)).toBe(BigInt(scenario.upfrontMinor));
    expect(new Set(scenario.funding.map((s) => s.id)).size).toBe(scenario.funding.length);
  });
  it("cannot spend money that arrives after purchase but can postpone to maturity", () => {
    const context = contextFixture({ sources: [{ id: "a", assetId: "a", name: "活期", amountMinor: "4000000", month: "2026-10" }, { id: "b", assetId: "b", name: "到期存款", amountMinor: "16000000", month: "2027-05" }] });
    const result = evaluateCarPlan(factsFixture(), context);
    expect(result.scenarios.find((s) => s.strategy === "ON_TIME")?.feasible).toBe(false);
    expect(result.scenarios.find((s) => s.strategy === "DELAY")?.purchaseMonth).toBe("2027-05");
    expect(result.scenarios.find((s) => s.strategy === "DELAY")?.feasible).toBe(true);
  });
  it("never allows a transient emergency reserve breach, even when a later bonus fills it", () => {
    const result = evaluateCarPlan(factsFixture({ bonuses: [{ id: "bonus", name: "奖金", amountMinor: "30000000", month: "2027-04", confirmed: true }] }), contextFixture({ sources: [] }));
    expect(result.scenarios.every((s) => !s.feasible)).toBe(true);
  });
  it("only counts accepted cuts and shows the no-cut alternative", () => {
    const cut = { id: "cut", name: "娱乐", amountMinor: "100000", impact: "减少两次聚餐", accepted: false };
    const without = evaluateCarPlan(factsFixture({ cuts: [cut] }), contextFixture());
    const withCuts = evaluateCarPlan(factsFixture({ cuts: [{ ...cut, accepted: true }] }), contextFixture());
    expect(BigInt(withCuts.budgetRanges[0].maxBudgetMinor) - BigInt(without.budgetRanges[0].maxBudgetMinor)).toBe(600000n);
    expect(withCuts.scenarios[0].monthlyWithoutCutsMinor).toBe(without.scenarios[0].monthlyAfterPurchaseMinor);
  });
  it("includes debt, other goal funding and all running costs once", () => {
    const result = calculateCarScenario(factsFixture(), contextFixture({ monthlyDebtMinor: "200000", otherGoalMonthlyMinor: "100000" }), "ON_TIME", "CASH", 12000000n, "2027-04");
    expect(result.monthlyAfterPurchaseMinor).toBe("300000");
  });
  it("reports no feasible recommendation when recurring cash flow is negative", () => {
    const result = evaluateCarPlan(factsFixture({ runningMonthlyMinor: "900000" }), contextFixture());
    expect(result.recommendedKey).toBeNull();
    expect(result.scenarios.every((s) => !s.adoptable)).toBe(true);
  });
  it("computes zero interest and both amortization methods with exact principal conservation", () => {
    for (const method of ["EQUAL_PAYMENT", "EQUAL_PRINCIPAL"] as const) {
      const payments = loanSchedule("10001", { ...loan, annualRatePercent: "0", termMonths: 3, method });
      expect(payments.reduce((s, p) => s + BigInt(p.principalMinor), 0n)).toBe(10001n);
      expect(payments.every((p) => p.interestMinor === "0")).toBe(true);
    }
    const principal = loanSchedule("10000", { ...loan, annualRatePercent: "12", termMonths: 2, method: "EQUAL_PRINCIPAL" });
    expect(principal.map((p) => p.paymentMinor)).toEqual(["5100", "5050"]);
    const payment = loanSchedule("10000", { ...loan, annualRatePercent: "12", termMonths: 2 });
    expect(payment.map((p) => p.paymentMinor)).toEqual(["5075", "5075"]);
  });
  it("includes upfront loan fees and prevents adopting assumed quotes", () => {
    const result = evaluateCarPlan(factsFixture({ loan: { ...loan, quoted: false } }), contextFixture());
    const scenario = result.scenarios.find((s) => s.key === "ON_TIME_LOAN")!;
    expect(scenario.upfrontMinor).toBe("4700000");
    expect(scenario.loanPrincipalMinor).toBe("8400000");
    expect(scenario.feasible).toBe(true); expect(scenario.adoptable).toBe(false);
    expect(scenario.loanPayments).toHaveLength(36);
  });
  it("uses the Chinese calendar month and handles year changes", () => {
    expect(currentCarMonth(new Date("2026-10-31T16:00:00Z"))).toBe("2026-11");
    expect(addMonths("2026-12", 2)).toBe("2027-02");
  });
  it("rejects duplicate funding, invalid money and cuts larger than spending", () => {
    expect(carFactsSchema.safeParse({ monthlyIncomeMinor: "NaN" }).success).toBe(false);
    expect(carFactsSchema.safeParse({ sources: [{ assetId: "x", amountMinor: "1", availableMonth: "2026-10", use: true }, { assetId: "x", amountMinor: "1", availableMonth: "2026-10", use: true }] }).success).toBe(false);
    expect(carFactsSchema.safeParse({ ...factsFixture(), cuts: [{ id: "c", name: "削减", amountMinor: "800000", impact: "", accepted: true }] }).success).toBe(false);
  });
});
