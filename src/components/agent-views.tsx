"use client";

import { AlertTriangle, Bot, Check, ChevronRight, LoaderCircle, RefreshCw, ShieldCheck, Sparkles, Target } from "lucide-react";
import { useState } from "react";
import type { FourAccountAssessment } from "@/domain/four-account-assessment";
import { formatPlanningText } from "@/domain/format-planning-text";

type DiagnosisActionItem = {
  id: string; risk_id: string; priority: "P0" | "P1" | "P2"; title: string; reason: string;
  steps: string[]; amount: string | null; currency: "CNY"; due_in_days: number;
  prerequisites: string[]; completion_criteria: string; verification_required: string;
};

export type DiagnosisResult = {
  id: string;
  sourceRevision: number;
  isStale: boolean;
  mode: string;
  model: string;
  createdAt: string;
  healthScore: number | null;
  summary: string;
  dimensions: Array<{ id: string; label: string; score: number | null; status: string }>;
  overallAssessment?: { status: string; summary: string; positive_foundations: string[] };
  findings: Array<{
    id: string; priority?: number; severity?: string; category?: string; title: string;
    conclusion?: string; evidence: string | string[]; reason?: string; impact?: string;
    related_goal_ids?: string[]; direction?: string; status?: string; explanation?: string;
  }>;
  threeMonthActions?: DiagnosisActionItem[];
  monthlyActions?: DiagnosisActionItem[];
  missingInformation?: Array<{ field: string; why_needed: string; question: string }>;
  fourAccountAssessment?: FourAccountAssessment;
  disclaimer?: string;
};

export type PlanningResult = {
  id: string;
  sourceRevision: number;
  isStale: boolean;
  mode: string;
  model: string;
  selectedPlanKey: string | null;
  recommendedPlanKey: "A" | "B" | "C" | null;
  createdAt: string;
  goalId: string;
  goalName: string;
  plans: Array<{
    key: "A" | "B" | "C";
    name: string;
    principle: string;
    targetDate: string;
    targetAmountMinor: string;
    monthlyContributionMinor: string;
    monthlyCashflowAfterContributionMinor: string;
    immediateReserveGapMinor: string;
    projectedAmountMinor: string;
    projectedGapMinor: string;
    feasibility: "FEASIBLE" | "TIGHT" | "INFEASIBLE";
    summary: string;
    gain: string;
    sacrifice: string;
  }>;
};

export type FuturePlanningAction = {
  id: string; priority: "P0" | "P1" | "P2"; title: string; reason: string; steps: string[];
  amount: string | null; currency: "CNY"; due_in_days: number; prerequisites: string[];
  completion_criteria: string; verification_required: string;
};

export type FuturePlanningResult = {
  id: string; goalId: string | null; planSetId: string | null; planKey: "A" | "B" | "C" | null;
  sourceRevision: number; isStale: boolean; mode: string; model: string; promptVersion: string;
  informationCompleteness: "INSUFFICIENT" | "BASIC" | "COMPLETE"; reportText: string; adoptedAt: string | null; createdAt: string;
  report: null | {
    information_completeness: "INSUFFICIENT" | "BASIC" | "COMPLETE";
    summary: string; assumptions: string[];
    risks: Array<{ id: string; title: string; reason: string; impact: string; direction: string }>;
    actions: FuturePlanningAction[];
    missing_information: Array<{ field: string; why_needed: string; question: string }>;
    disclaimer: string;
  };
};

export type AgentResults = { diagnosis: DiagnosisResult | null; planning: PlanningResult | null; futurePlanning: FuturePlanningResult | null };

function money(value: string) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(Number(BigInt(value)) / 100);
}

function ResultMeta({ mode, createdAt }: { mode: string; createdAt: string }) {
  return <div className="flex items-center gap-2 text-xs text-slate-400"><span className="size-1.5 rounded-full bg-blue-500" />{mode === "OPENAI" ? "AI 结构化解释" : "本地规则解释"}<span>·</span><span>{new Date(createdAt).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span></div>;
}

function StaleBanner({ onRefresh, loading = false, actionLabel = "重新生成" }: { onRefresh: () => void; loading?: boolean; actionLabel?: string }) {
  return <div className="mb-6 flex flex-col gap-3 border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between"><span>你的财富信息已经变化，以下结果基于旧版底账。</span><button className="button-secondary shrink-0" onClick={onRefresh} disabled={loading}><RefreshCw size={15} />{actionLabel}</button></div>;
}

const diagnosisStatusLabels: Record<string, string> = { HEALTHY: "状况良好", ATTENTION: "需要关注", RISK: "存在风险", INCOMPLETE: "信息不足", STALE: "数据已变化" };
const riskSeverityLabels: Record<string, string> = { HIGH: "高优先级", MEDIUM: "中优先级", LOW: "低优先级" };
const riskCategoryLabels: Record<string, string> = { FINANCIAL_SAFETY: "财务安全", ASSET_STRUCTURE: "资产结构", INVESTMENT_RISK: "投资风险", LIQUIDITY: "流动性", GOAL_HEALTH: "目标健康", DATA_QUALITY: "数据质量" };
const confidenceLabels: Record<string, string> = { HIGH: "高", MEDIUM: "中", LOW: "低" };

export function DiagnosisView({ result, onGoToAssessment }: { result: DiagnosisResult | null; onGoToAssessment: () => void }) {
  if (!result) return <div className="diagnosis-empty flex min-h-[65vh] flex-col items-center justify-center text-center"><span className="grid size-14 place-items-center bg-blue-50 text-blue-700"><Bot size={25} /></span><h1 className="mt-5 text-xl font-semibold">尚未生成财富诊断报告</h1><p className="mt-2 max-w-md text-base leading-7 text-slate-500">请先完成现状评估。</p><button className="button-primary mt-6" onClick={onGoToAssessment}><Sparkles size={16} />现状评估</button></div>;
  const assessment = result.overallAssessment ?? { status: "ATTENTION", summary: result.summary, positive_foundations: [] };
  const missingInformation = result.missingInformation ?? [];
  return <div className="diagnosis-page">
    {result.isStale && <StaleBanner onRefresh={onGoToAssessment} actionLabel="重新评估" />}
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">AI 财富诊断</p><h1 className="mt-2 text-3xl font-semibold">财富诊断报告</h1><p className="mt-2 text-[18px] leading-8 text-slate-500">了解当前财务状况和优先需要处理的问题。</p></div></div>
    <section className="diagnosis-summary-card mt-7 grid border border-slate-200 bg-white sm:grid-cols-[180px_1fr]">
      <div className="diagnosis-score grid place-items-center border-b border-slate-200 p-6 sm:border-b-0 sm:border-r"><div className="text-center"><p className="text-5xl font-semibold tabular-nums">{result.healthScore ?? "--"}</p><p className="mt-2 text-sm text-slate-400">财富健康度</p></div></div>
      <div className="p-6"><ResultMeta mode={result.mode} createdAt={result.createdAt} /><div className="mt-4 flex flex-wrap items-start gap-3"><span data-status={assessment.status} className="diagnosis-status-badge shrink-0 bg-slate-900 px-2 py-1 text-sm font-bold text-white">{diagnosisStatusLabels[assessment.status] ?? "需要关注"}</span><p className="text-[18px] font-semibold leading-8">{assessment.summary}</p></div>{assessment.positive_foundations.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{assessment.positive_foundations.map((item) => <span key={item} className="bg-blue-50 px-3 py-2 text-[18px] leading-7 text-blue-800">{item}</span>)}</div>}<div className="mt-5 flex flex-wrap gap-2">{result.dimensions.map((dimension) => <span key={dimension.id} className="border border-slate-200 px-3 py-2 text-sm text-slate-600">{dimension.label} <b className="ml-1 text-slate-900">{dimension.score ?? "--"}</b></span>)}</div></div>
    </section>
    {result.fourAccountAssessment && <FourAccountReport assessment={result.fourAccountAssessment} />}
    <section className="mt-10"><div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-2xl font-semibold">优先处理的问题</h2><p className="mt-2 text-[18px] leading-8 text-slate-500">按紧迫性、影响程度和可行动性排序。</p></div></div>
      <div className="mt-4 space-y-3">{result.findings.length ? result.findings.map((finding, index) => <RiskFinding key={finding.id} finding={finding} index={index} />) : <div className="border border-blue-200 bg-blue-50 p-6"><div className="flex items-center gap-3 text-blue-800"><ShieldCheck size={22} /><p className="font-semibold">当前没有识别出核心风险</p></div><p className="mt-2 text-base text-blue-700">可继续补充缺失信息，提高诊断覆盖范围。</p></div>}</div>
    </section>
    {missingInformation.length > 0 && <section className="mt-10 border-t border-slate-200 pt-7"><h2 className="text-2xl font-semibold">还需要补充的信息</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{missingInformation.map((item) => <div key={item.field} className="border border-slate-200 bg-white p-5"><p className="text-[18px] font-semibold leading-8">{item.question}</p><p className="mt-2 text-[18px] leading-8 text-slate-600">{item.why_needed}</p></div>)}</div></section>}
    <p className="mt-6 text-sm leading-6 text-slate-400">{result.disclaimer ?? "本诊断用于资产整理与规划参考，不构成投资建议。"}</p>
  </div>;
}

function FourAccountReport({ assessment }: { assessment: FourAccountAssessment }) {
  return <section className="mt-10"><div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-2xl font-semibold">四账户报告</h2><p className="mt-2 text-[18px] leading-8 text-slate-500">实际比例由底账计算，建议比例和解释由 AI 生成。</p></div><span className="text-sm text-slate-500">判断可信度：{confidenceLabels[assessment.confidence] ?? "待确认"}</span></div>
    <p className="mt-5 border-l-4 border-blue-600 bg-white px-5 py-4 text-[18px] leading-8 text-slate-700">{assessment.allocationRationale}</p>
    <div className="mt-4 grid gap-3 lg:grid-cols-2">{assessment.accounts.map((account) => <article key={account.account} className="border border-slate-200 bg-white p-5"><div className="flex items-start justify-between gap-4"><div><h3 className="text-xl font-semibold">{account.name}</h3><p className="mt-2 text-sm text-slate-500">实际 {ratioText(account.currentRatio)} / 建议 {ratioText(account.targetRatio)}</p></div><span className="text-2xl font-semibold tabular-nums" aria-label={`评分 ${account.score}`}>{account.score}分</span></div><p className="mt-4 text-[18px] leading-8 text-slate-700">{account.summary}</p><details className="mt-4 border-t border-slate-100 pt-3"><summary className="cursor-pointer text-sm font-semibold text-blue-700">查看分析与建议</summary><ReportList label="做得较好" items={account.positiveFactors} /><ReportList label="需要关注" items={account.issues} /><ReportList label="关键原因" items={account.keyReasons} /><ReportList label="改善建议" items={account.suggestions} /></details></article>)}</div>
    {(assessment.goalImpacts.length > 0 || assessment.missingFields.length > 0 || assessment.classificationUncertain.length > 0 || assessment.importantAssumptions.length > 0) && <details className="mt-6 border-t border-slate-200 pt-4"><summary className="cursor-pointer text-[18px] font-semibold">目标影响与补充信息</summary>{assessment.goalImpacts.length > 0 && <div className="mt-5"><h3 className="text-lg font-semibold">人生目标对账户的影响</h3><div className="mt-3 space-y-2">{assessment.goalImpacts.map((impact) => <div key={`${impact.goal}-${impact.reason}`} className="border border-slate-200 bg-white p-4"><p className="text-[18px] font-semibold">{impact.goal}</p><p className="mt-2 text-[18px] leading-8 text-slate-600">{impact.reason}</p></div>)}</div></div>}<div className="mt-5 grid gap-3 md:grid-cols-3"><ReportNotice title="缺失信息" items={assessment.missingFields} /><ReportNotice title="分类待确认" items={assessment.classificationUncertain} /><ReportNotice title="重要假设" items={assessment.importantAssumptions} /></div></details>}
  </section>;
}

function ReportList({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return <div className="mt-4"><p className="text-sm font-semibold text-slate-500">{label}</p><ul className="mt-1 space-y-1 text-[18px] leading-8 text-slate-600">{items.map((item) => <li key={item}>· {item}</li>)}</ul></div>;
}

function ReportNotice({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return <div className="border border-slate-200 bg-white p-4"><p className="text-sm font-semibold text-slate-700">{title}</p><p className="mt-2 text-[18px] leading-8 text-slate-600">{items.join("；")}</p></div>;
}

function ratioText(value: number | null) {
  return value === null ? "--" : `${Math.round(value * 1000) / 10}%`;
}

function RiskFinding({ finding, index }: { finding: DiagnosisResult["findings"][number]; index: number }) {
  const evidence = Array.isArray(finding.evidence) ? finding.evidence : [finding.evidence];
  const isHigh = finding.severity === "HIGH" || finding.status === "RISK";
  return <article className="border border-slate-200 bg-white p-5 sm:p-6"><div className="flex items-start gap-4"><span className={`grid size-8 shrink-0 place-items-center text-base font-bold text-white ${isHigh ? "bg-rose-500" : "bg-amber-500"}`}>{finding.priority ?? index + 1}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-xl font-semibold">{finding.title}</h3><span className={`px-2 py-1 text-xs font-bold ${isHigh ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>{riskSeverityLabels[finding.severity ?? (isHigh ? "HIGH" : "MEDIUM")]}</span>{finding.category && riskCategoryLabels[finding.category] && <span className="bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500">{riskCategoryLabels[finding.category]}</span>}</div><p className="mt-3 text-[18px] font-medium leading-8 text-slate-800">{finding.conclusion ?? finding.explanation}</p><details className="mt-4 border-t border-slate-100 pt-3"><summary className="cursor-pointer text-sm font-semibold text-blue-700">查看依据与建议</summary><dl className="mt-4 grid gap-5 sm:grid-cols-2"><div><dt className="text-sm font-semibold text-slate-500">证据</dt><dd className="mt-1 space-y-1 text-[18px] leading-8 text-slate-600">{evidence.map((item) => <p key={item}>{item}</p>)}</dd></div><div><dt className="text-sm font-semibold text-slate-500">形成原因</dt><dd className="mt-1 text-[18px] leading-8 text-slate-600">{finding.reason ?? finding.explanation}</dd></div><div><dt className="text-sm font-semibold text-slate-500">可能影响</dt><dd className="mt-1 text-[18px] leading-8 text-slate-600">{finding.impact}</dd></div><div><dt className="text-sm font-semibold text-slate-500">改善方向</dt><dd className="mt-1 text-[18px] leading-8 text-slate-600">{finding.direction}</dd></div></dl></details></div></div></article>;
}


export function PlanningView({ result, loading, hasGoals, onGenerate, onNavigate, onSelect }: { result: PlanningResult | null; loading: boolean; hasGoals: boolean; onGenerate: () => void; onNavigate: () => void; onSelect: (key: "A" | "B" | "C") => void }) {
  const [showAlternatives, setShowAlternatives] = useState(false);
  if (!result) return <AgentEmpty icon={Target} title="生成三套未来规划" description="围绕优先目标，对比目标优先、平衡和安全优先三条路径。" action="生成 Plan A / B / C" loading={loading} disabled={!hasGoals} disabledText="请先创建人生目标" onAction={hasGoals ? onGenerate : onNavigate} />;
  const recommendedKey = result.recommendedPlanKey ?? (result.plans.some((plan) => plan.key === "B") ? "B" : result.plans[0]?.key);
  const featured = result.plans.find((plan) => plan.key === result.selectedPlanKey) ?? result.plans.find((plan) => plan.key === recommendedKey) ?? result.plans[0];
  const alternatives = result.plans.filter((plan) => plan.key !== featured?.key);
  return <section className="planning-plan-section" aria-labelledby="planning-plan-title">
    {result.isStale && <StaleBanner onRefresh={onGenerate} loading={loading} />}
    <div className="planning-section-heading"><div><p className="planning-section-kicker">01 · 选择方向</p><h2 id="planning-plan-title">为“{result.goalName}”比较三条路径</h2><p>先看每月投入和目标日期，再决定哪套方案适合现在的生活。</p></div><button className="planning-text-button" onClick={onGenerate} disabled={loading}>{loading ? <LoaderCircle className="animate-spin" size={16} /> : <RefreshCw size={16} />}重新生成方案</button></div>
    {featured && <PlanCard plan={featured} selected={result.selectedPlanKey === featured.key} recommended={featured.key === recommendedKey} stale={result.isStale} onSelect={onSelect} />}
    {alternatives.length > 0 && <div className="planning-alternatives"><button className="planning-alternatives-toggle" type="button" aria-expanded={showAlternatives} onClick={() => setShowAlternatives((value) => !value)}><span>{showAlternatives ? "收起其他方案" : `查看其他方案（${alternatives.length}）`}</span><ChevronRight size={17} className={showAlternatives ? "rotate-90" : ""} /></button>{showAlternatives && <div className="planning-alternatives-list">{alternatives.map((plan) => <PlanCard key={plan.key} plan={plan} selected={result.selectedPlanKey === plan.key} recommended={plan.key === recommendedKey} stale={result.isStale} onSelect={onSelect} />)}</div>}</div>}
    <div className="planning-method-note"><ResultMeta mode={result.mode} createdAt={result.createdAt} /><span>按当前底账估算，不含投资收益；不代表收益保证。</span></div>
  </section>;
}

function PlanCard({ plan, selected, recommended, stale, onSelect }: { plan: PlanningResult["plans"][number]; selected: boolean; recommended: boolean; stale: boolean; onSelect: (key: "A" | "B" | "C") => void }) {
  return <article className={`planning-plan-card ${selected ? "is-selected" : ""}`}>
    <div className="planning-plan-top"><div className="planning-plan-identity"><span className="planning-plan-key">方案 {plan.key}</span><h3>{plan.name}</h3></div><div className="planning-plan-status">{recommended && <span className="is-recommended">系统推荐</span>}{selected && <span className="is-current"><Check size={14} />已选定</span>}<Feasibility value={plan.feasibility} /></div></div>
    <div className="planning-plan-metrics"><div><span>目标金额</span><strong>{money(plan.targetAmountMinor)}</strong></div><div><span>目标日期</span><strong>{new Date(plan.targetDate).toLocaleDateString("zh-CN", { year: "numeric", month: "long" })}</strong></div><div><span>每月投入</span><strong>{money(plan.monthlyContributionMinor)}</strong></div><div><span>投入后月结余</span><strong>{money(plan.monthlyCashflowAfterContributionMinor)}</strong></div></div>
    <div className="planning-plan-bottom"><details className="planning-plan-details"><summary>查看方案说明与取舍<ChevronRight size={15} /></summary><div><p><b>方案说明</b>{formatPlanningText(plan.summary)}</p><p><b>能获得</b>{formatPlanningText(plan.gain)}</p><p><b>需要权衡</b>{formatPlanningText(plan.sacrifice)}</p><p><b>预计资金缺口</b>{money(plan.projectedGapMinor)}</p></div></details><button className={selected ? "planning-plan-select is-current" : "planning-plan-select"} disabled={stale || selected} onClick={() => onSelect(plan.key)}>{selected ? <><Check size={16} />当前方案</> : <>选择此方案<ChevronRight size={16} /></>}</button></div>
  </article>;
}

export function FuturePlanningPreview({ result, planning, loading, adopting, onGenerate, onAdopt, onViewExecution }: { result: FuturePlanningResult | null; planning: PlanningResult | null; loading: boolean; adopting: boolean; onGenerate: () => void; onAdopt: (reportId: string) => void; onViewExecution: () => void }) {
  const selectedPlan = planning?.plans.find((plan) => plan.key === planning.selectedPlanKey) ?? null;
  const currentResult = result && planning && result.planSetId === planning.id && result.planKey === planning.selectedPlanKey ? result : null;
  return <section className="planning-action-section" aria-labelledby="planning-action-title">
    <div className="planning-section-heading"><div><p className="planning-section-kicker">02 · 开始行动</p><h2 id="planning-action-title">未来3个月行动清单</h2><p>先处理最紧要的事项，具体步骤按需展开。</p></div>{selectedPlan && <button className="planning-text-button" disabled={loading || planning?.isStale} onClick={onGenerate}>{loading ? <LoaderCircle className="animate-spin" size={16} /> : <RefreshCw size={16} />}{currentResult ? "重新生成清单" : "生成行动清单"}</button>}</div>
    {!selectedPlan && <div className="planning-empty-state">先在上方选择一套方案，再生成行动清单。</div>}
    {selectedPlan && !currentResult && <div className="planning-empty-state">已选“{selectedPlan.name}”。生成清单后，可先查看行动内容，再决定是否开始执行。</div>}
    {currentResult?.isStale && <div className="planning-stale-note">底账已变化，这份行动清单仅保留为历史参考。</div>}
    {currentResult?.report ? <StructuredPlanningReport result={currentResult} adopting={adopting} onAdopt={onAdopt} onViewExecution={onViewExecution} /> : currentResult ? <details className="planning-legacy-report"><summary>查看旧版文本报告</summary><p>{formatPlanningText(currentResult.reportText)}</p></details> : null}
  </section>;
}

function StructuredPlanningReport({ result, adopting, onAdopt, onViewExecution }: { result: FuturePlanningResult; adopting: boolean; onAdopt: (reportId: string) => void; onViewExecution: () => void }) {
  const report = result.report!;
  const completeness = { INSUFFICIENT: "信息不足", BASIC: "基本够用", COMPLETE: "信息完整" }[report.information_completeness];
  const risks = report.risks ?? [];
  return <div className="planning-report">
    <div className="planning-report-summary"><div><span className="planning-report-completeness">{completeness}</span><h3>{formatPlanningText(report.summary)}</h3><ResultMeta mode={result.mode} createdAt={result.createdAt} /></div><div className="planning-report-count"><strong>{formatPlanningText(String(report.actions.length))}</strong><span>项近期行动</span></div></div>
    {report.actions.length > 0 && !result.isStale && <div className="planning-adopt-row"><div><strong>{result.adoptedAt ? "这份方案已进入执行进度" : "准备好按这份清单行动？"}</strong><p>{result.adoptedAt ? "可继续记录完成、暂缓或调整情况。" : "采用后，清单会进入执行进度，方便逐项跟进。"}</p></div><button className="button-primary" disabled={adopting} onClick={() => result.adoptedAt ? onViewExecution() : onAdopt(result.id)}>{adopting ? <LoaderCircle className="animate-spin" size={16} /> : result.adoptedAt ? <ChevronRight size={16} /> : <Check size={16} />}{result.adoptedAt ? "查看执行进度" : "采用此方案并开始执行"}</button></div>}
    {report.actions.length > 0 && <div className="planning-task-list"><div className="planning-task-list-heading"><h3>优先行动</h3><span>点击任务查看步骤与完成标准</span></div>{report.actions.map((action, index) => <details key={action.id} className="planning-task" open={index === 0}><summary><span className={`planning-task-priority priority-${action.priority.toLowerCase()}`}>{action.priority}</span><span className="planning-task-title"><strong>{formatPlanningText(action.title)}</strong><small>{formatPlanningText(action.reason)}</small></span><span className="planning-task-due">{formatPlanningText(String(action.due_in_days))}天内</span><ChevronRight size={17} className="planning-task-chevron" /></summary><div className="planning-task-body">{action.amount !== null && <p className="planning-task-amount">涉及金额 <strong>{money(action.amount)}</strong></p>}<ol>{action.steps.map((step, stepIndex) => <li key={`${action.id}-${stepIndex}`}><span>{formatPlanningText(String(stepIndex + 1))}</span>{formatPlanningText(step)}</li>)}</ol><div className="planning-task-criteria"><b>完成标准</b><p>{formatPlanningText(action.completion_criteria)}</p></div></div></details>)}</div>}
    {(risks.length > 0 || report.assumptions.length > 0 || report.missing_information.length > 0) && <details className="planning-support"><summary><span>规划依据与待确认事项</span><span>{formatPlanningText(String(risks.length + report.assumptions.length + report.missing_information.length))} 项提醒</span><ChevronRight size={17} /></summary><div className="planning-support-content">{risks.length > 0 && <div><h4>需要留意的风险</h4>{risks.map((risk) => <article key={risk.id}><strong>{formatPlanningText(risk.title)}</strong><p>{formatPlanningText(risk.impact)}</p><p>建议：{formatPlanningText(risk.direction)}</p></article>)}</div>}{report.missing_information.length > 0 && <div><h4>还需要确认</h4>{report.missing_information.map((item) => <article key={item.field}><strong>{formatPlanningText(item.question)}</strong><p>{formatPlanningText(item.why_needed)}</p></article>)}</div>}{report.assumptions.length > 0 && <div><h4>测算假设</h4><ul>{report.assumptions.map((item, index) => <li key={index}>{formatPlanningText(item)}</li>)}</ul></div>}</div></details>}
    <p className="planning-disclaimer">{formatPlanningText(report.disclaimer)}</p>
  </div>;
}

function Feasibility({ value }: { value: string }) {
  const config = value === "FEASIBLE" ? ["可执行", "bg-green-50 text-green-700"] : value === "TIGHT" ? ["现金流偏紧", "bg-amber-50 text-amber-700"] : ["当前不可行", "bg-rose-50 text-rose-700"];
  return <span className={`px-2 py-1 text-[10px] font-bold ${config[1]}`}>{config[0]}</span>;
}

function AgentEmpty({ icon: Icon, title, description, action, disabled, disabledText, loading, onAction }: { icon: typeof Bot; title: string; description: string; action: string; disabled: boolean; disabledText: string; loading: boolean; onAction: () => void }) {
  return <div className="flex min-h-[65vh] flex-col items-center justify-center text-center"><span className="grid size-14 place-items-center bg-blue-50 text-blue-700"><Icon size={25} /></span><h1 className="mt-5 text-xl font-semibold">{title}</h1><p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{description}</p><button className={disabled ? "button-secondary mt-6" : "button-primary mt-6"} onClick={onAction} disabled={loading}>{loading ? <LoaderCircle className="animate-spin" size={16} /> : disabled ? <AlertTriangle size={16} /> : <Sparkles size={16} />}{disabled ? disabledText : action}</button></div>;
}
