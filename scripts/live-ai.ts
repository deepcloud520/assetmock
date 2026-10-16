import { loadEnvConfig } from '@next/env';
import assert from 'node:assert/strict';
loadEnvConfig(process.cwd());

async function main() {
  if (!process.env.LLM_API_KEY?.trim()) {
    console.log('SKIPPED: LLM_API_KEY 未配置。'); process.exitCode = 2; return;
  }
  const { prepareWithAI, explainWithAI } = await import('../src/server/ai');
  const { prepareSetup } = await import('../src/server/catalog');
  const { RunStore } = await import('../src/server/store');
  const { monthFacts } = await import('../src/domain/presentation');
  const started = Date.now();
  console.log('开始真实模型验证：目标解析 → 本地资料 → 计算工具（最长60秒）。');
  const result = await prepareWithAI('GAME-U01', '我想买一辆20万元的车，首付30%，分36个月，比较全款和贷款。');
  console.log(JSON.stringify({ stage: 'prepare', source: result.source, input: result.input, trace: result.trace, elapsedMs: Date.now() - started }));
  const db = new RunStore(':memory:');
  const setup = prepareSetup(result.input);
  if (setup.errors.length) throw new Error('方案不满足开局条件');
  const run = db.create('live-test', setup.setup, { tape: Array.from({ length: 12 }, () => ({ medical: 999999, jobLoss: 999999, bonusDelay: 999999, marketDrop: 999999 })) });
  const view = db.advance(run.id, 'live-test', 0, 'live-first-month');
  const facts = monthFacts(db.get(run.id, 'live-test').history[0]);
  db.close();
  console.log(JSON.stringify({ stage: 'settlement', month: view.month, paths: view.paths }));
  const explanation = await explainWithAI(facts, false);
  console.log(JSON.stringify({ stage: 'explanation', source: explanation.source, paragraphs: explanation.paragraphs, notice: explanation.notice }));
  assert.equal(result.input.price, 20000000);
  assert.equal(result.input.downPaymentPercent, 30);
  assert.equal(result.input.termMonths, 36);
  for (const name of ['getProfile', 'searchLoanDocuments', 'calculatePurchaseComparison']) {
    assert.ok(result.trace.some(t => t.tool === name && t.status === 'ok'));
  }
  if (result.source !== 'model' || explanation.source !== 'model') process.exitCode = 1;
}
main().catch(() => { console.error('真实模型验证失败，请检查本地配置与服务状态；未输出密钥。'); process.exitCode = 1; });
