import { test, expect } from '@playwright/test';
import Database from 'better-sqlite3';
import { defaultInput } from '../../src/domain/v2/setup';
import type { PublicRun } from '../../src/domain/v2/types';
function setTape(id: string, changes: Record<number, Record<string, number>> = {}) {
  const db = new Database('./data/e2e.sqlite');
  try {
    const row = db.prepare('SELECT body FROM v2_runs WHERE id=?').get(id) as { body: string };
    const run = JSON.parse(row.body); run.tape = Array.from({ length: run.setup.rules.months }, (_, i) => ({ medical: 999999, jobLoss: 999999, bonusDelay: 999999, marketDrop: 999999, career: 999999, ...changes[i + 1] }));
    db.prepare('UPDATE v2_runs SET body=? WHERE id=?').run(JSON.stringify(run), id);
  } finally { db.close(); }
}
test('v0.2 购房三选二、360个月、阶段回顾和重玩', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await expect(page.getByRole('button', { name: /拥有一个自己的家/ })).toBeVisible(); await page.screenshot({ path: 'test-results/v2-targets.png', fullPage: true });
  await page.getByRole('button', { name: /拥有一个自己的家/ }).click();
  await page.getByRole('button', { name: '选择可全款型' }).click();
  await expect(page.getByText('30 年 / 360 个月的生活假设')).toBeVisible();
  const select = page.getByLabel('路径a付款方式'); await select.selectOption('full');
  await expect(page.getByText('开局现金不足', { exact: false })).toHaveCount(0);
  await select.selectOption('low');
  await page.getByRole('checkbox').check(); await page.getByRole('button', { name: '确认方案，开始人生' }).click();
  await expect(page.getByTestId('v2-month')).toHaveText('0');
  const id = await page.evaluate(() => localStorage.getItem('life-run-v2')); setTape(id!);
  await page.screenshot({ path: 'test-results/v2-home-opening.png', fullPage: true });
  for (const month of [3, 6, 9, 12, 24, 36, 48, 60, 120, 180, 240, 300, 360]) {
    await page.getByRole('button', { name: /继续人生 · 最多到第/ }).click(); await expect(page.getByTestId('v2-month')).toHaveText(String(month));
  }
  await expect(page.getByText('第360月贷款已还清')).toHaveCount(2);
  await page.reload(); await expect(page.getByTestId('v2-month')).toHaveText('360');
  await page.getByRole('button', { name: 'AI 找到一个值得重玩的改变' }).click();
  await expect(page.getByText('规则建议 · 引擎验证')).toBeVisible();
  await page.getByRole('button', { name: '查看修改后的方案' }).click();
  await expect(page.getByLabel('购置预算')).toHaveValue('900000');
  await page.getByRole('checkbox').check(); await page.getByRole('button', { name: '确认修改，沿用相同经历' }).click();
  await expect(page.getByTestId('v2-month')).toHaveText('0');
  expect(errors).toEqual([]);
});
test('v0.2 手机端暂停刷新、独立选择和同步操作', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await page.getByRole('button', { name: /买一辆自己的车/ }).click(); await page.getByRole('button', { name: '选择林舟' }).click();
  await page.getByRole('checkbox').check(); await page.getByRole('button', { name: '确认方案，开始人生' }).click();
  await expect(page.getByTestId('v2-month')).toHaveText('0');
  const id = await page.evaluate(() => localStorage.getItem('life-run-v2')); setTape(id!, { 1: { jobLoss: 0 }, 18: { career: 0 } });
  await page.getByRole('button', { name: /继续人生/ }).click(); await expect(page.getByRole('region', { name: '关键选择' })).toBeVisible();
  await page.reload(); await expect(page.getByTestId('v2-month')).toHaveText('0');
  await page.getByRole('radio', { name: /接受降薪工作/ }).first().check(); await page.getByRole('button', { name: '同步首条路径的选择' }).click();
  await expect(page.getByRole('radio', { name: /接受降薪工作/ }).nth(1)).toBeChecked();
  await page.getByRole('radio', { name: /临时工作过渡/ }).nth(1).check();
  await page.screenshot({ path: 'test-results/v2-choice-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '确认选择，结算本月' }).click(); await expect(page.getByTestId('v2-month')).toHaveText('1');
  for (const month of [2, 3, 4]) { await page.getByRole('button', { name: /继续人生/ }).click(); await expect(page.getByTestId('v2-month')).toHaveText(String(month)); }
  const run = await (await page.request.get(`/api/v2/runs/${id}`)).json() as PublicRun;
  expect(run.history[3].paths.a.ledger?.salary).toBe(1440000); expect(run.history[3].paths.b.ledger?.salary).toBe(720000);
  await page.getByRole('button', { name: '让 AI 解读这一段人生' }).click(); await expect(page.getByText('规则说明', { exact: true })).toBeVisible();
});
test('v0.2 API竞争、会话隔离、非法选择与来源边界', async ({ request, playwright }) => {
  const created = await request.post('/api/v2/runs', { data: { input: defaultInput('home'), confirmed: true } }); expect(created.status()).toBe(200);
  const r = await created.json(); setTape(r.id, { 2: { jobLoss: 0 } });
  const other = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3100' }); expect((await other.get(`/api/v2/runs/${r.id}`)).status()).toBe(404);
  const data = { expectedVersion: 0, requestKey: crypto.randomUUID() };
  const [a, b] = await Promise.all([request.post(`/api/v2/runs/${r.id}/advance`, { data }), request.post(`/api/v2/runs/${r.id}/advance`, { data })]);
  const paused = await a.json(); expect(await b.json()).toEqual(paused); expect(paused.month).toBe(1); expect(paused.pending.month).toBe(2); expect(paused).not.toHaveProperty('tape');
  expect((await request.post(`/api/v2/runs/${r.id}/choose`, { data: { expectedVersion: 1, requestKey: crypto.randomUUID(), selections: [{ path: 'a', kind: 'jobLoss', choice: 'accept' }] } })).status()).toBe(422);
  expect((await request.post(`/api/v2/runs/${r.id}/recommendation`, { data: {} })).status()).toBe(422);
  const selections = paused.pending.decisions.map((d: { path: string; kind: string }) => ({ ...d, choice: 'lower' })).map(({ path, kind, choice }: { path: string; kind: string; choice: string }) => ({ path, kind, choice }));
  const [c, d] = await Promise.all([request.post(`/api/v2/runs/${r.id}/choose`, { data: { expectedVersion: 1, requestKey: crypto.randomUUID(), selections } }), request.post(`/api/v2/runs/${r.id}/choose`, { data: { expectedVersion: 1, requestKey: crypto.randomUUID(), selections } })]); expect([c.status(), d.status()].sort()).toEqual([200, 409]);
  const invalid = defaultInput('home'); invalid.paths[0].offerId = 'loan-a'; expect((await request.post('/api/v2/plans/calculate', { data: invalid })).status()).toBe(422);
  await other.dispose();
});
