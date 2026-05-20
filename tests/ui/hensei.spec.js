import { test, expect } from '@playwright/test';
import { attachPageErrorWatcher, mockSaveEndpoints } from './helpers.js';

test.describe('hensei viewer smoke', () => {
  test('load + key API + 3 slots 容器', async ({ page }) => {
    const errors = attachPageErrorWatcher(page);
    await mockSaveEndpoints(page);

    await page.goto('/pages/hensei.html');
    await page.waitForSelector('#slot-0', { timeout: 15000 });

    // 3 个 slot 容器都存在
    await expect(page.locator('#slot-0')).toBeVisible();
    await expect(page.locator('#slot-1')).toBeVisible();
    await expect(page.locator('#slot-2')).toBeVisible();

    // 等数据 fetch 完成 — 通过 setChara 函数 ready + state.team[0].chara=null 推断
    await page.waitForFunction(
      () => typeof window.setChara === 'function' && Array.isArray(window.state?.team),
      null,
      { timeout: 15000 },
    );

    const apis = await page.evaluate(() => ({
      hasTeam: Array.isArray(window.state?.team) && window.state.team.length === 3,
      setChara: typeof window.setChara === 'function',
      setSoul: typeof window.setSoul === 'function',
      setBG: typeof window.setBG === 'function',
      setCrystal: typeof window.setCrystal === 'function',
      computeStats: typeof window.computeStats === 'function',
      refreshAllStats: typeof window.refreshAllStats === 'function',
    }));
    expect(apis.hasTeam).toBe(true);
    expect(apis.setChara).toBe(true);
    expect(apis.setSoul).toBe(true);
    expect(apis.setBG).toBe(true);
    expect(apis.setCrystal).toBe(true);
    expect(apis.computeStats).toBe(true);
    expect(apis.refreshAllStats).toBe(true);

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('装 chara 到 slot 0 → stats panel 显示非 0 攻击力', async ({ page }) => {
    const errors = attachPageErrorWatcher(page);
    await mockSaveEndpoints(page);

    await page.goto('/pages/hensei.html');
    await page.waitForFunction(
      () => typeof window.setChara === 'function' && Array.isArray(window.state?.team),
      null,
      { timeout: 15000 },
    );

    // 拿一个 rarity=4 + 有 states 的 chara — spec 直接 fetch JSON（hensei 不 expose allCharas）
    const charaId = await page.evaluate(async () => {
      const arr = await fetch('../data/characters.json').then((r) => r.json());
      const c = arr.find((x) => x.rarity === 4 && x.states && !x.tombstone);
      return c?.id ?? null;
    });
    expect(charaId).not.toBeNull();

    await page.evaluate((id) => window.setChara(0, id), charaId);

    // setChara 内部 refreshAllStats → #stats-panel-0 重渲染
    await expect(page.locator('#stats-panel-0')).toContainText('攻撃力max', { timeout: 3000 });

    // 从 DOM 读 stats — 攻撃力max + HP > 0（slot-0 第 1 和第 4 个 .stats-val）
    const statVals = await page.locator('#stats-panel-0 .stats-val').allTextContents();
    expect(statVals.length).toBeGreaterThanOrEqual(5);
    const parseNum = (s) => +String(s).replace(/[,\s]/g, '') || 0;
    expect(parseNum(statVals[0])).toBeGreaterThan(0); // 攻撃力max
    expect(parseNum(statVals[3])).toBeGreaterThan(0); // HP

    expect(errors, errors.join('\n')).toEqual([]);
  });
});
