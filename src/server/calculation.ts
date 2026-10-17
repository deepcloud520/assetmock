import { calculateWealth, FORMULA_VERSION, type WealthCalculation } from "@/domain/calculator";
import { db } from "@/lib/db";
import { ApiError } from "./portfolio";

export async function getWealthCalculation(workspaceId: string): Promise<WealthCalculation> {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      profile: true,
      assets: { where: { deletedAt: null } },
      liabilities: { where: { deletedAt: null } },
      goals: { where: { deletedAt: null } },
    },
  });
  if (!workspace) throw new ApiError("工作区不存在，请刷新页面重试", 404);

  const existing = await db.calculationSnapshot.findUnique({
    where: {
      workspaceId_sourceRevision_formulaVersion: {
        workspaceId,
        sourceRevision: workspace.portfolioRevision,
        formulaVersion: FORMULA_VERSION,
      },
    },
  });
  if (existing) return JSON.parse(existing.resultJson) as WealthCalculation;

  const result = calculateWealth({
    revision: workspace.portfolioRevision,
    asOf: new Date(),
    ledgerConfirmed: Boolean(workspace.ledgerConfirmedAt),
    profile: workspace.profile,
    assets: workspace.assets,
    liabilities: workspace.liabilities,
    goals: workspace.goals,
  });

  await db.calculationSnapshot.upsert({
    where: {
      workspaceId_sourceRevision_formulaVersion: {
        workspaceId,
        sourceRevision: workspace.portfolioRevision,
        formulaVersion: FORMULA_VERSION,
      },
    },
    update: {},
    create: {
      workspaceId,
      sourceRevision: workspace.portfolioRevision,
      formulaVersion: FORMULA_VERSION,
      resultJson: JSON.stringify(result),
    },
  });
  return result;
}
