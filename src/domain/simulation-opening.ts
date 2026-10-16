import { z } from 'zod';
import type { Character, Target } from './v2/types';
export const SIMULATION_NOTICE = '本局使用你确认的简化数据，不完整模拟真实底账中的资金限制、产品条款及未来变化。';
// A bounded domain also leaves room for 360 months of cumulative calculations.
export const minor = z.string().regex(/^(0|[1-9]\d*)$/).refine(v => BigInt(v) <= 1_000_000_000_000n, '金额超出游戏安全范围');
export const simplifiedSchema = z.object({
  target: z.enum(['car', 'home']), goalId: z.string().nullable(), sourceSignature: z.string(),
  age: z.number().int().min(18).max(90), cash: minor, fund: minor, salary: minor, living: minor, rent: minor, debt: minor, debtPayment: minor, bonus: minor,
  confirmed: z.literal(true), acknowledgeRestrictions: z.literal(true),
}).strict().superRefine((v, ctx) => {
  if (BigInt(v.rent) > BigInt(v.living)) ctx.addIssue({ code: 'custom', path: ['rent'], message: '租金不能超过生活费' });
  if (BigInt(v.debt) > 0n && BigInt(v.debtPayment) === 0n) ctx.addIssue({ code: 'custom', path: ['debtPayment'], message: '请填写既有负债的每月还本金' });
});
export type Simplified = z.infer<typeof simplifiedSchema>;
export function characterFrom(v: Simplified, id: string): Character {
  return { id, name: '我的简化底账', description: SIMULATION_NOTICE, version: 'integrated-0.3', target: v.target, age: v.age,
    cash: Number(v.cash), fund: Number(v.fund), salary: Number(v.salary), living: Number(v.living), rent: Number(v.rent), debt: Number(v.debt), debtPayment: Number(v.debtPayment), bonus: Number(v.bonus), bonusMonth: 4 };
}
export function nextMonth(date: string) { const [y, m] = date.slice(0, 7).split('-').map(Number); return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`; }
export type OpeningDraft = {
 sourceSignature: string; goalId: string | null; target: Target | null; price: string | null; asOf: string;
 values: Record<'age'|'cash'|'fund'|'salary'|'living'|'rent'|'debt'|'debtPayment'|'bonus', string | null>;
 assets: { id: string; name: string; balance: string; included: string; bucket: 'cash'|'fund'|'excluded'; reason: string }[];
 notes: string[];
};
