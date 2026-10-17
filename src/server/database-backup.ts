import { runPython, databaseFile as resolvedDatabaseFile } from "../../scripts/lib/runtime.cjs";
import { mkdir, readdir, readFile, writeFile, unlink, chmod } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { exclusively } from "@/lib/database-maintenance";
import { today } from "@/domain/database-planning";
import { ApiError } from "./portfolio";
export function databaseFile() { return resolvedDatabaseFile(); }
export const backupDirectory = () => process.env.DATABASE_BACKUP_DIR ?? path.join(process.cwd(), ".local-data", "backups");
type Manifest = { id: string; kind: "DAILY" | "MIGRATION" | "MANUAL"; createdAt: string; date: string; hash: string; schemaVersion: string };
async function inspect(file: string) { const result = await runPython(`import sqlite3,json,sys,pathlib\nc=sqlite3.connect(pathlib.Path(sys.argv[1]).resolve().as_uri()+'?mode=ro',uri=True)\nchecks=c.execute('PRAGMA integrity_check').fetchall()\nforeign=c.execute('PRAGMA foreign_key_check').fetchall()\ntables=[x[0] for x in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]\ncounts={t:c.execute('SELECT COUNT(*) FROM "'+t.replace('"','""')+'"').fetchone()[0] for t in tables}\nmigrations=[x[0] for x in c.execute('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name')]\nprint(json.dumps({'integrity':checks,'foreign':foreign,'counts':counts,'migrations':migrations}))`, [file]); return JSON.parse(result.stdout) as { integrity: string[][]; foreign: unknown[]; counts: Record<string, number>; migrations: string[] }; }
async function copyDatabase(source: string, destination: string) { await runPython("import sqlite3,sys,pathlib\ns=sqlite3.connect(pathlib.Path(sys.argv[1]).resolve().as_uri()+'?mode=ro',uri=True)\nd=sqlite3.connect(sys.argv[2]);s.backup(d);d.close();s.close()", [source, destination]); }
export async function listBackups(): Promise<Manifest[]> { await mkdir(backupDirectory(), { recursive: true, mode: 0o700 }); const files = await readdir(backupDirectory()); const rows: Manifest[] = []; for (const file of files.filter((f) => /^[a-f0-9-]{36}\.json$/.test(f))) { try { const m = JSON.parse(await readFile(path.join(backupDirectory(), file), "utf8")); if (m.id === file.slice(0, -5)) rows.push(m); } catch { /* Invalid manifests are not usable restore points. */ } } return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
export async function createBackup(kind: Manifest["kind"] = "MANUAL") { await mkdir(backupDirectory(), { recursive: true, mode: 0o700 }); const id = randomUUID(); const file = path.join(backupDirectory(), `${id}.sqlite`); await copyDatabase(databaseFile(), file); await chmod(file, 0o600); const checked = await inspect(file); if (checked.integrity[0]?.[0] !== "ok" || checked.foreign.length) { await unlink(file); throw new ApiError("备份完整性检查未通过", 422); }
  const manifest: Manifest = { id, kind, createdAt: new Date().toISOString(), date: today(), hash: createHash("sha256").update(await readFile(file)).digest("hex"), schemaVersion: checked.migrations.at(-1) ?? "" }; await writeFile(path.join(backupDirectory(), `${id}.json`), JSON.stringify(manifest), { mode: 0o600 });
  const list = await listBackups(); for (const k of ["DAILY", "MIGRATION"] as const) for (const old of list.filter((b) => b.kind === k).slice(k === "DAILY" ? 7 : 3)) { await unlink(path.join(backupDirectory(), `${old.id}.sqlite`)); await unlink(path.join(backupDirectory(), `${old.id}.json`)); }
  return manifest;
}
let dailyWork: Promise<void> | null = null;
export async function dailyBackup() { if (!dailyWork) dailyWork = (async () => { if (!(await listBackups()).some((b) => b.kind === "DAILY" && b.date === today())) await createBackup("DAILY"); })().finally(() => { dailyWork = null; }); return dailyWork; }
async function backupFile(id: string) { if (!/^[a-f0-9-]{36}$/.test(id)) throw new ApiError("备份编号无效", 422); const manifest = (await listBackups()).find((b) => b.id === id); if (!manifest) throw new ApiError("备份不存在", 404); const file = path.join(backupDirectory(), `${id}.sqlite`); if (createHash("sha256").update(await readFile(file)).digest("hex") !== manifest.hash) throw new ApiError("备份校验值不匹配", 422); return file; }
export async function restorePreview(id: string) { const checked = await inspect(await backupFile(id)); const current = await inspect(databaseFile()); if (checked.integrity[0]?.[0] !== "ok" || checked.foreign.length || JSON.stringify(checked.migrations) !== JSON.stringify(current.migrations)) throw new ApiError("备份结构或完整性不兼容，请使用离线迁移恢复", 422); return { ...checked, currentCounts: current.counts, warning: "恢复会替换本机整个数据库及所有本地空间，当前数据将先备份。应用外副本不受管理。" }; }
export async function restoreBackup(id: string, expectedHash: string) { return exclusively(async () => {
  await restorePreview(id); const file = await backupFile(id); const actual = createHash("sha256").update(await readFile(file)).digest("hex");
  if (expectedHash !== actual) throw new ApiError("备份预检已变化", 409);
  const prior = (await db.workspace.aggregate({ _max: { dataEpoch: true, portfolioRevision: true, transactionRevision: true, professionalRevision: true } }))._max;
  const priorEpoch = prior.dataEpoch ?? 0;
  const fallback = await createBackup("MANUAL"); await db.$disconnect();
  try { await copyDatabase(file, databaseFile()); const checked = await inspect(databaseFile()); if (checked.integrity[0]?.[0] !== "ok" || checked.foreign.length) throw new ApiError("恢复校验失败", 500);
    const restored = (await db.workspace.aggregate({ _max: { dataEpoch: true, portfolioRevision: true, transactionRevision: true, professionalRevision: true } }))._max;
    await db.workspace.updateMany({ data: { dataEpoch: Math.max(priorEpoch, restored.dataEpoch ?? 0) + 1, portfolioRevision: Math.max(prior.portfolioRevision ?? 0, restored.portfolioRevision ?? 0) + 1, transactionRevision: Math.max(prior.transactionRevision ?? 0, restored.transactionRevision ?? 0) + 1, professionalRevision: Math.max(prior.professionalRevision ?? 0, restored.professionalRevision ?? 0) + 1 } });
    await db.carDecision.updateMany({ data: { version: { increment: 1 }, evaluationJson: null } });
    await db.businessDraft.updateMany({ data: { version: { increment: 1 } } });
    await db.agentRun.updateMany({ where: { status: { in: ["RUNNING", "QUEUED"] } }, data: { status: "INTERRUPTED", errorCode: "RESTORED_DATABASE" } });
    await db.agentProposal.updateMany({ where: { status: "PENDING" }, data: { status: "EXPIRED", version: { increment: 1 } } });
    await db.paperWorkerLease.deleteMany();
    await db.paperPreview.deleteMany();
    await db.paperAccount.updateMany({ where: { status: "ACTIVE" }, data: { health: "REVIEW_REQUIRED", version: { increment: 1 } } });
    await db.paperStrategyAuthorization.updateMany({ where: { status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date() } });
    await db.paperStrategyRun.updateMany({ where: { status: "RUNNING" }, data: { status: "CANCELLED", reason: "数据库恢复，原运行已停止", completedAt: new Date() } });
    await db.paperStrategyExperiment.updateMany({ where: { status: "RUNNING" }, data: { status: "PAUSED", stopReason: "数据库恢复，需要重新核对授权", version: { increment: 1 } } });
    await db.paperReplaySession.updateMany({ where: { status: "RUNNING" }, data: { status: "PAUSED", warning: "数据库恢复，时钟保持原核对点", version: { increment: 1 } } });
  } catch (error) { await db.$disconnect(); await copyDatabase(await backupFile(fallback.id), databaseFile()); throw error; }
  return { restored: true, cacheReset: true };
}); }

export async function clearManagedBackups() { await mkdir(backupDirectory(), { recursive: true, mode: 0o700 }); for (const file of await readdir(backupDirectory())) if (/^[a-f0-9-]{36}\.(sqlite|json)$/.test(file)) await unlink(path.join(backupDirectory(), file)); }
export async function restoreToIsolated(id: string, directory: string) { await mkdir(directory, { recursive: true }); const target = path.join(directory, "restored.sqlite"); await copyDatabase(await backupFile(id), target); return inspect(target); }
