import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { readCatalog } from '../catalog';
import type { LoanOffer } from '../../domain/types';
import type { Target } from '../../domain/v2/types';
export function catalog(target: Target): LoanOffer[] {
  if (target === 'car') return readCatalog();
  const markdown = readFileSync(join(process.cwd(), 'content/示例房贷资料.md'), 'utf8');
  const raw = JSON.parse(markdown.match(/```json\s*([\s\S]*?)```/)![1]);
  const doc = z.object({ id: z.literal('home-example'), name: z.string(), annualRate: z.string().regex(/^0\.\d+$/), fee: z.number().int().nonnegative(), excerpt: z.string(), documentVersion: z.string() }).parse(raw);
  if (!markdown.includes(doc.excerpt)) throw new Error('房贷资料缺少原文');
  return [{ ...doc, defaultDownPaymentPercent: 30, defaultTermMonths: 360, sourceType: 'preset_fixture', documentId: 'mortgage-example-v02' }];
}
