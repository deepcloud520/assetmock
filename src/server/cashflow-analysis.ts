import { modelConfig } from "@/lib/model-config";
import { z } from "zod";
import { db } from "@/lib/db";
import { cashflowAnalysisInputSchema, cashflowPeriodBounds, changeBps, ratioBps, type CashflowPeriodKind } from "@/domain/cashflow-analysis";
import { ApiError, assertWorkspace, serialize } from "./portfolio";
import { structuredResponse } from "./agent-runtime";

export const CASHFLOW_ANALYSIS_PROMPT_VERSION = "cashflow-analysis-v2";

type AnalysisTransaction = { direction: string; amountMinor: bigint; category: string; analysisTreatment: string };

function summarize(items: AnalysisTransaction[]) {
  const counted = items.filter((item) => item.analysisTreatment === "COUNT");
  const income = counted.filter((item) => item.direction === "INCOME");
  const expense = counted.filter((item) => item.direction === "EXPENSE");
  const incomeMinor = income.reduce((sum, item) => sum + item.amountMinor, 0n);
  const expenseMinor = expense.reduce((sum, item) => sum + item.amountMinor, 0n);
  const categories = new Map<string, { direction: string; amountMinor: bigint; count: number }>();
  for (const item of counted) {
    const current = categories.get(item.category) ?? { direction: item.direction, amountMinor: 0n, count: 0 };
    current.amountMinor += item.amountMinor;
    current.count += 1;
    categories.set(item.category, current);
  }
  return { incomeMinor, expenseMinor, balanceMinor: incomeMinor - expenseMinor, countedCount: counted.length, excludedCount: items.length - counted.length, categories };
}

function toSerializableStats(periodKind: CashflowPeriodKind, bounds: ReturnType<typeof cashflowPeriodBounds>, currentItems: AnalysisTransaction[], previousItems: AnalysisTransaction[]) {
  const current = summarize(currentItems);
  const previous = summarize(previousItems);
  const categoryRows = [...current.categories.entries()].map(([category, value]) => {
    const previousValue = previous.categories.get(category)?.amountMinor ?? 0n;
    const base = value.direction === "INCOME" ? current.incomeMinor : current.expenseMinor;
    return {
      category,
      direction: value.direction,
      amountMinor: value.amountMinor.toString(),
      count: value.count,
      shareBps: ratioBps(value.amountMinor, base),
      previousAmountMinor: previousValue.toString(),
      changeBps: changeBps(value.amountMinor, previousValue),
    };
  }).sort((a, b) => BigInt(b.amountMinor) > BigInt(a.amountMinor) ? 1 : -1);
  return {
    periodKind,
    label: bounds.label,
    periodStart: bounds.start.toISOString().slice(0, 10),
    periodEndExclusive: bounds.end.toISOString().slice(0, 10),
    previousLabel: bounds.previousLabel,
    transactionCount: current.countedCount,
    excludedCount: current.excludedCount,
    incomeMinor: current.incomeMinor.toString(),
    expenseMinor: current.expenseMinor.toString(),
    balanceMinor: current.balanceMinor.toString(),
    savingsRateBps: ratioBps(current.balanceMinor, current.incomeMinor),
    previous: {
      transactionCount: previous.countedCount,
      incomeMinor: previous.incomeMinor.toString(),
      expenseMinor: previous.expenseMinor.toString(),
      balanceMinor: previous.balanceMinor.toString(),
    },
    changes: {
      incomeBps: changeBps(current.incomeMinor, previous.incomeMinor),
      expenseBps: changeBps(current.expenseMinor, previous.expenseMinor),
      balanceBps: changeBps(current.balanceMinor, previous.balanceMinor),
    },
    categories: categoryRows,
    dataCompleteness: current.countedCount === 0 ? "EMPTY" : current.countedCount < 5 ? "LIMITED" : "SUFFICIENT",
  };
}

const reportSchema = z.object({
  status: z.enum(["NO_DATA", "LIMITED", "READY"]),
  summary: z.string().min(1).max(120),
  findings: z.array(z.object({
    title: z.string().min(1).max(60),
    severity: z.enum(["INFO", "ATTENTION", "RISK"]),
    evidence: z.array(z.string().min(1).max(140)).min(1).max(3),
    interpretation: z.string().min(1).max(220),
  }).strict()).max(4),
  recommendations: z.array(z.object({
    title: z.string().min(1).max(60),
    priority: z.enum(["P0", "P1", "P2"]),
    reason: z.string().min(1).max(180),
    steps: z.array(z.string().min(1).max(140)).min(1).max(3),
  }).strict()).max(4),
  missingInformation: z.array(z.string().min(1).max(120)).max(5),
  disclaimer: z.literal("本分析基于已录入流水，用于收支管理参考，不构成投资建议。"),
}).strict();

export type CashflowAgentReport = z.infer<typeof reportSchema>;

const reportJsonSchema = {
  type: "object", additionalProperties: false,
  required: ["status", "summary", "findings", "recommendations", "missingInformation", "disclaimer"],
  properties: {
    status: { type: "string", enum: ["NO_DATA", "LIMITED", "READY"] },
    summary: { type: "string", minLength: 1, maxLength: 120 },
    findings: { type: "array", maxItems: 4, items: { type: "object", additionalProperties: false, required: ["title", "severity", "evidence", "interpretation"], properties: {
      title: { type: "string", maxLength: 60 }, severity: { type: "string", enum: ["INFO", "ATTENTION", "RISK"] },
      evidence: { type: "array", minItems: 1, maxItems: 3, items: { type: "string", maxLength: 140 } }, interpretation: { type: "string", maxLength: 220 },
    } } },
    recommendations: { type: "array", maxItems: 4, items: { type: "object", additionalProperties: false, required: ["title", "priority", "reason", "steps"], properties: {
      title: { type: "string", maxLength: 60 }, priority: { type: "string", enum: ["P0", "P1", "P2"] }, reason: { type: "string", maxLength: 180 },
      steps: { type: "array", minItems: 1, maxItems: 3, items: { type: "string", maxLength: 140 } },
    } } },
    missingInformation: { type: "array", maxItems: 5, items: { type: "string", maxLength: 120 } },
    disclaimer: { type: "string", enum: ["本分析基于已录入流水，用于收支管理参考，不构成投资建议。"] },
  },
};

const instructions = `你是AI资产管家的收支分析Agent。程序会提供当前周期与上一周期的确定性统计，你只负责解释，不得重新计算、修改或补充数字。行动建议的 title 用不超过8个汉字概括具体事项，细节放在 reason 和 steps 中。
重点识别：收入稳定性、支出结构、结余变化、增长较快的支出类别、异常集中和可执行的管理动作。
每个判断必须引用输入中的具体数字或事实。变化率为基点，100基点等于1%；null表示缺少可比较基数，不得写成0%。
数据为空时只说明需要先记账；数据有限时明确结论仅供初步参考。不得杜撰消费原因、家庭情况或用户偏好。
建议应具体到核对、设定提醒、复盘类别或调整预算，不推荐具体金融产品，不承诺收益，不制造焦虑。`;

function fallbackReport(stats: ReturnType<typeof toSerializableStats>): CashflowAgentReport {
  if (stats.dataCompleteness === "EMPTY") return {
    status: "NO_DATA", summary: `${stats.label}尚无可计入分析的流水，请先记录收入和支出。`, findings: [], recommendations: [{ title: "开始连续记账", priority: "P0", reason: "没有流水时无法判断收支结构和变化", steps: ["先记录本周期内的主要收入与支出", "转账、退款和信用卡还款按特殊流水标记"] }], missingInformation: ["当前周期的收入与支出流水"], disclaimer: "本分析基于已录入流水，用于收支管理参考，不构成投资建议。",
  };
  const topExpense = stats.categories.find((item) => item.direction === "EXPENSE");
  return {
    status: stats.dataCompleteness === "LIMITED" ? "LIMITED" : "READY",
    summary: `${stats.label}已记录${stats.transactionCount}笔有效流水，收入、支出和结余已完成程序统计。`,
    findings: topExpense ? [{ title: "主要支出类别", severity: "INFO", evidence: [`${topExpense.category}支出${topExpense.amountMinor}分，共${topExpense.count}笔`], interpretation: "该类别是当前已录入支出中金额较高的一项，可优先核对是否完整和必要。" }] : [],
    recommendations: [{ title: "复核本周期流水", priority: "P1", reason: "完整记录后，周期对比和类别变化才更可靠", steps: ["检查是否遗漏固定支出和主要收入", "确认特殊流水已正确排除"] }],
    missingInformation: stats.dataCompleteness === "LIMITED" ? ["当前周期流水数量较少，趋势判断有限"] : [],
    disclaimer: "本分析基于已录入流水，用于收支管理参考，不构成投资建议。",
  };
}

function validateReportNumbers(report: CashflowAgentReport, stats: ReturnType<typeof toSerializableStats>) {
  const allowed = new Set(JSON.stringify(stats).match(/-?\d+(?:\.\d+)?/g) ?? []);
  const claims = [
    report.summary,
    ...report.findings.flatMap((finding) => [finding.title, ...finding.evidence, finding.interpretation]),
    ...report.recommendations.flatMap((recommendation) => [recommendation.title, recommendation.reason, ...recommendation.steps]),
    ...report.missingInformation,
  ];
  for (const claim of claims) {
    const unsupported = (claim.match(/-?\d+(?:\.\d+)?/g) ?? []).find((value) => !allowed.has(value));
    if (unsupported) throw new Error(`CASHFLOW_ANALYSIS_UNSUPPORTED_NUMBER:${unsupported}`);
  }
}

async function generateReport(stats: ReturnType<typeof toSerializableStats>) {
  try {
    const raw = await structuredResponse<unknown>(instructions, { promptVersion: CASHFLOW_ANALYSIS_PROMPT_VERSION, statistics: stats }, "cashflow_analysis", reportJsonSchema);
    const report = reportSchema.parse(raw);
    validateReportNumbers(report, stats);
    return { report, mode: "OPENAI" as const, model: modelConfig('OPENAI').MODEL?.trim() || "not-configured" };
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (["OPENAI_DISABLED_IN_TEST", "OPENAI_NOT_CONFIGURED"].includes(code)) {
      return { report: fallbackReport(stats), mode: "FALLBACK" as const, model: "deterministic-fallback" };
    }
    throw new ApiError("AI 收支分析结果未通过校验，本次报告未保存，请稍后重试", 502);
  }
}

async function calculateStatistics(workspaceId: string, periodKind: CashflowPeriodKind, anchorDate: string) {
  const bounds = cashflowPeriodBounds(periodKind, anchorDate);
  const [currentItems, previousItems] = await Promise.all([
    db.transaction.findMany({ where: { workspaceId, deletedAt: null, occurredOn: { gte: bounds.start, lt: bounds.end } }, select: { direction: true, amountMinor: true, category: true, analysisTreatment: true } }),
    db.transaction.findMany({ where: { workspaceId, deletedAt: null, occurredOn: { gte: bounds.previousStart, lt: bounds.previousEnd } }, select: { direction: true, amountMinor: true, category: true, analysisTreatment: true } }),
  ]);
  return { bounds, stats: toSerializableStats(periodKind, bounds, currentItems, previousItems) };
}

async function present(record: { id: string; workspaceId: string; transactionRevision: number; periodKind: string; periodStart: Date; periodEnd: Date; statisticsJson: string; agentReportJson: string; model: string; promptVersion: string; createdAt: Date }, currentRevision: number) {
  const payload = JSON.parse(record.agentReportJson) as { mode: string; report: CashflowAgentReport };
  const accepted = await db.action.findMany({ where: { workspaceId: record.workspaceId, generationTaskId: { startsWith: `cashflow:${record.id}` } }, select: { kind: true, generationTaskId: true } });
  const acceptedRecommendationIndexes = accepted.flatMap((action) => {
    const value = Number(action.kind.startsWith("CASHFLOW_RECOMMENDATION_")
      ? action.kind.replace("CASHFLOW_RECOMMENDATION_", "")
      : action.generationTaskId.split(":recommendation:")[1]);
    return Number.isInteger(value) ? [value] : [];
  });
  return serialize({ ...record, statistics: JSON.parse(record.statisticsJson), report: payload.report, mode: payload.mode, isStale: record.transactionRevision !== currentRevision, acceptedRecommendationIndexes });
}

export async function runCashflowAnalysis(workspaceId: string, body: unknown) {
  const workspace = await assertWorkspace(workspaceId);
  const input = cashflowAnalysisInputSchema.parse(body);
  const { bounds, stats } = await calculateStatistics(workspaceId, input.periodKind, input.anchorDate);
  const generated = await generateReport(stats);
  const record = await db.$transaction(async (tx) => {
    const current = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { transactionRevision: true } });
    if (current.transactionRevision !== workspace.transactionRevision) throw new ApiError("分析期间流水发生变化，请重新生成", 409);
    return tx.cashflowAnalysis.create({ data: {
      workspaceId,
      periodKind: input.periodKind,
      periodStart: bounds.start,
      periodEnd: bounds.end,
      transactionRevision: workspace.transactionRevision,
      statisticsJson: JSON.stringify(stats),
      agentReportJson: JSON.stringify({ mode: generated.mode, report: generated.report }),
      model: generated.model,
      promptVersion: CASHFLOW_ANALYSIS_PROMPT_VERSION,
    } });
  });
  return present(record, workspace.transactionRevision);
}

export async function getCashflowAnalysis(workspaceId: string, searchParams: URLSearchParams) {
  const workspace = await assertWorkspace(workspaceId);
  const input = cashflowAnalysisInputSchema.parse({ periodKind: searchParams.get("periodKind"), anchorDate: searchParams.get("anchorDate") });
  const bounds = cashflowPeriodBounds(input.periodKind, input.anchorDate);
  const record = await db.cashflowAnalysis.findFirst({ where: { workspaceId, periodKind: input.periodKind, periodStart: bounds.start, periodEnd: bounds.end }, orderBy: { createdAt: "desc" } });
  return record ? present(record, workspace.transactionRevision) : null;
}


export async function acceptCashflowRecommendation(workspaceId: string, analysisId: string, recommendationIndexValue: unknown) {
  const recommendationIndex = z.number().int().nonnegative().parse(recommendationIndexValue);
  const generationTaskId = `cashflow:${analysisId}:recommendation:${recommendationIndex}`;
  const sourceKey = generationTaskId;
  try {
    return await db.$transaction(async (tx) => {
    const [analysis, workspace] = await Promise.all([
      tx.cashflowAnalysis.findFirst({ where: { id: analysisId, workspaceId } }),
      tx.workspace.findUnique({ where: { id: workspaceId }, select: { transactionRevision: true } }),
    ]);
    if (!analysis || !workspace) throw new ApiError("收支分析报告不存在", 404);
    if (analysis.transactionRevision !== workspace.transactionRevision) throw new ApiError("流水已变化，请重新分析后再采纳建议", 409);
    const payload = JSON.parse(analysis.agentReportJson) as { report: CashflowAgentReport };
    const recommendation = payload.report.recommendations[recommendationIndex];
    if (!recommendation) throw new ApiError("这条建议不存在", 404);
    const legacyKind = `CASHFLOW_RECOMMENDATION_${recommendationIndex}`;
    const existing = await tx.action.findFirst({ where: { workspaceId, OR: [
      { sourceKey },
      { generationTaskId: `cashflow:${analysis.id}`, kind: legacyKind },
    ] } });
    if (existing) return serialize({ action: existing, created: false });
    const priority = recommendation.priority === "P0" ? 1 : recommendation.priority === "P1" ? 2 : 3;
    const dueDate = new Date();
    dueDate.setUTCDate(dueDate.getUTCDate() + (analysis.periodKind === "MONTH" ? 30 : analysis.periodKind === "QUARTER" ? 90 : 365));
    const action = await tx.action.create({ data: {
      workspaceId,
      sourceKey,
      generationTaskId,
      sourceRevision: analysis.transactionRevision,
      kind: "CASHFLOW_ADVICE",
      title: recommendation.title,
      reason: recommendation.reason,
      amountMinor: null,
      priority,
      dueDate,
      status: "ACCEPTED",
      verificationType: "CASHFLOW_REANALYSIS",
      detailsJson: JSON.stringify({
        riskId: `cashflow:${analysis.id}`,
        steps: recommendation.steps,
        prerequisites: [],
        completionCriteria: "建议步骤已完成，并记录了执行结果",
        verificationRequired: "下一周期新增流水后重新生成收支分析，核对变化是否持续",
      }),
    } });
    return serialize({ action, created: true });
    });
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
    const existing = await db.action.findFirst({ where: { workspaceId, sourceKey } });
    if (!existing) throw error;
    return serialize({ action: existing, created: false });
  }
}
