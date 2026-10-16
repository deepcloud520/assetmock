import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { profiles } from '@/domain/fixtures';
import { calculateSetup, setupSchema, validateSetup } from '@/domain/setup';
import { monthFacts, publicRun } from '@/domain/presentation';
import { prepareSetup, readCatalog } from '@/server/catalog';
import { explainWithAI, prepareWithAI } from '@/server/ai';
import { prepareWithSearch, createWebOffer, webOfferSchema } from '@/server/research';
import { searchConfigured } from '@/server/search';
import { body, endpoint } from '@/server/http';
import { ServiceError, store } from '@/server/store';
import type { Explanation, StoredRun } from '@/domain/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const confirmedSchema = z.object({ input: setupSchema, confirmed: z.literal(true) }).strict();
const segments = (request: NextRequest) => request.nextUrl.pathname.slice(5).split('/');

export const GET = endpoint(async (req, sid) => {
  const route = segments(req);
  if (route[0] === 'profiles' && route.length === 1) return { profiles, offers: [...readCatalog(), ...store().offers(sid)], searchEnabled: searchConfigured() };
  if (route[0] === 'runs' && route.length === 2) return publicRun(store().get(route[1], sid));
  throw new ServiceError(404, '接口不存在。');
});

async function planRequest(action: string, input: unknown, sid: string) {
  if (action === 'from-search') {
    const args = webOfferSchema.parse(input);
    const offer = createWebOffer(args, store().document(sid, args.sourceId));
    store().saveOffer(sid, offer);
    return offer;
  }
  if (action === 'calculate') {
    const calculated = prepareForSession(input, sid);
    return { input: calculated.input, purchase: calculated.setup.purchase, loan: calculated.setup.loan, errors: calculated.errors };
  }
  if (action !== 'prepare') throw new ServiceError(404, '接口不存在。');
  const args = z.object({ profileId: z.string().regex(/^GAME-U0[1-5]$/), goal: z.string().min(1).max(1000) }).strict().parse(input);
  const start = Date.now();
  const result = searchConfigured() ? await prepareWithSearch(args.profileId, args.goal) : await prepareWithAI(args.profileId, args.goal);
  if (result.research) store().saveDocuments(sid, result.research.documents);
  store().record(sid, { kind: 'prepare', source: result.source, trace: result.trace, elapsedMs: Date.now() - start });
  return result;
}
function prepareForSession(raw: unknown, sid: string) {
  const input = setupSchema.parse(raw);
  return prepareSetup(input, input.offerId.startsWith('web-') ? [store().offer(sid, input.offerId)] : []);
}
async function explanationRequest(run: StoredRun, input: unknown, sid: string) {
  const args = z.object({ month: z.number().int().min(1).max(12), final: z.boolean().default(false) }).strict().parse(input);
  if (args.month > run.state.month || (args.final && run.status !== 'ended')) throw new ServiceError(422, '只能解释已揭晓的结果。');
  const key = args.final ? 'final' : `month:${args.month}`;
  const cached = store().cached(run.id, key) as Explanation | undefined;
  if (cached) return cached;
  const facts = args.final ? publicRun(run).summary.facts : monthFacts(run.history[args.month - 1]);
  const result = await explainWithAI(facts, args.final);
  store().record(sid, result, run.id, key);
  return result;
}
function replayRequest(run: StoredRun, input: unknown, sid: string) {
  const args = confirmedSchema.extend({ sameExperience: z.boolean() }).strict().parse(input);
  if (run.status !== 'ended') throw new ServiceError(409, '结束当前局后才能重玩。');
  let result = prepareForSession(args.input, sid);
  if (args.sameExperience) {
    if (args.input.profileId !== run.setup.profile.id) throw new ServiceError(422, '相同经历重玩需保留原角色。');
    const offer = args.input.offerId === run.setup.loan.id ? run.setup.loan : result.setup.loan;
    const setup = calculateSetup(args.input, run.setup.profile, offer, run.setup.rules);
    result = { input: args.input, setup, errors: validateSetup(run.setup.profile, setup) };
  }
  if (result.errors.length) throw new ServiceError(422, result.errors.join(' '));
  return publicRun(store().create(sid, result.setup, { parentId: run.id, tape: args.sameExperience ? run.tape : undefined }));
}
export const POST = endpoint(async (req, sid) => {
  const route = segments(req); const input = await body(req);
  if (route[0] === 'plans' && route.length === 2) return planRequest(route[1], input, sid);
  if (route[0] === 'runs' && route.length === 1) {
    const args = confirmedSchema.parse(input);
    const result = prepareForSession(args.input, sid);
    if (result.errors.length) throw new ServiceError(422, result.errors.join(' '));
    return publicRun(store().create(sid, result.setup));
  }
  if (route[0] !== 'runs' || route.length !== 3) throw new ServiceError(404, '接口不存在。');
  const id = route[1];
  if (route[2] === 'advance') {
    const args = z.object({ expectedMonth: z.number().int().min(0).max(12), requestKey: z.string().uuid() }).strict().parse(input);
    return store().advance(id, sid, args.expectedMonth, args.requestKey);
  }
  const run = store().get(id, sid);
  if (route[2] === 'explanation') return explanationRequest(run, input, sid);
  if (route[2] === 'replay') return replayRequest(run, input, sid);
  throw new ServiceError(404, '接口不存在。');
});
