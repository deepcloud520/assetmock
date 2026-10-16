import { randomUUID } from "node:crypto";
import { Prisma, type PlanningMemory } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, serialize } from "./portfolio";

const ruleSchema = z.discriminatedUnion("kind", [z.object({ kind: z.literal("CASH_ONLY") }).strict(), z.object({ kind: z.literal("EXCLUDE_ASSET"), assetId: z.string().min(1) }).strict(), z.object({ kind: z.literal("NONE") }).strict()]);
export type MemoryRule = z.infer<typeof ruleSchema>;
export async function memoryContext(tx: Prisma.TransactionClient, workspaceId: string, decisionId: string | undefined, stage: "CLARIFY" | "CALCULATE" | "EXPLAIN" | "REVIEW") {
  const rows = await tx.planningMemory.findMany({ where: { workspaceId, OR: [{ scope: "GLOBAL" }, ...(decisionId ? [{ scope: "DECISION", decisionId }] : [])], status: stage === "EXPLAIN" ? { in: ["ACTIVE", "PENDING"] } : "ACTIVE" }, orderBy: { createdAt: "asc" } });
  return rows.filter((r) => {
    if (stage === "CALCULATE") return r.nature === "HARD" && r.confirmedAt !== null && r.evidenceType !== "INFERENCE";
    if (stage === "CLARIFY") return r.evidenceType !== "CHOICE" && r.evidenceType !== "INFERENCE" && r.status === "ACTIVE";
    return r.evidenceType !== "INFERENCE" || (r.status === "PENDING" && stage === "EXPLAIN");
  });
}
export function memoryEvidence(rows: PlanningMemory[]) {
  return rows.map((r) => ({ id: r.id, content: r.content, evidenceType: r.evidenceType, sourceRef: r.sourceRef, quote: r.quote, scope: r.scope, nature: r.nature, status: r.status, rule: JSON.parse(r.ruleJson), reviewWhen: r.reviewWhen, version: r.version }));
}
export async function listPlanningMemories(workspaceId: string) {
  const rows = await db.planningMemory.findMany({ where: { workspaceId, status: { notIn: ["DELETED", "SUPERSEDED"] } }, orderBy: { createdAt: "desc" } });
  const decisions = await db.carDecision.findMany({ where: { workspaceId }, select: { id: true, factsJson: true } });
  const assets = await db.asset.findMany({ where: { workspaceId, deletedAt: null }, select: { id: true, name: true } });
  return serialize(rows.map((r) => ({ ...r, ruleTargetLabel: assets.find((a) => a.id === JSON.parse(r.ruleJson).assetId)?.name ?? null, decisionName: decisions.find((d) => d.id === r.decisionId) ? JSON.parse(decisions.find((d) => d.id === r.decisionId)!.factsJson).purpose || "买车目标" : null })));
}
const updateSchema = z.object({ expectedVersion: z.number().int().positive(), action: z.enum(["DELETE", "CORRECT", "CONFIRM"]), content: z.string().trim().min(1).max(500).optional(), scope: z.enum(["DECISION", "GLOBAL"]).optional(), nature: z.enum(["SOFT", "HARD"]).optional(), rule: ruleSchema.optional(), confirmScope: z.boolean().optional(), confirmConstraint: z.boolean().optional() }).strict();
export async function updatePlanningMemory(workspaceId: string, id: string, body: unknown) {
  const input = updateSchema.parse(body);
  return db.$transaction(async (tx) => {
    const row = await tx.planningMemory.findFirst({ where: { id, workspaceId, version: input.expectedVersion, status: { notIn: ["DELETED", "SUPERSEDED"] } } });
    if (!row) throw new ApiError("记录已变化，请刷新后再修改", 409);
    const scope = input.scope ?? row.scope;
    const nature = input.nature ?? row.nature;
    const rule = input.rule ?? (input.content && input.content !== row.content ? { kind: "NONE" as const } : ruleSchema.safeParse(JSON.parse(row.ruleJson)).data ?? { kind: "NONE" as const });
    if (scope === "GLOBAL" && row.scope !== "GLOBAL" && !input.confirmScope) throw new ApiError("请明确确认跨目标适用范围", 422);
    if (input.action !== "DELETE" && nature === "HARD" && (!input.confirmConstraint || rule.kind === "NONE")) throw new ApiError("请明确确认具体资金或付款约束", 422);
    if (input.action !== "DELETE" && rule.kind === "EXCLUDE_ASSET" && !await tx.asset.findFirst({ where: { id: rule.assetId, workspaceId, deletedAt: null } })) throw new ApiError("资产已变化，请重新核对", 422);
    const claim = await tx.planningMemory.updateMany({ where: { id, version: input.expectedVersion }, data: { status: input.action === "DELETE" ? "DELETED" : "SUPERSEDED", version: { increment: 1 } } });
    if (!claim.count) throw new ApiError("记录已变化", 409);
    let next = null;
    if (input.action !== "DELETE") {
      const asset = rule.kind === "EXCLUDE_ASSET" ? await tx.asset.findUnique({ where: { id: rule.assetId } }) : null;
      next = await tx.planningMemory.create({ data: { workspaceId, decisionId: row.decisionId, content: input.content ?? row.content, evidenceType: "EXPRESSION", sourceRef: `CONFIRM:${randomUUID()}`, quote: input.content ?? row.content, scope, nature, status: "ACTIVE", ruleJson: JSON.stringify(rule), dependencyJson: asset ? JSON.stringify({ assetId: asset.id, currentValueMinor: asset.currentValueMinor.toString(), goalId: asset.goalId, isAdjustable: asset.isAdjustable }) : "{}", reviewWhen: row.reviewWhen, confirmedAt: new Date(), supersedesId: id } });
    }
    // Financial plans are immutable. Preference changes invalidate proposals only.
    await tx.carDecision.updateMany({ where: { workspaceId, ...(scope === "GLOBAL" || row.scope === "GLOBAL" ? {} : { id: row.decisionId ?? "" }), status: { not: "PURCHASED" } }, data: { version: { increment: 1 }, evaluationJson: null } });
    return serialize(next);
  });
}

// Only bounded, explicit wording becomes a preference. No personality inference.
export async function recordExplicitPreferences(tx: Prisma.TransactionClient, workspaceId: string, decisionId: string, sourceRef: string, content: string) {
  const clauses = content.split(/[，。；！\n]/).map((s) => s.trim()).filter(Boolean);
  const assets = await tx.asset.findMany({ where: { workspaceId, deletedAt: null } });
  for (const quote of clauses) {
    let rule: MemoryRule = { kind: "NONE" };
    const cashOnly = /只(?:考虑|接受|想要|用)?全款|不(?:想|要|考虑|接受|太想)贷款/.test(quote);
    const permitLoan = /(?:可以|愿意|接受|也考虑|改为)贷款/.test(quote) && !cashOnly;
    if (/不是不|并非不|并不是不/.test(quote)) continue;
    const permitAsset = /(?:可以|愿意|允许|改为)(?:动用|动|卖|赎回)/.test(quote);
    const assetPreference = /不(?:想|要|愿意)?(?:动用|动|卖|赎回)/.test(quote);
    const softPreference = /(?:优先|更重视|更希望|尽量|不太想|不愿意|希望保留)/.test(quote);
    if (!cashOnly && !permitLoan && !assetPreference && !permitAsset && !softPreference) continue;
    if (cashOnly) rule = { kind: "CASH_ONLY" };
    const matches = assetPreference ? assets.filter((a) => quote.includes(a.name) || (quote.includes("基金") && ["FUND", "BOND_FUND", "EQUITY_FUND"].includes(a.type))) : [];
    const rules: MemoryRule[] = matches.length ? matches.map((a) => ({ kind: "EXCLUDE_ASSET", assetId: a.id })) : [rule];
    for (const nextRule of rules) {
      const old = await tx.planningMemory.findMany({ where: { workspaceId, decisionId, status: "ACTIVE", evidenceType: "EXPRESSION" } });
      if (old.some((m) => m.quote === quote && m.ruleJson === JSON.stringify(nextRule))) continue;
      if (permitAsset) {
        const changedAssets = assets.filter((a) => quote.includes(a.name) || (quote.includes("基金") && ["FUND", "BOND_FUND", "EQUITY_FUND"].includes(a.type))).map((a) => a.id);
        await tx.planningMemory.updateMany({ where: { id: { in: old.filter((m) => changedAssets.includes(JSON.parse(m.ruleJson).assetId)).map((m) => m.id) } }, data: { status: "REVIEW", version: { increment: 1 } } });
      }
      if (permitLoan) await tx.planningMemory.updateMany({ where: { id: { in: old.filter((m) => JSON.parse(m.ruleJson).kind === "CASH_ONLY").map((m) => m.id) } }, data: { status: "REVIEW", version: { increment: 1 } } });
      await tx.planningMemory.create({ data: { workspaceId, decisionId, content: nextRule.kind === "EXCLUDE_ASSET" ? `${quote.slice(0, 400)}（${assets.find((a) => a.id === nextRule.assetId)?.name}）` : quote.slice(0, 500), quote: quote.slice(0, 500), evidenceType: "EXPRESSION", sourceRef, scope: "DECISION", nature: "SOFT", status: "ACTIVE", ruleJson: JSON.stringify(nextRule), reviewWhen: "目标、相关资产或当前表达出现实质变化时重新核实" } });
    }
  }
}
