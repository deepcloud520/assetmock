import { z } from 'zod';
import Decimal from 'decimal.js';
import { randomUUID } from 'node:crypto';
import { endpoint, body } from '@/server/http';
import { ServiceError, store } from '@/server/store';
import { v2Store } from '@/server/v2/store';
import { catalog } from '@/server/v2/catalog';
import { prepare, explain, recommend } from '@/server/v2/ai';
import { calculate, characters, inputSchema } from '@/domain/v2/setup';
import { toPublic } from '@/domain/v2/presentation';
import type { ChoiceRecord, Run, Target } from '@/domain/v2/types';
import type { Explanation, LoanOffer } from '@/domain/types';
import { searchConfigured } from '@/server/search';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const choiceSchema = z.object({ path: z.enum(['a', 'b']), kind: z.enum(['jobLoss', 'career']), choice: z.enum(['lower', 'wait', 'temporary', 'accept', 'decline']) }).strict();
const changeSchema = z.object({ expectedVersion: z.number().int().nonnegative(), requestKey: z.string().uuid() });
const confirmed = z.object({ input: inputSchema, confirmed: z.literal(true) }).strict();
function offers(target: Target, sid: string) { return [...catalog(target), ...store().offers(sid).filter(o => o.id.startsWith(`${target}-web-`))]; }
function calculation(raw: unknown, sid: string, frozen?: Run) {
  const input = inputSchema.parse(raw);
  const sources = [...(frozen ? Object.values(frozen.setup.plans).map(p => p.offer) : []), ...offers(input.target, sid)];
  try { return calculate(input, sources, frozen?.setup); } catch { throw new ServiceError(422, '方案参数或来源无效，请重新核对。'); }
}
export const GET = endpoint(async (req, sid) => {
  const parts = req.nextUrl.pathname.slice('/api/v2/'.length).split('/');
  if (parts[0] === 'catalog') return { profiles: characters, offers: { car: offers('car', sid), home: offers('home', sid) }, searchEnabled: searchConfigured() };
  if (parts[0] === 'runs' && parts.length === 2) return toPublic(v2Store().get(parts[1], sid));
  throw new ServiceError(404, '接口不存在');
});
async function planAction(action: string, raw: unknown, sid: string) {
  if (action === 'calculate') { const result = calculation(raw, sid); return { input: result.setup.input, plans: result.setup.plans, errors: result.errors, months: result.setup.rules.months }; }
  if (action === 'prepare') {
    const a = z.object({ target: z.enum(['car', 'home']), profileId: z.string(), goal: z.string().min(1).max(1000) }).strict().parse(raw);
    return prepare(a.target, a.profileId, a.goal, sid);
  }
  if (action === 'from-search') {
    const a = z.object({ target: z.enum(['car', 'home']), sourceId: z.string().uuid(), annualRatePercent: z.string().regex(/^\d+(\.\d{1,4})?$/).refine(n => Number(n) <= 30), feeYuan: z.number().min(0).max(100000).multipleOf(.01), acknowledged: z.literal(true) }).strict().parse(raw);
    const doc = store().document(sid, a.sourceId);
    if (!(a.target === 'home' ? /房贷|住房|按揭|购房/ : /汽车|车贷|购车/).test(doc.title + doc.content)) throw new ServiceError(422, '资料与目标不匹配');
    const offer: LoanOffer = { id: `${a.target}-web-${randomUUID()}`, name: `参考资料的自定义假设 · ${doc.title.slice(0, 25)}`, annualRate: new Decimal(a.annualRatePercent).div(100).toString(), fee: new Decimal(a.feeYuan).mul(100).toNumber(), sourceType: 'web_reference', sourceUrl: doc.url, retrievedAt: doc.retrievedAt, documentId: doc.id, documentVersion: doc.retrievedAt, defaultDownPaymentPercent: 30, defaultTermMonths: a.target === 'home' ? 360 : 36, excerpt: '用户确认的模拟假设，不代表原文报价、适用资格或授信结果。' };
    store().saveOffer(sid, offer); return offer;
  }
  throw new ServiceError(404, '接口不存在');
}
function replay(run: Run, raw: unknown, sid: string) {
  if (run.status !== 'ended') throw new ServiceError(409, '结束当前局后才能重玩');
  const a = confirmed.extend({ sameExperience: z.boolean(), override: choiceSchema.extend({ month: z.number().int().positive() }).optional() }).strict().parse(raw);
  const result = calculation(a.input, sid, a.sameExperience ? run : undefined);
  if (result.errors.length) throw new ServiceError(422, result.errors.join(' '));
  let inherited: ChoiceRecord[] = a.sameExperience ? run.history.flatMap(m => m.choices) : [];
  if (a.override) {
    const prior = inherited.find(c => c.month === a.override!.month && c.path === a.override!.path && c.kind === a.override!.kind);
    if (!prior || (prior.kind === 'jobLoss' ? !['lower', 'wait', 'temporary'].includes(a.override.choice) : !['accept', 'decline'].includes(a.override.choice))) throw new ServiceError(422, '历史选择修改无效');
    inherited = inherited.map(c => c === prior ? a.override! : c);
  }
  return toPublic(v2Store().create(sid, result.setup, { parentId: run.id, tape: a.sameExperience ? run.tape : undefined, inherited }));
}
export const POST = endpoint(async (req, sid) => {
  const parts = req.nextUrl.pathname.slice('/api/v2/'.length).split('/'); const raw = await body(req);
  if (parts[0] === 'plans' && parts.length === 2) return planAction(parts[1], raw, sid);
  if (parts[0] === 'runs' && parts.length === 1) { const a = confirmed.parse(raw); const result = calculation(a.input, sid); if (result.errors.length) throw new ServiceError(422, result.errors.join(' ')); return toPublic(v2Store().create(sid, result.setup)); }
  if (parts[0] !== 'runs' || parts.length !== 3) throw new ServiceError(404, '接口不存在');
  const id = parts[1], action = parts[2];
  if (action === 'advance') { const a = changeSchema.extend({ single: z.boolean().default(false) }).strict().parse(raw); return v2Store().mutate(id, sid, a.expectedVersion, a.requestKey, { kind: 'advance', single: a.single }); }
  if (action === 'choose') { const a = changeSchema.extend({ selections: z.array(choiceSchema).min(1).max(2) }).strict().parse(raw); return v2Store().mutate(id, sid, a.expectedVersion, a.requestKey, { kind: 'choose', selections: a.selections }); }
  const run = v2Store().get(id, sid);
  if (action === 'replay') return replay(run, raw, sid);
  if (action === 'explanation') {
    const key = `v2:${run.version}:explanation`; const cached = store().cached(id, key) as Explanation | undefined;
    if (cached) return cached; const result = await explain(run); store().record(sid, result, id, key); return result;
  }
  if (action === 'recommendation') {
    if (run.status !== 'ended') throw new ServiceError(422, '结局后才能验证重玩建议');
    const key = `v2:${run.version}:recommendation`; const cached = store().cached(id, key);
    if (cached) return cached; const result = await recommend(run); store().record(sid, result, id, key); return result;
  }
  throw new ServiceError(404, '接口不存在');
});
