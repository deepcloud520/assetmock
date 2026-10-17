"use client";

import { CarPlanningView } from "./car-planning-view";
import { isCarIntent } from "@/domain/car-workflow";
import { ArrowRight, MessageCircle, Bot, Check, LoaderCircle, Pencil, Plus, Send, Sparkles, Target, Trash2, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

type GoalSummary = { id: string; name: string; type: string; targetAmountMinor: string; targetDate: string; preparedAmountMinor: string; monthlyContributionMinor: string; priority: number; isFlexible: boolean };
type GoalDraft = { name: string | null; target_amount_minor: string | null; target_date: string | null; prepared_amount_minor: string | null };
type GoalSession = {
  id: string;
  status: string;
  goalId: string | null;
  draft: GoalDraft;
  messages: Array<{ id: string; role: string; content: string; createdAt: string }>;
};

async function goalRequest<T>(path: string, workspaceId: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", "X-Workspace-Id": workspaceId, ...options?.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? "目标 Agent 请求失败");
  }
  return response.json();
}

function money(value: string | null) {
  if (value === null) return "待澄清";
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(Number(BigInt(value)) / 100);
}

export function GoalHome({ onViewExecution, onStartCarPlanning, workspaceId, goals, multiGoalConsentAt, onDataChange }: {
  onViewExecution?: () => void;
  onStartCarPlanning?: (intent?: string) => void;
  workspaceId: string;
  goals: GoalSummary[];
  multiGoalConsentAt: string | null;
  onDataChange: () => Promise<void>;
}) {
  const [carId, setCarId] = useState<string | null>(null);
  const [showCar, setShowCar] = useState(false);
  const [carIntent, setCarIntent] = useState("");
  const [session, setSession] = useState<GoalSession | null>(null);
  const [idea, setIdea] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [showConsent, setShowConsent] = useState(false);
  const [showConversation, setShowConversation] = useState(false);
  const [consented, setConsented] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    async function restore() {
      try {
        const [restored, carData] = await Promise.all([
          goalRequest<GoalSession | null>("/api/goal-discovery", workspaceId),
          goalRequest<{ decisions: { id: string; status: string; goalSessionId: string | null }[] }>("/api/car-decisions", workspaceId),
        ]);
        const remembered = localStorage.getItem(`car-current:${workspaceId}`);
        const car = carData.decisions.find((d) => d.id === remembered) ?? carData.decisions.find((d) => d.status !== "PURCHASED");
        if (active && car) { setCarId(car.id); setShowCar(true); }

        if (active) {
          setSession(restored);
          if (restored && restored.status !== "COMPLETED" && !car) setShowConversation(true);
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "读取目标对话失败");
      } finally {
        if (active) setLoading(false);
      }
    }
    void restore();
    return () => { active = false; };
  }, [workspaceId]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [session?.messages.length, running]);

  async function startNow() {
    setShowConversation(true);
    setRunning(true);
    setError("");
    try {
      const created = await goalRequest<GoalSession>("/api/goal-discovery", workspaceId, { method: "POST", body: JSON.stringify({ content: idea.trim() || undefined }) });
      setSession(created);
      setIdea("");
      if (created.status === "COMPLETED") await onDataChange();
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "启动目标对话失败");
      try {
        const restored = await goalRequest<GoalSession | null>("/api/goal-discovery", workspaceId);
        if (restored) setSession(restored);
      } catch {
        // Keep the original request error visible when session recovery also fails.
      }
    }
    finally { setRunning(false); }
  }

  async function beginCar(intent: string, goalSessionId?: string) {
    setRunning(true); setError("");
    try {
      const record = await goalRequest<{ id: string }>("/api/car-decisions/resume", workspaceId, { method: "POST", body: JSON.stringify({ intent, goalSessionId }) });
      localStorage.setItem(`car-current:${workspaceId}`, record.id);
      setCarId(record.id); setCarIntent(intent); setShowCar(true); setShowConversation(false); setIdea("");
      if (goalSessionId) setSession(null);
    } catch (e) { setError(e instanceof Error ? e.message : "未能继续买车决策"); } finally { setRunning(false); }
  }
  function begin() {
    if (isCarIntent(idea)) { void beginCar(idea); return; }
    if (goals.length > 0 && !consented && !multiGoalConsentAt) setShowConsent(true);
    else void startNow();
  }

  async function acknowledge() {
    setRunning(true);
    setError("");
    try {
      await goalRequest("/api/goal-discovery/consent", workspaceId, { method: "POST", body: "{}" });
      setConsented(true);
      setShowConsent(false);
      await startNow();
    } catch (consentError) { setError(consentError instanceof Error ? consentError.message : "确认失败"); setRunning(false); }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!session || !message.trim()) return;
    const content = message.trim();
    if (isCarIntent(content)) { await beginCar(content, session.id); setMessage(""); return; }
    setMessage("");
    setRunning(true);
    setError("");
    const previous = session;
    setSession({ ...session, messages: [...session.messages, { id: `optimistic-${Date.now()}`, role: "USER", content, createdAt: new Date().toISOString() }] });
    try {
      const updated = await goalRequest<GoalSession>(`/api/goal-discovery/${session.id}/messages`, workspaceId, { method: "POST", body: JSON.stringify({ content }) });
      setSession(updated);
      if (updated.status === "WAITING_CONSENT") setShowConsent(true);
      if (updated.status === "COMPLETED") await onDataChange();
    } catch (sendError) { setSession(previous); setError(sendError instanceof Error ? sendError.message : "消息发送失败"); }
    finally { setRunning(false); }
  }

  async function cancel() {
    if (!session) return;
    setRunning(true);
    setError("");
    try {
      await goalRequest(`/api/goal-discovery/${session.id}/cancel`, workspaceId, { method: "POST" });
      setSession(null);
      setMessage("");
      setShowConversation(false);
      setShowConsent(false);
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "取消目标对话失败");
    } finally {
      setRunning(false);
    }
  }

  const active = session && session.status !== "COMPLETED" && session.status !== "CANCELLED";
  return <>
    <section className="home-record-panel home-goal-panel">
      {error && !showConversation && <p role="alert" className="car-alert">{error}</p>}
      <div className="goal-panel-heading"><p className="eyebrow">人生目标</p><h2 className="mt-2 text-xl font-semibold">想实现什么？</h2><p className="mt-2 text-xs leading-5 text-slate-500">先说个想法，再一起理清金额和时间。</p></div>
      <div className="goal-create-area">
        <label className="field"><span>新目标</span><textarea className="goal-idea-input" value={idea} maxLength={300} disabled={running || Boolean(active)} onChange={(event) => setIdea(event.target.value)} placeholder="例如：两三年后换一套房，还没想清预算" /></label>
        <button className="button-primary mt-3 w-full" disabled={running || Boolean(active)} onClick={begin}>{running ? <LoaderCircle className="animate-spin" size={16} /> : <Sparkles size={16} />}{active ? "目标沟通进行中" : "让 AI 帮助思考"}</button>
      </div>
      {onStartCarPlanning && <button className="mx-4 mb-4 flex items-center gap-2 text-xs font-semibold text-blue-700" disabled={running} onClick={() => void beginCar("我想买车")}>我想买车，先看看能承担多少<ArrowRight size={15} /></button>}
      {carId && <button className="mx-4 mb-4 text-xs font-semibold text-blue-700" onClick={() => setShowCar((v) => !v)}>{showCar ? "暂时收起买车对话" : "继续已保存的买车决策"}</button>}
      {active && <button className="mx-4 mb-4 flex items-center gap-2 text-xs font-semibold text-blue-700" onClick={() => setShowConversation(true)}><Bot size={15} />继续目标对话</button>}
    </section>

    {showCar && carId && <div className="car-home-session"><CarPlanningView key={carId} workspaceId={workspaceId} decisionId={carId} initialIntent={carIntent} onDataChange={onDataChange} onViewExecution={() => onViewExecution?.()} onOpenDetails={() => onStartCarPlanning?.()} onEditLedger={() => document.querySelector('[aria-label="当前财务底账"]')?.scrollIntoView({ behavior: "smooth" })} /></div>}
    {showConversation && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !running && setShowConversation(false)}><section className="goal-conversation goal-conversation-dialog" role="dialog" aria-modal="true" aria-labelledby="goal-conversation-title">
      {error && <div className="flex items-center justify-between border-b border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><span>{error}</span><button className="icon-button" aria-label="关闭错误" onClick={() => setError("")}><X size={15} /></button></div>}
      {loading ? <div className="grid flex-1 place-items-center text-sm text-slate-500"><span className="flex items-center gap-2"><LoaderCircle className="animate-spin" size={16} />正在恢复目标对话</span></div> : !session ? <div className="grid flex-1 place-items-center px-6 text-center"><div><span className="mx-auto grid size-14 place-items-center bg-blue-50 text-blue-700"><Bot size={26} /></span><h2 className="mt-5 text-xl font-semibold">从一个模糊想法开始</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">不用先想好分类或优先级。目标 Agent 只会与你确认目标、金额、时间和已准备金额。</p></div></div> : <>
        <header className="border-b border-slate-200 px-5 py-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p id="goal-conversation-title" className="text-sm font-semibold">目标澄清对话</p><p className="mt-1 text-xs text-slate-500">{session.status === "COMPLETED" ? "已创建" : session.status === "WAITING_CONSENT" ? "等待多目标确认" : session.status === "ERROR" ? "上次未完成，可继续重试" : "正在梳理"}</p></div><div className="flex gap-2">{session.status === "COMPLETED" && <button className="button-secondary" onClick={() => { setSession(null); setShowConversation(false); }}><Plus size={15} />创建下一个目标</button>}<button className="icon-button" aria-label="关闭目标对话" disabled={running} onClick={() => setShowConversation(false)}><X size={17} /></button></div></div></header>
        {active && <div className="flex justify-end border-b border-slate-200 px-5 py-2"><button type="button" className="button-secondary" disabled={running} onClick={() => void cancel()}><X size={15} />放弃本次目标</button></div>}
        <GoalDraftSummary draft={session.draft} />
        <div className="goal-message-scroll">{session.messages.map((item) => <article key={item.id} className={`agent-message ${item.role === "USER" ? "agent-message-user" : "agent-message-assistant"}`}><div className="agent-message-role">{item.role === "USER" ? "你" : "目标 Agent"}</div><p>{item.content}</p></article>)}{running && <p className="flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="animate-spin" size={15} />正在理解并整理你的目标</p>}<div ref={endRef} /></div>
        {session.status !== "COMPLETED" && <form className="agent-composer" onSubmit={send}><textarea value={message} maxLength={2000} disabled={running || session.status === "WAITING_CONSENT"} onChange={(event) => setMessage(event.target.value)} placeholder="继续补充，或在四项信息无误后明确回复“确认”" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><button className="button-primary" aria-label="发送目标消息" title="发送" disabled={running || !message.trim() || session.status === "WAITING_CONSENT"}>{running ? <LoaderCircle className="animate-spin" size={16} /> : <Send size={16} />}</button></form>}
      </>}
    </section></div>}

    {showConsent && <div className="dialog-backdrop"><section className="w-[min(460px,calc(100%-2rem))] bg-white p-6 shadow-2xl" role="alertdialog" aria-modal="true" aria-labelledby="multi-goal-title"><span className="grid size-10 place-items-center bg-amber-50 text-amber-700"><Target size={19} /></span><h2 id="multi-goal-title" className="mt-5 text-lg font-semibold">确认创建多个目标</h2><p className="mt-2 text-sm leading-6 text-slate-600">多个人生目标会汇总成一个整体财富目标进行分析和规划，但每个目标仍会单独保留，可继续编辑或删除。</p><div className="mt-6 flex justify-end gap-2"><button className="button-secondary" disabled={running} onClick={() => setShowConsent(false)}>暂不创建</button><button className="button-primary" disabled={running} onClick={() => void acknowledge()}>{running ? <LoaderCircle className="animate-spin" size={15} /> : <Check size={15} />}已知晓并同意</button></div></section></div>}
  </>;
}

export function CreatedGoalsPanel({ onOpenGoalManager, goals, planningGoalId, onEdit, onDelete }: {
  onOpenGoalManager?: () => void;
  goals: GoalSummary[];
  planningGoalId: string | null;
  onEdit: (goal: GoalSummary) => void;
  onDelete: (goal: GoalSummary) => void;
}) {
  return <section className="home-created-goals" aria-labelledby="created-goals-title">
    <div className="goal-list-section"><div className="created-goals-heading"><div className="created-goals-title"><h2 id="created-goals-title" className="text-sm font-semibold">已创建目标</h2><span className="text-xs tabular-nums text-slate-400">{goals.length}</span></div>{onOpenGoalManager && <button type="button" className="goal-manager-link" onClick={onOpenGoalManager}><MessageCircle size={16} />与目标管家聊聊</button>}</div>
      <div className="goal-list mt-3">
        {goals.map((goal) => {
          const isPlanningGoal = planningGoalId === goal.id;
          const target = BigInt(goal.targetAmountMinor);
          const prepared = BigInt(goal.preparedAmountMinor);
          const progress = target > 0n ? Number((prepared * 100n) / target) : 0;
          return <article key={goal.id} className={`goal-list-item ${isPlanningGoal ? "goal-list-item-active" : ""}`}>
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-semibold">{goal.name}</p><p className="mt-1 text-xs text-slate-500">{money(goal.targetAmountMinor)} · {new Date(goal.targetDate).toLocaleDateString("zh-CN", { year: "numeric", month: "short" })}</p></div><div className="flex shrink-0"><button className="icon-button" title="编辑目标" aria-label={`编辑目标：${goal.name}`} onClick={() => onEdit(goal)}><Pencil size={14} /></button><button className="icon-button text-rose-600 hover:bg-rose-50" title="删除目标" aria-label={`删除目标：${goal.name}`} onClick={() => onDelete(goal)}><Trash2 size={14} /></button></div></div>
            <div className="goal-progress"><div className="goal-progress-copy"><span>已准备 {money(goal.preparedAmountMinor)}</span><strong>{Math.max(0, progress)}%</strong></div><div className="goal-progress-track" role="progressbar" aria-label={`${goal.name}准备进度`} aria-valuenow={Math.max(0, Math.min(progress, 100))} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }} /></div></div>
          </article>;
        })}
        {!goals.length && <div className="goal-empty-state"><Target size={20} /><p>你的目标会显示在这里</p></div>}
      </div>
    </div>
  </section>;
}

function GoalDraftSummary({ draft }: { draft: GoalDraft }) {
  const rows = [
    ["目标", draft.name ?? "待澄清"],
    ["目标金额", money(draft.target_amount_minor)],
    ["目标时间", draft.target_date ? new Date(`${draft.target_date}T00:00:00+08:00`).toLocaleDateString("zh-CN") : "待澄清"],
    ["已准备金额", money(draft.prepared_amount_minor)],
  ];
  return <div className="grid gap-px border-b border-slate-200 bg-slate-200 sm:grid-cols-4">{rows.map(([label, value]) => <div key={label} className="min-w-0 bg-white px-4 py-3"><p className="text-[11px] font-semibold text-slate-400">{label}</p><p className="mt-1 truncate text-sm font-medium text-slate-800">{value}</p></div>)}</div>;
}
