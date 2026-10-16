import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { profiles, rules } from '../domain/fixtures';
import { calculateSetup, setupSchema, validateSetup } from '../domain/setup';
import type { LoanOffer, SetupInput } from '../domain/types';

const documentSchema = z.object({
  documentId: z.string(), documentVersion: z.string(), updatedAt: z.string(), sourceType: z.literal('preset_fixture'),
  offers: z.array(z.object({ id: z.enum(['loan-a', 'loan-b']), name: z.string(),
    defaultDownPaymentPercent: z.number().int().min(20).max(80), defaultTermMonths: z.number().int().positive(),
    annualRate: z.string().regex(/^0\.\d+$/), fee: z.number().int().nonnegative(), excerpt: z.string() })).length(2),
});
export function readCatalog(): LoanOffer[] {
  const markdown = readFileSync(join(process.cwd(), 'content', '示例贷款资料.md'), 'utf8');
  const block = markdown.match(/```json\s*([\s\S]*?)```/);
  if (!block) throw new Error('贷款资料缺少参数块');
  const doc = documentSchema.parse(JSON.parse(block[1]));
  if (new Set(doc.offers.map(o => o.id)).size !== doc.offers.length) throw new Error('贷款资料ID重复');
  return doc.offers.map(offer => {
    if (!markdown.includes(offer.excerpt)) throw new Error('贷款参数缺少对应原文');
    return { ...offer, documentId: doc.documentId, documentVersion: doc.documentVersion, sourceType: doc.sourceType };
  });
}
export function searchLoanDocuments(input: { query: string; preferredTermMonths?: number; preferredDownPaymentRatio?: number }): LoanOffer[] {
  if (!/(车|贷款|首付|分期|方案|loan|car)/i.test(input.query)) return [];
  return readCatalog().filter(offer =>
    (input.preferredTermMonths === undefined || offer.defaultTermMonths === input.preferredTermMonths) &&
    (input.preferredDownPaymentRatio === undefined || offer.defaultDownPaymentPercent === input.preferredDownPaymentRatio));
}
export function prepareSetup(raw: unknown, additionalOffers: LoanOffer[] = []) {
  const input: SetupInput = setupSchema.parse(raw);
  const profile = profiles.find(p => p.id === input.profileId);
  const offer = [...readCatalog(), ...additionalOffers].find(o => o.id === input.offerId);
  if (!profile || !offer) throw new Error('角色或示例资料不存在');
  const setup = calculateSetup(input, profile, offer, rules);
  return { input, setup, errors: validateSetup(profile, setup) };
}
