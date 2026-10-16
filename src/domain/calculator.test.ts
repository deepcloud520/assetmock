import { describe, expect, it } from "vitest";
import { calculateWealth } from "./calculator";

const baseInput = {
  revision: 7,
  asOf: "2026-09-14T00:00:00.000Z",
  profile: {
    riskLevel: "BALANCED",
    stableMonthlyIncomeMinor: "2000000",
    otherMonthlyIncomeMinor: "0",
    rentExpenseMinor: "300000",
    transportExpenseMinor: "100000",
    essentialExpenseMinor: "400000",
  },
  assets: [
    { id: "cash", name: "应急金", type: "BANK_DEPOSIT", currentValueMinor: "6000000", liquidityLevel: "T0", riskLevel: 1, goalId: null },
    { id: "fund", name: "指数基金", type: "EQUITY_FUND", currentValueMinor: "4000000", liquidityLevel: "D7", riskLevel: 4, goalId: null },
    { id: "home", name: "自住房", type: "REAL_ESTATE", currentValueMinor: "20000000", liquidityLevel: "ILLIQUID", riskLevel: 3, goalId: null },
  ],
  liabilities: [
    { id: "mortgage", outstandingBalanceMinor: "6000000", monthlyPaymentMinor: "300000", remainingMonths: 20 },
  ],
  goals: [{ id: "goal", name: "进修", targetAmountMinor: "1200000", targetDate: "2027-09-14", preparedAmountMinor: "200000", monthlyContributionMinor: "100000" }],
};

describe("wealth calculator", () => {
  it("calculates totals, cashflow and four-account conservation exactly", () => {
    const result = calculateWealth(baseInput);
    expect(result.summary).toEqual({
      totalAssetsMinor: "30000000",
      totalLiabilitiesMinor: "6000000",
      netWorthMinor: "24000000",
    });
    expect(result.cashflow.monthlySurplusMinor).toBe("900000");
    expect(Object.values(result.fourAccounts).reduce((total, value) => total + BigInt(value), 0n)).toBe(30_000_000n);
  });

  it("uses documented safety thresholds at their boundaries", () => {
    const result = calculateWealth(baseInput);
    expect(result.safety.emergencyCoverageMonths.value).toBe(5.4);
    expect(result.safety.emergencyCoverageMonths.status).toBe("ATTENTION");
    expect(result.safety.debtToAssetRatio.value).toBe(20);
    expect(result.safety.debtToAssetRatio.status).toBe("HEALTHY");
    expect(result.safety.debtServiceRatio.value).toBe(15);
  });

  it("projects goals without inventing an investment return", () => {
    const result = calculateWealth(baseInput);
    expect(result.goalHealth[0].monthsRemaining).toBe(12);
    expect(result.goalHealth[0].projectedAmountMinor).toBe("1400000");
    expect(result.goalHealth[0].gapMinor).toBe("0");
    expect(result.goalHealth[0].coverageRatio.status).toBe("HEALTHY");
  });

  it("returns UNKNOWN instead of dividing by zero", () => {
    const result = calculateWealth({ ...baseInput, profile: null, assets: [], liabilities: [], goals: [] });
    expect(result.healthScore).toBeNull();
    expect(result.safety.emergencyCoverageMonths.status).toBe("UNKNOWN");
    expect(result.safety.debtToAssetRatio.status).toBe("UNKNOWN");
    expect(result.concentration.hhi.status).toBe("UNKNOWN");
  });

  it("accepts a confirmed zero-debt ledger without inventing a liability", () => {
    const result = calculateWealth({ ...baseInput, ledgerConfirmed: true, liabilities: [] });
    expect(result.summary.totalLiabilitiesMinor).toBe("0");
    expect(result.completeness).toBe(100);
  });
});
