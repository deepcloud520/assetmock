import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { advance, choose, quietDraws, funds, reveal } from '../src/domain/v2/engine';
import { calculate, defaultInput } from '../src/domain/v2/setup';
import { toPublic } from '../src/domain/v2/presentation';
import { catalog } from '../src/server/v2/catalog';
import { makeRun, V2Store } from '../src/server/v2/store';
import type { Choice, Run, Target } from '../src/domain/v2/types';
const setup = (target: Target = 'car') => calculate(defaultInput(target), catalog(target)).setup;
function run(target: Target = 'car') { const s = setup(target); return makeRun('test', s, { tape: Array.from({ length: s.rules.months }, quietDraws) }); }
function finish(r: Run, single = false) { for (let i = 0; i < 400 && r.status !== 'ended'; i++) { if (r.pending) choose(r, r.pending.decisions.map(d => ({ path: d.path, kind: d.kind, choice: d.options[0] }))); else advance(r, single); } return r; }
describe('v0.2 deterministic long-life engine', () => {
  it('360 months amortize both loans to zero; rent removed, yearly bonuses counted once', () => {
    const r = finish(run('home'));
    expect(r.state.month).toBe(360);
    expect(r.setup.plans.a.payment).toBe(318252); expect(r.setup.plans.b.payment).toBe(227323);
    expect(funds(r.state.paths.a)).toBe(435429445); expect(funds(r.state.paths.b)).toBe(448163930);
    expect(r.state.paths.a.paid).toBe(144570555); expect(r.state.paths.b.paid).toBe(131836070);
    for (const id of ['a', 'b'] as const) {
      expect(r.state.paths[id].loan).toBe(0); expect(r.state.paths[id].paidOffMonth).toBe(360);
      expect(r.history[0].paths[id].ledger?.living).toBe(650000);
      expect(r.history.reduce((s, m) => s + m.paths[id].ledger!.bonus, 0)).toBe(60000000);
    }
  });
  it('car continues after 36-month loan payoff to month 60; independently calculated totals', () => {
    const r = finish(run()); expect(r.state.month).toBe(60); expect(r.state.paths.b.paidOffMonth).toBe(36);
    expect(r.history[36].paths.b.ledger!.interest).toBe(0); expect(r.history[36].paths.b.ledger!.loanPrincipal).toBe(0);
    expect(funds(r.state.paths.a)).toBe(65000000); expect(funds(r.state.paths.b)).toBe(63667346);
  });
  it('all three payment combinations work when funded; insufficient full purchase is rejected', () => {
    for (const pair of [['full', 'low'], ['full', 'high'], ['low', 'high']] as const) {
      const input = defaultInput('home'); input.profileId = 'HOME-U02'; input.paths.forEach((p, i) => { p.method = pair[i]; });
      expect(calculate(input, catalog('home')).errors).toEqual([]);
    }
    const input = defaultInput('home'); input.paths[0].method = 'full';
    expect(calculate(input, catalog('home')).errors[0]).toContain('开局现金不足');
  });
  it('accelerated and monthly stepping produce byte-identical finance histories', () => {
    const a = run('home'); a.tape[15].medical = 0; a.tape[30].marketDrop = 0; a.tape[40].jobLoss = 0;
    const b = structuredClone(a); finish(a); finish(b, true);
    expect(a.history).toEqual(b.history); expect(a.state).toEqual(b.state);
  });
  it.each<Choice>(['lower', 'wait', 'temporary'])('job choice %s preserves three full months of zero salary', choice => {
    const r = run(); r.tape[0].jobLoss = 0; advance(r);
    expect(r.state.month).toBe(0); expect(r.status).toBe('waiting');
    choose(r, r.pending!.decisions.map(d => ({ path: d.path, kind: d.kind, choice })));
    while (r.state.month < 8) advance(r, true);
    const wages = r.history.map(m => m.paths.b.ledger!.salary);
    expect(wages.slice(0, 3)).toEqual([0, 0, 0]);
    expect(wages[3]).toBe(choice === 'lower' ? 1440000 : choice === 'temporary' ? 720000 : 0);
    expect(wages[6]).toBe(choice === 'lower' ? 1440000 : 1800000);
  });
  it('independent choices diverge salaries; recovery cooldown uses each path employment state', () => {
    const r = run(); r.tape[0].jobLoss = 0; r.tape[15].jobLoss = 0; advance(r);
    choose(r, [{ path: 'a', kind: 'jobLoss', choice: 'lower' }, { path: 'b', kind: 'jobLoss', choice: 'wait' }]);
    while (r.state.month < 15) advance(r, true);
    advance(r); expect(r.pending?.decisions.map(d => d.path)).toEqual(['a']);
    expect(r.pending?.notices.join('')).toContain('B路径');
  });
  it('career effect starts next month, adds wage and expense and does not override simultaneous job loss', () => {
    const r = run(); r.tape[0].career = 0; advance(r);
    choose(r, [{ path: 'a', kind: 'career', choice: 'accept' }, { path: 'b', kind: 'career', choice: 'decline' }]);
    expect(r.history[0].paths.a.ledger?.salary).toBe(1800000);
    advance(r, true); expect(r.history[1].paths.a.ledger?.salary).toBe(1980000); expect(r.history[1].paths.a.ledger?.living).toBe(950000);
    const p = reveal(run().state, { ...quietDraws(), jobLoss: 0, career: 0 }, r.setup);
    expect(p.events.map(e => e.kind)).toEqual(['jobLoss']);
  });
  it('medical costs once, cooldown is independent of treatment; recurring bonuses defer once', () => {
    const r = run(); r.tape.forEach(d => { d.medical = 0; d.bonusDelay = 0; }); finish(r, true);
    expect(r.history.filter(m => m.events.some(e => e.kind === 'medical')).map(m => m.month).slice(0, 3)).toEqual([1, 13, 25]);
    expect(r.history[3].paths.b.ledger?.bonus).toBe(0); expect(r.history[6].paths.b.ledger?.bonus).toBe(2000000);
    expect(r.history[15].events.some(e => e.kind === 'bonusDelay')).toBe(true);
  });
  it('liquidation after investment loss, failed snapshot freezes while other path continues', () => {
    const r = run(); r.setup.profile.salary = 0; r.state.paths.a.employment.salary = 0; r.state.paths.b.employment.salary = 0; r.setup.profile.living = 2000000; r.state.paths.a.cash = 0; r.state.paths.a.fund = 1000000;
    r.state.paths.a.netWorth = 21000000; r.tape[0].marketDrop = 0; advance(r, true);
    expect(r.state.paths.a.failure?.month).toBe(1); expect(r.state.paths.a.lastMonth).toBe(0);
    expect(r.state.paths.b.lastMonth).toBe(1); expect(toPublic(r).timeline[1].a).toBeNull();
    const t = run(); t.state.paths.a.cash = 0; t.state.paths.a.netWorth -= 6000000; t.setup.profile.living = 2000000; t.tape[0].marketDrop = 0; advance(t, true);
    expect(t.history[0].paths.a.ledger!.fundSale).toBe(350000);
    expect(funds(t.state.paths.a)).toBe(2850000);
  });
  it('six-month trials cannot access future draws and leave run unchanged', () => {
    const r = run(); r.tape[0].jobLoss = 0; advance(r); const before = JSON.stringify(r);
    const a = toPublic(r); r.tape[1].medical = 0; const b = toPublic(r);
    expect(a.trials).toEqual(b.trials); r.tape[1].medical = 999999; expect(JSON.stringify(r)).toBe(before);
    expect(JSON.stringify(a)).not.toContain('tape');
  });
  it('same experience carries valid choices; invalid historical decisions are surfaced', () => {
    const a = run(); a.tape[0].jobLoss = 0; finish(a);
    const b = makeRun('test', a.setup, { tape: a.tape, inherited: a.history.flatMap(m => m.choices) }); finish(b);
    expect(b.state).toEqual(a.state);
    const c = run(); c.inherited = [{ month: 1, path: 'a', kind: 'career', choice: 'accept' }]; advance(c);
    expect(c.notices[0]).toContain('不再适用');
  });
});
describe('v0.2 storage safety', () => {
  it('atomic accelerated retries, conflicting reuse, session isolation, pending restore', () => {
    const db = new V2Store(':memory:'); const s = setup(); const tape = Array.from({ length: 60 }, quietDraws); tape[0].jobLoss = 0;
    const r = db.create('owner', s, { tape }); const key = randomUUID();
    const first = db.mutate(r.id, 'owner', 0, key, { kind: 'advance' });
    expect(first.status).toBe('waiting'); expect(db.get(r.id, 'owner').state.month).toBe(0);
    expect(db.mutate(r.id, 'owner', 0, key, { kind: 'advance' })).toEqual(first);
    expect(() => db.get(r.id, 'other')).toThrow();
    expect(() => db.mutate(r.id, 'owner', 0, randomUUID(), { kind: 'advance' })).toThrow();
    expect(() => db.mutate(r.id, 'owner', 0, key, { kind: 'advance', single: true })).toThrow();
    const second = db.mutate(r.id, 'owner', 1, randomUUID(), { kind: 'choose', selections: first.pending!.decisions.map(d => ({ path: d.path, kind: d.kind, choice: d.options[0] })) });
    expect(second.month).toBe(1); db.close();
  });
});
