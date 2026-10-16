import { describe, expect, it } from "vitest";
import { buildDemoSimulationOpening, buildRealSimulationOpening, type OpeningInput } from "./financial-life-simulation-opening";

const asOfDate = "2026-09-29";
const capturedAt = "2026-09-29T04:00:00.000Z";

function input(): OpeningInput {
  return {
    asOfDate, capturedAt,
    portfolio: {
      id: "workspace-1", portfolioRevision: 7, ledgerConfirmedAt: "2026-09-28T00:00:00.000Z",
      profile: {
        age: 32, familyStatus: "SINGLE", stableMonthlyIncomeMinor: "1200000", otherMonthlyIncomeMinor: "100000",
        rentExpenseMinor: "300000", transportExpenseMinor: "50000", essentialExpenseMinor: "250000",
      },
      assets: [
        { id: "cash", currentValueMinor: "2000000", currency: "CNY", liquidityLevel: "T0", goalId: null },
        { id: "goal-liquid", currentValueMinor: "3000000", currency: "CNY", liquidityLevel: "T0", goalId: "goal-1" },
        { id: "other-goal", currentValueMinor: "1000000", currency: "CNY", liquidityLevel: "D7", goalId: "goal-2" },
        { id: "long-term", currentValueMinor: "4000000", currency: "CNY", liquidityLevel: "Y1", goalId: null },
      ],
      liabilities: [{ id: "loan-1", outstandingBalanceMinor: "5000000", monthlyPaymentMinor: "120000" }],
      goals: [{ id: "goal-1", name: "购房", type: "HOME_PURCHASE", preparedAmountMinor: "500000", isFlexible: true }],
    },
    planning: {
      id: "plan-set-1", sourceRevision: 7, isStale: false, goalId: "goal-1", selectedPlanKey: "B",
      plans: [{ key: "B", targetDate: "2030-09-15T00:00:00.000Z", targetAmountMinor: "30000000", monthlyContributionMinor: "400000" }],
    },
  };
}

describe("financial life simulation opening", () => {
  it("requests optional expenses and overlapping goal funding before returning an opening", () => {
    const result = buildRealSimulationOpening(input());
    expect(result.status).toBe("NEEDS_CONFIRMATION");
    if (result.status !== "NEEDS_CONFIRMATION") return;
    expect(result.requests.map((request) => request.field)).toEqual(["flexibleExpenseMinor", "goalFundingKind"]);
  });

  it.each([
    ["LINKED_ASSETS_ONLY", "3000000"],
    ["DECLARED_ONLY", "500000"],
    ["CONFIRMED_DISJOINT", "3500000"],
  ] as const)("builds a frozen real opening with %s funding", (goalFundingKind, fundedMinor) => {
    const source = input();
    const result = buildRealSimulationOpening(source, { flexibleExpenseMinor: "150000", goalFundingKind });
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.opening).toMatchObject({
      source: { kind: "REAL", workspaceId: "workspace-1", portfolioRevision: 7, planSetId: "plan-set-1", planKey: "B", goalId: "goal-1" },
      startMonth: "2026-10", endMonth: "2030-09", strategy: "BALANCED",
      unrestrictedLiquidMinor: "2000000", otherAssetValueMinor: "5000000", initialGoalFundedMinor: fundedMinor,
      essentialExpenseMinor: "600000", flexibleExpenseMinor: "150000",
      goal: { id: "goal-1", type: "HOME_PURCHASE", targetMonth: "2030-09" },
      liabilities: [{ id: "loan-1", balanceMinor: "5000000", scheduledPaymentMinor: "120000" }],
    });
    expect(Object.isFrozen(result.opening)).toBe(true);
    expect(Object.isFrozen(result.opening.liabilities)).toBe(true);
    source.portfolio.assets[0].currentValueMinor = "9999999";
    expect(result.opening.unrestrictedLiquidMinor).toBe("2000000");
  });

  it("automatically uses the only nonzero goal funding source and accepts missing demographic fields", () => {
    const source = input();
    source.portfolio.goals[0].preparedAmountMinor = "0";
    source.portfolio.profile!.age = null;
    source.portfolio.profile!.familyStatus = null;
    const result = buildRealSimulationOpening(source, { flexibleExpenseMinor: "0" });
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.opening.goalFunding.kind).toBe("LINKED_ASSETS_ONLY");
    expect(result.opening.initialGoalFundedMinor).toBe("3000000");
    expect(result.opening.ageAtStart).toBeNull();
    expect(result.opening.familyStatus).toBeNull();
  });

  it("automatically uses declared funding when no assets are linked to the goal", () => {
    const source = input();
    source.portfolio.assets[1].goalId = null;
    const result = buildRealSimulationOpening(source, { flexibleExpenseMinor: "0" });
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.opening.goalFunding.kind).toBe("DECLARED_ONLY");
    expect(result.opening.initialGoalFundedMinor).toBe("500000");
    expect(result.opening.unrestrictedLiquidMinor).toBe("5000000");
  });

  it("requires explicit confirmation of zero income, essential spending and debt payment", () => {
    const source = input();
    source.portfolio.profile!.stableMonthlyIncomeMinor = "0";
    source.portfolio.profile!.otherMonthlyIncomeMinor = "0";
    source.portfolio.profile!.rentExpenseMinor = "0";
    source.portfolio.profile!.transportExpenseMinor = "0";
    source.portfolio.profile!.essentialExpenseMinor = "0";
    source.portfolio.liabilities[0].monthlyPaymentMinor = "0";
    source.portfolio.goals[0].preparedAmountMinor = "0";
    const pending = buildRealSimulationOpening(source, { flexibleExpenseMinor: "0" });
    expect(pending.status).toBe("NEEDS_CONFIRMATION");
    if (pending.status !== "NEEDS_CONFIRMATION") return;
    expect(pending.requests.map((request) => request.field)).toEqual(["MONTHLY_INCOME", "ESSENTIAL_EXPENSE", "DEBT_PAYMENT"]);
    const ready = buildRealSimulationOpening(source, { flexibleExpenseMinor: "0", confirmedZeroFields: ["MONTHLY_INCOME", "ESSENTIAL_EXPENSE", "DEBT_PAYMENT"] });
    expect(ready.status).toBe("READY");
  });

  it("rejects unconfirmed ledgers, stale plans and missing selected plans", () => {
    const source = input();
    source.portfolio.ledgerConfirmedAt = null;
    source.planning!.isStale = true;
    source.planning!.selectedPlanKey = null;
    const result = buildRealSimulationOpening(source);
    expect(result.status).toBe("INVALID");
    if (result.status !== "INVALID") return;
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["LEDGER_UNCONFIRMED", "STALE_PLAN", "MISSING_SELECTED_PLAN"]));
  });

  it("rejects invalid money, dates and a goal ending before the first full month", () => {
    const source = input();
    source.portfolio.assets[0].currentValueMinor = "-1";
    source.planning!.plans[0].targetDate = "2026-09-30";
    const result = buildRealSimulationOpening(source);
    expect(result.status).toBe("INVALID");
    if (result.status !== "INVALID") return;
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["INVALID_AMOUNT", "TARGET_EXPIRED"]));
    expect(buildRealSimulationOpening({ ...input(), asOfDate: "2026-02-30" }).status).toBe("INVALID");
    expect(buildRealSimulationOpening({ ...input(), capturedAt: "2026-02-30T04:00:00.000Z" }).status).toBe("INVALID");
  });

  it("rejects missing financial amounts and invalid goal dates", () => {
    const source = input();
    source.portfolio.profile!.stableMonthlyIncomeMinor = undefined as unknown as string;
    source.planning!.plans[0].targetDate = "2027-02-30T00:00:00.000Z";
    const result = buildRealSimulationOpening(source);
    expect(result.status).toBe("INVALID");
    if (result.status !== "INVALID") return;
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["INVALID_AMOUNT", "INVALID_DATE"]));
  });

  it("accepts 240 months but rejects 241 months", () => {
    const source = input();
    source.planning!.plans[0].targetDate = "2046-09-01";
    expect(buildRealSimulationOpening(source, { flexibleExpenseMinor: "0", goalFundingKind: "LINKED_ASSETS_ONLY" }).status).toBe("READY");
    source.planning!.plans[0].targetDate = "2046-10-01";
    const result = buildRealSimulationOpening(source);
    expect(result.status).toBe("INVALID");
    if (result.status === "INVALID") expect(result.issues.map((issue) => issue.code)).toContain("HORIZON_TOO_LONG");
  });

  it("returns a labeled fixed demo without a fabricated workspace or plan", () => {
    const result = buildDemoSimulationOpening(asOfDate, capturedAt);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.opening.source).toEqual({ kind: "DEMO", sampleId: "financial-life-demo-v1", capturedAt });
    expect(result.opening).toMatchObject({ startMonth: "2026-10", endMonth: "2031-09", initialGoalFundedMinor: "3000000" });
    expect(Object.isFrozen(result.opening.goal)).toBe(true);
    expect(buildDemoSimulationOpening("2026-02-30", capturedAt).status).toBe("INVALID");
  });
});
