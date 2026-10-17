"use client";

import { useEffect, useState, useRef } from "react";

import { readBusinessDraft, writeBusinessDraft } from "./business-draft";
import { Activity, Check, ChevronLeft, ChevronRight, CircleCheck, Clock3, Pause, Play, SkipForward, ListChecks, PackageSearch, RotateCcw, X } from "lucide-react";
import { minorToYuan, yuanToMinor } from "@/domain/money-input";
import { runLifeFinancialSimulation, type LifeSimulationResult, type ScenarioEvent, type SimulationEventKind, type SimulationSnapshot } from "@/domain/life-financial-simulation";

type Scenario = {
  key: string;
  name: string;
  assumption: string;
  netWorthBeforeMinor: string;
  netWorthAfterMinor: string;
  liquidityBeforeMinor: string;
  liquidityAfterMinor: string;
  goalCoverageBefore: number;
  goalCoverageAfter: number;
  riskChange: string;
  requiresReplanning: boolean;
};

export type ExecutionResults = {
  scenario: null | { id: string; sourceRevision: number; isStale: boolean; planKey: string; planName: string; goalName: string; createdAt: string; scenarios: Scenario[] };
  actions: null | { generationTaskId: string; sourceRevision: number; isStale: boolean; items: ActionItem[] };
};

type ProductConditions = { assetClasses: string[]; maxRiskLevel: number; liquidity: string[]; maxTermMonths: number | null; currency: string };
type ActionDetails = { riskId?: string; steps: string[]; prerequisites: string[]; completionCriteria: string; verificationRequired: string };
type ActionItem = { isStale: boolean; isOverdue: boolean; revisionScope?: "PORTFOLIO" | "TRANSACTION" | "PROFESSIONAL"; sourceRevision: number; id: string; kind: string; title: string; reason: string; amountMinor: string | null; priority: number; dueDate: string | null; status: string; diagnosisId: string | null; goalId?: string | null; goalName?: string | null; planKey?: string | null; details: ActionDetails | null; productConditions: ProductConditions | null; feedback: Array<{ id: string; reason: string; toStatus: string; createdAt: string }> };
type ActionStatusHandler = (id: string, status: string, reason?: string) => Promise<boolean>;

function shortActionTitle(title: string) {
  const characters = Array.from(title.trim());
  return characters.length > 8 ? `${characters.slice(0, 8).join("")}…` : title.trim();
}

function money(value: string) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(Number(BigInt(value)) / 100);
}

const assetLabels: Record<string, string> = { CASH: "现金", BANK_DEPOSIT: "银行存款", MONEY_MARKET: "货币基金", BOND_FUND: "债券基金", EQUITY_FUND: "权益基金" };
const liquidityLabels: Record<string, string> = { T0: "随时可用", D7: "7 日内", D30: "30 日内", Y1: "1 年内" };

type ScenarioSimulationProps = { snapshot: SimulationSnapshot | null; canRun: boolean; storageKey: string; workspaceId?: string; onNavigate: () => void };

const eventLabels: Record<SimulationEventKind, string> = { LARGE_EXPENSE: "大额支出", INCOME_CHANGE: "收入下降或中断", FAMILY_CHANGE: "家庭情况变化" };

export function ScenarioView({ snapshot, canRun, storageKey, workspaceId, onNavigate }: ScenarioSimulationProps) {
  const [setupOpen, setSetupOpen] = useState(false);
  const [result, setResult] = useState<LifeSimulationResult | null>(null);
  const [periodIndex, setPeriodIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [event, setEvent] = useState<ScenarioEvent>({ kind: "INCOME_CHANGE", label: "收入中断", startMonth: 3, durationMonths: 6, oneTimeExpenseMinor: "0", monthlyExpenseChangeMinor: "0", incomeDuringEventMinor: "0", incomeAfterEventMinor: null });

  const draftVersion = useRef(0);
  useEffect(() => {
    let active = true;
    if (workspaceId) void readBusinessDraft(workspaceId, "SIMULATION", storageKey).then((saved) => { if (!active) return; draftVersion.current = saved?.version ?? 0; if (saved) setResult(JSON.parse(saved.dataJson) as LifeSimulationResult); }).catch((e) => { if (active) setSetupError(e.message); });
    return () => { active = false; };
  }, [storageKey, workspaceId]);

  useEffect(() => {
    if (!playing || !result) return;
    const timer = window.setInterval(() => setPeriodIndex((index) => {
      if (index >= result.periods.length - 1) { setPlaying(false); return index; }
      return index + 1;
    }), 1100);
    return () => window.clearInterval(timer);
  }, [playing, result]);

  function chooseKind(kind: SimulationEventKind) {
    setEvent(kind === "LARGE_EXPENSE"
      ? { kind, label: "突发大额支出", startMonth: 3, durationMonths: null, oneTimeExpenseMinor: "0", monthlyExpenseChangeMinor: "0", incomeDuringEventMinor: null, incomeAfterEventMinor: null }
      : kind === "FAMILY_CHANGE"
        ? { kind, label: "家庭情况变化", startMonth: 3, durationMonths: null, oneTimeExpenseMinor: "0", monthlyExpenseChangeMinor: "0", incomeDuringEventMinor: "0", incomeAfterEventMinor: null }
        : { kind, label: "收入中断", startMonth: 3, durationMonths: 6, oneTimeExpenseMinor: "0", monthlyExpenseChangeMinor: "0", incomeDuringEventMinor: "0", incomeAfterEventMinor: null });
  }

  function updateMoney(field: "oneTimeExpenseMinor" | "monthlyExpenseChangeMinor" | "incomeDuringEventMinor" | "incomeAfterEventMinor", value: string) {
    const allowsNull = field === "incomeDuringEventMinor" || field === "incomeAfterEventMinor";
    try {
      const normalized = value.trim();
      const negative = normalized.startsWith("-");
      const minor = normalized === "" ? (allowsNull ? null : "0") : `${negative ? "-" : ""}${yuanToMinor(negative ? normalized.slice(1) : normalized)}`;
      setEvent((current) => ({ ...current, [field]: minor }));
    } catch { /* Keep the last valid amount until the input is corrected. */ }
  }

  async function startSimulation() {
    if (!snapshot) return;
    try {
      const next = runLifeFinancialSimulation(snapshot, event);
      if (workspaceId) { const saved = await writeBusinessDraft(workspaceId, "SIMULATION", storageKey, draftVersion.current, String(snapshot.sourceRevision), next); draftVersion.current = saved.version; }
      setResult(next);
      setPeriodIndex(0);
      setSetupOpen(false);
      setSetupError("");

    } catch (error) { setSetupError(error instanceof Error ? error.message : "模拟条件不完整"); }
  }

  const stale = Boolean(result && snapshot && result.sourceRevision !== snapshot.sourceRevision);
  const currentPeriod = result?.periods[periodIndex] ?? null;
  const fieldMoney = (value: string | null) => value === null ? "" : minorToYuan(value);

  return <section>
    <div className="section-heading"><div><p className="eyebrow">情景推演</p><h2 className="mt-2">模拟未来突发情况</h2><p className="mt-2">模拟未来突发情况，检验规划的方案是否能承受变化。</p><button className="button-primary mt-5" disabled={!canRun || Boolean(snapshot?.missingFields.length)} title={!canRun ? "请先完成未来规划。" : snapshot?.missingFields.length ? "请先补充模拟所需数据。" : "设置一次突发情景"} onClick={() => setSetupOpen(true)}><Activity size={16} />{result ? "重新设置情景" : "开始模拟"}</button></div></div>
    {!canRun && <div className="mt-7 flex min-h-[340px] flex-col items-center justify-center text-center"><span className="grid size-14 place-items-center bg-slate-100 text-slate-400"><Activity size={25} /></span><h3 className="mt-5 text-xl font-semibold">请先完成未来规划</h3><p className="mt-2 max-w-md text-sm leading-6 text-slate-500">情景模拟需要一套已选定、未过期的未来规划，才能确定目标日期和每月投入。</p><button className="button-secondary mt-6" onClick={onNavigate}><ChevronRight size={15} />前往未来规划</button></div>}
    {canRun && snapshot?.missingFields.length ? <div className="mt-7 border-l-4 border-amber-500 bg-amber-50 p-5 text-sm text-amber-900"><p className="font-semibold">开始前还需确认部分数据</p><p className="mt-2">本次模拟需要：{snapshot.missingFields.join("、")}。请先在资产、负债或个人画像中补充，系统不会将未知金额按 0 元处理。</p></div> : null}
    {stale && <div className="mt-6 border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-900">财富底账已变化，以下模拟保留为历史参考。请重新设置情景以使用最新数据。</div>}
    {canRun && !result && !snapshot?.missingFields.length && <div className="mt-7 grid min-h-[340px] place-items-center border border-dashed border-slate-300 bg-white px-6 text-center"><div><span className="mx-auto grid size-14 place-items-center bg-blue-50 text-blue-700"><Activity size={25} /></span><h3 className="mt-5 text-xl font-semibold">从一次真实变化开始</h3><p className="mt-2 max-w-md text-sm leading-6 text-slate-500">选择一个突发情况，确认发生时间和影响后，系统会从现在逐月推演到“{snapshot?.goal.name}”的目标日期。</p></div></div>}
    {result && currentPeriod && <SimulationTimeline result={result} period={currentPeriod} index={periodIndex} playing={playing} onPrevious={() => setPeriodIndex((index) => Math.max(0, index - 1))} onNext={() => setPeriodIndex((index) => Math.min(result.periods.length - 1, index + 1))} onPlay={() => setPlaying((value) => !value)} onLast={() => { setPeriodIndex(result.periods.length - 1); setPlaying(false); }} />}
    {setupOpen && snapshot && <SimulationSetup snapshot={snapshot} event={event} error={setupError} fieldMoney={fieldMoney} onClose={() => { setSetupError(""); setSetupOpen(false); }} onChoose={chooseKind} onEvent={setEvent} onMoney={updateMoney} onStart={startSimulation} />}
  </section>;
}

function SimulationSetup({ snapshot, event, error, fieldMoney, onClose, onChoose, onEvent, onMoney, onStart }: { snapshot: SimulationSnapshot; event: ScenarioEvent; error: string; fieldMoney: (value: string | null) => string; onClose: () => void; onChoose: (kind: SimulationEventKind) => void; onEvent: (event: ScenarioEvent) => void; onMoney: (field: "oneTimeExpenseMinor" | "monthlyExpenseChangeMinor" | "incomeDuringEventMinor" | "incomeAfterEventMinor", value: string) => void; onStart: () => void }) {
  const months = Math.max(1, Math.round((new Date(snapshot.targetDate).getTime() - new Date(snapshot.currentDate).getTime()) / 2_629_800_000));
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-label="设置情景模拟"><form className="max-h-[92vh] w-full max-w-2xl overflow-y-auto border border-slate-200 bg-white p-5 shadow-xl sm:p-7" onSubmit={(form) => { form.preventDefault(); onStart(); }}>
    <div className="flex items-start justify-between gap-4"><div><p className="eyebrow">确认模拟条件</p><h3 className="mt-2 text-xl font-semibold">为“{snapshot.goal.name}”设置一次变化</h3></div><button type="button" className="icon-button" onClick={onClose} aria-label="关闭"><X size={18} /></button></div>
    <div className="mt-5 grid gap-3 border-y border-slate-100 py-4 text-sm sm:grid-cols-3"><p><span className="block text-xs text-slate-400">模拟起点</span>{snapshot.currentDate.slice(0, 7)}</p><p><span className="block text-xs text-slate-400">模拟终点</span>{snapshot.targetDate.slice(0, 7)}</p><p><span className="block text-xs text-slate-400">模拟跨度</span>约 {months} 个月</p></div>
    <fieldset className="mt-6"><legend className="text-sm font-semibold">选择突发情况</legend><div className="mt-3 grid gap-2 sm:grid-cols-3">{(Object.keys(eventLabels) as SimulationEventKind[]).map((kind) => <button type="button" key={kind} className={`border p-3 text-left text-sm ${event.kind === kind ? "border-blue-600 bg-blue-50 text-blue-900" : "border-slate-200 bg-white"}`} onClick={() => onChoose(kind)}>{eventLabels[kind]}</button>)}</div></fieldset>
    <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="field"><span>事件说明</span><input required maxLength={60} value={event.label} onChange={(input) => onEvent({ ...event, label: input.target.value })} /></label><label className="field"><span>发生时间</span><input required type="number" min="1" max={months} value={event.startMonth} onChange={(input) => onEvent({ ...event, startMonth: Number(input.target.value) || 1 })} /></label>
      {event.kind === "INCOME_CHANGE" && <><label className="field"><span>持续月数</span><input required type="number" min="1" max={months} value={event.durationMonths ?? ""} onChange={(input) => onEvent({ ...event, durationMonths: Number(input.target.value) || 1 })} /></label><label className="field"><span>变化后月收入（元）</span><input required inputMode="decimal" value={fieldMoney(event.incomeDuringEventMinor)} onChange={(input) => onMoney("incomeDuringEventMinor", input.target.value)} /></label><label className="field"><span>恢复后月收入（元，可不填）</span><input inputMode="decimal" value={fieldMoney(event.incomeAfterEventMinor)} onChange={(input) => onMoney("incomeAfterEventMinor", input.target.value)} /></label></>}
      {event.kind !== "INCOME_CHANGE" && <><label className="field"><span>一次性新增支出（元）</span><input inputMode="decimal" value={fieldMoney(event.oneTimeExpenseMinor)} onChange={(input) => onMoney("oneTimeExpenseMinor", input.target.value)} /></label><label className="field"><span>每月新增支出（元）</span><input inputMode="decimal" value={fieldMoney(event.monthlyExpenseChangeMinor)} onChange={(input) => onMoney("monthlyExpenseChangeMinor", input.target.value)} /></label>{event.kind === "FAMILY_CHANGE" && <label className="field"><span>每月收入变化（元，可为负数）</span><input inputMode="decimal" value={fieldMoney(event.incomeDuringEventMinor)} onChange={(input) => onMoney("incomeDuringEventMinor", input.target.value)} /></label>}</>}
    </div>
    {error && <p className="mt-5 border-l-4 border-rose-500 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
    <p className="mt-5 text-xs leading-5 text-slate-500">开始后系统只使用本页确认的事件参数按月计算，不会修改你的真实资产、负债或未来规划。</p>
    <div className="mt-6 flex justify-end gap-2"><button type="button" className="button-secondary" onClick={onClose}>取消</button><button className="button-primary"><Play size={16} />开始模拟</button></div>
  </form></div>;
}

function SimulationTimeline({ result, period, index, playing, onPrevious, onNext, onPlay, onLast }: { result: LifeSimulationResult; period: LifeSimulationResult["periods"][number]; index: number; playing: boolean; onPrevious: () => void; onNext: () => void; onPlay: () => void; onLast: () => void }) {
  return <div className="mt-7"><div className="flex flex-col gap-4 border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold text-blue-700">{result.granularity === "MONTH" ? "按月展示" : result.granularity === "QUARTER" ? "按季度展示" : "按半年展示"}</p><h3 className="mt-1 text-lg font-semibold">{period.label}</h3><p className="mt-1 text-sm text-slate-500">{period.eventDescription ?? "平稳推进"}</p></div><div className="flex gap-2"><button className="icon-button" title="上一期" onClick={onPrevious} disabled={index === 0}><ChevronLeft size={18} /></button><button className="icon-button" title={playing ? "暂停" : "自动播放"} onClick={onPlay}>{playing ? <Pause size={18} /> : <Play size={18} />}</button><button className="icon-button" title="下一期" onClick={onNext} disabled={index === result.periods.length - 1}><ChevronRight size={18} /></button><button className="icon-button" title="跳到最终结果" onClick={onLast}><SkipForward size={18} /></button></div></div>
    <div className="mt-4 h-1.5 overflow-hidden bg-slate-100"><div className="h-full bg-blue-600 transition-[width]" style={{ width: `${((index + 1) / result.periods.length) * 100}%` }} /></div>
    <div className="mt-4 grid gap-px border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">{[["本期收入", period.incomeMinor], ["本期支出", period.expenseMinor], ["本期还款", period.debtPaymentMinor], ["本期结余", period.monthlyBalanceMinor], ["期末现金", period.cashBalanceMinor], ["期末负债", period.liabilityBalanceMinor], ["目标进度", `${period.goalProgress}%`]].map(([label, value]) => <div key={label} className="bg-white p-4"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 text-base font-semibold tabular-nums">{String(value).includes("%") ? value : money(String(value))}</p></div>)}</div>
    <div className={`mt-4 border-l-4 px-4 py-3 text-sm leading-6 ${period.riskFlags.length ? "border-amber-500 bg-amber-50 text-amber-900" : "border-blue-600 bg-blue-50 text-blue-900"}`}><p className="font-semibold">本期解释</p><p className="mt-1">{period.explanation}</p>{period.riskFlags.length ? <p className="mt-2 text-xs">风险标记：{period.riskFlags.join("、")}</p> : null}</div>
    <p className="mt-5 text-xs leading-5 text-slate-400">程序按月计算并按当前时长聚合展示；结果仅用于理解变化，不构成投资建议或事件预测。</p>
  </div>;
}

export function ActionsView({ result, loading, onStatus }: { result: ExecutionResults["actions"]; loading: boolean; onStatus: ActionStatusHandler }) {
  if (!result) return <div className="flex min-h-[65vh] flex-col items-center justify-center text-center"><span className="grid size-14 place-items-center bg-blue-50 text-blue-700"><ListChecks size={25} /></span><h1 className="mt-5 text-xl font-semibold">还没有需要跟进的行动</h1><p className="mt-2 max-w-md text-sm leading-6 text-slate-500">采纳未来规划或收支建议后，行动会出现在这里。</p></div>;
  return <>
    {result.isStale && <div className="mb-6 border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-900">部分行动基于旧底账，需重新诊断确认；历史进度仍保留。</div>}
    <div className="section-heading"><div><p className="eyebrow">执行进度</p><h1 className="mt-2 text-2xl font-semibold">持续推进已确定的行动</h1><p>用户标记完成不等于系统验证完成；更新底账后，系统才会确认财务状态是否改善。</p></div></div>
    <section className="mt-7 space-y-3">{result.items.length ? result.items.map((action) => <article key={action.id} className="border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <span className="grid size-8 shrink-0 place-items-center bg-slate-900 text-xs font-bold text-white">{action.priority}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold" title={action.title}>{shortActionTitle(action.title)}</h2><ActionStatus value={action.status} />{action.isStale && <span className="text-xs text-amber-700">基于旧数据</span>}{action.isOverdue && <span className="text-xs text-rose-700">已到期，待复盘</span>}</div>
          {(action.goalName || action.planKey) && <p className="mt-2 text-xs font-medium text-blue-700">{action.goalName ? `目标：${action.goalName}` : ""}{action.goalName && action.planKey ? " · " : ""}{action.planKey ? `Plan ${action.planKey}` : ""}</p>}
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{action.reason}</p>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs"><span className="text-slate-400">期限 <b className="ml-1 text-slate-700">{action.dueDate ? new Date(action.dueDate).toLocaleDateString("zh-CN") : "持续"}</b></span><span className="text-slate-500">{action.kind === "CASHFLOW_ADVICE" || action.kind.startsWith("CASHFLOW_RECOMMENDATION_") ? "来源：收支分析" : action.diagnosisId ? "来源：财富诊断" : "来源：未来规划"}</span></div>
          <details className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-600"><summary className="cursor-pointer font-medium text-blue-700">查看详情</summary>{shortActionTitle(action.title) !== action.title && <p className="mt-3 font-semibold text-slate-800">{action.title}</p>}<p className="mt-2 leading-6">{action.reason}</p><p className="mt-2">金额：{action.amountMinor ? money(action.amountMinor) : "未指定"}</p>{action.details && <ActionDetailsView details={action.details} />}{action.feedback.length > 0 && <div className="mt-4"><p className="font-medium">执行反馈</p><ul className="mt-2 space-y-2">{action.feedback.map((item) => <li key={item.id}><span className="text-xs text-slate-400">{new Date(item.createdAt).toLocaleDateString("zh-CN")} · {item.toStatus === "DEFERRED" ? "暂缓" : "反馈"}</span><p className="whitespace-pre-wrap break-words">{item.reason}</p></li>)}</ul></div>}{action.productConditions && <ProductConditionsView conditions={action.productConditions} />}</details>
        </div>
        <ActionButtons action={action} disabled={loading} onStatus={onStatus} />
      </div>
    </article>) : <div className="border border-blue-200 bg-blue-50 p-6 text-sm text-blue-800">当前没有需要跟进的行动。</div>}</section>
  </>;
}

function ActionDetailsView({ details }: { details: ActionDetails }) {
  return <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
    {details.prerequisites.length > 0 && <div><p className="font-medium text-slate-800">前置条件</p><ul className="list-disc pl-5">{details.prerequisites.map((step, index) => <li key={index}>{step}</li>)}</ul></div>}
    <ol className="list-decimal pl-5">{details.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
    <p><span className="font-medium text-slate-800">完成标准：</span>{details.completionCriteria}</p>
    <p><span className="font-medium text-slate-800">改善验证所需数据：</span>{details.verificationRequired}</p>
  </div>;
}

function ProductConditionsView({ conditions }: { conditions: ProductConditions }) {
  return <div className="mt-4 border-l-2 border-blue-600 bg-slate-50 p-3"><div className="flex items-center gap-2 text-xs font-semibold text-slate-700"><PackageSearch size={15} />产品筛选条件</div><div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-600"><span className="bg-white px-2 py-1">类别：{conditions.assetClasses.map((item) => assetLabels[item] ?? item).join(" / ")}</span><span className="bg-white px-2 py-1">风险 ≤ {conditions.maxRiskLevel} 级</span><span className="bg-white px-2 py-1">流动性：{conditions.liquidity.map((item) => liquidityLabels[item] ?? item).join(" / ")}</span>{conditions.maxTermMonths && <span className="bg-white px-2 py-1">期限 ≤ {conditions.maxTermMonths} 个月</span>}</div></div>;
}

function ActionStatus({ value }: { value: string }) {
  const map: Record<string, [string, string]> = { PROPOSED: ["待接受", "bg-slate-100 text-slate-600"], ACCEPTED: ["进行中", "bg-sky-50 text-sky-700"], USER_MARKED_COMPLETED: ["等待系统验证", "bg-amber-50 text-amber-700"], VERIFIED_COMPLETED: ["已验证完成", "bg-blue-50 text-blue-700"], DEFERRED: ["已暂缓", "bg-amber-50 text-amber-700"], DISMISSED: ["已拒绝", "bg-slate-100 text-slate-400"] };
  const [label, style] = map[value] ?? [value, "bg-slate-100 text-slate-500"];
  return <span className={`px-2 py-1 text-[10px] font-bold ${style}`}>{label}</span>;
}

function ActionButtons({ action, disabled, onStatus }: { action: ActionItem; disabled: boolean; onStatus: ActionStatusHandler }) {
  const [feedbackStatus, setFeedbackStatus] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  if (feedbackStatus) return <form className="w-full shrink-0 space-y-2 lg:w-64" onSubmit={async (event) => {
    event.preventDefault();
    if (await onStatus(action.id, feedbackStatus, reason.trim())) { setFeedbackStatus(null); setReason(""); }
  }}><label className="field"><span>{feedbackStatus === "DEFERRED" ? "暂缓原因" : "拒绝原因"}</span><textarea autoFocus required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} disabled={disabled} /></label><div className="flex gap-2"><button className="button-primary" disabled={disabled || !reason.trim()}><Check size={15} />确认</button><button type="button" className="button-secondary" disabled={disabled} onClick={() => setFeedbackStatus(null)}>取消</button></div></form>;
  if (action.status === "VERIFIED_COMPLETED") return <span className="flex shrink-0 items-center gap-2 text-xs font-semibold text-blue-700"><CircleCheck size={18} />底账已验证</span>;
  if (action.status === "PROPOSED" || action.status === "ACCEPTED") return <div className="flex shrink-0 flex-wrap gap-2">{action.status === "PROPOSED" ? <button className="button-primary" disabled={disabled || action.isStale} onClick={() => onStatus(action.id, "ACCEPTED")}><Check size={15} />接受</button> : <button className="button-secondary" disabled={disabled} onClick={() => onStatus(action.id, "USER_MARKED_COMPLETED")}><Clock3 size={15} />标记已完成</button>}<button className="icon-button" title="暂缓" aria-label="暂缓行动" disabled={disabled} onClick={() => setFeedbackStatus("DEFERRED")}><Pause size={16} /></button><button className="icon-button" title="拒绝" aria-label="拒绝行动" disabled={disabled} onClick={() => setFeedbackStatus("DISMISSED")}><X size={16} /></button></div>;
  if (action.status === "USER_MARKED_COMPLETED") return <button className="button-secondary shrink-0" disabled={disabled} onClick={() => onStatus(action.id, "ACCEPTED")}><RotateCcw size={15} />撤回标记</button>;
  return <button className="button-secondary shrink-0" disabled={disabled} onClick={() => onStatus(action.id, "ACCEPTED")}><RotateCcw size={15} />恢复行动</button>;
}
