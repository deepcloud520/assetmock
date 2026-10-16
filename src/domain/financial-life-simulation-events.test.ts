import { describe, expect, it } from 'vitest';
import { buildDemoSimulationOpening } from './financial-life-simulation-opening';
import { advanceSimulationRun, createSimulationRun } from './financial-life-simulation-engine';
import { buildEventCatalog, eligibleEvent, resolveCatalogEvents } from './financial-life-simulation-events';
function run(seed = 'catalog-test') {
  const result = buildDemoSimulationOpening('2026-10-05', '2026-10-05T00:00:00.000Z');
  if (result.status !== 'READY') throw new Error('示例开局失败');
  return createSimulationRun(result.opening, seed, 'catalog-run', '2026-10-05T00:00:00.000Z');
}
describe('financial event catalog', () => {
  it('defines 24 unique hypothetical cards and four dependent followups', () => {
    const catalog = buildEventCatalog(run().opening);
    expect(catalog).toHaveLength(24);
    expect(new Set(catalog.map(event => event.id)).size).toBe(24);
    expect(catalog.filter(event => event.origin === 'CONDITIONAL')).toHaveLength(4);
    expect(catalog.every(event => event.weight > 0 && Number.isInteger(event.weight))).toBe(true);
  });
  it('keeps followups ineligible until their parent effect ends', () => {
    const source = run(); const catalog = buildEventCatalog(source.opening);
    const child = catalog.find(event => event.id === 'work-resume')!;
    expect(eligibleEvent(child, source)).toBe(false);
    source.state.activeEffects.push({ occurrenceId: 'parent', effect: { kind: 'STATE_TAG', tag: 'work-pause', durationMonths: null }, remainingMonths: null });
    expect(eligibleEvent(child, source)).toBe(true);
    source.state.activeEffects.push({ occurrenceId: 'parent', effect: { kind: 'STATE_TAG', tag: 'work-recovering', durationMonths: 3 }, remainingMonths: 1 });
    expect(eligibleEvent(child, source)).toBe(false);
  });
  it('does not assume missing family information and respects occurrence limits', () => {
    const source = run(); source.state.familyStatus = null;
    const event = buildEventCatalog(source.opening).find(event => event.id === 'family-child-cost')!;
    expect(eligibleEvent(event, source)).toBe(false);
    source.state.familyStatus = 'MARRIED_WITH_CHILDREN';
    expect(eligibleEvent(event, source)).toBe(true);
    source.state.lastOccurrences.push({ eventId: event.id, month: '2026-01' });
    expect(eligibleEvent(event, source)).toBe(false);
  });
  it('reproduces runs, caps major events per year, and leaves three months between them', () => {
    const finish = (seed: string) => {
      let source = run(seed); source.state.availableCashMinor = '100000000';
      for (let index = 0; index < 100 && !source.ending; index++) source = advanceSimulationRun(source, '2026-10-05T00:00:00.000Z', resolveCatalogEvents);
      return source;
    };
    expect(finish('stable')).toEqual(finish('stable'));
    for (let seed = 0; seed < 40; seed++) {
      const source = finish(String(seed));
      expect(source.ending).not.toBeNull();
      const events = source.turns.flatMap(turn => turn.occurrences).filter(event => event.origin === 'EXPLORATORY');
      expect(new Set(events.map(event => event.month.slice(0, 4))).size).toBe(events.length);
      const monthNumber = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5));
      events.slice(1).forEach((event, index) => expect(monthNumber(event.month) - monthNumber(events[index].month)).toBeGreaterThanOrEqual(3));
      source.turns.flatMap(turn => turn.occurrences).filter(event => event.origin === 'CONDITIONAL').forEach(event => expect(event.triggeredByOccurrenceId).not.toBeNull());
    }
  });
  it('evaluates followup eligibility after mandatory events and honors exclusions', () => {
    const source = run();
    const base = buildEventCatalog(source.opening)[0];
    const parent = { ...base, id: 'mandatory', origin: 'SCHEDULED' as const, conditions: [], effects: [], followUpTags: ['ready'], exclusiveGroup: null };
    const child = { ...base, id: 'child', origin: 'CONDITIONAL' as const, conditions: [{ field: 'eventTag' as const, op: 'EQ' as const, value: 'ready' }], effects: [], exclusiveGroup: null };
    const events = resolveCatalogEvents(source, [child, parent]);
    expect(events.map(event => event.eventId)).toEqual(['mandatory', 'child']);
    const excluded = { ...child, exclusions: child.conditions };
    expect(resolveCatalogEvents(source, [excluded, parent]).map(event => event.eventId)).toEqual(['mandatory']);
  });
  it('honors a configurable repeat cooldown from the following month', () => {
    const source = run();
    const event = { ...buildEventCatalog(source.opening)[0], maxOccurrences: 3, cooldownMonths: 2, conditions: [] };
    source.state.lastOccurrences.push({ eventId: event.id, month: '2026-10' });
    source.state.month = '2026-12'; expect(eligibleEvent(event, source)).toBe(false);
    source.state.month = '2027-01'; expect(eligibleEvent(event, source)).toBe(true);
  });

});
