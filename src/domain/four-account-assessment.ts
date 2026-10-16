import type { WealthCalculation } from "./calculator";

export const FOUR_ACCOUNT_KEYS = ["liquidity", "protection", "goal", "growth"] as const;
export type FourAccountKey = typeof FOUR_ACCOUNT_KEYS[number];

export type FourAccountReport = {
  account: FourAccountKey;
  name: string;
  currentRatio: number | null;
  targetRatio: number;
  targetRange: [number, number];
  gap: number | null;
  score: number;
  summary: string;
  positiveFactors: string[];
  issues: string[];
  riskFlags: string[];
  keyReasons: string[];
  suggestions: string[];
};

export type FourAccountAssessment = {
  promptVersion: string;
  dataCompleteness: "complete" | "partially_complete" | "insufficient";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  missingFields: string[];
  allocationRationale: string;
  goalImpacts: Array<{
    goal: string;
    accountImpacts: Record<FourAccountKey, "increase" | "decrease" | "neutral" | "unknown">;
    reason: string;
  }>;
  accounts: FourAccountReport[];
  classificationUncertain: string[];
  importantAssumptions: string[];
};

export function currentFourAccountRatios(calculation: WealthCalculation): Record<FourAccountKey, number | null> {
  const total = BigInt(calculation.summary.totalAssetsMinor);
  if (total <= 0n) return { liquidity: null, protection: null, goal: null, growth: null };
  const ratio = (value: string) => Number((BigInt(value) * 1_000_000n) / total) / 1_000_000;
  return {
    liquidity: ratio(calculation.fourAccounts.liquidityMinor),
    protection: ratio(calculation.fourAccounts.protectionMinor),
    goal: ratio(calculation.fourAccounts.goalMinor),
    growth: ratio(calculation.fourAccounts.growthMinor),
  };
}

export function accountProgress(currentRatio: number | null, targetRatio: number) {
  if (currentRatio === null) return 0;
  if (targetRatio === 0) return currentRatio === 0 ? 0 : 100;
  return Math.min(100, Math.max(0, currentRatio / targetRatio * 100));
}
