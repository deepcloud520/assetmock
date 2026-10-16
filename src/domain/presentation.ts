import { money } from './money';
import { pathKeys } from './types';
import type { Fact, MonthResult, PublicRun, StoredRun } from './types';

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
    facts.push({ id: `${key}.change`, text: `${title}路径本月净资产${ledger.netChange >= 0 ? '增加' : '减少'}${money(Math.abs(ledger.netChange))}元。` });
    facts.push({ id: `${key}.normal`, text: `${title}路径工资收入${money(ledger.salary)}元，生活和用车支出${money(ledger.living + ledger.carExpense)}元，折旧${money(ledger.depreciation)}元。` });
    if (ledger.interest) facts.push({ id: `${key}.interest`, text: `${title}路径本月车贷利息${money(ledger.interest)}元；归还本金不额外减少净资产。` });
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
    return { id: `summary.${key}`, text: `${name}路径${p.status === 'failed' ? `在第${p.failure!.month}月无法完成支付` : `完成至第${p.lastSettledMonth}月`}，最后成功结算净资产${money(p.netWorth)}元。` };
  });
  const interest = run.history.reduce((sum, m) => sum + (m.paths.loan.ledger?.interest ?? 0), 0);
  facts.push({ id: 'summary.interest', text: `贷款路径已成功结算的车贷利息共${money(interest)}元，一次性贷款费用${money(run.setup.loan.fee)}元。` });
  facts.push({ id: 'summary.boundary', text: '这是同一组游戏经历下的比较，不能用单局结果判断现实中哪种付款方式一定更好。' });
  if (!comparable) facts.push({ id: 'summary.differentMonths', text: '两条路径的最后成功月份不同，不计算跨月份的净资产差额。' });
  return { comparable, difference: comparable ? a.netWorth - b.netWorth : null, facts };
}

export function publicRun(run: StoredRun): PublicRun {
  const latest = run.history.at(-1);
  const viewPath = (key: 'cash' | 'loan') => {
    const p = run.state.paths[key];
    return { netWorth: p.netWorth, initialNetWorth: run.initial.paths[key].netWorth,
      delta: latest?.paths[key].ledger?.netChange ?? (run.state.month === 0 ? 0 : null),
      lastSettledMonth: p.lastSettledMonth, status: p.status, failure: p.failure };
  };
  return {
    id: run.id, month: run.state.month, status: run.status,
    profile: { id: run.setup.profile.id, name: run.setup.profile.name, description: run.setup.profile.description },
    input: { profileId: run.setup.profile.id, price: run.setup.purchase.price, offerId: run.setup.loan.id,
      downPaymentPercent: run.setup.loan.downPaymentPercent, termMonths: run.setup.loan.termMonths },
    plan: { purchase: run.setup.purchase, loan: run.setup.loan, confirmedAt: run.confirmedAt },
    paths: { cash: viewPath('cash'), loan: viewPath('loan') },
    timeline: [{ month: 0, cash: run.initial.paths.cash.netWorth, loan: run.initial.paths.loan.netWorth },
      ...run.history.map(m => ({ month: m.month,
        cash: m.paths.cash.settled ? m.paths.cash.state.netWorth : null,
        loan: m.paths.loan.settled ? m.paths.loan.state.netWorth : null }))],
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
