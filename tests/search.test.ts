import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { normalizeResults, searchWeb, SEARCH_ENDPOINT } from '../src/server/search';
import { createWebOffer, validateDrafts, prepareWithSearch } from '../src/server/research';
import { RunStore } from '../src/server/store';
import { prepareSetup } from '../src/server/catalog';
import { defaultInput } from '../src/domain/fixtures';

const payload = { ResponseMetadata: {}, Result: { WebResults: [{ Title: '测试银行的车贷资料', Url: 'https://bank.example/loan',
  Snippet: '贷款摘要', Summary: '年化名义利率为6.00%，一次性全部费用为2000元。', PublishTime: '2026-10-01' }] } };
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('Custom 搜索适配器', () => {
  it('使用官方 Custom 端点及 Bearer Key，限制查询和返回数量', async () => {
    vi.stubEnv('DOUBAO_SEARCH_API_KEY', 'fixture-secret');
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload));
    const result = await searchWeb('车'.repeat(200), { fetcher });
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe(SEARCH_ENDPOINT);
    expect(options?.headers).toMatchObject({ Authorization: 'Bearer fixture-secret' });
    expect(JSON.parse(options?.body as string)).toMatchObject({ SearchType: 'web', Count: 5, Query: '车'.repeat(100), Filter: { NeedUrl: true } });
    expect(result.status).toBe('ok'); expect(result.documents[0].content).toContain('年化名义');
    expect(JSON.stringify(result)).not.toContain('fixture-secret');
  });
  it('无 Key 不请求；鉴权、限流、服务端错误明确回退且不回显错误正文', async () => {
    const fetcher = vi.fn<typeof fetch>(); vi.stubEnv('DOUBAO_SEARCH_API_KEY', '');
    expect((await searchWeb('车贷', { fetcher })).status).toBe('error'); expect(fetcher).not.toHaveBeenCalled();
    vi.stubEnv('DOUBAO_SEARCH_API_KEY', 'fixture-secret');
    for (const status of [401, 403, 429, 500]) {
      fetcher.mockResolvedValueOnce(new Response('fixture-secret', { status }));
      const result = await searchWeb('车贷', { fetcher });
      expect(result.status).toBe('error'); expect(JSON.stringify(result)).not.toContain('fixture-secret');
    }
  });
  it('超时、200错误包、坏JSON不能伪装搜索成功', async () => {
    vi.stubEnv('DOUBAO_SEARCH_API_KEY', 'fixture-secret');
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError'))
      .mockResolvedValueOnce(Response.json({ ResponseMetadata: { Error: { Code: 'Denied' } }, Result: null }))
      .mockResolvedValueOnce(new Response('<html>gateway error</html>'));
    expect((await searchWeb('车贷', { fetcher })).notice).toContain('等待时间');
    expect((await searchWeb('车贷', { fetcher })).status).toBe('error');
    expect((await searchWeb('车贷', { fetcher })).status).toBe('error');
  });
  it('去重、过滤危险链接和异常条目；无摘要正文不将 snippet 当作提取依据', () => {
    const good = payload.Result.WebResults[0];
    const documents = normalizeResults({ ResponseMetadata: {}, Result: { WebResults: [good, good, { ...good, Url: 'javascript:alert(1)' },
      { ...good, Url: 'https://user:pass@bank.example' }, { Title: 9 }, { ...good, Url: 'https://other.example', Summary: null }] } });
    expect(documents).toHaveLength(2); expect(documents[1].content).toBe('');
    expect(normalizeResults({ ResponseMetadata: {}, Result: { WebResults: null } })).toEqual([]);
  });
});
describe('网页条件与模拟隔离', () => {
  it('拒绝虚构来源/引用、最低利率、平息，未知费用保留空值', () => {
    const [doc] = normalizeResults(payload);
    const draft = { sourceId: doc.id, annualRatePercent: '6', feeYuan: 2000, rateEvidence: doc.content, feeEvidence: doc.content };
    expect(validateDrafts([draft], [doc])[0]).toMatchObject({ annualRatePercent: '6', feeYuan: 2000 });
    expect(validateDrafts([{ ...draft, sourceId: randomUUID() }], [doc])).toEqual([]);
    expect(validateDrafts([{ ...draft, annualRatePercent: '3', feeYuan: 0 }], [doc])[0]).toMatchObject({ annualRatePercent: null, feeYuan: null });
    expect(validateDrafts([{ ...draft, rateEvidence: '虚构年化名义利率6%' }], [doc])[0].annualRatePercent).toBeNull();
    const risky = { ...doc, content: '年化名义利率最低6.00%起；平息手续费率3%。' };
    expect(validateDrafts([{ ...draft, rateEvidence: risky.content }], [risky])[0].annualRatePercent).toBeNull();
  });
  it('必须显式确认和补齐费用；网页来源、已确认参数冻结，不能跨会话使用', () => {
    const db = new RunStore(':memory:');
    try {
      const [doc] = normalizeResults(payload); db.saveDocuments('owner', [doc]);
      expect(() => db.document('other', doc.id)).toThrow('来源不存在');
      const args = { sourceId: doc.id, annualRatePercent: '4.8', feeYuan: 2000, downPaymentPercent: 30, termMonths: 36, acknowledged: true };
      expect(() => createWebOffer({ ...args, feeYuan: undefined }, doc)).toThrow();
      expect(() => createWebOffer({ ...args, acknowledged: false }, doc)).toThrow();
      const offer = createWebOffer(args, db.document('owner', doc.id)); db.saveOffer('owner', offer);
      expect(() => db.offer('other', offer.id)).toThrow('贷款条件不存在');
      expect(db.offers('other')).toEqual([]);
      const setup = prepareSetup({ ...defaultInput, offerId: offer.id }, [db.offer('owner', offer.id)]).setup;
      expect(setup.loan.annualRate).toBe('0.048'); expect(setup.loan.fee).toBe(200000);
      const run = db.create('owner', setup);
      expect(run.initial.paths.loan.netWorth).toBe(29800000);
      expect(run.setup.loan.sourceUrl).toBe(doc.url);
      offer.annualRate = '0.30';
      expect(db.get(run.id, 'owner').setup.loan.annualRate).toBe('0.048');
    } finally { db.close(); }
  });
  it('模型未配置时仍可实际搜索，默认方案不冒充网页报价', async () => {
    vi.stubEnv('DOUBAO_SEARCH_API_KEY', 'fixture-secret'); vi.stubEnv('LLM_API_KEY', '');
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload)); vi.stubGlobal('fetch', fetcher);
    const result = await prepareWithSearch('GAME-U01', '买一辆18万元的车');
    expect(result.research?.status).toBe('ok'); expect(result.research?.drafts).toEqual([]);
    expect(result.input.offerId).toBe('loan-a'); expect(result.input.price).toBe(18000000);
    expect(result.source).toBe('rules'); expect(result.notice).toContain('手动填写');
    const query = JSON.parse(fetcher.mock.calls[0][1]?.body as string).Query;
    expect(query).not.toContain('260000'); expect(query).not.toContain('GAME-U01');
  });
});
