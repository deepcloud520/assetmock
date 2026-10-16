import { applyOccurrences } from './financial-life-simulation-engine';
import type { EventCondition, EventDefinition, EventEffect, EventOccurrence, SimulationOpening, SimulationRun, SimulationState } from './financial-life-simulation.types';

export const CATALOG_VERSION = '1.0.0';
/** Weights are game pacing choices, never real-world probabilities. All amounts are fictional hypotheses. */
export function buildEventCatalog(opening: SimulationOpening): EventDefinition[] {
  const cost = (percent: number) => (BigInt(opening.essentialExpenseMinor) * BigInt(percent) / 100n).toString();
  const income = (percent: number) => (BigInt(opening.stableIncomeMinor) * BigInt(percent) / 100n).toString();
  const expense = (percent: number): EventEffect => ({ kind: 'ONE_TIME_EXPENSE', amountMinor: cost(percent) });
  const monthly = (percent: number, durationMonths: number): EventEffect => ({ kind: 'MONTHLY_EXPENSE_DELTA', amountMinor: cost(percent), durationMonths });
  const tag = (name: string, durationMonths: number | null): EventEffect => ({ kind: 'STATE_TAG', tag: name, durationMonths });
  const hasTag = (value: string): EventCondition => ({ field: 'eventTag', op: 'EQ', value });
  const missingTag = (value: string): EventCondition => ({ field: 'eventTag', op: 'EQ', value });
  const definitions: EventDefinition[] = [];
  const add = (id: string, title: string, category: EventDefinition['category'], effects: EventEffect[], conditions: EventCondition[] = [], exclusions: EventCondition[] = [], origin: EventDefinition['origin'] = 'EXPLORATORY') => {
    definitions.push({ id, title, category, effects, conditions, exclusions, origin, version: 1,
      earliestMonth: null, latestMonth: null, priority: origin === 'CONDITIONAL' ? 10 : 0, weight: 1,
      cooldownMonths: 24, exclusiveGroup: category, maxOccurrences: 1, followUpTags: [], narrativeKey: id });
  };
  // Four chains: income interruption, housing repair, family support, goal price change.
  add('work-pause', '假设：收入短暂减少', 'WORK', [{ kind: 'MONTHLY_INCOME_OVERRIDE', amountMinor: income(60), durationMonths: 3 }, tag('work-pause', null), tag('work-recovering', 3)], [{ field: 'incomeStatus', op: 'EQ', value: 'STABLE' }]);
  add('work-resume', '收入恢复原有水平', 'WORK', [tag('work-resumed', null)], [hasTag('work-pause')], [missingTag('work-recovering'), missingTag('work-resumed')], 'CONDITIONAL');
  add('housing-repair', '假设：住所需要一次维修', 'HOUSING', [expense(80), tag('housing-repair', null), tag('repair-pending', 2)]);
  add('housing-maintenance', '维修之后的维护期', 'HOUSING', [monthly(5, 3), tag('maintenance-started', null)], [hasTag('housing-repair')], [missingTag('repair-pending'), missingTag('maintenance-started')], 'CONDITIONAL');
  add('family-support', '假设：家人临时需要支援', 'FAMILY', [monthly(20, 4), tag('family-support', null), tag('support-active', 4)]);
  add('family-support-end', '临时支援告一段落', 'FAMILY', [tag('support-ended', null)], [hasTag('family-support')], [missingTag('support-active'), missingTag('support-ended')], 'CONDITIONAL');
  add('goal-price-rise', '假设：目标预算上调', 'GOAL', [{ kind: 'GOAL_TARGET_DELTA', amountMinor: (BigInt(opening.goal.targetMinor) / 20n).toString() }, tag('goal-price-rise', null), tag('price-review', 6)]);
  add('goal-budget-review', '重新核对目标预算', 'GOAL', [tag('budget-reviewed', null)], [hasTag('goal-price-rise')], [missingTag('price-review'), missingTag('budget-reviewed')], 'CONDITIONAL');
  add('work-training', '假设：自费学习一项技能', 'WORK', [expense(30)]);
  add('work-commute', '假设：通勤费用增加', 'WORK', [monthly(8, 6)]);
  add('work-equipment', '假设：更换工作设备', 'WORK', [expense(60)]);
  add('work-hours', '假设：收入波动一个月', 'WORK', [{ kind: 'MONTHLY_INCOME_OVERRIDE', amountMinor: income(85), durationMonths: 1 }], [{ field: 'incomeStatus', op: 'EQ', value: 'STABLE' }]);
  add('housing-appliance', '假设：家电需要更换', 'HOUSING', [expense(50)]);
  add('housing-utilities', '假设：生活服务费增加', 'HOUSING', [monthly(5, 12)]);
  add('housing-moving', '假设：搬家产生额外费用', 'HOUSING', [expense(100)]);
  add('housing-small-repair', '假设：一次小额修缮', 'HOUSING', [expense(20)]);
  add('family-travel', '假设：一次家庭探访', 'FAMILY', [expense(40)]);
  add('family-celebration', '假设：家庭活动开销', 'FAMILY', [expense(25)]);
  add('family-child-cost', '假设：子女活动费用增加', 'FAMILY', [monthly(10, 3)], [{ field: 'familyStatus', op: 'EQ', value: 'MARRIED_WITH_CHILDREN' }]);
  add('health-check', '假设：一次自费体检', 'HEALTH_COST', [expense(15)]);
  add('health-dental', '假设：口腔护理开销', 'HEALTH_COST', [expense(35)]);
  add('health-care', '假设：短期健康相关支出', 'HEALTH_COST', [monthly(10, 2)]);
  add('goal-preparation', '假设：目标准备的额外开销', 'GOAL', [expense(25)]);
  add('goal-home-fee', '假设：购房相关费用上调', 'GOAL', [{ kind: 'GOAL_TARGET_DELTA', amountMinor: (BigInt(opening.goal.targetMinor) / 100n).toString() }], [{ field: 'goalType', op: 'EQ', value: 'HOME_PURCHASE' }]);
  return definitions;
}

const monthIndex = (month: string) => { const [year, value] = month.split('-').map(Number); return year * 12 + value; };
function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return result >>> 0;
}
function compareNumber(value: number, condition: Extract<EventCondition, { field: 'age' | 'reserveMonths' }>): boolean {
  switch (condition.op) {
    case 'LT': return value < condition.value;
    case 'LTE': return value <= condition.value;
    case 'GT': return value > condition.value;
    case 'GTE': return value >= condition.value;
    case 'EQ': return value === condition.value;
  }
}
function matches(condition: EventCondition, state: SimulationState, run: SimulationRun): boolean {
  if (condition.field === 'eventTag') {
    const tags = [...state.tags, ...state.activeEffects.flatMap(active => active.effect.kind === 'STATE_TAG' ? [active.effect.tag] : [])];
    return condition.op === 'EQ' ? tags.includes(condition.value) : !tags.includes(condition.value);
  }
  if (condition.field === 'hasLiability') return state.liabilities.some(debt => BigInt(debt.balanceMinor) > 0n) === condition.value;
  if (condition.field === 'age' || condition.field === 'reserveMonths') {
    const essential = BigInt(state.essentialExpenseMinor) + state.liabilities.reduce((sum, debt) => sum + (BigInt(debt.balanceMinor) < BigInt(debt.scheduledPaymentMinor) ? BigInt(debt.balanceMinor) : BigInt(debt.scheduledPaymentMinor)), 0n);
    const value = condition.field === 'age' ? state.age : essential === 0n ? Infinity : Number(BigInt(state.availableCashMinor)) / Number(essential);
    if (value === null) return false;
    return compareNumber(value, condition);
  }
  const value = condition.field === 'goalType' ? run.opening.goal.type : state[condition.field];
  if (value === null) return false;
  return condition.op === 'EQ' ? value === condition.value : value !== condition.value;
}
export function eligibleEvent(event: EventDefinition, run: SimulationRun): boolean {
  const state = run.state;
  const history = state.lastOccurrences.filter(previous => previous.eventId === event.id);
  if (history.length >= event.maxOccurrences || history.some(previous => monthIndex(state.month) - monthIndex(previous.month) <= event.cooldownMonths)) return false;
  if (event.earliestMonth && state.month < event.earliestMonth || event.latestMonth && state.month > event.latestMonth) return false;
  return event.conditions.every(condition => matches(condition, state, run)) && !event.exclusions.some(condition => matches(condition, state, run));
}

export function resolveCatalogEvents(run: SimulationRun, definitions: EventDefinition[] = buildEventCatalog(run.opening)): EventOccurrence[] {
  const order = { SCHEDULED: 0, USER_CONFIRMED: 1, CONDITIONAL: 2, EXPLORATORY: 3 };
  const catalog = [...definitions].sort((a, b) => order[a.origin] - order[b.origin] || b.priority - a.priority || a.id.localeCompare(b.id));
  const selected = catalog.filter(event => (event.origin === 'SCHEDULED' || event.origin === 'USER_CONFIRMED') && eligibleEvent(event, run));
  const preview = structuredClone(run);
  applyOccurrences(preview.state, selected.map(event => occurrence(event, run)));
  const eligible = catalog.filter(event => eligibleEvent(event, preview));
  const conditional = eligible.find(event => event.origin === 'CONDITIONAL' && !selected.some(other => other.exclusiveGroup && other.exclusiveGroup === event.exclusiveGroup));
  if (conditional) { selected.push(conditional); applyOccurrences(preview.state, [occurrence(conditional, run)]); }
  const history = run.state.lastOccurrences.filter(previous => catalog.find(event => event.id === previous.eventId)?.origin === 'EXPLORATORY');
  const year = run.state.month.slice(0, 4);
  // One candidate month per year, plus a no-event weight of three. This avoids monthly rerolls making events inevitable.
  const candidateMonth = hash(`${run.seed}:${year}:month`) % 12 + 1;
  if (Number(run.state.month.slice(5)) === candidateMonth && !history.some(previous => previous.month.startsWith(year))
    && !history.some(previous => monthIndex(run.state.month) - monthIndex(previous.month) < 3)) {
    const candidates = catalog.filter(event => eligibleEvent(event, preview) && event.origin === 'EXPLORATORY' && !selected.some(other => other.exclusiveGroup && other.exclusiveGroup === event.exclusiveGroup)).sort((a, b) => a.id.localeCompare(b.id));
    let draw = hash(`${run.seed}:${year}:event`) % (3 + candidates.reduce((total, event) => total + event.weight, 0));
    for (const event of candidates) { if (draw < event.weight) { selected.push(event); break; } draw -= event.weight; }
  }
  return selected.reduce<EventOccurrence[]>((events, event) => {
    const resolved = occurrence(event, run, catalog);
    if (event.origin === 'CONDITIONAL' && !resolved.triggeredByOccurrenceId) {
      resolved.triggeredByOccurrenceId = events.findLast(parent => event.conditions.some(condition => condition.field === 'eventTag' && parent.resolvedEffects.some(effect => effect.kind === 'STATE_TAG' && effect.tag === condition.value)))?.occurrenceId ?? null;
    }
    events.push(resolved);
    return events;
  }, []);
}

function occurrence(event: EventDefinition, run: SimulationRun, catalog: EventDefinition[] = []): EventOccurrence {
  return { occurrenceId: `${run.id}:${run.state.month}:${event.id}`, eventId: event.id,
    eventVersion: event.version, month: run.state.month, origin: event.origin, resolvedEffects: [...structuredClone(event.effects), ...event.followUpTags.map(tag => ({ kind: 'STATE_TAG' as const, tag, durationMonths: null }))],
    triggeredByOccurrenceId: event.origin === 'CONDITIONAL' ? run.turns.flatMap(turn => turn.occurrences).findLast(previous => {
      const parent = catalog.find(item => item.id === previous.eventId);
      return event.conditions.some(condition => condition.field === 'eventTag' && (parent?.effects.some(effect => effect.kind === 'STATE_TAG' && effect.tag === condition.value) || parent?.followUpTags.includes(condition.value)));
    })?.occurrenceId ?? null : null,
    assumptionSource: event.origin === 'USER_CONFIRMED' ? 'USER_CONFIRMED' : 'CATALOG_HYPOTHESIS',
  };
}
