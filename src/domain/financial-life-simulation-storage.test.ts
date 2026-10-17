import { describe, expect, it } from 'vitest';
import { buildDemoSimulationOpening } from './financial-life-simulation-opening';
import { createSimulationRun, advanceSimulationRun } from './financial-life-simulation-engine';
import { CATALOG_VERSION, resolveCatalogEvents } from './financial-life-simulation-events';
import { restoreSimulation, serializeSimulation } from './financial-life-simulation-storage';
const now = '2026-10-05T00:00:00.000Z';
function run() {
  const result = buildDemoSimulationOpening('2026-10-05', now);
  if (result.status !== 'READY') throw new Error('开局失败');
  const source = createSimulationRun(result.opening, 'persist', 'persist-run', now);
  source.catalogVersion = CATALOG_VERSION;
  return source;
}
describe('local life progress', () => {
  it('restores the exact event and financial state by replay', () => {
    let source = run();
    for (let turn = 0; turn < 3; turn++) source = advanceSimulationRun(source, now, resolveCatalogEvents);
    expect(restoreSimulation(serializeSimulation(source))).toEqual(source);
  });
  it('restores a completed run and rejects impossible further progress', () => {
    let source = run();
    while (!source.ending) source = advanceSimulationRun(source, now, resolveCatalogEvents);
    expect(restoreSimulation(serializeSimulation(source))).toEqual(source);
    const saved = JSON.parse(serializeSimulation(source)); saved.turns++;
    expect(restoreSimulation(JSON.stringify(saved))).toBeNull();
  });
  it('rejects corrupted amounts, versions, dates, and oversized horizons', () => {
    const saved = JSON.parse(serializeSimulation(run()));
    for (const corrupt of [
      { ...saved, engineVersion: 'old' },
      { ...saved, turns: -1 },
      { ...saved, opening: { ...saved.opening, unrestrictedLiquidMinor: '-1' } },
      { ...saved, opening: { ...saved.opening, initialGoalFundedMinor: '1' } },
      { ...saved, opening: { ...saved.opening, goal: { ...saved.opening.goal, targetMinor: '0' } } },
      { ...saved, opening: { ...saved.opening, startMonth: '2026-13' } },
      { ...saved, opening: { ...saved.opening, endMonth: '2100-01' } },
    ]) expect(restoreSimulation(JSON.stringify(corrupt))).toBeNull();
    expect(restoreSimulation('{')).toBeNull();
  });
  it('isolates real saves by workspace', () => {
    const source = run();
    source.opening.source = { kind: 'REAL', workspaceId: 'workspace-a', portfolioRevision: 1, planSetId: 'plan', planKey: 'A', goalId: source.opening.goal.id, capturedAt: now };
    expect(restoreSimulation(serializeSimulation(source), 'workspace-a')).not.toBeNull();
    expect(restoreSimulation(serializeSimulation(source), 'workspace-b')).toBeNull();
  });
});
