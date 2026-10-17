import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPythonSync } from "../../../scripts/lib/runtime.cjs";
import { randomUUID } from "node:crypto";
import { DEFAULT_RULES, json } from "../../domain/paper-trading";
import { validateReplayDataset, replayCapacity, replayFillPrice } from "../../domain/paper-replay";
import { createAccount, previewOrder, reconcile, submitOrder, transaction } from "./service";
import { advanceReplay, createReplaySession, importReplayDataset, replayView, runReplaySessions, setReplayStatus } from "./replay";
import { cancelCondition, createCondition, triggerConditions } from "./conditions";

let dir: string, db: PrismaClient, workspaceId: string;
function fixture() {
  const calendar: { day: string; isOpen: boolean; source: string }[] = [], days: string[] = [];
  for (let n = 1; n <= 30; n++) { const day = `2026-09-${String(n).padStart(2, "0")}`, weekday = new Date(`${day}T00:00:00Z`).getUTCDay(), isOpen = weekday > 0 && weekday < 6;
    calendar.push({ day, isOpen, source: "isolated synthetic calendar; not live evidence" }); if (isOpen) days.push(day); }
  const bars = days.slice(0, 20).map((d, i) => ({ instrumentId: "sh600000", closeAt: `${d}T15:00:00+08:00`, openMinor: "1000", highMinor: "1010", lowMinor: "990", closeMinor: "1000", previousMinor: "1000", lowerMinor: "900", upperMinor: "1100", volumeShares: 10000, status: "NORMAL", eventCoverage: true, evidence: `synthetic bar ${i}; test-only, not real history` }));
  return { name: "isolated test dataset", resolution: "DAY", source: "synthetic fixture not production market data", sourceFetchedAt: "2026-10-08T00:00:00Z", fallbackReason: "synthetic day fixture for deterministic tests only", sourceReview: { adjustment: "NONE", volumeUnit: "SHARE", dataUseChecked: true, reviewerNote: "synthetic fixture; not a real-history qualification" }, calendar, bars };
}
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "paper-replay-test-")); const file = join(dir, "test.sqlite");
  const migrations = (await readdir("prisma/migrations")).filter(x => /^\d/.test(x)).sort();
  const sql = (await Promise.all(migrations.map(m => readFile(`prisma/migrations/${m}/migration.sql`, "utf8")))).join("\n");
  runPythonSync("import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.executescript(sys.stdin.read());c.close()", [file], { input: sql });
  db = new PrismaClient({ datasourceUrl: `file:${file}` });
  await db.paperRuleVersion.create({ data: { id: "replay-test-rules", configJson: json({ ...DEFAULT_RULES, qualified: true, qualifiedUntil: "2026-12-31" }), source: "synthetic test only" } });
  await db.marketInstrument.create({ data: { id: "sh600000", name: "测试普通股票", board: "MAIN", source: "synthetic test only" } });
}, 20000);
beforeEach(async () => { workspaceId = (await db.workspace.create({ data: {} })).id; });
afterAll(async () => { await db?.$disconnect(); if (dir) await rm(dir, { recursive: true, force: true }); });
async function session(data = fixture()) { const dataset = await importReplayDataset(db, workspaceId, data); return createReplaySession(db, workspaceId, { datasetId: dataset.id }); }
async function buy(accountId: string, quantity = 100) {
  const p = await previewOrder(db, workspaceId, accountId, { instrumentId: "sh600000", side: "BUY", quantity, limitMinor: "1000" });
  expect(p.blockers).toEqual([]); return submitOrder(db, workspaceId, accountId, p.previewId, randomUUID());
}
describe("historical replay and conditional sells", () => {
  it("rejects incomplete minute data and records an explicit day fallback", () => {
    expect(validateReplayDataset(fixture()).bars).toHaveLength(20);
    expect(() => validateReplayDataset({ ...fixture(), resolution: "MINUTE" })).toThrow("不完整");
    expect(() => validateReplayDataset({ ...fixture(), fallbackReason: "" })).toThrow("原因");
    expect(() => validateReplayDataset({ ...fixture(), bars: fixture().bars.slice(0, 19) })).toThrow();
  });
  it("uses deterministic next-bar limit prices and a total one-percent capacity", () => {
    const b = validateReplayDataset(fixture()).bars[0];
    expect(replayFillPrice("BUY", 995n, b)).toBe(995n); expect(replayFillPrice("SELL", 1005n, b)).toBe(1005n);
    expect(replayFillPrice("BUY", 980n, b)).toBeNull(); expect(replayFillPrice("BUY", 1000n, { ...b, eventCoverage: false })).toBeNull();
    expect(replayFillPrice("BUY", 1100n, { ...b, lowMinor: 1100n, highMinor: 1100n })).toBeNull(); expect(replayCapacity(9999)).toBe(99);
  });
  it("does not read future prices or affect live funds; imports immutable versions once", async () => {
    const data = fixture(), dataset = await importReplayDataset(db, workspaceId, data); expect((await importReplayDataset(db, workspaceId, data)).id).toBe(dataset.id);
    await expect(db.paperReplayBar.updateMany({ where: { datasetId: dataset.id }, data: { closeMinor: 1n } })).rejects.toThrow();
    const s = await createReplaySession(db, workspaceId, { datasetId: dataset.id }); const live = await createAccount(db, workspaceId);
    const view = await replayView(db, workspaceId, s.id); expect(view.bars).toHaveLength(1); expect(view.remaining).toBe(19);
    await buy(s.accountId, 200); const next = await advanceReplay(db, workspaceId, s.id, s.version);
    const o = await db.paperOrder.findFirstOrThrow({ where: { accountId: s.accountId } }); expect(o.filled).toBe(100); expect(o.status).toBe("EXPIRED");
    expect(await reconcile(db, s.accountId)).toEqual([]); expect((await db.paperAccount.findUniqueOrThrow({ where: { id: live.id } })).cashMinor).toBe(live.initialMinor);
    await expect(advanceReplay(db, workspaceId, s.id, s.version)).rejects.toThrow("未重复"); expect(next.clock > s.clock).toBe(true);
    const other = (await db.workspace.create({ data: {} })).id; await expect(replayView(db, other, s.id)).rejects.toThrow("不存在");
    expect(await db.asset.count({ where: { workspaceId } })).toBe(0); expect(await db.transaction.count({ where: { workspaceId } })).toBe(0);
  });
  it("pauses before unknown corporate facts without advancing or fabricating a fill", async () => {
    const data = fixture(); data.bars[1].eventCoverage = false; const s = await session(data); await buy(s.accountId);
    const paused = await advanceReplay(db, workspaceId, s.id, s.version); expect(paused.status).toBe("PAUSED"); expect(paused.clock).toEqual(s.clock);
    expect(await db.paperFill.count({ where: { accountId: s.accountId } })).toBe(0); expect(paused.warning).toContain("未知");
  });
  it("fences automatic replay writes without pausing sessions or changing the ledger on lost leases", async () => {
    const s = await session(); await buy(s.accountId);
    const running = await setReplayStatus(db, workspaceId, s.id, s.version, "RUNNING");
    const before = await db.paperAccount.findUniqueOrThrow({ where: { id: s.accountId } });
    const quotesBefore = await db.marketQuote.count({ where: { provider: `REPLAY:${s.id}` } });
    const fence = { owner: "synthetic-replay-worker", token: 7 };
    await db.paperWorkerLease.upsert({ where: { id: "matching" }, create: { id: "matching", ...fence, status: "RUNNING", expiresAt: new Date(Date.now() + 60000), heartbeatAt: new Date(), startedAt: new Date() }, update: { ...fence, status: "RUNNING", expiresAt: new Date(Date.now() + 60000) } });
    await expect(advanceReplay(db, workspaceId, s.id, running.version, { ...fence, owner: "synthetic-stale-owner" })).rejects.toMatchObject({ status: 409 });
    await expect(advanceReplay(db, workspaceId, s.id, running.version, { ...fence, token: 6 })).rejects.toMatchObject({ status: 409 });
    await db.paperWorkerLease.update({ where: { id: "matching" }, data: { status: "STOPPED" } });
    await expect(advanceReplay(db, workspaceId, s.id, running.version, fence)).rejects.toMatchObject({ status: 409 });
    await db.paperWorkerLease.update({ where: { id: "matching" }, data: { status: "RUNNING", expiresAt: new Date(Date.now() - 1000) } });
    await expect(advanceReplay(db, workspaceId, s.id, running.version, fence)).rejects.toMatchObject({ status: 409 });
    await runReplaySessions(db, fence);
    expect(await db.paperReplaySession.findUniqueOrThrow({ where: { id: s.id } })).toEqual(running);
    expect(await db.paperAccount.findUniqueOrThrow({ where: { id: s.accountId } })).toEqual(before);
    expect(await db.paperFill.count({ where: { accountId: s.accountId } })).toBe(0);
    expect(await db.marketQuote.count({ where: { provider: `REPLAY:${s.id}` } })).toBe(quotesBefore);
    await db.paperWorkerLease.update({ where: { id: "matching" }, data: { expiresAt: new Date(Date.now() + 60000) } });
    await runReplaySessions(db, fence);
    const advanced = await db.paperReplaySession.findUniqueOrThrow({ where: { id: s.id } });
    expect(advanced.clock > running.clock).toBe(true); expect(advanced.version).toBe(running.version + 1); expect(advanced.status).toBe("RUNNING");
    expect(await db.paperFill.count({ where: { accountId: s.accountId } })).toBe(1);
    expect(await reconcile(db, s.accountId)).toEqual([]);
    await setReplayStatus(db, workspaceId, s.id, advanced.version, "PAUSED");
  });
  it("preserves clock when paused and resumed and executes identical ledger results", async () => {
    const a = await session(), b = await session(); await buy(a.accountId); await buy(b.accountId);
    const running = await setReplayStatus(db, workspaceId, a.id, a.version, "RUNNING"), paused = await setReplayStatus(db, workspaceId, a.id, running.version, "PAUSED"); expect(paused.clock).toEqual(a.clock);
    await advanceReplay(db, workspaceId, a.id, paused.version); await advanceReplay(db, workspaceId, b.id, b.version);
    const [aa, bb] = await Promise.all([db.paperAccount.findUniqueOrThrow({ where: { id: a.accountId } }), db.paperAccount.findUniqueOrThrow({ where: { id: b.accountId } })]);
    expect(aa.cashMinor).toBe(bb.cashMinor); expect(aa.feesMinor).toBe(bb.feesMinor);
  });
  it("transfers a conditional stock freeze once and fills the child only in the following bar", async () => {
    let s = await session(); await buy(s.accountId); s = await advanceReplay(db, workspaceId, s.id, s.version); s = await advanceReplay(db, workspaceId, s.id, s.version);
    const a = await db.paperAccount.findUniqueOrThrow({ where: { id: s.accountId } });
    const raw = { instrumentId: "sh600000", kind: "TAKE_PROFIT", triggerMinor: "1000", limitMinor: "1000", quantity: 100, expectedVersion: a.version, key: randomUUID() };
    const c = await createCondition(db, workspaceId, s.accountId, raw); expect((await createCondition(db, workspaceId, s.accountId, raw)).id).toBe(c.id);
    expect((await db.paperPosition.findFirstOrThrow({ where: { accountId: a.id } })).frozen).toBe(100); expect(await reconcile(db, a.id)).toEqual([]);
    await expect(createCondition(db, workspaceId, a.id, { ...raw, key: randomUUID(), expectedVersion: a.version + 1 })).rejects.toThrow("可卖");
    s = await advanceReplay(db, workspaceId, s.id, s.version);
    const triggered = await db.paperCondition.findUniqueOrThrow({ where: { id: c.id } }); expect(triggered.status).toBe("TRIGGERED"); expect(triggered.childOrderId).toBeTruthy();
    expect(await db.paperFill.count({ where: { orderId: triggered.childOrderId! } })).toBe(0);
    await transaction(db, async tx => { await triggerConditions(tx, await tx.paperAccount.findUniqueOrThrow({ where: { id: a.id } }), s.clock); });
    expect(await db.paperOrder.count({ where: { accountId: a.id, side: "SELL" } })).toBe(1);
    s = await advanceReplay(db, workspaceId, s.id, s.version); expect(await db.paperFill.count({ where: { orderId: triggered.childOrderId! } })).toBe(1); expect(await reconcile(db, a.id)).toEqual([]);
  });
  it("cancels or expires only waiting conditions and releases exact stock resources", async () => {
    let s = await session(); await buy(s.accountId); s = await advanceReplay(db, workspaceId, s.id, s.version); s = await advanceReplay(db, workspaceId, s.id, s.version);
    const a = await db.paperAccount.findUniqueOrThrow({ where: { id: s.accountId } });
    const c = await createCondition(db, workspaceId, a.id, { instrumentId: "sh600000", kind: "STOP_LOSS", triggerMinor: "950", limitMinor: "950", quantity: 100, expectedVersion: a.version, key: randomUUID() });
    await cancelCondition(db, workspaceId, c.id); await cancelCondition(db, workspaceId, c.id); expect((await db.paperPosition.findFirstOrThrow({ where: { accountId: a.id } })).frozen).toBe(0);
    const updated = await db.paperAccount.findUniqueOrThrow({ where: { id: a.id } });
    const c2 = await createCondition(db, workspaceId, a.id, { instrumentId: "sh600000", kind: "STOP_LOSS", triggerMinor: "950", limitMinor: "950", quantity: 100, expectedVersion: updated.version, key: randomUUID() });
    await advanceReplay(db, workspaceId, s.id, s.version); expect((await db.paperCondition.findUniqueOrThrow({ where: { id: c2.id } })).status).toBe("EXPIRED"); expect(await reconcile(db, a.id)).toEqual([]);
  });
});
