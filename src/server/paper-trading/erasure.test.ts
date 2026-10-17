import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { runPythonSync } from "../../../scripts/lib/runtime.cjs";
import { createAccount } from "./service";
import { deletionPreview } from "./maintenance";

let dir: string, db: typeof import("@/lib/db").db, erase: typeof import("./erasure").erasePaperAccount, backup: typeof import("../database-backup");
const oldURL = process.env.DATABASE_URL, oldBackup = process.env.DATABASE_BACKUP_DIR;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "paper-deletion-")); const file = join(dir, "test.sqlite");
  process.env.DATABASE_URL = `file:${file}`; process.env.DATABASE_BACKUP_DIR = join(dir, "backups");
  const migrations = (await readdir("prisma/migrations")).filter(x => /^\d/.test(x)).sort();
  const sql = (await Promise.all(migrations.map(m => readFile(`prisma/migrations/${m}/migration.sql`, "utf8")))).join("\n") + '\nCREATE TABLE _prisma_migrations (migration_name TEXT, finished_at DATETIME);\n' + migrations.map(m => `INSERT INTO _prisma_migrations VALUES ('${m}', CURRENT_TIMESTAMP);`).join("\n");
  runPythonSync("import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.executescript(sys.stdin.read());c.close()", [file], { input: sql });
  db = (await import("@/lib/db")).db; erase = (await import("./erasure")).erasePaperAccount; backup = await import("../database-backup");
  await db.marketInstrument.create({ data: { id: "sh600000", name: "测试证券", board: "MAIN", source: "synthetic test" } });
}, 20000);
afterAll(async () => { await db?.$disconnect(); if (dir) await rm(dir, { recursive: true, force: true }); if (oldURL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldURL; if (oldBackup === undefined) delete process.env.DATABASE_BACKUP_DIR; else process.env.DATABASE_BACKUP_DIR = oldBackup; });
async function workspace() { return (await db.workspace.create({ data: {} })).id; }
async function assertNoBytes(marker: string) {
  const backups = await backup.listBackups(); expect(backups).toHaveLength(1);
  for (const file of [join(dir, "test.sqlite"), join(process.env.DATABASE_BACKUP_DIR!, `${backups[0].id}.sqlite`)]) expect((await readFile(file)).includes(Buffer.from(marker))).toBe(false);
}
async function replayDataset(w: string, marker: string) {
  const ds = await db.paperReplayDataset.create({ data: { workspaceId: w, name: marker, source: marker, resolution: "DAY", sourceFetchedAt: new Date(), hash: randomUUID(), sourceReviewJson: JSON.stringify({ note: marker }), calendarJson: "[]", fallbackReason: "synthetic" } });
  await db.paperReplayBar.create({ data: { workspaceId: w, datasetId: ds.id, instrumentId: "sh600000", closeAt: new Date("2026-09-01T07:00:00Z"), openMinor: 1000n, highMinor: 1000n, lowMinor: 1000n, closeMinor: 1000n, previousMinor: 1000n, lowerMinor: 900n, upperMinor: 1100n, volumeShares: 10000, status: "NORMAL", eventCoverage: true, evidence: marker } }); return ds;
}
describe("complete scoped paper data deletion", () => {
  it("redacts linked Agent copies and cascades strategy records while preserving unrelated accounts", async () => {
    const w = await workspace(), marker = `private-strategy-${randomUUID()}`;
    const a = await createAccount(db, w, new Date(), { purpose: "AI", name: marker }), keep = await createAccount(db, w);
    const e = await db.paperStrategyExperiment.create({ data: { workspaceId: w, accountId: a.id, name: marker } });
    const v = await db.paperStrategyVersion.create({ data: { workspaceId: w, experimentId: e.id, version: 1, originalText: marker, strategyJson: JSON.stringify({ note: marker }), model: "test", promptVersion: "test" } });
    const pool = await db.paperStockPoolVersion.create({ data: { workspaceId: w, experimentId: e.id, version: 1, instrumentIdsJson: '["sh600000"]' } });
    const auth = await db.paperStrategyAuthorization.create({ data: { workspaceId: w, experimentId: e.id, strategyId: v.id, stockPoolId: pool.id, limitsJson: "{}", expiresAt: new Date(Date.now() + 10000) } });
    await db.paperStrategyRun.create({ data: { workspaceId: w, experimentId: e.id, authorizationId: auth.id, strategyId: v.id, stockPoolId: pool.id, slot: "synthetic", experimentVersion: 0, accountVersion: 0, model: "test", inputJson: JSON.stringify({ marker }) } });
    const s = await db.agentSession.create({ data: { workspaceId: w, title: marker, sourceRevision: 0, agentKey: "INVESTMENT", summaryJson: JSON.stringify({ marker }) } });
    const r = await db.agentRun.create({ data: { workspaceId: w, sessionId: s.id, agentKey: "INVESTMENT", requestId: "test", sourceSignature: marker, promptVersion: "test", model: "test", inputJson: marker, resultJson: marker, status: "COMPLETED" } });
    await db.agentMessage.create({ data: { sessionId: s.id, runId: r.id, role: "ASSISTANT", content: marker, displayJson: JSON.stringify({ marker }), sourceRevision: 0 } });
    await db.agentStep.create({ data: { sessionId: s.id, runId: r.id, sequence: 1, toolName: "getPaperMetrics", inputJson: marker, outputJson: marker, sourceRevision: 0 } });
    await db.agentProposal.create({ data: { workspaceId: w, runId: r.id, operation: "TEST", sourceSignature: marker, dataJson: marker, title: marker } });
    await db.dataDependency.create({ data: { workspaceId: w, ownerType: "AGENT_RUN", ownerId: r.id, sourceType: "PAPER_ACCOUNT", sourceId: a.id } });
    const unaffected = await db.agentSession.create({ data: { workspaceId: w, title: "unrelated conversation", sourceRevision: 0 } });
    await backup.createBackup("MANUAL"); const preview = await deletionPreview(db, w, a.id);
    expect(preview.agentSessions).toBe(1); expect(preview.experiment?.counts.runs).toBe(1); expect(preview.canDelete).toBe(true);
    const result = await erase(w, a.id, preview.signature); expect(result.cacheReset).toBe(true);
    expect(await db.paperAccount.count({ where: { id: a.id } })).toBe(0); expect(await db.paperStrategyRun.count({ where: { experimentId: e.id } })).toBe(0); expect(await db.paperStrategyAuthorization.count({ where: { experimentId: e.id } })).toBe(0);
    expect((await db.agentRun.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("CANCELLED"); expect((await db.agentSession.findUniqueOrThrow({ where: { id: s.id } })).summaryJson).toBe("{}");
    expect((await db.agentSession.findUniqueOrThrow({ where: { id: unaffected.id } })).title).toBe("unrelated conversation"); expect((await db.paperAccount.findUniqueOrThrow({ where: { id: keep.id } })).cashMinor).toBe(keep.cashMinor);
    expect(await db.dataDependency.count({ where: { sourceId: a.id } })).toBe(0); expect((await db.workspace.findUniqueOrThrow({ where: { id: w } })).dataEpoch).toBe(1);
    await assertNoBytes(marker); expect(await erase(w, a.id, preview.signature, result.jobId)).toEqual(result);
  });
  it("clears orphan replay data and synthetic quotes, but explicitly retains a shared dataset", async () => {
    const w = await workspace(), ds = await replayDataset(w, `shared-market-${randomUUID()}`), a = await createAccount(db, w, new Date(), { mode: "REPLAY" }), b = await createAccount(db, w, new Date(), { mode: "REPLAY" });
    const sa = await db.paperReplaySession.create({ data: { workspaceId: w, accountId: a.id, datasetId: ds.id, clock: new Date("2026-09-01T07:00:00Z") } });
    await db.paperReplaySession.create({ data: { workspaceId: w, accountId: b.id, datasetId: ds.id, clock: sa.clock } });
    const q = await db.marketQuote.create({ data: { id: randomUUID(), instrumentId: "sh600000", provider: `REPLAY:${sa.id}`, sourceAt: sa.clock, fetchedAt: sa.clock, priceMinor: 1000n, previousMinor: 1000n, bidMinor: 1000n, askMinor: 1000n, bidQuantity: 100, askQuantity: 100, lowerMinor: 900n, upperMinor: 1100n } });
    const first = await deletionPreview(db, w, a.id); expect(first.retainedSharedDataset?.otherSessions).toBe(1); expect(first.removableDataset).toBeNull();
    await erase(w, a.id, first.signature); expect(await db.marketQuote.count({ where: { id: q.id } })).toBe(0); expect(await db.paperReplayDataset.count({ where: { id: ds.id } })).toBe(1);
    const second = await deletionPreview(db, w, b.id); expect(second.removableDataset?.bars).toBe(1); await erase(w, b.id, second.signature);
    expect(await db.paperReplayBar.count({ where: { datasetId: ds.id } })).toBe(0); expect(await db.paperReplayDataset.count({ where: { id: ds.id } })).toBe(0); await assertNoBytes(ds.name);
  });
  it("rejects cross-workspace deletion and stale previews instead of deleting newly affected material", async () => {
    const w = await workspace(), other = await workspace(), a = await createAccount(db, w);
    await expect(deletionPreview(db, other, a.id)).rejects.toThrow("不存在"); const p = await deletionPreview(db, w, a.id);
    await db.paperReviewNote.create({ data: { workspaceId: w, accountId: a.id, content: "new note after preview" } });
    await expect(erase(w, a.id, p.signature)).rejects.toThrow("已变化"); expect(await db.paperAccount.count({ where: { id: a.id } })).toBe(1);
  });
  it("does not claim complete deletion when an unsupported old dependency remains", async () => {
    const w = await workspace(), a = await createAccount(db, w);
    await db.dataDependency.create({ data: { workspaceId: w, ownerType: "UNKNOWN_LEGACY_OWNER", ownerId: randomUUID(), sourceType: "PAPER_ACCOUNT", sourceId: a.id } });
    const p = await deletionPreview(db, w, a.id); expect(p.canDelete).toBe(false); expect(p.unknownOwnerTypes).toEqual(["UNKNOWN_LEGACY_OWNER"]);
    await expect(erase(w, a.id, p.signature)).rejects.toThrow("待核对"); expect(await db.paperAccount.count({ where: { id: a.id } })).toBe(1);
  });
});
