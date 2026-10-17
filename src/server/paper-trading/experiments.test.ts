import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { runPythonSync } from "../../../scripts/lib/runtime.cjs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DEFAULT_RULES, json } from "../../domain/paper-trading";
import { acquireLease, createAccount, previewOrder, submitOrder } from "./service";
import { authorizeExperiment, confirmStrategy, createExperiment, draftStrategy, executeStrategyRun, listExperiments, pauseExperiment, pauseExperimentsOnRestart, updateStockPool, type StrategyModel } from "./experiments";

let db: PrismaClient, dir: string, workspaceId: string;
const priorURL = process.env.DATABASE_URL;
const start = new Date("2026-10-08T02:00:00Z"), time = (minutes = 0) => new Date(start.getTime() + minutes * 60000);
const definition = { objective: "验证用户策略", observation: "当前报价", buyConditions: ["按当前报价试验"], sellConditions: ["达到条件卖出"], holdConditions: ["资料不足不交易"], allocation: "服从程序风险限制", stopConditions: ["用户停止"], requiredData: ["LIVE_QUOTES", "ACCOUNT"], missingData: [] };
const draftModel: StrategyModel = async () => definition;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "paper-experiments-")); const file = join(dir, "test.sqlite"); process.env.DATABASE_URL = `file:${file}`;
  const migrations = (await readdir("prisma/migrations")).filter(x => /^\d/.test(x)).sort();
  const sql = (await Promise.all(migrations.map(m => readFile(`prisma/migrations/${m}/migration.sql`, "utf8")))).join("\n");
  runPythonSync("import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.executescript(sys.stdin.read());c.close()", [file], { input: sql });
  db = new PrismaClient({ datasourceUrl: `file:${file}` });
  await db.paperRuleVersion.create({ data: { id: "strategy-test", configJson: json({ ...DEFAULT_RULES, qualified: true, qualifiedUntil: "2026-12-31", evidence: "isolated test only" }), source: "synthetic test" } });
  for (const id of ["sh600000", "sz000001", "sh688981", "sz300750"]) {
    await db.marketInstrument.create({ data: { id, name: "测试股票", board: id === "sh688981" ? "STAR" : id === "sz300750" ? "CHINEXT" : "MAIN", source: "test" } });
    await db.marketDailyState.create({ data: { instrumentId: id, day: "2026-10-08", status: "NORMAL", eventCoverage: true, lowerMinor: 500n, upperMinor: 2000n, source: "test", verifiedAt: start } });
  }
  for (const day of ["2026-10-08", "2026-10-09"]) await db.marketCalendar.create({ data: { day, isOpen: true, source: "test", verifiedAt: start } });
}, 20000);
beforeEach(async () => { workspaceId = (await db.workspace.create({ data: {} })).id; await db.marketQuote.deleteMany(); await db.paperWorkerLease.deleteMany(); });
afterAll(async () => { await db?.$disconnect(); if (dir) await rm(dir, { recursive: true, force: true }); if (priorURL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = priorURL; });
async function market(now = start) {
  await acquireLease(db, "strategy-test", now);
  for (const instrumentId of ["sh600000", "sz000001"]) await db.marketQuote.create({ data: { id: randomUUID(), instrumentId, provider: "TENCENT", sourceAt: now, fetchedAt: now, priceMinor: 1000n, previousMinor: 1000n, bidMinor: 1000n, askMinor: 1000n, bidQuantity: 10000, askQuantity: 10000, lowerMinor: 500n, upperMinor: 2000n } });
}
async function ready() {
  const e = await createExperiment(db, workspaceId, {}, start);
  const pool = await updateStockPool(db, workspaceId, e.id, { expectedVersion: e.version, confirmed: true, instrumentIds: ["sh600000"] }, start);
  const draft = await draftStrategy(db, workspaceId, e.id, { expectedVersion: pool.experiment.version, text: "仅用当前报价验证我的交易策略" }, { model: draftModel, now: start });
  const confirmed = await confirmStrategy(db, workspaceId, e.id, { expectedVersion: draft.experiment.version, strategyId: draft.strategy.id, confirmed: true }, start);
  const auth = await authorizeExperiment(db, workspaceId, e.id, { expectedVersion: confirmed.experiment.version, strategyId: draft.strategy.id, stockPoolId: pool.pool.id, confirmed: true }, start);
  return { ...auth.experiment, poolId: pool.pool.id, strategyId: draft.strategy.id };
}
function decision(action: "BUY" | "HOLD", quantity = 100, instrumentId = "sh600000"): StrategyModel {
  return async (_prompt, raw) => {
    const input = raw as { evidenceIds: string[] };
    return { action, instrumentId: action === "HOLD" ? null : instrumentId, quantity: action === "HOLD" ? null : quantity, limitMinor: action === "HOLD" ? null : "1000", reason: "仅使用已提供报价进行策略验证", evidenceIds: [input.evidenceIds[0]] };
  };
}
describe("isolated AI strategy experiments", () => {
  it("owns separate funds and stock pools do not create holdings", async () => {
    const manual = await createAccount(db, workspaceId, start);
    const e = await ready();
    expect(e.accountId).not.toBe(manual.id);
    expect((await db.paperAccount.findUniqueOrThrow({ where: { id: e.accountId } })).cashMinor).toBe(10_000_000n);
    expect(await db.paperPosition.count({ where: { accountId: e.accountId } })).toBe(0);
    await expect(listExperiments(db, "other-workspace")).resolves.toEqual([]);
    await expect(pauseExperiment(db, "other-workspace", e.id)).rejects.toThrow("不存在");
  });
  it("reuses an experiment creation request and rejects changed funding", async () => {
    const requestId = randomUUID(), first = await createExperiment(db, workspaceId, { requestId, initialYuan: 200000 }, start);
    const repeated = await createExperiment(db, workspaceId, { requestId, initialYuan: 200000 }, start);
    expect(repeated.id).toBe(first.id); expect(first.account.initialMinor).toBe(20_000_000n);
    await expect(createExperiment(db, workspaceId, { requestId, initialYuan: 100000 }, start)).rejects.toThrow("不同实验设置");
  });
  it("keeps unsupported data drafts unconfirmed", async () => {
    const e = await createExperiment(db, workspaceId, {}, start);
    const draft = await draftStrategy(db, workspaceId, e.id, { expectedVersion: e.version, text: "根据财报和新闻买入" }, { now: start, model: async () => ({ ...definition, requiredData: ["NEWS"], missingData: [] }) });
    expect(draft.strategy.status).toBe("NEEDS_DATA");
    await expect(confirmStrategy(db, workspaceId, e.id, { expectedVersion: draft.experiment.version, strategyId: draft.strategy.id, confirmed: true }, start)).rejects.toThrow("尚未提供");
  });
  it("provides the confirmed pool and ledger context and normalizes actual labeled data codes", async () => {
    const e = await createExperiment(db, workspaceId, {}, start);
    const pool = await updateStockPool(db, workspaceId, e.id, { expectedVersion: e.version, confirmed: true, instrumentIds: ["sh600000", "sh688981", "sz300750"] }, start);
    const draft = await draftStrategy(db, workspaceId, e.id, { expectedVersion: pool.experiment.version, text: "仅使用当前报价，程序负责T+1与资金约束" }, { now: start, model: async (_prompt, raw) => {
      const data = raw as { stockPool: { confirmationStatus: string; versionId: string; instrumentIds: string[] }; accountFacts: { initialMinor: string; availableMinor: string }; positionFacts: { items: unknown[] }; programRules: { tPlusOne: string }; programLimits: { status: string; requiresSeparateAuthorization: boolean; values: { singleBuyBps: number } } };
      expect(data.stockPool).toMatchObject({ confirmationStatus: "CONFIRMED", versionId: pool.pool.id, instrumentIds: ["sh600000", "sh688981", "sz300750"] });
      expect(data.accountFacts).toMatchObject({ initialMinor: "10000000", availableMinor: "10000000" });
      expect(data.positionFacts.items).toEqual([]);
      expect(data.programRules.tPlusOne).toBe("ENFORCED_BY_PROGRAM");
      expect(data.programLimits).toMatchObject({ status: "PROPOSED_DEFAULTS", requiresSeparateAuthorization: true, values: { singleBuyBps: 1000 } });
      return { ...definition, requiredData: ["实时行情(LIVE_QUOTES)", "账户(ACCOUNT)", "持仓(POSITIONS)", "最近成交(RECENT_TRADES)"], missingData: [] };
    } });
    expect(draft.strategy.status).toBe("DRAFT");
    expect(JSON.parse(draft.strategy.strategyJson).requiredData).toEqual(["LIVE_QUOTES", "ACCOUNT", "POSITIONS", "RECENT_TRADES"]);
    expect(JSON.parse(draft.strategy.missingJson)).toEqual([]);
    expect(draft.strategy.confirmedAt).toBeNull();
    expect(await db.paperStrategyAuthorization.count({ where: { experimentId: e.id } })).toBe(0);
  });
  it("keeps nonblocking explanations in a confirmable draft without inventing same-day restrictions", async () => {
    const e = await createExperiment(db, workspaceId, {}, start);
    const pool = await updateStockPool(db, workspaceId, e.id, { expectedVersion: e.version, confirmed: true, instrumentIds: ["sh600000", "sh688981", "sz300750"] }, start);
    const text = "每15分钟最多一笔。先筛选现价比昨收高2%且可卖数量达到板块最低数量的持仓，按代码升序选第一只卖；没有卖出才考虑买入股票池中比昨收低2%的第一只，买入仓位按授权上限安排。";
    const arranged = { ...definition, observation: "每15分钟分析一次，每轮最多一笔委托",
      sellConditions: ["现价>昨收×1.02且可卖数量达到板块最低数量；按代码升序选择第一只"],
      buyConditions: ["本轮无卖出时，按代码升序选择股票池内现价<昨收×0.98的第一只"],
      requiredData: ["LIVE_QUOTES", "ACCOUNT", "POSITIONS"],
      clarifications: ["本轮最多一笔委托，不表示同日后续独立分析禁止买入；提交委托不保证成交。"] };
    const draft = await draftStrategy(db, workspaceId, e.id, { expectedVersion: pool.experiment.version, text }, { now: start, model: async (_prompt, raw, _name, schema) => {
      expect((raw as { text: string }).text).toBe(text);
      expect(schema).toMatchObject({ properties: { clarifications: { type: "array" } } });
      return arranged;
    } });
    expect(draft.strategy).toMatchObject({ status: "DRAFT", originalText: text, promptVersion: "paper-strategy-v1.2" });
    expect(JSON.parse(draft.strategy.strategyJson)).toMatchObject(arranged);
    expect(JSON.parse(draft.strategy.missingJson)).toEqual([]);
    const confirmed = await confirmStrategy(db, workspaceId, e.id, { expectedVersion: draft.experiment.version, strategyId: draft.strategy.id, confirmed: true }, start);
    expect(confirmed.strategy.status).toBe("CONFIRMED");
    expect(confirmed.experiment.status).toBe("PAUSED");
    expect(await db.paperStrategyAuthorization.count({ where: { experimentId: e.id } })).toBe(0);
    expect(await db.paperOrder.count({ where: { accountId: e.accountId } })).toBe(0);
  });
  it("does not let nonblocking explanations erase a real missing trigger threshold", async () => {
    const e = await createExperiment(db, workspaceId, {}, start);
    const draft = await draftStrategy(db, workspaceId, e.id, { expectedVersion: e.version, text: "价格跌到足够便宜就买入" }, { now: start, model: async () => ({ ...definition,
      missingData: ["足够便宜缺少买入价格或跌幅阈值，无法判断买入信号是否成立"],
      clarifications: ["委托成功不保证成交，费用由程序核算"] }) });
    expect(draft.strategy.status).toBe("NEEDS_DATA");
    expect(JSON.parse(draft.strategy.strategyJson).clarifications).toEqual(["委托成功不保证成交，费用由程序核算"]);
    expect(JSON.parse(draft.strategy.missingJson)).toEqual(["足够便宜缺少买入价格或跌幅阈值，无法判断买入信号是否成立"]);
    await expect(confirmStrategy(db, workspaceId, e.id, { expectedVersion: draft.experiment.version, strategyId: draft.strategy.id, confirmed: true }, start)).rejects.toThrow("尚未提供");
  });
  it("accepts explicit aliases but keeps missing strategy choices and unsupported or misleading sources blocked", async () => {
    const e = await createExperiment(db, workspaceId, {}, start);
    const draft = await draftStrategy(db, workspaceId, e.id, { expectedVersion: e.version, text: "依据新闻买入，冲突优先级尚未明确" }, { now: start, model: async () => ({ ...definition,
      requiredData: ["实时行情（LIVE_QUOTES）", "账户余额", "当前持仓(POSITIONS)", "近期成交（RECENT_TRADES）", "NEWS", "新闻(LIVE_QUOTES)", "实时行情(LIVE_QUOTES)及新闻"],
      missingData: ["买卖条件同时触发时的优先级未明确"] }) });
    const result = JSON.parse(draft.strategy.strategyJson), missing = JSON.parse(draft.strategy.missingJson);
    expect(result.requiredData.slice(0, 4)).toEqual(["LIVE_QUOTES", "ACCOUNT", "POSITIONS", "RECENT_TRADES"]);
    expect(result.requiredData.slice(4)).toEqual(["NEWS", "新闻(LIVE_QUOTES)", "实时行情(LIVE_QUOTES)及新闻"]);
    expect(missing).toEqual(["买卖条件同时触发时的优先级未明确", "当前未提供数据：NEWS", "当前未提供数据：新闻(LIVE_QUOTES)", "当前未提供数据：实时行情(LIVE_QUOTES)及新闻"]);
    expect(draft.strategy.status).toBe("NEEDS_DATA");
    await expect(confirmStrategy(db, workspaceId, e.id, { expectedVersion: draft.experiment.version, strategyId: draft.strategy.id, confirmed: true }, start)).rejects.toThrow("尚未提供");
  });
  it("prevents ordinary submit and submits only one order per time slot", async () => {
    const e = await ready(); await market();
    const preview = await previewOrder(db, workspaceId, e.accountId, { instrumentId: "sh600000", side: "BUY", quantity: 100, limitMinor: "1000" }, start);
    await expect(submitOrder(db, workspaceId, e.accountId, preview.previewId, randomUUID(), start)).rejects.toThrow("仅接受");
    const run = await executeStrategyRun(db, workspaceId, e.id, { now: start, model: decision("BUY") });
    expect(run.status).toBe("SUBMITTED");
    const listed = await listExperiments(db, workspaceId);
    expect(listed[0].runs[0].order).toMatchObject({ id: (run as { orderId: string }).orderId, status: "OPEN", quantity: 100, filled: 0 });
    expect(Object.keys(listed[0].runs[0].order!).sort()).toEqual(["filled", "id", "quantity", "status"]);
    const repeated = await executeStrategyRun(db, workspaceId, e.id, { now: start, model: async () => { throw new Error("must not call"); } });
    expect(repeated).toMatchObject({ id: (run as { id: string }).id, status: "SUBMITTED" });
    expect(await db.paperOrder.count({ where: { accountId: e.accountId } })).toBe(1);
  });
  it("rejects a stale model result after the user stops the experiment", async () => {
    const e = await ready(); await market();
    const run = await executeStrategyRun(db, workspaceId, e.id, { now: start, model: async (prompt, raw, name, schema) => {
      await pauseExperiment(db, workspaceId, e.id, "停止测试", start);
      return decision("BUY")(prompt, raw, name, schema);
    } });
    expect(run.status).toBe("CANCELLED");
    expect(await db.paperOrder.count({ where: { accountId: e.accountId } })).toBe(0);
  });
  it("rejects stale decisions after the account changes during a model call", async () => {
    const e = await ready(); await market();
    const run = await executeStrategyRun(db, workspaceId, e.id, { now: start, model: async (prompt, raw, name, schema) => {
      await db.paperAccount.update({ where: { id: e.accountId }, data: { version: { increment: 1 } } });
      return decision("BUY")(prompt, raw, name, schema);
    } });
    expect(run).toMatchObject({ status: "REJECTED", reason: expect.stringContaining("已变化") });
    expect(await db.paperOrder.count({ where: { accountId: e.accountId } })).toBe(0);
  });
  it("rejects buys outside the confirmed pool and fabricated evidence", async () => {
    const e = await ready(); await market();
    const rejected = await executeStrategyRun(db, workspaceId, e.id, { now: start, model: decision("BUY", 100, "sz000001") });
    expect(rejected).toMatchObject({ status: "REJECTED", reason: expect.stringContaining("股票池") });
    await market(time(15));
    const fabricated = await executeStrategyRun(db, workspaceId, e.id, { now: time(15), model: async () => ({ action: "HOLD", instrumentId: null, quantity: null, limitMinor: null, reason: "无依据", evidenceIds: ["invented"] }) });
    expect(fabricated).toMatchObject({ status: "REJECTED", reason: expect.stringContaining("依据") });
  });
  it("counts pending buys toward the stock cap and pauses safely on restart", async () => {
    const e = await ready();
    for (const minute of [0, 15]) { await market(time(minute)); const run = await executeStrategyRun(db, workspaceId, e.id, { now: time(minute), model: decision("BUY", 800) }); expect(run.status).toBe("SUBMITTED"); }
    await market(time(30));
    const rejected = await executeStrategyRun(db, workspaceId, e.id, { now: time(30), model: decision("BUY", 500) });
    expect(rejected).toMatchObject({ status: "REJECTED", reason: expect.stringContaining("单股仓位") });
    await pauseExperimentsOnRestart(db, time(31));
    const a = await db.paperAccount.findUniqueOrThrow({ where: { id: e.accountId } });
    expect(a.frozenMinor).toBe(0n);
    expect((await db.paperStrategyExperiment.findUniqueOrThrow({ where: { id: e.id } })).status).toBe("PAUSED");
  });
  it("allows only one realtime experiment per workspace", async () => {
    await ready();
    await expect(ready()).rejects.toThrow("已有运行中的");
  });
  it("does not hold a write transaction during slow model calls", async () => {
    const e = await ready(); await market();
    const run = await executeStrategyRun(db, workspaceId, e.id, { now: start, model: async (prompt, raw, name, schema) => {
      await createAccount(db, workspaceId, start);
      return decision("HOLD")(prompt, raw, name, schema);
    } });
    expect(run.status).toBe("NO_TRADE");
  });
  it("deletes experiment versions, authorizations and input snapshots with its account", async () => {
    const e = await ready(); await market();
    await executeStrategyRun(db, workspaceId, e.id, { now: start, model: decision("BUY") });
    await db.paperAccount.delete({ where: { id: e.accountId } });
    expect(await db.paperStrategyExperiment.count({ where: { id: e.id } })).toBe(0);
    expect(await db.paperStrategyVersion.count({ where: { experimentId: e.id } })).toBe(0);
    expect(await db.paperStockPoolVersion.count({ where: { experimentId: e.id } })).toBe(0);
    expect(await db.paperStrategyAuthorization.count({ where: { experimentId: e.id } })).toBe(0);
    expect(await db.paperStrategyRun.count({ where: { experimentId: e.id } })).toBe(0);
  });
});
