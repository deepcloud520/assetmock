import type { Draws, DualPathState, GameEvent, Ledger, MonthResult, PathResult, PathState, Setup } from './types';
import { money, multiply, repayment } from './money';

export const netWorth = (p: Pick<PathState, 'cash' | 'fund' | 'car' | 'debt' | 'loanBalance'>) => p.cash + p.fund + p.car - p.debt - p.loanBalance;
export function assertState(p: PathState): void {
  const amounts = [p.cash, p.fund, p.car, p.debt, p.loanBalance];
  if (amounts.some(v => !Number.isSafeInteger(v) || v < 0) || p.netWorth !== netWorth(p)) throw new Error('账目不变量校验失败');
}
export function createInitialState(setup: Setup): DualPathState {
  const { profile: p, purchase: car, loan } = setup;
  const base = { fund: p.fund, car: car.initialValue, debt: p.debt, status: 'running' as const, lastSettledMonth: 0 };
  const cash: PathState = { ...base, cash: p.cash - car.price, loanBalance: 0, netWorth: 0 };
  const financed: PathState = { ...base, cash: p.cash - loan.downPayment - loan.fee, loanBalance: loan.principal, netWorth: 0 };
  cash.netWorth = netWorth(cash); financed.netWorth = netWorth(financed);
  assertState(cash); assertState(financed);
  return { month: 0, life: { medicalUntil: 0, unemployedUntil: 0, bonusDueMonth: p.bonusMonth, bonusPaid: false,
    ...(setup.rules.reemploymentSalaryRatio !== undefined ? { currentSalary: p.salary } : {}) }, paths: { cash, loan: financed } };
}

function eventsForMonth(state: DualPathState, draws: Draws, setup: Setup) {
  const month = state.month + 1;
  const life = { ...state.life };
  const { rules: r, profile: p } = setup;
  const events: GameEvent[] = [];
  const reemployed = r.reemploymentSalaryRatio !== undefined && life.unemployedUntil > 0 && month === life.unemployedUntil;
  if (reemployed) {
    const previousSalary = life.currentSalary ?? p.salary;
    life.currentSalary = multiply(previousSalary, r.reemploymentSalaryRatio!);
    events.push({ kind: 'reemployment', title: '找到一份新工作',
      description: `经过${r.unemploymentDuration}个月停薪，本月重新就业。月工资由失业前的${money(previousSalary)}元调整为${money(life.currentSalary)}元，此后按新工资结算。本月不再触发失业；这是本局游戏设定。` });
  }
  if (month >= life.medicalUntil && draws.medical < r.probabilities.medical) {
    life.medicalUntil = month + r.medicalDuration;
    events.push({ kind: 'medical', title: '一笔意外的医疗支出', description: '本月产生大额自付费用，进入治疗状态。治疗期间不会重复抽取同类事件。' });
  }
  if (!reemployed && month >= life.unemployedUntil && draws.jobLoss < r.probabilities.jobLoss) {
    life.unemployedUntil = month + r.unemploymentDuration;
    events.push({ kind: 'jobLoss', title: '收入暂时中断', description: `从本月起连续${r.unemploymentDuration}个月工资为0，期间持续求职，日常支出和还款照常。按本局规则第${life.unemployedUntil}月重新就业；原定奖金单独结算，不代表恢复工资。` });
  }
  if (p.bonus > 0 && !life.bonusPaid && month === p.bonusMonth && draws.bonusDelay < r.probabilities.bonusDelay) {
    life.bonusDueMonth = p.bonusMonth + r.bonusDelayMonths;
    events.push({ kind: 'bonusDelay', title: '奖金要再等一等', description: '预计奖金延后到账，现有资产不会被额外扣除。' });
  }
  if (draws.marketDrop < r.probabilities.marketDrop && Object.values(state.paths).some(path => path.status === 'running' && path.fund > 0)) {
    events.push({ kind: 'marketDrop', title: '投资市场下跌', description: '持有基金的路径按当前市值承担跌价，没有基金的路径不受影响。' });
  }
  const bonus = !life.bonusPaid && month === life.bonusDueMonth ? p.bonus : 0;
  if (month === life.bonusDueMonth) life.bonusPaid = true;
  return { month, life, events, bonus };
}

function settlePath(previous: PathState, month: number, setup: Setup, income: { salary: number; bonus: number }, medical: boolean, marketDrop: boolean): PathResult {
  if (previous.status !== 'running') return { state: { ...previous }, ledger: null, settled: false };
  const p = { ...previous };
  const fundLoss = marketDrop ? multiply(p.fund, setup.rules.marketDropRate) : 0;
  p.fund -= fundLoss;
  const debtPrincipal = Math.min(p.debt, setup.profile.debtPayment);
  const loan = repayment(p.loanBalance, setup.loan.annualRate, setup.loan.payment, month === setup.loan.termMonths);
  const ledger: Ledger = { ...income, living: setup.profile.living, carExpense: setup.purchase.runningCost,
    medical: medical ? setup.rules.medicalCost : 0, debtPrincipal, loanPrincipal: loan.principal,
    interest: loan.interest, fundLoss, fundSale: 0, depreciation: Math.min(p.car, setup.purchase.depreciation), netChange: 0 };
  const candidateCash = p.cash + income.salary + income.bonus - ledger.living - ledger.carExpense - ledger.medical - debtPrincipal - loan.total;
  const needed = Math.max(0, -candidateCash);
  if (needed > p.fund) return {
    settled: false, ledger: null,
    state: { ...previous, status: 'failed', failure: { month, shortfall: needed - p.fund, reason: '现金与可变现基金不足以完成本月支付。' } },
  };
  ledger.fundSale = needed; p.fund -= needed; p.cash = candidateCash + needed;
  p.debt -= debtPrincipal; p.loanBalance -= loan.principal; p.car -= ledger.depreciation;
  p.netWorth = netWorth(p); p.lastSettledMonth = month;
  if (month === setup.rules.months) p.status = 'completed';
  ledger.netChange = p.netWorth - previous.netWorth;
  const expected = income.salary + income.bonus - ledger.living - ledger.carExpense - ledger.medical - ledger.interest - ledger.fundLoss - ledger.depreciation;
  if (ledger.netChange !== expected) throw new Error('净资产变动无法与账目核对');
  assertState(p);
  return { state: p, ledger, settled: true };
}

export function advanceMonth(state: DualPathState, monthlyDraws: Draws, setup: Setup): MonthResult {
  if (state.month >= setup.rules.months || Object.values(state.paths).every(p => p.status !== 'running')) throw new Error('本局已经结束');
  if (Object.values(monthlyDraws).length !== 4 || Object.values(monthlyDraws).some(v => !Number.isInteger(v) || v < 0 || v >= 1000000)) throw new Error('抽取记录无效');
  const { month, life, events, bonus } = eventsForMonth(state, monthlyDraws, setup);
  const income = { salary: month < life.unemployedUntil ? 0 : life.currentSalary ?? setup.profile.salary, bonus };
  const medical = events.some(e => e.kind === 'medical');
  const marketDrop = events.some(e => e.kind === 'marketDrop');
  return { month, life, events, paths: {
    cash: settlePath(state.paths.cash, month, setup, income, medical, marketDrop),
    loan: settlePath(state.paths.loan, month, setup, income, medical, marketDrop),
  } };
}

export function stateFromResult(result: MonthResult): DualPathState {
  return { month: result.month, life: result.life, paths: { cash: result.paths.cash.state, loan: result.paths.loan.state } };
}
