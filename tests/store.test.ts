import { afterEach, describe, expect, it } from 'vitest';
import { RunStore } from '../src/server/store';
import { prepareSetup, searchLoanDocuments } from '../src/server/catalog';
import { defaultInput } from '../src/domain/fixtures';
import { publicRun } from '../src/domain/presentation';
import { fallbackGoal, validateExplanation } from '../src/server/ai';

const databases: RunStore[] = [];
afterEach(() => databases.splice(0).forEach(db => db.close()));
function database() { const db = new RunStore(':memory:'); databases.push(db); return db; }
function quietTape() { return Array.from({ length: 12 }, () => ({ medical: 999999, jobLoss: 999999, bonusDelay: 999999, marketDrop: 999999 })); }
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
  it('会话隔离，展示投影不带后台资产与未来随机', () => {
    const db = database(); const run = db.create('one', prepareSetup(defaultInput).setup);
    expect(() => db.get(run.id, 'two')).toThrow('找不到');
    expect(() => db.advance(run.id, 'two', 0, 'key')).toThrow('找不到');
    const view = publicRun(run);
    expect(view).not.toHaveProperty('tape'); expect(view).not.toHaveProperty('setup');
    expect(view.paths.cash).not.toHaveProperty('fund'); expect(view.paths.cash).not.toHaveProperty('cash');
    expect(view.months).toHaveLength(0); expect(view.timeline).toHaveLength(1);
  });
  it('结束后禁止推进，相同经历重玩逐分相同', () => {
    const db = database(); const original = db.create('one', prepareSetup(defaultInput).setup, { tape: quietTape() });
    for (let i = 0; i < 12; i++) db.advance(original.id, 'one', i, `a${i}`);
    expect(() => db.advance(original.id, 'one', 12, 'extra')).toThrow('已经结束');
    const replay = db.create('one', original.setup, { tape: original.tape });
    for (let i = 0; i < 12; i++) db.advance(replay.id, 'one', i, `b${i}`);
    expect(db.get(replay.id, 'one').history).toEqual(db.get(original.id, 'one').history);
  });
  it('失败后曲线断开，不比较不同月份净资产', () => {
    const db = database(); const tape = quietTape(); tape[0].medical = 0;
    const run = db.create('one', prepareSetup({ ...defaultInput, profileId: 'GAME-U02' }).setup, { tape });
    const view = db.advance(run.id, 'one', 0, 'key');
    expect(view.timeline[1].cash).toBeNull(); expect(view.summary.difference).toBeNull();
  });
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
