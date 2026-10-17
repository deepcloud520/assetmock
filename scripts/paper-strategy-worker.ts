import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { continuous, PaperError } from "../src/domain/paper-trading";
import { executeStrategyRun, pauseExperiment, pauseExperimentsOnRestart } from "../src/server/paper-trading/experiments";
import { transaction } from "../src/server/paper-trading/service";

const db = new PrismaClient(), owner = randomUUID();
let stopped = false;
process.on("SIGINT", () => { stopped = true; });
process.on("SIGTERM", () => { stopped = true; });
async function tick() {
  if (!await lease()) { stopped = true; return; }
  const now = new Date();
  const experiments = await db.paperStrategyExperiment.findMany({ where: { status: "RUNNING", account: { mode: "LIVE" } }, include: { authorizations: { where: { status: "ACTIVE" }, orderBy: { confirmedAt: "desc" }, take: 1 } } });
  for (const e of experiments) {
    if (stopped) break;
    const auth = e.authorizations[0];
    if (!auth || auth.expiresAt <= now) { await pauseExperiment(db, e.workspaceId, e.id, "授权期限结束，需确认后恢复", now); continue; }
    if (!continuous(now)) continue;
    try { await executeStrategyRun(db, e.workspaceId, e.id, { beforeSubmit: async tx => { const current = await tx.paperWorkerLease.findUnique({ where: { id: "strategy" } }); if (stopped || !current || current.owner !== owner || current.status !== "RUNNING" || current.expiresAt <= new Date()) throw new PaperError("策略调度资格已失效，本轮停止", 409); } }); }
    catch { console.error("策略本轮未运行，账户资料或授权需要核对。"); }
  }
}
async function lease() {
  return transaction(db, async tx => {
    const now = new Date(), prior = await tx.paperWorkerLease.findUnique({ where: { id: "strategy" } });
    if (prior && prior.owner !== owner && prior.status === "RUNNING" && prior.expiresAt > now) return false;
    await tx.paperWorkerLease.upsert({ where: { id: "strategy" }, create: { id: "strategy", owner, token: 1, status: "RUNNING", expiresAt: new Date(now.getTime() + 90000), heartbeatAt: now, startedAt: now }, update: { owner, token: { increment: 1 }, status: "RUNNING", expiresAt: new Date(now.getTime() + 90000), heartbeatAt: now, ...(prior?.owner !== owner ? { startedAt: now } : {}) } });
    return true;
  });
}
async function main() {
  if (!await lease()) { console.log("已有策略调度服务运行，本进程退出。"); await db.$disconnect(); return; }
  const restarted = await pauseExperimentsOnRestart(db);
  const heartbeat = setInterval(() => { void lease().then(ok => { if (!ok) stopped = true; }).catch(() => { stopped = true; }); }, 10000);
  console.log(`策略调度服务启动；${restarted.paused} 个实验已暂停等待确认。`);
  while (!stopped) {
    try { await tick(); } catch { console.error("策略调度暂时不可用，请查看服务状态。"); }
    for (let n = 0; !stopped && n < 20; n++) await new Promise(r => setTimeout(r, 250));
  }
  clearInterval(heartbeat);
  const current = await db.paperWorkerLease.findUnique({ where: { id: "strategy" } });
  if (current?.owner === owner) {
    await pauseExperimentsOnRestart(db);
    await transaction(db, tx => tx.paperWorkerLease.updateMany({ where: { id: "strategy", owner }, data: { status: "STOPPED", expiresAt: new Date() } }));
  }
  await db.$disconnect();
}
void main().catch(async () => { console.error("策略调度服务启动失败。"); await db.$disconnect(); process.exitCode = 1; });
