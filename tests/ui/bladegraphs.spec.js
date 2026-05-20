import { test, expect } from '@playwright/test';
import { attachPageErrorWatcher, mockSaveEndpoints } from './helpers.js';

test.describe('bladegraphs viewer smoke', () => {
  test('load + list 渲染 + 无 JS error + key API 暴露', async ({ page }) => {
    const errors = attachPageErrorWatcher(page);
    await mockSaveEndpoints(page);

    await page.goto('/pages/bladegraphs.html');
    await page.waitForSelector('.bg-row', { timeout: 15000 });

    const count = await page.locator('.bg-row').count();
    expect(count).toBeGreaterThan(0);

    const apis = await page.evaluate(() => ({
      hasState: !!window.state,
      hasAllBG: Array.isArray(window.state?.allBG) && window.state.allBG.length > 0,
      hasOriginalData: typeof window.state?.originalData === 'object',
      enterEditMode: typeof window.enterEditMode === 'function',
      saveEdit: typeof window.saveEdit === 'function',
      saveRevise: typeof window.saveRevise === 'function',
    }));
    expect(apis.hasState).toBe(true);
    expect(apis.hasAllBG).toBe(true);
    expect(apis.hasOriginalData).toBe(true);
    expect(apis.enterEditMode).toBe(true);
    expect(apis.saveEdit).toBe(true);
    expect(apis.saveRevise).toBe(true);

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('enterEditMode → 改字段 → saveEdit → revise-bar → saveRevise → 清空', async ({ page }) => {
    const errors = attachPageErrorWatcher(page);
    await mockSaveEndpoints(page);

    await page.goto('/pages/bladegraphs.html');
    await page.waitForSelector('.bg-row', { timeout: 15000 });

    const firstId = await page.evaluate(() => window.state.allBG[0].id);
    await page.evaluate((id) => {
      window.toggleExpand?.(id);
      window.enterEditMode(id);
    }, firstId);

    // bg rarity 翻转
    await page.evaluate(() => {
      const cur = window.state.editData.rarity ?? 4;
      window.state.editData.rarity = cur === 4 ? 3 : 4;
      window.saveEdit();
    });

    await expect(page.locator('#revise-bar')).toBeVisible({ timeout: 3000 });
    const btnText = await page.locator('.btn-revise-save').textContent();
    expect(btnText).toMatch(/Save \(\d+\)/);

    await page.evaluate(() => window.saveRevise());
    await expect(page.locator('#revise-bar')).toBeHidden({ timeout: 3000 });

    expect(errors, errors.join('\n')).toEqual([]);
  });
});
