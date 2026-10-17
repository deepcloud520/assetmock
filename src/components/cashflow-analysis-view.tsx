"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BarChart3, CheckCircle2, LoaderCircle, RefreshCw, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { currentDateInChina } from "@/domain/transactions";

type PeriodKind = "MONTH" | "QUARTER" | "YEAR";
type CategoryStat = { category: string; direction: "INCOME" | "EXPENSE"; amountMinor: string; count: number; shareBps: number | null; previousAmountMinor: string; changeBps: number | null };
type Statistics = {
  label: string; previousLabel: string; transactionCount: number; excludedCount: number;
  incomeMinor: string; expenseMinor: string; balanceMinor: string; savingsRateBps: number | null;
  previous: { transactionCount: number; incomeMinor: string; expenseMinor: string; balanceMinor: string };
  changes: { incomeBps: number | null; expenseBps: number | null; balanceBps: number | null };
  categories: CategoryStat[]; dataCompleteness: "EMPTY" | "LIMITED" | "SUFFICIENT";
};
type Report = {
  status: "NO_DATA" | "LIMITED" | "READY"; summary: string;
  findings: Array<{ title: string; severity: "INFO" | "ATTENTION" | "RISK"; evidence: string[]; interpretation: string }>;
  recommendations: Array<{ title: string; priority: "P0" | "P1" | "P2"; reason: string; steps: string[] }>;
  missingInformation: string[]; disclaimer: string;
};
type AnalysisResult = { id: string; transactionRevision: number; isStale: boolean; mode: "OPENAI" | "FALLBACK"; createdAt: string; acceptedRecommendationIndexes: number[]; statistics: Statistics; report: Report };

function money(value: string) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2 }).format(Number(BigInt(value)) / 100);
}

function percent(bps: number | null, signed = false) {
  if (bps === null) return "暂无对比";
  const value = bps / 100;
  return `${signed && value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function CashflowAnalysisView({ workspaceId, transactionRevision, onActionAdded }: { workspaceId: string; transactionRevision: number; onActionAdded?: () => void }) {
  const today = currentDateInChina();
  const [periodKind, setPeriodKind] = useState<PeriodKind>("MONTH");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [acceptingIndex, setAcceptingIndex] = useState<number | null>(null);
  const [error, setError] = useState("");
  const anchorDate = `${month}-01`;

  const loadExisting = useCallback(async () => {
    try {
      setError("");
      const params = new URLSearchParams({ periodKind, anchorDate });
      const response = await fetch(`/api/cashflow-analyses?${params}`, { headers: { "X-Workspace-Id": workspaceId } });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "读取分析失败");
      setResult(body as AnalysisResult | null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "读取分析失败"); }
  }, [anchorDate, periodKind, workspaceId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadExisting(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadExisting]);

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/cashflow-analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Workspace-Id": workspaceId },
        body: JSON.stringify({ periodKind, anchorDate }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "生成分析失败");
      setResult(body as AnalysisResult);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "生成分析失败"); }
    finally { setLoading(false); }
  }

  async function acceptRecommendation(index: number) {
    if (!result) return;
    setAcceptingIndex(index);
    setError("");
    try {
      const response = await fetch(`/api/cashflow-analyses/${result.id}/recommendations/${index}/accept`, { method: "POST", headers: { "X-Workspace-Id": workspaceId } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "加入执行进度失败");
      setResult({ ...result, acceptedRecommendationIndexes: [...new Set([...result.acceptedRecommendationIndexes, index])] });
      onActionAdded?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "加入执行进度失败"); }
    finally { setAcceptingIndex(null); }
  }

  const stale = Boolean(result && (result.isStale || result.transactionRevision !== transactionRevision));
  const expenseCategories = result?.statistics.categories.filter((item) => item.direction === "EXPENSE") ?? [];
  const maxExpense = expenseCategories.reduce((max, item) => BigInt(item.amountMinor) > max ? BigInt(item.amountMinor) : max, 0n);

  return <section className="cashflow-analysis space-y-5" aria-labelledby="cashflow-analysis-title">
    <div className="flex flex-wrap items-end justify-between gap-4 border border-slate-300 bg-white p-4 sm:p-5">
      <div><p className="eyebrow">周期复盘</p><h2 id="cashflow-analysis-title" className="mt-1 text-xl font-semibold">收支管理与建议</h2><p className="mt-2 text-sm text-slate-500">按周期比较收入、支出和类别变化，由 Agent 给出具体管理建议。</p></div>
      <button className="button-primary" onClick={generate} disabled={loading}>{loading ? <LoaderCircle className="animate-spin" size={16} /> : result ? <RefreshCw size={16} /> : <Sparkles size={16} />}{result ? "重新分析" : "生成分析"}</button>
      <div className="flex w-full flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
        <fieldset className="field"><span>分析周期</span><div className="inline-flex min-h-[2.65rem] border border-slate-300 p-1">{(["MONTH", "QUARTER", "YEAR"] as PeriodKind[]).map((kind) => <button type="button" key={kind} className={`px-4 text-sm font-semibold ${periodKind === kind ? "bg-blue-700 text-white" : "text-slate-600"}`} onClick={() => setPeriodKind(kind)}>{kind === "MONTH" ? "月度" : kind === "QUARTER" ? "季度" : "年度"}</button>)}</div></fieldset>
        <label className="field min-w-[10rem]"><span>选择时间</span><input type="month" max={today.slice(0, 7)} value={month} onChange={(event) => setMonth(event.target.value)} /></label>
        <p className="pb-3 text-xs text-slate-400">{periodKind === "MONTH" ? "与上月比较" : periodKind === "QUARTER" ? "与上季度比较" : "与上年度比较"}</p>
      </div>
    </div>

    {error && <div className="border-l-4 border-rose-500 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
    {stale && <div className="flex items-center gap-2 border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-900"><AlertTriangle size={17} />流水已变化，以下报告基于旧版账本，请重新分析。</div>}

    {!result ? <div className="grid min-h-[25rem] place-items-center border border-slate-300 bg-white px-6 text-center"><div className="max-w-md"><BarChart3 className="mx-auto text-slate-400" size={36} /><h3 className="mt-4 text-lg font-semibold">选择周期后生成第一份分析</h3><p className="mt-2 text-sm leading-6 text-slate-500">系统会先完成准确统计，再由 Agent 解释哪些收入或开支发生了值得关注的变化。</p></div></div> : <>
      <div className="border border-slate-300 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="analysis-period-label text-xs font-semibold">{result.statistics.label}</p><h3 className="mt-1 text-lg font-semibold">{result.report.summary}</h3></div><span className="bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500">{result.mode === "OPENAI" ? "Agent 分析" : "基础分析"}</span></div>{result.statistics.dataCompleteness !== "SUFFICIENT" && <p className="mt-3 text-sm text-amber-700">{result.statistics.dataCompleteness === "EMPTY" ? "本周期没有可分析流水。" : "本周期有效流水较少，趋势结论仅供初步参考。"}</p>}</div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="收入" value={money(result.statistics.incomeMinor)} change={result.statistics.changes.incomeBps} />
        <Metric label="支出" value={money(result.statistics.expenseMinor)} change={result.statistics.changes.expenseBps} inverse />
        <Metric label="结余" value={money(result.statistics.balanceMinor)} change={result.statistics.changes.balanceBps} />
        <Metric label="储蓄率" value={percent(result.statistics.savingsRateBps)} detail={`${result.statistics.transactionCount}笔计入，${result.statistics.excludedCount}笔排除`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="border border-slate-300 bg-white p-5"><div className="flex items-center justify-between"><h3 className="font-semibold">支出结构</h3><span className="text-xs text-slate-400">对比 {result.statistics.previousLabel}</span></div>{expenseCategories.length ? <div className="mt-5 space-y-4">{expenseCategories.map((item) => <div key={item.category}><div className="flex items-end justify-between gap-3 text-sm"><div><span className="font-medium">{item.category}</span><span className="ml-2 text-xs text-slate-400">{item.count}笔 · {percent(item.shareBps)}</span></div><div className="text-right"><b className="tabular-nums">{money(item.amountMinor)}</b><p className={`text-xs ${item.changeBps !== null && item.changeBps > 0 ? "text-rose-600" : "text-slate-400"}`}>{percent(item.changeBps, true)}</p></div></div><div className="mt-2 h-2 bg-slate-100"><span className="block h-full bg-blue-600" style={{ width: maxExpense === 0n ? "0%" : `${Math.max(3, Number(BigInt(item.amountMinor) * 100n / maxExpense))}%` }} /></div></div>)}</div> : <p className="mt-8 text-center text-sm text-slate-400">本周期没有计入统计的支出。</p>}</section>

        <section className="border border-slate-300 bg-white p-5"><h3 className="font-semibold">Agent 发现</h3>{result.report.findings.length ? <div className="mt-4 space-y-3">{result.report.findings.map((finding) => <article key={finding.title} className="border-l-2 border-slate-300 pl-3"><div className="flex items-center gap-2"><h4 className="text-sm font-semibold">{finding.title}</h4><span className={`text-[10px] font-bold ${finding.severity === "RISK" ? "text-rose-700" : finding.severity === "ATTENTION" ? "text-amber-700" : "text-blue-700"}`}>{finding.severity === "RISK" ? "风险" : finding.severity === "ATTENTION" ? "关注" : "信息"}</span></div><p className="mt-1 text-sm leading-6 text-slate-600">{finding.interpretation}</p><ul className="mt-1 text-xs leading-5 text-slate-400">{finding.evidence.map((evidence) => <li key={evidence}>{evidence}</li>)}</ul></article>)}</div> : <p className="mt-8 text-center text-sm text-slate-400">暂无足够数据形成趋势发现。</p>}</section>
      </div>

      <section className="border border-slate-300 bg-white p-5"><div><h3 className="font-semibold">下一周期建议</h3><p className="mt-1 text-xs text-slate-500">建议不会自动成为任务；选择需要执行的内容后，再加入执行进度。</p></div><div className="mt-4 grid gap-3 md:grid-cols-2">{result.report.recommendations.map((item, index) => { const accepted = result.acceptedRecommendationIndexes.includes(index); return <article key={`${index}-${item.title}`} className="flex flex-col border border-slate-200 p-4"><div className="flex items-center gap-2"><span className="grid size-7 place-items-center bg-slate-900 text-[10px] font-bold text-white">{item.priority}</span><h4 className="text-sm font-semibold">{item.title}</h4></div><p className="mt-2 text-sm leading-6 text-slate-500">{item.reason}</p><ol className="mt-2 list-decimal pl-5 text-sm leading-6 text-slate-700">{item.steps.map((step) => <li key={step}>{step}</li>)}</ol><button className={accepted ? "button-secondary mt-4 self-start" : "button-primary mt-4 self-start"} disabled={accepted || stale || acceptingIndex !== null} onClick={() => acceptRecommendation(index)}>{acceptingIndex === index ? <LoaderCircle className="animate-spin" size={16} /> : accepted ? <CheckCircle2 size={16} /> : <CheckCircle2 size={16} />}{accepted ? "已加入执行进度" : "加入执行进度"}</button></article>; })}</div>{result.report.missingInformation.length > 0 && <div className="mt-4 border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-900">仍需补充：{result.report.missingInformation.join("；")}</div>}<p className="mt-4 text-xs text-slate-400">{result.report.disclaimer}</p></section>
    </>}
  </section>;
}

function Metric({ label, value, change, detail, inverse = false }: { label: string; value: string; change?: number | null; detail?: string; inverse?: boolean }) {
  const improved = change !== undefined && change !== null && (inverse ? change <= 0 : change >= 0);
  return <div className="border border-slate-300 bg-white p-4"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>{detail ? <p className="mt-2 text-xs text-slate-400">{detail}</p> : <p className={`mt-2 flex items-center gap-1 text-xs ${change === null ? "text-slate-400" : improved ? "text-green-700" : "text-rose-700"}`}>{change !== null && change !== undefined ? change >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} /> : <CheckCircle2 size={14} />}{percent(change ?? null, true)}</p>}</div>;
}
