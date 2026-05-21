import { test, expect } from '@playwright/test';
import { attachPageErrorWatcher, mockSaveEndpoints, captureSaveEndpoint } from './helpers.js';

test.describe('crystals viewer smoke', () => {
  test('load + list 渲染 + 无 JS error + key API 暴露', async ({ page }) => {
    const errors = attachPageErrorWatcher(page);
    await mockSaveEndpoints(page);

    await page.goto('/pages/crystals.html');
    await page.waitForSelector('.crystal-row', { timeout: 15000 });

    const count = await page.locator('.crystal-row').count();
    expect(count).toBeGreaterThan(0);

    const apis = await page.evaluate(() => ({
      hasState: !!window.state,
      hasAllCrystals:
        Array.isArray(window.state?.allCrystals) && window.state.allCrystals.length > 0,
      hasOriginalData: typeof window.state?.originalData === 'object',
      enterEditMode: typeof window.enterEditMode === 'function',
      saveEdit: typeof window.saveEdit === 'function',
      saveRevise: typeof window.saveRevise === 'function',
    }));
    expect(apis.hasState).toBe(true);
    expect(apis.hasAllCrystals).toBe(true);
    expect(apis.hasOriginalData).toBe(true);
    expect(apis.enterEditMode).toBe(true);
    expect(apis.saveEdit).toBe(true);
    expect(apis.saveRevise).toBe(true);

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('enterEditMode → 改字段 → saveEdit → revise-bar → saveRevise → 清空', async ({ page }) => {
    const errors = attachPageErrorWatcher(page);
    await mockSaveEndpoints(page);

    await page.goto('/pages/crystals.html');
    await page.waitForSelector('.crystal-row', { timeout: 15000 });

    // 用第一个 crystal id 进 edit
    const firstId = await page.evaluate(() => window.state.allCrystals[0].id);
    // 先 toggleExpand 让 row.expanded（enterEditMode 假设 row 已存在）
    await page.evaluate((id) => {
      window.toggleExpand?.(id);
      window.enterEditMode(id);
    }, firstId);

    // 改一个无歧义字段：level_max +1
    await page.evaluate(() => {
      const cur = window.state.editData.level_max ?? 10;
      window.state.editData.level_max = cur === 10 ? 9 : 10;
      window.saveEdit();
    });

    await expect(page.locator('#revise-bar')).toBeVisible({ timeout: 3000 });
    const btnText = await page.locator('.btn-revise-save').textContent();
    expect(btnText).toMatch(/Save \(\d+\)/);

    await page.evaluate(() => window.saveRevise());
    await expect(page.locator('#revise-bar')).toBeHidden({ timeout: 3000 });

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('saveRevise → POST body 含 level_max 改动 (crystals_revise bucket)', async ({ page }) => {
    const errors = attachPageErrorWatcher(page);
    const captured = await captureSaveEndpoint(page);

    await page.goto('/pages/crystals.html');
    await page.waitForSelector('.crystal-row', { timeout: 15000 });

    const { id, newLevelMax } = await page.evaluate(() => {
      const id = window.state.allCrystals[0].id;
      window.toggleExpand?.(id);
      window.enterEditMode(id);
      const orig = window.state.editData.level_max ?? 10;
      const next = orig === 10 ? 9 : 10;
      window.state.editData.level_max = next;
      window.saveEdit();
      return { id, newLevelMax: next };
    });

    await page.evaluate(() => window.saveRevise());
    await expect(page.locator('#revise-bar')).toBeHidden({ timeout: 3000 });

    expect(captured.length).toBe(1);
    const body = captured[0];
    expect(body.session_ids).toContain(id);
    expect(Array.isArray(body.crystals_revise)).toBe(true);
    const entry = body.crystals_revise.find((e) => e.id === id);
    expect(entry).toBeDefined();
    expect(entry.level_max).toBe(newLevelMax);

    expect(errors, errors.join('\n')).toEqual([]);
  });
});
