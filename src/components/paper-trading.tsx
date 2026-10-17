"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { yuanToMinor } from "@/domain/money-input";
import { ConditionsPanel, HealthPanel, MarketReviewForm, MetricsPanel, OrderDetailButton, ReplayLab, StrategyLab, TradingStatusPanel } from "./paper-trading-panels";
import "./paper-trading.css";

type Account = { id: string; status: string; purpose: string; mode: string; name: string; initialMinor: string; cashMinor: string; frozenMinor: string; realizedMinor: string; feesMinor: string; version: number; health: string; createdAt: string };
type Instrument = { id: string; name: string; board: string };
type Quote = { instrumentId: string; priceMinor: string; previousMinor: string; bidMinor: string; askMinor: string; bidQuantity: number; askQuantity: number; sourceAt: string; fetchedAt: string; provider: string };
type Order = { id: string; instrumentId: string; instrument: Instrument; side: string; limitMinor: string; quantity: number; filled: number; feesMinor: string; status: string; reason: string; createdAt: string; events: { id: string; type: string; detail: string }[] };
type Snapshot = { id: string; equityMinor: string | null; quality: string; createdAt: string };
type Overview = {
  accounts: Account[]; account: Account | null; worker: { status: string; expiresAt: string; error: string } | null;
  rules?: { qualified: boolean; evidence: string }; equityMinor?: string | null; marketMinor?: string | null; floatingMinor?: string | null; pnlMinor?: string | null; quality?: string;
  positions?: { id: string; instrumentId: string; instrument: Instrument; quantity: number; frozen: number; sellable: number; costMinor: string; marketMinor: string | null; floatingMinor: string | null; sourceAt: string | null; quality: string }[];
  orders?: Order[]; fills?: { id: string; orderId: string; quantity: number; priceMinor: string; feeMinor: string; realizedMinor: string; createdAt: string }[];
  entries?: { id: string; type: string; amountMinor: string; balanceMinor: string; reference: string; createdAt: string }[];
  notes?: { id: string; content: string; createdAt: string }[]; snapshots?: Snapshot[]; watchlist?: { instrument: Instrument }[];
  replaySession?: { clock: string; status: string } | null;
};
type Preview = { previewId: string; expiresAt: string; instrumentId: string; side: string; quantity: number; limitMinor: string; turnoverMinor: string; feeMinor: string; frozenMinor: string; blockers: string[]; evidence: string;
  feeBreakdown?: { commissionMinor: string; transferMinor: string; stampMinor: string };
  feePolicy?: { commissionPpm: number; minimumCommissionMinor: number; transferPpm: number; stampSellPpm: number; commissionBasis: string } };
const money = (v: string | null | undefined) => v == null ? "待核实" : new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(Number(v) / 100);
const time = (v?: string | null) => v ? new Date(v).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) : "—";
function FeeDetails({ preview }: { preview: Preview }) {
  const detail = preview.feeBreakdown, policy = preview.feePolicy;
  if (!detail || !policy) return null;
  return <div className="manager-note">
    <p>费用构成：佣金 {money(detail.commissionMinor)} · 过户费 {money(detail.transferMinor)} · 卖出印花税 {money(detail.stampMinor)}</p>
    <p>模拟佣金 {(policy.commissionPpm / 10000).toFixed(3)}%，每单最低 {money(String(policy.minimumCommissionMinor))}；过户费双向 {(policy.transferPpm / 10000).toFixed(3)}%，印花税仅卖出 {(policy.stampSellPpm / 10000).toFixed(3)}%。{policy.commissionBasis}。部分成交按同一订单累计金额计算费用。</p>
  </div>;
}
const boardName: Record<string, string> = { MAIN: "沪深主板", CHINEXT: "创业板", STAR: "科创板" };
const stateName: Record<string, string> = { OPEN: "等待成交", PARTIALLY_FILLED: "部分成交", FILLED: "全部成交", CANCELLED: "已撤销剩余", EXPIRED: "当日到期", INITIAL: "模拟初始资金", BUY: "买入", SELL: "卖出", FEE: "费用", DIVIDEND: "分红调整" };
async function request<T>(workspaceId: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api/paper-trading/${path}`, { method: body === undefined ? "GET" : "POST", cache: "no-store", headers: { "X-Workspace-Id": workspaceId, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await r.json(); if (!r.ok) throw new Error(data.error ?? "操作失败，请重试"); return data;
}
export function PaperTrading({ workspaceId, review = false }: { workspaceId: string; review?: boolean }) {
  const [now, setNow] = useState(0);
  const [data, setData] = useState<Overview | null>(null), [accountId, setAccountId] = useState("");
  const [accountType, setAccountType] = useState<"MANUAL" | "AI" | "REPLAY">("MANUAL");
  const [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const [instruments, setInstruments] = useState<Instrument[]>([]), [selected, setSelected] = useState<Instrument | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null), [quoteError, setQuoteError] = useState("");
  const [bars, setBars] = useState<{ day: string; closeMinor: string }[]>([]), [barsError, setBarsError] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const key = useRef(""), pendingOperations = useRef(0);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const load = useCallback(async () => { setData(await request<Overview>(workspaceId, `overview${accountId ? `?accountId=${encodeURIComponent(accountId)}` : ""}`)); }, [workspaceId, accountId]);
  useEffect(() => {
    let active = true;
    const refresh = () => request<Overview>(workspaceId, `overview${accountId ? `?accountId=${encodeURIComponent(accountId)}` : ""}`).then(d => { if (active) setData(d); }).catch(e => { if (active) setError(e.message); });
    void refresh(); const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [workspaceId, accountId]);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    const refresh = () => request<{ quotes: Quote[]; error: string | null }>(workspaceId, `quotes?symbols=${selected.id}${accountId ? `&accountId=${accountId}` : ""}`).then(r => { if (active) { setQuote(r.quotes[0] ?? null); setQuoteError(r.error ?? ""); } }).catch(e => { if (active) setQuoteError(e.message); });
    void refresh(); const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 5000);
    void request<{ bars: { day: string; closeMinor: string }[] }>(workspaceId, `bars?symbol=${selected.id}${accountId ? `&accountId=${accountId}` : ""}`).then(r => { if (active) setBars(r.bars); }).catch(e => { if (active) setBarsError(e.message); });
    return () => { active = false; clearInterval(timer); };
  }, [workspaceId, selected, accountId]);
  async function run(fn: () => Promise<void>) { pendingOperations.current += 1; setBusy(true); setError(""); setMessage(""); try { await fn(); await load(); } catch (e) { setError(e instanceof Error ? e.message : "操作失败"); } finally { pendingOperations.current -= 1; setBusy(pendingOperations.current > 0); } }
  function select(i: Instrument) { setSelected(i); setPreview(null); setQuote(null); setBars([]); setBarsError(""); }
  async function search(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const f = new FormData(e.currentTarget); await run(async () => { const rows = await request<Instrument[]>(workspaceId, `instruments?q=${encodeURIComponent(String(f.get("search") ?? ""))}`); setInstruments(rows); if (!rows.length) setMessage("没有匹配到受支持的 A 股证券"); }); }
  async function makePreview(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget); if (!selected || !data?.account) return;
    await run(async () => { const p = await request<Preview>(workspaceId, "orders/preview", { accountId: data.account!.id, input: { instrumentId: selected.id, side: f.get("side"), limitMinor: yuanToMinor(String(f.get("price"))), quantity: Number(f.get("quantity")), reason: f.get("reason") } }); setPreview(p); key.current = crypto.randomUUID(); });
  }
  const matchesType = (r: Account) => accountType === "REPLAY" ? r.mode === "REPLAY" && r.purpose === "MANUAL" : (accountType === "AI" || r.mode === "LIVE") && r.purpose === accountType;
  const a = data?.account && matchesType(data.account) ? data.account : null;
  const visibleAccounts = data?.accounts.filter(matchesType) ?? [];
  const effectiveNow = a?.mode === "REPLAY" && data?.replaySession ? new Date(data.replaySession.clock).getTime() : now;
  const workerAlive = now > 0 && data?.worker?.status === "RUNNING" && new Date(data.worker.expiresAt).getTime() > now;
  const quotesCurrent = quote && effectiveNow > 0 && (a?.mode === "REPLAY" || effectiveNow - new Date(quote.sourceAt).getTime() <= 15000) && effectiveNow >= new Date(quote.sourceAt).getTime();
  return <div className="paper-trading">
    <header className="paper-intro"><span className="paper-label">模拟账户 · 虚拟资金</span><p>练习交易、理解费用，保留每次决策的记录。模拟资金与真实财富资料独立。</p></header>
    {error && <p role="alert" className="manager-alert">{error}</p>}{message && <p role="status">{message}</p>}
    <PendingErasure workspaceId={workspaceId} busy={busy} run={run} />
    {a?.mode === 'REPLAY' && <p className="integration-notice">独立回放时钟。标记“演示数据”的账户使用合成行情，不是真实历史收益。先提交委托，再推进下一根 K 线撮合。</p>}
    {accountType === 'AI' && a?.mode === 'REPLAY' && <button disabled={busy} onClick={() => void run(async () => {const rows = await request<{id:string;accountId:string}[]>(workspaceId,'experiments'); const e=rows.find(e=>e.accountId===a.id);if(e){const result=await request<{status:string;reason?:string}>(workspaceId,'experiments/step',{experimentId:e.id});setMessage(`${result.status}：${result.reason??'本轮结束；推进回放后可分析下一时点'}`);}})}>执行当前回放时点的 AI 分析</button>}
    <nav className="paper-tabs" aria-label="模拟账户用途">{(["MANUAL", "AI", "REPLAY"] as const).map(type => <button key={type} aria-pressed={accountType === type} disabled={busy} onClick={() => { setAccountType(type); const match = data?.accounts.find(r => r.status === "ACTIVE" && (type === "REPLAY" ? r.mode === "REPLAY" && r.purpose === "MANUAL" : (type === "AI" || r.mode === "LIVE") && r.purpose === type)); setAccountId(match?.id ?? ""); setPreview(null); setSelected(null); }}>{({ MANUAL: "手动账户", AI: "AI 策略实验", REPLAY: "历史回放" })[type]}</button>)}</nav>
    <div className="paper-toolbar"><label>查看账户 <select value={a?.id ?? ""} onChange={e => { setAccountId(e.target.value); setPreview(null); setSelected(null); }}><option value="">选择本用途账户</option>{visibleAccounts.map(r => <option key={r.id} value={r.id}>{r.name} · {r.status === "ACTIVE" ? "当前" : "已归档"} · {time(r.createdAt)}</option>)}</select></label><button disabled={busy} className="button-secondary" onClick={() => void run(load)}>刷新</button><span>{accountType === "REPLAY" ? "独立历史时钟" : !data ? "正在读取服务状态" : workerAlive ? "撮合服务运行中" : "撮合服务未运行"}</span></div>
    {accountType === "AI" && <StrategyLab key={`strategy:${a?.id ?? "new"}`} workspaceId={workspaceId} run={run} busy={busy} accountId={a?.id} onSelect={setAccountId} />}
    {(accountType === "REPLAY" || (accountType === "AI" && a?.mode === "REPLAY")) && <ReplayLab purpose={accountType === "AI" ? "AI" : "MANUAL"} key={`replay:${a?.id ?? "new"}`} workspaceId={workspaceId} run={run} busy={busy} accountId={a?.id} onSelect={setAccountId} />}
    {!data ? <p>读取模拟账户…</p> : !a ? accountType === "MANUAL" ? <section className="manager-section"><h2>开始第一份模拟账户</h2><p>初始资金 100,000 元。限价委托，真实交易时段，买入后按交易日解锁可卖数量。</p><button className="button-primary" disabled={busy} onClick={() => void run(async () => { const created = await request<Account>(workspaceId, "accounts", {}); setAccountId(created.id); })}>创建 10 万元模拟账户</button></section> : null : <>
      <TradingStatusPanel workspaceId={workspaceId} accountId={a.id} instrumentId={selected?.id} />
      <div className="paper-metrics">{[["现金余额", a.cashMinor], ["可用资金", (BigInt(a.cashMinor) - BigInt(a.frozenMinor)).toString()], ["冻结资金", a.frozenMinor], ["持仓市值", data.marketMinor], ["总资产估值", data.equityMinor], ["累计盈亏", data.pnlMinor]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{money(value)}</strong></div>)}</div>
      <p className="manager-note">估值状态：{data.quality === "CURRENT" ? "当前资料可核对" : "行情或事件资料不完整，金额仅供参考，暂不计算确定收益"}。累计费用 {money(a.feesMinor)}；已实现交易盈亏 {money(a.realizedMinor)}。</p>
      {a.health !== "OK" && <p className="manager-alert">账务待核对，暂停新交易。启动撮合服务后将重新对账。</p>}
      {a.mode === "LIVE" && !data.rules?.qualified && <p className="paper-notice">交易尚未开放：行情、费用与交易规则待盘中验证。可以查看行情和试算委托。</p>}
      {data.worker?.error && <p className="manager-alert">行情服务：{data.worker.error}</p>}
      {review || accountType === "AI" ? <Review key={`review:${a.id}`} data={data} workspaceId={workspaceId} busy={busy} run={run} /> : <>
        <div className="paper-grid"><section className="manager-section"><h2>行情与自选</h2><form onSubmit={search} className="paper-toolbar"><input name="search" aria-label="股票名称或代码" placeholder="名称、拼音或代码，如 平安银行" maxLength={50} required /><button className="button-secondary" disabled={busy}>搜索</button></form>
          <div className="paper-symbols">{instruments.map(i => <button key={i.id} aria-pressed={selected?.id === i.id} onClick={() => select(i)}>{i.name} <small>{i.id} · {boardName[i.board]}</small></button>)}</div>
          <h3>自选股票</h3><div className="paper-symbols">{data.watchlist?.map(w => <button key={w.instrument.id} onClick={() => select(w.instrument)}>{w.instrument.name}<small>{w.instrument.id}</small></button>)}</div>{!data.watchlist?.length && <p className="manager-note">搜索股票后加入自选。</p>}
          {selected && <><div className="paper-toolbar"><h3>{selected.name} · {selected.id}</h3><button disabled={busy || a.status !== "ACTIVE"} onClick={() => void run(async () => { await request(workspaceId, "watchlist", { accountId: a.id, instrumentId: selected.id, remove: data.watchlist?.some(w => w.instrument.id === selected.id) ?? false }); })}>{data.watchlist?.some(w => w.instrument.id === selected.id) ? "移出自选" : "加入自选"}</button></div>
            {quoteError && <p className="manager-alert">{quoteError}</p>}
            {quote && <><strong className="paper-price">{money(quote.priceMinor)}</strong><p>{quotesCurrent ? "近期报价" : "历史／过期报价，仅供查看"} · {quote.provider}</p><p className="manager-note">行情时间 {time(quote.sourceAt)}<br />首次获取 {time(quote.fetchedAt)}</p><div className="paper-toolbar"><span>买一 {money(quote.bidMinor)} × {quote.bidQuantity} 股</span><span>卖一 {money(quote.askMinor)} × {quote.askQuantity} 股</span></div></>}
            <h3>近期日线价格 · 不复权</h3>{barsError && <p className="manager-note">{barsError}</p>}<PriceChart bars={bars} />
          </>}
        </section><section className="manager-section"><h2>限价委托</h2><p className="manager-note">买入参考卖一、卖出参考买一。预览不冻结资金，也不承诺成交。</p>
          {!selected ? <p>先搜索并选择股票。</p> : <form key={selected.id} onSubmit={makePreview} onChange={() => setPreview(null)}><fieldset disabled={busy || a.status !== "ACTIVE"} className="paper-form"><label>方向<select name="side"><option value="BUY">买入</option><option value="SELL">卖出</option></select></label><label>限价（元）<input name="price" type="number" min="0.01" step="0.01" required /></label><label>数量（股）<input name="quantity" type="number" min="1" step="1" defaultValue={selected.board === "STAR" ? 200 : 100} required /></label><label>交易理由（选填）<textarea name="reason" maxLength={1000} placeholder="记录此刻的判断，便于以后复盘" /></label><button className="button-primary">预览金额与费用</button></fieldset></form>}
          {preview && <div className="paper-confirm"><h3>确认委托内容</h3><p>{preview.instrumentId} · {stateName[preview.side]} {preview.quantity} 股 · 限价 {money(preview.limitMinor)}</p><p>预估金额 {money(preview.turnoverMinor)}<br />预估费用 {money(preview.feeMinor)}<br />冻结资金 {money(preview.frozenMinor)}</p><p className="manager-note">当日有效，未成交部分到期释放冻结；委托成功仍需等待成交。</p><p className="manager-note">{preview.evidence}</p><FeeDetails preview={preview} />{preview.blockers.length > 0 && <ul>{preview.blockers.map(b => <li key={b}>{b}</li>)}</ul>}<p className="manager-note">预览有效至 {time(preview.expiresAt)}</p><button className="button-primary" disabled={busy || preview.blockers.length > 0 || effectiveNow >= new Date(preview.expiresAt).getTime()} onClick={() => void run(async () => { const result = await request<{ orderId: string }>(workspaceId, "orders", { accountId: a.id, previewId: preview.previewId, key: key.current }); setPreview(null); setMessage(`已委托，尚未成交：${result.orderId}。已成交与剩余数量请查看委托记录。`); })}>确认提交模拟委托</button></div>}
        </section></div>
        <Positions data={data} /><Orders data={data} workspaceId={workspaceId} busy={busy} cancel={orderId => run(async () => { await request(workspaceId, "orders/cancel", { orderId }); })} />
      </>}
      {a.purpose === "MANUAL" && <ConditionsPanel key={`conditions:${a.id}`} workspaceId={workspaceId} account={a} run={run} busy={busy} />}
      <HealthPanel key={`health:${a.id}`} workspaceId={workspaceId} account={a} run={run} busy={busy} />
      <details className="manager-section"><summary>账户与资料维护</summary><p>归档保留已有持仓和历史，不虚构卖出。AI 实验在策略区停止或归档；重新开始建立独立账户。</p>{a.purpose === "MANUAL" && <button disabled={busy || a.status !== "ACTIVE"} onClick={() => { if (window.confirm("归档本账户并撤销剩余委托？历史记录和未卖持仓将保留。")) void run(async () => { await request(workspaceId, "accounts/archive", { accountId: a.id, expectedVersion: a.version }); setPreview(null); }); }}>归档本账户</button>}{accountType === "MANUAL" && !data.accounts.some(x => x.status === "ACTIVE" && x.purpose === "MANUAL" && x.mode === "LIVE") && <button disabled={busy} onClick={() => void run(async () => { const created = await request<Account>(workspaceId, "accounts", {}); setAccountId(created.id); })}>创建新的模拟账户</button>}
        <Maintenance key={`maintenance:${a.id}`} workspaceId={workspaceId} account={a} run={run} busy={busy} onErased={() => { setData(null); setAccountId(""); setPreview(null); window.location.reload(); }} />
      </details>
    </>}
  </div>;
}
function Positions({ data }: { data: Overview }) {
  return <section className="manager-section"><h2>模拟持仓</h2><div className="paper-table"><table><thead><tr>{["证券", "持有／可卖／冻结", "总成本", "市值参考", "浮动盈亏", "报价时间"].map(s => <th key={s}>{s}</th>)}</tr></thead><tbody>{data.positions?.map(p => <tr key={p.id}><td>{p.instrument.name}<small>{p.instrumentId}</small></td><td>{p.quantity}／{p.sellable}／{p.frozen}</td><td>{money(p.costMinor)}</td><td>{money(p.marketMinor)}</td><td>{money(p.floatingMinor)}</td><td>{time(p.sourceAt)}{p.quality !== "CURRENT" && <small>待核实</small>}</td></tr>)}</tbody></table></div>{!data.positions?.length && <p className="manager-note">暂无模拟持仓。</p>}</section>;
}
function Orders({ data, workspaceId, busy, cancel }: { data: Overview; workspaceId: string; busy: boolean; cancel: (id: string) => Promise<void> }) {
  return <section className="manager-section"><h2>委托记录</h2><div className="paper-table"><table><thead><tr>{["证券／方向", "限价", "已成交／委托", "状态", "时间", "操作"].map(s => <th key={s}>{s}</th>)}</tr></thead><tbody>{data.orders?.map(o => <tr key={o.id}><td>{o.instrument.name} · {stateName[o.side]}<details><summary>理由与处理记录</summary><p>{o.reason || "未填写理由"}</p>{o.events.map(e => <p key={e.id}>{e.detail}</p>)}</details></td><td>{money(o.limitMinor)}</td><td>{o.filled}／{o.quantity}</td><td>{stateName[o.status] ?? o.status}</td><td>{time(o.createdAt)}</td><td><OrderDetailButton workspaceId={workspaceId} orderId={o.id} />{data.account?.purpose === "MANUAL" && ["OPEN", "PARTIALLY_FILLED"].includes(o.status) && <button disabled={busy} onClick={() => void cancel(o.id)}>撤销剩余</button>}</td></tr>)}</tbody></table></div>{!data.orders?.length && <p className="manager-note">暂无委托。成交与撤销都会保留记录。</p>}</section>;
}
function PriceChart({ bars }: { bars: { day: string; closeMinor: string }[] }) {
  if (!bars.length) return <p className="manager-note">暂无可核对的不复权日线。</p>;
  const values = bars.map(b => Number(b.closeMinor)), min = Math.min(...values), span = Math.max(1, Math.max(...values) - min);
  const points = values.map((v, i) => `${20 + i * 560 / Math.max(1, values.length - 1)},${130 - (v - min) * 110 / span}`).join(" ");
  return <figure className="paper-chart"><svg viewBox="0 0 600 150" role="img" aria-label="近期不复权收盘价格走势"><polyline points={points} fill="none" stroke="#267DFF" strokeWidth="2" /></svg><figcaption>{bars[0].day} — {bars.at(-1)?.day} · 当日 K 线在收盘前尚未完成；实时账户不能用历史价格成交</figcaption></figure>;
}
function Review({ data, workspaceId, busy, run }: { data: Overview; workspaceId: string; busy: boolean; run: (fn: () => Promise<void>) => Promise<void> }) {
  const [start, setStart] = useState(""), [end, setEnd] = useState("");
  const inRange = (s: string) => { const day = new Date(new Date(s).getTime() + 8 * 3600000).toISOString().slice(0, 10); return (!start || day >= start) && (!end || day <= end); };
  const snapshots = (data.snapshots ?? []).filter(s => inRange(s.createdAt));
  const noteKey = useRef("");
  async function save(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const form = e.currentTarget; noteKey.current ||= crypto.randomUUID(); await run(async () => { await request(workspaceId, "reviews", { accountId: data.account!.id, content: new FormData(form).get("note"), key: noteKey.current }); noteKey.current = ""; form.reset(); }); }
  async function download() { const r = await fetch(`/api/paper-trading/export?accountId=${data.account!.id}`, { headers: { "X-Workspace-Id": workspaceId } }); if (!r.ok) throw new Error("导出失败"); const url = URL.createObjectURL(await r.blob()); const a = document.createElement("a"); a.href = url; a.download = "模拟交易记录.csv"; a.click(); URL.revokeObjectURL(url); }
  return <><MetricsPanel workspaceId={workspaceId} accountId={data.account!.id} accountVersion={data.account!.version} run={run} busy={busy} /><section className="manager-section"><h2>交易复盘</h2><div className="paper-toolbar"><label>开始日期<input type="date" value={start} onChange={e => setStart(e.target.value)} /></label><label>结束日期<input type="date" value={end} onChange={e => setEnd(e.target.value)} /></label><button disabled={busy} onClick={() => void run(download)}>导出本账户全部记录</button></div><p>已实现交易盈亏 {money(data.account?.realizedMinor)}；浮动盈亏参考 {money(data.floatingMinor)}。分红另列为资金调整，初始资金不计收益。</p><h3>真实估值记录</h3><EquityChart snapshots={snapshots} /><div className="paper-table"><table><thead><tr><th>记录时间</th><th>总资产参考</th><th>资料状态</th></tr></thead><tbody>{snapshots.map(s => <tr key={s.id}><td>{time(s.createdAt)}</td><td>{money(s.equityMinor)}</td><td>{s.quality === "CURRENT" ? "可核对" : "不完整"}</td></tr>)}</tbody></table></div></section>
    <Positions data={data} /><Orders data={{ ...data, orders: data.orders?.filter(o => inRange(o.createdAt)) }} workspaceId={workspaceId} busy={busy} cancel={orderId => run(async () => { await request(workspaceId, "orders/cancel", { orderId }); })} />
    <section className="manager-section"><h2>成交明细</h2><div className="paper-table"><table><thead><tr><th>时间</th><th>关联委托</th><th>数量</th><th>成交价</th><th>费用</th><th>已实现盈亏</th></tr></thead><tbody>{data.fills?.filter(f => inRange(f.createdAt)).map(f => <tr key={f.id}><td>{time(f.createdAt)}</td><td>{f.orderId}</td><td>{f.quantity}</td><td>{money(f.priceMinor)}</td><td>{money(f.feeMinor)}</td><td>{money(f.realizedMinor)}</td></tr>)}</tbody></table></div></section>
    <section className="manager-section"><h2>资金流水</h2><div className="paper-table"><table><thead><tr><th>时间</th><th>类型</th><th>金额</th><th>变化后余额</th><th>关联记录</th></tr></thead><tbody>{data.entries?.filter(e => inRange(e.createdAt)).map(e => <tr key={e.id}><td>{time(e.createdAt)}</td><td>{stateName[e.type] ?? e.type}</td><td>{money(e.amountMinor)}</td><td>{money(e.balanceMinor)}</td><td>{e.reference}</td></tr>)}</tbody></table></div></section>
    <section className="manager-section"><h2>复盘笔记</h2><form onSubmit={save}><label>记录事后判断（不会改写下单时的理由）<textarea name="note" maxLength={4000} required /></label><button className="button-primary" disabled={busy}>保存笔记</button></form>{data.notes?.filter(n => inRange(n.createdAt)).map(n => <article key={n.id}><small>{time(n.createdAt)}</small><p className="paper-note">{n.content}</p></article>)}</section></>;
}
function EquityChart({ snapshots }: { snapshots: Snapshot[] }) {
  const points = snapshots.filter(s => s.equityMinor !== null); if (!points.length) return <p className="manager-note">暂无估值点。不会补造历史余额。</p>;
  const values = points.map(s => Number(s.equityMinor)), min = Math.min(...values), span = Math.max(1, Math.max(...values) - min);
  const times = points.map(s => new Date(s.createdAt).getTime()), elapsed = Math.max(1, times.at(-1)! - times[0]);
  return <figure className="paper-chart"><svg viewBox="0 0 600 150" role="img" aria-label="实际保存的账户估值点"><line x1="20" y1="135" x2="580" y2="135" stroke="#d8e0ee" />{points.map((s, i) => <circle key={s.id} cx={20 + (times[i] - times[0]) * 560 / elapsed} cy={125 - (values[i] - min) * 100 / span} r="4" fill={s.quality === "CURRENT" ? "#267DFF" : "#F2881B"}><title>{time(s.createdAt)} · {money(s.equityMinor)} · {s.quality}</title></circle>)}</svg><figcaption>仅展示真实估值点；橙色为资料不完整。空档不补点、不连线推断收益。</figcaption></figure>;
}
function Maintenance({ workspaceId, account, busy, run, onErased }: { workspaceId: string; account: Account; busy: boolean; run: (fn: () => Promise<void>) => Promise<void>; onErased: () => void }) {
  const [adjustment, setAdjustment] = useState<{ previewId: string; [key: string]: unknown } | null>(null);
  const [deletion, setDeletion] = useState<{ signature: string; warning: string; [key: string]: unknown } | null>(null);
  const [retry, setRetry] = useState("");
  async function market(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const form = new FormData(e.currentTarget); await run(async () => { await request(workspaceId, "market-review", JSON.parse(String(form.get("market")))); }); }
  async function adjust(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const f = new FormData(e.currentTarget); await run(async () => { setAdjustment(await request(workspaceId, "adjustments/preview", { accountId: account.id, input: { instrumentId: f.get("instrumentId"), eventKey: f.get("eventKey"), kind: f.get("kind"), cashMinor: yuanToMinor(String(f.get("cash") || "0")), quantity: Number(f.get("quantity")), entitlementQuantity: Number(f.get("entitlement")), recordDay: f.get("recordDay"), effectiveDay: f.get("effectiveDay"), sellableOn: f.get("sellableOn"), source: f.get("source"), note: f.get("note"), taxConfirmed: f.has("taxConfirmed") } })); }); }
  return <>
    <MarketReviewForm workspaceId={workspaceId} run={run} busy={busy} />
    <details><summary>分红与送转核对</summary><p>仅处理已有依据的现金分红和送股。复杂事件或税费未核实时保持暂停。</p><form onSubmit={adjust} onChange={() => setAdjustment(null)}><div className="paper-form"><label>证券代码<input name="instrumentId" placeholder="sh600000" required /></label><label>事件唯一编号<input name="eventKey" minLength={5} required /></label><label>类型<select name="kind"><option value="DIVIDEND">已核实税后分红</option><option value="BONUS_SHARES">送股／转增</option></select></label><label>登记日持股数量<input name="entitlement" type="number" min={1} required /></label><label>现金到账（元）<input name="cash" type="number" min={0} step="0.01" defaultValue={0} /></label><label>增加股份<input name="quantity" type="number" min={0} defaultValue={0} /></label><label>权益登记日<input name="recordDay" type="date" required /></label><label>实际到账／生效日<input name="effectiveDay" type="date" required /></label><label>新增股份可卖日（分红填生效日）<input name="sellableOn" type="date" required /></label><label>公告来源<input name="source" minLength={10} required /></label><label>核对说明<textarea name="note" minLength={5} required /></label><label><input type="checkbox" name="taxConfirmed" required />已核对权益、税费及生效日期</label><button disabled={busy || account.status !== "ACTIVE"}>预览调整</button></div></form>{adjustment && <div className="paper-confirm"><p>增加现金 {money(String(adjustment.cashMinor))}；增加股份 {String(adjustment.quantity)}。调整会进入资金与持仓记录。</p><button disabled={busy} onClick={() => void run(async () => { await request(workspaceId, "adjustments/confirm", { accountId: account.id, previewId: adjustment.previewId }); setAdjustment(null); })}>确认公司行为调整</button></div>}</details>
    <details><summary>本地 Demo 行情资料核验</summary><p>供维护人员导入有来源的交易日历、当日证券状态及盘中验证报告。格式见模拟交易运行文档；此操作影响本机所有模拟账户。</p><form onSubmit={market}><textarea name="market" aria-label="市场核验 JSON" rows={8} required /><button disabled={busy}>确认并保存核验资料</button></form></details>
    <details><summary>彻底清除本模拟账户</summary><p>先查看影响，清理全部关联记录和受管理旧备份。应用外的 CSV 或手工备份需自行处理。</p><button disabled={busy} onClick={() => void run(async () => { setDeletion(await request(workspaceId, `deletion-preview?accountId=${account.id}`)); })}>查看删除影响</button>{deletion && <div className="paper-confirm"><p>{deletion.warning}</p><p>委托 {String(deletion.orders)}，成交 {String(deletion.fills)}，流水 {String(deletion.entries)}，笔记 {String(deletion.notes)}，快照 {String(deletion.snapshots)}；条件单 {String(deletion.conditions)}；关联对话 {String(deletion.agentSessions)} 段、消息 {String(deletion.agentMessages)} 条。</p>{Boolean(deletion.experiment) && <p>策略、股票池、授权及每轮分析记录将一并清除。</p>}{Boolean(deletion.removableDataset) && <p>仅本账户使用的回放数据集将清除：{JSON.stringify(deletion.removableDataset)}</p>}{Boolean(deletion.retainedSharedDataset) && <p>其他账户仍在使用的数据集保留：{JSON.stringify(deletion.retainedSharedDataset)}</p>}{deletion.canDelete === false && <p role="alert">存在尚不能可靠清理的依赖，暂不能确认彻底删除：{JSON.stringify(deletion.unknownOwnerTypes)}</p>}<button disabled={busy || deletion.canDelete === false} onClick={() => void run(async () => { await request(workspaceId, "accounts/erase", { accountId: account.id, signature: deletion.signature, confirmed: true }); onErased(); })}>确认彻底清除</button></div>}<label>失败任务编号（用于继续文件清理）<input value={retry} onChange={e => setRetry(e.target.value)} /></label><button disabled={busy || !retry} onClick={() => void run(async () => { await request(workspaceId, "accounts/erase", { accountId: account.id, retryId: retry, signature: "", confirmed: true }); onErased(); })}>重试清理任务</button></details>
  </>;
}

function PendingErasure({ workspaceId, busy, run }: { workspaceId: string; busy: boolean; run: (fn: () => Promise<void>) => Promise<void> }) {
  const [jobs, setJobs] = useState<{ id: string; entityId: string; status: string }[]>([]);
  useEffect(() => { let active = true; const refresh = () => request<typeof jobs>(workspaceId, "deletion-jobs").then(rows => { if (active) setJobs(rows); }).catch(() => {}); void refresh(); const timer = setInterval(refresh, 5000); return () => { active = false; clearInterval(timer); }; }, [workspaceId]);
  if (!jobs.length) return null;
  return <section className="paper-notice"><h3>数据清理尚未完成</h3>{jobs.map(j => <p key={j.id}>{j.id} · {j.status} <button disabled={busy} onClick={() => void run(async () => { await request(workspaceId, "accounts/erase", { accountId: j.entityId, retryId: j.id, signature: "", confirmed: true }); window.location.reload(); })}>继续清理文件与备份</button></p>)}</section>;
}
