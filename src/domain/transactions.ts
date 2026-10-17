import { z } from "zod";

export const transactionDirections = ["INCOME", "EXPENSE"] as const;
export const transactionSpecialKinds = ["NONE", "TRANSFER", "REFUND", "CREDIT_CARD_PAYMENT"] as const;
export const analysisTreatments = ["COUNT", "EXCLUDE"] as const;
export const classificationSources = ["AI", "USER", "FALLBACK"] as const;

export const incomeCategories = ["工资收入", "经营收入", "投资收益", "奖金补贴", "退款", "资金转账", "其他收入"] as const;
export const expenseCategories = ["餐饮", "住房", "交通", "购物", "医疗", "教育", "娱乐", "人情往来", "债务还款", "资金转账", "其他支出"] as const;
export const transactionCategories = [...incomeCategories, ...expenseCategories.filter((item) => !incomeCategories.includes(item as never))] as const;

const amountMinorSchema = z.union([z.string().regex(/^\d+$/), z.number().int().positive()])
  .transform((value) => BigInt(value))
  .refine((value) => value > 0n, "金额必须大于0");

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD").superRefine((value, ctx) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    ctx.addIssue({ code: "custom", message: "日期无效" });
    return;
  }
  if (value > currentDateInChina()) ctx.addIssue({ code: "custom", message: "记账日期不能晚于今天" });
});

const baseInput = {
  expectedTransactionRevision: z.number().int().nonnegative(),
  direction: z.enum(transactionDirections),
  amountMinor: amountMinorSchema,
  occurredOn: dateSchema,
  description: z.string().trim().min(1, "请填写一句话说明").max(120, "说明最多120字"),
};

export const createTransactionSchema = z.object(baseInput).strict();

export const updateTransactionSchema = z.object({
  ...baseInput,
  category: z.enum(transactionCategories),
  specialKind: z.enum(transactionSpecialKinds),
  analysisTreatment: z.enum(analysisTreatments),
}).strict();

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type TransactionDirection = typeof transactionDirections[number];
export type TransactionCategory = typeof transactionCategories[number];

export function currentDateInChina(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function naturalDay(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function monthBounds(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("月份格式应为 YYYY-MM");
  const start = new Date(`${month}-01T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 7) !== month) throw new Error("月份无效");
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return { start, end };
}

export function fallbackCategory(direction: TransactionDirection): TransactionCategory {
  return direction === "INCOME" ? "其他收入" : "其他支出";
}
