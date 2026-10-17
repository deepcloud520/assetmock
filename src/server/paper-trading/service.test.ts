import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { DEFAULT_RULES, fees, json } from "../../domain/paper-trading";
import { acquireLease, archiveAccount, cancelOrder, createAccount, matchOrders, overview, previewOrder, reconcile, submitOrder } from "./service";
import { createCondition, cancelCondition } from "./conditions";
import { confirmAdjustment, previewAdjustment, reviewMarket } from "./maintenance";

let dir: string, db: PrismaClient, workspaceId: string, accountId: string;
const oldURL = process.env.DATABASE_URL;
const start = new Date("2026-10-08T02:00:00.000Z"), later = (n: number) => new Date(start.getTime() + n * 1000);
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "paper-trading-test-")); const file = join(dir, "test.sqlite");
  process.env.DATABASE_URL = `file:${file}`;
  const migrations = (await readdir("prisma/migrations")).filter(x => /^\d/.test(x)).sort();
  const sql = (await Promise.all(migrations.map(m => readFile(`prisma/migrations/${m}/migration.sql`, "utf8")))).join("\n");
  execFileSync("python3", ["-c", "import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.executescript(sys.stdin.read());c.close()", file], { input: sql });
  db = new PrismaClient({ datasourceUrl: `file:${file}` });
  await db.paperRuleVersion.create({ data: { id: "verified-test-only", configJson: json({ ...DEFAULT_RULES, qualified: true, qualifiedUntil: "2026-12-31", evidence: "isolated synthetic test; not live qualification" }), source: "synthetic test" } });
  for (const symbol of ["sh600000", "sz300750", "sh688981"]) {
    await db.marketInstrument.create({ data: { id: symbol, name: "测试普通股票", board: symbol === "sh600000" ? "MAIN" : symbol === "sz300750" ? "CHINEXT" : "STAR", source: "test" } });
    for (const day of ["2026-10-08", "2026-10-09", "2026-10-12"]) await db.marketDailyState.create({ data: { instrumentId: symbol, day, status: "NORMAL", eventCoverage: true, lowerMinor: 500n, upperMinor: 2000n, source: "test", verifiedAt: start } });
  }
  for (let n = 8; n <= 13; n++) await db.marketCalendar.create({ data: { day: `2026-10-${String(n).padStart(2, "0")}`, isOpen: ![10,11].includes(n), source: "test", verifiedAt: start } });
}, 20000);
beforeEach(async () => {
  const w = await db.workspace.create({ data: {} }); workspaceId = w.id;
  accountId = (await createAccount(db, w.id, start)).id;
  await db.paperAccount.update({ where: { id: accountId }, data: { ruleId: "verified-test-only" } });
  // Leave immutable quote evidence in place; monotonically reset test time by removing fills with old workspaces first.
  await db.paperWorkerLease.deleteMany();
});
afterAll(async () => { await db?.$disconnect(); if (dir) await rm(dir, { recursive: true, force: true }); if (oldURL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldURL; });
async function quote(at: Date, quantity = 1000, price = 1000n, symbol = "sh600000") {
  // Evidence from other scenarios has future timestamps; use fresh symbol histories by clearing other scenario accounts.
  return db.marketQuote.create({ data: { id: randomUUID(), instrumentId: symbol, provider: "TENCENT", sourceAt: at, fetchedAt: at, priceMinor: price, previousMinor: 1000n, bidMinor: price, askMinor: price, bidQuantity: quantity, askQuantity: quantity, lowerMinor: 500n, upperMinor: 2000n } });
}
async function resetMarket() {
  await db.paperAccount.deleteMany({ where: { id: { not: accountId } } });
  await db.marketQuote.deleteMany();
}
async function order(side: "BUY" | "SELL", quantity: number, at = start, symbol = "sh600000", limit = "1000") {
  await acquireLease(db, "test-worker", at); await quote(at, 1000, BigInt(limit), symbol);
  const p = await previewOrder(db, workspaceId, accountId, { instrumentId: symbol, side, quantity, limitMinor: limit }, at);
  expect(p.blockers).toEqual([]);
  const o = await submitOrder(db, workspaceId, accountId, p.previewId, randomUUID(), at); return o.orderId;
}
async function match(at: Date, quantity = 1000, price = 1000n, symbol = "sh600000") {
  await quote(at, quantity, price, symbol); const lease = await acquireLease(db, "test-worker", at); await matchOrders(db, "test-worker", lease!.token, at);
}
describe("isolated paper trading ledger", () => {
  it("uses the exchange calendar to unlock Friday purchases on Monday", async () => {
    await resetMarket(); const friday = new Date("2026-10-09T02:00:00Z");
    await order("BUY", 100, friday); await match(new Date(friday.getTime() + 2000));
    expect((await db.paperPositionLot.findFirstOrThrow({ where: { accountId } })).sellableOn).toBe("2026-10-12");
  });
  it("does not fill from a fresh-looking pre-restart quote", async () => {
    await resetMarket(); const id = await order("BUY", 100); await quote(later(2));
    await db.paperWorkerLease.deleteMany(); const lease = await acquireLease(db, "restarted", later(4));
    await matchOrders(db, "restarted", lease!.token, later(4));
    expect(await db.paperFill.count({ where: { orderId: id } })).toBe(0);
    await quote(later(5)); await matchOrders(db, "restarted", lease!.token, later(5));
    expect(await db.paperFill.count({ where: { orderId: id } })).toBe(1);
  });
  it("initializes once, isolates real facts, and defaults to blocked live trading", async () => {
    await resetMarket();
    const before = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    expect((await createAccount(db, workspaceId)).id).toBe(accountId);
    await db.paperAccount.update({ where: { id: accountId }, data: { ruleId: "paper-v1-unverified" } });
    await quote(start);
    const p = await previewOrder(db, workspaceId, accountId, { instrumentId: "sh600000", side: "BUY", quantity: 100, limitMinor: "1000" }, start);
    expect(p.blockers.join()).toContain("验证");
    await expect(submitOrder(db, workspaceId, accountId, p.previewId, randomUUID(), start)).rejects.toThrow("验证");
    expect((await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } })).portfolioRevision).toBe(before.portfolioRevision);
    expect(await db.transaction.count({ where: { workspaceId } })).toBe(0);
    expect(await db.asset.count({ where: { workspaceId } })).toBe(0);
  });
  it("buys, enforces T+1, sells next trading day, and reconciles exact fees and cash", async () => {
    await resetMarket(); await order("BUY", 100); await match(later(2));
    await expect(order("SELL", 100, later(3))).rejects.toThrow("可卖数量不足");
    const tomorrow = new Date("2026-10-09T02:00:00Z"); await order("SELL", 100, tomorrow, "sh600000", "1100");
    await match(new Date(tomorrow.getTime() + 2000), 100, 1100n);
    const a = await db.paperAccount.findUniqueOrThrow({ where: { id: accountId } });
    const totalFees = fees(100000n, "BUY", DEFAULT_RULES) + fees(110000n, "SELL", DEFAULT_RULES);
    expect(a.cashMinor).toBe(10_000_000n + 10000n - totalFees); expect(a.realizedMinor).toBe(10000n - totalFees);
    expect(a.frozenMinor).toBe(0n); expect(await reconcile(db, accountId)).toEqual([]);
  });
  it("partially fills once per quote and cancels only the remainder", async () => {
    await resetMarket(); const id = await order("BUY", 300); await match(later(2), 100);
    const lease = await acquireLease(db, "test-worker", later(3)); await matchOrders(db, "test-worker", lease!.token, later(3));
    expect(await db.paperFill.count({ where: { orderId: id } })).toBe(1);
    await cancelOrder(db, workspaceId, id, later(4)); await cancelOrder(db, workspaceId, id, later(4));
    const o = await db.paperOrder.findUniqueOrThrow({ where: { id } }); expect(o.filled).toBe(100); expect(o.status).toBe("CANCELLED");
    expect((await db.paperAccount.findUniqueOrThrow({ where: { id: accountId } })).frozenMinor).toBe(0n);
    expect(await reconcile(db, accountId)).toEqual([]);
  });
  it("charges a minimum commission once across multiple fills", async () => {
    await resetMarket(); const id = await order("BUY", 200); await match(later(2), 100); await match(later(3), 100);
    const o = await db.paperOrder.findUniqueOrThrow({ where: { id } }); expect(o.status).toBe("FILLED"); expect(o.feesMinor).toBe(fees(200000n, "BUY", DEFAULT_RULES));
    expect(await reconcile(db, accountId)).toEqual([]);
  });
  it("replays duplicate submits and rejects stale previews and cross-workspace references", async () => {
    await resetMarket(); await acquireLease(db, "test-worker", start); await quote(start);
    const input = { instrumentId: "sh600000", side: "BUY", quantity: 100, limitMinor: "1000" };
    const p = await previewOrder(db, workspaceId, accountId, input, start), p2 = await previewOrder(db, workspaceId, accountId, input, start);
    const key = randomUUID(), first = await submitOrder(db, workspaceId, accountId, p.previewId, key, start);
    expect(await submitOrder(db, workspaceId, accountId, p.previewId, key, later(60))).toEqual(first);
    await expect(submitOrder(db, workspaceId, accountId, p2.previewId, randomUUID(), start)).rejects.toThrow("过期");
    const other = await db.workspace.create({ data: {} });
    await expect(db.paperOrder.create({ data: { workspaceId: other.id, accountId, instrumentId: "sh600000", side: "BUY", quantity: 100, limitMinor: 1000n, day: "2026-10-08", ruleId: "verified-test-only" } })).rejects.toThrow();
    await expect(overview(db, other.id, accountId)).rejects.toThrow("模拟账户不存在");
  });
  it("rejects insufficient funds and competing stale orders", async () => {
    await resetMarket(); await acquireLease(db, "test-worker", start); await quote(start);
    await expect(previewOrder(db, workspaceId, accountId, { instrumentId: "sh600000", side: "BUY", quantity: 20000, limitMinor: "1000" }, start)).rejects.toThrow("不足");
    const input = { instrumentId: "sh600000", side: "BUY", quantity: 6000, limitMinor: "1000" };
    const p1 = await previewOrder(db, workspaceId, accountId, input, start), p2 = await previewOrder(db, workspaceId, accountId, input, start);
    const results = await Promise.allSettled([submitOrder(db, workspaceId, accountId, p1.previewId, randomUUID(), start), submitOrder(db, workspaceId, accountId, p2.previewId, randomUUID(), start)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(await reconcile(db, accountId)).toEqual([]);
  });
  it("never fills stale, pre-order, suspended or unverified-event quotes", async () => {
    await resetMarket(); const id = await order("BUY", 100);
    let l = await acquireLease(db, "test-worker", later(1)); await matchOrders(db, "test-worker", l!.token, later(1));
    await db.marketDailyState.update({ where: { instrumentId_day: { instrumentId: "sh600000", day: "2026-10-08" } }, data: { eventCoverage: false } });
    await match(later(2)); expect(await db.paperFill.count({ where: { orderId: id } })).toBe(0);
    await db.marketDailyState.update({ where: { instrumentId_day: { instrumentId: "sh600000", day: "2026-10-08" } }, data: { eventCoverage: true } });
    l = await acquireLease(db, "test-worker", later(30)); await matchOrders(db, "test-worker", l!.token, later(30));
    expect(await db.paperFill.count({ where: { orderId: id } })).toBe(0);
  });
  it("fences old workers and expires an overnight order without fake fills", async () => {
    await resetMarket(); const id = await order("BUY", 100); const old = await acquireLease(db, "old", later(20));
    const now = new Date("2026-10-09T02:00:00Z"), fresh = await acquireLease(db, "new", now);
    await expect(matchOrders(db, "old", old!.token, now)).rejects.toThrow("租约");
    await matchOrders(db, "new", fresh!.token, now);
    expect((await db.paperOrder.findUniqueOrThrow({ where: { id } })).status).toBe("EXPIRED"); expect(await db.paperFill.count({ where: { orderId: id } })).toBe(0);
    expect(await reconcile(db, accountId)).toEqual([]);
  });
  it.each(["sz300750", "sh688981"])("fills supported %s board with its configured quantities", async symbol => {
    await resetMarket(); await order("BUY", 200, start, symbol); await match(later(2), 200, 1000n, symbol);
    expect((await db.paperPosition.findFirstOrThrow({ where: { accountId } })).quantity).toBe(200);
  });
  it("archives without fabricated liquidation and preserves immutable evidence", async () => {
    await resetMarket(); const id = await order("BUY", 200); await match(later(2), 100);
    const a = await db.paperAccount.findUniqueOrThrow({ where: { id: accountId } }); await archiveAccount(db, workspaceId, accountId, a.version, later(3));
    expect((await db.paperPosition.findFirstOrThrow({ where: { accountId } })).quantity).toBe(100);
    expect((await db.paperOrder.findUniqueOrThrow({ where: { id } })).status).toBe("CANCELLED");
    expect((await createAccount(db, workspaceId)).id).not.toBe(accountId);
    const f = await db.paperFill.findFirstOrThrow({ where: { accountId } }); await expect(db.paperFill.update({ where: { id: f.id }, data: { priceMinor: 1n } })).rejects.toThrow();
    expect((await db.paperFill.findUniqueOrThrow({ where: { id: f.id } })).priceMinor).toBe(f.priceMinor);
  });
  it("previews corporate cash adjustment, verifies record-date shares and commits once", async () => {
    await resetMarket(); await order("BUY", 100); await match(later(2));
    const input = { instrumentId: "sh600000", eventKey: "dividend-test", kind: "DIVIDEND", cashMinor: "1000", quantity: 0, entitlementQuantity: 100, recordDay: "2026-10-08", effectiveDay: "2026-10-09", sellableOn: "2026-10-09", source: "测试公告来源，不是生产资料", note: "已核实实际税后分红", taxConfirmed: true };
    const now = new Date("2026-10-09T02:00:00Z"), before = await db.paperAccount.findUniqueOrThrow({ where: { id: accountId } });
    await acquireLease(db, "test-worker", now); await quote(now);
    const c = await createCondition(db, workspaceId, accountId, { instrumentId: "sh600000", kind: "TAKE_PROFIT", triggerMinor: "1200", limitMinor: "1100", quantity: 100, expectedVersion: before.version, key: "corporate-condition-check" }, now);
    await expect(previewAdjustment(db, workspaceId, accountId, input, now)).rejects.toThrow("待触发条件单");
    await cancelCondition(db, workspaceId, c.id, now);
    const p = await previewAdjustment(db, workspaceId, accountId, input, now);
    expect((await db.paperAccount.findUniqueOrThrow({ where: { id: accountId } })).cashMinor).toBe(before.cashMinor);
    await confirmAdjustment(db, workspaceId, accountId, p.previewId, now); await confirmAdjustment(db, workspaceId, accountId, p.previewId, now);
    expect((await db.paperAccount.findUniqueOrThrow({ where: { id: accountId } })).cashMinor).toBe(before.cashMinor + 1000n);
    expect(await reconcile(db, accountId)).toEqual([]);
  });
  it("refuses qualification without real-session evidence fields", async () => {
    await expect(reviewMarket(db, { source: "test", confirmed: true, calendar: [], states: [], rule: { id: "fake", config: DEFAULT_RULES } }, start)).rejects.toThrow();
  });
  it("restores a consistent isolated copy including order history and cash ledger", async () => {
    await resetMarket(); await order("BUY", 100); await match(later(2));
    const target = join(dir, "restore.sqlite");
    execFileSync("python3", ["-c", "import sqlite3,sys;s=sqlite3.connect(sys.argv[1]);d=sqlite3.connect(sys.argv[2]);s.backup(d);d.close();s.close()", join(dir, "test.sqlite"), target]);
    const recovered = new PrismaClient({ datasourceUrl: `file:${target}` });
    expect((await recovered.paperAccount.findUniqueOrThrow({ where: { id: accountId } })).cashMinor).toBe((await db.paperAccount.findUniqueOrThrow({ where: { id: accountId } })).cashMinor);
    expect(await reconcile(recovered, accountId)).toEqual([]);
    expect(await recovered.$queryRawUnsafe("PRAGMA foreign_key_check")).toEqual([]); await recovered.$disconnect();
  });
});
