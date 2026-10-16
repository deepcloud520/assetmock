import { z } from "zod";
import { ledgerHeadersSchema } from "./ledger-headers";
import { assetTypeSchema, liquiditySchema, riskProfileSchema } from "./wealth";

const MAX_MONEY_MINOR = BigInt(Number.MAX_SAFE_INTEGER);

export const moneyMinorSchema = z
  .string()
  .regex(/^\d+$/, "金额必须是非负整数")
  .transform((value) => BigInt(value))
  .refine((value) => value <= MAX_MONEY_MINOR, "金额超出支持范围");

export const familyStatusSchema = z.enum([
  "SINGLE",
  "PARTNERED",
  "MARRIED_NO_CHILDREN",
  "MARRIED_WITH_CHILDREN",
  "SINGLE_PARENT",
  "OTHER",
]);

export const liabilityTypeSchema = z.enum([
  "MORTGAGE",
  "CAR_LOAN",
  "CONSUMER_LOAN",
  "CREDIT_CARD",
  "STUDENT_LOAN",
  "OTHER",
]);

export const goalTypeSchema = z.enum([
  "HOME_PURCHASE",
  "CAR_PURCHASE",
  "EDUCATION",
  "RETIREMENT",
  "ENTREPRENEURSHIP",
  "CAREER_BREAK",
  "WEALTH_GROWTH",
  "OTHER",
]);

export const profileInputSchema = z.object({
  age: z.number().int().min(18).max(100).nullable(),
  familyStatus: familyStatusSchema,
  riskLevel: riskProfileSchema,
  baseCurrency: z.literal("CNY"),
  stableMonthlyIncomeMinor: moneyMinorSchema,
  otherMonthlyIncomeMinor: moneyMinorSchema,
  rentExpenseMinor: moneyMinorSchema,
  transportExpenseMinor: moneyMinorSchema,
  essentialExpenseMinor: moneyMinorSchema,
});

export const assetInputSchema = z.object({
  name: z.string().trim().min(1, "请输入资产名称").max(60),
  type: assetTypeSchema,
  currentValueMinor: moneyMinorSchema,
  currency: z.literal("CNY"),
  liquidityLevel: liquiditySchema,
  riskLevel: z.number().int().min(1).max(5),
  isInvestable: z.boolean(),
  isAdjustable: z.boolean(),
  goalId: z.string().nullable(),
});

export const assetUserInputSchema = z.object({
  name: z.string().trim().min(1, "请输入资产名称").max(60),
  currentValueMinor: moneyMinorSchema,
  currency: z.literal("CNY").default("CNY"),
  isAdjustable: z.boolean().default(true),
});

export const repaymentMethodSchema = z.enum(["EQUAL_PAYMENT", "EQUAL_PRINCIPAL"]);

const optionalMoneySchema = moneyMinorSchema.nullable().optional();

export const liabilityInputSchema = z.object({
  name: z.string().trim().min(1, "请输入负债名称").max(60),
  type: liabilityTypeSchema.optional(),
  isInstallment: z.boolean().default(false),
  outstandingBalanceMinor: optionalMoneySchema,
  monthlyPaymentMinor: optionalMoneySchema,
  remainingMonths: z.number().int().min(1).max(1200).nullable(),
  totalRepaymentMinor: optionalMoneySchema,
  principalMinor: optionalMoneySchema,
  interestMinor: optionalMoneySchema,
  repaymentMethod: repaymentMethodSchema.nullable().optional(),
}).strict().superRefine((value, context) => {
  if (!value.isInstallment) {
    if (value.outstandingBalanceMinor === null || value.outstandingBalanceMinor === undefined) {
      context.addIssue({ code: "custom", path: ["outstandingBalanceMinor"], message: "请输入负债金额" });
    }
    return;
  }

  if (value.monthlyPaymentMinor === null || value.monthlyPaymentMinor === undefined || value.monthlyPaymentMinor <= 0n) {
    context.addIssue({ code: "custom", path: ["monthlyPaymentMinor"], message: "请输入月供" });
  }
  if (!value.remainingMonths) context.addIssue({ code: "custom", path: ["remainingMonths"], message: "请输入期限" });
  if (!value.repaymentMethod) context.addIssue({ code: "custom", path: ["repaymentMethod"], message: "请选择还款方式" });

  const hasTotal = value.totalRepaymentMinor !== null && value.totalRepaymentMinor !== undefined;
  const hasPrincipal = value.principalMinor !== null && value.principalMinor !== undefined;
  const hasInterest = value.interestMinor !== null && value.interestMinor !== undefined;
  if (!hasTotal && (!hasPrincipal || !hasInterest)) {
    context.addIssue({ code: "custom", path: ["totalRepaymentMinor"], message: "请填写本息和，或同时填写本金和利息" });
  }
  if (hasPrincipal !== hasInterest) {
    context.addIssue({ code: "custom", path: ["principalMinor"], message: "本金和利息需要同时填写" });
  }
  if (hasTotal && hasPrincipal && hasInterest && value.totalRepaymentMinor !== value.principalMinor! + value.interestMinor!) {
    context.addIssue({ code: "custom", path: ["totalRepaymentMinor"], message: "本息和必须等于本金加利息" });
  }
});

export const goalInputSchema = z.object({
  name: z.string().trim().min(1, "请输入目标名称").max(60),
  type: goalTypeSchema,
  targetAmountMinor: moneyMinorSchema,
  targetDate: z.coerce.date().refine((date) => date > new Date(), "目标日期必须晚于今天"),
  preparedAmountMinor: moneyMinorSchema,
  monthlyContributionMinor: moneyMinorSchema,
  priority: z.number().int().min(1).max(5),
  priorityNote: z.string().max(500).nullable().optional(),
  priorityConfirmedAt: z.string().datetime().nullable().optional(),
  isFlexible: z.boolean(),
});

const batchAssetSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1, "请输入资产类目").max(60),
  type: assetTypeSchema,
  currentValueMinor: moneyMinorSchema,
});

const batchLiabilitySchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1, "请输入负债类目").max(60),
  type: liabilityTypeSchema,
  outstandingBalanceMinor: moneyMinorSchema,
  monthlyPaymentMinor: moneyMinorSchema,
});

export const ledgerBatchInputSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  headers: ledgerHeadersSchema.optional(),
  profile: z.object({
    stableMonthlyIncomeMinor: moneyMinorSchema,
    otherMonthlyIncomeMinor: moneyMinorSchema,
    rentExpenseMinor: moneyMinorSchema,
    transportExpenseMinor: moneyMinorSchema,
    essentialExpenseMinor: moneyMinorSchema,
  }),
  assets: z.array(batchAssetSchema).max(100),
  liabilities: z.array(batchLiabilitySchema).max(100),
}).strict();

export type ResourceKind = "asset" | "liability" | "goal";
