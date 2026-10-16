import { PrismaClient } from "@prisma/client";
import { mkdtemp, readdir, readFile, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const execute = promisify(execFile), require = createRequire(import.meta.url);
const day = process.argv[2] ?? "2026-10-08";
if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Use a YYYY-MM-DD client date");
const dir = await mkdtemp(join(tmpdir(), "paper-worker-isolated-")), file = join(dir, "test.sqlite");
const databaseURL = `file:${file}`, originalURL = process.env.DATABASE_URL;
const children = [], logs = {}, checks = {}, report = { checkedDay: day, startedAt: new Date().toISOString(), evidenceType: "REAL_CHILD_PROCESSES_ISOLATED_SYNTHETIC_LEDGER", liveMarketEvidence: false, realFinancialDatabaseUsed: false, networkDisabled: true, temporaryDirectory: dir, prerequisites: [], checks };
let db;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(read, timeout = 15000) {
  const start = Date.now();
  for (;;) { const result = await read(); if (result) return result; if (Date.now() - start > timeout) throw new Error("Process smoke condition timed out"); await sleep(100); }
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  try { await waitFor(async () => child.exitCode !== null || child.signalCode !== null, 6000); }
  catch { child.kill("SIGKILL"); await waitFor(async () => child.exitCode !== null || child.signalCode !== null, 3000); }
}
function launch(label, script, args = []) {
  logs[label] = [];
  const child = spawn(process.execPath, args.length ? args : ["--require", join(dir, "no-network.cjs"), script], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseURL, OPENAI_API_KEY: "", DATABASE_BACKUP_DIR: join(dir, "backups") }, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  child.stdout.on("data", b => logs[label].push(b.toString())); child.stderr.on("data", b => logs[label].push(b.toString()));
  child.on("error", err => logs[label].push(`spawn failed: ${err.message}`));
  return child;
}
try {
  for (const script of ["paper-worker.js", "paper-strategy-worker.js"]) {
    try { await access(join(".local-data/paper-runtime/scripts", script)); }
    catch { await execute(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "tsconfig.paper-worker.json"], { timeout: 90000 }); report.prerequisites.push("Locally compiled worker dependency graph because an artifact was missing"); break; }
  }
  report.prerequisites.push("Used existing local compiled matching and strategy worker artifacts");
} catch (error) {
  report.setupError = error.message;
}
try {
  if (report.setupError) throw new Error(report.setupError);
  // Apply the complete schema in an isolated file. Never resolve the app's .env.
  const migrations = (await readdir("prisma/migrations")).filter(x => /^\d/.test(x)).sort();
  const sqlFile = join(dir, "migration.sql");
  await writeFile(sqlFile, (await Promise.all(migrations.map(m => readFile(`prisma/migrations/${m}/migration.sql`, "utf8")))).join("\n"));
  await execute("python3", ["-c", "import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.executescript(open(sys.argv[2]).read());c.close()", file, sqlFile]);
  report.schemaMigrations = migrations;
  process.env.DATABASE_URL = databaseURL;
  db = new PrismaClient({ datasourceUrl: databaseURL });
  await writeFile(join(dir, "no-network.cjs"), 'globalThis.fetch = async () => { console.error("SYNTHETIC_NETWORK_BLOCKED"); throw new Error("synthetic process validation: network disabled"); };\n');
  const service = require(resolve(".local-data/paper-runtime/src/server/paper-trading/service.js"));
  const domain = require(resolve(".local-data/paper-runtime/src/domain/paper-trading.js"));
  const workspace = await db.workspace.create({ data: {} }), account = await service.createAccount(db, workspace.id);
  await db.marketInstrument.create({ data: { id: "sh600000", name: "Synthetic Smoke Stock", board: "MAIN", source: "isolated synthetic process test" } });
  const previousDay = new Date(Date.now() + 8 * 3600000 - 86400000).toISOString().slice(0, 10);
  const frozen = domain.reserve(1000n, 100, 0n, 0n, "BUY", domain.DEFAULT_RULES);
  const order = await db.paperOrder.create({ data: { workspaceId: workspace.id, accountId: account.id, instrumentId: "sh600000", side: "BUY", limitMinor: 1000n, quantity: 100, day: previousDay, ruleId: account.ruleId, frozenMinor: frozen, reason: "synthetic prior-day order; never a live-market trade" } });
  await db.paperAccount.update({ where: { id: account.id }, data: { frozenMinor: frozen } });

  const first = launch("matching-first", resolve(".local-data/paper-runtime/scripts/paper-worker.js"));
  const initial = await waitFor(async () => { const l = await db.paperWorkerLease.findUnique({ where: { id: "matching" } }); return l?.status === "RUNNING" ? l : null; });
  const second = launch("matching-second", resolve(".local-data/paper-runtime/scripts/paper-worker.js"));
  const observed = [];
  for (let n = 0; n < 65; n++) { const rows = await db.paperWorkerLease.findMany({ where: { id: "matching", status: "RUNNING", expiresAt: { gt: new Date() } } }); assert.equal(rows.length, 1); assert.equal(rows[0].owner, initial.owner); observed.push({ owner: rows[0].owner, token: rows[0].token }); await sleep(100); }
  assert.equal(first.exitCode, null); assert.equal(second.exitCode, null);
  const baseline = await db.paperWorkerLease.findUniqueOrThrow({ where: { id: "matching" } });
  checks.dualMatchingWorkers = { passed: true, pids: [first.pid, second.pid], activeLeaseRows: 1, observedOwnerCount: new Set(observed.map(x => x.owner)).size, initialToken: initial.token, lastToken: baseline.token, observationSamples: observed.length };
  const expired = await db.paperOrder.findUniqueOrThrow({ where: { id: order.id } }), after = await db.paperAccount.findUniqueOrThrow({ where: { id: account.id } });
  assert.equal(expired.status, "EXPIRED"); assert.equal(after.frozenMinor, 0n); assert.equal(after.cashMinor, account.cashMinor); assert.equal(await db.paperFill.count(), 0);
  checks.priorDayOrder = { passed: true, status: expired.status, frozenMinor: after.frozenMinor.toString(), cashUnchanged: true, fillCount: 0, quoteCount: await db.marketQuote.count() };
  await stop(first);
  const taken = await waitFor(async () => { const l = await db.paperWorkerLease.findUnique({ where: { id: "matching" } }); return l && l.status === "RUNNING" && l.owner !== baseline.owner && l.token > baseline.token ? l : null; });
  checks.matchingTakeover = { passed: true, stoppedPid: first.pid, survivingPid: second.pid, priorOwner: baseline.owner, nextOwner: taken.owner, priorToken: baseline.token, nextToken: taken.token };
  await stop(second);

  const lockFile = join(dir, "lock-events.jsonl"), locker = join(dir, "locker.cjs");
  await writeFile(locker, `const {withPaperLock}=require(${JSON.stringify(resolve(".local-data/paper-runtime/src/lib/paper-lock.js"))});const fs=require("node:fs");const out=${JSON.stringify(lockFile)};withPaperLock(async()=>{fs.appendFileSync(out,JSON.stringify({pid:process.pid,event:"enter",at:Date.now()})+"\\n");await new Promise(r=>setTimeout(r,500));fs.appendFileSync(out,JSON.stringify({pid:process.pid,event:"exit",at:Date.now()})+"\\n");}).catch(e=>{console.error(e);process.exitCode=1;});`);
  const lockA = launch("lock-a", locker, [locker]);
  await waitFor(async () => { try { return (await readFile(lockFile, "utf8")).includes('"enter"'); } catch { return false; } });
  const lockB = launch("lock-b", locker, [locker]);
  await waitFor(async () => lockA.exitCode !== null && lockB.exitCode !== null); assert.equal(lockA.exitCode, 0); assert.equal(lockB.exitCode, 0);
  const events = (await readFile(lockFile, "utf8")).trim().split("\n").map(line => JSON.parse(line));
  assert.deepEqual(events.map(e => e.event), ["enter", "exit", "enter", "exit"]); assert.equal(events[0].pid, events[1].pid); assert.equal(events[2].pid, events[3].pid); assert.notEqual(events[0].pid, events[2].pid); assert(events[2].at >= events[1].at);
  checks.crossProcessPaperLock = { passed: true, events };

  // Deliberately exceed the lease TTL without contacting a source. The mock
  // ignores AbortSignal only to exercise heartbeat scheduling during a blocked
  // asynchronous read; it is not evidence of real provider timeout behavior.
  const slowPreload = join(dir, "slow-synthetic-source.cjs");
  await writeFile(slowPreload, 'globalThis.fetch = async () => { console.log("SYNTHETIC_SLOW_READ_STARTED"); await new Promise(r => setTimeout(r, 22000)); throw new Error("synthetic 22-second source wait; no network"); };\n');
  const watched = await db.paperWatchlist.create({ data: { workspaceId: workspace.id, accountId: account.id, instrumentId: "sh600000" } });
  const slow = launch("matching-slow-synthetic", "", ["--require", slowPreload, resolve(".local-data/paper-runtime/scripts/paper-worker.js")]);
  await waitFor(async () => logs["matching-slow-synthetic"].join("").includes("SYNTHETIC_SLOW_READ_STARTED"));
  const slowInitial = await db.paperWorkerLease.findUniqueOrThrow({ where: { id: "matching" } });
  const standby = launch("matching-slow-standby", resolve(".local-data/paper-runtime/scripts/paper-worker.js"));
  const heartbeatSamples = [], observationStarted = Date.now();
  for (let n = 0; n < 37; n++) {
    const l = await db.paperWorkerLease.findUniqueOrThrow({ where: { id: "matching" } });
    assert.equal(l.owner, slowInitial.owner); assert.equal(l.token, slowInitial.token); assert.equal(l.status, "RUNNING"); assert(l.expiresAt.getTime() > Date.now());
    heartbeatSamples.push({ at: new Date().toISOString(), heartbeatAt: l.heartbeatAt.toISOString(), remainingMs: l.expiresAt.getTime() - Date.now() });
    await sleep(500);
  }
  const distinctHeartbeats = [...new Set(heartbeatSamples.map(s => s.heartbeatAt))];
  assert(Date.now() - observationStarted > 15000); assert(distinctHeartbeats.length >= 3);
  checks.slowSourceHeartbeat = { passed: true, pids: [slow.pid, standby.pid], syntheticWaitMs: 22000, observationMs: Date.now() - observationStarted, tokenStayedConstant: true, ownerStayedConstant: true, heartbeatTimes: distinctHeartbeats, minimumRemainingLeaseMs: Math.min(...heartbeatSamples.map(s => s.remainingMs)), samples: heartbeatSamples, actualNetworkUsed: false, sourceTimeoutBehaviorQualified: false };
  await stop(standby);
  const foreignOwner = "synthetic-external-owner", foreignExpiry = new Date(Date.now() + 60000);
  await db.paperWorkerLease.update({ where: { id: "matching" }, data: { owner: foreignOwner, token: slowInitial.token + 1, expiresAt: foreignExpiry } });
  // Cross another heartbeat and let the blocked tick return. It must not renew
  // or acquire the foreign lease, nor submit a stale frame for matching.
  await sleep(5500);
  const foreign = await db.paperWorkerLease.findUniqueOrThrow({ where: { id: "matching" } });
  assert.equal(foreign.owner, foreignOwner); assert.equal(foreign.token, slowInitial.token + 1); assert.equal(foreign.expiresAt.getTime(), foreignExpiry.getTime()); assert.equal(await db.paperFill.count(), 0); assert.equal(await db.marketQuote.count(), 0);
  checks.lostLeaseHeartbeatFence = { passed: true, syntheticForcedOwnershipChange: true, ownerUnchanged: true, foreignExpiryUnchanged: true, fillCount: 0, quoteCount: 0 };
  await stop(slow);
  await db.paperWatchlist.delete({ where: { id: watched.id } });

  const ai = await service.createAccount(db, workspace.id, new Date(), { purpose: "AI", name: "Synthetic strategy restart smoke" });
  const experiment = await db.paperStrategyExperiment.create({ data: { workspaceId: workspace.id, accountId: ai.id, name: "Synthetic strategy restart smoke", status: "RUNNING" } });
  const strategy = await db.paperStrategyVersion.create({ data: { workspaceId: workspace.id, experimentId: experiment.id, version: 1, originalText: "synthetic restart fixture; no model invocation", strategyJson: "{}", model: "synthetic-test", promptVersion: "synthetic-test" } });
  const pool = await db.paperStockPoolVersion.create({ data: { workspaceId: workspace.id, experimentId: experiment.id, version: 1, instrumentIdsJson: "[]" } });
  const auth = await db.paperStrategyAuthorization.create({ data: { workspaceId: workspace.id, experimentId: experiment.id, strategyId: strategy.id, stockPoolId: pool.id, limitsJson: "{}", expiresAt: new Date(Date.now() + 60000) } });
  const run = await db.paperStrategyRun.create({ data: { workspaceId: workspace.id, experimentId: experiment.id, authorizationId: auth.id, strategyId: strategy.id, stockPoolId: pool.id, slot: "synthetic-restart", experimentVersion: 0, accountVersion: 0, model: "synthetic-test", inputJson: "{}" } });
  const scheduler = launch("strategy-restart", resolve(".local-data/paper-runtime/scripts/paper-strategy-worker.js"));
  await waitFor(async () => (await db.paperStrategyExperiment.findUnique({ where: { id: experiment.id } }))?.status === "PAUSED");
  const revoked = await db.paperStrategyAuthorization.findUniqueOrThrow({ where: { id: auth.id } }), cancelled = await db.paperStrategyRun.findUniqueOrThrow({ where: { id: run.id } });
  assert.equal(revoked.status, "REVOKED"); assert.equal(cancelled.status, "CANCELLED"); assert.equal(await db.paperStrategyRun.count({ where: { experimentId: experiment.id } }), 1);
  checks.strategyRestart = { passed: true, pid: scheduler.pid, experimentStatus: "PAUSED", authorizationStatus: revoked.status, priorRunStatus: cancelled.status, newDecisionRunCount: 0, modelInvoked: false };
  await stop(scheduler);
  assert.deepEqual(await db.$queryRawUnsafe("PRAGMA foreign_key_check"), []); assert.equal(await db.asset.count(), 0); assert.equal(await db.transaction.count(), 0);
  checks.isolation = { passed: true, realAssets: 0, realTransactions: 0, marketQuotes: await db.marketQuote.count(), foreignKeyIssues: 0 };
  report.passed = true;
} catch (error) { report.passed = false; report.error = error.message; process.exitCode = 1; }
finally {
  for (const child of children) await stop(child);
  await db?.$disconnect(); report.completedAt = new Date().toISOString(); report.processLogs = logs;
  report.temporaryDataRemoved = true; await rm(dir, { recursive: true, force: true });
  if (originalURL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalURL;
  const output = join("docs/data", `paper-worker-process-review-${day}.json`); await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ passed: report.passed, output, checks: Object.keys(checks), error: report.error ?? null }, null, 2));
}
