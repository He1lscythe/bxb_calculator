import { test, expect } from '@playwright/test';
import { attachPageErrorWatcher, mockSaveEndpoints } from './helpers.js';

test.describe('souls viewer smoke', () => {
  test('load + list 渲染 + 无 JS error + key API 暴露', async ({ page }) => {
    const errors = attachPageErrorWatcher(page);
    await mockSaveEndpoints(page);

    await page.goto('/pages/souls.html');
    await page.waitForSelector('.soul-item', { timeout: 15000 });

    const count = await page.locator('.soul-item').count();
    expect(count).toBeGreaterThan(0);

    const apis = await page.evaluate(() => ({
      hasState: !!window.state,
      hasAllSouls: Array.isArray(window.state?.allSouls) && window.state.allSouls.length > 0,
      hasOriginalData: typeof window.state?.originalData === 'object',
      enterEditMode: typeof window.enterEditMode === 'function',
      saveEdit: typeof window.saveEdit === 'function',
      saveRevise: typeof window.saveRevise === 'function',
    }));
    expect(apis.hasState).toBe(true);
    expect(apis.hasAllSouls).toBe(true);
    expect(apis.hasOriginalData).toBe(true);
    expect(apis.enterEditMode).toBe(true);
    expect(apis.saveEdit).toBe(true);
    expect(apis.saveRevise).toBe(true);

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('select → enterEditMode → save → revise-bar → saveRevise', async ({ page }) => {
    const errors = attachPageErrorWatcher(page);
    await mockSaveEndpoints(page);

    await page.goto('/pages/souls.html');
    await page.waitForSelector('.soul-item', { timeout: 15000 });

    // 点 first soul → detail 渲染
    await page.locator('.soul-item').first().click();
    await page.waitForSelector('#soul-detail', { state: 'visible', timeout: 5000 });

    await page.evaluate(() => {
      const id = window.state.selectedId;
      window.enterEditMode(id);
    });
    // soul 没有 .edit-mode-active class、直接等 editData
    await page.waitForFunction(() => window.state.editData != null, null, { timeout: 5000 });

    await page.evaluate(() => {
      const cur = window.state.editData.rarity;
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
