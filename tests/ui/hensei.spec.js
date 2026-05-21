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

  test('enemy.bk 切换：騎槍 chara + ドキドキドクター 結晶 → 攻撃力 ×12', async ({ page }) => {
    // 復刻 user 之前手动验过的 case：ドキドキドクター (crystal id 1367)
    // effect: bunrui=[1] 攻撃力 / scope=3 自身 + weapon=8 騎槍 / condition=4 BK状態時 /
    //         calc_type=0 mult / bairitu=4
    // BK=false → factor=0 → eff=(4-1)*0+1=1 → 結晶不生效
    // BK=true  → factor=1 → eff=(4-1)*1+1=4 → 結晶 ×4
    //          + Stage 4 enemy.bk 自身 ×3.0 (normal mode、stats-calc.js Stage 4b)
    //          → 总效果 ×12
    const errors = attachPageErrorWatcher(page);
    await mockSaveEndpoints(page);

    await page.goto('/pages/hensei.html');
    await page.waitForFunction(
      () => typeof window.setChara === 'function' && Array.isArray(window.state?.team),
      null,
      { timeout: 15000 },
    );
    await page.waitForFunction(() => typeof window.setEnemyBk === 'function', null, {
      timeout: 5000,
    });

    // 找一个 weapon=8（騎槍）+ rarity=4 chara
    const charaId = await page.evaluate(async () => {
      const arr = await fetch('../data/characters.json').then((r) => r.json());
      const c = arr.find((x) => x.weapon === 8 && x.rarity === 4 && x.states && !x.tombstone);
      return c?.id ?? null;
    });
    expect(charaId, '找不到 weapon=8 騎槍 rarity=4 chara').not.toBeNull();

    // 装 chara 到 slot 0
    await page.evaluate((id) => window.setChara(0, id), charaId);
    await expect(page.locator('#stats-panel-0')).toContainText('攻撃力max', { timeout: 3000 });

    // 验证 crystal 1367 在 crystals.json
    const crystalOk = await page.evaluate(async () => {
      const arr = await fetch('../data/crystals.json').then((r) => r.json());
      return !!arr.find((x) => x.id === 1367);
    });
    expect(crystalOk, 'crystals.json 不含 id 1367 ドキドキドクター').toBe(true);

    // 装 結晶 1367 到 slot 0 crystals[0]
    await page.evaluate(() => window.setCrystal(0, 0, 1367));

    const parseNum = (s) => +String(s).replace(/[,\s]/g, '') || 0;

    // BK=false（默认）→ 攻撃力 X1
    const atkBefore = parseNum(
      (await page.locator('#stats-panel-0 .stats-val').first().textContent()) || '0',
    );
    expect(atkBefore).toBeGreaterThan(0);

    // 切 BK=true、等 refresh
    await page.evaluate(() => window.setEnemyBk(true));
    await page.waitForTimeout(200); // refresh 是同步 dom 替换、给个微间隔确保

    const atkAfter = parseNum(
      (await page.locator('#stats-panel-0 .stats-val').first().textContent()) || '0',
    );

    // 期望 atkAfter ≈ 12 × atkBefore（结晶 ×4 × Stage 4 BK ×3）
    expect(atkAfter).toBeGreaterThan(atkBefore * 11);
    expect(atkAfter).toBeLessThan(atkBefore * 13);

    expect(errors, errors.join('\n')).toEqual([]);
  });
});
