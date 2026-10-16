import { Prisma } from "@prisma/client";
import { productCatalog, type CatalogProduct } from "@/domain/product-catalog";
import { budgetSchema, policySchema, holdingSchema, type ManagerBudget } from "@/domain/specialist-managers";
import { budgetForMonth, naturalDate, today } from "@/domain/database-planning";
import { ApiError } from "./portfolio";
export function parseLegacy(raw: string): unknown { try { return JSON.parse(raw); } catch { return {}; } }
function validLegacy(raw: string) { try { const v = JSON.parse(raw); return v !== null && typeof v === "object" && !Array.isArray(v); } catch { return false; } }
export const encode = (v: unknown) => JSON.stringify(v, (_, x) => typeof x === "bigint" ? x.toString() : x);
export async function recordRevision(tx: Prisma.TransactionClient, workspaceId: string, entityType: string, entityId: string, data: unknown, reason: string, source = "USER") {
  const count = await tx.recordRevision.count({ where: { workspaceId, entityType, entityId } });
  await tx.recordRevision.create({ data: { workspaceId, entityType, entityId, revision: count + 1, dataJson: encode(data), reason, source } });
}
export async function seedProducts(tx: Prisma.TransactionClient) {
  for (const p of productCatalog) {
    await tx.product.upsert({ where: { id: p.id }, create: { id: p.id, name: p.name, provider: p.provider, category: p.category }, update: {} });
    const exists = await tx.productVersion.findUnique({ where: { productId_version: { productId: p.id, version: p.version } } });
    if (!exists) { const v = await tx.productVersion.create({ data: { productId: p.id, version: p.version, status: "PUBLISHED", dataJson: encode(p), ageMin: p.ageMin, ageMax: p.ageMax, riskLevel: p.riskLevel, termMonths: p.termMonths, redemptionDays: p.redemptionDays, minimumMinor: p.minimumMinor === null ? null : BigInt(p.minimumMinor), reviewedOn: p.reviewedAt, publishedAt: new Date() } }); await tx.productSource.create({ data: { productVersionId: v.id, url: p.sourceUrl, publicationText: p.sourceDate, reviewedOn: p.reviewedAt } }); }
  }
}
export async function publishedProducts(tx: Prisma.TransactionClient): Promise<CatalogProduct[]> {
  await seedProducts(tx);
  const rows = await tx.productVersion.findMany({ where: { status: "PUBLISHED" }, orderBy: [{ createdAt: "desc" }, { id: "asc" }] }); const seen = new Set<string>();
  return rows.filter((r) => { if (seen.has(r.productId)) return false; seen.add(r.productId); return true; }).map((r) => JSON.parse(r.dataJson));
}
export async function createBudget(tx: Prisma.TransactionClient, workspaceId: string, data: ManagerBudget, validFrom = today(), reason = "确认规划预算", schedule: { incomeDay?: number | null; debtDay?: number | null; premiumDay?: number | null; fixedDay?: number | null } = {}, historical = false) {
  naturalDate.parse(validFrom);
  if (validFrom < today() && !historical) throw new ApiError("更正过去预算需要明确确认历史修订", 422);
  const previous = await tx.budgetVersion.findFirst({ where: { workspaceId, status: "ACTIVE", validFrom: { lte: validFrom }, OR: [{ validTo: null }, { validTo: { gt: validFrom } }] }, orderBy: { validFrom: "desc" } });
  const following = await tx.budgetVersion.findFirst({ where: { workspaceId, status: "ACTIVE", validFrom: { gt: validFrom } }, orderBy: { validFrom: "asc" } });
  // A same-day revision retains the prior version in RecordRevision, not a zero-length interval.
  if (previous?.validFrom === validFrom) { await recordRevision(tx, workspaceId, "BUDGET", previous.id, previous, reason); await tx.budgetVersion.update({ where: { id: previous.id }, data: { status: "SUPERSEDED" } }); }
  else if (previous) { await recordRevision(tx, workspaceId, "BUDGET", previous.id, previous, reason); await tx.budgetVersion.update({ where: { id: previous.id }, data: { validTo: validFrom } }); }
  const last = await tx.budgetVersion.aggregate({ where: { workspaceId }, _max: { revision: true } });
  const policyRows = await tx.insurancePolicy.findMany({ where: { workspaceId, deletedAt: null } });
  const policyMonthly = Object.fromEntries(policyRows.flatMap((r) => { const p = policySchema.safeParse(parseLegacy(r.dataJson)); return p.success && p.data.confirmed && p.data.premiumMinor !== null && p.data.paymentMonths ? [[r.id, ((BigInt(p.data.premiumMinor) + BigInt(p.data.paymentMonths) - 1n) / BigInt(p.data.paymentMonths)).toString()]] : []; }));
  const v = await tx.budgetVersion.create({ data: { workspaceId, validFrom, validTo: following?.validFrom ?? null, revision: Math.max(last._max.revision ?? 0, previous?.revision ?? 0) + 1, incomeMinor: BigInt(data.incomeMinor), livingMinor: BigInt(data.livingMinor), debtIncluded: data.debtIncluded, premiumsIncluded: data.premiumsIncluded, dataJson: encode({ ...data, policyMonthly }), reason } });
  const debts = await tx.liability.findMany({ where: { workspaceId, deletedAt: null } }); const policies = await tx.insurancePolicy.findMany({ where: { workspaceId, deletedAt: null } });
  const entries: { kind: string; sourceRef: string; amountMinor: bigint; allocation: string; dueDay: number | null; dueOn: string | null; includedInLiving: boolean }[] = [
    { kind: "INCOME", sourceRef: "income", amountMinor: v.incomeMinor, allocation: "SCHEDULED", dueDay: schedule.incomeDay ?? null, dueOn: null, includedInLiving: false },
    { kind: "LIVING", sourceRef: "living", amountMinor: v.livingMinor, allocation: "DAILY", dueDay: null, dueOn: null, includedInLiving: false },
    { kind: "FIXED", sourceRef: "fixed", amountMinor: BigInt(data.extraFixedMinor), allocation: "SCHEDULED", dueDay: schedule.fixedDay ?? null, dueOn: null, includedInLiving: false },
  ];
  for (const d of debts) if (d.monthlyPaymentMinor > 0n) entries.push({ kind: "DEBT", sourceRef: `LIABILITY:${d.id}`, amountMinor: d.monthlyPaymentMinor, allocation: "SCHEDULED", dueDay: schedule.debtDay ?? null, dueOn: null, includedInLiving: data.debtIncluded });
  for (const row of policies) { const p = policySchema.parse(JSON.parse(row.dataJson)); if (p.confirmed && p.premiumMinor !== null && BigInt(p.premiumMinor) > 0n) entries.push({ kind: "PREMIUM", sourceRef: `POLICY:${row.id}`, amountMinor: BigInt(p.premiumMinor), allocation: "SCHEDULED", dueDay: p.paymentMonths === 1 ? schedule.premiumDay ?? null : null, dueOn: p.paymentMonths === 1 ? null : p.nextPaymentOn, includedInLiving: data.premiumsIncluded }); }
  if (BigInt(data.proposedPremiumMinor) > 0n && data.proposedPremiumConfirmed) entries.push({ kind: "PROPOSED_PREMIUM", sourceRef: "proposed", amountMinor: BigInt(data.proposedPremiumMinor), allocation: "SCHEDULED", dueDay: schedule.premiumDay ?? null, dueOn: null, includedInLiving: false });
  if (data.oneOffMonth && BigInt(data.oneOffMinor) > 0n) entries.push({ kind: "ONE_OFF", sourceRef: "oneoff", amountMinor: BigInt(data.oneOffMinor), allocation: "SCHEDULED", dueDay: null, dueOn: `${data.oneOffMonth}-01`, includedInLiving: false });
  for (const e of entries.filter((x) => x.amountMinor > 0n)) await tx.budgetItem.create({ data: { ...e, workspaceId, budgetVersionId: v.id } });
  await recordRevision(tx, workspaceId, "BUDGET", v.id, { ...v, items: entries }, reason);
  return v;
}
export async function ensureUnified(tx: Prisma.TransactionClient, workspaceId: string) {
  const w = await tx.workspace.findUnique({ where: { id: workspaceId } }); if (!w) throw new ApiError("工作区不存在", 404); if (w.businessMigratedAt) return;
  const legacy = await tx.managerState.findUnique({ where: { workspaceId } });
  const issue = async (entityType: string, entityId: string, code: string, note: string) => tx.migrationIssue.upsert({ where: { workspaceId_entityType_entityId_code: { workspaceId, entityType, entityId, code } }, create: { workspaceId, entityType, entityId, code, note }, update: {} });
  if (legacy) {
    const b = budgetSchema.safeParse(parseLegacy(legacy.budgetJson));
    if (b.success) await createBudget(tx, workspaceId, b.data, today(legacy.updatedAt), "原预算迁移基线", {}, true);
    else if (legacy.budgetJson !== "{}") await issue("BUDGET", workspaceId, "INVALID_LEGACY", "原预算无法解析，请核对；原文保留在历史记录");
    const ins = parseLegacy(legacy.insuranceJson) as Record<string, string>; const inv = parseLegacy(legacy.investmentJson) as Record<string, string>;
    for (const [type, raw] of [["INSURANCE_NEED", legacy.insuranceJson], ["INVESTMENT_NEED", legacy.investmentJson]]) if (!validLegacy(raw)) await issue(type, workspaceId, "INVALID_LEGACY", "原资料无法解析，原文已保留在迁移历史");
    await tx.insuranceNeed.upsert({ where: { workspaceId }, create: { workspaceId, status: ins.status ?? "UNKNOWN", insured: ins.insured ?? "本人", category: ins.category ?? null, dataJson: validLegacy(legacy.insuranceJson) ? legacy.insuranceJson : "{}" }, update: {} });
    await tx.investmentNeed.upsert({ where: { workspaceId }, create: { workspaceId, assetId: inv.assetId ?? null, decisionId: inv.decisionId ?? null, category: inv.category ?? null, dataJson: validLegacy(legacy.investmentJson) ? legacy.investmentJson : "{}" }, update: {} });
    await recordRevision(tx, workspaceId, "LEGACY_MANAGER", workspaceId, legacy, "迁移基线", "MIGRATION");
    await tx.managerState.update({ where: { workspaceId }, data: { budgetJson: "{}", insuranceJson: "{}", investmentJson: "{}" } });
  }
  for (const [entityType, rows] of [["ASSET", await tx.asset.findMany({ where: { workspaceId, deletedAt: null } })], ["LIABILITY", await tx.liability.findMany({ where: { workspaceId, deletedAt: null } })]] as const) for (const row of rows) await tx.balanceObservation.upsert({ where: { observationKey: `BASELINE:${entityType}:${row.id}` }, create: { workspaceId, entityType, entityId: row.id, amountMinor: "currentValueMinor" in row ? row.currentValueMinor : row.outstandingBalanceMinor, currency: "currency" in row ? row.currency : "CNY", observedOn: today(row.asOf), source: "MIGRATION_BASELINE", confirmed: false, observationKey: `BASELINE:${entityType}:${row.id}` }, update: {} });
  const policies = await tx.insurancePolicy.findMany({ where: { workspaceId } });
  for (const p of policies) { const parsed = policySchema.safeParse(parseLegacy(p.dataJson)); if (parsed.success) await tx.insurancePolicy.update({ where: { id: p.id }, data: policyColumns(parsed.data) }); else await issue("POLICY", p.id, "INVALID_LEGACY", "保单原资料需核对"); }
  const holdings = await tx.holdingDetail.findMany({ where: { workspaceId } }); for (const h of holdings) { const p = holdingSchema.safeParse(parseLegacy(h.dataJson)); if (p.success) await tx.holdingDetail.update({ where: { id: h.id }, data: { availableOn: p.data.availableOn, feeMinor: p.data.feeMinor === null ? null : BigInt(p.data.feeMinor), confirmed: p.data.confirmed } }); }
  await tx.workspace.update({ where: { id: workspaceId }, data: { businessMigratedAt: new Date(), professionalRevision: legacy?.version ?? 0 } });
}
export function policyColumns(p: ReturnType<typeof policySchema.parse>) { return { insured: p.insured, category: p.category, coverageMinor: p.coverageMinor === null ? null : BigInt(p.coverageMinor), premiumMinor: p.premiumMinor === null ? null : BigInt(p.premiumMinor), paymentMonths: p.paymentMonths, startsOn: p.startsOn, endsOn: p.endsOn, confirmed: p.confirmed, cashValueAssetId: p.cashValueAssetId }; }
export async function professionalState(tx: Prisma.TransactionClient, workspaceId: string) {
  await ensureUnified(tx, workspaceId);
  const [w, budget, ins, inv] = await Promise.all([tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } }), tx.budgetVersion.findFirst({ where: { workspaceId, status: "ACTIVE", validFrom: { lte: today() }, OR: [{ validTo: null }, { validTo: { gt: today() } }] }, orderBy: { revision: "desc" } }), tx.insuranceNeed.findUnique({ where: { workspaceId } }), tx.investmentNeed.findUnique({ where: { workspaceId } })]);
  return { workspaceId, version: w.professionalRevision, budgetJson: budget ? encode(Object.fromEntries(Object.entries(parseLegacy(budget.dataJson) as object).filter(([k]) => k !== "policyMonthly"))) : "{}", insuranceJson: ins?.dataJson ?? "{}", investmentJson: inv?.dataJson ?? "{}" };
}
export async function monthlyBudget(tx: Prisma.TransactionClient, workspaceId: string, month: string) { const versions = await tx.budgetVersion.findMany({ where: { workspaceId, status: "ACTIVE" }, orderBy: { validFrom: "asc" } }); const items = await tx.budgetItem.findMany({ where: { workspaceId } }); const enriched = items.map((i) => { const v = versions.find((v) => v.id === i.budgetVersionId); const data = v ? parseLegacy(v.dataJson) as Record<string, unknown> : {}; const policy = i.sourceRef.startsWith("POLICY:") ? i.sourceRef.slice(7) : null; return { ...i, monthlyEquivalentMinor: policy && data.policyMonthly ? BigInt((data.policyMonthly as Record<string, string>)[policy] ?? i.amountMinor.toString()) : i.amountMinor }; }); return budgetForMonth(versions, enriched, month); }
export async function registerDependencies(tx: Prisma.TransactionClient, workspaceId: string, ownerType: string, ownerId: string) {
  const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  for (const [sourceType, rows] of [["ASSET", await tx.asset.findMany({ where: { workspaceId } })], ["LIABILITY", await tx.liability.findMany({ where: { workspaceId } })], ["GOAL", await tx.goal.findMany({ where: { workspaceId } })], ["POLICY", await tx.insurancePolicy.findMany({ where: { workspaceId } })]] as const) for (const r of rows) await tx.dataDependency.upsert({ where: { workspaceId_ownerType_ownerId_sourceType_sourceId: { workspaceId, ownerType, ownerId, sourceType, sourceId: r.id } }, create: { workspaceId, ownerType, ownerId, sourceType, sourceId: r.id, sourceVersion: "version" in r ? r.version : workspace.portfolioRevision }, update: {} });
}
