export const ACCOUNT_NAMES = { liquidity: "流动账户", protection: "保障账户", goal: "目标账户", growth: "增长账户" } as const;
export type AccountKey = keyof typeof ACCOUNT_NAMES;
export function assetAccount(asset: { type: string; goalId: string | null }): AccountKey {
  if (asset.goalId) return "goal";
  if (asset.type === "INSURANCE_CASH_VALUE") return "protection";
  if (["CASH", "BANK_DEPOSIT", "MONEY_MARKET"].includes(asset.type)) return "liquidity";
  return "growth";
}
