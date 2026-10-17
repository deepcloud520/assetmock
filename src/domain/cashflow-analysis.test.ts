import { describe, expect, it } from "vitest";
import { cashflowPeriodBounds, changeBps, ratioBps } from "./cashflow-analysis";

describe("cashflow analysis periods", () => {
  it("builds month, quarter, and year comparisons", () => {
    expect(cashflowPeriodBounds("MONTH", "2026-09-22")).toMatchObject({ label: "2026年9月", previousLabel: "2026年8月" });
    expect(cashflowPeriodBounds("QUARTER", "2026-09-22")).toMatchObject({ label: "2026年第3季度", previousLabel: "2026年第2季度" });
    expect(cashflowPeriodBounds("YEAR", "2026-09-22")).toMatchObject({ label: "2026年", previousLabel: "2025年" });
  });

  it("handles month, quarter, and year boundaries across calendar years", () => {
    const month = cashflowPeriodBounds("MONTH", "2026-01-15");
    expect(month).toMatchObject({ label: "2026年1月", previousLabel: "2025年12月" });
    expect(month.start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(month.previousStart.toISOString()).toBe("2025-12-01T00:00:00.000Z");

    const quarter = cashflowPeriodBounds("QUARTER", "2026-01-15");
    expect(quarter).toMatchObject({ label: "2026年第1季度", previousLabel: "2025年第4季度" });
    expect(quarter.end.toISOString()).toBe("2026-04-01T00:00:00.000Z");

    const year = cashflowPeriodBounds("YEAR", "2026-01-15");
    expect(year.previousStart.toISOString()).toBe("2025-01-01T00:00:00.000Z");
    expect(year.end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("uses basis points and preserves an unknown comparison base", () => {
    expect(changeBps(150n, 100n)).toBe(5000);
    expect(changeBps(150n, 0n)).toBeNull();
    expect(ratioBps(25n, 100n)).toBe(2500);
  });
});
