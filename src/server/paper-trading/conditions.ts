import type { PaperAccount, PaperCondition, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { PaperError, chinaDay, chinaMinute, checkPriceCage, checkQuantity, json, minorSchema, reserve, symbolSchema } from "../../domain/paper-trading";
import { account, bump, digest, environment, event, rulesFor, sellable, transaction, type Tx } from "./service";

const conditionSchema = z.object({ instrumentId: symbolSchema, kind: z.enum(["TAKE_PROFIT", "STOP_LOSS"]),
  triggerMinor: minorSchema.refine(n => n > 0n), limitMinor: minorSchema.refine(n => n > 0n), quantity: z.number().int().positive().max(1000000),
  expectedVersion: z.number().int().nonnegative(), key: z.string().min(8).max(150), reason: z.string().max(1000).default("") });

export async function createCondition(db: PrismaClient, workspaceId: string, accountId: string, raw: unknown, at = new Date()) {
  const data = conditionSchema.parse(raw), signature = digest({ accountId, ...data });
  return transaction(db, async tx => {
    const prior = await tx.paperCondition.findUnique({ where: { workspaceId_key: { workspaceId, key: data.key } } });
    if (prior) { if (prior.signature !== signature) throw new PaperError("条件单重复编号内容不一致", 409); return prior; }
    const a = await account(tx, workspaceId, accountId);
    if (a.purpose !== "MANUAL") throw new PaperError("条件单首版仅支持手动模拟账户", 403);
    if (a.version !== data.expectedVersion) throw new PaperError("账户已变化，请刷新条件单", 409);
    const session = a.mode === "REPLAY" ? await tx.paperReplaySession.findUnique({ where: { accountId } }) : null;
    const now = session?.clock ?? at, env = await environment(tx, a, data.instrumentId, now);
    if (env.blockers.length) throw new PaperError(env.blockers.join("；"));
    if (!env.state || [data.limitMinor, data.triggerMinor].some(n => n < env.state!.lowerMinor || n > env.state!.upperMinor)) throw new PaperError("触发价或限价超出当日价格范围");
    const { available, position } = await sellable(tx, a.id, data.instrumentId, env.day);
    const input = { instrumentId: data.instrumentId, side: "SELL" as const, quantity: data.quantity, limitMinor: data.limitMinor, reason: data.reason };
    checkQuantity(input, available, env.rules);
    if (!position || available < data.quantity) throw new PaperError("条件单可卖数量不足；今日买入尚不可卖");
    const frozenMinor = reserve(data.limitMinor, data.quantity, 0n, 0n, "SELL", env.rules);
    if (a.cashMinor - a.frozenMinor < frozenMinor) throw new PaperError("模拟资金不足以覆盖卖出费用");
    await bump(tx, a);
    await tx.paperAccount.update({ where: { id: a.id }, data: { frozenMinor: { increment: frozenMinor } } });
    await tx.paperPosition.update({ where: { id: position.id }, data: { frozen: { increment: data.quantity } } });
    return tx.paperCondition.create({ data: { workspaceId, accountId, instrumentId: data.instrumentId, kind: data.kind, triggerMinor: data.triggerMinor, limitMinor: data.limitMinor,
      quantity: data.quantity, frozenMinor, day: env.day, ruleId: a.ruleId, reason: data.reason, key: data.key, signature, createdAt: now } });
  });
}
async function closeCondition(tx: Tx, a: PaperAccount, condition: PaperCondition, status: "CANCELLED" | "EXPIRED", now: Date) {
  if (condition.status !== "WAITING") return condition;
  await tx.paperPosition.update({ where: { accountId_instrumentId: { accountId: a.id, instrumentId: condition.instrumentId } }, data: { frozen: { decrement: condition.quantity } } });
  await tx.paperAccount.update({ where: { id: a.id }, data: { frozenMinor: { decrement: condition.frozenMinor }, version: { increment: 1 } } });
  return tx.paperCondition.update({ where: { id: condition.id }, data: { status, frozenMinor: 0n, closedAt: now } });
}
export async function cancelCondition(db: PrismaClient, workspaceId: string, id: string, at = new Date()) {
  return transaction(db, async tx => {
    const c = await tx.paperCondition.findFirst({ where: { id, workspaceId } }); if (!c) throw new PaperError("条件单不存在", 404);
    const a = await account(tx, workspaceId, c.accountId, false), session = a.mode === "REPLAY" ? await tx.paperReplaySession.findUnique({ where: { accountId: a.id } }) : null;
    return closeCondition(tx, a, c, "CANCELLED", session?.clock ?? at);
  });
}
export async function closeConditionsForAccount(tx: Tx, a: PaperAccount, now: Date) {
  for (const c of await tx.paperCondition.findMany({ where: { accountId: a.id, status: "WAITING" } })) await closeCondition(tx, a, c, "CANCELLED", now);
}

// Called within the same short transaction as the clock/worker transition. Transfer
// the existing stock freeze rather than adding a second freeze on the child order.
export async function triggerConditions(tx: Tx, a: PaperAccount, now: Date) {
  const session = a.mode === "REPLAY" ? await tx.paperReplaySession.findUnique({ where: { accountId: a.id }, include: { dataset: true } }) : null;
  const dailyReplay = session?.dataset.resolution === "DAY";
  for (const c of await tx.paperCondition.findMany({ where: { accountId: a.id, status: "WAITING" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })) {
    const day = chinaDay(now), minute = chinaMinute(now);
    if (!dailyReplay && (c.day < day || c.day === day && minute >= 900)) { await closeCondition(tx, a, c, "EXPIRED", now); continue; }
    if (a.status !== "ACTIVE" || a.health !== "OK" || c.ruleId !== a.ruleId) continue;
    const env = await environment(tx, a, c.instrumentId, now, false), q = env.quote;
    if (env.blockers.length || !q || q.sourceAt <= c.createdAt) continue;
    const hit = c.kind === "TAKE_PROFIT" ? q.priceMinor >= c.triggerMinor : q.priceMinor <= c.triggerMinor;
    if (!hit) { if (dailyReplay) await closeCondition(tx, a, c, "EXPIRED", now); continue; }
    const input = { instrumentId: c.instrumentId, side: "SELL" as const, limitMinor: c.limitMinor, quantity: c.quantity, reason: c.reason };
    try { checkPriceCage(input, q, await rulesFor(tx, c.ruleId)); } catch (err) { if (err instanceof PaperError) { if (dailyReplay) await closeCondition(tx, a, c, "EXPIRED", now); continue; } throw err; }
    const o = await tx.paperOrder.create({ data: { ...input, workspaceId: a.workspaceId, accountId: a.id, day: env.day, ruleId: c.ruleId, frozenMinor: c.frozenMinor, createdAt: now } });
    await tx.paperCondition.update({ where: { id: c.id }, data: { status: "TRIGGERED", childOrderId: o.id, frozenMinor: 0n, triggeredAt: now } });
    await tx.paperAccount.update({ where: { id: a.id }, data: { version: { increment: 1 } } });
    await event(tx, o, "CONDITION_TRIGGERED", json({ conditionId: c.id, kind: c.kind, quoteId: q.id, triggerMinor: c.triggerMinor, message: "已触发限价委托；触发不等于成交" }), now);
  }
}
