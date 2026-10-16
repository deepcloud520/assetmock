import { loadEnvConfig } from '@next/env';
import assert from 'node:assert/strict';
loadEnvConfig(process.cwd());
process.env.DATABASE_PATH = './data/live-v2-verification.sqlite';
async function main() {
  if (!process.env.LLM_API_KEY?.trim()) throw new Error('请配置LLM_API_KEY');
  const { prepare, explain, recommend } = await import('../src/server/v2/ai');
  const { calculate, defaultInput } = await import('../src/domain/v2/setup');
  const { catalog } = await import('../src/server/v2/catalog');
  const { makeRun } = await import('../src/server/v2/store');
  const { advance, choose, quietDraws } = await import('../src/domain/v2/engine');
  console.log('开始真实 v0.2 验证：购房目标整理、资料与计算工具。');
  const p = await prepare('home', 'HOME-U01', '我想买100万元的房子，比较30%和50%首付，贷款30年。', 'live-v2');
  console.log(JSON.stringify({ stage: 'prepare', source: p.source, trace: p.trace, research: p.research?.status, documents: p.research?.documents.length, input: p.input }));
  assert.equal(p.source, 'model'); assert.equal(p.input.target, 'home'); assert.equal(p.input.price, 100000000);
  const s = calculate(defaultInput('home'), catalog('home')).setup;
  const tape = Array.from({ length: 360 }, quietDraws); tape[3].jobLoss = 0;
  const r = makeRun('live-v2', s, { tape }); advance(r); advance(r);
  assert.equal(r.status, 'waiting');
  console.log('真实模型解释已揭晓事件与六个月试算。');
  const e = await explain(r); console.log(JSON.stringify({ stage: 'event', source: e.source, notice: e.notice, paragraphs: e.paragraphs })); assert.equal(e.source, 'model'); assert.ok(e.paragraphs.every(p => !/购车|车款|车辆购置|车贷/.test(p.text)));
  choose(r, r.pending!.decisions.map(d => ({ path: d.path, kind: d.kind, choice: 'lower' })));
  while (Object.values(r.state.paths).some(p => p.status === 'running')) advance(r);
  console.log('真实模型选择引擎已验证的重玩建议。');
  const suggestion = await recommend(r); console.log(JSON.stringify({ stage: 'recommendation', source: suggestion.source, title: suggestion.selected?.title, verified: suggestion.selected?.verified, month: r.state.month }));
  assert.equal(suggestion.source, 'model'); assert.equal(suggestion.selected?.verified, true);
  console.log('PASS: v0.2 三个真实模型环节均通过。');
}
main().catch(error => { console.error(error instanceof Error ? error.message : '真实模型验收失败'); process.exitCode = 1; });
