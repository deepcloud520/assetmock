import type { OpeningInput } from './financial-life-simulation-opening';
import type { SimulationRun } from './financial-life-simulation.types';

/** A saved real run may be read, but advancing requires the same confirmed ledger and selected plan. */
export function isSimulationStale(run: SimulationRun, data?: Pick<OpeningInput, 'portfolio' | 'planning'>): boolean {
  const source = run.opening.source;
  if (source.kind === 'DEMO') return false;
  if (!data?.planning || !data.portfolio.ledgerConfirmedAt) return true;
  return source.workspaceId !== data.portfolio.id
    || source.portfolioRevision !== data.portfolio.portfolioRevision
    || source.planSetId !== data.planning.id
    || source.planKey !== data.planning.selectedPlanKey
    || source.goalId !== data.planning.goalId
    || data.planning.sourceRevision !== source.portfolioRevision
    || data.planning.isStale;
}
