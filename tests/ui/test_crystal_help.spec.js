import { test, expect } from '@playwright/test';

test('結晶 説明: ? で中央 modal 開閉 / 画面内に収まる', async ({ page }) => {
  await page.goto('/pages/crystals.html');
  await page.waitForFunction(() => window.state?.allCrystals?.length > 0);

  const btn = page.locator('#cr-help-btn');
  const modal = page.locator('#cr-help-modal');
  const panel = page.locator('#cr-help-modal .ce-modal-content');

  await expect(btn).toBeVisible();
  await expect(modal).toBeHidden();

  await btn.click();
  await expect(modal).toBeVisible();
  await expect(panel).toContainText('効果値');
  await expect(panel).toContainText('M(Lv)');
  await expect(panel).toContainText('M(重量)');
  await expect(panel).toContainText('M(純度)');
  await expect(panel).toContainText('最大値');

  // 画面内に完全に収まる (popover 版はここで上にはみ出していた)
  const vp = page.viewportSize();
  const r = await panel.boundingBox();
  expect(r.y).toBeGreaterThanOrEqual(0);
  expect(r.x).toBeGreaterThanOrEqual(0);
  expect(r.y + r.height).toBeLessThanOrEqual(vp.height + 1);
  expect(r.x + r.width).toBeLessThanOrEqual(vp.width + 1);
  // 中央に出る (基準は実際の centering container = #cr-help-modal。
  //  viewportSize() はスクロールバー幅を含むので直接比べると半分ずれる)
  const c = await modal.boundingBox();
  expect(Math.abs(r.x + r.width / 2 - (c.x + c.width / 2))).toBeLessThan(2);
  expect(Math.abs(r.y + r.height / 2 - (c.y + c.height / 2))).toBeLessThan(2);

  // × で閉じる
  await page.locator('#cr-help-modal .ce-modal-close').click();
  await expect(modal).toBeHidden();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');

  // overlay クリックで閉じる
  await btn.click();
  await expect(modal).toBeVisible();
  await page.locator('#cr-help-modal .ce-modal-overlay').click({ position: { x: 5, y: 5 } });
  await expect(modal).toBeHidden();
});

test('結晶 説明: 狭い画面でも ? が押せて modal が収まる', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto('/pages/crystals.html');
  await page.waitForFunction(() => window.state?.allCrystals?.length > 0);

  const btn = page.locator('#cr-help-btn');
  await expect(btn).toBeVisible();
  await btn.click();
  const panel = page.locator('#cr-help-modal .ce-modal-content');
  await expect(panel).toBeVisible();
  const r = await panel.boundingBox();
  expect(r.x).toBeGreaterThanOrEqual(0);
  expect(r.y).toBeGreaterThanOrEqual(0);
  expect(r.x + r.width).toBeLessThanOrEqual(390 + 1);
  expect(r.y + r.height).toBeLessThanOrEqual(780 + 1);
});

test('結晶 説明: 検索入力は壊れていない', async ({ page }) => {
  await page.goto('/pages/crystals.html');
  await page.waitForFunction(() => window.state?.allCrystals?.length > 0);
  const before = await page.locator('#crystal-count').textContent();
  await page.fill('#search', 'アタック');
  await expect(page.locator('#crystal-count')).not.toHaveText(before);
});
