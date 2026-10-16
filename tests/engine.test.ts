import { describe, expect, it } from 'vitest';
import { advanceMonth, createInitialState, stateFromResult, assertState } from '../src/domain/engine';
import { profiles, rules } from '../src/domain/fixtures';
import { calculateSetup } from '../src/domain/setup';
import { monthlyPayment, repayment } from '../src/domain/money';
import { readCatalog } from '../src/server/catalog';
import type { Draws, Setup } from '../src/domain/types';

const quiet: Draws = { medical: 999999, jobLoss: 999999, bonusDelay: 999999, marketDrop: 999999 };
function setup(index = 0): Setup {
  return calculateSetup({ profileId: profiles[index].id, price: 20000000, offerId: 'loan-a', downPaymentPercent: 30, termMonths: 36 }, profiles[index], readCatalog()[0], rules);
}
function simulate(s: Setup, changes: Record<number, Partial<Draws>> = {}) {
  let state = createInitialState(s);
  const history = [];
  for (let month = 1; month <= 12; month++) {
    if (Object.values(state.paths).every(p => p.status !== 'running')) break;
    const result = advanceMonth(state, { ...quiet, ...changes[month] }, s);
    history.push(result); state = stateFromResult(result);
  }
  return { state, history };
}
describe('金额基准与不变量', () => {
  it('逐分匹配GAME-U01无事件基准', () => {
    const s = setup(); const initial = createInitialState(s);
    expect(initial.paths.cash.netWorth).toBe(30000000);
    expect(initial.paths.loan.netWorth).toBe(30000000);
    expect(s.loan.payment).toBe(425907);
    const { state, history } = simulate(s);
    expect(history[0].paths.loan.ledger?.interest).toBe(70000);
    expect(history[0].paths.cash.state.netWorth).toBe(30550000);
    expect(history[0].paths.loan.state.netWorth).toBe(30480000);
    expect(state.paths.loan.loanBalance).toBe(9609686);
    expect(state.paths.loan.car).toBe(17600000);
    expect(history.reduce((v, m) => v + m.paths.loan.ledger!.interest, 0)).toBe(720570);
    expect(state.paths.cash.netWorth).toBe(38600000);
    expect(state.paths.loan.netWorth).toBe(37879430);
  });
  it.each([0, 1, 2, 3, 4])('角色%s可以完成默认无事件局', i => {
    const s = setup(i); const { state, history } = simulate(s);
    expect(state.month).toBe(12);
    expect(state.paths.cash.status).toBe('completed'); expect(state.paths.loan.status).toBe('completed');
    for (const month of history) for (const result of Object.values(month.paths)) assertState(result.state);
    expect(state.paths.cash.netWorth).toBe(s.profile.cash + s.profile.fund - s.profile.debt + 12 * (s.profile.salary - s.profile.living - 150000 - 200000) + s.profile.bonus);
    expect(state.paths.cash.debt).toBe(0);
  });
  it('零息与正常利率最后一期归零', () => {
    for (const rate of ['0', '0.06', '0.048']) {
      let balance = 14000001; const payment = monthlyPayment(balance, rate, 36);
      for (let m = 1; m <= 36; m++) { const due = repayment(balance, rate, payment, m === 36); balance -= due.principal; expect(balance).toBeGreaterThanOrEqual(0); }
      expect(balance).toBe(0);
    }
  });
  it('贷款费用开局减少净资产', () => {
    const s = calculateSetup({ profileId: profiles[0].id, price: 20000000, offerId: 'loan-b', downPaymentPercent: 50, termMonths: 24 }, profiles[0], readCatalog()[1], rules);
    const state = createInitialState(s);
    expect(state.paths.cash.netWorth - state.paths.loan.netWorth).toBe(200000);
  });
});
describe('事件状态与结算', () => {
  it('医疗触发后不重复扣款，第4月可再次触发', () => {
    const { history } = simulate(setup(), { 1: { medical: 0 }, 2: { medical: 0 }, 3: { medical: 0 }, 4: { medical: 0 } });
    expect(history.slice(0, 4).map(m => m.paths.cash.ledger?.medical)).toEqual([5000000, 0, 0, 5000000]);
    expect(history[1].events.some(e => e.kind === 'medical')).toBe(false);
  });
  it('失业3个月，第4月恢复，未额外扣工资', () => {
    const { history } = simulate(setup(), { 1: { jobLoss: 0 }, 2: { jobLoss: 0 }, 3: { jobLoss: 0 } });
    expect(history.slice(0, 4).map(m => m.paths.cash.ledger?.salary)).toEqual([0, 0, 0, 1800000]);
    expect(history[0].paths.cash.ledger?.netChange).toBe(-1250000);
  });
  it('奖金延期只在第7月到账一次，失业不取消奖金', () => {
    const { history } = simulate(setup(), { 4: { bonusDelay: 0, jobLoss: 0 }, 7: { bonusDelay: 0 } });
    expect(history[3].paths.cash.ledger?.bonus).toBe(0);
    expect(history[6].paths.cash.ledger?.bonus).toBe(2000000);
    expect(history.reduce((v, m) => v + m.paths.cash.ledger!.bonus, 0)).toBe(2000000);
    expect(history.filter(m => m.events.some(e => e.kind === 'bonusDelay'))).toHaveLength(1);
  });
  it('基金连续下跌按当前市值；没有基金不生成损失', () => {
    const { history } = simulate(setup(), { 1: { marketDrop: 0 }, 2: { marketDrop: 0 } });
    expect(history[0].paths.cash.ledger?.fundLoss).toBe(800000);
    expect(history[1].paths.cash.ledger?.fundLoss).toBe(640000);
    const noFund = simulate(setup(4), { 1: { marketDrop: 0 } });
    expect(noFund.history[0].paths.cash.ledger?.fundLoss).toBe(0);
  });
  it('先跌价，再精确卖基金补足，转换不重复扣净资产', () => {
    const s = setup(1); s.profile.fund = 10000000;
    const { history } = simulate(s, { 1: { medical: 0, marketDrop: 0 } });
    const result = history[0].paths.cash;
    expect(result.ledger?.fundLoss).toBe(2000000);
    expect(result.ledger?.fundSale).toBe(3750000);
    expect(result.state.cash).toBe(0); expect(result.state.fund).toBe(4250000);
    expect(result.ledger?.netChange).toBe(-6950000);
  });
  it('基金耗尽时回滚候选月份，另一条路径继续', () => {
    const s = setup(1); const initial = createInitialState(s);
    const { history, state } = simulate(s, { 1: { medical: 0 } });
    expect(history[0].paths.cash.state.status).toBe('failed');
    expect(history[0].paths.cash.state.failure?.shortfall).toBe(1750000);
    expect(history[0].paths.cash.state.netWorth).toBe(initial.paths.cash.netWorth);
    expect(history[0].paths.cash.ledger).toBeNull();
    expect(state.paths.loan.status).toBe('completed');
    expect(state.paths.cash.lastSettledMonth).toBe(0);
  });
  it('相同输入重放一致，资格不影响其他事件位置', () => {
    const tape = { 1: { medical: 0, jobLoss: 0, marketDrop: 0 }, 4: { bonusDelay: 0 } };
    expect(simulate(setup(), tape)).toEqual(simulate(setup(), tape));
    const result = simulate(setup(), tape).history[0];
    expect(result.events.map(e => e.kind)).toEqual(['medical', 'jobLoss', 'marketDrop']);
  });
  it('概率阈值严格小于，不使用保底', () => {
    const { history } = simulate(setup(), { 1: { medical: 10000, jobLoss: 20000, marketDrop: 50000 }, 4: { bonusDelay: 200000 } });
    expect(history.flatMap(m => m.events)).toHaveLength(0);
  });
});
