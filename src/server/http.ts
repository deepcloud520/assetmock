import { cookies } from 'next/headers';
import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { ServiceError } from './store';

export async function session(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get('life-session')?.value;
  if (existing && /^[0-9a-f-]{36}$/.test(existing)) return existing;
  const id = randomUUID();
  jar.set('life-session', id, { httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE === 'true', path: '/', maxAge: 60 * 60 * 24 * 30 });
  return id;
}
export async function body(request: NextRequest): Promise<unknown> {
  if (Number(request.headers.get('content-length') || 0) > 16384) throw new ServiceError(413, '输入过长。');
  const text = await request.text();
  if (text.length > 16384) throw new ServiceError(413, '输入过长。');
  try { return JSON.parse(text); } catch { throw new ServiceError(400, '请求格式无效。'); }
}
export function endpoint(handler: (request: NextRequest, sessionId: string) => Promise<unknown>) {
  return async (request: NextRequest) => {
    try {
      if (request.method !== 'GET') {
        const origin = request.headers.get('origin');
        const expected = process.env.APP_ORIGIN || `${request.nextUrl.protocol}//${request.headers.get('host')}`;
        if (origin && origin !== expected) throw new ServiceError(403, '不接受跨站写入请求。');
      }
      const result = await handler(request, await session());
      return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      if (error instanceof ZodError) return NextResponse.json({ error: '参数无效，请核对车价、首付比例及期限。', fields: error.issues.map(i => i.path.join('.')) }, { status: 422 });
      if (error instanceof ServiceError) return NextResponse.json({ error: error.message }, { status: error.status });
      console.error('Request failed:', error instanceof Error ? error.name : 'UnknownError');
      return NextResponse.json({ error: '服务暂时不可用，请重试。' }, { status: 500 });
    }
  };
}
