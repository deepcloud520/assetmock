import { z } from 'zod';
import { advanceSimulationRun, createSimulationRun, ENGINE_VERSION } from './financial-life-simulation-engine';
import { CATALOG_VERSION, resolveCatalogEvents } from './financial-life-simulation-events';
import type { SimulationRun } from './financial-life-simulation.types';
const money = z.string().regex(/^(0|[1-9]\d*)$/).max(30);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const funding = z.object({ kind: z.enum(['LINKED_ASSETS_ONLY', 'DECLARED_ONLY', 'CONFIRMED_DISJOINT']), linkedAssetsMinor: money, declaredPreparedMinor: money });
const source = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('DEMO'), sampleId: z.literal('financial-life-demo-v1'), capturedAt: z.string().datetime() }),
  z.object({ kind: z.literal('REAL'), workspaceId: z.string().min(1), portfolioRevision: z.number().int().nonnegative(), planSetId: z.string().min(1), planKey: z.enum(['A','B','C']), goalId: z.string().min(1), capturedAt: z.string().datetime() }),
]);
const openingSchema = z.object({
  source, startMonth: month, endMonth: month, currency: z.literal('CNY'), strategy: z.enum(['GOAL_FIRST','BALANCED','SAFETY_FIRST']),
  ageAtStart: z.number().int().min(0).max(120).nullable(), familyStatus: z.string().nullable(),
  unrestrictedLiquidMinor: money, goalFunding: funding, initialGoalFundedMinor: money, otherAssetValueMinor: money,
  liabilities: z.array(z.object({ id: z.string(), balanceMinor: money, scheduledPaymentMinor: money })).max(1000),
  stableIncomeMinor: money, otherIncomeMinor: money, essentialExpenseMinor: money, flexibleExpenseMinor: money,
  goal: z.object({ id: z.string(), name: z.string(), type: z.string(), targetMinor: money, targetMonth: month, plannedContributionMinor: money, flexible: z.boolean() }),
  assumptions: z.array(z.object({ field: z.string(), source: z.enum(['LEDGER','PLAN','USER_CONFIRMED','CATALOG_HYPOTHESIS']), note: z.string() })).max(1000),
}).refine(value => {
  const index = (value: string) => Number(value.slice(0,4))*12+Number(value.slice(5));
  const length = index(value.endMonth)-index(value.startMonth)+1;
  const prepared = value.goalFunding.kind === 'LINKED_ASSETS_ONLY' ? BigInt(value.goalFunding.linkedAssetsMinor)
    : value.goalFunding.kind === 'DECLARED_ONLY' ? BigInt(value.goalFunding.declaredPreparedMinor)
    : BigInt(value.goalFunding.linkedAssetsMinor) + BigInt(value.goalFunding.declaredPreparedMinor);
  return length > 0 && length <= 240 && value.goal.targetMonth === value.endMonth && BigInt(value.goal.targetMinor) > 0n
    && BigInt(value.initialGoalFundedMinor) === prepared
    && (value.source.kind === 'DEMO' || value.source.goalId === value.goal.id);
});
const saveSchema = z.object({ schemaVersion: z.literal(1), engineVersion: z.literal(ENGINE_VERSION), catalogVersion: z.literal(CATALOG_VERSION),
  id: z.string().min(1).max(200), seed: z.string().min(1).max(200), opening: openingSchema, turns: z.number().int().min(0).max(240), createdAt: z.string().datetime(), updatedAt: z.string().datetime() });
export function serializeSimulation(run: SimulationRun): string {
  return JSON.stringify({ schemaVersion: 1, engineVersion: ENGINE_VERSION, catalogVersion: CATALOG_VERSION, id: run.id, seed: run.seed,
    opening: run.opening, turns: run.turns.length, createdAt: run.createdAt, updatedAt: run.updatedAt });
}
/** Store the opening and progress only. Recompute every ledger, rather than trusting saved balances. */
export function restoreSimulation(raw: string, workspaceId?: string): SimulationRun | null {
  try {
    if (raw.length > 1000000) return null;
    const saved = saveSchema.parse(JSON.parse(raw));
    if (saved.opening.source.kind === 'REAL' && saved.opening.source.workspaceId !== workspaceId) return null;
    let run = createSimulationRun(saved.opening, saved.seed, saved.id, saved.createdAt);
    run.catalogVersion = CATALOG_VERSION;
    for (let turn = 0; turn < saved.turns; turn++) {
      if (run.ending) return null;
      run = advanceSimulationRun(run, saved.updatedAt, resolveCatalogEvents);
    }
    return run;
  } catch { return null; }
}
