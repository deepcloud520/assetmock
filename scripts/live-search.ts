import { loadEnvConfig } from '@next/env';
import { searchConfigured } from '../src/server/search';
import { prepareWithSearch } from '../src/server/research';
import { RunStore } from '../src/server/store';
import { createWebOffer } from '../src/server/research';
import { prepareSetup } from '../src/server/catalog';

loadEnvConfig(process.cwd());
async function main() {
  if (!searchConfigured()) throw new Error('请在 .env.local 填写 DOUBAO_SEARCH_API_KEY');
  const start = Date.now();
  const result = await prepareWithSearch('GAME-U01', '我想买一辆20万元的车，比较全款和贷款。');
  if (result.research?.status !== 'ok' || !result.research.documents.length) throw new Error(result.research?.notice || '未返回有效资料');
  const db = new RunStore(':memory:');
  try {
    const doc = result.research.documents[0]; db.saveDocuments('live-check', [doc]);
    // Explicit test assumptions; these numbers are NOT represented as extracted bank terms.
    const offer = createWebOffer({ sourceId: doc.id, annualRatePercent: '6', feeYuan: 0, downPaymentPercent: 30, termMonths: 36, acknowledged: true }, doc);
    db.saveOffer('live-check', offer);
    const setup = prepareSetup({ ...result.input, offerId: offer.id }, [offer]).setup;
    const run = db.create('live-check', setup);
    const month = db.advance(run.id, 'live-check', 0, 'live-search-first-month');
    console.log(JSON.stringify({ search: result.research.status, model: result.source, elapsedMs: Date.now() - start,
      sources: result.research.documents.map(d => ({ title: d.title, url: d.url })),
      extractedDrafts: result.research.drafts.length, confirmedAssumptions: { annualRate: offer.annualRate, fee: offer.fee },
      completedMonth: month.month, trace: result.trace }, null, 2));
  } finally { db.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : '搜索验收失败'); process.exitCode = 1; });
