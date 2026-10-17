import { expect, it } from 'vitest';
import { buildDemoSimulationOpening, type OpeningInput } from './financial-life-simulation-opening';
import { createSimulationRun } from './financial-life-simulation-engine';
import { isSimulationStale } from './financial-life-simulation-currentness';
function setup() {
  const opened = buildDemoSimulationOpening('2026-10-05','2026-10-05T00:00:00.000Z');
  if (opened.status !== 'READY') throw new Error('开局失败');
  const run = createSimulationRun(opened.opening, 'seed', 'run', opened.opening.source.capturedAt);
  const data: Pick<OpeningInput, 'portfolio' | 'planning'> = {
    portfolio: { id: 'space', portfolioRevision: 1, ledgerConfirmedAt: '2026-10-05', profile: null, assets: [], liabilities: [], goals: [] },
    planning: { id: 'plan', sourceRevision: 1, isStale: false, goalId: run.opening.goal.id, selectedPlanKey: 'B', plans: [] },
  };
  return { run, data };
}
it('keeps the demo independent of the current financial workspace', () => {
  expect(isSimulationStale(setup().run)).toBe(false);
});
it('pauses a real run when any frozen source identity or confirmation changes', () => {
  const { run, data } = setup();
  run.opening.source = { kind: 'REAL', workspaceId: 'space', portfolioRevision: 1, planSetId: 'plan', planKey: 'B', goalId: run.opening.goal.id, capturedAt: run.createdAt };
  expect(isSimulationStale(run, data)).toBe(false);
  expect(isSimulationStale(run)).toBe(true);
  for (const patch of [{ id: 'different' }, { portfolioRevision: 2 }, { ledgerConfirmedAt: null }]) {
    expect(isSimulationStale(run, { ...data, portfolio: { ...data.portfolio, ...patch } })).toBe(true);
  }
  for (const patch of [{ id: 'different' }, { sourceRevision: 2 }, { selectedPlanKey: 'A' }, { goalId: 'different' }, { isStale: true }]) {
    expect(isSimulationStale(run, { ...data, planning: { ...data.planning!, ...patch } })).toBe(true);
  }
});
