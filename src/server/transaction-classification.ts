import { z } from "zod";
import {
  expenseCategories,
  fallbackCategory,
  incomeCategories,
  transactionCategories,
  transactionSpecialKinds,
  type TransactionDirection,
} from "@/domain/transactions";
import { structuredResponse } from "./agent-runtime";
import type { TransactionClassification } from "./transactions";

export const TRANSACTION_CAPTURE_PROMPT_VERSION = "transaction-capture-v1";

const resultSchema = z.object({
  category: z.enum(transactionCategories),
  specialKind: z.enum(transactionSpecialKinds),
  analysisTreatment: z.enum(["COUNT", "EXCLUDE"]),
  reason: z.string().min(1).max(80),
}).strict();

const outputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["category", "specialKind", "analysisTreatment", "reason"],
  properties: {
    category: { type: "string", enum: transactionCategories },
    specialKind: { type: "string", enum: transactionSpecialKinds },
    analysisTreatment: { type: "string", enum: ["COUNT", "EXCLUDE"] },
    reason: { type: "string", minLength: 1, maxLength: 80 },
  },
};

const instructions = `你是AI资产管家的单笔流水分类器。用户已经确认收支方向、金额、日期和说明，你只负责分类，不得改写金额、日期、说明或收支方向。
收入类别只能使用：${incomeCategories.join("、")}。
支出类别只能使用：${expenseCategories.join("、")}。
特殊流水只能使用 NONE、TRANSFER、REFUND、CREDIT_CARD_PAYMENT。
转账、退款和信用卡还款不是新的可支配收入或消费，必须返回 EXCLUDE；其他普通流水返回 COUNT。
信息不足时选择对应方向的“其他收入”或“其他支出”。reason用不超过80字的通俗中文解释分类依据。只返回规定JSON。`;

export async function classifyTransaction(direction: TransactionDirection, description: string): Promise<TransactionClassification> {
  try {
    const raw = await structuredResponse<unknown>(
      instructions,
      { direction, description },
      "transaction_capture",
      outputJsonSchema,
    );
    const parsed = resultSchema.parse(raw);
    const allowed = direction === "INCOME" ? incomeCategories : expenseCategories;
    if (!allowed.includes(parsed.category as never)) throw new Error("CATEGORY_DIRECTION_MISMATCH");
    const isSpecial = parsed.specialKind !== "NONE";
    return {
      ...parsed,
      analysisTreatment: isSpecial ? "EXCLUDE" : parsed.analysisTreatment,
      classificationSource: "AI",
    };
  } catch {
    return {
      category: fallbackCategory(direction),
      specialKind: "NONE",
      analysisTreatment: "COUNT",
      classificationSource: "FALLBACK",
      reason: "智能分类暂不可用，已归入其他类别",
    };
  }
}
