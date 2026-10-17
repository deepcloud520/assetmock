'use client';

import { useState, useSyncExternalStore } from 'react';
import { buildDemoSimulationOpening, buildRealSimulationOpening, type OpeningConfirmation, type OpeningInput, type ZeroConfirmation } from '@/domain/financial-life-simulation-opening';
import { advanceSimulationRun, createSimulationRun } from '@/domain/financial-life-simulation-engine';
import { buildEventCatalog, CATALOG_VERSION, resolveCatalogEvents } from '@/domain/financial-life-simulation-events';
import { isSimulationStale } from '@/domain/financial-life-simulation-currentness';
import { restoreSimulation, serializeSimulation } from '@/domain/financial-life-simulation-storage';
import type { EventEffect, SimulationRun, SimulationStrategy } from '@/domain/financial-life-simulation.types';
import './financial-life-view.css';

export type LifeOpeningData = Pick<OpeningInput, 'portfolio' | 'planning'>;
const subscribeHydration = () => () => {};
const money = (value: string) => { const amount = BigInt(value); const absolute = amount < 0n ? -amount : amount; return `${amount < 0n ? '-' : ''}¥${new Intl.NumberFormat('zh-CN').format(absolute / 100n)}.${String(absolute % 100n).padStart(2,'0')}`; };
const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const strategies = { GOAL_FIRST: ['目标优先', 0], BALANCED: ['平衡推进', 3], SAFETY_FIRST: ['安全优先', 6] } as const;
const fundingLabels = { LINKED_ASSETS_ONLY: '只采用绑定资产', DECLARED_ONLY: '只采用填报的已准备金额', CONFIRMED_DISJOINT: '两笔资金互不重叠，合并计算' };
function effectText(effect: EventEffect): string {
  switch (effect.kind) {
    case 'ONE_TIME_EXPENSE': return `本月额外应付 ${money(effect.amountMinor)}`;
    case 'MONTHLY_EXPENSE_DELTA': return `每月支出变化 ${money(effect.amountMinor)}，持续 ${effect.durationMonths} 个月`;
    case 'MONTHLY_INCOME_OVERRIDE': return `稳定收入变为每月 ${money(effect.amountMinor)}，持续 ${effect.durationMonths} 个月`;
    case 'GOAL_TARGET_DELTA': return `目标预算变化 ${money(effect.amountMinor)}`;
    case 'OTHER_ASSET_VALUE_DELTA': return `其他资产估值变化 ${money(effect.amountMinor)}`;
    case 'STATE_TAG': return '';
  }
}
function openingResult(mode: 'DEMO' | 'REAL', data: LifeOpeningData | undefined, today: Date, optional: string, funding: OpeningConfirmation['goalFundingKind'], zeros: ZeroConfirmation[]) {
  if (mode === 'DEMO') return buildDemoSimulationOpening(localDate(today), today.toISOString());
  if (!data) return null;
  const confirmation: OpeningConfirmation = { goalFundingKind: funding, confirmedZeroFields: zeros };
  if (/^\d+(\.\d{1,2})?$/.test(optional)) {
    const [whole, decimal = ''] = optional.split('.');
    confirmation.flexibleExpenseMinor = (BigInt(whole)*100n+BigInt(decimal.padEnd(2,'0'))).toString();
  }
  return buildRealSimulationOpening({ ...data, asOfDate: localDate(today), capturedAt: today.toISOString() }, confirmation);
}
export function FinancialLifeView({ data, storageKey, onNavigate }: { data?: LifeOpeningData; storageKey: string; onNavigate: () => void }) {
  const [run, setRun] = useState<SimulationRun | null>(() => {
    if (typeof window === 'undefined') return null;
    try { const saved = localStorage.getItem(storageKey); return saved ? restoreSimulation(saved, data?.portfolio.id) : null; } catch { return null; }
  });
  const [mode, setMode] = useState<'REAL' | 'DEMO'>('DEMO');
  const [strategy, setStrategy] = useState<SimulationStrategy | ''>('');
  const [optional, setOptional] = useState('');
  const [funding, setFunding] = useState<OpeningConfirmation['goalFundingKind']>();
  const [zeros, setZeros] = useState<ZeroConfirmation[]>([]);
  const [message, setMessage] = useState(() => {
    if (typeof window === 'undefined') return '';
    try { const saved = localStorage.getItem(storageKey); return saved && !restoreSimulation(saved, data?.portfolio.id) ? '本机存档版本或内容无效，请重新开局。' : ''; } catch { return '浏览器未允许读取存档，仍可在当前页面游玩。'; }
  });
  const loaded = useSyncExternalStore(subscribeHydration, () => true, () => false);
  function commit(next: SimulationRun) {
    setRun(next);
    try { localStorage.setItem(storageKey, serializeSimulation(next)); }
    catch { setMessage('本机存档没有保存成功，请保持页面打开继续游玩。'); }
  }
  const today = new Date();
  const result = openingResult(mode, data, today, optional, funding, zeros);
  const stale = run ? isSimulationStale(run, data) : false;
  const reserveFloor = run ? (BigInt(run.state.essentialExpenseMinor) + run.state.liabilities.reduce((sum, debt) => sum + (BigInt(debt.balanceMinor) < BigInt(debt.scheduledPaymentMinor) ? BigInt(debt.balanceMinor) : BigInt(debt.scheduledPaymentMinor)), 0n)) * BigInt(strategies[run.opening.strategy][1]) : 0n;
  function start() {
    if (result?.status !== 'READY') return;
    const id = crypto.randomUUID();
    const next = createSimulationRun({ ...result.opening, strategy: strategy || result.opening.strategy }, id, id, new Date().toISOString());
    next.catalogVersion = CATALOG_VERSION;
    setMessage(''); commit(next);
  }
  function restart() {
    setRun(null);
    try { localStorage.removeItem(storageKey); } catch { setMessage('无法清除本机存档，请检查浏览器设置。'); }
  }
  if (!loaded) return <p className="life-loading">正在读取本机人生进度…</p>;
  return <section className="life-sim" aria-label="财务人生模拟">
    <header className="life-heading"><h2>把时间往前拨</h2><p>以当前收入和目标为起点，看看生活变化后，钱够不够用。</p></header>
    {message && <p role="status" className="life-notice">{message}</p>}
    {!run ? <div className="life-setup">
      <div className="life-choices"><button aria-pressed={mode === 'DEMO'} onClick={() => setMode('DEMO')}>示例人生</button><button aria-pressed={mode === 'REAL'} onClick={() => setMode('REAL')}>我的财务画像</button></div>
      {mode === 'DEMO' && <p>固定示例：30 岁，月收入 15,000 元，五年后准备购房。示例数据与真实底账无关。</p>}
      {mode === 'REAL' && <>
        <label className="life-field">每月可选支出（元）<input inputMode="decimal" value={optional} onChange={event => setOptional(event.target.value)} placeholder="如娱乐、购物；没有请明确填写 0" /></label>
        {optional && !/^\d+(\.\d{1,2})?$/.test(optional) && <p role="alert">请输入非负金额，最多两位小数。</p>}
        <label className="life-field">目标资金口径<select value={funding ?? ''} onChange={event => setFunding((event.target.value || undefined) as OpeningConfirmation['goalFundingKind'])}><option value="">若两种来源均非零，请选择</option>{Object.entries(fundingLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {result?.status === 'NEEDS_CONFIRMATION' && result.requests.filter(request => ['MONTHLY_INCOME','ESSENTIAL_EXPENSE','DEBT_PAYMENT'].includes(request.field)).map(request => <label className="life-check" key={request.field}><input type="checkbox" checked={zeros.includes(request.field as ZeroConfirmation)} onChange={event => setZeros(values => event.target.checked ? [...values, request.field as ZeroConfirmation] : values.filter(value => value !== request.field))} />{request.message}</label>)}
      </>}
      {!result && <p>请先确认底账并选择一个目标方案。<button onClick={onNavigate}>前往方案比较</button></p>}
      {result?.status === 'INVALID' && <ul className="life-errors" role="alert">{result.issues.map(issue => <li key={`${issue.field}-${issue.code}`}>{issue.message}</li>)}</ul>}
      {result?.status === 'NEEDS_CONFIRMATION' && <ul className="life-pending">{result.requests.map(request => <li key={request.field}>{request.message}</li>)}</ul>}
      {result?.status === 'READY' && <div className="life-opening"><h3>确认这次开局</h3><dl><div><dt>推演时间</dt><dd>{result.opening.startMonth} 至 {result.opening.endMonth}</dd></div><div><dt>可动用现金</dt><dd>{money(result.opening.unrestrictedLiquidMinor)}</dd></div><div><dt>目标已准备</dt><dd>{money(result.opening.initialGoalFundedMinor)}</dd></div><div><dt>目标金额</dt><dd>{money(result.opening.goal.targetMinor)}</dd></div><div><dt>每月计划投入</dt><dd>{money(result.opening.goal.plannedContributionMinor)}</dd></div><div><dt>每月必要 / 可选支出</dt><dd>{money(result.opening.essentialExpenseMinor)} / {money(result.opening.flexibleExpenseMinor)}</dd></div></dl><p>绑定目标的资金不用于日常开销。开局后沿用已确认数据；简化还款按月供直接减少本金，不计算利息和投资收益。</p></div>}
      <label className="life-field">本局自动策略<select value={strategy} onChange={event => setStrategy(event.target.value as SimulationStrategy | '')}><option value="">沿用开局方案</option>{Object.entries(strategies).map(([value, [label, months]]) => <option key={value} value={value}>{label}：保留 {months} 个月必要支出与月供</option>)}</select></label>
      <p className="life-disclaimer">事件均为本局假设，不代表现实预测。此局只暂存当前浏览器，不修改真实账本。</p>
      <button className="life-primary" disabled={result?.status !== 'READY'} onClick={start}>确认开局</button>
    </div> : <div className="life-play">
      <aside className="life-summary"><span>{run.opening.source.kind === 'DEMO' ? '示例人生' : '我的财务画像'}</span><h3>{run.opening.goal.name}</h3><p>{run.opening.startMonth} 至 {run.opening.endMonth}</p><dl><div><dt>可动用现金</dt><dd>{money(run.state.availableCashMinor)}</dd></div><div><dt>目标资金</dt><dd>{money(run.state.goalFundedMinor)}</dd></div><div><dt>目标金额</dt><dd>{money(run.state.goalTargetMinor)}</dd></div></dl><p>{strategies[run.opening.strategy][0]}，目标投入前保留 {strategies[run.opening.strategy][1]} 个月必要支出与当月月供。下月留存下限 {money(reserveFloor.toString())}。</p><progress aria-label="目标资金准备进度" max={100} value={Math.min(100, Number(run.state.goalFundedMinor)/Math.max(1, Number(run.state.goalTargetMinor))*100)} /><p>事件为假设情景；目标资金独立保存。</p><button onClick={restart}>重新开局</button></aside>
      <div className="life-story">
        {stale && <p className="life-notice">底账或所选方案已变化。本局暂停，请重新开局使用最新画像。</p>}
        {run.turns.length === 0 && <div className="life-chapter"><h3>你的故事从 {run.opening.startMonth} 开始</h3><p>每次点击推进到年末。遇到生活变化时，时间会先停下来。</p></div>}
        {run.turns.map(turn => <article className="life-chapter" key={turn.turnIndex}><h3>{turn.fromMonth} {turn.fromMonth !== turn.toMonth && `至 ${turn.toMonth}`}</h3>
          {turn.occurrences.map(occurrence => <div className="life-event" key={occurrence.occurrenceId}><time>{occurrence.month}</time><h4>{buildEventCatalog(run.opening).find(event => event.id === occurrence.eventId)?.title ?? occurrence.eventId}</h4><p>{occurrence.origin === 'CONDITIONAL' ? '上一次变化带来了后续影响。' : '本局假设了这次生活变化。'}</p>{occurrence.resolvedEffects.map(effectText).filter(Boolean).map((text,index) => <p key={index}>{text}</p>)}</div>)}
          <p>这段时间向目标投入 {money(turn.months.reduce((sum, month) => sum+BigInt(month.actualContributionMinor),0n).toString())}，期末可动用现金 {money(turn.closingState.availableCashMinor)}。</p>
          {turn.months.some(month => month.riskFlags.includes('CONTRIBUTION_PAUSED')) && <p className="life-warning">部分月份为日常生活和现金储备减少了目标投入。</p>}
          {turn.months.some(month => month.riskFlags.includes('LOW_RESERVE')) && <p className="life-warning">部分月份的现金低于三个月必要支出与月供。</p>}
          <details><summary>查看逐月账本</summary><div className="life-table-scroll"><table><caption>金额单位：元；月供按实际支付扣减债务</caption><thead><tr>{['月份','收入','必要支出','可选支出','事件支出','还款','目标投入','期末现金','未支付缺口'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{turn.months.map(month => <tr key={month.month}><th>{month.month}</th>{[month.incomeMinor,month.essentialExpenseMinor,month.flexibleExpenseMinor,month.eventExpenseMinor,month.debtPaymentMinor,month.actualContributionMinor,month.closingCashMinor,month.unfundedGapMinor].map((value,index) => <td key={index}>{money(value)}</td>)}</tr>)}</tbody></table></div></details>
        </article>)}
        {run.ending ? <section className="life-ending" aria-live="polite"><h3>{run.ending.kind === 'CASH_GAP' ? '这条人生遇到了现金缺口' : run.ending.kind === 'GOAL_MET' ? '到期时，目标资金准备好了' : '到期时，目标还差一段距离'}</h3><p>{run.ending.month}，已准备 {money(run.ending.goalFundedMinor)}，目标缺口 {money(run.ending.goalGapMinor)}。</p>{run.ending.kind === 'CASH_GAP' && <p>本月必要支出仍有 {money(run.ending.unfundedGapMinor)} 无法支付，推演在此停止。</p>}<p>过程中最低可动用现金：{money(run.ending.lowestCashMinor)}。</p><button className="life-primary" onClick={restart}>开启新的人生</button></section>
        : <button className="life-primary life-advance" disabled={Boolean(stale)} onClick={() => commit(advanceSimulationRun(run, new Date().toISOString(), resolveCatalogEvents))}>继续到 {run.state.month.slice(0,4)} 年末</button>}
      </div>
    </div>}
  </section>;
}
