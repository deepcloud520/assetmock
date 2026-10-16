import { money } from './money';
import { pathKeys } from './types';
import type { Fact, Ledger, MonthResult, PathState, PublicRun, StoredRun } from './types';

export const remainingFunds = (state: Pick<PathState, 'cash' | 'fund'>) => state.cash + state.fund;
export const fundsChange = (ledger: Ledger) => ledger.salary + ledger.bonus - ledger.living - ledger.carExpense
  - ledger.medical - ledger.debtPrincipal - ledger.loanPrincipal - ledger.interest - ledger.fundLoss;
function purchasePaid(run: StoredRun, key: 'cash' | 'loan') {
  const upfront = key === 'cash' ? run.setup.purchase.price : run.setup.loan.downPayment + run.setup.loan.fee;
  return upfront + run.history.reduce((sum, month) => {
    const ledger = month.paths[key].ledger;
    return sum + (ledger ? ledger.loanPrincipal + ledger.interest : 0);
  }, 0);
}

export function monthFacts(result: MonthResult): Fact[] {
  const facts: Fact[] = [];
  const monthsRemaining = Math.max(0, result.life.unemployedUntil - result.month);
  if (monthsRemaining > 0) facts.push({ id: 'employment.unemployed', text: `本月仍在求职，工资为0；含本月还需停薪${monthsRemaining}个月，按本局规则第${result.life.unemployedUntil}月重新就业。奖金与工资分别结算，奖金到账不代表已经找到工作。` });
  for (const key of pathKeys) {
    const title = key === 'cash' ? '全款' : '贷款';
    const { state, ledger, settled } = result.paths[key];
    if (state.failure?.month === result.month) {
      facts.push({ id: `${key}.failure`, text: `${title}路径本月无法完成支付，现金和基金仍短缺${money(state.failure.shortfall)}元；曲线保留在第${state.lastSettledMonth}月。` });
    }
    if (!settled || !ledger) continue;
    const change = fundsChange(ledger);
    facts.push({ id: `${key}.change`, text: `${title}路径本月剩余资金${change >= 0 ? '增加' : '减少'}${money(Math.abs(change))}元。` });
    facts.push({ id: `${key}.normal`, text: `${title}路径工资收入${money(ledger.salary)}元，生活和用车支出${money(ledger.living + ledger.carExpense)}元。` });
    if (ledger.loanPrincipal || ledger.interest) facts.push({ id: `${key}.repayment`, text: `${title}路径本月偿还车贷本金${money(ledger.loanPrincipal)}元及利息${money(ledger.interest)}元，均减少剩余资金。` });
    if (ledger.debtPrincipal) facts.push({ id: `${key}.existingDebt`, text: `${title}路径本月偿还既有分期本金${money(ledger.debtPrincipal)}元，减少剩余资金。` });
    if (ledger.medical) facts.push({ id: `${key}.medical`, text: `${title}路径本月医疗自付${money(ledger.medical)}元。` });
    if (ledger.fundLoss) facts.push({ id: `${key}.fundLoss`, text: `${title}路径基金市值减少${money(ledger.fundLoss)}元。` });
    if (ledger.fundSale) facts.push({ id: `${key}.fundSale`, text: `${title}路径卖出基金${money(ledger.fundSale)}元补足支付，卖出本身不产生额外损失。` });
    if (ledger.bonus) facts.push({ id: `${key}.bonus`, text: `${title}路径奖金${money(ledger.bonus)}元本月到账。` });
  }
  for (const event of result.events) facts.push({ id: `event.${event.kind}`, text: event.description });
  return facts;
}

export function buildSummary(run: StoredRun): PublicRun['summary'] {
  const a = run.state.paths.cash; const b = run.state.paths.loan;
  const comparable = a.lastSettledMonth === b.lastSettledMonth;
  const facts: Fact[] = pathKeys.map(key => {
    const p = run.state.paths[key];
    const name = key === 'cash' ? '全款' : '贷款';
    return { id: `summary.${key}`, text: `${name}路径${p.status === 'failed' ? `在第${p.failure!.month}月无法完成支付` : `完成至第${p.lastSettledMonth}月`}，最后成功结算剩余资金${money(remainingFunds(p))}元，剩余负债${money(p.debt + p.loanBalance)}元；购车累计已支付${money(purchasePaid(run, key))}元（含已支付车贷本息，不含用车费）。` };
  });
  const interest = run.history.reduce((sum, m) => sum + (m.paths.loan.ledger?.interest ?? 0), 0);
  facts.push({ id: 'summary.interest', text: `贷款路径已成功结算的车贷利息共${money(interest)}元，一次性贷款费用${money(run.setup.loan.fee)}元。` });
  facts.push({ id: 'summary.boundary', text: '剩余资金仅含现金与投资账户，不含车房价值，也未扣除剩余负债；资金差额不是收益差额，需同时看负债和累计支付。' });
  if (!comparable) facts.push({ id: 'summary.differentMonths', text: '两条路径的最后成功月份不同，不计算跨月份的剩余资金差额。' });
  return { comparable, difference: comparable ? remainingFunds(a) - remainingFunds(b) : null, facts };
}

export function publicRun(run: StoredRun): PublicRun {
  const latest = run.history.at(-1);
  const viewPath = (key: 'cash' | 'loan') => {
    const p = run.state.paths[key];
    return { remainingFunds: remainingFunds(p), initialFunds: remainingFunds(run.initial.paths[key]), purchasePaid: purchasePaid(run, key),
      balances: { cash: p.cash, investments: p.fund, liabilities: p.debt + p.loanBalance },
      delta: latest?.paths[key].ledger ? fundsChange(latest.paths[key].ledger) : (run.state.month === 0 ? 0 : null),
      lastSettledMonth: p.lastSettledMonth, status: p.status, failure: p.failure };
  };
  return {
    displayVersion: 'funds-v1', id: run.id, month: run.state.month, totalMonths: run.setup.rules.months, status: run.status,
    profile: { id: run.setup.profile.id, name: run.setup.profile.name, description: run.setup.profile.description },
    input: { profileId: run.setup.profile.id, price: run.setup.purchase.price, offerId: run.setup.loan.id,
      downPaymentPercent: run.setup.loan.downPaymentPercent, termMonths: run.setup.loan.termMonths },
    plan: { purchase: run.setup.purchase, loan: run.setup.loan, confirmedAt: run.confirmedAt },
    paths: { cash: viewPath('cash'), loan: viewPath('loan') },
    timeline: [{ month: 0, cash: remainingFunds(run.initial.paths.cash), loan: remainingFunds(run.initial.paths.loan) },
      ...run.history.map(m => ({ month: m.month,
        cash: m.paths.cash.settled ? remainingFunds(m.paths.cash.state) : null,
        loan: m.paths.loan.settled ? remainingFunds(m.paths.loan.state) : null }))],
    months: run.history.map(m => {
      const ledger = m.paths.cash.ledger ?? m.paths.loan.ledger;
      return { month: m.month, events: m.events,
        treating: m.month < m.life.medicalUntil, unemployed: m.month < m.life.unemployedUntil, facts: monthFacts(m),
        employment: { salary: ledger?.salary ?? null, bonus: ledger?.bonus ?? null,
          monthsRemaining: Math.max(0, m.life.unemployedUntil - m.month), resumed: m.events.some(e => e.kind === 'reemployment') } };
    }),
    summary: buildSummary(run),
    legacyEmploymentRule: run.setup.rules.reemploymentSalaryRatio === undefined,
    ruleDescription: `游戏参数：医疗每资格月1%，失业每资格月2%，奖金原到账月20%，市场每月5%；均无保底。连续停薪${run.setup.rules.unemploymentDuration}个月后重新就业，${run.setup.rules.reemploymentSalaryRatio === undefined ? '沿用本局旧规则恢复原工资' : `新工资为失业前的${Number(run.setup.rules.reemploymentSalaryRatio) * 100}%，再就业当月不重复失业`}。按月汇总结算。`,
  };
}
