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

  test('crystal slider: setCrystalDim 改 weight/purity/lv → state 同步 + stats refresh', async ({
    page,
  }) => {
    // setCrystalDim(si, ci, dim, val) 改完后：
    //   1. state.team[si].crystals[ci][dim] = val
    //   2. refreshAllStats 触发、#stats-panel-i 重渲（即使数字不变也要刷一次）
    // 不强求 stats 数字精确校验（要找 scope != 5 + weight_delta crystal 数据 没有），
    // 只验接口 + state 同步。
    const errors = attachPageErrorWatcher(page);
    await mockSaveEndpoints(page);

    await page.goto('/pages/hensei.html');
    await page.waitForFunction(
      () => typeof window.setChara === 'function' && Array.isArray(window.state?.team),
      null,
      { timeout: 15000 },
    );

    // 装 rarity=4 chara + 任意 crystal
    const setup = await page.evaluate(async () => {
      const charas = await fetch('../data/characters.json').then((r) => r.json());
      const c = charas.find((x) => x.rarity === 4 && x.states && !x.tombstone);
      if (!c) return null;
      window.setChara(0, c.id);
      // 装一个有 weight_delta 的 crystal（scope=5 没关系、weight slider 依然工作）
      const crystals = await fetch('../data/crystals.json').then((r) => r.json());
      const cr = crystals.find((x) => x.effects?.[0]?.weight_delta);
      if (!cr) return null;
      window.setCrystal(0, 0, cr.id);
      return { charaId: c.id, crystalId: cr.id };
    });
    expect(setup, 'setup fail').not.toBeNull();

    // 默认 weight=100
    const initWeight = await page.evaluate(() => window.state.team[0].crystals[0]?.weight);
    expect(initWeight).toBe(100);

    // setCrystalDim weight=50
    await page.evaluate(() => window.setCrystalDim(0, 0, 'weight', 50));
    const w50 = await page.evaluate(() => window.state.team[0].crystals[0]?.weight);
    expect(w50).toBe(50);

    // purity 也试
    await page.evaluate(() => window.setCrystalDim(0, 0, 'purity', 30));
    const p30 = await page.evaluate(() => window.state.team[0].crystals[0]?.purity);
    expect(p30).toBe(30);

    // lv（应当 clamp 到 cryLvMax）
    await page.evaluate(() => window.setCrystalDim(0, 0, 'lv', 1));
    const lv1 = await page.evaluate(() => window.state.team[0].crystals[0]?.lv);
    expect(lv1).toBe(1);

    // 边界：weight 上限 100、下限 0
    await page.evaluate(() => window.setCrystalDim(0, 0, 'weight', 200));
    const wOver = await page.evaluate(() => window.state.team[0].crystals[0]?.weight);
    expect(wOver).toBeLessThanOrEqual(100); // clamp 到 100

    await page.evaluate(() => window.setCrystalDim(0, 0, 'weight', -10));
    const wUnder = await page.evaluate(() => window.state.team[0].crystals[0]?.weight);
    expect(wUnder).toBeGreaterThanOrEqual(0); // clamp 到 0

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('scope=5 名前精确匹配 e2e (ティナ×ブレイドの秘録記憶 + ティナ×ブレイド)', async ({
    page,
  }) => {
    // crystal id 1025「ティナ×ブレイドの秘録記憶」effect: scope=5 + name="ティナ×ブレイド"
    //   bunrui=17 ダメ上限 / calc_type=1 add / bairitu=1300000000
    // stats-calc.js scope=5 用**精确等値匹配**（commit 975b381）：
    //   tgtChara.name === e.name 才应用 buff，substring 不应用
    // e2e 验证：
    //   - 装 chara name="ティナ×ブレイド" → ダメ上限 ≈ 2147483647 + 1300000000
    //   - 装其他不匹配 chara → ダメ上限 = 2147483647（base）
    const errors = attachPageErrorWatcher(page);
    await mockSaveEndpoints(page);

    await page.goto('/pages/hensei.html');
    await page.waitForFunction(
      () => typeof window.setChara === 'function' && Array.isArray(window.state?.team),
      null,
      { timeout: 15000 },
    );

    // 找 chara id：精确名「ティナ×ブレイド」+ 一个不匹配但 rarity=4 的
    const ids = await page.evaluate(async () => {
      const arr = await fetch('../data/characters.json').then((r) => r.json());
      const match = arr.find((x) => x.name === 'ティナ×ブレイド' && !x.tombstone);
      const other = arr.find(
        (x) => x.name !== 'ティナ×ブレイド' && x.rarity === 4 && x.states && !x.tombstone,
      );
      return { matchId: match?.id ?? null, otherId: other?.id ?? null };
    });
    expect(ids.matchId, '找不到 name=ティナ×ブレイド chara').not.toBeNull();
    expect(ids.otherId).not.toBeNull();

    // 找 ダメ上限 cell 在 stats panel 第几个 .stats-val（基于 _statsInner 显示顺序：
    // 攻撃力max / 攻撃力min / 防御力 / HP / BK / Hit数 / ダメ上限 = 第 7 个、index 6）
    const parseNum = (s) => +String(s).replace(/[,\s]/g, '') || 0;

    // 对比"同 chara 装 vs 不装 crystal"避免不同 chara 自带 skill 偏差。
    // 用 setCrystal(0, 0, null) 清结晶、ダメ上限 应回到该 chara 自身 base。

    const readDamage = async () =>
      parseNum((await page.locator('#stats-panel-0 .stats-val').nth(6).textContent()) || '');

    // match chara：装 crystal 跟不装 crystal 的差
    await page.evaluate((id) => {
      window.setChara(0, id);
      window.setCrystal(0, 0, null);
    }, ids.matchId);
    await expect(page.locator('#stats-panel-0')).toContainText('ダメ上限', { timeout: 3000 });
    const matchBase = await readDamage();

    await page.evaluate(() => window.setCrystal(0, 0, 1025));
    await page.waitForTimeout(200);
    const matchWithCrystal = await readDamage();
    const matchDelta = matchWithCrystal - matchBase;

    // unmatch chara：装 crystal 跟不装 crystal 的差
    await page.evaluate((id) => {
      window.setChara(0, id);
      window.setCrystal(0, 0, null);
    }, ids.otherId);
    await page.waitForTimeout(200);
    const unmatchBase = await readDamage();

    await page.evaluate(() => window.setCrystal(0, 0, 1025));
    await page.waitForTimeout(200);
    const unmatchWithCrystal = await readDamage();
    const unmatchDelta = unmatchWithCrystal - unmatchBase;

    // 关键 assert：
    //   match chara → crystal 1025 buff 应用、delta >= 1.3G
    //   unmatch chara → crystal 1025 buff 不应用、delta = 0
    expect(matchDelta).toBeGreaterThanOrEqual(1000000000); // 至少 1G 提升
    expect(unmatchDelta).toBe(0); // 不变

    expect(errors, errors.join('\n')).toEqual([]);
  });
});
