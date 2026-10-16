import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_RULES, json } from "../../domain/paper-trading";
import { accountInsights, historyPage, observationMetrics, orderDetails } from "./insights";
import { healthSummary, operateAccount, prepareMarketReview, confirmMarketReview, publishBenchmark, tradingStatus } from "./monitoring";
import { acquireLease, cancelOrder, createAccount, matchOrders, previewOrder, submitOrder } from "./service";

let dir: string, db: PrismaClient;
const originalURL = process.env.DATABASE_URL;
let agentDb: PrismaClient | undefined;
const time = new Date("2026-10-08T02:00:00Z"), now = (seconds: number) => new Date(time.getTime() + seconds * 1000);
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "paper-insights-")); const path = join(dir, "test.sqlite");
  process.env.DATABASE_URL = `file:${path}`;
  const names = (await readdir("prisma/migrations")).filter(n => /^\d/.test(n)).sort();
  const sql = (await Promise.all(names.map(n => readFile(`prisma/migrations/${n}/migration.sql`, "utf8")))).join("\n");
  execFileSync("python3", ["-c", "import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.executescript(sys.stdin.read());c.close()", path], { input: sql });
  db = new PrismaClient({ datasourceUrl: `file:${path}` });
  await db.paperRuleVersion.create({ data: { id: "insights-test-only", configJson: json({ ...DEFAULT_RULES, qualified: true, qualifiedUntil: "2026-12-31", evidence: "isolated synthetic test evidence" }), source: "test" } });
  await db.marketInstrument.create({ data: { id: "sh600000", name: "测试普通证券", board: "MAIN", source: "test" } });
  for (const day of ["2026-10-08", "2026-10-09", "2026-10-10"]) {
    await db.marketCalendar.create({ data: { day, isOpen: day !== "2026-10-10", source: "test", verifiedAt: time } });
    await db.marketDailyState.create({ data: { instrumentId: "sh600000", day, status: "NORMAL", eventCoverage: true, lowerMinor: 500n, upperMinor: 2000n, source: "test", verifiedAt: time } });
  }
}, 20000);
afterAll(async () => { await agentDb?.$disconnect(); await db?.$disconnect(); if (dir) await rm(dir, { recursive: true, force: true }); if (originalURL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalURL; });
async function seed() {
  const workspace = await db.workspace.create({ data: {} }); const a = await createAccount(db, workspace.id, time);
  await db.paperAccount.update({ where: { id: a.id }, data: { ruleId: "insights-test-only" } });
  return { workspaceId: workspace.id, accountId: a.id };
}
async function quote(at: Date, quantity = 100) {
  return db.marketQuote.create({ data: { id: crypto.randomUUID(), instrumentId: "sh600000", provider: "TENCENT", sourceAt: at, fetchedAt: at, priceMinor: 1000n, previousMinor: 1000n, bidMinor: 1000n, askMinor: 1000n, bidQuantity: quantity, askQuantity: quantity, lowerMinor: 500n, upperMinor: 2000n } });
}

describe("deterministic paper insights and operational history", () => {
  it("keeps real observations, terminal gaps and one daily denominator", () => {
    const metrics = observationMetrics([
      { id: "a", createdAt: time, equityMinor: 10000n, quality: "CURRENT" },
      { id: "b", createdAt: now(1), equityMinor: 11000n, quality: "CURRENT" },
      { id: "c", createdAt: new Date("2026-10-09T07:00:00Z"), equityMinor: 8800n, quality: "CURRENT" },
      { id: "d", createdAt: new Date("2026-10-09T07:01:00Z"), equityMinor: null, quality: "INCOMPLETE" },
    ]);
    expect(metrics.maxDrawdownBps).toBe(2000); expect(metrics.dailyEquityCount).toBe(1);
    expect(metrics.dailyEquitySumMinor).toBe(11000n); expect(metrics.daily[1].equityMinor).toBeNull();
    expect(metrics.invalidIds).toEqual(["d"]);
    expect(observationMetrics([{ id: "x", createdAt: time, equityMinor: 100n, quality: "CURRENT" }, { id: "y", createdAt: now(1), equityMinor: 0n, quality: "CURRENT" }]).maxDrawdownBps).toBe(10000);
  });
  it("validates cursors against workspace, account and requested period", async () => {
    const first = await seed(), second = await seed();
    const one = await db.paperReviewNote.create({ data: { ...first, content: "first", createdAt: time } });
    const two = await db.paperReviewNote.create({ data: { ...first, content: "second", createdAt: now(1) } });
    const foreign = await db.paperReviewNote.create({ data: { ...second, content: "foreign", createdAt: time } });
    const page = await historyPage(db, first.workspaceId, first.accountId, { kind: "NOTES", take: 1 }, now(2));
    expect(page.records.map(r => r.id)).toEqual([two.id]); expect(page.nextCursor).toBe(two.id);
    expect((await historyPage(db, first.workspaceId, first.accountId, { kind: "NOTES", take: 1, cursor: page.nextCursor }, now(2))).records.map(r => r.id)).toEqual([one.id]);
    await expect(historyPage(db, first.workspaceId, first.accountId, { kind: "NOTES", cursor: foreign.id }, now(2))).rejects.toThrow("分页位置");
    await expect(historyPage(db, first.workspaceId, first.accountId, { kind: "NOTES", cursor: one.id, from: "2026-10-09" }, now(2))).rejects.toThrow("分页位置");
    await expect(historyPage(db, second.workspaceId, first.accountId, { kind: "NOTES" }, now(2))).rejects.toThrow("不存在");
  });
  it("traces a partially filled cancelled order, fees and resource release", async () => {
    const x = await seed(); await acquireLease(db, "insights-worker", now(2)); await quote(now(2));
    const p = await previewOrder(db, x.workspaceId, x.accountId, { instrumentId: "sh600000", side: "BUY", limitMinor: "1000", quantity: 200 }, now(2));
    const submitted = await submitOrder(db, x.workspaceId, x.accountId, p.previewId, crypto.randomUUID(), now(2));
    await quote(now(3)); const lease = await acquireLease(db, "insights-worker", now(3)); await matchOrders(db, "insights-worker", lease!.token, now(3));
    await cancelOrder(db, x.workspaceId, submitted.orderId, now(4));
    const details = await orderDetails(db, x.workspaceId, submitted.orderId, now(4));
    expect(details.order.filled).toBe(100); expect(details.remainingQuantity).toBe(100);
    expect(details.resources.map(r => r.type)).toEqual(["SUBMITTED", "FILLED", "CANCELLED"]);
    expect(details.resources.at(-1)?.cashFrozenMinor).toBe(0n); expect(details.entries.map(e => e.type).sort()).toEqual(["BUY", "FEE"]);
    expect(details.expectedCumulativeFeeMinor).toBe(details.order.feesMinor);
    const other = await seed(); await expect(orderDetails(db, other.workspaceId, submitted.orderId)).rejects.toThrow("不存在");
  });
  it("matches preview blockers and persists pause, recheck and resume history", async () => {
    const x = await seed(); const status = await tradingStatus(db, x.workspaceId, x.accountId, "sh600000", now(30));
    expect(status.canSubmit).toBe(false); expect(status.blockers.some(b => b.code === "QUOTE_STALE")).toBe(true);
    await operateAccount(db, x.workspaceId, x.accountId, { action: "PAUSE", expectedVersion: 0, reason: "用户暂停核对" }, now(6));
    let a = await db.paperAccount.findUniqueOrThrow({ where: { id: x.accountId } }); expect(a.health).toBe("PAUSED");
    await operateAccount(db, x.workspaceId, x.accountId, { action: "RECHECK", expectedVersion: a.version, reason: "核对账本" }, now(7));
    a = await db.paperAccount.findUniqueOrThrow({ where: { id: x.accountId } }); expect(a.health).toBe("PAUSED");
    await operateAccount(db, x.workspaceId, x.accountId, { action: "RESUME", expectedVersion: a.version, reason: "确认恢复" }, now(8));
    const health = await healthSummary(db, x.workspaceId, x.accountId, now(8));
    expect(health.accountHealth).toBe("OK"); expect(health.operations).toHaveLength(3); expect(health.reconciliations.length).toBeGreaterThan(0);
    await expect(operateAccount(db, x.workspaceId, x.accountId, { action: "RESUME", expectedVersion: 0, reason: "旧预览" })).rejects.toThrow("变化");
  });
  it("does not resume a corrupted account or bypass AI experiment authorization", async () => {
    const x = await seed(); await db.paperAccount.update({ where: { id: x.accountId }, data: { cashMinor: { increment: 1n }, health: "PAUSED" } });
    await expect(operateAccount(db, x.workspaceId, x.accountId, { action: "RESUME", expectedVersion: 0, reason: "核对仍有问题" })).rejects.toThrow("差异");
    const ai = await createAccount(db, x.workspaceId, time, { purpose: "AI" });
    await expect(operateAccount(db, x.workspaceId, ai.id, { action: "RESUME", expectedVersion: 0, reason: "绕过授权" })).rejects.toThrow("实验暂停");
  });
  it("previews market changes without publishing, rejects stale or foreign drafts, and confirms once", async () => {
    const x = await seed(); const raw = { source: "official reviewed source 2026-10-08", calendar: [{ day: "2026-10-12", isOpen: true }], states: [] };
    const draft = await prepareMarketReview(db, x.workspaceId, raw, now(10));
    expect(draft.valid).toBe(true); expect(await db.marketCalendar.findUnique({ where: { day: "2026-10-12" } })).toBeNull();
    const other = await seed(); await expect(confirmMarketReview(db, other.workspaceId, draft.draftId, 0, now(11))).rejects.toThrow("不存在");
    await confirmMarketReview(db, x.workspaceId, draft.draftId, 0, now(11));
    expect(await confirmMarketReview(db, x.workspaceId, draft.draftId, 0, now(12))).toMatchObject({ status: "PUBLISHED" });
    expect(await db.marketReviewRecord.count()).toBe(1);
    const next = await prepareMarketReview(db, x.workspaceId, { ...raw, calendar: [{ day: "2026-10-12", isOpen: false }] }, now(13));
    await db.marketCalendar.update({ where: { day: "2026-10-12" }, data: { source: "concurrent change" } });
    await expect(confirmMarketReview(db, x.workspaceId, next.draftId, 0, now(14))).rejects.toThrow("已变化");
    const unknown = await prepareMarketReview(db, x.workspaceId, { ...raw, states: [{ instrumentId: "sz000001", day: "2026-10-08", status: "NORMAL", eventCoverage: true, lowerMinor: "100", upperMinor: "200" }] }, now(15));
    expect(unknown.valid).toBe(false); await expect(confirmMarketReview(db, x.workspaceId, unknown.draftId, 0, now(16))).rejects.toThrow("证券资料");
  });
  it("uses matching daily closes for benchmark and hides incomplete comparisons", async () => {
    const x = await seed();
    await db.paperEquitySnapshot.create({ data: { ...x, key: "close:2026-10-08", cashMinor: 10_000_000n, marketMinor: 0n, equityMinor: 10_000_000n, quality: "CURRENT", evidenceJson: "[]", createdAt: new Date("2026-10-08T07:00:00Z") } });
    await db.paperEquitySnapshot.create({ data: { ...x, key: "close:2026-10-09", cashMinor: 10_000_000n, marketMinor: 1_000_000n, equityMinor: 11_000_000n, quality: "CURRENT", evidenceJson: "[]", createdAt: new Date("2026-10-09T07:00:00Z") } });
    const later = new Date("2026-10-09T08:00:00Z");
    expect((await accountInsights(db, x.workspaceId, x.accountId, {}, later)).benchmark).toBeNull();
    await publishBenchmark(db, { confirmed: true, source: "isolated benchmark price source", points: [{ day: "2026-10-08", closeMinor: "400000" }, { day: "2026-10-09", closeMinor: "420000" }] }, later);
    const report = await accountInsights(db, x.workspaceId, x.accountId, {}, later);
    expect(report.benchmark?.accountReturnBps).toBe(1000); expect(report.benchmark?.benchmarkReturnBps).toBe(500); expect(report.period.validDailyCount).toBe(2);
    await expect(publishBenchmark(db, { confirmed: true, source: "changed benchmark source", points: [{ day: "2026-10-08", closeMinor: "300000" }] }, later)).rejects.toThrow("不可静默覆盖");
    await db.paperEquitySnapshot.create({ data: { ...x, key: "bad-terminal", cashMinor: 10_000_000n, quality: "INCOMPLETE", evidenceJson: "[]", createdAt: new Date("2026-10-09T07:30:00Z") } });
    const gap = await accountInsights(db, x.workspaceId, x.accountId, {}, later);
    expect(gap.benchmark).toBeNull(); expect(gap.period.missingDays).toContain("2026-10-09");
  });
  it("does not subtract fees twice or treat recorded corporate cash as initial capital", async () => {
    const x = await seed(); await db.paperAccount.update({ where: { id: x.accountId }, data: { cashMinor: 10_010_000n, feesMinor: 500n, realizedMinor: 9500n } });
    await db.paperAdjustment.create({ data: { ...x, instrumentId: "sh600000", eventKey: "dividend-one", kind: "DIVIDEND", cashMinor: 500n, quantity: 0, source: "test", createdAt: time } });
    const report = await accountInsights(db, x.workspaceId, x.accountId, {}, now(100));
    expect(report.accountPnlMinor).toBe(10000n); expect(report.feesMinor).toBe(500n); expect(report.corporateIncomeMinor).toBe(500n); expect(report.initialMinor).toBe(10_000_000n);
    const other = await seed(); await expect(accountInsights(db, other.workspaceId, x.accountId)).rejects.toThrow("不存在");
  });
  it("allows only investment read tools with exact evidence, without changing balances or orders", async () => {
    agentDb = (await import("@/lib/db")).db;
    const { executeAgentTool } = await import("../agent-tools"), { agentFacts } = await import("../agent-context");
    const { createAgentSession, startAgentMessage } = await import("../five-agent-runtime");
    const x = await seed(), foreign = await seed();
    const s = await createAgentSession(x.workspaceId, { agentKey: "INVESTMENT" });
    const r = await startAgentMessage(x.workspaceId, s.id, { content: "复盘模拟账户", clientMessageId: crypto.randomUUID() });
    const context = { workspaceId: x.workspaceId, agentKey: "INVESTMENT" as const, sessionId: s.id, runId: r.id, goalId: null, decisionId: null, facts: await agentFacts(x.workspaceId) };
    const before = await db.paperAccount.findUniqueOrThrow({ where: { id: x.accountId } });
    const result = await executeAgentTool("getPaperMetrics", { accountId: x.accountId }, context) as { evidenceIds: string[] };
    expect(result.evidenceIds).toContain(`PAPER_RECORD:${x.accountId}`);
    expect(await db.dataDependency.count({ where: { workspaceId: x.workspaceId, ownerId: r.id, sourceType: "PAPER_ACCOUNT", sourceId: x.accountId } })).toBe(1);
    expect(await db.paperOrder.count({ where: { accountId: x.accountId } })).toBe(0);
    expect(await db.paperAccount.findUniqueOrThrow({ where: { id: x.accountId } })).toEqual(before);
    await expect(executeAgentTool("getPaperMetrics", { accountId: foreign.accountId }, context)).rejects.toThrow("不存在");
    await expect(executeAgentTool("getPaperMetrics", { accountId: x.accountId }, { ...context, agentKey: "INSURANCE" })).rejects.toThrow("权限");
  });
  it("validates paper evidence and marks model conclusions partial when the account changed", async () => {
    const { createAgentSession, startAgentMessage, executeAgentRun } = await import("../five-agent-runtime");
    const x = await seed();
    const answer = { kind: "ANSWER", message: "模拟收益来自账户与成交记录", toolName: null, argumentsJson: null, specialist: null, evidenceIds: [] as string[], missing: [] };
    async function run(changed: boolean) {
      const s = await createAgentSession(x.workspaceId, { agentKey: "INVESTMENT" });
      const r = await startAgentMessage(x.workspaceId, s.id, { content: "读取模拟账户指标", clientMessageId: crypto.randomUUID() }); let calls = 0;
      return executeAgentRun(x.workspaceId, r.id, () => {}, { model: async () => {
        if (calls++ === 0) return { ...answer, kind: "CALL_TOOL", toolName: "getPaperMetrics", argumentsJson: JSON.stringify({ accountId: x.accountId }) };
        if (changed) await db.paperAccount.update({ where: { id: x.accountId }, data: { version: { increment: 1 } } });
        return { ...answer, evidenceIds: [`PAPER_RECORD:${x.accountId}`] };
      } });
    }
    expect(await run(false)).toMatchObject({ status: "COMPLETED", evidenceIds: [`PAPER_RECORD:${x.accountId}`] });
    expect(await run(true)).toMatchObject({ status: "PARTIAL" });
  });
});
