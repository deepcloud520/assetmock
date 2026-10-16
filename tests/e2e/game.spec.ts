import { test, expect } from '@playwright/test';
import Database from 'better-sqlite3';

function setTape(id: string, changes: Record<number, Record<string, number>> = {}) {
  const db = new Database('./data/e2e.sqlite');
  try {
    const row = db.prepare('SELECT body FROM runs WHERE id=?').get(id) as { body: string };
    const run = JSON.parse(row.body);
    run.tape = Array.from({ length: 12 }, (_, i) => ({ medical: 999999, jobLoss: 999999, bonusDelay: 999999, marketDrop: 999999, ...changes[i + 1] }));
    db.prepare('UPDATE runs SET body=? WHERE id=?').run(JSON.stringify(run), id);
  } finally { db.close(); }
}

test('完整界面：角色、方案、确认、十二月、刷新和相同经历重玩', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: '选择林舟' })).toBeVisible();
  await page.screenshot({ path: 'test-results/profiles-desktop.png', fullPage: true });
  await page.getByRole('button', { name: '选择林舟' }).click();
  await page.getByRole('button', { name: '读取资料，整理方案' }).click();
  await expect(page.getByText('预设资料与手动模式', { exact: true })).toBeVisible();
  await expect(page.getByText('¥4,259.07', { exact: true })).toBeVisible();
  const start = page.getByRole('button', { name: '开始我的十二个月' });
  await expect(start).toBeDisabled();
  await page.getByRole('checkbox').check();
  await start.click();
  await expect(page.getByTestId('cash-networth')).toHaveText('¥300,000.00');
  const id = await page.evaluate(() => localStorage.getItem('life-run'));
  setTape(id!);
  await page.getByRole('button', { name: /揭晓下个月/ }).click();
  await expect(page.getByTestId('cash-networth')).toHaveText('¥305,500.00');
  await page.reload();
  await expect(page.getByTestId('loan-networth')).toHaveText('¥304,800.00');
  for (let i = 2; i <= 12; i++) {
    await page.getByRole('button', { name: /揭晓下个月/ }).click();
    await expect(page.getByText(`已揭晓第 ${i} / 12 个月`, { exact: true })).toBeVisible();
  }
  await expect(page.getByTestId('cash-networth')).toHaveText('¥386,000.00');
  await expect(page.getByTestId('loan-networth')).toHaveText('¥378,794.30');
  await page.screenshot({ path: 'test-results/ending-desktop.png', fullPage: true });
  await page.getByRole('button', { name: '相同经历再试一次' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '用相同经历重新开始' }).click();
  await page.getByRole('button', { name: /揭晓下个月/ }).click();
  await expect(page.getByTestId('loan-networth')).toHaveText('¥304,800.00');
  expect(errors).toEqual([]);
});

test('真实API：会话隔离、重试、竞争、未来解释拒绝', async ({ request, playwright }) => {
  const input = { profileId: 'GAME-U01', price: 20000000, offerId: 'loan-a', downPaymentPercent: 30, termMonths: 36 };
  const created = await request.post('/api/runs', { data: { input, confirmed: true } });
  expect(created.ok()).toBeTruthy(); const run = await created.json(); setTape(run.id);
  expect(run).not.toHaveProperty('tape');
  const other = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3100' });
  expect((await other.get(`/api/runs/${run.id}`)).status()).toBe(404);
  expect((await request.post(`/api/runs/${run.id}/explanation`, { data: { month: 12 } })).status()).toBe(422);
  const data = { expectedMonth: 0, requestKey: crypto.randomUUID() };
  const [a, b] = await Promise.all([
    request.post(`/api/runs/${run.id}/advance`, { data }),
    request.post(`/api/runs/${run.id}/advance`, { data }),
  ]);
  expect(await a.json()).toEqual(await b.json());
  const [c, d] = await Promise.all([
    request.post(`/api/runs/${run.id}/advance`, { data: { expectedMonth: 1, requestKey: crypto.randomUUID() } }),
    request.post(`/api/runs/${run.id}/advance`, { data: { expectedMonth: 1, requestKey: crypto.randomUUID() } }),
  ]);
  expect([c.status(), d.status()].sort()).toEqual([200, 409]);
  const state = await (await request.get(`/api/runs/${run.id}`)).json();
  expect(state.month).toBe(2); expect(state.months).toHaveLength(2);
  await other.dispose();
});

test('手机端：随机事件、失败路径与键盘可操作', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/'); await page.getByRole('button', { name: '选择陈夏' }).click();
  await page.getByRole('checkbox').check(); await page.getByRole('button', { name: '开始我的十二个月' }).click();
  await expect(page.getByTestId('cash-networth')).toBeVisible();
  const id = await page.evaluate(() => localStorage.getItem('life-run'));
  setTape(id!, { 1: { medical: 0, jobLoss: 0, marketDrop: 0 }, 4: { bonusDelay: 0 } });
  await page.getByRole('button', { name: /揭晓下个月/ }).click();
  await expect(page.getByText('一笔意外的医疗支出', { exact: true })).toBeVisible();
  await expect(page.getByText('第1月资金不足', { exact: false })).toBeVisible();
  await expect(page.getByTestId('cash-networth')).toHaveText('¥230,000.00');
  await page.screenshot({ path: 'test-results/medical-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.getByRole('button', { name: /揭晓下个月/ }).click();
  await expect(page.getByText('已揭晓第 2 / 12 个月')).toBeVisible();
});

test('联网资料：未知费用待确认、网页方案入账与恢复、跨会话拒绝', async ({ page, playwright }) => {
  const source = { id: crypto.randomUUID(), title: '测试来源：汽车贷款条件说明', url: 'https://bank.example/car-loan',
    site: '测试来源', snippet: '这是浏览器验收专用资料，未提供明确贷款费用。',
    content: '该资料仅用于验收界面。请确认贷款条件，不代表真实银行产品。', retrievedAt: '2026-10-16T12:00:00.000Z' };
  const input = { profileId: 'GAME-U01', price: 20000000, offerId: 'loan-a', downPaymentPercent: 30, termMonths: 36 };
  await page.route('**/api/profiles', async route => {
    const response = await route.fetch(); await route.fulfill({ json: { ...await response.json(), searchEnabled: true } });
  });
  await page.route('**/api/plans/prepare', async route => route.fulfill({ json: {
    input, offers: [], matches: [], source: 'rules', notice: '搜索结果验收夹具', trace: [], supported: true,
    research: { status: 'ok', query: '汽车贷款', notice: '本条为固定搜索夹具。', documents: [source], drafts: [] },
  } }));
  await page.goto('/'); await page.getByRole('button', { name: '选择林舟' }).click();
  const sid = (await page.context().cookies()).find(c => c.name === 'life-session')!.value;
  const db = new Database('./data/e2e.sqlite');
  db.prepare('INSERT INTO search_documents VALUES (?,?,?)').run(source.id, sid, JSON.stringify(source)); db.close();
  await page.getByRole('button', { name: '读取资料，整理方案' }).click();
  await expect(page.getByRole('link', { name: source.title })).toHaveAttribute('href', source.url);
  await page.getByRole('button', { name: '参考这份资料设定条件' }).click();
  const useConditions = page.getByRole('button', { name: '使用这些条件计算' });
  await expect(useConditions).toBeDisabled();
  await page.getByLabel('年化名义利率（%）', { exact: true }).fill('4.8');
  await page.getByRole('checkbox', { name: /我确认将以上条件/ }).check();
  await expect(useConditions).toBeDisabled();
  await page.getByLabel('一次性贷款费用（元）', { exact: true }).fill('2000');
  await page.getByRole('checkbox', { name: /我确认将以上条件/ }).check();
  await page.screenshot({ path: 'test-results/search-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: 'test-results/search-mobile.png', fullPage: true });
  await useConditions.click();
  await expect(page.getByText('当前采用参考网页设定的模拟条件。', { exact: false })).toBeVisible();
  await page.getByRole('checkbox', { name: /我已核对参数/ }).check();
  await page.getByRole('button', { name: '开始我的十二个月' }).click();
  await expect(page.getByTestId('loan-networth')).toHaveText('¥298,000.00');
  await page.reload(); await expect(page.getByTestId('loan-networth')).toHaveText('¥298,000.00');
  const id = await page.evaluate(() => localStorage.getItem('life-run'));
  const run = await (await page.request.get(`/api/runs/${id}`)).json();
  expect(run.plan.loan).toMatchObject({ annualRate: '0.048', fee: 200000, sourceUrl: source.url, sourceType: 'web_reference' });
  const other = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3100' });
  expect((await other.post('/api/plans/calculate', { data: run.input })).status()).toBe(404);
  expect((await other.post('/api/plans/from-search', { data: { sourceId: source.id, annualRatePercent: '4.8', feeYuan: 0, downPaymentPercent: 30, termMonths: 36, acknowledged: true } })).status()).toBe(404);
  await other.dispose();
});

test('收入中断持续三个月，奖金独立到账，复职后工资永久降至80%', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: '选择林舟' }).click();
  await page.getByRole('checkbox').check(); await page.getByRole('button', { name: '开始我的十二个月' }).click();
  await expect(page.getByTestId('cash-networth')).toBeVisible();
  const id = await page.evaluate(() => localStorage.getItem('life-run')); setTape(id!, { 3: { jobLoss: 0 } });
  const employment = page.getByRole('region', { name: '就业与收入' });
  for (let month = 1; month <= 7; month++) {
    await page.getByRole('button', { name: /揭晓下个月/ }).click();
    await expect(page.getByText(`已揭晓第 ${month} / 12 个月`, { exact: true })).toBeVisible();
    if (month >= 3 && month <= 5) {
      await expect(employment).toContainText('持续求职中');
      await expect(employment).toContainText('本月工资：¥0.00');
      await expect(employment).toContainText(`含本月还需停薪 ${6 - month} 个月`);
    }
    if (month === 4) {
      await expect(employment).toContainText('本月奖金：¥20,000.00');
      await expect(employment).toContainText('不代表工资恢复');
      await page.reload(); await expect(employment).toContainText('本月工资：¥0.00');
      await page.screenshot({ path: 'test-results/unemployed-bonus-desktop.png', fullPage: true });
    }
    if (month >= 6) {
      await expect(employment).toContainText('本月工资：¥14,400.00');
      if (month === 6) {
        await expect(page.getByText('找到一份新工作', { exact: true })).toBeVisible();
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({ path: 'test-results/reemployment-mobile.png', fullPage: true });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      }
    }
  }
});
