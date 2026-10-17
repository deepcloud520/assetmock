import type { EventEffect, EventOccurrence, FrozenSimulationOpening, MonthlyLedger, SimulationRun, SimulationOpening, SimulationState, SimulationTurn } from './financial-life-simulation.types';

export const ENGINE_VERSION = '1.0.0';
export const nextMonth = (month: string) => {
  const [year, value] = month.split('-').map(Number);
  return `${year + (value === 12 ? 1 : 0)}-${String(value === 12 ? 1 : value + 1).padStart(2, '0')}`;
};
const min = (a: bigint, b: bigint) => a < b ? a : b;
const max = (a: bigint, b: bigint) => a > b ? a : b;
const sum = (values: string[]) => values.reduce((total, value) => total + BigInt(value), 0n);
const monthsBetween = (from: string, to: string) => {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + tm - fm;
};
export type EventResolver = (run: SimulationRun) => EventOccurrence[];

/** All identifiers and timestamps come from the caller; the engine has no clock or random source. */
export function createSimulationRun(opening: FrozenSimulationOpening, seed: string, id: string, now: string): SimulationRun {
  const frozenCopy: SimulationOpening = { ...structuredClone(opening), liabilities: opening.liabilities.map(debt => ({ ...debt })), assumptions: opening.assumptions.map(assumption => ({ ...assumption })) };
  return {
    id, seed, schemaVersion: 1, engineVersion: ENGINE_VERSION, catalogVersion: 'none', mode: 'OBSERVE',
    status: 'READY', opening: frozenCopy, turns: [], ending: null, createdAt: now, updatedAt: now,
    state: {
      month: opening.startMonth, age: opening.ageAtStart, familyStatus: opening.familyStatus,
      incomeStatus: 'STABLE', availableCashMinor: opening.unrestrictedLiquidMinor,
      goalFundedMinor: opening.initialGoalFundedMinor, otherAssetValueMinor: opening.otherAssetValueMinor,
      liabilities: structuredClone(frozenCopy.liabilities), stableIncomeMinor: opening.stableIncomeMinor,
      otherIncomeMinor: opening.otherIncomeMinor, essentialExpenseMinor: opening.essentialExpenseMinor,
      flexibleExpenseMinor: opening.flexibleExpenseMinor, goalTargetMinor: opening.goal.targetMinor,
      goalStatus: 'ON_TRACK', activeEffects: [], tags: [], lastOccurrences: [],
    },
  };
}

function checkedAmount(value: bigint, strictlyPositive = false): string {
  if (value < 0n || (strictlyPositive && value === 0n)) throw new Error('事件造成非法金额，请修正事件配置');
  return value.toString();
}

function validateEffect(effect: EventEffect) {
  if ('durationMonths' in effect && effect.durationMonths !== null && (!Number.isInteger(effect.durationMonths) || effect.durationMonths <= 0)) throw new Error('事件持续月份必须为正整数');
  if (effect.kind === 'MONTHLY_INCOME_OVERRIDE' || effect.kind === 'ONE_TIME_EXPENSE') checkedAmount(BigInt(effect.amountMinor));
}

export function applyOccurrences(state: SimulationState, occurrences: EventOccurrence[]): bigint {
  let eventExpense = 0n;
  for (const occurrence of occurrences) {
    if (occurrence.month !== state.month) throw new Error('事件月份与结算月份不一致');
    state.lastOccurrences.push({ eventId: occurrence.eventId, month: occurrence.month });
    for (const effect of occurrence.resolvedEffects) {
      validateEffect(effect);
      switch (effect.kind) {
        case 'ONE_TIME_EXPENSE': {
          const amount = BigInt(effect.amountMinor);
          eventExpense += amount; break;
        }
        case 'GOAL_TARGET_DELTA': state.goalTargetMinor = checkedAmount(BigInt(state.goalTargetMinor) + BigInt(effect.amountMinor), true); break;
        case 'OTHER_ASSET_VALUE_DELTA': state.otherAssetValueMinor = checkedAmount(BigInt(state.otherAssetValueMinor) + BigInt(effect.amountMinor)); break;
        default:
          state.activeEffects.push({ occurrenceId: occurrence.occurrenceId, effect, remainingMonths: effect.durationMonths });
      }
    }
  }
  return eventExpense;
}

function goalStatus(funded: bigint, target: bigint, contribution: bigint, remaining: number, deadline: boolean): SimulationState['goalStatus'] {
  if (deadline) return funded >= target ? 'MET_ON_TIME' : 'SHORT_AT_DEADLINE';
  return funded + contribution * BigInt(remaining) < target ? 'AT_RISK' : 'ON_TRACK';
}

function settleMonth(run: SimulationRun, occurrences: EventOccurrence[]): MonthlyLedger {
  const state = run.state;
  let eventExpense = applyOccurrences(state, occurrences);
  let income = BigInt(state.stableIncomeMinor) + BigInt(state.otherIncomeMinor);
  for (const { effect } of state.activeEffects) {
    if (effect.kind === 'MONTHLY_INCOME_OVERRIDE') income = BigInt(effect.amountMinor) + BigInt(state.otherIncomeMinor);
    if (effect.kind === 'MONTHLY_EXPENSE_DELTA') eventExpense += BigInt(effect.amountMinor);
  }
  checkedAmount(eventExpense);
  if (income < 0n) throw new Error('收入不能为负数');
  const essential = BigInt(state.essentialExpenseMinor);
  const debtDue = sum(state.liabilities.map(debt => min(BigInt(debt.balanceMinor), BigInt(debt.scheduledPaymentMinor)).toString()));
  const openingCash = BigInt(state.availableCashMinor);
  let cash = openingCash + income;
  const pay = (due: bigint) => { const paid = min(cash, due); cash -= paid; return paid; };
  const essentialPaid = pay(essential);
  const eventPaid = pay(eventExpense);
  const debtPaid = pay(debtDue);
  let debtRemaining = debtPaid;
  for (const debt of state.liabilities) {
    const payment = min(debtRemaining, min(BigInt(debt.balanceMinor), BigInt(debt.scheduledPaymentMinor)));
    debt.balanceMinor = (BigInt(debt.balanceMinor) - payment).toString();
    debtRemaining -= payment;
  }
  const gap = essential + eventExpense + debtDue - essentialPaid - eventPaid - debtPaid;
  const flexiblePaid = pay(BigInt(state.flexibleExpenseMinor));
  const reserveMonths = { GOAL_FIRST: 0n, BALANCED: 3n, SAFETY_FIRST: 6n }[run.opening.strategy];
  const planned = BigInt(run.opening.goal.plannedContributionMinor);
  const contribution = gap > 0n ? 0n : min(planned, max(0n, cash - reserveMonths * (essential + debtDue)));
  cash -= contribution;
  state.availableCashMinor = cash.toString();
  state.goalFundedMinor = (BigInt(state.goalFundedMinor) + contribution).toString();
  const funded = BigInt(state.goalFundedMinor);
  const target = BigInt(state.goalTargetMinor);
  const deadline = state.month === run.opening.goal.targetMonth;
  state.goalStatus = goalStatus(funded, target, contribution, monthsBetween(state.month, run.opening.goal.targetMonth), deadline);
  const riskFlags: MonthlyLedger['riskFlags'] = [];
  if (cash < 3n * (essential + debtDue)) riskFlags.push('LOW_RESERVE');
  if (contribution < planned) riskFlags.push('CONTRIBUTION_PAUSED');
  if (gap > 0n) riskFlags.push('UNFUNDED_GAP');
  if (state.goalStatus === 'AT_RISK' || state.goalStatus === 'SHORT_AT_DEADLINE') riskFlags.push('GOAL_AT_RISK');
  const ledger: MonthlyLedger = {
    month: state.month, openingCashMinor: openingCash.toString(), incomeMinor: income.toString(),
    dueEssentialExpenseMinor: essential.toString(), dueEventExpenseMinor: eventExpense.toString(), dueDebtPaymentMinor: debtDue.toString(),
    essentialExpenseMinor: essentialPaid.toString(), eventExpenseMinor: eventPaid.toString(), debtPaymentMinor: debtPaid.toString(),
    flexibleExpenseMinor: flexiblePaid.toString(), plannedContributionMinor: planned.toString(), actualContributionMinor: contribution.toString(),
    closingCashMinor: cash.toString(), closingGoalFundedMinor: state.goalFundedMinor,
    closingLiabilityMinor: sum(state.liabilities.map(debt => debt.balanceMinor)).toString(), unfundedGapMinor: gap.toString(),
    eventOccurrenceIds: occurrences.map(event => event.occurrenceId), riskFlags,
  };
  state.activeEffects = state.activeEffects.map(active => ({ ...active, remainingMonths: active.remainingMonths === null ? null : active.remainingMonths - 1 }))
    .filter(active => active.remainingMonths === null || active.remainingMonths > 0);
  const overrides = state.activeEffects.filter(active => active.effect.kind === 'MONTHLY_INCOME_OVERRIDE');
  state.incomeStatus = overrides.length ? 'CHANGED' : 'STABLE';
  state.month = nextMonth(state.month);
  if (state.age !== null) state.age = run.opening.ageAtStart! + Math.floor(monthsBetween(run.opening.startMonth, state.month) / 12);
  return ledger;
}

function buildEnding(run: SimulationRun, turn: SimulationTurn, ledger: MonthlyLedger, gap: boolean, deadline: boolean): NonNullable<SimulationRun['ending']> {
  const lowest = [...run.turns.flatMap(previous => previous.months), ...turn.months]
        .reduce((value, month) => min(value, BigInt(month.closingCashMinor)), BigInt(run.opening.unrestrictedLiquidMinor));
  return {
        kind: gap ? 'CASH_GAP' : deadline ? (BigInt(run.state.goalFundedMinor) >= BigInt(run.state.goalTargetMinor) ? 'GOAL_MET' : 'GOAL_SHORTFALL') : 'HORIZON_REACHED',
        month: ledger.month, goalTargetMinor: run.state.goalTargetMinor, goalFundedMinor: run.state.goalFundedMinor,
        goalGapMinor: max(0n, BigInt(run.state.goalTargetMinor) - BigInt(run.state.goalFundedMinor)).toString(),
        lowestCashMinor: lowest.toString(), unfundedGapMinor: ledger.unfundedGapMinor,
        pivotalOccurrenceIds: [...run.turns.flatMap(previous => previous.occurrences), ...turn.occurrences].map(event => event.occurrenceId),
      };
}

/** Advance to year end, a financial event, or the first terminal month. Input is never mutated. */
export function advanceSimulationRun(input: SimulationRun, now: string, resolveEvents: EventResolver = () => []): SimulationRun {
  if (input.status === 'ENDED' || input.status === 'STALE') return input;
  const run = structuredClone(input);
  const turn: SimulationTurn = {
    turnIndex: run.turns.length + 1, fromMonth: run.state.month, toMonth: run.state.month,
    openingState: structuredClone(run.state), closingState: structuredClone(run.state), months: [], occurrences: [], narrative: [], stopReason: 'YEAR_END',
  };
  while (run.state.month <= run.opening.endMonth) {
    const occurrences = resolveEvents(run);
    const ledger = settleMonth(run, occurrences);
    turn.months.push(ledger); turn.occurrences.push(...occurrences); turn.toMonth = ledger.month;
    turn.narrative.push(...occurrences.map(event => ({ key: event.eventId, occurrenceId: event.occurrenceId, referencedFields: ['incomeMinor', 'eventExpenseMinor', 'closingCashMinor'] })));
    if (!occurrences.length) turn.narrative.push({ key: 'monthly-settlement', occurrenceId: null, referencedFields: ['actualContributionMinor', 'closingCashMinor'] });
    const gap = BigInt(ledger.unfundedGapMinor) > 0n;
    const deadline = ledger.month >= run.opening.goal.targetMonth;
    const horizon = ledger.month >= run.opening.endMonth;
    if (gap || deadline || horizon) {
      turn.stopReason = gap ? 'UNFUNDED_GAP' : 'GOAL_DEADLINE';
      run.ending = buildEnding(run, turn, ledger, gap, deadline);
      break;
    }
    if (occurrences.length) { turn.stopReason = 'KEY_EVENT'; break; }
    if (ledger.month.endsWith('-12')) break;
  }
  turn.closingState = structuredClone(run.state);
  run.turns.push(turn); run.status = run.ending ? 'ENDED' : 'PAUSED_AT_TURN'; run.updatedAt = now;
  return run;
}
