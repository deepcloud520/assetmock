import { recordRevision } from "./unified-store";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  createTransactionSchema,
  fallbackCategory,
  monthBounds,
  naturalDay,
  transactionCategories,
  transactionDirections,
  updateTransactionSchema,
  type TransactionCategory,
  type TransactionDirection,
} from "@/domain/transactions";
import { ApiError, assertWorkspace, serialize } from "./portfolio";

export type TransactionClassification = {
  category: TransactionCategory;
  specialKind: "NONE" | "TRANSFER" | "REFUND" | "CREDIT_CARD_PAYMENT";
  analysisTreatment: "COUNT" | "EXCLUDE";
  classificationSource: "AI" | "FALLBACK";
  reason: string;
};

const listQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  direction: z.enum(transactionDirections).optional(),
  category: z.enum(transactionCategories).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(50),
}).strict().refine((value) => !value.month || (!value.from && !value.to), "月份和日期范围不能同时使用");

function dateFilter(query: z.infer<typeof listQuerySchema>) {
  if (query.month) {
    const { start, end } = monthBounds(query.month);
    return { gte: start, lt: end };
  }
  if (!query.from && !query.to) return undefined;
  const upper = query.to ? naturalDay(query.to) : undefined;
  if (upper) upper.setUTCDate(upper.getUTCDate() + 1);
  return {
    ...(query.from ? { gte: naturalDay(query.from) } : {}),
    ...(upper ? { lt: upper } : {}),
  };
}

async function claimRevision(tx: Prisma.TransactionClient, workspaceId: string, expectedRevision: number) {
  const claimed = await tx.workspace.updateMany({
    where: { id: workspaceId, transactionRevision: expectedRevision },
    data: { transactionRevision: { increment: 1 } },
  });
  if (!claimed.count) throw new ApiError("流水已在其他页面更新，已保留你的输入，请刷新后重试", 409);
  return expectedRevision + 1;
}

function fallbackClassification(direction: TransactionDirection): TransactionClassification {
  return {
    category: fallbackCategory(direction),
    specialKind: "NONE",
    analysisTreatment: "COUNT",
    classificationSource: "FALLBACK",
    reason: "智能分类暂不可用，已归入其他类别",
  };
}

export async function listTransactions(workspaceId: string, searchParams: URLSearchParams) {
  const workspace = await assertWorkspace(workspaceId);
  const query = listQuerySchema.parse(Object.fromEntries(searchParams.entries()));
  const occurredOn = dateFilter(query);
  if (query.cursor) {
    const cursor = await db.transaction.findFirst({ where: { id: query.cursor, workspaceId, deletedAt: null }, select: { id: true } });
    if (!cursor) throw new ApiError("分页位置已失效，请刷新流水", 422);
  }
  const where: Prisma.TransactionWhereInput = {
    workspaceId,
    deletedAt: null,
    ...(occurredOn ? { occurredOn } : {}),
    ...(query.direction ? { direction: query.direction } : {}),
    ...(query.category ? { category: query.category } : {}),
  };
  const summaryWhere: Prisma.TransactionWhereInput = {
    workspaceId,
    deletedAt: null,
    analysisTreatment: "COUNT",
    ...(occurredOn ? { occurredOn } : {}),
  };
  const [items, income, expense] = await Promise.all([
    db.transaction.findMany({
      where,
      orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    }),
    db.transaction.aggregate({ where: { ...summaryWhere, direction: "INCOME" }, _sum: { amountMinor: true } }),
    db.transaction.aggregate({ where: { ...summaryWhere, direction: "EXPENSE" }, _sum: { amountMinor: true } }),
  ]);
  const hasMore = items.length > query.limit;
  const page = hasMore ? items.slice(0, query.limit) : items;
  const incomeMinor = income._sum.amountMinor ?? 0n;
  const expenseMinor = expense._sum.amountMinor ?? 0n;
  return serialize({
    transactionRevision: workspace.transactionRevision,
    items: page,
    nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
    summary: { incomeMinor, expenseMinor, balanceMinor: incomeMinor - expenseMinor },
    categories: transactionCategories,
  });
}

export async function createTransaction(
  workspaceId: string,
  body: unknown,
  classify: (direction: TransactionDirection, description: string) => Promise<TransactionClassification> = async (direction) => fallbackClassification(direction),
) {
  await assertWorkspace(workspaceId);
  const data = createTransactionSchema.parse(body);
  let classification: TransactionClassification;
  try {
    classification = await classify(data.direction, data.description);
  } catch {
    classification = fallbackClassification(data.direction);
  }
  return db.$transaction(async (tx) => {
    const revision = await claimRevision(tx, workspaceId, data.expectedTransactionRevision);
    const transaction = await tx.transaction.create({
      data: {
        workspaceId,
        direction: data.direction,
        amountMinor: data.amountMinor,
        occurredOn: naturalDay(data.occurredOn),
        description: data.description,
        category: classification.category,
        specialKind: classification.specialKind,
        analysisTreatment: classification.analysisTreatment,
        source: "MANUAL",
        classificationSource: classification.classificationSource,
      },
    });
    await recordRevision(tx, workspaceId, "TRANSACTION", transaction.id, transaction, "流水新增确认");
    return serialize({ transaction, transactionRevision: revision, classificationReason: classification.reason });
  });
}

export async function updateTransaction(workspaceId: string, id: string, body: unknown) {
  await assertWorkspace(workspaceId);
  const data = updateTransactionSchema.parse(body);
  const existing = await db.transaction.findFirst({ where: { id, workspaceId, deletedAt: null }, });
  if (!existing) throw new ApiError("流水不存在", 404);
  return db.$transaction(async (tx) => {
    const revision = await claimRevision(tx, workspaceId, data.expectedTransactionRevision);
    await recordRevision(tx, workspaceId, "TRANSACTION", id, existing, "流水更正前");
    const transaction = await tx.transaction.update({
      where: { id },
      data: {
        direction: data.direction,
        amountMinor: data.amountMinor,
        occurredOn: naturalDay(data.occurredOn),
        description: data.description,
        category: data.category,
        specialKind: data.specialKind,
        analysisTreatment: data.analysisTreatment,
        classificationSource: "USER",
      },
    });
    await recordRevision(tx, workspaceId, "TRANSACTION", id, transaction, "流水更正确认");
    return serialize({ transaction, transactionRevision: revision });
  });
}

const deleteSchema = z.object({ expectedTransactionRevision: z.number().int().nonnegative() }).strict();

export async function deleteTransaction(workspaceId: string, id: string, body: unknown) {
  await assertWorkspace(workspaceId);
  const data = deleteSchema.parse(body);
  const existing = await db.transaction.findFirst({ where: { id, workspaceId, deletedAt: null }, });
  if (!existing) throw new ApiError("流水不存在", 404);
  return db.$transaction(async (tx) => {
    const revision = await claimRevision(tx, workspaceId, data.expectedTransactionRevision);
    await recordRevision(tx, workspaceId, "TRANSACTION", id, existing, "流水归档");
    await tx.transaction.update({ where: { id }, data: { deletedAt: new Date() } });
    return { transactionRevision: revision };
  });
}
