import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { runPythonSync } from "../../../scripts/lib/runtime.cjs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DEFAULT_RULES, json } from "../../domain/paper-trading";
import { acquireLease, createAccount, matchOrders, previewOrder, reconcile, submitOrder } from "./service";
import { createCondition } from "./conditions";
import { confirmAdjustment, previewAdjustment } from "./maintenance";
import { authorizeExperiment, confirmStrategy, createExperiment, draftStrategy, executeStrategyRun, updateStockPool } from "./experiments";
import { createReplaySession, importReplayDataset } from "./replay";
import { exportPaperAccount } from "./export";

let dir: string, db: PrismaClient;
const originalURL = process.env.DATABASE_URL;
const start = new Date("2026-10-08T02:00:00Z"), tomorrow = new Date("2026-10-09T02:00:00Z");
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "paper-export-")); const file = join(dir, "test.sqlite"); process.env.DATABASE_URL = `file:${file}`;
  const migrations = (await readdir("prisma/migrations")).filter(x => /^\d/.test(x)).sort();
  const sql = (await Promise.all(migrations.map(m => readFile(`prisma/migrations/${m}/migration.sql`, "utf8")))).join("\n");
  runPythonSync("import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.executescript(sys.stdin.read());c.close()", [file], { input: sql });
  db = new PrismaClient({ datasourceUrl: `file:${file}` });
  await db.paperRuleVersion.create({ data: { id: "export-test-only", configJson: json({ ...DEFAULT_RULES, qualified: true, qualifiedUntil: "2026-12-31", evidence: "isolated synthetic fixture" }), source: "synthetic test" } });
  await db.marketInstrument.create({ data: { id: "sh600000", name: "测试股票", board: "MAIN", source: "test" } });
  for (const day of ["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12"]) {
    await db.marketCalendar.create({ data: { day, isOpen: !["2026-10-10", "2026-10-11"].includes(day), source: "test", verifiedAt: start } });
    await db.marketDailyState.create({ data: { instrumentId: "sh600000", day, status: "NORMAL", eventCoverage: true, lowerMinor: 500n, upperMinor: 2000n, source: "test", verifiedAt: start } });
  }
}, 20000);
beforeEach(async () => { await db.paperAccount.deleteMany(); await db.marketQuote.deleteMany(); await db.paperWorkerLease.deleteMany(); });
afterAll(async () => { await db?.$disconnect(); if (dir) await rm(dir, { recursive: true, force: true }); if (originalURL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalURL; });
async function seed() { const workspaceId = (await db.workspace.create({ data: {} })).id; return { workspaceId, accountId: (await createAccount(db, workspaceId, start)).id }; }
async function market(now = start) {
  await acquireLease(db, "export-test", now);
  return db.marketQuote.create({ data: { id: randomUUID(), instrumentId: "sh600000", provider: "TENCENT", sourceAt: now, fetchedAt: now, priceMinor: 1000n, previousMinor: 1000n, bidMinor: 1000n, askMinor: 1000n, bidQuantity: 1000, askQuantity: 1000, lowerMinor: 500n, upperMinor: 2000n } });
}
function csvRows(csv: string) {
  const rows: string[][] = []; let row: string[] = [], value = "", quoted = false;
  const text = csv.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && c === ",") { row.push(value); value = ""; }
    else if (!quoted && (c === "\n" || c === "\r")) { if (c === "\r" && text[i + 1] === "\n") i++; row.push(value); rows.push(row); row = []; value = ""; }
    else value += c;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  return rows;
}
async function state(accountId: string) {
  return { account: await db.paperAccount.findUniqueOrThrow({ where: { id: accountId } }), entries: await db.paperCashEntry.findMany({ where: { accountId } }), orders: await db.paperOrder.findMany({ where: { accountId } }), fills: await db.paperFill.findMany({ where: { accountId } }), positions: await db.paperPosition.findMany({ where: { accountId } }), conditions: await db.paperCondition.findMany({ where: { accountId } }) };
}
function replayFixture() {
  const calendar = [], days = [];
  for (let n = 1; n <= 30; n++) {
    const day = `2026-09-${String(n).padStart(2, "0")}`, weekday = new Date(`${day}T00:00:00Z`).getUTCDay(), isOpen = weekday > 0 && weekday < 6;
    calendar.push({ day, isOpen, source: "synthetic test calendar" }); if (isOpen) days.push(day);
  }
  return { name: "export isolation fixture", resolution: "DAY", source: "synthetic fixture, not live market data", sourceFetchedAt: "2026-10-08T00:00:00Z", fallbackReason: "synthetic daily test fixture only", sourceReview: { adjustment: "NONE", volumeUnit: "SHARE", dataUseChecked: true, reviewerNote: "isolated synthetic fixture" }, calendar,
    bars: days.slice(0, 20).map((day, i) => ({ instrumentId: "sh600000", closeAt: `${day}T15:00:00+08:00`, openMinor: "1000", highMinor: "1010", lowMinor: "990", closeMinor: "1000", previousMinor: "1000", lowerMinor: "900", upperMinor: "1100", volumeShares: 10000, status: "NORMAL", eventCoverage: true, evidence: `export-test-${i === 0 ? "known" : "future"}-bar-${i}` })) };
}

describe("complete isolated paper account export", () => {
  it("exports orders, fills, quote evidence, holdings, conditions, notes and records without changing the ledger", async () => {
    const x = await seed(); await market();
    const p = await previewOrder(db, x.workspaceId, x.accountId, { instrumentId: "sh600000", side: "BUY", quantity: 400, limitMinor: "1000", reason: "=2+2,说明\n保留证据" }, start);
    const order = await submitOrder(db, x.workspaceId, x.accountId, p.previewId, randomUUID(), start);
    const after = new Date(start.getTime() + 2000), quote = await market(after), lease = await acquireLease(db, "export-test", after);
    await matchOrders(db, "export-test", lease!.token, after);
    await market(tomorrow);
    const adjustmentPreview = await previewAdjustment(db, x.workspaceId, x.accountId, { instrumentId: "sh600000", eventKey: "export-dividend", kind: "DIVIDEND", cashMinor: "400", quantity: 0, recordDay: "2026-10-08", effectiveDay: "2026-10-09", sellableOn: "2026-10-09", source: "synthetic test-only dividend evidence", entitlementQuantity: 400, taxConfirmed: true, note: "synthetic tax-confirmed fixture" }, tomorrow);
    const adjustment = await confirmAdjustment(db, x.workspaceId, x.accountId, adjustmentPreview.previewId, tomorrow);
    const a = await db.paperAccount.findUniqueOrThrow({ where: { id: x.accountId } });
    const condition = await createCondition(db, x.workspaceId, x.accountId, { instrumentId: "sh600000", kind: "TAKE_PROFIT", triggerMinor: "1200", limitMinor: "1190", quantity: 100, expectedVersion: a.version, key: randomUUID() }, tomorrow);
    const note = await db.paperReviewNote.create({ data: { ...x, content: "=SUM(1,2)\n只保存笔记原文" } });
    const operation = await db.paperOperationalEvent.create({ data: { ...x, type: "AI_REVIEW", detailJson: "{\"message\":\"仅复盘\"}" } });
    expect(await reconcile(db, x.accountId)).toEqual([]);
    const before = await state(x.accountId), rows = csvRows(await exportPaperAccount(db, x.workspaceId, x.accountId));
    expect(rows.every(r => r.length === 10)).toBe(true);
    for (const type of ["账户", "交易规则", "资金流水", "委托", "成交", "成交行情", "委托事件", "复盘笔记", "估值", "公司行为", "条件单", "运行记录", "对账报告", "持仓"]) expect(rows.some(r => r[0] === type), type).toBe(true);
    expect(rows.find(r => r[0] === "委托" && r[1] === order.orderId)?.[9]).toBe("'=2+2,说明\n保留证据");
    expect(rows.some(r => r[0] === "成交行情" && r[1] === quote.id)).toBe(true);
    expect(JSON.parse(rows.find(r => r[0] === "复盘笔记" && r[1] === note.id)![9]).content).toBe(note.content);
    expect(rows.some(r => r[0] === "条件单" && r[1] === condition.id)).toBe(true);
    expect(rows.some(r => r[0] === "公司行为" && r[1] === adjustment.id)).toBe(true);
    expect(rows.some(r => r[0] === "运行记录" && r[1] === operation.id)).toBe(true);
    expect(JSON.parse(rows.find(r => r[0] === "持仓")![9]).lots[0].sellableOn).toBe("2026-10-09");
    expect(await state(x.accountId)).toEqual(before);
  });
  it("exports strategy versions, stock pools, authorizations and analysis snapshots with actual timestamps", async () => {
    const workspaceId = (await db.workspace.create({ data: {} })).id;
    const e = await createExperiment(db, workspaceId, { initialYuan: 150000 }, start);
    const pool = await updateStockPool(db, workspaceId, e.id, { expectedVersion: e.version, confirmed: true, instrumentIds: ["sh600000"] }, start);
    const draft = await draftStrategy(db, workspaceId, e.id, { expectedVersion: pool.experiment.version, text: "先观察，不交易" }, { now: start, model: async () => ({ objective: "验证观察策略", observation: "当前报价", buyConditions: [], sellConditions: [], holdConditions: ["不交易"], allocation: "保留现金", stopConditions: ["用户停止"], requiredData: ["LIVE_QUOTES"], missingData: [] }) });
    const confirmed = await confirmStrategy(db, workspaceId, e.id, { expectedVersion: draft.experiment.version, strategyId: draft.strategy.id, confirmed: true }, start);
    const auth = await authorizeExperiment(db, workspaceId, e.id, { expectedVersion: confirmed.experiment.version, strategyId: draft.strategy.id, stockPoolId: pool.pool.id, confirmed: true }, start);
    await market();
    const run = await executeStrategyRun(db, workspaceId, e.id, { now: start, model: async (_prompt, raw) => ({ action: "HOLD", instrumentId: null, quantity: null, limitMinor: null, reason: "按照策略观察", evidenceIds: [(raw as { evidenceIds: string[] }).evidenceIds[0]] }) });
    expect(run.status).toBe("NO_TRADE");
    const before = await state(e.accountId), rows = csvRows(await exportPaperAccount(db, workspaceId, e.accountId));
    for (const type of ["策略实验", "策略版本", "股票池版本", "授权", "策略分析"]) expect(rows.some(r => r[0] === type), type).toBe(true);
    expect(rows.find(r => r[0] === "股票池版本")?.[2]).toBe("2026-10-08 10:00:00.000 +08:00");
    expect(rows.find(r => r[0] === "授权")?.[2]).toBe("2026-10-08 10:00:00.000 +08:00");
    const authorization = JSON.parse(rows.find(r => r[0] === "授权")![9]);
    expect(authorization.id).toBe(auth.authorization.id); expect(authorization.stockPoolId).toBe(pool.pool.id);
    const analysis = JSON.parse(rows.find(r => r[0] === "策略分析")![9]);
    expect(analysis.strategyId).toBe(draft.strategy.id); expect(JSON.parse(analysis.decisionJson).action).toBe("HOLD");
    expect(await state(e.accountId)).toEqual(before);
  });
  it("rejects another workspace and excludes other account records", async () => {
    const x = await seed(), other = await seed();
    const note = await db.paperReviewNote.create({ data: { ...other, content: "OTHER_ACCOUNT_PRIVATE_NOTE" } });
    await expect(exportPaperAccount(db, other.workspaceId, x.accountId)).rejects.toThrow("不存在");
    const csv = await exportPaperAccount(db, x.workspaceId, x.accountId);
    expect(csv).not.toContain(note.id); expect(csv).not.toContain("OTHER_ACCOUNT_PRIVATE_NOTE");
  });
  it("exports only replay bars known at the session clock", async () => {
    const workspaceId = (await db.workspace.create({ data: {} })).id;
    const dataset = await importReplayDataset(db, workspaceId, replayFixture());
    const s = await createReplaySession(db, workspaceId, { datasetId: dataset.id });
    const future = await db.paperReplayBar.findMany({ where: { datasetId: dataset.id, closeAt: { gt: s.clock } } });
    expect(future).toHaveLength(19);
    const before = await state(s.accountId), csv = await exportPaperAccount(db, workspaceId, s.accountId), rows = csvRows(csv);
    const known = rows.filter(r => r[0] === "已知历史K线");
    expect(known).toHaveLength(1); expect(JSON.parse(known[0][9]).evidence).toBe("export-test-known-bar-0");
    for (const b of future) { expect(csv).not.toContain(b.id); expect(csv).not.toContain(b.evidence); }
    expect(rows.some(r => r[0] === "回放会话" && r[1] === s.id)).toBe(true);
    expect(await state(s.accountId)).toEqual(before);
  });
});
