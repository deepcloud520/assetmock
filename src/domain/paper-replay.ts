import { z } from "zod";
import { PaperError, chinaDay, chinaMinute, minorSchema, symbolSchema } from "./paper-trading";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const replayDatasetSchema = z.object({
  name: z.string().trim().min(1).max(80), resolution: z.enum(["MINUTE", "DAY"]), source: z.string().trim().min(5).max(2000),
  sourceFetchedAt: z.string().datetime({ offset: true }), fallbackReason: z.string().max(2000).default(""),
  sourceReview: z.object({ adjustment: z.literal("NONE"), volumeUnit: z.literal("SHARE"), dataUseChecked: z.literal(true), reviewerNote: z.string().trim().min(5).max(2000) }),
  calendar: z.array(z.object({ day, isOpen: z.boolean(), source: z.string().min(5) })).min(21).max(370),
  bars: z.array(z.object({ instrumentId: symbolSchema, closeAt: z.string().datetime({ offset: true }),
    openMinor: minorSchema, highMinor: minorSchema, lowMinor: minorSchema, closeMinor: minorSchema, previousMinor: minorSchema,
    lowerMinor: minorSchema, upperMinor: minorSchema, volumeShares: z.number().int().nonnegative().max(2_147_483_647),
    status: z.enum(["NORMAL", "SUSPENDED", "REVIEW_REQUIRED"]), eventCoverage: z.boolean(), evidence: z.string().trim().min(5).max(2000),
  })).min(20).max(100000),
});
export type ReplayDatasetInput = z.infer<typeof replayDatasetSchema>;
export function validateReplayDataset(raw: unknown) {
  const data = replayDatasetSchema.parse(raw), calendar = new Map(data.calendar.map(c => [c.day, c]));
  if (calendar.size !== data.calendar.length) throw new PaperError("历史交易日历含重复日期");
  if (data.resolution === "DAY" && !data.fallbackReason.trim()) throw new PaperError("日线回放须记录分钟数据未满足要求的原因");
  const duplicates = new Set<string>(), coverage = new Map<string, Map<string, number>>();
  for (const b of data.bars) {
    const at = new Date(b.closeAt), d = chinaDay(at), m = chinaMinute(at), key = `${b.instrumentId}:${at.toISOString()}`;
    if (duplicates.has(key)) throw new PaperError("历史数据含重复证券时间点"); duplicates.add(key);
    if (!calendar.get(d)?.isOpen) throw new PaperError(`历史K线日期 ${d} 不在已确认交易日历中`);
    if (at.getUTCSeconds() || at.getUTCMilliseconds()) throw new PaperError("历史K线须按完整分钟结束时间记录");
    if (data.resolution === "DAY" ? m !== 900 : !((m > 570 && m <= 690) || (m > 780 && m <= 900))) throw new PaperError("历史K线结束时间不符合回放周期");
    if (b.closeMinor <= 0n || b.previousMinor <= 0n || b.lowMinor <= 0n || b.lowMinor > b.highMinor || b.openMinor < b.lowMinor || b.openMinor > b.highMinor || b.closeMinor < b.lowMinor || b.closeMinor > b.highMinor) throw new PaperError("历史OHLC价格或前收盘无效");
    if (b.lowerMinor <= 0n || b.upperMinor < b.lowerMinor || b.highMinor > b.upperMinor || b.lowMinor < b.lowerMinor) throw new PaperError("历史价格限制缺失或与K线不一致");
    const days = coverage.get(b.instrumentId) ?? new Map<string, number>(); days.set(d, (days.get(d) ?? 0) + 1); coverage.set(b.instrumentId, days);
  }
  const expected = [...calendar.values()].filter(c => c.isOpen && c.day >= chinaDay(new Date(data.bars.reduce((a, b) => new Date(a.closeAt) < new Date(b.closeAt) ? a : b).closeAt)) && c.day <= chinaDay(new Date(data.bars.reduce((a, b) => new Date(a.closeAt) > new Date(b.closeAt) ? a : b).closeAt))).map(c => c.day);
  for (const [symbol, days] of coverage) {
    if (days.size < 20 || expected.some(d => !days.has(d))) throw new PaperError(`${symbol} 未覆盖连续20个完整交易日；不能以缺失日填充历史`);
    if ([...days.values()].some(n => n !== (data.resolution === "MINUTE" ? 240 : 1))) throw new PaperError(`${symbol} 存在不完整交易日K线`);
  }
  data.bars.sort((a, b) => new Date(a.closeAt).getTime() - new Date(b.closeAt).getTime() || a.instrumentId.localeCompare(b.instrumentId));
  const endDay = chinaDay(new Date(data.bars[data.bars.length - 1].closeAt));
  if (![...calendar.values()].some(c => c.day > endDay && c.isOpen)) throw new PaperError("数据集须包含末日之后的下一交易日，以处理T+1");
  return data;
}

export function replayFillPrice(side: string, limit: bigint, bar: { openMinor: bigint; highMinor: bigint; lowMinor: bigint; lowerMinor: bigint; upperMinor: bigint; volumeShares: number; eventCoverage: boolean; status: string }) {
  if (!bar.eventCoverage || bar.status !== "NORMAL" || bar.volumeShares <= 0) return null;
  // One-price limit bars have no dependable opposite liquidity.
  if (bar.lowMinor === bar.highMinor && (bar.highMinor >= bar.upperMinor || bar.lowMinor <= bar.lowerMinor)) return null;
  if (side === "BUY") return bar.lowMinor <= limit ? bar.openMinor <= limit ? bar.openMinor : limit : null;
  return bar.highMinor >= limit ? bar.openMinor >= limit ? bar.openMinor : limit : null;
}
export const replayCapacity = (volumeShares: number) => Math.floor(volumeShares / 100);
