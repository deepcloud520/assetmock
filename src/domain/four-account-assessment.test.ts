import { describe, expect, it } from "vitest";
import { accountProgress, currentFourAccountRatios } from "./four-account-assessment";
import type { WealthCalculation } from "./calculator";

function calculation(total: string): WealthCalculation {
  return { summary: { totalAssetsMinor: total }, fourAccounts: { liquidityMinor: "2500", protectionMinor: "0", goalMinor: "2500", growthMinor: "5000" } } as WealthCalculation;
}

describe("four-account assessment helpers", () => {
  it("uses calculated asset amounts for current ratios", () => {
    expect(currentFourAccountRatios(calculation("10000"))).toEqual({ liquidity: 0.25, protection: 0, goal: 0.25, growth: 0.5 });
    expect(currentFourAccountRatios(calculation("0"))).toEqual({ liquidity: null, protection: null, goal: null, growth: null });
  });

  it("caps progress and handles zero targets", () => {
    expect(accountProgress(0.4, 0.2)).toBe(100);
    expect(accountProgress(0, 0)).toBe(0);
    expect(accountProgress(0.1, 0)).toBe(100);
    expect(accountProgress(null, 0.2)).toBe(0);
  });
});
