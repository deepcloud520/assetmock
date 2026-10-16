"use client";

import Link from "next/link";
import { readBusinessDraft, writeBusinessDraft } from "./business-draft";
import { z } from "zod";
import { useEffect, useState, useRef, type FormEvent, type ReactNode } from "react";
import { carWorkflow, carStepLabels, invalidateCarConfirmations, type CarStep } from "@/domain/car-workflow";
import { PlanningPreferences } from "./planning-preferences";
import { AlertTriangle, ArrowRight, Check, ChevronDown, LoaderCircle, Plus, Send, Trash2 } from "lucide-react";
import { addMonths, carFactsSchema, type CarEvaluation, type CarFacts, type CarScenario } from "@/domain/car-planning";
import { minorToYuan, yuanToMinor } from "@/domain/money-input";
import "./car-planning.css";

type Asset = { id: string; name: string; currentValueMinor: string; isAdjustable: boolean; goalId: string | null; liquidityLevel: string; currency: string };
type Goal = { id: string; name: string; preparedAmountMinor: string; monthlyContributionMinor: string };
type Plan = { id: string; version: number; sourceRevision: number; factsJson: string; snapshotJson: string; reason: string; adoptedAt: string };
type ReviewResult = { budgetComparison?: { month: string; livingMinor: string | null; missing: string[] }; keyAssumptions?: { id: string; label: string; status: string; evidence: string }[]; evaluation: CarEvaluation; needsAdjustment: boolean; impacts: string[]; actualFundingMinor: string; expectedFundingMinor: string; fundingGapMinor: string; afterPurchaseBalanceMinor: string | null; unexecutedCuts: string[]; executedCuts: string[]; note: string };
type Review = { id: string; month: string; factsJson: string; resultJson: string; adoptedPlanId: string | null };
type Decision = { id: string; version: number; sourceRevision: number; status: string; goalId: string | null; factsJson: string; conversationJson: string; evaluationJson: string | null; activePlanId: string | null; plans: Plan[]; reviews: Review[]; purchaseJson: string | null; viewStage: "facts" | "compare" | "review"; fieldEvidenceJson: string };
type PurchasePreview = { scenario: CarScenario; vehicleValueMinor: string; changes: { assetId: string; name: string; beforeMinor: string; usedMinor: string; afterMinor: string }[] };
type WorkspaceData = {
  asOfMonth: string; decisions: Decision[];
  workspace: { portfolioRevision: number; transactionRevision: number; assets: Asset[]; goals: Goal[]; liabilities: { id: string; name: string; monthlyPaymentMinor: string; outstandingBalanceMinor: string }[];
    profile: null | { stableMonthlyIncomeMinor: string; otherMonthlyIncomeMinor: string; rentExpenseMinor: string; transportExpenseMinor: string; essentialExpenseMinor: string } };
};
const zodReviewFacts = (value: unknown) => z.object(carFactsSchema.shape).strict().parse(value);
const money = (minor: string | null) => minor === null ? "待确认" : new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 2 }).format(Number(minor) / 100);
const methodName = { CASH: "全款", LOAN: "贷款" };
const strategyName = { ON_TIME: "按期买车", LOWER_BUDGET: "调整预算", DELAY: "调整时间", MORE_ROOM: "保留更多余量" };
const blankLoan: NonNullable<CarFacts["loan"]> = { quoted: false, annualRatePercent: "0", rateBasis: "NOMINAL_ANNUAL", termMonths: 36, downPaymentPercent: 30, maxPrincipalMinor: "0", method: "EQUAL_PAYMENT", feeMinor: "0" };

async function api<T>(workspaceId: string, path = "", body?: unknown): Promise<T> {
  const response = await fetch(`/api/car-decisions${path}`, { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", "X-Workspace-Id": workspaceId }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "操作未完成，请重试");
  return result as T;
}
function restoredFacts(decision: Decision, data: WorkspaceData): CarFacts {
  const facts = carFactsSchema.parse(JSON.parse(decision.factsJson));
  const sources = data.workspace.assets.map((a) => facts.sources.find((s) => s.assetId === a.id) ?? { assetId: a.id, amountMinor: a.currentValueMinor, availableMonth: a.liquidityLevel === "T0" ? data.asOfMonth : null, use: false });
  return { ...facts, sources };
}
function initialFacts(data: WorkspaceData, intent: string): CarFacts {
  const profile = data.workspace.profile;
  return carFactsSchema.parse({ purpose: intent,
    monthlyIncomeMinor: profile ? (BigInt(profile.stableMonthlyIncomeMinor) + BigInt(profile.otherMonthlyIncomeMinor)).toString() : null,
    livingExpensesMinor: profile ? (BigInt(profile.rentExpenseMinor) + BigInt(profile.transportExpenseMinor) + BigInt(profile.essentialExpenseMinor)).toString() : null,
    sources: data.workspace.assets.map((a) => ({ assetId: a.id, amountMinor: a.currentValueMinor, availableMonth: a.liquidityLevel === "T0" ? data.asOfMonth : null, use: false })),
  });
}

export function CarPlanningView({ workspaceId, initialIntent = "", decisionId, onOpenDetails, onEditLedger, onDataChange, onViewExecution }: { workspaceId: string; initialIntent?: string; decisionId?: string; onOpenDetails?: () => void; onEditLedger?: () => void; onDataChange: () => Promise<void>; onViewExecution: () => void }) {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [facts, setFacts] = useState<CarFacts>(carFactsSchema.parse({}));
  const [evaluation, setEvaluation] = useState<CarEvaluation | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [stage, setStage] = useState<"facts" | "compare" | "review">("facts");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<CarScenario | null>(null);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [actualFunding, setActualFunding] = useState<string | null>(null);
  const draftVersion = useRef(0);
  const draftKey = useRef("");
  const draftChain = useRef(Promise.resolve());
  const [choiceAsset, setChoiceAsset] = useState("");
  const [choiceReason, setChoiceReason] = useState("");
  const [choiceCategory, setChoiceCategory] = useState("");
  const [manualChecks, setManualChecks] = useState<string[]>([]);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [card, setCard] = useState<CarStep | null>(null);
  

  function selectDecision(next: Decision | null, loaded: WorkspaceData) {
    setDecision(next); setFacts(next ? restoredFacts(next, loaded) : initialFacts(loaded, initialIntent));
    setEvaluation(next?.evaluationJson ? JSON.parse(next.evaluationJson) : null); setReview(null); setStage(next?.status === "PURCHASED" ? "review" : next?.viewStage ?? "facts"); setDirty(false); setCard(null);
  }
  useEffect(() => {
    let cancelled = false;
    api<WorkspaceData>(workspaceId).then(async (initial) => {
      let loaded = initial;
      if (!loaded.decisions.length) {
        await api(workspaceId, "/resume", { intent: initialIntent || "我想买车" });
        loaded = await api<WorkspaceData>(workspaceId);
      }
      if (cancelled) return;
      setData(loaded);
      const remembered = localStorage.getItem(`car-current:${workspaceId}`);
      const next = loaded.decisions.find((d) => d.id === (decisionId ?? remembered)) ?? loaded.decisions.find((d) => d.status !== "PURCHASED") ?? loaded.decisions[0] ?? null;
      setDecision(next); setFacts(next ? restoredFacts(next, loaded) : initialFacts(loaded, initialIntent));
      setEvaluation(next?.evaluationJson ? JSON.parse(next.evaluationJson) : null);
      setStage(next?.status === "PURCHASED" ? "review" : next?.viewStage ?? "facts");
      if (next) {
        localStorage.setItem(`car-current:${workspaceId}`, next.id);
        try { const stored = await readBusinessDraft(workspaceId, "CAR_FACTS", next.id); draftVersion.current = stored?.version ?? 0; draftKey.current = next.id; const cached = stored ? JSON.parse(stored.dataJson) : null;
          if (stored?.sourceSignature === String(next.version) && cached?.version === next.version) { setFacts(carFactsSchema.parse(cached.facts)); setDirty(true); setStage(cached.stage ?? "facts"); if (cached.stage === "review" && cached.asOfMonth === loaded.asOfMonth) { setActualFunding(cached.actualFunding ?? null); setReviewNote(cached.reviewNote ?? ""); setReviewConfirmed(false); } }
        } catch { setNotice("草稿恢复未完成，当前显示已保存资料。"); }
      }
    }).catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [workspaceId, initialIntent, decisionId]);

  useEffect(() => {
    if (!decision || !data || !dirty) return;
    const timer = window.setTimeout(() => { draftChain.current = draftChain.current.then(async () => {
      if (draftKey.current !== decision.id) { const old = await readBusinessDraft(workspaceId, "CAR_FACTS", decision.id); draftVersion.current = old?.version ?? 0; draftKey.current = decision.id; }
      const saved = await writeBusinessDraft(workspaceId, "CAR_FACTS", decision.id, draftVersion.current, String(decision.version), { version: decision.version, facts, stage, asOfMonth: data.asOfMonth, actualFunding, reviewNote }); draftVersion.current = saved.version;
    }).catch((e) => setError(e.message)); }, 600);
    return () => clearTimeout(timer);
  }, [workspaceId, decision, data, dirty, facts, stage, actualFunding, reviewNote]);

  async function refresh(id?: string) {
    const loaded = await api<WorkspaceData>(workspaceId); setData(loaded);
    const next = loaded.decisions.find((d) => d.id === (id ?? decision?.id)) ?? null;
    setDecision(next); return { loaded, next };
  }
  function change(patch: Partial<CarFacts>) {
    if (card === null && data) setCard(carWorkflow(facts, data.workspace.liabilities.reduce((sum, l) => sum + BigInt(l.monthlyPaymentMinor), 0n).toString()).step);
    const next = { ...facts, ...patch, ...invalidateCarConfirmations(facts, patch) };
    setFacts(next); setDirty(true); setSelected(null);
  }
  function navigate(next: typeof stage) {
    setStage(next);
  }
  async function run(work: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : "操作未完成"); } finally { setBusy(false); }
  }
  async function save(): Promise<{ id: string; version: number }> {
    if (!data) throw new Error("资料尚未加载");
    const parsed = carFactsSchema.parse(facts);
    const saved = await api<Decision>(workspaceId, "", { ...(decision ? { id: decision.id, expectedVersion: decision.version } : {}), expectedRevision: data.workspace.portfolioRevision, facts: parsed, viewStage: stage });
    localStorage.setItem(`car-current:${workspaceId}`, saved.id);
    const { next } = await refresh(saved.id); setFacts(parsed); setDirty(false); setReview(null);
    return next ?? saved;
  }
  function calculate(event?: FormEvent) {
    event?.preventDefault();
    void run(async () => { const saved = await save(); const result = await api<CarEvaluation>(workspaceId, `/${saved.id}/evaluate`, { expectedVersion: saved.version }); setEvaluation(result); setStage("compare"); await refresh(saved.id); });
  }
  function ask() {
    if (!message.trim()) return;
    void run(async () => { const saved = await save(); const response = await api<{ facts: CarFacts; mode: string }>(workspaceId, `/${saved.id}/guidance`, { expectedVersion: saved.version, content: message.trim() }); setFacts(response.facts); setMessage(""); setEvaluation(null); await refresh(saved.id); if (response.mode === "FALLBACK") setNotice("当前使用资料引导；你仍可填写资料并完成计算。"); });
  }
  function adopt() {
    if (!decision || !selected) return;
    void run(async () => {
      await api(workspaceId, `/${decision.id}/adopt`, { expectedVersion: decision.version, scenarioKey: selected.key, reason: choiceReason || undefined, reasons: choiceCategory || choiceReason ? [{ category: choiceCategory || "OTHER", userText: choiceReason || null, assetId: choiceCategory === "KEEP_ASSET" ? choiceAsset : null }] : [], manualChecks, ...(review ? { reviewId: review.id } : {}) });
      const { loaded, next } = await refresh(); selectDecision(next, loaded); setSelected(null); setNotice("方案已生效，资金用途和行动已保存。"); await onDataChange();
    });
  }
  function beginReview() {
    void run(async () => {
      const { loaded, next } = await refresh();
      if (!next?.activePlanId) throw new Error("请先采纳一个方案");
      const latest = next.reviews.find((r) => r.month === loaded.asOfMonth);
      const base = carFactsSchema.parse(JSON.parse(latest?.factsJson ?? next.factsJson));
      const sources = loaded.workspace.assets.map((a) => { const old = base.sources.find((s) => s.assetId === a.id); return { assetId: a.id, amountMinor: a.currentValueMinor, availableMonth: old?.availableMonth ?? loaded.asOfMonth, use: old?.use ?? false }; });
      setFacts({ ...base, sources, cashflowConfirmed: false, sourcesConfirmed: false, cuts: base.cuts.map((c) => ({ ...c, accepted: false })) });
      setReview(latest ?? null); setActualFunding(null); setReviewConfirmed(false); setReviewNote(""); setStage("review"); setDirty(true);
    });
  }
  function submitReview(event: FormEvent) {
    event.preventDefault();
    if (!decision || !data || actualFunding === null || !reviewConfirmed) return;
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const balanceChecks = form.getAll("balanceCheck").map((value) => { const [entityType, entityId, amountMinor] = String(value).split(":"); return { entityType, entityId, amountMinor, confirmed: true }; });
    void run(async () => {
      const saved = await api<Review>(workspaceId, `/${decision.id}/reviews`, { expectedVersion: decision.version, expectedRevision: data.workspace.portfolioRevision, month: data.asOfMonth, facts: zodReviewFacts(facts), actualFundingMinor: actualFunding, note: reviewNote, balanceChecks });
      setReview(saved); setEvaluation((JSON.parse(saved.resultJson) as ReviewResult).evaluation); setDirty(false); await refresh(); await onDataChange(); setNotice("复盘已保存。调整建议须经你确认后生效。");
    });
  }
  if (!data) return <div className="car-planning"><p role={error ? "alert" : "status"}>{error || "正在读取买车决策资料…"}</p><button className="button-secondary" onClick={() => void run(async () => { const loaded = await api<WorkspaceData>(workspaceId); setData(loaded); selectDecision(loaded.decisions[0] ?? null, loaded); })}>重新读取</button></div>;
  const debt = data.workspace.liabilities.reduce((sum, l) => sum + BigInt(l.monthlyPaymentMinor), 0n).toString();
  const workflow = carWorkflow(facts, debt, evaluation?.missing ?? []);
  const currentCard = card ?? workflow.step;
  const active = decision?.plans.find((p) => p.id === decision.activePlanId);
  const activeScenario: CarScenario | null = active ? JSON.parse(active.snapshotJson).scenario ?? null : null;
  const conversation = decision ? JSON.parse(decision.conversationJson) as { role: string; content: string }[] : [];
  const stale = evaluation && (evaluation.portfolioRevision !== data.workspace.portfolioRevision || evaluation.transactionRevision !== data.workspace.transactionRevision || evaluation.asOfMonth !== data.asOfMonth);
  const adoptedComparison = Boolean(active && evaluation && evaluation.portfolioRevision + 1 === active.sourceRevision && data.workspace.portfolioRevision === active.sourceRevision && evaluation.asOfMonth === data.asOfMonth);
  const reviewResult = review ? JSON.parse(review.resultJson) as ReviewResult : null;
  const purchased = decision?.status === "PURCHASED";
  const actualPurchase: { actualPriceMinor: string; purchasedMonth: string; loan: unknown } | null = purchased && decision?.purchaseJson ? JSON.parse(decision.purchaseJson) : null;

  return <section className="car-planning" aria-label="买车决策与月度维护">
    <header className="car-intro"><div><h2>这辆车，怎样买才从容？</h2><p>从你的生活和现有资金出发，把预算、资金来源与每月承担一起算清。</p></div><button className="button-secondary" disabled={busy} onClick={() => void run(async () => { const { loaded, next } = await refresh(); selectDecision(next, loaded); setNotice("已读取最新资料，请重新核对。"); })}>读取最新资料</button></header>
    <div className="car-buttons">{onOpenDetails && <button type="button" className="button-secondary" disabled={busy} onClick={() => void run(async () => { if (dirty) await save(); onOpenDetails(); })}>打开买车详情</button>}{onEditLedger && <button type="button" className="button-secondary" disabled={busy} onClick={onEditLedger}>核对真实资产与负债</button>}</div>
    {error && <p className="car-alert" role="alert"><AlertTriangle size={16} />{error}</p>}
    {notice && <p className="car-notice" role="status"><Check size={16} />{notice}</p>}
    {data.decisions.length > 0 && <label className="car-record-picker">决策记录<select disabled={busy} value={decision?.id ?? ""} onChange={(e) => { if (e.target.value) localStorage.setItem(`car-current:${workspaceId}`, e.target.value); selectDecision(data.decisions.find((d) => d.id === e.target.value) ?? null, data); }}><option value="">新建草稿</option>{data.decisions.map((d) => <option key={d.id} value={d.id}>{JSON.parse(d.factsJson).purpose || "买车"} · {d.status === "ACTIVE" ? "执行中" : d.status === "PURCHASED" ? "已购车" : "草稿"}</option>)}</select></label>}
    {activeScenario && <div className="car-active"><div><span>{purchased ? "已购车，继续维护支出" : `当前生效方案 · 第 ${active!.version} 版`}</span><strong>{methodName[actualPurchase ? (actualPurchase.loan ? "LOAN" : "CASH") : activeScenario.method]} · {money(actualPurchase?.actualPriceMinor ?? activeScenario.budgetMinor)}车价 · {actualPurchase?.purchasedMonth ?? activeScenario.purchaseMonth}</strong><p>{purchased ? "已按确认的实际成交数据更新底账。" : active!.reason}</p></div><div className="car-buttons"><button className="button-secondary" disabled={busy} onClick={beginReview}>本月复盘</button><button className="button-secondary" onClick={onViewExecution}>查看行动</button>{!purchased && <button className="button-primary" disabled={busy} onClick={() => setPurchaseOpen(true)}>确认实际购车</button>}</div></div>}
    <nav className="car-steps" aria-label="买车决策步骤">{([['facts', '确认资料'], ['compare', '比较方案'], ['review', '月度复盘']] as const).map(([key, label]) => <button type="button" key={key} aria-current={stage === key ? "step" : undefined} disabled={busy || (key === "review" && !active) || (purchased && key !== "review")} onClick={() => key === "review" ? beginReview() : navigate(key)}>{label}</button>)}</nav>
    <fieldset disabled={busy} className="car-body">
      {stage === "facts" && <>
        <div className="car-guide"><h3>先说说你的想法</h3><p>预算还不清楚也没关系。我们先确认时间和资金，再反推范围。</p>{conversation.slice(-6).map((m, i) => <p key={i} className={m.role === "USER" ? "car-user-message" : "car-agent-message"}><strong>{m.role === "USER" ? "你" : "资产总管家"}</strong>{m.content}</p>)}<div className="car-composer"><textarea aria-label="与总管家讨论买车" value={message} maxLength={2000} onChange={(e) => setMessage(e.target.value)} placeholder="例如：我想明年买车，不知道能承担多少预算" /><button className="button-primary" disabled={!message.trim()} onClick={ask}><Send size={15} />发送</button></div></div>
        <div className="car-progress" aria-label="当前判断与下一步"><h3>{carStepLabels[workflow.step]}</h3><p>已读取 {data.workspace.assets.length} 笔资产和 {data.workspace.liabilities.length} 笔负债。预算{facts.budgetMinor === null ? "暂未确定，可继续" : `意向 ${money(facts.budgetMinor)}`}。</p>{workflow.partialBalanceMinor !== null && <p><strong>当前现金流初步余量 {money(workflow.partialBalanceMinor)}</strong><br />{workflow.partialLabel}</p>}{workflow.questions.map((q) => <p key={q}>{q}</p>)}<p>{workflow.outcome}</p><details><summary>采纳前还需要什么</summary>{workflow.beforeAdoption.map((q) => <p key={q}>{q}</p>)}{workflow.notRelevant.map((q) => <p key={q}>{q}</p>)}</details></div>
        <div className="car-step-options" aria-label="资料确认卡">{Object.entries(carStepLabels).filter(([k]) => k !== "ready").map(([k, label]) => <button type="button" key={k} aria-pressed={currentCard === k} onClick={() => setCard(k as CarStep)}>{label}</button>)}</div>
        <form onSubmit={calculate}><ProgressiveFacts step={currentCard} facts={facts} onChange={change} data={data} ownGoalId={decision?.goalId ?? null} />
          <div className="car-form-footer"><span>{dirty ? "当前修改保存为待确认草稿；继续时确认资料。" : "已保存，可随时继续。"}</span><div className="car-buttons"><button type="button" className="button-secondary" onClick={() => void run(async () => { await save(); setEvaluation(null); setCard(null); setNotice("已保存，将继续处理下一项必要信息。"); })}>保存并继续</button><button className="button-primary">{workflow.step === "ready" ? "比较预算与方案" : "查看当前判断"}<ArrowRight size={16} /></button></div></div>
          <details className="car-section"><summary>查看或修改全部资料</summary><FactsForm facts={facts} onChange={change} data={data} ownGoalId={decision?.goalId ?? null} /></details>
        </form>
        {decision && <PlanningPreferences workspaceId={workspaceId} decisionId={decision.id} refreshKey={decision.version} disabled={dirty} onChange={async () => { const { loaded, next } = await refresh(); selectDecision(next, loaded); }} />}

      </>}
      {stage === "compare" && <>
        {dirty && <p className="car-alert">资料已修改，请重新计算后再采纳。</p>}
        {stale && <p className={adoptedComparison ? "car-readonly" : "car-alert"}>{adoptedComparison ? "以下是采纳时的方案比较。你的选择已生效；如要调整，请修改资料后重新计算。" : "这份比较已过期。生效方案仍保留；请核对变化后重新计算或复盘。"}</p>}
        {!evaluation ? <div className="car-empty"><h3>{workflow.step === "ready" ? "资料已保留，可以重新比较" : "继续核对影响决策的信息"}</h3><p>{workflow.step === "ready" ? "偏好或资料更新后需要重新计算。当前已生效方案继续保留。" : workflow.questions.join(" ")}</p><button className="button-primary" onClick={() => workflow.step === "ready" ? calculate() : navigate("facts")}>{workflow.step === "ready" ? "重新计算方案" : "继续确认资料"}</button></div> : <CarComparison selectedKey={adoptedComparison ? activeScenario?.key : undefined} evaluation={evaluation} budgetKnown={facts.budgetMinor !== null} disabled={Boolean(dirty || stale)} onChoose={setSelected} onBudget={(value) => { change({ budgetMinor: value }); setStage("facts"); setNotice("已填入意向车价，请重新计算完整方案。"); }} />}
        {evaluation?.missing.length ? <button className="button-primary" onClick={() => setStage("facts")}>补充缺失资料</button> : null}
      </>}
      {stage === "review" && active && <>
        <div className="car-guide"><h3>{data.asOfMonth} 月度复盘</h3><Link href="/?view=data-management">查看并逐项核对本方案的关键假设</Link><p>先更新底账，再确认本月实际收入、支出和可用资金。实际支出已经包含消费削减，不会再次加算节省。{purchased ? "生活支出填写不含养车、债务及保费的实际金额。" : "奖金未到账时，更新预计到账月份。"}</p></div>
        <form onSubmit={submitReview}><section className="car-section"><h3>第一步：核对当前账户余额</h3><p>各账户真实余额变化请先在底账更新，然后逐项确认；未核对的记录保持待核实。</p>{[...data.workspace.assets.filter((a) => facts.sources.some((s) => s.assetId === a.id && s.use)).map((a) => ({ id: a.id, name: a.name, entityType: "ASSET", amount: a.currentValueMinor })), ...data.workspace.liabilities.map((a) => ({ id: a.id, name: a.name, entityType: "LIABILITY", amount: String((a as typeof a & { outstandingBalanceMinor: string }).outstandingBalanceMinor ?? "0") }))].map((a) => <label className="car-check" key={a.id}><input type="checkbox" name="balanceCheck" value={`${a.entityType}:${a.id}:${a.amount}`} required /> 确认{a.name}当前余额 {money(a.amount)}</label>)}</section><FactsForm facts={facts} onChange={change} data={data} ownGoalId={decision?.goalId ?? null} review purchased={purchased} />
          <div className="car-section"><div className="car-fields"><MoneyField label={purchased ? "本月可自由调配现金（扣除储备和其他目标）" : "实际可用于买车的现金（扣除储备和其他目标）"} value={actualFunding} onChange={setActualFunding} required /><label>变化说明<textarea value={reviewNote} maxLength={1000} onChange={(e) => setReviewNote(e.target.value)} placeholder="例如：奖金延期，或实际消费没有减少" /></label></div><CheckField checked={reviewConfirmed} onChange={setReviewConfirmed}>已核对实际余额和收支；未来收入按本月情况持续估算。</CheckField><button className="button-primary" disabled={!reviewConfirmed || actualFunding === null}>保存复盘并检查影响</button></div></form>
        {reviewResult && <div className="car-review-result"><h3>{reviewResult.needsAdjustment ? "计划受到影响，需要处理" : "当前资料仍支持计划，继续执行"}</h3><p>已确认可调配现金 {money(reviewResult.actualFundingMinor)}{reviewResult.afterPurchaseBalanceMinor === null ? `，原计划本月可用资金 ${money(reviewResult.expectedFundingMinor)}` : `，实际每月结余 ${money(reviewResult.afterPurchaseBalanceMinor)}`}。</p>{reviewResult.budgetComparison && <p>本月适用生活预算 {money(reviewResult.budgetComparison.livingMinor)}；{reviewResult.budgetComparison.missing.join("；")}</p>}{reviewResult.impacts.map((impact) => <p key={impact} className="car-risk">{impact}</p>)}{reviewResult.keyAssumptions && <details><summary>逐项核对方案关键假设</summary>{reviewResult.keyAssumptions.map((a) => <p key={a.id}>{a.label}：{a.status === "CHANGED" ? "已变化" : a.status === "PENDING" ? "待核实" : "用户确认"} · {a.evidence}</p>)}</details>}{reviewResult.unexecutedCuts.length > 0 && <p>未执行的消费调整：{reviewResult.unexecutedCuts.join("、")}</p>}{reviewResult.note && <p>{reviewResult.note}</p>}{!purchased && <CarComparison evaluation={reviewResult.evaluation} budgetKnown={facts.budgetMinor !== null} disabled={dirty || Boolean(review?.adoptedPlanId)} onChoose={setSelected} onBudget={(value) => change({ budgetMinor: value })} />}</div>}
      </>}
    </fieldset>
    {busy && <p className="car-working" role="status"><LoaderCircle size={16} className="animate-spin" />正在保存或计算，请稍候…</p>}
    {decision && <details className="car-history"><summary>方案与复盘历史 <ChevronDown size={15} /></summary>{decision.plans.map((p) => <article key={p.id}><strong>方案第 {p.version} 版{p.id === decision.activePlanId ? " · 当前生效" : ""}</strong><p>{p.reason}</p><p>{new Date(p.adoptedAt).toLocaleString("zh-CN")}</p></article>)}{decision.reviews.map((r) => <article key={r.id}><strong>{r.month}复盘{r.adoptedPlanId ? " · 已采用调整" : ""}</strong><p>{(JSON.parse(r.resultJson) as ReviewResult).impacts.join("；") || "计划未受到实质影响"}</p><p>{(JSON.parse(r.resultJson) as ReviewResult).note}</p></article>)}</details>}

    {selected && <AdoptionDialog scenario={selected} facts={facts} evaluation={reviewResult?.evaluation ?? evaluation} busy={busy} onClose={() => setSelected(null)} onConfirm={adopt}><section className="car-section"><h3>选择理由，可选</h3><label>我更重视<select value={choiceCategory} onChange={(e) => setChoiceCategory(e.target.value)}><option value="">暂不说明</option><option value="KEEP_ASSET">保留指定资产</option><option value="KEEP_SPENDING">保留生活消费</option><option value="AVOID_DEBT">避免负债</option><option value="TIME_FIRST">时间优先</option><option value="AMOUNT_FIRST">金额优先</option><option value="OTHER">其他</option></select></label>{choiceCategory === "KEEP_ASSET" && <label>保留的资产<select value={choiceAsset} onChange={(e) => setChoiceAsset(e.target.value)} required><option value="">请选择</option>{data.workspace.assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}<label>补充原话<input value={choiceReason} onChange={(e) => setChoiceReason(e.target.value)} maxLength={400} /></label>{evaluation?.redLineChecks?.filter((c) => c.candidateKey === selected.key && c.result === "SKIPPED_MANUAL").map((c) => <CheckField key={c.constraintId} checked={manualChecks.includes(c.constraintId)} onChange={(checked) => setManualChecks((old) => checked ? [...old, c.constraintId] : old.filter((id) => id !== c.constraintId))}>明确确认人工红线：{c.detail.text}</CheckField>)}</section></AdoptionDialog>}
    {purchaseOpen && decision && <PurchaseDialog onPreview={(values) => api<PurchasePreview>(workspaceId, `/${decision.id}/purchase-preview`, { ...values, expectedVersion: decision.version, expectedRevision: data.workspace.portfolioRevision, purchasedMonth: data.asOfMonth })} facts={facts} decision={decision} data={data} busy={busy} onClose={() => setPurchaseOpen(false)} onConfirm={(values) => void run(async () => { await api(workspaceId, `/${decision.id}/purchase`, { ...values, expectedVersion: decision.version, expectedRevision: data.workspace.portfolioRevision, purchasedMonth: data.asOfMonth }); const { loaded, next } = await refresh(); selectDecision(next, loaded); setPurchaseOpen(false); await onDataChange(); setNotice("已记录实际购车、资金变动和贷款，筹资任务已结束。"); })} />}
  </section>;
}

function ProgressiveFacts({ step, facts, onChange, data, ownGoalId }: { step: CarStep; facts: CarFacts; onChange: (patch: Partial<CarFacts>) => void; data: WorkspaceData; ownGoalId: string | null }) {
  if (step === "ready") return <div className="car-section"><h3>现在可以比较方案</h3><p>预算仍可为空。先看承受上限，再选择能满足用车需要的价格。</p><FactsForm facts={facts} onChange={onChange} data={data} ownGoalId={ownGoalId} only="loan" /><FactsForm facts={facts} onChange={onChange} data={data} ownGoalId={ownGoalId} only="cuts" /></div>;
  if (step === "sources") return <FactsForm facts={facts} onChange={onChange} data={data} ownGoalId={ownGoalId} only="sources" />;
  if (step === "goal") return <div className="car-section"><h3>先明确这次想解决什么</h3><label>买车的用途与必要性<textarea value={facts.purpose} onChange={(e) => onChange({ purpose: e.target.value })} maxLength={400} /></label><div className="car-fields"><MonthField label="期望购车月份" min={data.asOfMonth} max={addMonths(data.asOfMonth, 60)} value={facts.targetMonth} onChange={(targetMonth) => onChange({ targetMonth })} /><MoneyField label="意向车价（可留空）" value={facts.budgetMinor} onChange={(budgetMinor) => onChange({ budgetMinor })} /></div></div>;
  if (step === "cashflow") return <div className="car-section"><h3>核对已读取的收支</h3><div className="car-fields"><MoneyField label="可持续月收入" value={facts.monthlyIncomeMinor} onChange={(monthlyIncomeMinor) => onChange({ monthlyIncomeMinor })} /><MoneyField label="生活月支出（不含债务、保费）" value={facts.livingExpensesMinor} onChange={(livingExpensesMinor) => onChange({ livingExpensesMinor })} /></div><p className="car-readonly">底账现有月还款 {money(data.workspace.liabilities.reduce((n, l) => n + BigInt(l.monthlyPaymentMinor), 0n).toString())}，会另行扣除。</p><CheckField checked={facts.cashflowConfirmed} onChange={(cashflowConfirmed) => onChange({ cashflowConfirmed })}>已核对收入、生活支出和债务口径；默认零值也已确认。</CheckField></div>;
  if (step === "costs") return <div className="car-section"><h3>买车会增加哪些费用</h3><div className="car-fields"><MoneyField label="税费、上牌等落地费用" value={facts.landingFeesMinor} onChange={(landingFeesMinor) => onChange({ landingFeesMinor })} /><MoneyField label="每月养车费（含年度车险预留）" value={facts.runningMonthlyMinor} onChange={(runningMonthlyMinor) => onChange({ runningMonthlyMinor })} /><MoneyField label="替代的原交通月支出" value={facts.replacedTransportMinor} onChange={(replacedTransportMinor) => onChange({ replacedTransportMinor })} /><MoneyField label="现有保费及年度费用月均预留" value={facts.monthlyPremiumMinor} onChange={(monthlyPremiumMinor) => onChange({ monthlyPremiumMinor })} /></div><label>保障已知信息或待了解事项<textarea value={facts.coverageNotes} onChange={(e) => onChange({ coverageNotes: e.target.value })} placeholder="不清楚可以注明，不据此判断保障充分" /></label><CheckField checked={facts.costsConfirmed} onChange={(costsConfirmed) => onChange({ costsConfirmed })}>已核对购车、养车及交通替代费用。</CheckField><CheckField checked={facts.insuranceConfirmed} onChange={(insuranceConfirmed) => onChange({ insuranceConfirmed })}>已核对保费承诺；未知保障内容已注明。</CheckField></div>;
  return <div className="car-section"><h3>为生活与其他目标留出空间</h3><div className="car-fields"><MoneyField label="应急储备底线" value={facts.reserveFloorMinor} onChange={(reserveFloorMinor) => onChange({ reserveFloorMinor })} /><label>最多愿意延期（月）<input type="number" min={0} max={60} value={facts.maxDelayMonths} onChange={(e) => onChange({ maxDelayMonths: Number(e.target.value) })} /></label></div><CheckField checked={facts.constraintsConfirmed} onChange={(constraintsConfirmed) => onChange({ constraintsConfirmed })}>确认储备底线及本次资金使用边界。</CheckField><FactsForm facts={facts} onChange={onChange} data={data} ownGoalId={ownGoalId} only="boundaries" /></div>;
}

function FactsForm({ facts, onChange, data, ownGoalId, review = false, purchased = false, only }: { facts: CarFacts; onChange: (patch: Partial<CarFacts>) => void; data: WorkspaceData; ownGoalId: string | null; review?: boolean; purchased?: boolean; only?: "sources" | "boundaries" | "loan" | "cuts" }) {
  const updateSource = (id: string, patch: Partial<CarFacts["sources"][number]>) => onChange({ sources: facts.sources.map((s) => s.assetId === id ? { ...s, ...patch } : s) });
  const debt = data.workspace.liabilities.reduce((sum, l) => sum + BigInt(l.monthlyPaymentMinor), 0n).toString();
  const otherGoals = data.workspace.goals.filter((g) => g.id !== ownGoalId);
  return <>
    {!purchased && !only && <Section title="想买什么，什么时候买" description="车价与落地费用分开填写。只有明确接受的消费调整会进入方案。" open>
      <label>买车的用途与必要性<textarea value={facts.purpose} maxLength={400} onChange={(e) => onChange({ purpose: e.target.value })} /></label>
      <div className="car-fields"><MonthField label="期望购车月份" value={facts.targetMonth} min={data.asOfMonth} max={addMonths(data.asOfMonth, 60)} onChange={(targetMonth) => onChange({ targetMonth })} /><MoneyField label="意向车价（可留空）" value={facts.budgetMinor} onChange={(budgetMinor) => onChange({ budgetMinor })} /><label>最多愿意延期（月）<input type="number" min={0} max={60} value={facts.maxDelayMonths} onChange={(e) => onChange({ maxDelayMonths: Number(e.target.value) })} /></label><MoneyField label="税费、上牌等一次性落地费用" value={facts.landingFeesMinor} onChange={(landingFeesMinor) => onChange({ landingFeesMinor })} /></div>
    </Section>}
    {!only && <Section title={review ? "本月实际收支" : "每月承担与生活边界"} description="生活支出不含债务、保费和新增养车费。保费与年度费用按月预留；原有债务直接读取底账。" open>
      <div className="car-fields"><MoneyField label={review ? "实际月收入（未来按此估算）" : "可持续月收入（不含一次性奖金）"} value={facts.monthlyIncomeMinor} onChange={(monthlyIncomeMinor) => onChange({ monthlyIncomeMinor })} /><MoneyField label={review ? "实际生活支出（已反映消费削减）" : "当前生活月支出（含现有交通费）"} value={facts.livingExpensesMinor} onChange={(livingExpensesMinor) => onChange({ livingExpensesMinor })} /><MoneyField label="每月养车费（含年度车险预留）" value={facts.runningMonthlyMinor} onChange={(runningMonthlyMinor) => onChange({ runningMonthlyMinor })} />{!purchased && <MoneyField label="购车后可替代的原交通月支出" value={facts.replacedTransportMinor} onChange={(replacedTransportMinor) => onChange({ replacedTransportMinor })} />}<MoneyField label="现有保费及年度费用月均预留" value={facts.monthlyPremiumMinor} onChange={(monthlyPremiumMinor) => onChange({ monthlyPremiumMinor })} /><MoneyField label="随时可用的应急储备底线" value={facts.reserveFloorMinor} onChange={(reserveFloorMinor) => onChange({ reserveFloorMinor })} /></div>
      <p className="car-readonly">底账原有债务月还款 {money(debt)}，计算时另行扣除。请勿在生活支出中重复填写。</p>
      <label>已有保障情况与已知缺口<textarea value={facts.coverageNotes} maxLength={1000} onChange={(e) => onChange({ coverageNotes: e.target.value })} placeholder="可以填写已有保险或明确说明尚不清楚。确认资料不代表保障充分。" /></label>
      <CheckField checked={facts.cashflowConfirmed} onChange={(cashflowConfirmed) => onChange({ cashflowConfirmed })}>已核对收入、生活支出和底账债务，没有重复计算。</CheckField>
      <CheckField checked={facts.insuranceConfirmed} onChange={(insuranceConfirmed) => onChange({ insuranceConfirmed })}>已确认现有保费和保障资料；未知保障缺口已注明。</CheckField>
      <CheckField checked={facts.costsConfirmed} onChange={(costsConfirmed) => onChange({ costsConfirmed })}>已核对购车、养车和交通替代费用，没有重复计入。</CheckField>
      <CheckField checked={facts.constraintsConfirmed} onChange={(constraintsConfirmed) => onChange({ constraintsConfirmed })}>接受以上储备底线与资金使用边界。</CheckField>
    </Section>}
    {(!only || only === "sources") && <Section title="每笔钱从哪里来" description="勾选愿意纳入规划的资产，并包含用于维持应急储备的现金。未勾选的资产保留。请核对真实可用月份，系统不会按资产分类猜测到期日。" open>
      <div className="car-source-list">{data.workspace.assets.filter((asset) => BigInt(asset.currentValueMinor) > 0n || facts.sources.some((s) => s.assetId === asset.id && s.use)).map((asset) => {
        const source = facts.sources.find((s) => s.assetId === asset.id);
        const protectedAsset = Boolean(asset.goalId || !asset.isAdjustable || asset.currency !== "CNY");
        return <div className="car-source-row" key={asset.id}><div><CheckField checked={source?.use ?? false} disabled={protectedAsset || !source} onChange={(use) => updateSource(asset.id, { use })}>{asset.name}</CheckField><small>底账余额 {money(asset.currentValueMinor)}{protectedAsset ? " · 已受保护，不能用于买车" : ""}</small></div>{source && <><MoneyField label="纳入规划的金额" value={source.amountMinor} disabled={protectedAsset || !source.use} onChange={(amountMinor) => updateSource(asset.id, { amountMinor: amountMinor ?? "0" })} /><MonthField label="可用月份" value={source.availableMonth} disabled={protectedAsset || !source.use} onChange={(availableMonth) => updateSource(asset.id, { availableMonth })} /></>}</div>;
      })}</div>{!data.workspace.assets.length && <p>还没有资产记录。可以先保存草稿，再到首页录入真实资产。</p>}
      {!purchased && <><h4>未来奖金或其他一次性收入</h4><p className="car-hint">已经到账并记录在资产中的钱，不要在这里再加一次。</p>{facts.bonuses.map((b, i) => <div className="car-source-row" key={b.id}><label>来源名称<input value={b.name} maxLength={80} onChange={(e) => onChange({ bonuses: facts.bonuses.map((v, j) => j === i ? { ...v, name: e.target.value } : v) })} /></label><MoneyField label="金额" value={b.amountMinor} onChange={(amountMinor) => onChange({ bonuses: facts.bonuses.map((v, j) => j === i ? { ...v, amountMinor: amountMinor ?? "0" } : v) })} /><MonthField label="预计到账月" value={b.month} onChange={(month) => onChange({ bonuses: facts.bonuses.map((v, j) => j === i ? { ...v, month: month ?? b.month } : v) })} /><CheckField checked={b.confirmed} onChange={(confirmed) => onChange({ bonuses: facts.bonuses.map((v, j) => j === i ? { ...v, confirmed } : v) })}>确认纳入</CheckField><button type="button" className="icon-button" aria-label={`删除${b.name}`} onClick={() => onChange({ bonuses: facts.bonuses.filter((_, j) => j !== i) })}><Trash2 size={16} /></button></div>)}<button type="button" className="button-secondary" onClick={() => onChange({ bonuses: [...facts.bonuses, { id: crypto.randomUUID(), name: "待确认奖金", amountMinor: "0", month: addMonths(data.asOfMonth, 1), confirmed: false }] })}><Plus size={15} />添加未来收入</button></>}
      <CheckField checked={facts.sourcesConfirmed} onChange={(sourcesConfirmed) => onChange({ sourcesConfirmed })}>已核对当前余额和各笔可用时间，未来收入未重复计入资产或月收入。</CheckField>
    </Section>}
    {(!only || only === "boundaries") && <Section title="其他目标的钱要保留" description="关联目标的资产直接保护。请确认目标的“已准备金额”是否包含这些资产，以免重复占款。">
      {otherGoals.map((goal) => <div className="car-goal-row" key={goal.id}><p><strong>{goal.name}</strong> · 已准备 {money(goal.preparedAmountMinor)} · 月投入 {money(goal.monthlyContributionMinor)}</p>{BigInt(goal.preparedAmountMinor) > 0n && <label>已准备金额与关联资产的关系<select value={facts.goalReconciliations.find((r) => r.goalId === goal.id)?.preparedIncludesLinked.toString() ?? ""} onChange={(e) => onChange({ goalReconciliations: [...facts.goalReconciliations.filter((r) => r.goalId !== goal.id), { goalId: goal.id, preparedIncludesLinked: e.target.value === "true" }] })}><option value="" disabled>请选择</option><option value="true">已包含关联资产，重叠部分只算一次</option><option value="false">是关联资产之外的额外准备</option></select></label>}</div>)}{!otherGoals.length && <p>目前没有其他目标。请确认是否还有尚未记录的资金承诺。</p>}<CheckField checked={facts.otherGoalsConfirmed} onChange={(otherGoalsConfirmed) => onChange({ otherGoalsConfirmed })}>已核对其他目标的准备资金和月投入，没有遗漏的固定承诺。</CheckField>
    </Section>}
    {(!only || only === "cuts") && <Section title={review ? "哪些消费调整实际执行了" : "可选择的消费取舍"} description={review ? "勾选仅记录执行情况；实际生活支出已包含这些节省，不会再加一次。" : "从餐饮外卖、购物订阅、娱乐出行中选择愿意减少的项目，写清生活影响。系统只计入你接受的金额。"}>
      {facts.cuts.map((c, i) => <div className="car-cut-row" key={c.id}><label>调整项目<input value={c.name} maxLength={80} onChange={(e) => onChange({ cuts: facts.cuts.map((v, j) => j === i ? { ...v, name: e.target.value } : v) })} /></label><MoneyField label="每月减少" value={c.amountMinor} onChange={(amountMinor) => onChange({ cuts: facts.cuts.map((v, j) => j === i ? { ...v, amountMinor: amountMinor ?? "0" } : v) })} /><label>对生活的影响<input value={c.impact} maxLength={240} onChange={(e) => onChange({ cuts: facts.cuts.map((v, j) => j === i ? { ...v, impact: e.target.value } : v) })} /></label><CheckField checked={c.accepted} onChange={(accepted) => onChange({ cuts: facts.cuts.map((v, j) => j === i ? { ...v, accepted } : v) })}>{review ? "实际执行" : "接受调整"}</CheckField><button type="button" className="icon-button" aria-label={`删除${c.name}`} onClick={() => onChange({ cuts: facts.cuts.filter((_, j) => j !== i) })}><Trash2 size={16} /></button></div>)}<div className="car-buttons">{["减少非必要外卖", "清理闲置订阅", "调整娱乐频次"].map((name) => <button type="button" className="button-secondary" key={name} onClick={() => onChange({ cuts: [...facts.cuts, { id: crypto.randomUUID(), name, amountMinor: "0", impact: "", accepted: false }] })}><Plus size={14} />{name}</button>)}</div>
    </Section>}
    {!purchased && (!only || only === "loan") && <Section title="贷款报价（可选）" description="使用名义年利率和月还款方式；不支持把平息费率或含费用的综合年化率直接当作名义利率。">
      <CheckField checked={facts.loan !== null} onChange={(enabled) => onChange({ loan: enabled ? { ...blankLoan } : null })}>同时比较贷款买车</CheckField>{facts.loan && <LoanFields loan={facts.loan} onChange={(loan) => onChange({ loan })} />}
    </Section>}
  </>;
}

function LoanFields({ loan, onChange }: { loan: NonNullable<CarFacts["loan"]>; onChange: (loan: NonNullable<CarFacts["loan"]>) => void }) {
  return <><div className="car-fields"><label>名义年利率（%）<input type="number" min={0} max={99} step="0.000001" value={loan.annualRatePercent} onChange={(e) => onChange({ ...loan, annualRatePercent: e.target.value })} /></label><label>期数（月）<input type="number" min={1} max={84} value={loan.termMonths} onChange={(e) => onChange({ ...loan, termMonths: Number(e.target.value) })} /></label><label>车价首付比例（%）<input type="number" min={0} max={100} step="0.01" value={loan.downPaymentPercent} onChange={(e) => onChange({ ...loan, downPaymentPercent: Number(e.target.value) })} /></label><MoneyField label="报价允许的最高贷款本金" value={loan.maxPrincipalMinor} onChange={(value) => onChange({ ...loan, maxPrincipalMinor: value ?? "0" })} /><MoneyField label="一次性贷款费用（不含落地费用）" value={loan.feeMinor} onChange={(value) => onChange({ ...loan, feeMinor: value ?? "0" })} /><label>还款方式<select value={loan.method} onChange={(e) => onChange({ ...loan, method: e.target.value as typeof loan.method })}><option value="EQUAL_PAYMENT">等额本息</option><option value="EQUAL_PRINCIPAL">等额本金</option></select></label></div><CheckField checked={loan.quoted} onChange={(quoted) => onChange({ ...loan, quoted })}>以上来自已取得的报价；未确认时只用于假设试算。</CheckField></>;
}

export function CarComparison({ selectedKey, evaluation, budgetKnown, disabled, onChoose, onBudget }: { selectedKey?: string; evaluation: CarEvaluation; budgetKnown: boolean; disabled: boolean; onChoose: (s: CarScenario) => void; onBudget: (value: string) => void }) {
  return <div className="car-comparison">
    {evaluation.missing.length > 0 && <div className="car-missing"><h3>还需要确认这些信息</h3><ul>{evaluation.missing.map((m) => <li key={m}>{m}</li>)}</ul></div>}
    {evaluation.preferenceEvidence?.filter((m) => m.status === "ACTIVE" && m.evidenceType === "EXPRESSION").map((m) => <p key={m.id} className="car-hint">{m.nature === "HARD" ? "已确认约束" : "本次参考偏好（不排除方案）"}：{m.content}</p>)}
    {evaluation.recommendationReason && <p className="car-readonly">{evaluation.recommendationReason}</p>}
    {evaluation.budgetRanges.length > 0 && <div className="car-budget-range"><h3>在已确认条件下，车价上限</h3><p>这是承受边界。较低预算可以保留更多余量。</p><div>{evaluation.budgetRanges.map((r) => <article key={r.method}><span>{methodName[r.method]}</span><strong>{money(r.maxBudgetMinor)}</strong>{!budgetKnown && BigInt(r.maxBudgetMinor) > 0n && <button type="button" className="button-secondary" onClick={() => onBudget(r.maxBudgetMinor)}>用此预算继续比较</button>}</article>)}</div></div>}
    {budgetKnown && evaluation.scenarios.length > 0 && <div className="car-scenarios">{evaluation.scenarios.map((s) => <article key={s.key} className={`car-scenario ${s.key === (selectedKey ?? evaluation.recommendedKey) ? "car-recommended" : ""}`}><header><h3>{strategyName[s.strategy]} · {methodName[s.method]}</h3><span>{selectedKey ? s.key === selectedKey ? "你的当前选择" : "当时的备选" : !s.feasible ? "存在缺口" : !s.adoptable ? "假设试算" : s.key === evaluation.recommendedKey ? "优先核对" : "可以执行"}</span></header><strong className="car-price">{money(s.budgetMinor)}</strong><p>{s.purchaseMonth}购车 · 自备 {money(s.upfrontMinor)}</p><dl><div><dt>购车后首月结余</dt><dd>{money(s.monthlyAfterPurchaseMinor)}</dd></div><div><dt>不削减消费时结余</dt><dd>{money(s.monthlyWithoutCutsMinor)}</dd></div><div><dt>购车后当月剩余资金</dt><dd>{money((BigInt(s.balanceBeforePurchaseMinor) - BigInt(s.upfrontMinor)).toString())}</dd></div><div><dt>全期最低可用余额</dt><dd>{money(s.minimumBalanceMinor)}</dd></div>{s.method === "LOAN" && <><div><dt>贷款本金</dt><dd>{money(s.loanPrincipalMinor)}</dd></div><div><dt>预计总利息</dt><dd>{money(s.loanInterestMinor)}</dd></div><div><dt>首期月供</dt><dd>{money(s.loanPayments[0]?.paymentMinor ?? "0")}</dd></div></>}</dl>{s.reasons.map((r) => <p key={r} className="car-risk">{r}</p>)}<details><summary>查看资金来源与逐月变化</summary><FundingTable scenario={s} /><div className="car-table-wrap"><table><caption>按月检查资金余额</caption><thead><tr><th>月份</th><th>月结余</th><th>月供</th><th>余额</th></tr></thead><tbody>{s.timeline.map((t) => <tr key={t.month}><td>{t.month}</td><td>{money(t.netMinor)}</td><td>{money(t.loanPaymentMinor)}</td><td>{money(t.balanceMinor)}</td></tr>)}</tbody></table></div></details><button type="button" className="button-primary" disabled={disabled || (!s.adoptable && !(s.feasible && evaluation.redLineChecks?.some((c) => c.candidateKey === s.key && c.result === "SKIPPED_MANUAL") && evaluation.redLineChecks.filter((c) => c.candidateKey === s.key).every((c) => ["PASS", "SKIPPED_MANUAL"].includes(c.result))))} onClick={() => onChoose(s)}>核对并采纳</button></article>)}</div>}
    {evaluation.protectedSources.length > 0 && <details className="car-section" open><summary>受到保护的钱</summary>{evaluation.protectedSources.map((s, i) => <p key={`${s.name}-${i}`}><strong>{s.name} {money(s.amountMinor)}</strong> · {s.reason}</p>)}</details>}
    <details className="car-section"><summary>四位管家的判断</summary>{evaluation.assessments.map((a) => <article key={a.manager}><h4>{a.manager}</h4><p>{a.conclusion}</p>{a.issues.map((issue, i) => <p key={i} className="car-hint">{issue}</p>)}</article>)}</details>
    <details className="car-section"><summary>计算采用的条件</summary>{evaluation.assumptions.map((a) => <p key={a}>{a}</p>)}</details>
  </div>;
}
function FundingTable({ scenario }: { scenario: CarScenario }) {
  return <div className="car-table-wrap"><table><caption>自备资金来源（不重复计入贷款）</caption><thead><tr><th>来源</th><th>可用月份</th><th>计划使用</th></tr></thead><tbody>{scenario.funding.map((s) => <tr key={s.id}><td>{s.name}</td><td>{s.month}</td><td>{money(s.usedMinor)}</td></tr>)}</tbody></table></div>;
}
export function AdoptionDialog({ scenario, facts, evaluation, busy, onClose, onConfirm, children }: { children?: ReactNode; scenario: CarScenario; facts: CarFacts; evaluation: CarEvaluation | null; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const [confirmed, setConfirmed] = useState(false);
  return <div className="dialog-backdrop"><section className="car-dialog" role="dialog" aria-modal="true" aria-labelledby="car-adoption-title"><h2 id="car-adoption-title">确认这份买车安排</h2><p>{scenario.purchaseMonth} · {methodName[scenario.method]} · 车价 {money(scenario.budgetMinor)}</p><FundingTable scenario={scenario} /><p>购车后首月结余 {money(scenario.monthlyAfterPurchaseMinor)}。采纳会创建目标、资金预留和行动，不会转移真实资金。</p><p>应急储备底线 {money(facts.reserveFloorMinor)}。全期最低可用余额 {money(scenario.minimumBalanceMinor)}。</p>{facts.cuts.filter((c) => c.accepted).map((c) => <p key={c.id}>接受每月减少「{c.name}」{money(c.amountMinor)}：{c.impact || "影响尚未说明"}</p>)}{evaluation?.preferenceEvidence?.filter((m) => m.status === "ACTIVE" && m.nature === "HARD").map((m) => <p key={m.id}>本次约束：{m.content}（{m.scope === "GLOBAL" ? "已确认跨目标适用" : "仅本次目标"}）</p>)}<p className="car-hint">只确认这里展示的安排。系统记录选择，不推测动机，不自动修改长期画像。</p>{children}<CheckField checked={confirmed} onChange={setConfirmed}>已核对预算、费用、资金来源和消费调整，确认生效。</CheckField><div className="car-buttons"><button className="button-secondary" disabled={busy} onClick={onClose}>返回修改</button><button className="button-primary" disabled={busy || !confirmed} onClick={onConfirm}>确认生效</button></div></section></div>;
}
function PurchaseDialog({ facts, decision, data, busy, onClose, onConfirm, onPreview }: { facts: CarFacts; decision: Decision; data: WorkspaceData; busy: boolean; onClose: () => void; onConfirm: (input: object) => void; onPreview: (input: object) => Promise<PurchasePreview> }) {
  const active = decision.plans.find((p) => p.id === decision.activePlanId)!;
  const scenario = JSON.parse(active.snapshotJson).scenario as CarScenario;
  const [price, setPrice] = useState<string | null>(scenario.budgetMinor);
  const [fees, setFees] = useState<string | null>(facts.landingFeesMinor);
  const [value, setValue] = useState<string | null>(null);
  const [loan, setLoan] = useState(scenario.method === "LOAN" ? facts.loan : null);
  const [confirmed, setConfirmed] = useState(false);
  const [preview, setPreview] = useState<{ key: string; result: PurchasePreview } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const input = { actualPriceMinor: price, actualFeesMinor: fees, actualVehicleValueMinor: value, loan, confirmLedgerUpdate: true };
  const key = JSON.stringify(input);
  const currentPreview = preview?.key === key ? preview.result : null;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (currentPreview && confirmed) { onConfirm(input); return; }
    setPreparing(true); setError(""); setConfirmed(false);
    try { setPreview({ key, result: await onPreview(input) }); }
    catch (e) { setError(e instanceof Error ? e.message : "明细检查未完成"); }
    finally { setPreparing(false); }
  }
  return <div className="dialog-backdrop"><section className="car-dialog" role="dialog" aria-modal="true" aria-labelledby="car-purchase-title"><h2 id="car-purchase-title">记录实际购车</h2><p>先核对各账户的变动，再更新底账。请在尚未手工记入这些变动时使用，避免重复记账。</p><p>到账奖金和积蓄应先更新为真实资产，再在决策资料中核对来源。当前记录月份：{data.asOfMonth}。</p>{error && <p className="car-alert" role="alert">{error}</p>}<form onSubmit={submit}><fieldset disabled={busy || preparing}><div className="car-fields"><MoneyField label="实际成交车价" value={price} onChange={setPrice} required /><MoneyField label="实际落地费用" value={fees} onChange={setFees} required /><MoneyField label="车辆当前价值（用于底账）" value={value} onChange={setValue} required /></div><CheckField checked={loan !== null} onChange={(enabled) => setLoan(enabled ? facts.loan ?? blankLoan : null)}>实际使用贷款</CheckField>{loan && <LoanFields loan={loan} onChange={setLoan} />}
    {currentPreview && <><div className="car-table-wrap"><table><caption>确认后写入的实际变化</caption><thead><tr><th>账户</th><th>当前余额</th><th>本次扣减</th><th>记录后余额</th></tr></thead><tbody>{currentPreview.changes.map((c) => <tr key={c.assetId}><td>{c.name}</td><td>{money(c.beforeMinor)}</td><td>{money(c.usedMinor)}</td><td>{money(c.afterMinor)}</td></tr>)}</tbody></table></div><p>新增车辆现值 {money(currentPreview.vehicleValueMinor)}；新增贷款本金 {money(currentPreview.scenario.loanPrincipalMinor)}。</p>{currentPreview.scenario.reasons.map((reason) => <p className="car-risk" key={reason}>{reason}。记录真实购车后，请及时复盘。</p>)}<CheckField checked={confirmed} onChange={setConfirmed}>这些变动尚未手工入账，确认按明细更新底账。</CheckField></>}
    <div className="car-buttons"><button type="button" className="button-secondary" onClick={onClose}>返回</button><button className="button-primary" disabled={price === null || fees === null || value === null || Boolean(currentPreview && !confirmed)}>{preparing ? "正在核对…" : currentPreview ? "记录购车并更新底账" : "核对入账明细"}</button></div></fieldset></form></section></div>;
}

function Section({ title, description, open = false, children }: { title: string; description: string; open?: boolean; children: ReactNode }) {
  return <details className="car-section" open={open}><summary>{title}<ChevronDown size={16} /></summary><p className="car-hint">{description}</p><div className="car-section-body">{children}</div></details>;
}
function CheckField({ checked, onChange, disabled = false, children }: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean; children: ReactNode }) {
  return <label className="car-check"><input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /><span>{children}</span></label>;
}
function MoneyField({ label, value, onChange, required = false, disabled = false }: { label: string; value: string | null; onChange: (value: string | null) => void; required?: boolean; disabled?: boolean }) {
  const [draft, setDraft] = useState<{ base: string | null; text: string } | null>(null);
  const text = draft?.base === value ? draft.text : value === null ? "" : minorToYuan(value);
  return <label>{label}<div className="car-money"><span>¥</span><input aria-label={label} inputMode="decimal" required={required} disabled={disabled} value={text} placeholder="待确认" onChange={(e) => { setDraft({ base: value, text: e.target.value }); e.target.setCustomValidity(""); }} onBlur={(e) => { try { const next = text.trim() ? yuanToMinor(text) : null; if (next !== null && BigInt(next) > 1_000_000_000_000n) throw new Error("金额超出支持范围"); setDraft(null); onChange(next); } catch { e.target.setCustomValidity("请输入非负金额，最多两位小数"); e.target.reportValidity(); } }} /></div></label>;
}

function MonthField({ label, value, min, max, disabled = false, onChange }: { label: string; value: string | null; min?: string; max?: string; disabled?: boolean; onChange: (value: string | null) => void }) {
  return <label>{label}<input key={value ?? "empty"} type="month" defaultValue={value ?? ""} min={min} max={max} disabled={disabled} onBlur={(e) => onChange(e.currentTarget.value || null)} /></label>;
}
