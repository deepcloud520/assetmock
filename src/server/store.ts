import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomInt, randomUUID } from 'node:crypto';
import { advanceMonth, createInitialState, stateFromResult } from '../domain/engine';
import { publicRun } from '../domain/presentation';
import type { EventTape, PublicRun, Setup, StoredRun, SearchDocument, LoanOffer } from '../domain/types';

export class ServiceError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function newTape(): EventTape {
  return Array.from({ length: 12 }, () => ({ medical: randomInt(1000000), jobLoss: randomInt(1000000), bonusDelay: randomInt(1000000), marketDrop: randomInt(1000000) }));
}

export class RunStore {
  private db: Database.Database;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, body TEXT NOT NULL, version INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS month_results (run_id TEXT NOT NULL, month_index INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(run_id,month_index));
      CREATE TABLE IF NOT EXISTS requests (run_id TEXT NOT NULL, request_key TEXT NOT NULL, expected_month INTEGER NOT NULL, response TEXT NOT NULL, PRIMARY KEY(run_id,request_key));
      CREATE TABLE IF NOT EXISTS ai_records (id INTEGER PRIMARY KEY, session_id TEXT NOT NULL, run_id TEXT, cache_key TEXT, body TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS explanation_cache ON ai_records(run_id,cache_key) WHERE cache_key IS NOT NULL;
      CREATE TABLE IF NOT EXISTS search_documents (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS web_offers (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, body TEXT NOT NULL);
    `);
  }
  create(sessionId: string, setup: Setup, options?: { tape?: EventTape; parentId?: string }): StoredRun {
    const initial = createInitialState(setup);
    const now = new Date().toISOString();
    const run: StoredRun = { id: randomUUID(), sessionId, createdAt: now, confirmedAt: now,
      setup: structuredClone(setup), tape: structuredClone(options?.tape ?? newTape()), initial,
      state: structuredClone(initial), history: [], status: 'running', parentId: options?.parentId };
    this.db.prepare('INSERT INTO runs VALUES (?,?,?,?)').run(run.id, sessionId, JSON.stringify(run), 0);
    return run;
  }
  get(id: string, sessionId: string): StoredRun {
    const row = this.db.prepare('SELECT body FROM runs WHERE id=? AND session_id=?').get(id, sessionId) as { body: string } | undefined;
    if (!row) throw new ServiceError(404, '找不到这局游戏，请返回角色选择。');
    return JSON.parse(row.body);
  }
  advance(id: string, sessionId: string, expectedMonth: number, requestKey: string): PublicRun {
    return this.db.transaction(() => {
      const run = this.get(id, sessionId);
      const cached = this.db.prepare('SELECT expected_month,response FROM requests WHERE run_id=? AND request_key=?').get(id, requestKey) as { expected_month: number; response: string } | undefined;
      if (cached) {
        if (cached.expected_month !== expectedMonth) throw new ServiceError(409, '请求标识已用于其他月份。');
        const response = JSON.parse(cached.response) as PublicRun;
        if (response.displayVersion !== 'funds-v1') {
          // Upgrade old cached views from their original month, never from the latest balances.
          const history = run.history.slice(0, response.month);
          return publicRun({ ...run, history, state: history.length ? stateFromResult(history.at(-1)!) : run.initial, status: response.status });
        }
        return response;
      }
      if (run.state.month !== expectedMonth) throw new ServiceError(409, '月份已经更新，请同步进度后继续。');
      if (run.status === 'ended') throw new ServiceError(409, '本局已经结束。');
      const result = advanceMonth(run.state, run.tape[run.state.month], run.setup);
      run.history.push(result); run.state = stateFromResult(result);
      if (Object.values(run.state.paths).every(p => p.status !== 'running')) run.status = 'ended';
      const changed = this.db.prepare('UPDATE runs SET body=?,version=? WHERE id=? AND version=?').run(JSON.stringify(run), run.state.month, id, expectedMonth);
      if (changed.changes !== 1) throw new ServiceError(409, '月份冲突，请重新载入。');
      this.db.prepare('INSERT INTO month_results VALUES (?,?,?)').run(id, result.month, JSON.stringify(result));
      const view = publicRun(run);
      this.db.prepare('INSERT INTO requests VALUES (?,?,?,?)').run(id, requestKey, expectedMonth, JSON.stringify(view));
      return view;
    }).immediate();
  }
  record(sessionId: string, body: unknown, runId?: string, cacheKey?: string) {
    this.db.prepare('INSERT OR IGNORE INTO ai_records(session_id,run_id,cache_key,body,created_at) VALUES (?,?,?,?,?)').run(sessionId, runId ?? null, cacheKey ?? null, JSON.stringify(body), new Date().toISOString());
  }
  cached(runId: string, cacheKey: string): unknown {
    const row = this.db.prepare('SELECT body FROM ai_records WHERE run_id=? AND cache_key=?').get(runId, cacheKey) as { body: string } | undefined;
    return row ? JSON.parse(row.body) : undefined;
  }
  close() { this.db.close(); }
  saveDocuments(sessionId: string, documents: SearchDocument[]) {
    const insert = this.db.prepare('INSERT OR IGNORE INTO search_documents VALUES (?,?,?)');
    this.db.transaction(() => documents.forEach(doc => insert.run(doc.id, sessionId, JSON.stringify(doc))))();
  }
  document(sessionId: string, id: string): SearchDocument {
    const row = this.db.prepare('SELECT body FROM search_documents WHERE id=? AND session_id=?').get(id, sessionId) as { body: string } | undefined;
    if (!row) throw new ServiceError(404, '搜索来源不存在或不属于当前会话，请重新搜索。');
    return JSON.parse(row.body);
  }
  saveOffer(sessionId: string, offer: LoanOffer) {
    this.db.prepare('INSERT INTO web_offers VALUES (?,?,?)').run(offer.id, sessionId, JSON.stringify(offer));
  }
  offers(sessionId: string): LoanOffer[] {
    return (this.db.prepare('SELECT body FROM web_offers WHERE session_id=? ORDER BY rowid DESC LIMIT 50').all(sessionId) as { body: string }[]).map(row => JSON.parse(row.body));
  }
  offer(sessionId: string, id: string): LoanOffer {
    const row = this.db.prepare('SELECT body FROM web_offers WHERE id=? AND session_id=?').get(id, sessionId) as { body: string } | undefined;
    if (!row) throw new ServiceError(404, '贷款条件不存在或不属于当前会话。');
    return JSON.parse(row.body);
  }
}
const globalStore = globalThis as unknown as { lifeStore?: RunStore };
export function store() {
  return globalStore.lifeStore ??= new RunStore(process.env.DATABASE_PATH || './data/life-simulator.sqlite');
}
