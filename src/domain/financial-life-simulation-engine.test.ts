import { describe, expect, it } from 'vitest';
import { buildDemoSimulationOpening } from './financial-life-simulation-opening';
import { advanceSimulationRun, createSimulationRun } from './financial-life-simulation-engine';
import type { EventOccurrence, SimulationOpening } from './financial-life-simulation.types';
const now = '2026-10-05T00:00:00.000Z';
function opening(): SimulationOpening {
  const result = buildDemoSimulationOpening('2026-10-05', now);
  if (result.status !== 'READY') throw new Error('示例开局失败');
  return JSON.parse(JSON.stringify(result.opening));
}
function run(source = opening()) { return createSimulationRun(source, 'test-seed', 'run-1', now); }
const event = (month: string): EventOccurrence => ({ occurrenceId: 'event-1', eventId: 'income-change', eventVersion: 1, month, origin: 'EXPLORATORY', assumptionSource: 'CATALOG_HYPOTHESIS', triggeredByOccurrenceId: null, resolvedEffects: [{ kind: 'MONTHLY_INCOME_OVERRIDE', amountMinor: '0', durationMonths: 2 }] });
describe('monthly simulation engine', () => {
  it('settles a partial calendar year and preserves inputs and money', () => {
    const input = run(); const before = JSON.stringify(input);
    const result = advanceSimulationRun(input, now);
    expect(JSON.stringify(input)).toBe(before);
    expect(result.turns[0].months.map(month => month.month)).toEqual(['2026-11', '2026-12']);
    expect(result.state.month).toBe('2027-01');
    for (const month of result.turns[0].months) {
      expect(BigInt(month.openingCashMinor) + BigInt(month.incomeMinor)).toBe(
        BigInt(month.essentialExpenseMinor) + BigInt(month.flexibleExpenseMinor) + BigInt(month.eventExpenseMinor) + BigInt(month.debtPaymentMinor) + BigInt(month.actualContributionMinor) + BigInt(month.closingCashMinor));
    }
    expect(result.state.goalFundedMinor).toBe('3350000');
  });
  it.each([['GOAL_FIRST', '300000'], ['BALANCED', '250000'], ['SAFETY_FIRST', '0']] as const)('keeps strategy reserve for %s', (strategy, contribution) => {
    const source = opening(); source.strategy = strategy; source.unrestrictedLiquidMinor = '2200000';
    const result = advanceSimulationRun(run(source), now);
    expect(result.turns[0].months[0].actualContributionMinor).toBe(contribution);
  });
  it('caps individual debt payment at remaining balance', () => {
    const source = opening(); source.liabilities = [{ id: 'a', balanceMinor: '50000', scheduledPaymentMinor: '100000' }, { id: 'b', balanceMinor: '300000', scheduledPaymentMinor: '100000' }];
    const result = advanceSimulationRun(run(source), now);
    expect(result.turns[0].months[0].debtPaymentMinor).toBe('150000');
    expect(result.state.liabilities.map(debt => debt.balanceMinor)).toEqual(['0', '100000']);
  });
  it('ends on mandatory shortfall without spending protected goal funds', () => {
    const source = opening(); source.unrestrictedLiquidMinor = '0'; source.stableIncomeMinor = '750000';
    const result = advanceSimulationRun(run(source), now);
    expect(result.ending?.kind).toBe('CASH_GAP');
    expect(result.turns[0].months[0]).toMatchObject({ dueDebtPaymentMinor: '100000', debtPaymentMinor: '50000', unfundedGapMinor: '50000', closingCashMinor: '0', actualContributionMinor: '0' });
    expect(result.state.goalFundedMinor).toBe(source.initialGoalFundedMinor);
    expect(result.state.liabilities[0].balanceMinor).toBe('2950000');
  });
  it('keeps an event effective for its occurrence month and exactly one following month', () => {
    const source = opening(); source.unrestrictedLiquidMinor = '10000000';
    const first = advanceSimulationRun(run(source), now, current => current.state.month === source.startMonth ? [event(current.state.month)] : []);
    expect(first.turns[0].stopReason).toBe('KEY_EVENT');
    expect(first.turns[0].months[0].incomeMinor).toBe('0');
    const second = advanceSimulationRun(first, now);
    expect(second.turns[1].months[0].incomeMinor).toBe('0');
    const third = advanceSimulationRun(second, now);
    expect(third.turns[2].months[0].incomeMinor).toBe('1500000');
  });
  it.each([['1', 'GOAL_MET'], ['999999999', 'GOAL_SHORTFALL']] as const)('ends at inclusive target month with %s target', (target, kind) => {
    const source = opening(); source.goal.targetMinor = target; source.goal.targetMonth = '2027-02'; source.endMonth = '2027-02';
    let result = run(source);
    while (!result.ending) result = advanceSimulationRun(result, now);
    expect(result.ending).toMatchObject({ kind, month: '2027-02' });
    expect(result.turns.at(-1)?.months.map(month => month.month)).toEqual(['2027-01', '2027-02']);
    expect(advanceSimulationRun(result, now)).toBe(result);
  });
  it('reproduces the complete fixed demo and clears repaid debt', () => {
    const finish = () => { let result = run(); for (let i = 0; i < 30 && !result.ending; i++) result = advanceSimulationRun(result, now); return result; };
    const result = finish();
    expect(result).toEqual(finish());
    expect(result.ending?.kind).toBe('GOAL_MET');
    expect(result.turns.flatMap(turn => turn.months)).toHaveLength(60);
    expect(result.state.liabilities[0].balanceMinor).toBe('0');
  });
  it('runs the full 240 month horizon without skipping the final month', () => {
    const source = opening(); source.endMonth = '2046-10'; source.goal.targetMonth = source.endMonth;
    let result = run(source);
    while (!result.ending) result = advanceSimulationRun(result, now);
    expect(result.turns.flatMap(turn => turn.months)).toHaveLength(240);
    expect(result.ending?.month).toBe('2046-10');
  });
  it.each([
    { kind: 'ONE_TIME_EXPENSE', amountMinor: '-1' },
    { kind: 'GOAL_TARGET_DELTA', amountMinor: '-20000000' },
    { kind: 'OTHER_ASSET_VALUE_DELTA', amountMinor: '-5000001' },
    { kind: 'MONTHLY_INCOME_OVERRIDE', amountMinor: '-1', durationMonths: 2 },
    { kind: 'MONTHLY_EXPENSE_DELTA', amountMinor: '-1', durationMonths: 0 },
  ] as const)('rejects invalid event effects instead of clamping %o', effect => {
    const source = run(); const before = JSON.stringify(source);
    expect(() => advanceSimulationRun(source, now, current => [{ ...event(current.state.month), resolvedEffects: [effect] }])).toThrow();
    expect(JSON.stringify(source)).toBe(before);
  });

});
