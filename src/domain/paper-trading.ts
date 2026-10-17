import { z } from "zod";

export class PaperError extends Error {
  constructor(message: string, public status = 422) { super(message); }
}
export const minorSchema = z.string().regex(/^(0|[1-9]\d{0,13})$/).transform(BigInt);
export const symbolSchema = z.string().regex(/^(sh60\d{4}|sh688\d{3}|sz00\d{4}|sz30\d{4})$/);
export const orderInputSchema = z.object({
  instrumentId: symbolSchema, side: z.enum(["BUY", "SELL"]),
  limitMinor: minorSchema.refine(v => v > 0n), quantity: z.number().int().positive().max(1_000_000),
  reason: z.string().trim().max(1000).default(""),
});
export type OrderInput = z.infer<typeof orderInputSchema>;
export const ruleSchema = z.object({
  commissionPpm: z.number().int().min(0).max(10000), minimumCommissionMinor: z.number().int().min(0).max(10000),
  transferPpm: z.number().int().min(0).max(10000), stampSellPpm: z.number().int().min(0).max(10000),
  maxAgeMs: z.number().int().min(1000).max(60000), pollMs: z.number().int().min(3000).max(60000),
  priceCageBps: z.number().int().min(1).max(1000).default(200),
  priceCageMinTicks: z.object({ MAIN: z.number().int().min(0), CHINEXT: z.number().int().min(0), STAR: z.number().int().min(0) }).default({ MAIN: 10, CHINEXT: 10, STAR: 0 }),
  boards: z.object({ MAIN: z.object({ min: z.number().int().positive(), step: z.number().int().positive(), max: z.number().int().positive() }),
    CHINEXT: z.object({ min: z.number().int().positive(), step: z.number().int().positive(), max: z.number().int().positive() }),
    STAR: z.object({ min: z.number().int().positive(), step: z.number().int().positive(), max: z.number().int().positive() }) }),
  qualified: z.boolean(), qualifiedUntil: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/), evidence: z.string(), provider: z.enum(["TENCENT", "SINA"]),
});
export type PaperRules = z.infer<typeof ruleSchema>;
export const DEFAULT_RULES: PaperRules = {
  commissionPpm: 300, minimumCommissionMinor: 500, transferPpm: 10, stampSellPpm: 500,
  maxAgeMs: 15000, pollMs: 5000, provider: "TENCENT", qualified: false, qualifiedUntil: "", evidence: "盘中行情、费用和板块规则待核实；当前费用仅为模拟试算假设。",
  priceCageBps: 200, priceCageMinTicks: { MAIN: 10, CHINEXT: 10, STAR: 0 },
  boards: { MAIN: { min: 100, step: 100, max: 1_000_000 }, CHINEXT: { min: 100, step: 100, max: 300_000 }, STAR: { min: 200, step: 1, max: 100_000 } },
};
export const ACTIVE_ORDERS = ["OPEN", "PARTIALLY_FILLED"];
export function json(value: unknown): string { return JSON.stringify(value, (_, v) => typeof v === "bigint" ? v.toString() : v); }
export function chinaDay(now: Date): string { return new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10); }
export function chinaMinute(now: Date): number { const d = new Date(now.getTime() + 8 * 3600000); return d.getUTCHours() * 60 + d.getUTCMinutes(); }
export function continuous(now: Date): boolean { const m = chinaMinute(now); return (m >= 570 && m < 690) || (m >= 780 && m < 897); }
export function boardFor(symbol: string): keyof PaperRules["boards"] { return symbol.startsWith("sh688") ? "STAR" : symbol.startsWith("sz30") ? "CHINEXT" : "MAIN"; }
export function roundRatio(n: bigint, d: bigint): bigint { if (d <= 0n || n < 0n) throw new PaperError("金额比例无效"); return (n + d / 2n) / d; }
export function feeBreakdown(turnover: bigint, side: string, rules: PaperRules) {
  if (turnover === 0n) return { commissionMinor: 0n, transferMinor: 0n, stampMinor: 0n, totalMinor: 0n };
  const commission = roundRatio(turnover * BigInt(rules.commissionPpm), 1_000_000n);
  const commissionMinor = commission > BigInt(rules.minimumCommissionMinor) ? commission : BigInt(rules.minimumCommissionMinor);
  const transferMinor = roundRatio(turnover * BigInt(rules.transferPpm), 1_000_000n);
  const stampMinor = side === "SELL" ? roundRatio(turnover * BigInt(rules.stampSellPpm), 1_000_000n) : 0n;
  return { commissionMinor, transferMinor, stampMinor, totalMinor: commissionMinor + transferMinor + stampMinor };
}
export function fees(turnover: bigint, side: string, rules: PaperRules): bigint { return feeBreakdown(turnover, side, rules).totalMinor; }
export function reserve(limit: bigint, remaining: number, turnover: bigint, alreadyPaid: bigint, side: string, rules: PaperRules): bigint {
  if (!remaining) return 0n;
  const value = limit * BigInt(remaining), extraFee = fees(turnover + value, side, rules) - alreadyPaid;
  if (side === "BUY") return value + extraFee;
  // Sell proceeds can be smaller than the minimum commission. Reserve the deficit.
  return extraFee > value ? extraFee - value : 0n;
}
export function checkQuantity(input: OrderInput, sellable: number, rules: PaperRules): void {
  const r = rules.boards[boardFor(input.instrumentId)];
  if (input.quantity > r.max) throw new PaperError("超过该板块单笔限价申报上限");
  const liquidation = input.side === "SELL" && input.quantity === sellable;
  if (!liquidation && (input.quantity < r.min || input.quantity % r.step !== 0)) throw new PaperError(`该板块最少 ${r.min} 股，数量步长 ${r.step} 股；不足部分须一次卖出`);
}
export function checkPriceCage(input: OrderInput, quote: { bidMinor: bigint; askMinor: bigint; priceMinor: bigint; previousMinor: bigint }, rules: PaperRules) {
  const buy = input.side === "BUY", prices = buy ? [quote.askMinor, quote.bidMinor, quote.priceMinor, quote.previousMinor] : [quote.bidMinor, quote.askMinor, quote.priceMinor, quote.previousMinor];
  const base = prices.find(p => p > 0n); if (!base) throw new PaperError("价格基准未知");
  const ratio = roundRatio(base * BigInt(buy ? 10000 + rules.priceCageBps : 10000 - rules.priceCageBps), 10000n);
  const ticks = BigInt(Math.max(1, rules.priceCageMinTicks[boardFor(input.instrumentId)]));
  const absolute = buy ? base + ticks : base - ticks;
  const boundary = buy ? ratio > absolute ? ratio : absolute : ratio < absolute ? ratio : absolute;
  if (buy ? input.limitMinor > boundary : input.limitMinor < boundary) throw new PaperError(`限价超出当前有效申报价格范围，请根据最新盘口重新预览（边界 ${boundary.toString()} 分）`);
}
export function csvCell(value: unknown): string {
  let s = String(value ?? ""); if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
