import { professionalState } from "./unified-store";
import type { Prisma } from "@prisma/client";
import { budgetSchema, monthlyPremium, policySchema, holdingSchema, type PolicyFacts } from "@/domain/specialist-managers";
/** Optional facts: existing workspaces have no professional layer and retain their original behavior. */
export async function professionalFacts(tx: Prisma.TransactionClient, workspaceId: string) {
  const [state, rows, details] = await Promise.all([professionalState(tx, workspaceId), tx.insurancePolicy.findMany({ where: { workspaceId, deletedAt: null }, orderBy: { id: "asc" } }), tx.holdingDetail.findMany({ where: { workspaceId, asset: { deletedAt: null } }, orderBy: { assetId: "asc" } })]);
  const budget = budgetSchema.safeParse(JSON.parse(state?.budgetJson ?? "{}"));
  const policies = rows.map((p) => policySchema.parse(JSON.parse(p.dataJson)));
  const insurance = JSON.parse(state?.insuranceJson ?? "{}") as { status?: string };
  const premium = monthlyPremium(policies);
  const expenseReady = insurance.status === "NONE" || (insurance.status === "PROVIDED" && policies.every((p) => p.confirmed && p.premiumMinor !== null) && policies.length > 0);
  return { budget: budget.success ? budget.data : null, premiumMinor: premium.toString(), expenseReady,
    coverageState: insurance.status ?? "UNKNOWN", policies: policies as PolicyFacts[],
    holdings: details.map((d) => ({ ...holdingSchema.parse(JSON.parse(d.dataJson)), assetId: d.assetId })),
  };
}
