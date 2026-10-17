import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPythonSync } from "../../../scripts/lib/runtime.cjs";

let dir: string;
const oldURL = process.env.DATABASE_URL, oldBackup = process.env.DATABASE_BACKUP_DIR;
let db: typeof import("@/lib/db").db;
let route: typeof import("@/app/api/paper-trading/[[...path]]/route");
let backup: typeof import("../database-backup");
let workspaceId: string, accountId: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "paper-management-"));
  const file = join(dir, "test.sqlite"); process.env.DATABASE_URL = `file:${file}`; process.env.DATABASE_BACKUP_DIR = join(dir, "backups");
  const migrations = (await readdir("prisma/migrations")).filter(x => /^\d/.test(x)).sort();
  const sql = (await Promise.all(migrations.map(m => readFile(`prisma/migrations/${m}/migration.sql`, "utf8")))).join("\n") + '\nCREATE TABLE _prisma_migrations (migration_name TEXT, finished_at DATETIME);\n' + migrations.map(m => `INSERT INTO _prisma_migrations VALUES ('${m}', CURRENT_TIMESTAMP);`).join("\n");
  runPythonSync("import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.executescript(sys.stdin.read());c.close()", [file], { input: sql });
  db = (await import("@/lib/db")).db; route = await import("@/app/api/paper-trading/[[...path]]/route"); backup = await import("../database-backup");
  workspaceId = (await db.workspace.create({ data: {} })).id;
}, 20000);
afterAll(async () => { await db?.$disconnect(); if (dir) await rm(dir, { recursive: true, force: true }); if (oldURL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldURL; if (oldBackup === undefined) delete process.env.DATABASE_BACKUP_DIR; else process.env.DATABASE_BACKUP_DIR = oldBackup; });
async function post(path: string, body: unknown) { return route.POST(new Request(`http://localhost:3000/api/paper-trading/${path}`, { method: "POST", headers: { "X-Workspace-Id": workspaceId, "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ path: path.split("/") }) }); }
describe("paper trading API, restore and erasure", () => {
  it("creates an account through the API and serializes integer amounts", async () => {
    const result = await post("accounts", {}); expect(result.status).toBe(200); const a = await result.json(); accountId = a.id; expect(a.cashMinor).toBe("10000000");
    const other = new Request("http://localhost:3000/api/paper-trading/accounts", { method: "POST", headers: { "X-Workspace-Id": workspaceId, Origin: "https://untrusted.example" }, body: "{}" });
    expect((await route.POST(other, { params: Promise.resolve({ path: ["accounts"] }) })).status).toBe(403);
    const normalized = new Request("http://localhost:3000/api/paper-trading/accounts", { method: "POST", headers: { "X-Workspace-Id": workspaceId, Host: "127.0.0.1:3000", Origin: "http://127.0.0.1:3000" }, body: "{}" });
    expect((await route.POST(normalized, { params: Promise.resolve({ path: ["accounts"] }) })).status).toBe(200);
  });
  it("stores notes idempotently and exports a CSV without mutating real finances", async () => {
    const before = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    const body = { accountId, key: "paper-note-retry", content: "测试原始复盘，不改写真实资产" };
    expect((await post("reviews", body)).status).toBe(200); expect((await post("reviews", body)).status).toBe(200);
    expect(await db.paperReviewNote.count({ where: { accountId } })).toBe(1);
    const result = await route.GET(new Request(`http://localhost:3000/api/paper-trading/export?accountId=${accountId}`, { headers: { "X-Workspace-Id": workspaceId } }), { params: Promise.resolve({ path: ["export"] }) });
    expect(result.status).toBe(200); expect(await result.text()).toContain("模拟初始资金");
    expect((await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } })).portfolioRevision).toBe(before.portfolioRevision);
  });
  it("restores through application backup, invalidates worker leases and old previews", async () => {
    const { createAccount } = await import("./service");
    const ai = await createAccount(db, workspaceId, new Date(), { purpose: "AI", name: "synthetic restore experiment" });
    const e = await db.paperStrategyExperiment.create({ data: { workspaceId, accountId: ai.id, name: "synthetic restore experiment", status: "RUNNING" } });
    const strategy = await db.paperStrategyVersion.create({ data: { workspaceId, experimentId: e.id, version: 1, originalText: "synthetic restore fixture", strategyJson: "{}", model: "test", promptVersion: "test" } });
    const pool = await db.paperStockPoolVersion.create({ data: { workspaceId, experimentId: e.id, version: 1, instrumentIdsJson: "[]" } });
    const auth = await db.paperStrategyAuthorization.create({ data: { workspaceId, experimentId: e.id, strategyId: strategy.id, stockPoolId: pool.id, limitsJson: "{}", expiresAt: new Date(Date.now() + 60000) } });
    const run = await db.paperStrategyRun.create({ data: { workspaceId, experimentId: e.id, authorizationId: auth.id, strategyId: strategy.id, stockPoolId: pool.id, slot: "synthetic restore slot", experimentVersion: 0, accountVersion: 0, model: "test", inputJson: "{}" } });
    const replay = await createAccount(db, workspaceId, new Date(), { mode: "REPLAY" });
    const dataset = await db.paperReplayDataset.create({ data: { workspaceId, name: "synthetic restore dataset", resolution: "DAY", source: "synthetic test", sourceFetchedAt: new Date(), hash: "synthetic-restore-hash", sourceReviewJson: "{}", calendarJson: "[]" } });
    const replaySession = await db.paperReplaySession.create({ data: { workspaceId, accountId: replay.id, datasetId: dataset.id, clock: new Date("2026-09-01T07:00:00Z"), status: "RUNNING" } });
    const b = await backup.createBackup("MANUAL");
    await db.paperWorkerLease.create({ data: { id: "matching", owner: "old", token: 1, status: "RUNNING", expiresAt: new Date(Date.now() + 60000), heartbeatAt: new Date() } });
    const before = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    expect((await backup.restoreBackup(b.id, b.hash)).restored).toBe(true);
    expect(await db.paperWorkerLease.count()).toBe(0);
    expect((await db.paperStrategyAuthorization.findUniqueOrThrow({ where: { id: auth.id } })).status).toBe("REVOKED");
    expect((await db.paperStrategyRun.findUniqueOrThrow({ where: { id: run.id } })).status).toBe("CANCELLED");
    expect((await db.paperStrategyExperiment.findUniqueOrThrow({ where: { id: e.id } })).status).toBe("PAUSED");
    const restoredReplay = await db.paperReplaySession.findUniqueOrThrow({ where: { id: replaySession.id } });
    expect(restoredReplay.status).toBe("PAUSED"); expect(restoredReplay.clock).toEqual(replaySession.clock);
    expect((await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } })).dataEpoch).toBeGreaterThan(before.dataEpoch);
    expect((await db.paperAccount.findUniqueOrThrow({ where: { id: accountId } })).health).toBe("REVIEW_REQUIRED");
    const { reconcile } = await import("./service"); expect(await reconcile(db, accountId)).toEqual([]);
  });
  it("clears dependent private records and managed backups before reporting success", async () => {
    const marker = `private-paper-note-${accountId}`;
    await db.paperReviewNote.create({ data: { workspaceId, accountId, content: marker } });
    const old = await backup.createBackup("MANUAL");
    const { deletionPreview } = await import("./maintenance"); const { erasePaperAccount } = await import("./erasure");
    const preview = await deletionPreview(db, workspaceId, accountId);
    await erasePaperAccount(workspaceId, accountId, preview.signature);
    expect(await db.paperAccount.count({ where: { id: accountId } })).toBe(0);
    expect(await db.paperReviewNote.count({ where: { accountId } })).toBe(0);
    const backups = await backup.listBackups(); expect(backups).toHaveLength(1); expect(backups[0].id).not.toBe(old.id);
    for (const name of [join(dir, "test.sqlite"), join(process.env.DATABASE_BACKUP_DIR!, `${backups[0].id}.sqlite`)]) expect((await readFile(name)).includes(Buffer.from(marker))).toBe(false);
    expect((await db.deletionJob.findFirstOrThrow({ where: { entityId: accountId } })).status).toBe("DONE");
  });
});
