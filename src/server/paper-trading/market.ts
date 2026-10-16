import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { boardFor, symbolSchema } from "../../domain/paper-trading";
import { withPaperLock } from "../../lib/paper-lock";

const cooldowns = new Map<string, { failures: number; until: number }>();
async function marketRequest(url: string, headers?: Record<string, string>) {
  const host = new URL(url).hostname, cooldown = cooldowns.get(host);
  if (cooldown && cooldown.until > Date.now()) throw new Error("行情来源暂不可用，正在退避重试");
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(6000), headers, cache: "no-store" });
    if (!response.ok) throw new Error(`行情来源返回 ${response.status}`);
    const bytes = await response.arrayBuffer(); cooldowns.delete(host); return bytes;
  } catch (error) {
    const failures = (cooldown?.failures ?? 0) + 1;
    cooldowns.set(host, { failures, until: Date.now() + Math.min(60000, 5000 * 2 ** Math.min(failures - 1, 4)) });
    throw error;
  }
}

// Quote field mapping adapted from easyquotation (MIT, shidenggui); see THIRD_PARTY_NOTICES.md.
export function price(value: string): bigint {
  value = value.replace(/(\.\d{2})0+$/, "$1");
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error("报价价格缺失或精度不支持");
  const [a, b = ""] = value.split("."); return BigInt(a) * 100n + BigInt(b.padEnd(2, "0"));
}
function quantity(value: string, multiplier: number) {
  if (!/^\d+$/.test(value)) throw new Error("盘口数量缺失");
  const n = Number(value) * multiplier; if (!Number.isSafeInteger(n) || n > 2_147_483_647) throw new Error("盘口数量超范围"); return n;
}
function sourceDate(value: string) {
  if (!/^\d{14}$/.test(value)) throw new Error("行情时间缺失");
  const d = new Date(`${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}T${value.slice(8,10)}:${value.slice(10,12)}:${value.slice(12,14)}+08:00`);
  if (!Number.isFinite(d.getTime())) throw new Error("行情时间无效"); return d;
}
export function parseTencent(body: string, fetchedAt = new Date()) {
  const quotes = [];
  for (const match of body.matchAll(/v_((?:sh|sz)\d{6})="([^"]*)"/g)) {
    const instrumentId = symbolSchema.parse(match[1]), s = match[2].split("~");
    if (s.length < 50 || s[2] !== instrumentId.slice(2)) continue;
    const values = { instrumentId, provider: "TENCENT", sourceAt: sourceDate(s[30]), fetchedAt,
      priceMinor: price(s[3]), previousMinor: price(s[4]), bidMinor: price(s[9]), askMinor: price(s[19]),
      bidQuantity: quantity(s[10], 100), askQuantity: quantity(s[20], 100), lowerMinor: price(s[48]), upperMinor: price(s[47]) };
    quotes.push({ name: s[1], ...values, id: createHash("sha256").update(`TENCENT:${instrumentId}:${match[2]}`).digest("hex") });
  }
  return quotes;
}
export function parseSina(body: string, fetchedAt = new Date()) {
  const quotes = [];
  for (const match of body.matchAll(/hq_str_((?:sh|sz)\d{6})="([^"]*)"/g)) {
    const instrumentId = symbolSchema.parse(match[1]), s = match[2].split(","); if (s.length < 32) continue;
    quotes.push({ id: createHash("sha256").update(`SINA:${instrumentId}:${match[2]}`).digest("hex"), name: s[0], instrumentId, provider: "SINA",
      sourceAt: sourceDate((s[30] + s[31]).replace(/[-:]/g, "")), fetchedAt, priceMinor: price(s[3]), previousMinor: price(s[2]),
      bidMinor: price(s[11]), askMinor: price(s[21]), bidQuantity: quantity(s[10], 1), askQuantity: quantity(s[20], 1),
      lowerMinor: 0n, upperMinor: 0n });
  }
  return quotes;
}
export async function fetchQuotes(symbols: string[], provider: "TENCENT" | "SINA" = "TENCENT") {
  const ids = [...new Set(symbols.map(s => symbolSchema.parse(s)))].slice(0, 50); if (!ids.length) return [];
  const url = provider === "TENCENT" ? `https://qt.gtimg.cn/q=${ids.join(",")}` : `https://hq.sinajs.cn/list=${ids.join(",")}`;
  const body = new TextDecoder("gb18030").decode(await marketRequest(url, { Referer: "https://finance.sina.com.cn/" }));
  return (provider === "TENCENT" ? parseTencent : parseSina)(body);
}
export async function refreshQuotes(db: PrismaClient, symbols: string[], provider: "TENCENT" | "SINA" = "TENCENT") {
  if (!symbols.length) return [];
  let quotes: Awaited<ReturnType<typeof fetchQuotes>>;
  try { quotes = await fetchQuotes(symbols, provider); } // No network inside a write transaction.
  catch (error) {
    await withPaperLock(() => db.$transaction(tx => tx.marketSourceHealth.upsert({ where: { provider }, create: { provider, lastFailureAt: new Date(), failureCount: 1, error: error instanceof Error ? error.message.slice(0, 240) : "行情来源失败" }, update: { lastFailureAt: new Date(), failureCount: { increment: 1 }, error: error instanceof Error ? error.message.slice(0, 240) : "行情来源失败" } })));
    throw error;
  }
  const missing = [...new Set(symbols)].filter(id => !quotes.some(q => q.instrumentId === id));
  await withPaperLock(() => db.$transaction(async tx => {
    for (const { name, ...q } of quotes) {
      await tx.marketInstrument.upsert({ where: { id: q.instrumentId }, create: { id: q.instrumentId, name, board: boardFor(q.instrumentId), source: provider }, update: { name } });
      // Identical payload does not renew fetchedAt or create fresh liquidity.
      await tx.marketQuote.upsert({ where: { id: q.id }, create: q, update: {} });
    }
    if (missing.length) await tx.marketSourceHealth.upsert({ where: { provider }, create: { provider, lastFailureAt: new Date(), failureCount: 1, error: `来源缺少证券：${missing.join(",")}` }, update: { lastFailureAt: new Date(), failureCount: { increment: 1 }, error: `来源缺少证券：${missing.join(",")}` } });
    else await tx.marketSourceHealth.upsert({ where: { provider }, create: { provider, lastSuccessAt: new Date(), failureCount: 0 }, update: { lastSuccessAt: new Date(), failureCount: 0, error: "" } });
  }));
  if (missing.length) throw new Error(`来源报价不完整：${missing.join(",")}`);
  return quotes;
}
export const STARTER_SYMBOLS = ["sh600000", "sh600519", "sz000001", "sz300750", "sz300059", "sh688981", "sh688111"];

export async function searchSecurities(db: PrismaClient, query: string) {
  const text = new TextDecoder("gb18030").decode(await marketRequest(`https://smartbox.gtimg.cn/s3/?q=${encodeURIComponent(query)}&t=gp`));
  const raw = /v_hint="([^"]*)"/.exec(text)?.[1] ?? "";
  const decoded = raw.replace(/\\u([\da-f]{4})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  const items = decoded.split("^").map(s => s.split("~")).filter(s => symbolSchema.safeParse(s[0] + s[1]).success && s[4]?.startsWith("GP-A"));
  await withPaperLock(() => db.$transaction(async tx => {
    for (const s of items) await tx.marketInstrument.upsert({ where: { id: s[0] + s[1] }, create: { id: s[0] + s[1], name: s[2], board: boardFor(s[0] + s[1]), source: "TENCENT_SEARCH" }, update: { name: s[2] } });
  }));
  return items.map(s => ({ id: s[0] + s[1], name: s[2], board: boardFor(s[0] + s[1]) }));
}
export async function dailyBars(symbol: string) {
  symbolSchema.parse(symbol);
  const data = JSON.parse(new TextDecoder().decode(await marketRequest(`https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,,,60,`)));
  const rows = data?.data?.[symbol]?.day;
  if (!Array.isArray(rows)) throw new Error("来源未返回不复权日线，暂不展示走势");
  return { symbol, source: "TENCENT", adjustment: "NONE", fetchedAt: new Date(), bars: rows.map((r: string[]) => ({ day: r[0], openMinor: price(r[1]), closeMinor: price(r[2]), highMinor: price(r[3]), lowMinor: price(r[4]) })) };
}
