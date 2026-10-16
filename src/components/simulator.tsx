'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { WealthChart } from './chart';
import { AssetBreakdown } from './asset-breakdown';
import { EmploymentStatus } from './employment-status';
import { LoanResearchPanel, OfferSource } from './loan-research';
import { money } from '@/domain/money';
import { defaultInput } from '@/domain/fixtures';
import type { Explanation, LoanOffer, LoanPlan, Profile, PublicRun, PurchasePlan, SetupInput } from '@/domain/types';
import type { PreparedPlan } from '@/server/ai';

type Calculation = { input: SetupInput; purchase: PurchasePlan; loan: LoanPlan; errors: string[] };
type Screen = 'profiles' | 'plan' | 'game';
async function api<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, { method: data === undefined ? 'GET' : 'POST',
    headers: data === undefined ? undefined : { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || '请求失败，请重试。');
  return json as T;
}
function dateLabel(month: number) {
  if (month === 0) return '购车完成';
  const d = new Date(Date.UTC(2026, 9 + month, 1));
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月`;
}

export function Simulator() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [offers, setOffers] = useState<LoanOffer[]>([]);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [screen, setScreen] = useState<Screen>('profiles');
  const [input, setInput] = useState<SetupInput>({ ...defaultInput });
  const [goal, setGoal] = useState('我想买一辆20万元的车，比较全款和贷款。');
  const [prepared, setPrepared] = useState<PreparedPlan | null>(null);
  const [calculation, setCalculation] = useState<Calculation | null>(null);
  const [run, setRun] = useState<PublicRun | null>(null);
  const [replayId, setReplayId] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [explaining, setExplaining] = useState(false);
  const explainSequence = useRef(0);
  const advanceRequest = useRef<{ id: string; month: number; key: string } | null>(null);
  const activeOperation = useRef(false);

  const remember = useCallback((next: PublicRun) => {
    setRun(next); setScreen('game'); localStorage.setItem('life-run', next.id);
  }, []);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const data = await api<{ profiles: Profile[]; offers: LoanOffer[]; searchEnabled: boolean }>('profiles');
        if (!active) return;
        setProfiles(data.profiles); setOffers(data.offers); setSearchEnabled(data.searchEnabled);
        const saved = localStorage.getItem('life-run');
        if (saved) {
          try { const next = await api<PublicRun>(`runs/${saved}`); if (active) remember(next); }
          catch { localStorage.removeItem('life-run'); if (active) setError('上次游戏无法恢复，请重新选择角色。'); }
        }
      } catch (e) { if (active) setError((e as Error).message); }
    }
    void load(); return () => { active = false; };
  }, [remember]);

  useEffect(() => {
    if (screen !== 'plan') return;
    let active = true;
    const timer = setTimeout(async () => {
      try { const result = await api<Calculation>('plans/calculate', input); if (active) setCalculation(result); }
      catch (e) { if (active) { setCalculation(null); setError((e as Error).message); } }
    }, 180);
    return () => { active = false; clearTimeout(timer); };
  }, [input, screen]);

  useEffect(() => {
    if (!run || screen !== 'game' || run.month === 0) return;
    let active = true;
    const sequence = ++explainSequence.current;
    // Defer state changes to avoid interrupting the synchronous monthly reveal.
    const timer = setTimeout(async () => {
      setExplanation(null); setExplaining(true);
      try {
        const result = await api<Explanation>(`runs/${run.id}/explanation`, { month: run.month, final: run.status === 'ended' });
        if (active && sequence === explainSequence.current) setExplanation(result);
      } catch { if (active) setExplanation(null); }
      finally { if (active) setExplaining(false); }
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [run, screen]);

  async function perform(label: string, action: () => Promise<void>) {
    if (activeOperation.current) return;
    activeOperation.current = true; setBusy(label); setError('');
    try { await action(); } catch (e) { setError((e as Error).message); }
    finally { setBusy(''); activeOperation.current = false; }
  }
  function change(patch: Partial<SetupInput>) {
    setInput(current => ({ ...current, ...patch })); setCalculation(null); setConfirmed(false); setError('');
  }
  function selectProfile(profile: Profile) {
    setInput({ ...defaultInput, profileId: profile.id }); setReplayId(null); setPrepared(null);
    setCalculation(null); setConfirmed(false); setScreen('plan'); setError('');
  }
  async function prepare() {
    await perform(searchEnabled ? '正在搜索贷款资料并整理条件，最多约50秒…' : '正在读取预设资料、核对条件…', async () => {
      const result = await api<PreparedPlan>('plans/prepare', { profileId: input.profileId, goal });
      setPrepared(result);
      if (result.supported) change(result.input);
      else setError(result.notice);
    });
  }
  async function applyResearch(sourceId: string, rate: string, fee: number) {
    await perform('正在核对并计算网页参考方案…', async () => {
      const offer = await api<LoanOffer>('plans/from-search', { sourceId, annualRatePercent: rate, feeYuan: fee,
        downPaymentPercent: input.downPaymentPercent, termMonths: input.termMonths, acknowledged: true });
      setOffers(current => [...current, offer]); change({ offerId: offer.id });
      document.querySelector('.confirmation')?.scrollIntoView({ block: 'start' });
    });
  }
  async function start() {
    if (!confirmed || !calculation || calculation.errors.length) return;
    await perform('正在建立两条人生路径…', async () => {
      const data = { input, confirmed: true };
      const result = replayId
        ? await api<PublicRun>(`runs/${replayId}/replay`, { ...data, sameExperience: true })
        : await api<PublicRun>('runs', data);
      setExplanation(null); remember(result);
    });
  }
  async function advance() {
    if (!run || run.status === 'ended') return;
    await perform('正在揭晓本月…', async () => {
      if (!advanceRequest.current || advanceRequest.current.id !== run.id || advanceRequest.current.month !== run.month) {
        advanceRequest.current = { id: run.id, month: run.month, key: crypto.randomUUID() };
      }
      const result = await api<PublicRun>(`runs/${run.id}/advance`, { expectedMonth: run.month, requestKey: advanceRequest.current.key });
      advanceRequest.current = null; setExplanation(null); remember(result);
    });
  }
  function restart(same: boolean) {
    if (!run) return;
    setError(''); setExplanation(null); setPrepared(null); setConfirmed(false); setCalculation(null);
    if (same) { setReplayId(run.id); setInput(run.input); setScreen('plan'); }
    else { localStorage.removeItem('life-run'); setReplayId(null); setRun(null); setScreen('profiles'); }
  }
  const selectedProfile = profiles.find(p => p.id === input.profileId);
  const latest = run?.months.at(-1);
  const stage = screen === 'profiles' ? 0 : screen === 'plan' ? 1 : run?.status === 'ended' ? 3 : 2;

  return <div className="shell">
    <header className="topbar"><Link className="brand" href="/" aria-label="人生模拟器首页"><span className="brand-mark">川</span><span>人生模拟器<small>东流实验室</small></span></Link><span className="version">购车篇 <b>v0.1</b></span></header>
    <nav className="steps" aria-label="游戏进度">{['选择角色', '确定购车方案', '经历十二个月', '回看你的选择'].map((label, i) => <span key={label} className={stage === i ? 'step current' : 'step'} aria-current={stage === i ? 'step' : undefined}><i>{i + 1}</i>{label}</span>)}</nav>
    {error && <div className="error" role="alert">{error}{run && screen === 'game' && <button onClick={() => void perform('同步进度…', async () => remember(await api<PublicRun>(`runs/${run.id}`)))}>同步当前进度</button>}</div>}
    {busy && <div className="busy" role="status"><span className="spinner" />{busy}</div>}

    {screen === 'profiles' && <main>
      <section className="intro"><div><p className="chapter">同一段人生，两种选择</p><h1>买完车，<br />生活会怎样？</h1><p className="lead">让未来先走一遍。选一个角色，带着同样的收入和同样的意外，体验全款与贷款之后的十二个月。</p></div><div className="route-art" aria-hidden="true"><span className="art-start">现在的你</span><svg viewBox="0 0 400 235"><path d="M20 120 C120 120 110 40 225 40 L370 40" stroke="#267DFF" /><path d="M20 120 C120 120 110 195 225 195 L370 195" stroke="#F2881B" strokeDasharray="10 8" /><circle cx="20" cy="120" r="7" fill="#1355ED" /><circle cx="370" cy="40" r="7" fill="#267DFF" /><circle cx="370" cy="195" r="7" fill="#F2881B" /></svg><span className="art-cash">全款的未来</span><span className="art-loan">贷款的未来</span><span className="art-caption">相同事件，不同后果</span></div></section>
      <section aria-labelledby="profile-heading"><div className="section-heading"><h2 id="profile-heading">从谁的生活开始？</h2><span>五位虚构角色 · 不需要填写个人信息</span></div><div className="profile-grid">{profiles.map((p, i) => <article className="profile" key={p.id}>
        <div className={`avatar avatar-${i}`} aria-hidden="true">{p.name.slice(0, 1)}</div><h3>{p.name}</h3><p className="muted">{p.description}</p><div className="profile-worth"><small>初始资金</small><strong>{(p.cash + p.fund) / 1000000}<span> 万元</span></strong></div>
        <details><summary>展开财富底账</summary><dl>{[['现金', p.cash], ['基金', p.fund], ['月工资', p.salary], ['月生活费', p.living], ['既有负债', p.debt], ['第4月预计奖金', p.bonus]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>¥{money(Number(value))}</dd></div>)}</dl></details>
        <button className="choose" onClick={() => selectProfile(p)}>选择{p.name}</button>
      </article>)}</div>{profiles.length === 0 && !error && <p role="status">正在载入角色…</p>}</section>
      <aside className="game-note"><strong>这里的意外，是游戏设定。</strong><p>四类事件独立抽取，没有保底。一次经历不代表现实预测；你可以用同一段经历，重新检验另一种选择。</p></aside>
    </main>}

    {screen === 'plan' && <main className="plan-page"><div className="section-heading"><div><p className="chapter">{replayId ? '相同经历，重新选择' : `${selectedProfile?.name ?? ''}的购车计划`}</p><h1>先把选择说清楚。</h1></div><button className="text-button" disabled={!!busy} onClick={() => { setScreen('profiles'); setReplayId(null); }}>更换角色</button></div>
      <div className="plan-grid"><div><section className="goal-panel"><label htmlFor="goal">你想怎样买这辆车？</label><textarea id="goal" value={goal} onChange={e => setGoal(e.target.value)} maxLength={1000} /><button className="primary" disabled={!!busy} onClick={() => void prepare()}>读取资料，整理方案</button><p className="hint">{searchEnabled ? '使用豆包搜索 Custom 查阅网页资料，AI 整理后由你核对条件。' : '搜索未启用，当前读取本地示例资料。配置搜索 Key 后重启服务可启用联网查询。'}</p>
        {prepared && <div className="agent-receipt"><b>{prepared.source === 'model' ? 'AI 已整理方案' : prepared.research ? '搜索资料与手动模式' : '预设资料与手动模式'}</b><p>{prepared.notice}</p><ul>{prepared.trace.map((t, i) => <li key={`${t.tool}-${i}`}>{t.detail}</li>)}</ul>{!prepared.research && !prepared.matches.length && <p>没有直接匹配的条件，你仍可选择下方预设方案。</p>}</div>}
      </section>{prepared?.research && <LoanResearchPanel key={prepared.research.documents.map(d => d.id).join()} research={prepared.research} input={input} disabled={!!busy} onApply={applyResearch} />}<section className="offers"><h2>选择用于模拟的方案</h2>{offers.map(offer => <button key={offer.id} className={`offer ${input.offerId === offer.id ? 'selected' : ''}`} aria-pressed={input.offerId === offer.id} disabled={!!busy} onClick={() => change({ offerId: offer.id, downPaymentPercent: offer.defaultDownPaymentPercent, termMonths: offer.defaultTermMonths })}><span className="offer-title">{offer.name}<small>{offer.sourceType === 'web_reference' ? '网页参考 · 已确认假设' : '预设资料'}</small></span><strong>{Number(offer.annualRate) * 100}%<small> 年化名义利率</small></strong><span>{offer.defaultDownPaymentPercent}% 首付 / {offer.defaultTermMonths} 个月 / 等额本息</span><p>{offer.excerpt}</p></button>)}<p className="hint">示例 A/B 由团队构造；网页参考方案使用你确认的假设，均不代表本人可申请报价。</p></section></div>
      <section className="confirmation"><h2>确认两条路径的起点</h2><div className="fields"><label>购车价格（元）<input aria-label="购车价格（元）" type="number" min="50000" max="300000" step="1000" value={input.price / 100} onChange={e => change({ price: Math.round(Number(e.target.value) * 100) })} /></label><label>首付比例（%）<input type="number" min="20" max="80" value={input.downPaymentPercent} onChange={e => change({ downPaymentPercent: Number(e.target.value) })} /></label><label>贷款期限<select value={input.termMonths} onChange={e => change({ termMonths: Number(e.target.value) })}>{[12, 24, 36].map(n => <option key={n} value={n}>{n}个月</option>)}</select></label></div>
        {calculation ? <><div className="plan-compare"><div><span className="path-dot cash-dot" />全款路径<strong>¥{money(calculation.purchase.price)}</strong><small>开局一次支付</small></div><div><span className="path-dot loan-dot" />贷款路径<strong>¥{money(calculation.loan.downPayment)}</strong><small>首付，另付费用 ¥{money(calculation.loan.fee)}</small></div></div>
          <dl className="terms"><div><dt>贷款本金</dt><dd>¥{money(calculation.loan.principal)}</dd></div><div><dt>每月月供</dt><dd>¥{money(calculation.loan.payment)}</dd></div><div><dt>利率 / 计息方式</dt><dd>{Number(calculation.loan.annualRate) * 100}% / 等额本息</dd></div><div><dt>新增用车费</dt><dd>每月 ¥{money(calculation.purchase.runningCost)}</dd></div></dl>
          <OfferSource offer={calculation.loan} />{calculation.loan.customized && <p className="notice">自定义假设：首付或期限已修改。</p>}
          {calculation.errors.map(message => <p className="error" key={message}>{message}</p>)}
        </> : <p className="hint">正在核对参数…</p>}
        <details className="rules"><summary>本局事件规则与资金处理</summary><p>医疗每资格月1%，自付5万元，治疗3个月；失业每资格月2%，从触发月起连续停薪3个月；{replayId && run?.legacyEmploymentRule ? '本次沿用旧规则，恢复原工资；' : '之后以失业前80%的工资重新就业，再就业当月不重复失业；'}奖金原到账月20%概率延后3个月；市场每月5%概率下跌20%。全部是游戏参数，没有保底。</p><p>两条路径共用事件。现金不足会自动卖基金，仍不足则路径结束；车辆不出售。每月汇总结算，不检查具体账单日。</p><p>2026年11月至2027年10月。车房价值不计入剩余资金，用车费为原生活费之外的新增支出，不另外叠加税费与保险。</p></details>
        <label className="check"><input type="checkbox" disabled={!calculation || !!busy || calculation.errors.length > 0} checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />我已核对参数，理解这是使用已确认贷款假设和游戏概率的模拟。</label>
        <button className="primary start" disabled={!!busy || !confirmed || !calculation || calculation.errors.length > 0} onClick={() => void start()}>{replayId ? '用相同经历重新开始' : '开始我的十二个月'}</button>
      </section></div></main>}

    {screen === 'game' && run && <main className="game-page"><div className="game-heading"><div><p className="chapter">{run.profile.name}的两种未来</p><h1>{run.status === 'ended' ? '回看这一年的选择。' : dateLabel(run.month)}</h1><p className="muted">{run.month === 0 ? '车已买好，两条路径从这里出发。' : `已揭晓第 ${run.month} / 12 个月`}</p></div><div className="progress-wheel" style={{ '--progress': `${run.month / 12 * 100}%` } as React.CSSProperties}><span>{String(run.month).padStart(2, '0')}<small>/ 12个月</small></span></div></div>
      {run.legacyEmploymentRule && <p className="notice">本局保留旧规则：停薪3个月后恢复原工资。选择「重新开一局」使用降薪20%的新规则；相同经历重玩会沿用旧规则。</p>}
      <div className="game-grid"><section className="wealth-panel"><div className="wealth-pair">{(['cash', 'loan'] as const).map(key => { const p = run.paths[key]; return <div key={key} className={`wealth ${key}`}><h2><span className={`path-dot ${key}-dot`} />{key === 'cash' ? '全款路径' : '贷款路径'}</h2><small>{p.status === 'failed' ? `剩余资金 · 截至第${p.lastSettledMonth}月` : '剩余资金'}</small><strong data-testid={`${key}-funds`}>¥{money(p.remainingFunds)}</strong><p className={p.delta !== null && p.delta < 0 ? 'negative' : 'positive'}>{p.delta === null ? '本月未结算' : `${run.month === 0 ? '本月变化' : '较上月'} ${p.delta >= 0 ? '+' : '−'}¥${money(Math.abs(p.delta))}`}</p><AssetBreakdown path={p} pathKey={key} />{p.failure && <div className="failure">第{p.failure.month}月资金不足<br /><small>缺口 ¥{money(p.failure.shortfall)}，路径已结束；以上余额停留在最后成功结算月</small></div>}</div>; })}</div>
        <p className="balance-definition">剩余资金＝现金＋投资账户，不包含购买的车或房。负债单列，剩余资金未扣负债。</p><h3 className="chart-heading">剩余资金走势</h3><WealthChart run={run} /><div className="chart-caption"><span>同一段经历 · 相同外部事件</span><span>对照剩余负债与购车累计支付一起看</span></div>
        <div className="month-strip" aria-label="已揭晓月份">{Array.from({ length: 12 }, (_, i) => <span key={i} className={i + 1 <= run.month ? 'revealed' : ''}>{i + 1}</span>)}</div>
        {run.status !== 'ended' ? <button className="primary next" disabled={!!busy} onClick={() => void advance()}>揭晓下个月 <span>第 {run.month + 1} 个月</span></button> : <div className="replay-actions"><button className="primary" onClick={() => restart(true)}>相同经历再试一次</button><button className="secondary" onClick={() => restart(false)}>重新开一局</button></div>}
      </section><aside className="events-panel"><h2>{run.status === 'ended' ? '本局回望' : '这个月，发生了什么'}</h2>
        {!latest && <div className="quiet-month"><span className="event-icon">◷</span><h3>未来还没有揭晓</h3><p>点击下个月，看看生活如何继续。两条路径将经历同样的事件。</p></div>}
        {latest && <EmploymentStatus month={latest} />}
        {latest && latest.events.length === 0 && <div className="quiet-month"><span className="event-icon">☀</span><h3>本月没有新事件</h3><p>{latest.unemployed ? '没有新的随机事件，仍在求职停薪期；生活支出和还款继续结算。' : '平常的月份也是生活。收入、支出和还款仍在发生。'}</p></div>}
        {latest?.events.map(e => <article className={`event-card ${e.kind}`} key={e.kind}><span className="event-label">{e.kind === 'reemployment' ? '状态变化' : '随机事件'}</span><h3>{e.title}</h3><p>{e.description}</p></article>)}
        {latest?.treating && <div className="ongoing"><b>持续中的状态</b><p>治疗中 · 期间不重复抽医疗事件</p></div>}
        {run.month > 0 && <section className="explanation"><h3>{explaining ? '正在整理解释…' : explanation?.source === 'model' ? 'AI 复盘' : '规则说明'}</h3>{explanation?.paragraphs.map((p, i) => <div key={i}><p>{p.text}</p><small>依据：{p.factIds.map(id => explanation.facts.find(f => f.id === id)?.text).join(' ')}</small></div>)}{!explanation?.paragraphs.length && <p>{run.status === 'ended' ? '两条路径的差异来自利息、费用及面对同样事件时的资金余量。请结合下方已结算事实查看。' : '数值已完成结算。每一笔变化都可在下方月份记录中核对。'}</p>}{explanation?.notice && <small>{explanation.notice}</small>}</section>}
      </aside></div>
      {run.status === 'ended' && <section className="ending"><h2>这次经历说明了什么</h2><div className="ending-paths">{(['cash', 'loan'] as const).map(key => <div key={key}><h3>{key === 'cash' ? '全款' : '贷款'} · {run.paths[key].status === 'completed' ? '完成十二个月' : '提前结束'}</h3><p>相对购车后起点的剩余资金变化：¥{money(run.paths[key].remainingFunds - run.paths[key].initialFunds)}</p></div>)}</div>{run.summary.facts.map(f => <p key={f.id}>{f.text}</p>)}{run.summary.comparable && <p>相同结算月份，全款减贷款剩余资金差额：¥{money(run.summary.difference ?? 0)}</p>}</section>}
      <details className="history"><summary>查看已揭晓的月份记录</summary>{run.months.map(m => <section key={m.month}><h3>第{m.month}个月 · {dateLabel(m.month)}</h3><ul>{m.facts.map(f => <li key={f.id}>{f.text}</li>)}</ul></section>)}</details>
      <p className="footnote">{run.ruleDescription}</p>
    </main>}
    <footer><span>东流 · 人生模拟器</span><span>虚构角色 / 贷款方案模拟 / 游戏概率</span></footer>
  </div>;
}
