import { z } from "zod";

export const cashflowPeriodKinds = ["MONTH", "QUARTER", "YEAR"] as const;
export type CashflowPeriodKind = typeof cashflowPeriodKinds[number];

export const cashflowAnalysisInputSchema = z.object({
  periodKind: z.enum(cashflowPeriodKinds),
  anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict();

export type PeriodBounds = { start: Date; end: Date; previousStart: Date; previousEnd: Date; label: string; previousLabel: string };

export function cashflowPeriodBounds(periodKind: CashflowPeriodKind, anchorDate: string): PeriodBounds {
  const anchor = new Date(`${anchorDate}T00:00:00.000Z`);
  if (Number.isNaN(anchor.getTime()) || anchor.toISOString().slice(0, 10) !== anchorDate) throw new Error("分析日期无效");
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth();
  if (periodKind === "MONTH") {
    const start = new Date(Date.UTC(year, month, 1));
    const end = new Date(Date.UTC(year, month + 1, 1));
    const previousStart = new Date(Date.UTC(year, month - 1, 1));
    return { start, end, previousStart, previousEnd: start, label: `${year}年${month + 1}月`, previousLabel: `${previousStart.getUTCFullYear()}年${previousStart.getUTCMonth() + 1}月` };
  }
  if (periodKind === "QUARTER") {
    const quarterStart = Math.floor(month / 3) * 3;
    const start = new Date(Date.UTC(year, quarterStart, 1));
    const end = new Date(Date.UTC(year, quarterStart + 3, 1));
    const previousStart = new Date(Date.UTC(year, quarterStart - 3, 1));
    return { start, end, previousStart, previousEnd: start, label: `${year}年第${quarterStart / 3 + 1}季度`, previousLabel: `${previousStart.getUTCFullYear()}年第${Math.floor(previousStart.getUTCMonth() / 3) + 1}季度` };
  }
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));
  const previousStart = new Date(Date.UTC(year - 1, 0, 1));
  return { start, end, previousStart, previousEnd: start, label: `${year}年`, previousLabel: `${year - 1}年` };
}

export function changeBps(current: bigint, previous: bigint) {
  if (previous === 0n) return null;
  return Number(((current - previous) * 10_000n) / previous);
}

export function ratioBps(numerator: bigint, denominator: bigint) {
  if (denominator === 0n) return null;
  return Number((numerator * 10_000n) / denominator);
}
