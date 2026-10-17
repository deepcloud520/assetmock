import { test, expect } from '@playwright/test';

test('目标规划 · 世界线对比：输入 → 一条世界线 → 剩下全部', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('你的财富概览', { exact: true })).toBeVisible();
  if (await page.getByRole('button', { name: '打开导航', exact: true }).isVisible()) await page.getByRole('button', { name: '打开导航', exact: true }).click();
  await page.getByRole('button', { name: '目标管家', exact: true }).click();
  await page.getByRole('button', { name: '世界线对比', exact: true }).click();

  // 第一段：确认输入
  await expect(page.getByText('这些是假设，不是预测。', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: /用这份底账/ })).toBeVisible();
  await page.getByRole('checkbox', { name: /我已核对/ }).check();
  await page.getByRole('button', { name: '开始推演' }).click();

  // 第二段：先看一条世界线（两条策略逐月对比）
  await expect(page.getByText('第二步 · 先看一条世界线')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.wl-sample svg')).toBeVisible();
  await page.screenshot({ path: 'test-results/worldline-sample.png', fullPage: true });

  // 第三段：剩下的世界线（占比 + 卡片 + 逐月图）
  await page.getByRole('button', { name: /看剩下的 \d+ 条世界线/ }).click();
  await expect(page.getByText(/在 \d+ 条模拟里/)).toBeVisible({ timeout: 60_000 });
  const cards = page.locator('.wl-card');
  await expect(cards.first()).toBeVisible();
  await cards.first().click();
  await expect(page.locator('.wl-card.is-open').first()).toBeVisible();
  await expect(page.locator('.wl-panel svg')).toHaveCount(2);
  await page.screenshot({ path: 'test-results/worldline.png', fullPage: true });
});

test('世界线对比在手机宽度下不横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?view=planning&planningTab=scenarios');
  await expect(page.getByText('这些是假设，不是预测。', { exact: false })).toBeVisible();
  await page.getByRole('checkbox', { name: /我已核对/ }).check();
  await page.getByRole('button', { name: '开始推演' }).click();
  await expect(page.getByText('第二步 · 先看一条世界线')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: /看剩下的 \d+ 条世界线/ }).click();
  await expect(page.getByText(/在 \d+ 条模拟里/)).toBeVisible({ timeout: 60_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/worldline-mobile.png', fullPage: true });
});
