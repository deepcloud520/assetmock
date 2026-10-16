import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RunStore } from '../src/server/store';
import { prepareSetup, searchLoanDocuments } from '../src/server/catalog';
import { defaultInput, rules } from '../src/domain/fixtures';
import { publicRun } from '../src/domain/presentation';
import { fallbackGoal, validateExplanation } from '../src/server/ai';

const databases: RunStore[] = [];
afterEach(() => databases.splice(0).forEach(db => db.close()));
function database() { const db = new RunStore(':memory:'); databases.push(db); return db; }
function quietTape(months = rules.months) { return Array.from({ length: months }, () => ({ medical: 999999, jobLoss: 999999, bonusDelay: 999999, marketDrop: 999999 })); }
describe('持久化与接口投影', () => {
  it('重复键返回原响应，不同键竞争旧月份失败', () => {
    const db = database(); const run = db.create('one', prepareSetup(defaultInput).setup, { tape: quietTape() });
    const first = db.advance(run.id, 'one', 0, 'key');
    db.advance(run.id, 'one', 1, 'key2');
    expect(db.advance(run.id, 'one', 0, 'key')).toEqual(first);
    expect(db.get(run.id, 'one').state.month).toBe(2);
    expect(() => db.advance(run.id, 'one', 0, 'different')).toThrow('月份已经更新');
    expect(() => db.advance(run.id, 'one', 1, 'key')).toThrow('请求标识');
  });
  it('会话隔离，展示分类资产但不暴露完整账本与未来随机', () => {
    const db = database(); const run = db.create('one', prepareSetup(defaultInput).setup);
    expect(() => db.get(run.id, 'two')).toThrow('找不到');
    expect(() => db.advance(run.id, 'two', 0, 'key')).toThrow('找不到');
    const view = publicRun(run);
    expect(view).not.toHaveProperty('tape'); expect(view).not.toHaveProperty('setup');
    expect(view.paths.cash).not.toHaveProperty('fund');
    expect(view.paths.cash.balances).toEqual({ cash: 6000000, investments: 4000000, liabilities: 0 });
    expect(view.paths.loan.balances).toEqual({ cash: 20000000, investments: 4000000, liabilities: 14000000 });
    for (const p of Object.values(view.paths)) {
      const b = p.balances; expect(b.cash + b.investments).toBe(p.remainingFunds);
    }
    expect(view.months).toHaveLength(0); expect(view.timeline).toHaveLength(1);
  });
  it('结束后禁止推进，相同经历重玩逐分相同', () => {
    const db = database(); const original = db.create('one', prepareSetup(defaultInput).setup, { tape: quietTape() });
    for (let i = 0; i < rules.months; i++) db.advance(original.id, 'one', i, `a${i}`);
    expect(() => db.advance(original.id, 'one', rules.months, 'extra')).toThrow('已经结束');
    const replay = db.create('one', original.setup, { tape: original.tape });
    for (let i = 0; i < rules.months; i++) db.advance(replay.id, 'one', i, `b${i}`);
    expect(db.get(replay.id, 'one').history).toEqual(db.get(original.id, 'one').history);
  });
  it('失败后曲线断开，不比较不同月份剩余资金', () => {
    const db = database(); const tape = quietTape(); tape[0].medical = 0;
    const run = db.create('one', prepareSetup({ ...defaultInput, profileId: 'GAME-U02' }).setup, { tape });
    const view = db.advance(run.id, 'one', 0, 'key');
    expect(view.timeline[1].cash).toBeNull(); expect(view.summary.difference).toBeNull();
    expect(view.paths.cash.balances).toEqual({ cash: 1000000, investments: 2000000, liabilities: 0 });
    expect(view.paths.cash.remainingFunds).toBe(3000000);
    expect(view.paths.cash).not.toHaveProperty('netWorth');
    expect(view.paths.cash.balances).not.toHaveProperty('fixedAssets');
  });
});
it('历史幂等响应补充分类余额时只展示原月份，不泄漏后续余额', () => {
  const dir = mkdtempSync(join(tmpdir(), 'asset-view-test-'));
  const path = join(dir, 'test.sqlite'); const db = new RunStore(path);
  try {
    const run = db.create('one', prepareSetup(defaultInput).setup, { tape: quietTape() });
    const first = db.advance(run.id, 'one', 0, 'old-key');
    db.advance(run.id, 'one', 1, 'next-key');
    const old = JSON.parse(JSON.stringify(first));
    delete old.displayVersion; delete old.totalMonths; delete old.paths.cash.balances; delete old.paths.loan.balances;
    const raw = new Database(path);
    raw.prepare('UPDATE requests SET response=? WHERE run_id=? AND request_key=?').run(JSON.stringify(old), run.id, 'old-key'); raw.close();
    const retried = db.advance(run.id, 'one', 0, 'old-key');
    expect(retried).toEqual(first);
    expect(retried.paths.cash.balances.cash).toBe(6750000);
    expect(retried.paths.cash.remainingFunds).toBe(10750000);
    expect(retried.paths.loan.remainingFunds).toBe(24324093);
    expect(retried.paths.cash.delta).toBe(750000);
    expect(retried.paths.loan.delta).toBe(324093);
    expect(retried.paths.loan.purchasePaid).toBe(6425907);
    expect(retried.paths.cash.purchasePaid).toBe(20000000);
    expect(retried.paths.loan.balances).toEqual({ cash: 20324093, investments: 4000000, liabilities: 13644093 });
    expect(db.get(run.id, 'one').state.month).toBe(2);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});
describe('资料和AI边界', () => {
  it('无匹配为空，不伪造贷款文档', () => {
    expect(searchLoanDocuments({ query: '房贷' })).toEqual([]);
    expect(searchLoanDocuments({ query: '购车贷款', preferredTermMonths: 60 })).toEqual([]);
    expect(searchLoanDocuments({ query: '购车', preferredTermMonths: 24 })[0].id).toBe('loan-b');
  });
  it('降级明确，提取结果待用户确认', () => {
    const fallback = fallbackGoal('GAME-U01', '买一辆18万元的车，首付40%，24个月');
    expect(fallback.input).toMatchObject({ price: 18000000, downPaymentPercent: 40, termMonths: 24 });
    expect(fallback.source).toBe('rules');
    expect(fallbackGoal('GAME-U01', '买一套房').supported).toBe(false);
    expect(fallbackGoal('GAME-U01', '买20万美元的车').supported).toBe(false);
  });
  it('模型引用必须存在，拒绝自由数字结论', () => {
    const facts = [{ id: 'cash.change', text: '变化已结算。' }];
    expect(() => validateExplanation({ paragraphs: [{ factIds: ['future'], text: '未来会暴跌' }] }, facts)).toThrow();
    expect(() => validateExplanation({ paragraphs: [{ factIds: ['cash.change'], text: '赚了100万元' }] }, facts)).toThrow();
    expect(validateExplanation({ paragraphs: [{ factIds: ['cash.change'], text: '本月变化已经反映在净资产中。' }] }, facts)).toHaveLength(1);
  });
});


it('新局生成72次抽取，旧12月局和相同经历重玩保留周期', () => {
  const db = database(); const setup = prepareSetup(defaultInput).setup;
  const fresh = db.create('one', setup);
  expect(fresh.tape).toHaveLength(72 / 4);
  expect(publicRun(fresh).totalMonths).toBe(18);
  expect(fresh.tape.flatMap(draw => Object.values(draw))).toHaveLength(72);
  for (const draw of fresh.tape.flatMap(draw => Object.values(draw))) {
    expect(Number.isInteger(draw)).toBe(true); expect(draw).toBeGreaterThanOrEqual(0); expect(draw).toBeLessThan(1000000);
  }
  setup.rules.months = 12; setup.rules.version = '0.1.1';
  const old = db.create('one', setup, { tape: quietTape(12) });
  for (let i = 0; i < 12; i++) db.advance(old.id, 'one', i, `old-${i}`);
  expect(publicRun(db.get(old.id, 'one'))).toMatchObject({ totalMonths: 12, month: 12, status: 'ended' });
  const replay = db.create('one', old.setup, { tape: old.tape });
  expect(publicRun(replay).totalMonths).toBe(12);
  expect(replay.tape).toEqual(old.tape);
  expect(() => db.create('one', prepareSetup(defaultInput).setup, { tape: old.tape })).toThrow('周期一致');
});
