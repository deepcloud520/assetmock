import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError, serialize } from "./portfolio";
import { encode } from "./unified-store";
import { today } from "@/domain/database-planning";
import type { AgentKey } from "@/domain/agents";

/** Pure reads: no reminder synchronization, migration, classification or verification. */
export async function agentFacts(workspaceId: string, goalId?: string | null, decisionId?: string | null, client: Prisma.TransactionClient = db) {
 const workspace = await client.workspace.findUnique({ where: { id: workspaceId }, include: { profile: true } });
 if (!workspace) throw new ApiError("工作区不存在", 404);
 if (goalId && !await client.goal.findFirst({ where: { id: goalId, workspaceId, deletedAt: null } })) throw new ApiError("目标不存在", 404);
 if (decisionId && !await client.goalDecision.findFirst({ where: { id: decisionId, workspaceId, status: { not: "REDACTED" } } })) throw new ApiError("决策不存在", 404);
 const [assets, liabilities, goals, policies, holdings, budget, insuranceNeed, investmentNeed, reservations, legacyReservations, constraints, memories, actions, decisions, products] = await Promise.all([
  client.asset.findMany({ where: { workspaceId, deletedAt: null }, orderBy: { id: "asc" } }),
  client.liability.findMany({ where: { workspaceId, deletedAt: null }, orderBy: { id: "asc" } }),
  client.goal.findMany({ where: { workspaceId, deletedAt: null }, orderBy: { priority: "asc" } }),
  client.insurancePolicy.findMany({ where: { workspaceId, deletedAt: null } }), client.holdingDetail.findMany({ where: { workspaceId, asset: { deletedAt: null } } }),
  client.budgetVersion.findFirst({ where: { workspaceId, status: "ACTIVE", validFrom: { lte: today() }, OR: [{ validTo: null }, { validTo: { gt: today() } }] }, orderBy: { validFrom: "desc" } }),
  client.insuranceNeed.findUnique({ where: { workspaceId } }), client.investmentNeed.findUnique({ where: { workspaceId } }),
  client.goalFundingReservation.findMany({ where: { workspaceId },include:{decision:{select:{goalId:true}}} }), client.carFundingReservation.findMany({ where: { workspaceId },include:{decision:{select:{goalId:true}}} }),
  client.decisionConstraint.findMany({ where: { workspaceId, scope: "GLOBAL", recordKind: "CURRENT", status: "ACTIVE", confirmedAt: { not: null } } }),
  client.planningMemory.findMany({ where: { workspaceId, scope: "GLOBAL", status: "ACTIVE", confirmedAt: { not: null } } }),
  client.action.findMany({ where: { workspaceId, ...(goalId ? { goalId } : {}), status: { notIn: ["DISMISSED", "VERIFIED_COMPLETED"] } }, orderBy: { createdAt: "desc" }, take: 40 }),
  client.goalDecision.findMany({ where: { workspaceId, ...(decisionId ? { id: decisionId } : goalId ? { goalId } : {}), status: { not: "REDACTED" } }, include: { plans: true, reviews: true }, orderBy: { updatedAt: "desc" }, take: 12 }),
  client.productVersion.findMany({ where: { status: "PUBLISHED" }, orderBy: { createdAt: "desc" } }),
 ]);
 const facts = { workspaceId, asOf: today(), revision: workspace.portfolioRevision, professionalRevision: workspace.professionalRevision, transactionRevision: workspace.transactionRevision,
  dataEpoch: workspace.dataEpoch, ledgerConfirmed: Boolean(workspace.ledgerConfirmedAt), profile: workspace.profile,
  assets, liabilities, goals, policies, holdings, budget, insuranceNeed, investmentNeed, reservations, legacyReservations, constraints, memories, actions, decisions, products };
 return { ...facts, signature: createHash("sha256").update(encode(facts)).digest("hex") };
}
export type AgentFacts = Awaited<ReturnType<typeof agentFacts>>;
export function contextForAgent(key: AgentKey, facts: AgentFacts) {
 const common = { asOf: facts.asOf, sourceSignature: facts.signature, ledgerConfirmed: facts.ledgerConfirmed, goals: facts.goals, decisions: facts.decisions, constraints: facts.constraints, memories: facts.memories };
 const specific = key === "CASHFLOW" ? { budget: facts.budget, liabilities: facts.liabilities, policies: facts.policies, insuranceNeed: facts.insuranceNeed, profile: facts.profile }
  : key === "INSURANCE" ? { policies: facts.policies, insuranceNeed: facts.insuranceNeed, budget: facts.budget }
  : key === "INVESTMENT" ? { assets: facts.assets, holdings: facts.holdings, reservations: facts.reservations, legacyReservations: facts.legacyReservations, investmentNeed: facts.investmentNeed }
  : key === "GOAL" ? { assets: facts.assets, holdings: facts.holdings, budget: facts.budget, reservations: facts.reservations, legacyReservations: facts.legacyReservations, actions: facts.actions }
  : { assets: facts.assets, liabilities: facts.liabilities, budget: facts.budget, insuranceNeed: facts.insuranceNeed, actions: facts.actions };
 return serialize({ ...common, ...specific });
}
export async function registerAgentDependencies(ownerType: string, ownerId: string, facts: AgentFacts) {
 const groups: [string, { id: string }[]][] = [["ASSET", facts.assets], ["LIABILITY", facts.liabilities], ["GOAL", facts.goals], ["POLICY", facts.policies], ["GOAL_DECISION", facts.decisions]];
 for (const [sourceType, rows] of groups) for (const row of rows) await db.dataDependency.upsert({ where: { workspaceId_ownerType_ownerId_sourceType_sourceId: { workspaceId: facts.workspaceId, ownerType, ownerId, sourceType, sourceId: row.id } }, create: { workspaceId: facts.workspaceId, ownerType, ownerId, sourceType, sourceId: row.id }, update: {} });
}
