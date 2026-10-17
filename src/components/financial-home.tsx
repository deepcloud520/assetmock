"use client";

import { AlertTriangle, ArrowDownRight, ArrowUpRight, Banknote, Check, FileText, HelpCircle, Image as ImageIcon, Landmark, LoaderCircle, Pencil, Plus, Trash2, Upload, UserRound, X } from "lucide-react";
import { FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { FOUR_ACCOUNT_KEYS, accountProgress, type FourAccountAssessment, type FourAccountKey } from "@/domain/four-account-assessment";
import { formatMoneyInput, minorToYuan, yuanToMinor } from "@/domain/money-input";
import { CreatedGoalsPanel, GoalHome } from "./goal-home";
import { ProfileDialog } from "./profile-dialog";
import { AssessmentAccountCard } from "./assessment-account-card";

type Profile = {
  age: number | null; familyStatus: string; riskLevel: string; baseCurrency: "CNY";
  stableMonthlyIncomeMinor: string; otherMonthlyIncomeMinor: string;
  rentExpenseMinor: string; transportExpenseMinor: string; essentialExpenseMinor: string;
};
type Asset = {
  id: string; name: string; type: string; currentValueMinor: string; currency: "CNY";
  liquidityLevel: string; riskLevel: number; isInvestable: boolean; isAdjustable: boolean; goalId: string | null;
};
type Liability = {
  id: string; name: string; type: string; outstandingBalanceMinor: string; isInstallment: boolean;
  monthlyPaymentMinor: string; remainingMonths: number | null; totalRepaymentMinor: string | null;
  principalMinor: string | null; interestMinor: string | null; repaymentMethod: string | null;
};
type Goal = { id: string; name: string; type: string; targetAmountMinor: string; targetDate: string; preparedAmountMinor: string; monthlyContributionMinor: string; priority: number; isFlexible: boolean };
type Kind = "asset" | "liability";

async function jsonRequest<T>(path: string, workspaceId: string, options: RequestInit): Promise<T> {
  const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", "X-Workspace-Id": workspaceId, ...options.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "请求失败");
  return body;
}

export function FinancialHome({ onOpenGoalManager, onViewExecution, onStartCarPlanning, workspaceId, revision, profile, assets, liabilities, goals, multiGoalConsentAt, saving, assessment, assessmentStale, assessmentLoading, assessmentFocusRequest, planningGoal, assessmentCurrent, onAssess, onViewReport, onEdit, onDelete, onSave, onSaveProfile, onDataChange }: {
  onOpenGoalManager?: () => void;
  onViewExecution?: () => void;
  onStartCarPlanning?: (intent?: string) => void;
  workspaceId: string; revision: number; profile: Profile; assets: Asset[]; liabilities: Liability[]; goals: Goal[];
  multiGoalConsentAt: string | null; saving: boolean;
  assessment: FourAccountAssessment | null; assessmentStale: boolean; assessmentLoading: boolean;
  assessmentFocusRequest: number;
  planningGoal: Goal | null; assessmentCurrent: boolean;
  onAssess: () => Promise<void>; onViewReport: () => void;
  onStartPlanning: (goal: Goal) => void;
  onEdit: (kind: "asset" | "liability" | "goal", item: Asset | Liability | Goal) => void;
  onDelete: (kind: "asset" | "liability" | "goal", item: Asset | Liability | Goal) => void;
  onSave: (kind: "asset" | "liability", item: Asset | Liability, body: object) => Promise<void>;
  onSaveProfile: (profile: Profile, message?: string) => Promise<boolean>;
  onDataChange: () => Promise<void>;
}) {
  const [adding, setAdding] = useState<Kind | null>(null);
  const [importing, setImporting] = useState<Kind | null>(null);
  const [confirmingAssessment, setConfirmingAssessment] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  function closeProfile() {
    setProfileOpen(false);
    requestAnimationFrame(() => profileButtonRef.current?.focus());
  }
  const assetTotal = assets.reduce((sum, item) => sum + BigInt(item.currentValueMinor), 0n);
  const liabilityTotal = liabilities.reduce((sum, item) => sum + BigInt(item.outstandingBalanceMinor), 0n);
  const monthlyIncome = BigInt(profile.stableMonthlyIncomeMinor) + BigInt(profile.otherMonthlyIncomeMinor);
  const monthlySpending = BigInt(profile.rentExpenseMinor) + BigInt(profile.transportExpenseMinor) + BigInt(profile.essentialExpenseMinor);
  const monthlyRepayment = liabilities.reduce((sum, item) => sum + BigInt(item.monthlyPaymentMinor), 0n);
  const monthlyOutflow = monthlySpending + monthlyRepayment;
  const monthlyBalance = monthlyIncome - monthlyOutflow;
  const cashflowScale = monthlyIncome > monthlyOutflow ? monthlyIncome : monthlyOutflow;
  const incomeWidth = cashflowScale > 0n ? Number(monthlyIncome * 100n / cashflowScale) : 0;
  const outflowWidth = cashflowScale > 0n ? Number(monthlyOutflow * 100n / cashflowScale) : 0;
  const hasRecords = assetTotal > 0n || liabilityTotal > 0n;
  return <div className="financial-home-grid home-dashboard">
    <div className="home-summary-column">
      <section className="home-overview" aria-labelledby="home-overview-title">
        <div className="home-overview-primary">
          <div className="home-overview-topline"><h2 id="home-overview-title">你的财富概览</h2><button ref={profileButtonRef} className="home-profile-button" type="button" onClick={() => setProfileOpen(true)}><UserRound size={16} />个人画像</button></div>
          <div className="home-overview-intro"><p>看清当下的财务位置，再向重要的人生目标前进。</p></div>
          <div className="home-overview-metrics">
            <div className="home-net-worth"><span>当前净资产</span><strong>{formatCurrency(assetTotal - liabilityTotal)}</strong></div>
            <div className="home-balance-breakdown">
              <div><span><ArrowUpRight size={16} />资产总额</span><strong>{formatCurrency(assetTotal)}</strong></div>
              <div><span><ArrowDownRight size={16} />负债总额</span><strong>{formatCurrency(liabilityTotal)}</strong></div>
            </div>
          </div>
          <section className="home-cashflow" aria-labelledby="home-cashflow-title">
            <div className="home-cashflow-heading"><h3 id="home-cashflow-title">每月收支</h3></div>
            <div className="home-cashflow-rows">
              <div className="home-cashflow-row"><div><span>月收入</span><strong>{formatCurrency(monthlyIncome)}</strong></div><div className="home-cashflow-track"><span style={{ width: `${incomeWidth}%` }} /></div></div>
              <div className="home-cashflow-row home-cashflow-row-outflow"><div><span>月支出与还款</span><strong>{formatCurrency(monthlyOutflow)}</strong></div><div className="home-cashflow-track"><span style={{ width: `${outflowWidth}%` }} /></div></div>
            </div>
            <div className="home-cashflow-result"><span>{monthlyBalance < 0n ? "每月缺口" : "每月可结余"}</span><strong>{formatCurrency(monthlyBalance < 0n ? -monthlyBalance : monthlyBalance)}</strong></div>
            <p className="home-cashflow-note">由已录入的收入、日常支出与月还款计算。</p>
          </section>
        </div>
      </section>
      <CreatedGoalsPanel onOpenGoalManager={onOpenGoalManager} goals={goals} planningGoalId={planningGoal?.id ?? null} onEdit={(goal) => onEdit("goal", goal)} onDelete={(goal) => onDelete("goal", goal)} />
      {!onOpenGoalManager && <GoalHome onViewExecution={onViewExecution} onStartCarPlanning={onStartCarPlanning} workspaceId={workspaceId} goals={goals} multiGoalConsentAt={multiGoalConsentAt} onDataChange={onDataChange} />}
    </div>
    <div className="financial-ledger" aria-label="当前财务底账">
      <FinancialRecordPanel kind="asset" items={assets} total={assetTotal} saving={saving} profile={profile} onAdd={() => setAdding("asset")} onImport={() => setImporting("asset")} onEdit={(item) => onEdit("asset", item)} onDelete={(item) => onDelete("asset", item)} onSave={onSave} onSaveProfile={onSaveProfile} />
      <FinancialRecordPanel kind="liability" items={liabilities} total={liabilityTotal} saving={saving} profile={profile} onAdd={() => setAdding("liability")} onImport={() => setImporting("liability")} onEdit={(item) => onEdit("liability", item)} onDelete={(item) => onDelete("liability", item)} onSave={onSave} onSaveProfile={onSaveProfile} />
    </div>
    <CurrentAssessmentPanel hasRecords={hasRecords} assessment={assessment} stale={assessmentStale} loading={assessmentLoading} focusRequest={assessmentFocusRequest} planningGoal={planningGoal} assessmentCurrent={assessmentCurrent} confirming={confirmingAssessment} onConfirmingChange={setConfirmingAssessment} onAssess={onAssess} onViewReport={onViewReport} />
    {profileOpen && <ProfileDialog workspaceId={workspaceId} profile={profile} monthlyIncome={monthlyIncome} monthlyOutflow={monthlyOutflow} monthlyRepayment={monthlyRepayment} saving={saving} onClose={closeProfile} onSave={(body) => onSaveProfile(body)} />}
    {adding && <QuickAddDialog kind={adding} saving={saving} onClose={() => setAdding(null)} onSave={async (kind, body) => { await jsonRequest(`/api/${kind === "asset" ? "assets" : "liabilities"}`, workspaceId, { method: "POST", body: JSON.stringify(body) }); setAdding(null); await onDataChange(); }} />}
    {importing && <FinancialImportDialog workspaceId={workspaceId} revision={revision} initialKind={importing} onClose={() => setImporting(null)} onComplete={async () => { setImporting(null); await onDataChange(); }} />}
  </div>;
}

const accountLabels: Record<FourAccountKey, string> = { liquidity: "流动账户", protection: "保障账户", goal: "目标账户", growth: "增长账户" };

function CurrentAssessmentPanel({ hasRecords, assessment, stale, loading, focusRequest, planningGoal, assessmentCurrent, confirming, onConfirmingChange, onAssess, onViewReport }: {
  hasRecords: boolean; assessment: FourAccountAssessment | null; stale: boolean; loading: boolean;
  focusRequest: number;
  planningGoal: Goal | null; assessmentCurrent: boolean;
  confirming: boolean; onConfirmingChange: (value: boolean) => void;
  onAssess: () => Promise<void>; onViewReport: () => void;
}) {
  const [activeAccount, setActiveAccount] = useState<FourAccountKey | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const reports = new Map(assessment?.accounts.map((account) => [account.account, account]));
  useEffect(() => {
    if (!focusRequest) return;
    const frame = requestAnimationFrame(() => {
      panelRef.current?.focus({ preventScroll: true });
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusRequest]);
  return <section ref={panelRef} id="current-assessment" tabIndex={-1} className="home-record-panel assessment-panel focus:outline-none">
    <header className="assessment-header">
      <div className="flex items-center gap-2"><button className="button-primary flex-1" disabled={!hasRecords || loading} onClick={() => onConfirmingChange(true)}>{loading ? <LoaderCircle className="animate-spin" size={16} /> : <Check size={16} />}{assessment ? stale ? "重新评估" : "再次评估" : "开始现状评估"}</button><button type="button" className="assessment-help" aria-label="现状评估使用提示"><HelpCircle size={17} /><span role="tooltip">请填写您的资产或负债情况后再使用</span></button></div>
      {planningGoal && !assessmentCurrent && <div className="mt-3 border-l-2 border-blue-600 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-900">完成现状评估后，继续规划“{planningGoal.name}”。</div>}
      {stale && <div className="mt-3 flex items-center gap-2 bg-amber-50 px-3 py-2 text-xs text-amber-800"><AlertTriangle size={14} />数据已变化，当前展示的是上次评估</div>}
    </header>
    <div className="assessment-scroll">
      <div><p className="eyebrow">四个账户</p><h2 className="mt-2 text-xl font-semibold">当前财富结构</h2><p className="mt-2 text-xs leading-5 text-slate-500">对照实际结构与系统建议，查看每个账户的准备程度。</p></div>
      <div className="assessment-account-grid">{FOUR_ACCOUNT_KEYS.map((key) => {
        const report = reports.get(key);
        const progress = report ? accountProgress(report.currentRatio, report.targetRatio) : 0;
        return <AssessmentAccountCard key={key} summary={report?.summary} disabled={!report} active={activeAccount === key} onOpen={() => setActiveAccount(key)}>
            <div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold">{accountLabels[key]}</span><span className="text-lg font-semibold tabular-nums">{report ? report.score : "?"}</span></div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500"><span>{report ? `实际 ${formatRatio(report.currentRatio)} / 建议 ${formatRatio(report.targetRatio)}` : "实际 ? / 建议 ?"}</span>{report?.currentRatio === null && <span>需补充资产</span>}</div>
            <div className="assessment-track mt-2"><span style={{ width: `${progress}%` }} /></div>
        </AssessmentAccountCard>;
      })}</div>
      {assessment?.dataCompleteness === "insufficient" && <p className="mt-5 border-l-2 border-amber-400 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">当前信息不足，建议补充资产、收入、支出和保障情况后重新评估。</p>}
    </div>
    <footer className="grid gap-2 border-t border-slate-200 p-4"><button className="button-secondary w-full" disabled={!assessment} onClick={onViewReport}>查看完整报告</button></footer>
    {confirming && <div className="dialog-backdrop"><section className="editor-panel" role="dialog" aria-modal="true" aria-labelledby="assessment-confirm-title"><header className="border-b border-slate-200 px-6 py-5"><h2 id="assessment-confirm-title" className="text-lg font-semibold">开始现状评估</h2></header><div className="p-6"><p className="text-sm leading-6 text-slate-700">当前评估以您录入的资产和负债为准。</p></div><div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4"><button className="button-secondary" onClick={() => onConfirmingChange(false)}>取消</button><button className="button-primary" onClick={() => { onConfirmingChange(false); void onAssess(); }}>已知晓</button></div></section></div>}
  </section>;
}

function formatRatio(value: number | null) {
  return value === null ? "--" : `${Math.round(value * 1000) / 10}%`;
}

function FinancialRecordPanel({ kind, items, total, saving, profile, onAdd, onImport, onEdit, onDelete, onSave, onSaveProfile }: {
  kind: Kind; items: Array<Asset | Liability>; total: bigint; saving: boolean; profile: Profile;
  onAdd: () => void; onImport: () => void; onEdit: (item: Asset | Liability) => void; onDelete: (item: Asset | Liability) => void;
  onSave: (kind: Kind, item: Asset | Liability, body: object) => Promise<void>;
  onSaveProfile: (profile: Profile, message?: string) => Promise<boolean>;
}) {
  const assetMode = kind === "asset";
  const Icon = assetMode ? Landmark : Banknote;
  const cashflow = assetMode
    ? [["稳定收入", "stableMonthlyIncomeMinor"], ["其他收入", "otherMonthlyIncomeMinor"]] as const
    : [["房租", "rentExpenseMinor"], ["交通支出", "transportExpenseMinor"], ["月开销", "essentialExpenseMinor"]] as const;
  return <section className="home-record-panel financial-data-panel">
    <header className="financial-panel-header">
      <div className="financial-panel-heading"><span className="financial-panel-icon"><Icon size={18} /></span><div><h2>{assetMode ? "资产与收入" : "负债与支出"}</h2><p>{assetMode ? "资产总额" : "负债总额"}</p></div><strong className="financial-panel-total">{formatCurrency(total)}</strong></div>
      <div className="financial-panel-actions"><button className="button-secondary record-add-button" onClick={onAdd}><Plus size={15} />增加记录</button><button className="icon-button import-icon-button" title="批量录入" aria-label={`批量录入${assetMode ? "资产" : "负债"}`} onClick={onImport}><Upload size={16} /></button></div>
    </header>
    <RecordScrollArea label={assetMode ? "资产与收入记录" : "负债与支出记录"}>
      <div className="record-group-label">{assetMode ? "已记录资产" : "待偿还负债"}</div>
      {items.map((item) => <RecordRow key={item.id} kind={kind} item={item} saving={saving} onSave={onSave} onEdit={() => onEdit(item)} onDelete={() => onDelete(item)} />)}
      {!items.length && <div className="px-4 py-8 text-center text-xs leading-5 text-slate-400">还没有记录</div>}
      <div className="record-group-label recurring-group-label">{assetMode ? "每月收入" : "每月支出"}</div>
      {cashflow.map(([label, key]) => <CashflowRow key={`${key}:${profile[key]}`} label={label} value={profile[key]} saving={saving} onSave={async (value) => { await onSaveProfile({ ...profile, [key]: value }, `${label}已更新`); }} />)}
    </RecordScrollArea>
  </section>;
}

function RecordScrollArea({ children, label }: { children: ReactNode; label: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState({ size: 1, progress: 0 });

  function updateMetrics() {
    const area = scrollRef.current;
    if (!area) return;
    const scrollHeight = Math.max(area.scrollHeight, 1);
    setMetrics({ size: Math.min(1, area.clientHeight / scrollHeight), progress: area.scrollTop / Math.max(1, scrollHeight - area.clientHeight) });
  }

  useEffect(() => {
    const area = scrollRef.current;
    if (!area) return;
    const observer = new ResizeObserver(updateMetrics);
    observer.observe(area);
    if (area.firstElementChild) observer.observe(area.firstElementChild);
    updateMetrics();
    return () => observer.disconnect();
  }, []);

  function scrollToPointer(event: ReactPointerEvent<HTMLDivElement>) {
    const area = scrollRef.current;
    if (!area) return;
    const track = event.currentTarget.getBoundingClientRect();
    const thumbHeight = Math.max(24, track.height * metrics.size);
    const available = track.height - thumbHeight;
    if (available <= 0) return;
    const offset = Math.min(available, Math.max(0, event.clientY - track.top - thumbHeight / 2));
    area.scrollTop = (offset / available) * (area.scrollHeight - area.clientHeight);
    updateMetrics();
  }

  return <div className="record-scroll-shell">
    <div ref={scrollRef} className="home-record-scroll" role="region" aria-label={label} tabIndex={0} onScroll={updateMetrics}><div className="record-scroll-content">{children}</div></div>
    <div className="record-scroll-track" aria-hidden="true" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); scrollToPointer(event); }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) scrollToPointer(event); }} onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}>
      <span className="record-scroll-thumb" style={{ height: `${metrics.size * 100}%`, top: `calc((100% - max(24px, ${metrics.size * 100}%)) * ${metrics.progress})` }} />
    </div>
  </div>;
}

function RecordRow({ kind, item, saving, onSave, onEdit, onDelete }: { kind: Kind; item: Asset | Liability; saving: boolean; onSave: (kind: Kind, item: Asset | Liability, body: object) => Promise<void>; onEdit: () => void; onDelete: () => void }) {
  const liability = kind === "liability" ? item as Liability : null;
  const savedMinor = kind === "asset" ? (item as Asset).currentValueMinor : liability!.principalMinor ?? liability!.totalRepaymentMinor ?? liability!.outstandingBalanceMinor;
  const [value, setValue] = useState(minorToYuan(savedMinor));
  const [busy, setBusy] = useState(false);
  async function saveAmount() {
    let next: string;
    try { next = yuanToMinor(value); } catch { setValue(minorToYuan(savedMinor)); return; }
    if (next === savedMinor) { setValue(formatMoneyInput(value)); return; }
    setBusy(true);
    try {
      if (kind === "asset") {
        const asset = item as Asset;
        await onSave(kind, item, { name: asset.name, currentValueMinor: next, currency: "CNY", isAdjustable: asset.isAdjustable });
      } else {
        const debt = item as Liability;
        const principalMinor = debt.principalMinor !== null ? next : debt.principalMinor;
        const totalRepaymentMinor = principalMinor !== null && debt.interestMinor !== null ? (BigInt(principalMinor) + BigInt(debt.interestMinor)).toString() : debt.totalRepaymentMinor !== null ? next : null;
        await onSave(kind, item, liabilityBody(debt, { outstandingBalanceMinor: next, principalMinor, totalRepaymentMinor }));
      }
      setValue(formatMoneyInput(value));
    } finally { setBusy(false); }
  }
  return <div className="record-row">
    <div className="record-row-name min-w-0"><p className="truncate text-sm font-medium" title={item.name}>{item.name}</p>{liability?.isInstallment && <p className="mt-1 text-[11px] text-slate-400">分期 · {liability.remainingMonths}个月</p>}</div>
    <div className="money-input compact-inline-money record-row-amount"><span>¥</span><input aria-label={`${item.name}金额`} value={value} inputMode="decimal" disabled={saving || busy} onFocus={(event) => setValue(event.currentTarget.value.replace(/,/g, ""))} onChange={(event) => setValue(event.target.value)} onBlur={() => void saveAmount()} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></div>
    <button className="icon-button record-row-edit" title="编辑详情" aria-label={`编辑${item.name}`} onClick={onEdit}><Pencil size={14} /></button>
    <button className="icon-button record-row-delete text-rose-600 hover:bg-rose-50" title="删除" aria-label={`删除${item.name}`} onClick={onDelete}><Trash2 size={14} /></button>
  </div>;
}

function CashflowRow({ label, value, saving, onSave }: { label: string; value: string; saving: boolean; onSave: (minor: string) => Promise<void> }) {
  const [draft, setDraft] = useState(minorToYuan(value));
  return <div className="record-row record-row-cashflow"><p className="text-sm text-slate-600">{label}</p><div className="money-input compact-inline-money"><span>¥</span><input aria-label={`${label}金额`} value={draft} inputMode="decimal" disabled={saving} onFocus={(event) => setDraft(event.currentTarget.value.replace(/,/g, ""))} onChange={(event) => setDraft(event.target.value)} onBlur={() => { try { const minor = yuanToMinor(draft); setDraft(formatMoneyInput(draft)); if (minor !== value) void onSave(minor); } catch { setDraft(minorToYuan(value)); } }} /></div></div>;
}

function liabilityBody(item: Liability, patch: Partial<Liability> = {}) {
  const value = { ...item, ...patch };
  return { name: value.name, type: value.type, isInstallment: value.isInstallment, outstandingBalanceMinor: value.outstandingBalanceMinor, monthlyPaymentMinor: value.monthlyPaymentMinor, remainingMonths: value.remainingMonths, totalRepaymentMinor: value.totalRepaymentMinor, principalMinor: value.principalMinor, interestMinor: value.interestMinor, repaymentMethod: value.repaymentMethod };
}

function QuickAddDialog({ kind, saving, onClose, onSave }: { kind: Kind; saving: boolean; onClose: () => void; onSave: (kind: Kind, body: object) => Promise<void> }) {
  const [installment, setInstallment] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const data = new FormData(event.currentTarget);
    try {
      if (kind === "asset") await onSave(kind, { name: data.get("name"), currentValueMinor: yuanToMinor(data.get("amount")), currency: "CNY", isAdjustable: data.get("isAdjustable") === "on" });
      else await onSave(kind, liabilityFormBody(data, installment));
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "请检查输入"); }
  }
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="editor-panel" role="dialog" aria-modal="true" aria-labelledby="quick-add-title"><DialogHeader title={`增加${kind === "asset" ? "资产" : "负债"}`} onClose={onClose} />
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}><div className="flex-1 space-y-5 overflow-y-auto px-5 py-6 sm:px-7">{error && <InlineError text={error} />}<Field label="名称"><input name="name" required maxLength={60} autoFocus placeholder={kind === "asset" ? "例如：招商银行活期" : "例如：住房贷款"} /></Field>
      {kind === "asset" ? <><MoneyField name="amount" label="当前价值" required /><CheckField name="isAdjustable" label="Agent可以规划调配" description="允许agent在制定计划中对该资产进行增减" defaultChecked /></> : <><label className="flex items-center gap-3 text-sm"><input type="checkbox" className="size-4 accent-blue-700" checked={installment} onChange={(event) => setInstallment(event.target.checked)} />这是分期负债</label>{installment ? <InstallmentFields /> : <MoneyField name="amount" label="金额" required />}</>}
    </div><DialogActions saving={saving} onClose={onClose} /></form></section></div>;
}

function FinancialImportDialog({ workspaceId, revision, initialKind, onClose, onComplete }: { workspaceId: string; revision: number; initialKind: Kind; onClose: () => void; onComplete: () => Promise<void> }) {
  const [mode, setMode] = useState<"TEXT" | "IMAGE">("TEXT");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<ImportDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function analyze() {
    setBusy(true); setError("");
    try {
      const form = new FormData(); form.set("mode", mode);
      if (mode === "TEXT") form.set("text", text); else files.forEach((file) => form.append("images", file));
      const response = await fetch("/api/financial-import", { method: "POST", headers: { "X-Workspace-Id": workspaceId }, body: form });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "识别失败");
      setPreview(toImportDraft(result));
    } catch (analyzeError) { setError(analyzeError instanceof Error ? analyzeError.message : "识别失败"); }
    finally { setBusy(false); }
  }
  async function commit() {
    if (!preview) return; setBusy(true); setError("");
    try {
      await jsonRequest("/api/financial-import/commit", workspaceId, { method: "POST", body: JSON.stringify({ expectedRevision: revision, assets: preview.assets.map((item) => ({ name: item.name, currentValueMinor: requiredMoney(item.amount, `资产“${item.name}”的金额`), currency: "CNY", isAdjustable: true })), liabilities: preview.liabilities.map((item) => liabilityDraftBody(item)) }) });
      await onComplete();
    } catch (commitError) { setError(commitError instanceof Error ? commitError.message : "导入失败"); }
    finally { setBusy(false); }
  }
  return <div className="dialog-backdrop"><section className="import-panel" role="dialog" aria-modal="true" aria-labelledby="import-title"><DialogHeader title="批量录入资产和负债" onClose={onClose} />
    <div className="segmented-tabs"><button className={mode === "TEXT" ? "active" : ""} onClick={() => { setMode("TEXT"); setPreview(null); }}><FileText size={15} />文字</button><button className={mode === "IMAGE" ? "active" : ""} onClick={() => { setMode("IMAGE"); setPreview(null); }}><ImageIcon size={15} />图片</button></div>
    <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">{error && <InlineError text={error} />}{!preview ? <div>{mode === "TEXT" ? <textarea className="import-textarea" value={text} onChange={(event) => setText(event.target.value)} placeholder={initialKind === "asset" ? "每行一项，例如：\n招商银行活期 32,000元\n余额宝 8,500元" : "每行一项，例如：\n信用卡欠款 5,200元\n房贷：月供4,500元，剩余240期，本金80万元，利息28万元，等额本息"} /> : <><label className="image-dropzone"><Upload size={24} /><span className="text-sm font-medium">选择账户或账单图片</span><span className="text-xs text-slate-400">JPG、PNG、WebP，最多5张，每张不超过8MB</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /><span className="text-xs text-blue-700">{files.length ? `已选择 ${files.length} 张` : "选择图片"}</span></label><p className="mt-2 text-xs leading-5 text-slate-400">图片会发送给模型服务进行识别，系统不保存原始图片。请先遮挡身份证号、银行卡号等无关敏感信息。</p></>}<button className="button-primary mt-5" disabled={busy || (mode === "TEXT" ? !text.trim() : !files.length)} onClick={() => void analyze()}>{busy ? <LoaderCircle className="animate-spin" size={16} /> : <Check size={16} />}识别并预览</button></div> : <ImportPreview draft={preview} onChange={setPreview} />}</div>
    {preview && <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4"><button className="button-secondary" disabled={busy} onClick={() => setPreview(null)}>重新识别</button><button className="button-primary" disabled={busy} onClick={() => void commit()}>{busy ? <LoaderCircle className="animate-spin" size={16} /> : <Check size={16} />}确认导入</button></div>}
  </section></div>;
}

type ImportLiability = { name: string; isInstallment: boolean; amount: string; monthlyPayment: string; remainingMonths: string; totalRepayment: string; principal: string; interest: string; repaymentMethod: string };
type ImportDraft = { assets: Array<{ name: string; amount: string }>; liabilities: ImportLiability[]; warnings: string[] };
function toImportDraft(value: { assets: Array<{ name: string; currentValueMinor: string | null }>; liabilities: Array<{ name: string; isInstallment: boolean; outstandingBalanceMinor: string | null; monthlyPaymentMinor: string | null; remainingMonths: number | null; totalRepaymentMinor: string | null; principalMinor: string | null; interestMinor: string | null; repaymentMethod: string | null }>; warnings: string[] }): ImportDraft {
  const display = (minor: string | null) => minor === null ? "" : minorToYuan(minor);
  return { assets: value.assets.map((item) => ({ name: item.name, amount: display(item.currentValueMinor) })), liabilities: value.liabilities.map((item) => ({ name: item.name, isInstallment: item.isInstallment, amount: display(item.outstandingBalanceMinor), monthlyPayment: display(item.monthlyPaymentMinor), remainingMonths: item.remainingMonths?.toString() ?? "", totalRepayment: display(item.totalRepaymentMinor), principal: display(item.principalMinor), interest: display(item.interestMinor), repaymentMethod: item.repaymentMethod ?? "" })), warnings: value.warnings };
}

function ImportPreview({ draft, onChange }: { draft: ImportDraft; onChange: (value: ImportDraft) => void }) {
  const updateAsset = (index: number, patch: Partial<ImportDraft["assets"][number]>) => onChange({ ...draft, assets: draft.assets.map((item, i) => i === index ? { ...item, ...patch } : item) });
  const updateDebt = (index: number, patch: Partial<ImportLiability>) => onChange({ ...draft, liabilities: draft.liabilities.map((item, i) => i === index ? { ...item, ...patch } : item) });
  return <div className="space-y-6">{draft.warnings.length > 0 && <div className="border-l-4 border-amber-500 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{draft.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
    <ImportGroup title={`资产 ${draft.assets.length}项`}>{draft.assets.map((item, index) => <div key={`asset-${index}`} className="import-row"><input aria-label={`导入资产名称${index + 1}`} value={item.name} onChange={(event) => updateAsset(index, { name: event.target.value })} /><MoneyInput label={`导入资产金额${index + 1}`} value={item.amount} onChange={(amount) => updateAsset(index, { amount })} /><button className="icon-button text-rose-600" aria-label="移除资产" onClick={() => onChange({ ...draft, assets: draft.assets.filter((_, i) => i !== index) })}><Trash2 size={14} /></button></div>)}</ImportGroup>
    <ImportGroup title={`负债 ${draft.liabilities.length}项`}>{draft.liabilities.map((item, index) => <div key={`debt-${index}`} className="border-t border-slate-100 py-4 first:border-0"><div className="import-row"><input aria-label={`导入负债名称${index + 1}`} value={item.name} onChange={(event) => updateDebt(index, { name: event.target.value })} /><label className="flex items-center gap-2 whitespace-nowrap text-xs"><input type="checkbox" checked={item.isInstallment} onChange={(event) => updateDebt(index, { isInstallment: event.target.checked })} />分期</label><button className="icon-button text-rose-600" aria-label="移除负债" onClick={() => onChange({ ...draft, liabilities: draft.liabilities.filter((_, i) => i !== index) })}><Trash2 size={14} /></button></div>{item.isInstallment ? <div className="mt-3 grid gap-3 sm:grid-cols-3"><MiniMoney label="月供" value={item.monthlyPayment} onChange={(value) => updateDebt(index, { monthlyPayment: value })} /><MiniField label="期限（月）"><input type="number" min="1" max="1200" value={item.remainingMonths} onChange={(event) => updateDebt(index, { remainingMonths: event.target.value })} /></MiniField><MiniMoney label="本息和" value={item.totalRepayment} onChange={(value) => updateDebt(index, { totalRepayment: value })} /><MiniMoney label="本金" value={item.principal} onChange={(value) => updateDebt(index, { principal: value })} /><MiniMoney label="利息" value={item.interest} onChange={(value) => updateDebt(index, { interest: value })} /><MiniField label="还款方式"><select value={item.repaymentMethod} onChange={(event) => updateDebt(index, { repaymentMethod: event.target.value })}><option value="">请选择</option><option value="EQUAL_PAYMENT">等额本息</option><option value="EQUAL_PRINCIPAL">等额本金</option></select></MiniField></div> : <div className="mt-3 max-w-xs"><MiniMoney label="金额" value={item.amount} onChange={(value) => updateDebt(index, { amount: value })} /></div>}</div>)}</ImportGroup>
    {!draft.assets.length && !draft.liabilities.length && <p className="py-8 text-center text-sm text-slate-400">没有识别到记录</p>}
  </div>;
}

function liabilityDraftBody(item: ImportLiability) {
  if (!item.isInstallment) return { name: item.name, isInstallment: false, outstandingBalanceMinor: requiredMoney(item.amount, `负债“${item.name}”的金额`), monthlyPaymentMinor: null, remainingMonths: null, totalRepaymentMinor: null, principalMinor: null, interestMinor: null, repaymentMethod: null };
  const optional = (value: string) => value.trim() ? yuanToMinor(value) : null;
  return { name: item.name, isInstallment: true, outstandingBalanceMinor: null, monthlyPaymentMinor: requiredMoney(item.monthlyPayment, `分期负债“${item.name}”的月供`), remainingMonths: item.remainingMonths ? Number(item.remainingMonths) : null, totalRepaymentMinor: optional(item.totalRepayment), principalMinor: optional(item.principal), interestMinor: optional(item.interest), repaymentMethod: item.repaymentMethod || null };
}

function requiredMoney(value: string, label: string) {
  if (!value.trim()) throw new Error(`请填写${label}`);
  return yuanToMinor(value);
}

function liabilityFormBody(data: FormData, installment: boolean) {
  if (!installment) return { name: data.get("name"), isInstallment: false, outstandingBalanceMinor: yuanToMinor(data.get("amount")), monthlyPaymentMinor: null, remainingMonths: null, totalRepaymentMinor: null, principalMinor: null, interestMinor: null, repaymentMethod: null };
  const optional = (key: string) => data.get(key) ? yuanToMinor(data.get(key)) : null;
  return { name: data.get("name"), isInstallment: true, outstandingBalanceMinor: null, monthlyPaymentMinor: optional("monthlyPayment"), remainingMonths: data.get("remainingMonths") ? Number(data.get("remainingMonths")) : null, totalRepaymentMinor: optional("totalRepayment"), principalMinor: optional("principal"), interestMinor: optional("interest"), repaymentMethod: data.get("repaymentMethod") || null };
}

function InstallmentFields() { return <div className="grid gap-4 sm:grid-cols-2"><MoneyField name="monthlyPayment" label="月供" required /><Field label="期限（月）"><input name="remainingMonths" type="number" min="1" max="1200" required /></Field><MoneyField name="totalRepayment" label="本息和" /><MoneyField name="principal" label="本金" /><MoneyField name="interest" label="利息" /><Field label="还款方式"><select name="repaymentMethod" required defaultValue=""><option value="" disabled>请选择</option><option value="EQUAL_PAYMENT">等额本息</option><option value="EQUAL_PRINCIPAL">等额本金</option></select></Field><p className="text-xs leading-5 text-slate-500 sm:col-span-2">填写本息和后，本金和利息可以留空；同时填写时，三者必须一致。</p></div>; }
function DialogHeader({ title, onClose }: { title: string; onClose: () => void }) { return <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-7"><div><p className="text-xs font-medium text-blue-700">当前财务状况</p><h2 id={title.includes("批量") ? "import-title" : "quick-add-title"} className="mt-1 text-lg font-semibold">{title}</h2></div><button className="icon-button" aria-label="关闭" onClick={onClose}><X size={18} /></button></header>; }
function DialogActions({ saving, onClose }: { saving: boolean; onClose: () => void }) { return <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4"><button type="button" className="button-secondary" onClick={onClose}>取消</button><button className="button-primary" disabled={saving}>{saving && <LoaderCircle className="animate-spin" size={16} />}加入底账</button></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
function MoneyField({ name, label, required = false }: { name: string; label: string; required?: boolean }) { return <Field label={label}><div className="money-input"><span>¥</span><input name={name} required={required} inputMode="decimal" placeholder="0.00" onBlur={(event) => { if (event.currentTarget.value) event.currentTarget.value = formatMoneyInput(event.currentTarget.value); }} /></div></Field>; }
function MoneyInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <div className="money-input"><span>¥</span><input aria-label={label} value={value} inputMode="decimal" onChange={(event) => onChange(event.target.value)} /></div>; }
function MiniMoney({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <MiniField label={label}><MoneyInput label={label} value={value} onChange={onChange} /></MiniField>; }
function MiniField({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field text-xs"><span>{label}</span>{children}</label>; }
function CheckField({ name, label, description, defaultChecked }: { name: string; label: string; description: string; defaultChecked: boolean }) { return <label className="flex cursor-pointer items-start gap-3 border border-slate-200 p-3.5"><input name={name} type="checkbox" defaultChecked={defaultChecked} className="mt-0.5 size-4 accent-blue-700" /><span><span className="block text-sm font-medium">{label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span></span></label>; }
function InlineError({ text }: { text: string }) { return <div className="mb-4 border-l-4 border-rose-500 bg-rose-50 px-3 py-2 text-sm text-rose-700">{text}</div>; }
function ImportGroup({ title, children }: { title: string; children: React.ReactNode }) { return <section><h3 className="mb-2 text-xs font-semibold text-slate-500">{title}</h3><div className="border border-slate-200 px-3">{children}</div></section>; }
function formatCurrency(value: bigint) { return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(Number(value) / 100); }
