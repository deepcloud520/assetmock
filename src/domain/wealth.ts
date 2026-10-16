import { z } from "zod";

export const riskProfileSchema = z.enum([
  "CONSERVATIVE",
  "MODERATE_CONSERVATIVE",
  "BALANCED",
  "MODERATE_AGGRESSIVE",
  "AGGRESSIVE",
]);

export const assetTypeSchema = z.enum([
  "CASH",
  "BANK_DEPOSIT",
  "MONEY_MARKET",
  "BOND",
  "BOND_FUND",
  "EQUITY",
  "EQUITY_FUND",
  "REAL_ESTATE",
  "INSURANCE_CASH_VALUE",
  "PENSION",
  "ALTERNATIVE",
  "OTHER",
]);

export const liquiditySchema = z.enum(["T0", "D7", "D30", "Y1", "GT_Y1", "ILLIQUID"]);
export const ruleStatusSchema = z.enum(["HEALTHY", "ATTENTION", "RISK", "UNKNOWN"]);
export const dataSourceSchema = z.enum(["USER_INPUT", "SYSTEM_CALCULATED", "AI_GENERATED", "EXTERNAL_SOURCE"]);

export type RiskProfile = z.infer<typeof riskProfileSchema>;
export type AssetType = z.infer<typeof assetTypeSchema>;
export type Liquidity = z.infer<typeof liquiditySchema>;
export type RuleStatus = z.infer<typeof ruleStatusSchema>;
export type DataSource = z.infer<typeof dataSourceSchema>;

