import { test, expect } from '@playwright/test';
import { attachPageErrorWatcher, mockSaveEndpoints, captureSaveEndpoint } from './helpers.js';

test.describe('characters viewer smoke', () => {
  test('load + list 渲染 + 无 JS error + key API 暴露', async ({ page }) => {
    const errors = attachPageErrorWatcher(page);
    await mockSaveEndpoints(page);

    await page.goto('/pages/characters.html');
    // 等列表渲染（fetch + deepApply 串行链、给足时间）
    await page.waitForSelector('.char-item', { timeout: 15000 });

    const count = await page.locator('.char-item').count();
    expect(count).toBeGreaterThan(0);

    // window.state + 关键 API 暴露
    const apis = await page.evaluate(() => ({
      hasState: !!window.state,
      hasAllChars: Array.isArray(window.state?.allChars) && window.state.allChars.length > 0,
      hasOriginalData: typeof window.state?.originalData === 'object',
      hasAllMasou: Array.isArray(window.state?.allMasou),
      hasMasouOriginalData: typeof window.state?.masouOriginalData === 'object',
      enterEditMode: typeof window.enterEditMode === 'function',
      saveEdit: typeof window.saveEdit === 'function',
      saveRevise: typeof window.saveRevise === 'function',
    }));
    expect(apis.hasState).toBe(true);
    expect(apis.hasAllChars).toBe(true);
    expect(apis.hasOriginalData).toBe(true);
    expect(apis.hasAllMasou).toBe(true);
    expect(apis.hasMasouOriginalData).toBe(true);
    expect(apis.enterEditMode).toBe(true);
    expect(apis.saveEdit).toBe(true);
    expect(apis.saveRevise).toBe(true);

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('点 first row → detail 渲染 → enterEditMode → save → revise-bar 显示', async ({ page }) => {
    const errors = attachPageErrorWatcher(page);
    await mockSaveEndpoints(page);

    await page.goto('/pages/characters.html');
    await page.waitForSelector('.char-item', { timeout: 15000 });

    // 第一行点击 → detail 渲染
    await page.locator('.char-item').first().click();
    await page.waitForSelector('#chara-detail .chara-header', { timeout: 5000 });

    // 拿到当前 selectedId、enterEditMode + saveEdit
    // edit 不实际改字段（不需要触发 diff），目的只是验流程不破
    await page.evaluate(() => {
      const id = window.state.selectedId;
      window.enterEditMode(id);
    });
    await page.waitForSelector('.edit-mode-active', { timeout: 5000 });

    // 改一个无意义改动让 sessionChanged=true：手动改 editData.rarity
    // 然后调 saveEdit
    await page.evaluate(() => {
      const orig = window.state.editData.rarity;
      // 翻转一下、再翻回去——会被 computeDiff 撤回成 empty，不入 revise
      // 所以改成一个真正不同的值：rarity +1 然后还原也不行（撤回 nullify）
      // 直接 +1 留住差异
      window.state.editData.rarity = orig === 4 ? 3 : 4;
      window.saveEdit();
    });

    // sessionReviseIds.add(id) → updateReviseBar() → btn-revise-save 显示
    await expect(page.locator('#revise-bar')).toBeVisible({ timeout: 3000 });
    const btnText = await page.locator('.btn-revise-save').textContent();
    expect(btnText).toMatch(/Save \(\d+\)/);

    // saveRevise() — mocked endpoint 返回 ok
    await page.evaluate(() => window.saveRevise());
    // saveRevise 后 sessionReviseIds.clear() → revise-bar 重新 hidden
    await expect(page.locator('#revise-bar')).toBeHidden({ timeout: 3000 });

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('saveRevise → POST body 含 rarity 改动 (revise bucket)', async ({ page }) => {
    const errors = attachPageErrorWatcher(page);
    const captured = await captureSaveEndpoint(page);

    await page.goto('/pages/characters.html');
    await page.waitForSelector('.char-item', { timeout: 15000 });
    await page.locator('.char-item').first().click();
    await page.waitForSelector('#chara-detail .chara-header', { timeout: 5000 });

    const { id, name, origRarity, newRarity } = await page.evaluate(() => {
      const id = window.state.selectedId;
      window.enterEditMode(id);
      const orig = window.state.editData.rarity;
      const next = orig === 4 ? 3 : 4;
      window.state.editData.rarity = next;
      window.saveEdit();
      return { id, name: window.state.editData?.name ?? null, origRarity: orig, newRarity: next };
    });

    await page.evaluate(() => window.saveRevise());
    await expect(page.locator('#revise-bar')).toBeHidden({ timeout: 3000 });

    expect(captured.length).toBe(1);
    const body = captured[0];
    expect(body.session_ids).toContain(id);
    expect(Array.isArray(body.revise)).toBe(true);
    const entry = body.revise.find((e) => e.id === id);
    expect(entry).toBeDefined();
    expect(entry.rarity).toBe(newRarity);
    expect(entry.id).toBe(id);
    // metadata 字段也带（chara 的 entry 有 id + name）
    if (name) expect(entry.name).toBe(name);

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('撤回 e2e：改 rarity → 改回 base → POST body emit null (撤回标记)', async ({ page }) => {
    const errors = attachPageErrorWatcher(page);
    const captured = await captureSaveEndpoint(page);

    await page.goto('/pages/characters.html');
    await page.waitForSelector('.char-item', { timeout: 15000 });
    await page.locator('.char-item').first().click();
    await page.waitForSelector('#chara-detail .chara-header', { timeout: 5000 });

    // 第一步：rarity base → newRarity、saveRevise 验 entry 含 rarity=newRarity
    const { id, origRarity, newRarity } = await page.evaluate(() => {
      const id = window.state.selectedId;
      window.enterEditMode(id);
      const orig = window.state.editData.rarity;
      const next = orig === 4 ? 3 : 4;
      window.state.editData.rarity = next;
      window.saveEdit();
      return { id, origRarity: orig, newRarity: next };
    });
    await page.evaluate(() => window.saveRevise());
    await expect(page.locator('#revise-bar')).toBeHidden({ timeout: 3000 });

    expect(captured.length).toBe(1);
    const firstEntry = captured[0].revise.find((e) => e.id === id);
    expect(firstEntry.rarity).toBe(newRarity);

    // 第二步：改回 base（origRarity） → saveEdit + saveRevise → body 应含 rarity:null（撤回标记）
    await page.evaluate(
      ({ id, orig }) => {
        window.enterEditMode(id);
        window.state.editData.rarity = orig;
        window.saveEdit();
      },
      { id, orig: origRarity },
    );
    await page.evaluate(() => window.saveRevise());
    await expect(page.locator('#revise-bar')).toBeHidden({ timeout: 3000 });

    expect(captured.length).toBe(2);
    const secondEntry = captured[1].revise.find((e) => e.id === id);
    expect(secondEntry).toBeDefined();
    // prev-revise pattern：改回 base → diff emit rarity=null
    expect(secondEntry.rarity).toBeNull();

    expect(errors, errors.join('\n')).toEqual([]);
  });
});
