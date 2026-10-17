import { z } from "zod";
import { db } from "@/lib/db";
import { assertLocal } from "@/server/local-data-access";
import { apiError, getWorkspaceId } from "@/server/portfolio";
import { PaperError, json, symbolSchema, ruleSchema } from "@/domain/paper-trading";
import { createAccount, overview, previewOrder, submitOrder, cancelOrder, archiveAccount, transaction, account } from "@/server/paper-trading/service";
import { refreshQuotes, STARTER_SYMBOLS, searchSecurities, dailyBars } from "@/server/paper-trading/market";
import { reviewMarket, previewAdjustment, confirmAdjustment, deletionPreview } from "@/server/paper-trading/maintenance";
import { erasePaperAccount } from "@/server/paper-trading/erasure";
import { tradingStatus, healthSummary, operateAccount, retryMarket, prepareMarketReview, confirmMarketReview, publishBenchmark } from "@/server/paper-trading/monitoring";
import { accountInsights, historyPage, orderDetails } from "@/server/paper-trading/insights";
import { listExperiments, createExperiment, updateStockPool, draftStrategy, confirmStrategy, authorizeExperiment, pauseExperiment, archiveExperiment } from "@/server/paper-trading/experiments";
import { listReplay, preflightReplay, importReplayDataset, createReplaySession, replayView, advanceReplay, setReplayStatus } from "@/server/paper-trading/replay";
import { createCondition, cancelCondition } from "@/server/paper-trading/conditions";
import { exportPaperAccount } from "@/server/paper-trading/export";
import { generatePaperReview } from "@/server/paper-trading/ai-review";

export const runtime = "nodejs";
type Context = { params: Promise<{ path?: string[] }> };
const id = z.string().min(1).max(128), version = z.number().int().nonnegative();
const response = (data: unknown) => new Response(json(data), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
async function context(request: Request, ctx: Context) {
  assertLocal(request);
  const workspaceId = getWorkspaceId(request); await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  return { workspaceId, route: (await ctx.params).path?.join("/") ?? "", url: new URL(request.url) };
}
function errorResponse(error: unknown) { return error instanceof PaperError ? Response.json({ error: error.message }, { status: error.status }) : apiError(error); }
export async function GET(request: Request, ctx: Context) {
  try {
    const { workspaceId, route, url } = await context(request, ctx);
    const accountId = url.searchParams.get("accountId") ?? undefined;
    if (route === "experiments") return response(await listExperiments(db, workspaceId));
    if (route === "replay") return response(await listReplay(db, workspaceId));
    if (route === "replay/view") return response(await replayView(db, workspaceId, id.parse(url.searchParams.get("sessionId"))));
    if (route === "status") return response(await tradingStatus(db, workspaceId, id.parse(accountId), url.searchParams.get("instrumentId") ? symbolSchema.parse(url.searchParams.get("instrumentId")) : undefined));
    if (route === "health/detail") return response(await healthSummary(db, workspaceId, id.parse(accountId)));
    if (route === "insights") return response(await accountInsights(db, workspaceId, id.parse(accountId), { from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined }));
    if (route === "history") return response(await historyPage(db, workspaceId, id.parse(accountId), { kind: z.enum(["ORDERS", "FILLS", "ENTRIES", "NOTES", "SNAPSHOTS", "ADJUSTMENTS"]).parse(url.searchParams.get("kind")), cursor: url.searchParams.get("cursor") ?? undefined, take: Number(url.searchParams.get("take") ?? 50), from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined }));
    if (route === "orders/detail") return response(await orderDetails(db, workspaceId, id.parse(url.searchParams.get("orderId"))));
    if (route === "conditions") { await account(db, workspaceId, id.parse(accountId), false); return response(await db.paperCondition.findMany({ where: { workspaceId, accountId }, orderBy: { createdAt: "desc" } })); }
    if (["", "overview", "accounts", "positions", "orders", "fills", "cash-entries", "equity", "reviews"].includes(route)) return response(await overview(db, workspaceId, accountId));
    if (route === "health") return response(await db.paperWorkerLease.findUnique({ where: { id: "matching" } }));
    if (route === "instruments") {
      const search = (url.searchParams.get("q") ?? "").trim().slice(0, 50);
      if (search) return response(await searchSecurities(db, search));
      return response(await db.marketInstrument.findMany({ where: search ? { OR: [{ id: { contains: search.toLowerCase() } }, { name: { contains: search } }] } : {}, orderBy: { id: "asc" }, take: 50 }));
    }
    if (route === "quotes") {
      const symbols = url.searchParams.get("symbols")?.split(",").slice(0, 50) ?? STARTER_SYMBOLS;
      symbols.forEach(s => symbolSchema.parse(s));
      let error: string | null = null;
      const a = await db.paperAccount.findFirst({ where: { workspaceId, ...(accountId ? { id: accountId } : { status: "ACTIVE", purpose: "MANUAL", mode: "LIVE" }) }, include: { rule: true } });
      if (accountId && !a) throw new PaperError("账户不存在", 404);
      if (a?.mode === "REPLAY") {
        const s = await db.paperReplaySession.findUniqueOrThrow({ where: { accountId: a.id } });
        const quotes = await Promise.all(symbols.map(instrumentId => db.marketQuote.findFirst({ where: { instrumentId, provider: `REPLAY:${s.id}`, sourceAt: { lte: s.clock } }, orderBy: { sourceAt: "desc" } })));
        return response({ quotes: quotes.filter(Boolean), error: null, fetchedAt: s.clock });
      }
      const provider = a ? ruleSchema.parse(JSON.parse(a.rule.configJson)).provider : "TENCENT";
      try { await refreshQuotes(db, symbols, provider); } catch (e) { error = e instanceof Error ? e.message : "来源不可用"; }
      const quotes = await Promise.all(symbols.map(instrumentId => db.marketQuote.findFirst({ where: { instrumentId, provider }, orderBy: { sourceAt: "desc" } })));
      return response({ quotes: quotes.filter(Boolean), error, fetchedAt: new Date() });
    }
    if (route === "bars") {
      if (accountId) {
        const a = await account(db, workspaceId, accountId, false);
        if (a.mode === "REPLAY") { const s = await db.paperReplaySession.findUniqueOrThrow({ where: { accountId } }); const bars = await db.paperReplayBar.findMany({ where: { datasetId: s.datasetId, instrumentId: symbolSchema.parse(url.searchParams.get("symbol")), closeAt: { lte: s.clock } }, orderBy: { closeAt: "asc" } }); return response({ bars: bars.map(b => ({ day: b.closeAt.toISOString(), closeMinor: b.closeMinor })) }); }
      }
      return response(await dailyBars(symbolSchema.parse(url.searchParams.get("symbol"))));
    }
    if (route === "deletion-preview") return response(await deletionPreview(db, workspaceId, id.parse(accountId)));
    if (route === "deletion-jobs") return response(await db.deletionJob.findMany({ where: { workspaceId, entityType: "PAPER_ACCOUNT", status: { not: "DONE" } } }));
    if (route === "market-review") return response({ rules: await db.paperRuleVersion.findMany(), calendar: await db.marketCalendar.findMany({ orderBy: { day: "asc" } }), states: await db.marketDailyState.findMany({ orderBy: { day: "desc" }, take: 100 }) });
    if (route === "export") {
      const csv = await exportPaperAccount(db, workspaceId, id.parse(accountId));
      return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="paper-trading.csv"', "Cache-Control": "no-store" } });
    }
    throw new PaperError("接口不存在", 404);
  } catch (e) { return errorResponse(e); }
}
export async function POST(request: Request, ctx: Context) {
  try {
    const { workspaceId, route } = await context(request, ctx);
    const rawText = await request.text(); if (rawText.length > (route.startsWith("replay/") ? 32000000 : 250000)) throw new PaperError("提交内容过大");
    const body = JSON.parse(rawText || "{}");
    if (route.startsWith("experiments/")) {
      const { experimentId, ...input } = body;
      if (route === "experiments/create") return response(await createExperiment(db, workspaceId, input));
      const eid = id.parse(experimentId);
      if (route === "experiments/pool") return response(await updateStockPool(db, workspaceId, eid, input));
      if (route === "experiments/draft") return response(await draftStrategy(db, workspaceId, eid, input));
      if (route === "experiments/confirm") return response(await confirmStrategy(db, workspaceId, eid, input));
      if (route === "experiments/authorize") return response(await authorizeExperiment(db, workspaceId, eid, input));
      if (route === "experiments/pause") return response(await pauseExperiment(db, workspaceId, eid, z.string().min(1).max(1000).parse(input.reason)));
      if (route === "experiments/archive") return response(await archiveExperiment(db, workspaceId, eid, input));
    }
    if (route === "replay/preflight") return response(preflightReplay(body));
    if (route === "replay/import") { z.literal(true).parse(body.confirmed); return response(await importReplayDataset(db, workspaceId, body.data)); }
    if (route === "replay/create") return response(await createReplaySession(db, workspaceId, body));
    if (route === "replay/advance") return response(await advanceReplay(db, workspaceId, id.parse(body.sessionId), version.parse(body.expectedVersion)));
    if (route === "replay/status") return response(await setReplayStatus(db, workspaceId, id.parse(body.sessionId), version.parse(body.expectedVersion), z.enum(["RUNNING", "PAUSED"]).parse(body.status)));
    if (route === "health/operate") { const { accountId, ...input } = body; return response(await operateAccount(db, workspaceId, id.parse(accountId), input)); }
    if (route === "health/retry") return response(await retryMarket(db, workspaceId, id.parse(body.accountId)));
    if (route === "market-review/preview") return response(await prepareMarketReview(db, workspaceId, body));
    if (route === "market-review/confirm") return response(await confirmMarketReview(db, workspaceId, id.parse(body.draftId), version.parse(body.expectedVersion)));
    if (route === "benchmark/import") return response(await publishBenchmark(db, body));
    if (route === "reviews/ai") return response(await generatePaperReview(db, workspaceId, body));
    if (route === "conditions/create") { const a = await account(db, workspaceId, id.parse(body.accountId)); if (a.purpose !== "MANUAL") throw new PaperError("AI账户由策略管理委托", 403); return response(await createCondition(db, workspaceId, a.id, body.input)); }
    if (route === "conditions/cancel") { const c = await db.paperCondition.findFirst({ where: { id: id.parse(body.conditionId), workspaceId }, include: { account: true } }); if (!c || c.account.purpose !== "MANUAL") throw new PaperError("条件单不存在或无手动权限", 403); return response(await cancelCondition(db, workspaceId, c.id)); }
    if (route === "accounts") return response(await createAccount(db, workspaceId));
    if (route === "orders/preview") { const a = await account(db, workspaceId, id.parse(body.accountId)); if (a.purpose !== "MANUAL") throw new PaperError("AI账户由已授权策略提交委托", 403); return response(await previewOrder(db, workspaceId, a.id, body.input)); }
    if (route === "orders") return response(await submitOrder(db, workspaceId, id.parse(body.accountId), id.parse(body.previewId), id.parse(body.key)));
    if (route === "orders/cancel") { const o = await db.paperOrder.findFirst({ where: { id: id.parse(body.orderId), workspaceId }, include: { account: true } }); if (!o || o.account.purpose !== "MANUAL") throw new PaperError("请通过策略实验停止 AI 委托", 403); return response(await cancelOrder(db, workspaceId, o.id)); }
    if (route === "accounts/archive") { const a = await account(db, workspaceId, id.parse(body.accountId), false); if (a.purpose !== "MANUAL") throw new PaperError("请在策略实验中确认归档", 403); return response(await archiveAccount(db, workspaceId, a.id, version.parse(body.expectedVersion))); }
    if (route === "reviews") {
      const data = z.object({ accountId: id, content: z.string().trim().min(1).max(4000), key: id }).parse(body);
      return response(await transaction(db, async tx => { await account(tx, workspaceId, data.accountId, false); const old = await tx.paperReviewNote.findUnique({ where: { id: data.key } }); if (old) { if (old.workspaceId !== workspaceId || old.accountId !== data.accountId || old.content !== data.content) throw new PaperError("笔记请求重复或不匹配", 409); return old; } return tx.paperReviewNote.create({ data: { id: data.key, workspaceId, accountId: data.accountId, content: data.content } }); }));
    }
    if (route === "watchlist") {
      const data = z.object({ accountId: id, instrumentId: symbolSchema, remove: z.boolean().default(false) }).parse(body);
      return response(await transaction(db, async tx => { const a = await account(tx, workspaceId, data.accountId); if (a.purpose !== "MANUAL") throw new PaperError("AI 股票池须通过版本确认修改", 403); const where = { accountId_instrumentId: { accountId: data.accountId, instrumentId: data.instrumentId } }; return data.remove ? tx.paperWatchlist.deleteMany({ where: { workspaceId, accountId: data.accountId, instrumentId: data.instrumentId } }) : tx.paperWatchlist.upsert({ where, create: { workspaceId, accountId: data.accountId, instrumentId: data.instrumentId }, update: {} }); }));
    }
    if (route === "market-review") return response(await reviewMarket(db, body));
    if (route === "adjustments/preview") return response(await previewAdjustment(db, workspaceId, id.parse(body.accountId), body.input));
    if (route === "adjustments/confirm") return response(await confirmAdjustment(db, workspaceId, id.parse(body.accountId), id.parse(body.previewId)));
    if (route === "accounts/erase") { z.literal(true).parse(body.confirmed); return response(await erasePaperAccount(workspaceId, id.parse(body.accountId), z.string().parse(body.signature), body.retryId ? id.parse(body.retryId) : undefined)); }
    throw new PaperError("接口不存在", 404);
  } catch (e) { return errorResponse(e); }
}
