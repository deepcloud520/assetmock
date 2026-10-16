import { recordRevision } from "./unified-store";
import { today } from "@/domain/database-planning";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  assetUserInputSchema,
  goalInputSchema,
  ledgerBatchInputSchema,
  liabilityInputSchema,
  type ResourceKind,
} from "@/domain/portfolio";
import { classifyAssetNames } from "./asset-classification";

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function getWorkspaceId(request: Request) {
  const id = request.headers.get("X-Workspace-Id");
  if (!id) throw new ApiError("缺少工作区标识", 401);
  return id;
}

export async function assertWorkspace(workspaceId: string) {
  const workspace = await db.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) throw new ApiError("工作区不存在，请刷新页面重试", 404);
  return workspace;
}

export function apiError(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof Error && error.name === "ZodError") {
    const issue = (error as { issues?: Array<{ message?: string; path?: PropertyKey[] }> }).issues?.[0];
    const path = issue?.path?.length ? `（字段：${issue.path.join(".")}）` : "";
    return Response.json({ error: `${issue?.message ?? "提交的数据格式不正确"}${path}` }, { status: 422 });
  }
  console.error("Portfolio API error", error instanceof Error ? error.message : "unknown");
  return Response.json({ error: "服务暂时不可用，请稍后重试" }, { status: 500 });
}

async function bumpRevision(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  entityType: string,
  entityId: string,
  action: string,
) {
  const workspace = await tx.workspace.update({
    where: { id: workspaceId },
    data: { portfolioRevision: { increment: 1 } },
    select: { portfolioRevision: true },
  });
  await tx.auditEvent.create({ data: { workspaceId, entityType, entityId, action, revision: workspace.portfolioRevision } });
  const record = entityType === "ASSET" ? await tx.asset.findUnique({ where: { id: entityId } }) : entityType === "LIABILITY" ? await tx.liability.findUnique({ where: { id: entityId } }) : entityType === "GOAL" ? await tx.goal.findUnique({ where: { id: entityId } }) : null;
  if (record) await recordRevision(tx, workspaceId, entityType, entityId, record, action);
  if (record && (entityType === "ASSET" || entityType === "LIABILITY") && action !== "DELETED") await tx.balanceObservation.create({ data: { workspaceId, entityType, entityId, amountMinor: "currentValueMinor" in record ? record.currentValueMinor : "outstandingBalanceMinor" in record ? record.outstandingBalanceMinor : null, observedOn: today(), source: "USER_LEDGER", confirmed: true, observationKey: `LEDGER:${workspaceId}:${workspace.portfolioRevision}:${entityId}` } });
}

export async function createResource(kind: ResourceKind, workspaceId: string, body: unknown) {
  await assertWorkspace(workspaceId);
  if (kind === "asset") {
    const data = assetUserInputSchema.parse(body);
    const [classification] = await classifyAssetNames([data.name]);
    return db.$transaction(async (tx) => {
      const item = await tx.asset.create({ data: { ...data, ...classification, goalId: null, workspaceId } });
      await bumpRevision(tx, workspaceId, "ASSET", item.id, "CREATED");
      return item;
    });
  }
  return db.$transaction(async (tx) => {
    if (kind === "liability") {
      const data = liabilityInputSchema.parse(body);
      const item = await tx.liability.create({ data: { ...normalizeLiability(data), workspaceId } });
      await bumpRevision(tx, workspaceId, "LIABILITY", item.id, "CREATED");
      return item;
    }
    const data = goalInputSchema.parse(body);
    const item = await tx.goal.create({ data: { ...data, workspaceId } });
    await bumpRevision(tx, workspaceId, "GOAL", item.id, "CREATED");
    return item;
  });
}

export async function updateResource(kind: ResourceKind, workspaceId: string, id: string, body: unknown) {
  await assertWorkspace(workspaceId);
  if (kind === "asset") {
    const existing = await db.asset.findFirst({ where: { id, workspaceId, deletedAt: null } });
    if (!existing) throw new ApiError("资产不存在", 404);
    const data = assetUserInputSchema.parse(body);
    const classification = data.name === existing.name ? {} : (await classifyAssetNames([data.name]))[0];
    return db.$transaction(async (tx) => {
      const item = await tx.asset.update({ where: { id }, data: { ...data, ...classification, goalId: null, asOf: new Date() } });
      await bumpRevision(tx, workspaceId, "ASSET", id, "UPDATED");
      return item;
    });
  }
  return db.$transaction(async (tx) => {
    if (kind === "liability") {
      const existing = await tx.liability.findFirst({ where: { id, workspaceId, deletedAt: null } });
      if (!existing) throw new ApiError("负债不存在", 404);
      const item = await tx.liability.update({
        where: { id },
        data: { ...normalizeLiability(liabilityInputSchema.parse(body)), asOf: new Date() },
      });
      await bumpRevision(tx, workspaceId, "LIABILITY", id, "UPDATED");
      return item;
    }
    if (await tx.carDecision.findFirst({ where: { workspaceId, goalId: id, status: { in: ["ACTIVE", "PURCHASED"] } } })) throw new ApiError("请在买车决策中调整此目标，确保资金预留与方案同步", 409);
    const existing = await tx.goal.findFirst({ where: { id, workspaceId, deletedAt: null } });
    if (!existing) throw new ApiError("目标不存在", 404);
    const item = await tx.goal.update({
      where: { id },
      data: { ...goalInputSchema.parse(body), asOf: new Date() },
    });
    await bumpRevision(tx, workspaceId, "GOAL", id, "UPDATED");
    return item;
  });
}

type ParsedLiability = ReturnType<typeof liabilityInputSchema.parse>;

export function normalizeLiability(data: ParsedLiability) {
  const type = data.type ?? inferLiabilityType(data.name);
  if (!data.isInstallment) {
    return {
      name: data.name, type, isInstallment: false,
      outstandingBalanceMinor: data.outstandingBalanceMinor!, monthlyPaymentMinor: 0n, remainingMonths: null,
      totalRepaymentMinor: null, principalMinor: null, interestMinor: null, repaymentMethod: null,
    };
  }
  const total = data.totalRepaymentMinor ?? data.principalMinor! + data.interestMinor!;
  return {
    name: data.name, type, isInstallment: true,
    outstandingBalanceMinor: data.principalMinor ?? total,
    monthlyPaymentMinor: data.monthlyPaymentMinor!, remainingMonths: data.remainingMonths,
    totalRepaymentMinor: total, principalMinor: data.principalMinor ?? null,
    interestMinor: data.interestMinor ?? null, repaymentMethod: data.repaymentMethod!,
  };
}

function inferLiabilityType(name: string) {
  if (/房贷|住房贷款|按揭/.test(name)) return "MORTGAGE";
  if (/车贷|汽车贷款/.test(name)) return "CAR_LOAN";
  if (/信用卡/.test(name)) return "CREDIT_CARD";
  if (/助学|学生贷款/.test(name)) return "STUDENT_LOAN";
  if (/花呗|月付|消费贷|互联网|分期/.test(name)) return "CONSUMER_LOAN";
  return "OTHER";
}

export async function deleteResource(kind: ResourceKind, workspaceId: string, id: string) {
  await assertWorkspace(workspaceId);
  return db.$transaction(async (tx) => {
    const now = new Date();
    if (kind === "asset") {
      const item = await tx.asset.findFirst({ where: { id, workspaceId, deletedAt: null } });
      if (!item) throw new ApiError("资产不存在", 404);
      await tx.asset.update({ where: { id }, data: { deletedAt: now } });
    } else if (kind === "liability") {
      const item = await tx.liability.findFirst({ where: { id, workspaceId, deletedAt: null } });
      if (!item) throw new ApiError("负债不存在", 404);
      await tx.liability.update({ where: { id }, data: { deletedAt: now } });
    } else {
      if (await tx.carDecision.findFirst({ where: { workspaceId, goalId: id, status: { in: ["ACTIVE", "PURCHASED"] } } })) throw new ApiError("该目标属于买车决策，请保留其方案和复盘记录", 409);
      const item = await tx.goal.findFirst({ where: { id, workspaceId, deletedAt: null } });
      if (!item) throw new ApiError("目标不存在", 404);
      await tx.asset.updateMany({ where: { goalId: id, workspaceId }, data: { goalId: null } });
      await tx.goal.update({ where: { id }, data: { deletedAt: now } });
    }
    await bumpRevision(tx, workspaceId, kind.toUpperCase(), id, "DELETED");
  });
}

export async function saveLedgerBatch(workspaceId: string, body: unknown) {
  await assertWorkspace(workspaceId);
  const data = ledgerBatchInputSchema.parse(body);
  const assetIds = data.assets.flatMap((item) => item.id ? [item.id] : []);
  const liabilityIds = data.liabilities.flatMap((item) => item.id ? [item.id] : []);
  if (new Set(assetIds).size !== assetIds.length || new Set(liabilityIds).size !== liabilityIds.length) {
    throw new ApiError("底账中存在重复记录", 422);
  }

  return db.$transaction(async (tx) => {
    const [assets, liabilities] = await Promise.all([
      tx.asset.findMany({ where: { id: { in: assetIds }, workspaceId, deletedAt: null } }),
      tx.liability.findMany({ where: { id: { in: liabilityIds }, workspaceId, deletedAt: null } }),
    ]);
    if (assets.length !== assetIds.length || liabilities.length !== liabilityIds.length) {
      throw new ApiError("底账中包含不存在的账户", 422);
    }

    const claimed = await tx.workspace.updateMany({
      where: { id: workspaceId, portfolioRevision: data.expectedRevision },
      data: { portfolioRevision: { increment: 1 } },
    });
    if (!claimed.count) throw new ApiError("底账已在其他页面更新，当前草稿尚未保存，请核对最新数据后重试", 409);

    for (const row of assets) await recordRevision(tx, workspaceId, "ASSET", row.id, row, "底账修改前");
    for (const row of liabilities) await recordRevision(tx, workspaceId, "LIABILITY", row.id, row, "底账修改前");
    const priorProfile = await tx.profile.findUnique({ where: { workspaceId } }); if (priorProfile) await recordRevision(tx, workspaceId, "PROFILE", workspaceId, priorProfile, "画像修改前");
    const now = new Date();
    const existingAssetTypes = new Map(assets.map((item) => [item.id, item.type]));
    await tx.profile.upsert({
      where: { workspaceId },
      create: { workspaceId, ...data.profile, asOf: now },
      update: { ...data.profile, asOf: now },
    });
    for (const item of data.assets) {
      if (item.id) {
        const typeChanged = existingAssetTypes.get(item.id) !== item.type;
        await tx.asset.update({
          where: { id: item.id },
          data: {
            name: item.name,
            type: item.type,
            currentValueMinor: item.currentValueMinor,
            ...(typeChanged ? assetDefaults(item.type) : {}),
            asOf: now,
          },
        });
      } else {
        await tx.asset.create({
          data: {
            workspaceId,
            name: item.name,
            currentValueMinor: item.currentValueMinor,
            type: item.type,
            ...assetDefaults(item.type),
            isAdjustable: true,
            asOf: now,
          },
        });
      }
    }
    for (const item of data.liabilities) {
      if (item.id) {
        await tx.liability.update({
          where: { id: item.id },
          data: {
            name: item.name,
            type: item.type,
            outstandingBalanceMinor: item.outstandingBalanceMinor,
            monthlyPaymentMinor: item.monthlyPaymentMinor,
            asOf: now,
          },
        });
      } else {
        await tx.liability.create({
          data: {
            workspaceId,
            name: item.name,
            type: item.type,
            outstandingBalanceMinor: item.outstandingBalanceMinor,
            monthlyPaymentMinor: item.monthlyPaymentMinor,
            asOf: now,
          },
        });
      }
    }

    const workspace = await tx.workspace.update({
      where: { id: workspaceId },
      data: { ledgerConfirmedAt: now, ...(data.headers ? { ledgerHeadersJson: JSON.stringify(data.headers) } : {}) },
      select: { portfolioRevision: true, ledgerConfirmedAt: true },
    });
    for (const [entityType, rows] of [["ASSET", await tx.asset.findMany({ where: { workspaceId, asOf: now, deletedAt: null } })], ["LIABILITY", await tx.liability.findMany({ where: { workspaceId, asOf: now, deletedAt: null } })]] as const) for (const row of rows) {
      await recordRevision(tx, workspaceId, entityType, row.id, row, "底账确认");
      await tx.balanceObservation.create({ data: { workspaceId, entityType, entityId: row.id, amountMinor: "currentValueMinor" in row ? row.currentValueMinor : row.outstandingBalanceMinor, observedOn: today(now), confirmed: true, source: "USER_LEDGER", observationKey: `BATCH:${workspaceId}:${workspace.portfolioRevision}:${entityType}:${row.id}` } });
    }
    await tx.auditEvent.create({
      data: { workspaceId, entityType: "LEDGER", entityId: workspaceId, action: "BATCH_CONFIRMED", revision: workspace.portfolioRevision },
    });
    return workspace;
  });
}

function assetDefaults(type: string) {
  const defaults: Record<string, { liquidityLevel: string; riskLevel: number; isInvestable: boolean }> = {
    CASH: { liquidityLevel: "T0", riskLevel: 1, isInvestable: true },
    BANK_DEPOSIT: { liquidityLevel: "Y1", riskLevel: 1, isInvestable: true },
    MONEY_MARKET: { liquidityLevel: "D7", riskLevel: 1, isInvestable: true },
    BOND: { liquidityLevel: "D30", riskLevel: 2, isInvestable: true },
    BOND_FUND: { liquidityLevel: "D7", riskLevel: 2, isInvestable: true },
    EQUITY: { liquidityLevel: "D7", riskLevel: 4, isInvestable: true },
    EQUITY_FUND: { liquidityLevel: "D7", riskLevel: 3, isInvestable: true },
    REAL_ESTATE: { liquidityLevel: "ILLIQUID", riskLevel: 2, isInvestable: false },
    INSURANCE_CASH_VALUE: { liquidityLevel: "Y1", riskLevel: 1, isInvestable: false },
    PENSION: { liquidityLevel: "GT_Y1", riskLevel: 2, isInvestable: false },
    ALTERNATIVE: { liquidityLevel: "GT_Y1", riskLevel: 5, isInvestable: true },
    OTHER: { liquidityLevel: "D30", riskLevel: 2, isInvestable: false },
  };
  return defaults[type] ?? defaults.OTHER;
}

export function serialize<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_, item) => (typeof item === "bigint" ? item.toString() : item)),
  ) as T;
}
