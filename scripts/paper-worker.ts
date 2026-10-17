import { shouldStopForOrphan } from "./lib/supervisor";
import { PrismaClient } from "@prisma/client";
import { triggerConditions } from "../src/server/paper-trading/conditions";
import { runReplaySessions } from "../src/server/paper-trading/replay";
import { randomUUID } from "node:crypto";
import { ACTIVE_ORDERS, ruleSchema } from "../src/domain/paper-trading";
import { acquireLease, dailySnapshots, matchOrders, reconcile, transaction } from "../src/server/paper-trading/service";
import { refreshQuotes } from "../src/server/paper-trading/market";

const db = new PrismaClient(), owner = randomUUID();
const lastFetch = new Map<string, number>();
let stopped = false, leaseLost = false;
let currentLease: { token: number } | null = null;
let heartbeatWork: Promise<void> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
function stop() { stopped = true; if (heartbeatTimer) clearInterval(heartbeatTimer); }
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
async function heartbeat() {
  const tracked = currentLease; if (!tracked || stopped) return;
  const valid = await transaction(db, async tx => {
    const now = new Date();
    const renewed = await tx.paperWorkerLease.updateMany({
      where: { id: "matching", owner, token: tracked.token, status: "RUNNING", expiresAt: { gt: now } },
      data: { expiresAt: new Date(now.getTime() + 15000), heartbeatAt: now },
    });
    if (renewed.count === 1) return true;
    // A normal tick may just have advanced our fencing token. Recognize it
    // without renewing any different token or reclaiming an expired lease.
    const latest = await tx.paperWorkerLease.findUnique({ where: { id: "matching" } });
    return Boolean(latest && latest.owner === owner && latest.status === "RUNNING" && latest.expiresAt > now);
  });
  if (!valid && currentLease?.token === tracked.token) { currentLease = null; leaseLost = true; }
}
function scheduleHeartbeat() {
  if (stopped || heartbeatWork || !currentLease) return;
  heartbeatWork = heartbeat().catch(() => { currentLease = null; leaseLost = true; }).finally(() => { heartbeatWork = null; });
}
async function tick() {
  const lease = await acquireLease(db, owner);
  if (!lease) { currentLease = null; leaseLost = true; return 5000; }
  currentLease = { token: lease.token }; leaseLost = false;
  const accounts = await db.paperAccount.findMany({ where: { status: "ACTIVE", mode: "LIVE" } });
  for (const a of accounts) await reconcile(db, a.id);
  const [orders, positions, watched] = await Promise.all([
    db.paperOrder.findMany({ where: { status: { in: ACTIVE_ORDERS }, account: { status: "ACTIVE", mode: "LIVE" } } }),
    db.paperPosition.findMany({ where: { quantity: { gt: 0 }, account: { status: "ACTIVE", mode: "LIVE" } } }),
    db.paperWatchlist.findMany({ where: { account: { status: "ACTIVE", mode: "LIVE" } } }),
  ]);
  const symbols = [...new Set([...orders, ...positions, ...watched].map(r => r.instrumentId))];
  const versions = await db.paperRuleVersion.findMany({ where: { id: { in: accounts.map(a => a.ruleId) } } });
  const configs = versions.map(v => ruleSchema.parse(JSON.parse(v.configJson)));
  let quoteError = "";
  for (const provider of [...new Set(configs.map(r => r.provider))]) {
    const pollMs = Math.min(...configs.filter(c => c.provider === provider).map(c => c.pollMs));
    if (Date.now() - (lastFetch.get(provider) ?? 0) < pollMs) continue;
    lastFetch.set(provider, Date.now());
    try { for (let start = 0; start < symbols.length; start += 50) await refreshQuotes(db, symbols.slice(start, start + 50), provider); }
    catch (e) { quoteError = e instanceof Error ? e.message : "行情读取失败"; }
  }
  // Re-acquire fencing after potentially slow network access; no old cached ticks replayed.
  if (stopped || leaseLost) return 5000;
  const freshLease = await acquireLease(db, owner);
  if (!freshLease) { currentLease = null; leaseLost = true; return 5000; }
  currentLease = { token: freshLease.token };
  await transaction(db, async tx => {
    const fence = await tx.paperWorkerLease.findUnique({ where: { id: "matching" } });
    if (!fence || fence.owner !== owner || fence.token !== freshLease.token || fence.expiresAt <= new Date()) return;
    for (const a of await tx.paperAccount.findMany({ where: { status: "ACTIVE", mode: "LIVE" } })) await triggerConditions(tx, a, new Date());
  });
  await matchOrders(db, owner, freshLease.token);
  await runReplaySessions(db, { owner, token: freshLease.token });
  await dailySnapshots(db);
  if (quoteError) await transaction(db, tx => tx.paperWorkerLease.updateMany({ where: { id: "matching", owner, token: freshLease.token }, data: { error: quoteError } }));
  return 5000; // Keep the 15-second lease alive even without accounts or with slow quote polling.
}
async function main() {
  console.log("模拟撮合服务启动。只有已核实资料和新鲜行情能够成交。");
  heartbeatTimer = setInterval(scheduleHeartbeat, 5000);
  while (!stopped) {
    if (shouldStopForOrphan()) { console.log("父进程已退出，模拟撮合服务停止。"); break; }
    let delay = 5000;
    try { delay = await tick(); } catch (e) { console.error("模拟撮合暂停：", e instanceof Error ? e.message : "unknown"); }
    for (let elapsed = 0; !stopped && elapsed < delay; elapsed += 250) await new Promise(r => setTimeout(r, 250));
  }
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  await heartbeatWork; currentLease = null;
  await transaction(db, tx => tx.paperWorkerLease.updateMany({ where: { id: "matching", owner }, data: { status: "STOPPED", expiresAt: new Date() } }));
  await db.$disconnect();
}
void main().catch(async e => { stop(); await heartbeatWork; console.error(e); await db.$disconnect(); process.exitCode = 1; });
