import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { validateReplayDataset, replayCapacity, replayFillPrice } from "../../domain/paper-replay";
import { ACTIVE_ORDERS, PaperError, chinaDay, json } from "../../domain/paper-trading";
import { account, closeOrder, createAccountInTransaction, fillOrder, rulesFor, snapshot, transaction, type Tx } from "./service";
import { closeConditionsForAccount, triggerConditions } from "./conditions";

export type ReplayWorkerFence = { owner: string; token: number };

export function preflightReplay(raw: unknown) {
  const data = validateReplayDataset(raw);
  const unknown = data.bars.filter(b => !b.eventCoverage || b.status === "REVIEW_REQUIRED");
  return { resolution: data.resolution, bars: data.bars.length, symbols: [...new Set(data.bars.map(b => b.instrumentId))],
    tradingDays: [...new Set(data.bars.map(b => chinaDay(new Date(b.closeAt))))].length,
    source: data.source, fallbackReason: data.fallbackReason, unresolvedBars: unknown.length, executable: unknown.length === 0,
    warnings: unknown.length ? ["历史证券状态或公司行为覆盖未核实；可以保留数据集，但回放遇到未知资料将暂停"] : [], modelVersion: "kline-v1-participation-1pct" };
}
export async function importReplayDataset(db: PrismaClient, workspaceId: string, raw: unknown) {
  const data = validateReplayDataset(raw), hash = createHash("sha256").update(json(data)).digest("hex");
  return transaction(db, async tx => {
    const existing = await tx.paperReplayDataset.findUnique({ where: { workspaceId_hash: { workspaceId, hash } } }); if (existing) return existing;
    await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    const instruments = await tx.marketInstrument.findMany({ where: { id: { in: [...new Set(data.bars.map(b => b.instrumentId))] } } });
    if (instruments.length !== new Set(data.bars.map(b => b.instrumentId)).size) throw new PaperError("请先核对并登记历史证券资料，不从上传文件覆盖当前证券名称");
    const dataset = await tx.paperReplayDataset.create({ data: { workspaceId, hash, name: data.name, resolution: data.resolution, source: data.source,
      sourceFetchedAt: new Date(data.sourceFetchedAt), sourceReviewJson: json(data.sourceReview), calendarJson: json(data.calendar), fallbackReason: data.fallbackReason } });
    for (let n = 0; n < data.bars.length; n += 500) await tx.paperReplayBar.createMany({ data: data.bars.slice(n, n + 500).map(b => ({ ...b, closeAt: new Date(b.closeAt), workspaceId, datasetId: dataset.id })) });
    return dataset;
  });
}
export async function listReplay(db: PrismaClient, workspaceId: string) {
  return { datasets: await db.paperReplayDataset.findMany({ where: { workspaceId }, select: { id: true, name: true, resolution: true, source: true, sourceFetchedAt: true, fallbackReason: true, hash: true, createdAt: true, modelVersion: true, _count: { select: { bars: true } } }, orderBy: { createdAt: "desc" } }),
    sessions: await db.paperReplaySession.findMany({ where: { workspaceId }, include: { account: true, dataset: { select: { name: true, resolution: true, fallbackReason: true } } }, orderBy: { createdAt: "desc" } }) };
}
async function publishQuotes(tx: Tx, sessionId: string, datasetId: string, clock: Date) {
  const bars = await tx.paperReplayBar.findMany({ where: { datasetId, closeAt: clock } });
  for (const b of bars) {
    const id = createHash("sha256").update(`${sessionId}:${b.id}`).digest("hex");
    await tx.marketQuote.upsert({ where: { id }, create: { id, instrumentId: b.instrumentId, provider: `REPLAY:${sessionId}`, sourceAt: clock, fetchedAt: clock,
      priceMinor: b.closeMinor, previousMinor: b.previousMinor, bidMinor: b.closeMinor, askMinor: b.closeMinor,
      bidQuantity: replayCapacity(b.volumeShares), askQuantity: replayCapacity(b.volumeShares), lowerMinor: b.lowerMinor, upperMinor: b.upperMinor }, update: {} });
  }
}
export async function createReplaySession(db: PrismaClient, workspaceId: string, raw: unknown) {
  const data = z.object({ datasetId: z.string().min(1), name: z.string().max(80).default("历史回放账户"), initialMinor: z.string().regex(/^[1-9]\d{1,13}$/).default("10000000") }).parse(raw);
  return transaction(db, async tx => {
    const dataset = await tx.paperReplayDataset.findFirst({ where: { id: data.datasetId, workspaceId } }); if (!dataset) throw new PaperError("历史数据集不存在", 404);
    const first = await tx.paperReplayBar.findFirst({ where: { datasetId: dataset.id }, orderBy: { closeAt: "asc" } }); if (!first) throw new PaperError("历史数据集没有可用K线");
    const a = await createAccountInTransaction(tx, workspaceId, first.closeAt, { mode: "REPLAY", purpose: "MANUAL", name: data.name, initialMinor: BigInt(data.initialMinor) });
    const session = await tx.paperReplaySession.create({ data: { workspaceId, accountId: a.id, datasetId: dataset.id, clock: first.closeAt, status: "PAUSED" } });
    await publishQuotes(tx, session.id, dataset.id, session.clock);
    return session;
  });
}
export async function replayView(db: PrismaClient, workspaceId: string, id: string) {
  const session = await db.paperReplaySession.findFirst({ where: { id, workspaceId }, include: { dataset: true, account: true } }); if (!session) throw new PaperError("回放会话不存在", 404);
  // No next-bar prices, even for paused sessions. Remaining count alone is safe.
  const [bars, remaining] = await Promise.all([db.paperReplayBar.findMany({ where: { datasetId: session.datasetId, closeAt: { lte: session.clock } }, orderBy: { closeAt: "desc" }, take: 500 }), db.paperReplayBar.count({ where: { datasetId: session.datasetId, closeAt: { gt: session.clock } } })]);
  return { session, bars, remaining };
}
export async function setReplayStatus(db: PrismaClient, workspaceId: string, id: string, expectedVersion: number, status: "RUNNING" | "PAUSED") {
  return transaction(db, async tx => {
    const s = await tx.paperReplaySession.findFirst({ where: { id, workspaceId } }); if (!s) throw new PaperError("回放会话不存在", 404);
    await account(tx, workspaceId, s.accountId);
    if (s.version !== expectedVersion) throw new PaperError("回放状态已变化，请刷新", 409);
    if (s.status === "FINISHED") throw new PaperError("回放已结束，请创建新训练账户");
    return tx.paperReplaySession.update({ where: { id }, data: { status, version: { increment: 1 }, warning: "" } });
  });
}
export async function advanceReplay(db: PrismaClient, workspaceId: string, id: string, expectedVersion: number, workerFence?: ReplayWorkerFence) {
  return transaction(db, async tx => {
    // User-driven steps need no worker lease. Automatic clock and ledger writes
    // must be fenced in the same short transaction as the replay advance.
    if (workerFence) {
      const lease = await tx.paperWorkerLease.findUnique({ where: { id: "matching" } });
      if (!lease || lease.owner !== workerFence.owner || lease.token !== workerFence.token || lease.status !== "RUNNING" || lease.expiresAt <= new Date()) throw new PaperError("回放撮合租约已失效", 409);
    }
    const s = await tx.paperReplaySession.findFirst({ where: { id, workspaceId }, include: { dataset: true } }); if (!s) throw new PaperError("回放会话不存在", 404);
    if (s.version !== expectedVersion) throw new PaperError("回放时钟已变化，请刷新；未重复推进", 409);
    const a = await account(tx, workspaceId, s.accountId), rules = await rulesFor(tx, a.ruleId);
    const next = await tx.paperReplayBar.findFirst({ where: { datasetId: s.datasetId, closeAt: { gt: s.clock } }, orderBy: { closeAt: "asc" } });
    if (!next) {
      for (const o of await tx.paperOrder.findMany({ where: { accountId: a.id, status: { in: ACTIVE_ORDERS } } })) await closeOrder(tx, a, o, "EXPIRED", s.clock);
      await closeConditionsForAccount(tx, await account(tx, workspaceId, a.id), s.clock);
      return tx.paperReplaySession.update({ where: { id }, data: { status: "FINISHED", version: { increment: 1 }, warning: "数据集结束，未成交委托已到期；没有补造未来行情" } });
    }
    const bars = await tx.paperReplayBar.findMany({ where: { datasetId: s.datasetId, closeAt: next.closeAt } });
    if (bars.some(b => !b.eventCoverage || b.status === "REVIEW_REQUIRED")) return tx.paperReplaySession.update({ where: { id }, data: { status: "PAUSED", version: { increment: 1 }, warning: "下一时段证券状态或公司行为覆盖未知，时钟保持不变；请核对后导入新版本数据集" } });
    const calendar = JSON.parse(s.dataset.calendarJson) as { day: string; isOpen: boolean }[], day = chinaDay(next.closeAt);
    const nextDay = calendar.filter(c => c.day > day && c.isOpen).sort((x, y) => x.day.localeCompare(y.day))[0]?.day;
    if (!nextDay) throw new PaperError("下一交易日未确认，无法记录T+1");
    await tx.paperReplaySession.update({ where: { id }, data: { clock: next.closeAt, version: { increment: 1 }, warning: "" } });
    await publishQuotes(tx, id, s.datasetId, next.closeAt);
    const orders = await tx.paperOrder.findMany({ where: { accountId: a.id, status: { in: ACTIVE_ORDERS }, createdAt: { lt: next.closeAt } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    for (const o of orders) {
      const fresh = await account(tx, workspaceId, a.id), bar = bars.find(b => b.instrumentId === o.instrumentId);
      if (s.dataset.resolution === "MINUTE" && o.day < day) { await closeOrder(tx, fresh, o, "EXPIRED", next.closeAt); continue; }
      if (!bar) throw new PaperError("历史K线缺失，不以其他证券价格成交");
      const fillPrice = replayFillPrice(o.side, o.limitMinor, bar);
      const quoteId = createHash("sha256").update(`${id}:${bar.id}`).digest("hex");
      const fills = await tx.paperFill.findMany({ where: { accountId: a.id, quoteId } }), used = fills.reduce((sum, f) => sum + f.quantity, 0);
      const n = Math.min(o.quantity - o.filled, Math.max(0, replayCapacity(bar.volumeShares) - used));
      if (fillPrice !== null && n > 0) await fillOrder(tx, fresh, o, quoteId, fillPrice, n, nextDay, rules, next.closeAt);
      if (s.dataset.resolution === "DAY" || new Date(next.closeAt.getTime() + 8 * 3600000).getUTCHours() >= 15) {
        const remaining = await tx.paperOrder.findUniqueOrThrow({ where: { id: o.id } }); if (ACTIVE_ORDERS.includes(remaining.status)) await closeOrder(tx, await account(tx, workspaceId, a.id), remaining, "EXPIRED", next.closeAt);
      }
    }
    await triggerConditions(tx, await account(tx, workspaceId, a.id), next.closeAt);
    await snapshot(tx, await account(tx, workspaceId, a.id), `replay:${id}:${next.closeAt.toISOString()}`, next.closeAt);
    return tx.paperReplaySession.findUniqueOrThrow({ where: { id } });
  });
}
export async function runReplaySessions(db: PrismaClient, workerFence?: ReplayWorkerFence) {
  for (const s of await db.paperReplaySession.findMany({ where: { status: "RUNNING", account: { status: "ACTIVE" } } })) {
    try { await advanceReplay(db, s.workspaceId, s.id, s.version, workerFence); } catch (err) {
      if (err instanceof PaperError && err.status === 409) continue;
      await transaction(db, tx => tx.paperReplaySession.updateMany({ where: { id: s.id, version: s.version }, data: { status: "PAUSED", warning: err instanceof Error ? err.message.slice(0, 500) : "回放异常，请核对", version: { increment: 1 } } }));
    }
  }
}
