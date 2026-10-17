import { describe, expect, it } from "vitest";
import { runLifeFinancialSimulation, simulationGranularity, type ScenarioEvent, type SimulationSnapshot } from "./life-financial-simulation";

const snapshot: SimulationSnapshot = {
  sourceRevision: 1, currentDate: "2026-09-21", targetDate: "2027-08-01", initialCashMinor: "1000000", initialLiabilityMinor: "600000",
  monthlyIncomeMinor: "100000", monthlyExpenseMinor: "40000", monthlyDebtPaymentMinor: "20000", missingFields: [],
  goal: { id: "goal", name: "购房", targetAmountMinor: "3000000", preparedAmountMinor: "300000", monthlyContributionMinor: "10000" },
};

const incomeInterruption: ScenarioEvent = { kind: "INCOME_CHANGE", label: "收入中断", startMonth: 2, durationMonths: 3, oneTimeExpenseMinor: "0", monthlyExpenseChangeMinor: "0", incomeDuringEventMinor: "0", incomeAfterEventMinor: "100000" };

describe("life financial simulation", () => {
  it("applies an income interruption only across its configured months", () => {
    const result = runLifeFinancialSimulation(snapshot, incomeInterruption);
    expect(result.monthlyResults).toHaveLength(12);
    expect(result.monthlyResults[1].incomeMinor).toBe("100000");
    expect(result.monthlyResults[2].incomeMinor).toBe("0");
    expect(result.monthlyResults[4].incomeMinor).toBe("0");
    expect(result.monthlyResults[5].incomeMinor).toBe("100000");
  });

  it("keeps one-time expense in exactly one month and aggregates quarterly", () => {
    const event: ScenarioEvent = { kind: "LARGE_EXPENSE", label: "医疗支出", startMonth: 1, durationMonths: null, oneTimeExpenseMinor: "500000", monthlyExpenseChangeMinor: "10000", incomeDuringEventMinor: null, incomeAfterEventMinor: null };
    const result = runLifeFinancialSimulation({ ...snapshot, targetDate: "2028-09-01" }, event);
    expect(result.monthlyResults[1].expenseMinor).toBe("550000");
    expect(result.monthlyResults[2].expenseMinor).toBe("50000");
    expect(result.periods).toHaveLength(9);
  });

  it("uses month, quarter and half-year display intervals", () => {
    expect(simulationGranularity("2026-09-01", "2027-08-01")).toBe("MONTH");
    expect(simulationGranularity("2026-09-01", "2028-09-01")).toBe("QUARTER");
    expect(simulationGranularity("2026-09-01", "2032-09-01")).toBe("HALF_YEAR");
  });

  it("restores baseline after a temporary family income change", () => {
    const result = runLifeFinancialSimulation(snapshot, { ...incomeInterruption, kind: "FAMILY_CHANGE", incomeDuringEventMinor: "-30000", monthlyExpenseChangeMinor: "5000" });
    expect(result.monthlyResults[2]).toMatchObject({ incomeMinor: "70000", expenseMinor: "45000", monthlyBalanceMinor: "-5000" });
    expect(result.monthlyResults[5]).toMatchObject({ incomeMinor: "100000", expenseMinor: "40000" });
  });

  it("caps the last debt payment and retains negative cash", () => {
    const result = runLifeFinancialSimulation({ ...snapshot, initialCashMinor: "0", initialLiabilityMinor: "25000", monthlyIncomeMinor: "0" }, { ...incomeInterruption, startMonth: 0, durationMonths: null });
    expect(result.monthlyResults[0]).toMatchObject({ debtPaymentMinor: "20000", cashBalanceMinor: "-70000", liabilityBalanceMinor: "5000" });
    expect(result.monthlyResults[1]).toMatchObject({ debtPaymentMinor: "5000", liabilityBalanceMinor: "0" });
    expect(result.monthlyResults[2].debtPaymentMinor).toBe("0");
    expect(result.monthlyResults[0].riskFlags).toContain("现金不足");
    expect(result.monthlyResults.at(-1)?.incomeMinor).toBe("0");
  });

  it("aggregates cross-quarter events and preserves a partial final period", () => {
    const result = runLifeFinancialSimulation({ ...snapshot, targetDate: "2027-10-15" }, incomeInterruption);
    expect(result.periods[0].incomeMinor).toBe("200000");
    expect(result.periods[1].incomeMinor).toBe("100000");
    expect(result.periods.at(-1)?.months).toHaveLength(2);
    expect(result.periods.at(-1)?.cashBalanceMinor).toBe(result.monthlyResults.at(-1)?.cashBalanceMinor);
    const total = (values: { incomeMinor: string }[]) => values.reduce((sum, item) => sum + BigInt(item.incomeMinor), 0n);
    expect(total(result.periods)).toBe(total(result.monthlyResults));
  });
});
