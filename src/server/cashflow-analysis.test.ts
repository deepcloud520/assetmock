import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { acceptCashflowRecommendation, getCashflowAnalysis, runCashflowAnalysis } from "./cashflow-analysis";
import { getExecutionResults, transitionAction } from "./execution-results";

type TestedAnalysis = {
  mode: string;
  isStale: boolean;
  statistics: {
    incomeMinor: string;
    expenseMinor: string;
    balanceMinor: string;
    transactionCount: number;
    excludedCount: number;
    changes: { expenseBps: number | null };
    categories: Array<{ category: string; previousAmountMinor: string; changeBps: number | null }>;
  };
  report: { status: string };
};

describe("cashflow analysis", () => {
  let workspaceId = "";

  beforeAll(async () => {
    const workspace = await db.workspace.create({ data: { transactionRevision: 1 } });
    workspaceId = workspace.id;
    await db.transaction.createMany({ data: [
      { workspaceId, direction: "INCOME", amountMinor: 1000000n, occurredOn: new Date("2026-09-05T00:00:00.000Z"), description: "工资", category: "工资收入", specialKind: "NONE", analysisTreatment: "COUNT", source: "MANUAL", classificationSource: "USER" },
      { workspaceId, direction: "EXPENSE", amountMinor: 50000n, occurredOn: new Date("2026-09-10T00:00:00.000Z"), description: "餐饮", category: "餐饮", specialKind: "NONE", analysisTreatment: "COUNT", source: "MANUAL", classificationSource: "USER" },
      { workspaceId, direction: "EXPENSE", amountMinor: 200000n, occurredOn: new Date("2026-09-12T00:00:00.000Z"), description: "信用卡还款", category: "债务还款", specialKind: "CREDIT_CARD_PAYMENT", analysisTreatment: "EXCLUDE", source: "MANUAL", classificationSource: "USER" },
      { workspaceId, direction: "EXPENSE", amountMinor: 25000n, occurredOn: new Date("2026-08-10T00:00:00.000Z"), description: "餐饮", category: "餐饮", specialKind: "NONE", analysisTreatment: "COUNT", source: "MANUAL", classificationSource: "USER" },
    ] });
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
    await db.$disconnect();
  });

  it("calculates deterministic statistics and stores a fallback report", async () => {
    const result = await runCashflowAnalysis(workspaceId, { periodKind: "MONTH", anchorDate: "2026-09-01" }) as unknown as TestedAnalysis;
    expect(result.mode).toBe("FALLBACK");
    expect(result.statistics).toMatchObject({
      incomeMinor: "1000000", expenseMinor: "50000", balanceMinor: "950000", transactionCount: 2, excludedCount: 1,
      changes: { expenseBps: 10000 },
    });
    expect(result.statistics.categories.find((item: { category: string }) => item.category === "餐饮")).toMatchObject({ previousAmountMinor: "25000", changeBps: 10000 });
    expect(result.report.status).toBe("LIMITED");
    expect(await db.cashflowAnalysis.count({ where: { workspaceId } })).toBe(1);
  });


  it("marks a saved report stale after the transaction revision changes", async () => {
    await db.workspace.update({ where: { id: workspaceId }, data: { transactionRevision: { increment: 1 } } });
    const result = await getCashflowAnalysis(workspaceId, new URLSearchParams({ periodKind: "MONTH", anchorDate: "2026-09-01" })) as unknown as TestedAnalysis;
    expect(result.isStale).toBe(true);
    const refreshed = await runCashflowAnalysis(workspaceId, { periodKind: "MONTH", anchorDate: "2026-09-01" }) as unknown as TestedAnalysis;
    expect(refreshed.isStale).toBe(false);
  });

  it("adds a selected recommendation to execution progress only once", async () => {
    const analysis = await getCashflowAnalysis(workspaceId, new URLSearchParams({ periodKind: "MONTH", anchorDate: "2026-09-01" })) as unknown as TestedAnalysis & { id: string };
    const attempts = await Promise.all([
      acceptCashflowRecommendation(workspaceId, analysis.id, 0),
      acceptCashflowRecommendation(workspaceId, analysis.id, 0),
    ]) as unknown as Array<{ created: boolean }>;
    expect(attempts.map((item) => item.created).sort()).toEqual([false, true]);
    const execution = await getExecutionResults(workspaceId);
    const action = execution.actions?.items[0];
    expect(action).toMatchObject({ status: "ACCEPTED", revisionScope: "TRANSACTION", isStale: false, kind: "CASHFLOW_ADVICE", sourceKey: `cashflow:${analysis.id}:recommendation:0` });
    expect(await db.action.count({ where: { workspaceId, generationTaskId: `cashflow:${analysis.id}:recommendation:0` } })).toBe(1);

    await db.workspace.update({ where: { id: workspaceId }, data: { transactionRevision: { increment: 1 } } });
    const staleExecution = await getExecutionResults(workspaceId);
    expect(staleExecution.actions?.items[0]).toMatchObject({ revisionScope: "TRANSACTION", isStale: true });
    await transitionAction(workspaceId, action!.id, "DEFERRED", "稍后再处理");
    await transitionAction(workspaceId, action!.id, "PROPOSED");
    await expect(transitionAction(workspaceId, action!.id, "ACCEPTED")).rejects.toThrow("这条建议基于旧流水，请重新分析后再接受");
  });

  it("handles no income, zero comparison bases, empty periods, special-only periods, quarters, and years", async () => {
    const edge = await db.workspace.create({ data: { transactionRevision: 1 } });
    try {
      await db.transaction.createMany({ data: [
        { workspaceId: edge.id, direction: "EXPENSE", amountMinor: 10000n, occurredOn: new Date("2026-01-10T00:00:00.000Z"), description: "餐饮", category: "餐饮", specialKind: "NONE", analysisTreatment: "COUNT", source: "MANUAL", classificationSource: "USER" },
        { workspaceId: edge.id, direction: "INCOME", amountMinor: 30000n, occurredOn: new Date("2026-03-10T00:00:00.000Z"), description: "收入", category: "其他收入", specialKind: "NONE", analysisTreatment: "COUNT", source: "MANUAL", classificationSource: "USER" },
        { workspaceId: edge.id, direction: "EXPENSE", amountMinor: 50000n, occurredOn: new Date("2026-04-10T00:00:00.000Z"), description: "转账", category: "资金转账", specialKind: "TRANSFER", analysisTreatment: "EXCLUDE", source: "MANUAL", classificationSource: "USER" },
        { workspaceId: edge.id, direction: "EXPENSE", amountMinor: 5000n, occurredOn: new Date("2025-12-10T00:00:00.000Z"), description: "去年支出", category: "餐饮", specialKind: "NONE", analysisTreatment: "COUNT", source: "MANUAL", classificationSource: "USER" },
      ] });
      const january = await runCashflowAnalysis(edge.id, { periodKind: "MONTH", anchorDate: "2026-01-01" }) as unknown as TestedAnalysis & { statistics: { savingsRateBps: number | null; changes: { expenseBps: number | null } } };
      expect(january.statistics).toMatchObject({ incomeMinor: "0", expenseMinor: "10000", savingsRateBps: null, changes: { expenseBps: 10000 } });

      const february = await runCashflowAnalysis(edge.id, { periodKind: "MONTH", anchorDate: "2026-02-01" }) as unknown as TestedAnalysis;
      expect(february).toMatchObject({ statistics: { transactionCount: 0, excludedCount: 0 }, report: { status: "NO_DATA" } });

      const april = await runCashflowAnalysis(edge.id, { periodKind: "MONTH", anchorDate: "2026-04-01" }) as unknown as TestedAnalysis;
      expect(april).toMatchObject({ statistics: { transactionCount: 0, excludedCount: 1, incomeMinor: "0", expenseMinor: "0" }, report: { status: "NO_DATA" } });

      const quarter = await runCashflowAnalysis(edge.id, { periodKind: "QUARTER", anchorDate: "2026-01-01" }) as unknown as TestedAnalysis;
      expect(quarter.statistics).toMatchObject({ incomeMinor: "30000", expenseMinor: "10000", balanceMinor: "20000" });
      const year = await runCashflowAnalysis(edge.id, { periodKind: "YEAR", anchorDate: "2026-01-01" }) as unknown as TestedAnalysis;
      expect(year.statistics).toMatchObject({ incomeMinor: "30000", expenseMinor: "10000", balanceMinor: "20000" });
    } finally {
      await db.workspace.delete({ where: { id: edge.id } });
    }
  });

  it("does not save a report when Agent evidence invents a number", async () => {
    const unsafe = await db.workspace.create({ data: { transactionRevision: 1, transactions: { create: { direction: "EXPENSE", amountMinor: 10000n, occurredOn: new Date("2026-09-10T00:00:00.000Z"), description: "餐饮", category: "餐饮", specialKind: "NONE", analysisTreatment: "COUNT", source: "MANUAL", classificationSource: "USER" } } } });
    vi.stubEnv("OPENAI_BASE_URL", "https://aiping.cn/api/v1");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_MODEL", "test-model");
    vi.stubEnv("ALLOW_AI_IN_TEST", "true");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      status: "READY",
      summary: "本期支出需要关注。",
      findings: [{ title: "异常数字", severity: "RISK", evidence: ["餐饮支出999999999分"], interpretation: "该数字不在程序统计中。" }],
      recommendations: [],
      missingInformation: [],
      disclaimer: "本分析基于已录入流水，用于收支管理参考，不构成投资建议。",
    }) } }] }), { status: 200 })));
    try {
      await expect(runCashflowAnalysis(unsafe.id, { periodKind: "MONTH", anchorDate: "2026-09-01" })).rejects.toMatchObject({ status: 502 });
      expect(await db.cashflowAnalysis.count({ where: { workspaceId: unsafe.id } })).toBe(0);
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      await db.workspace.delete({ where: { id: unsafe.id } });
    }
  });
});
