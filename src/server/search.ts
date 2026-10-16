import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { LoanResearch, SearchDocument } from '../domain/types';

export const SEARCH_ENDPOINT = 'https://open.feedcoopapi.com/search_api/web_search';
const itemSchema = z.object({
  Title: z.string(), Url: z.string().optional(), SiteName: z.string().nullish(),
  Snippet: z.string().nullish(), Summary: z.string().nullish(), Content: z.string().nullish(), PublishTime: z.string().nullish(),
});
const responseSchema = z.object({
  ResponseMetadata: z.object({ Error: z.unknown().optional() }).passthrough(),
  Result: z.object({ WebResults: z.array(z.unknown()).nullish() }).nullish(),
});
export function searchConfigured() { return !!process.env.DOUBAO_SEARCH_API_KEY?.trim(); }
export function normalizeResults(raw: unknown, now = new Date().toISOString()): SearchDocument[] {
  const payload = responseSchema.parse(raw);
  if (payload.ResponseMetadata.Error || !payload.Result) throw new Error('SearchProviderError');
  const documents: SearchDocument[] = [];
  const seen = new Set<string>();
  for (const rawItem of payload.Result.WebResults ?? []) {
    const item = itemSchema.safeParse(rawItem);
    if (!item.success || !item.data.Url) continue;
    const value = item.data;
    let url: URL;
    try { url = new URL(value.Url!); } catch { continue; }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || seen.has(url.href)) continue;
    seen.add(url.href);
    documents.push({ id: randomUUID(), title: value.Title.slice(0, 200), url: url.href,
      site: (value.SiteName || url.hostname).slice(0, 100), snippet: (value.Snippet || '').slice(0, 400),
      // Summary is query-relevant provider text, preferable to the short listing snippet for extraction.
      content: (value.Summary || value.Content || '').slice(0, 6000),
      publishedAt: value.PublishTime || undefined, retrievedAt: now });
    if (documents.length === 5) break;
  }
  return documents;
}
export async function searchWeb(query: string, options: { fetcher?: typeof fetch; timeoutMs?: number } = {}): Promise<LoanResearch> {
  const normalized = Array.from(query.replace(/\s+/g, ' ').trim()).slice(0, 100).join('');
  const base = { query: normalized, documents: [] as SearchDocument[], drafts: [] };
  if (!searchConfigured()) return { ...base, status: 'error', notice: '搜索尚未配置：请在 .env.local 填写 DOUBAO_SEARCH_API_KEY。' };
  if (!normalized) return { ...base, status: 'error', notice: '请输入购车搜索条件。' };
  try {
    const response = await (options.fetcher ?? fetch)(SEARCH_ENDPOINT, {
      method: 'POST', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(options.timeoutMs ?? 15000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.DOUBAO_SEARCH_API_KEY!.trim()}` },
      body: JSON.stringify({ Query: normalized, SearchType: 'web', Count: 5,
        Filter: { NeedUrl: true }, QueryControl: { QueryRewrite: false }, ContentFormats: 'text' }),
    });
    if (!response.ok) {
      const notice = response.status === 401 || response.status === 403
        ? '搜索鉴权失败，请检查 Custom 搜索专用 Key、对应套餐和服务开通状态。'
        : response.status === 429 ? '搜索请求受到限流，请稍后再试。' : `搜索服务暂不可用（HTTP ${response.status}），可继续使用示例资料。`;
      return { ...base, status: 'error', notice };
    }
    const documents = normalizeResults(await response.json());
    return { ...base, documents, status: documents.length ? 'ok' : 'empty',
      notice: documents.length ? '已通过豆包搜索 Custom 获取网页资料；请查看原文并确认模拟条件。' : '未找到包含有效来源链接的结果，可修改目标重试或使用示例资料。' };
  } catch (error) {
    const timeout = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
    return { ...base, status: 'error', notice: timeout
      ? '搜索超过等待时间，已停止请求。可重试或继续使用示例资料。'
      : '搜索响应异常或网络不可用，未将其当作有效资料。可重试或使用示例资料。' };
  }
}
