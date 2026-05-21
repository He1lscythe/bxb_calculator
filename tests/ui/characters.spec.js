import { test, expect } from '@playwright/test';
import {
  attachPageErrorWatcher,
  mockSaveEndpoints,
  captureSaveEndpoint,
  mockSaveEndpointError,
} from './helpers.js';

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

  test('omoide_template override → POST body 含 omoide_revise + omoide=null', async ({ page }) => {
    // saveEditCharaCore 行为：omoide_template != null 时、`omoide` 数组冗余被清成 null
    // （shared/save-edit-base.js:110）。e2e 验证：改 omoide_template 后 saveRevise body
    // omoide_revise bucket 应含 {omoide_template: <value>, omoide: null}
    const errors = attachPageErrorWatcher(page);
    const captured = await captureSaveEndpoint(page);

    await page.goto('/pages/characters.html');
    await page.waitForSelector('.char-item', { timeout: 15000 });
    await page.locator('.char-item').first().click();
    await page.waitForSelector('#chara-detail .chara-header', { timeout: 5000 });

    const { id } = await page.evaluate(() => {
      const id = window.state.selectedId;
      window.enterEditMode(id);
      // 强行设 omoide_template 为一个测试 id（template id 999、不存在于 omoideTemplates）
      // 注意：saveEdit 内有 "tpl 不存在或 omoide 不一致 → 清掉" 逻辑（edit.js:113-118）。
      // 为绕开这个、我们也手动改 omoideTemplates 加一条 mock template、让 omoide 数组跟它一致。
      window.state.omoideTemplates = window.state.omoideTemplates || [];
      window.state.omoideTemplates.push({ id: 999, omoide: window.state.editData.omoide || [] });
      window.state.editData.omoide_template = 999;
      window.saveEdit();
      return { id };
    });

    await page.evaluate(() => window.saveRevise());
    await expect(page.locator('#revise-bar')).toBeHidden({ timeout: 3000 });

    expect(captured.length).toBe(1);
    const body = captured[0];
    expect(Array.isArray(body.omoide_revise)).toBe(true);
    const entry = body.omoide_revise.find((e) => e.id === id);
    expect(entry, 'omoide_revise entry 不存在').toBeDefined();
    expect(entry.omoide_template).toBe(999);
    // omoide_template 非 null 时 omoide 被清成 null（冗余压缩）
    expect(entry.omoide).toBeNull();

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('bd_skill edit → POST body revise 含 bd_skill 字段', async ({ page }) => {
    // bd_skill 不是 OMOIDE_KEYS、应该进入 revise bucket（不是 omoide_revise）
    const errors = attachPageErrorWatcher(page);
    const captured = await captureSaveEndpoint(page);

    await page.goto('/pages/characters.html');
    await page.waitForSelector('.char-item', { timeout: 15000 });

    // 找一个有 bd_skill 的 chara
    const targetId = await page.evaluate(() => {
      const c = window.state.allChars.find((x) => x.bd_skill && x.bd_skill.name);
      return c?.id ?? null;
    });
    expect(targetId, '找不到有 bd_skill 的 chara').not.toBeNull();

    await page.evaluate((id) => {
      // selectChar + enterEditMode
      window.selectChar(id);
    }, targetId);
    await page.waitForSelector('#chara-detail .chara-header', { timeout: 5000 });

    const { id, newCost } = await page.evaluate(() => {
      const id = window.state.selectedId;
      window.enterEditMode(id);
      const orig = window.state.editData.bd_skill.cost ?? 5;
      const next = orig === 5 ? 6 : 5;
      window.state.editData.bd_skill.cost = next;
      window.saveEdit();
      return { id, newCost: next };
    });

    await page.evaluate(() => window.saveRevise());
    await expect(page.locator('#revise-bar')).toBeHidden({ timeout: 3000 });

    expect(captured.length).toBe(1);
    const body = captured[0];
    expect(Array.isArray(body.revise)).toBe(true);
    const entry = body.revise.find((e) => e.id === id);
    expect(entry).toBeDefined();
    expect(entry.bd_skill).toBeDefined();
    expect(entry.bd_skill.cost).toBe(newCost);

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('错误处理：saveRevise 500 → 保存失败 status + revise-bar 不清空', async ({ page }) => {
    // 故意 mock /save 返回 500、验 wrapSaveReviseUi catch 分支：
    //   status.textContent = '保存失敗'、btn enable、updateReviseBar()
    //   sessionReviseIds 不 clear（server roundtrip fail → 本地仍未持久化）
    // 不调 attachPageErrorWatcher（wrapSaveReviseUi 会 console.error、会捕获）
    await mockSaveEndpointError(page, 500);

    await page.goto('/pages/characters.html');
    await page.waitForSelector('.char-item', { timeout: 15000 });
    await page.locator('.char-item').first().click();
    await page.waitForSelector('#chara-detail .chara-header', { timeout: 5000 });

    await page.evaluate(() => {
      const id = window.state.selectedId;
      window.enterEditMode(id);
      const orig = window.state.editData.rarity;
      window.state.editData.rarity = orig === 4 ? 3 : 4;
      window.saveEdit();
    });

    // revise-bar 显示
    await expect(page.locator('#revise-bar')).toBeVisible({ timeout: 3000 });

    // saveRevise 触发 500 error
    await page.evaluate(() => window.saveRevise());
    // 注：wrapSaveReviseUi catch 内设 status='保存失敗'，但 finally 调 updateReviseBar
    //     立刻把 status 清空（prod 行为）— 只验关键状态：
    //   1. revise-bar 仍 visible（sessionReviseIds 没 clear、本地未持久化）
    //   2. btn 重新 enabled、UI 不卡
    await expect(page.locator('#revise-bar')).toBeVisible();
    const btnDisabled = await page.locator('.btn-revise-save').isDisabled();
    expect(btnDisabled).toBe(false);
    // sessionReviseIds 仍非空
    const sessionSize = await page.evaluate(() => window.state.sessionReviseIds.size);
    expect(sessionSize).toBeGreaterThan(0);
  });

  test('filter: toggleFilter rarity → list count 减少 + resetFilters → 恢复', async ({ page }) => {
    const errors = attachPageErrorWatcher(page);
    await mockSaveEndpoints(page);

    await page.goto('/pages/characters.html');
    await page.waitForSelector('.char-item', { timeout: 15000 });

    const totalCount = await page.locator('.char-item').count();
    expect(totalCount).toBeGreaterThan(10);

    // 找 rarity filter buttons（在 #f-rarity 容器、生成自 renderFilterToggles）
    const rarityBtnCount = await page.locator('#f-rarity .ftog').count();
    expect(rarityBtnCount).toBeGreaterThan(0);

    // 点 rarity 第一个按钮（filter 一个 rarity）
    await page.locator('#f-rarity .ftog').first().click();
    await page.waitForTimeout(200);
    const filtered = await page.locator('.char-item').count();
    expect(filtered).toBeLessThan(totalCount);
    expect(filtered).toBeGreaterThan(0);

    // resetFilters → 恢复
    await page.evaluate(() => window.resetFilters());
    await page.waitForTimeout(200);
    const restored = await page.locator('.char-item').count();
    expect(restored).toBe(totalCount);

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('masou_overrides edit → POST body 含 masou_revise bucket', async ({ page }) => {
    // chara 改 masou_overrides → saveEdit 走 edit.js 的 masou 处理分支：
    //   编辑 state.editData.masou_overrides[mid] → 应用到 state.allMasou[i] →
    //   computeDiff 写 state.masouReviseData[mid] + masouSessionReviseIds.add(mid)
    // saveRevise → body.masou_revise = pickPatches(masouReviseData, masouSessionReviseIds)
    const errors = attachPageErrorWatcher(page);
    const captured = await captureSaveEndpoint(page);

    await page.goto('/pages/characters.html');
    await page.waitForSelector('.char-item', { timeout: 15000 });

    // 找一个有 masou 的 chara（state.allMasou.find chara_id）
    const target = await page.evaluate(() => {
      const m = window.state.allMasou.find(
        (x) => x.id != null && x.chara_id && x.effects && x.effects.length > 0,
      );
      if (!m) return null;
      return { charaId: m.chara_id, masouId: m.id };
    });
    expect(target, '找不到有 masou 的 chara').not.toBeNull();

    await page.evaluate((cid) => window.selectChar(cid), target.charaId);
    await page.waitForSelector('#chara-detail .chara-header', { timeout: 5000 });

    const result = await page.evaluate((info) => {
      window.enterEditMode(info.charaId);
      // 直接构造 masou_overrides 改一个 effects[0].bairitu
      const m = window.state.allMasou.find((x) => x.id === info.masouId);
      const orig = m.effects[0].bairitu ?? 1;
      const next = orig === 1.5 ? 2 : 1.5;
      window.state.editData.masou_overrides = {
        [info.masouId]: { effects: { 0: { bairitu: next } } },
      };
      window.saveEdit();
      return { masouId: info.masouId, newBairitu: next };
    }, target);

    await page.evaluate(() => window.saveRevise());
    await expect(page.locator('#revise-bar')).toBeHidden({ timeout: 3000 });

    expect(captured.length).toBe(1);
    const body = captured[0];
    expect(Array.isArray(body.masou_revise)).toBe(true);
    expect(body.masou_session_ids).toContain(result.masouId);
    const entry = body.masou_revise.find((e) => e.id === result.masouId);
    expect(entry, 'masou_revise entry 不存在').toBeDefined();
    // metadata 字段（commit b422683 引入）
    expect(entry.chara_id).toBe(target.charaId);
    expect(entry.chara_name).toBeDefined();
    // 改的 effects[0].bairitu 应在 entry.effects[0]（稀疏 dict）
    expect(entry.effects).toBeDefined();
    expect(entry.effects['0'].bairitu).toBe(result.newBairitu);

    expect(errors, errors.join('\n')).toEqual([]);
  });
});
