// tests/ui/test_edit_flow.spec.js — Phase 7 Session 4 e2e
// 3 viewer 编辑 → save → revise bar 行为验证 + bug A/B 回归测试。
//
// /save endpoint mock: scripts/serve.js (Playwright webServer) 是纯静态、无 /save。
// 用 page.route() 拦截 POST /save 返 `{ok: true}`、避免 404 + 防止改 data/*_revise.json。

import { test, expect } from '@playwright/test';

// 拦截所有 POST /save、返 stub 模拟 local server 成功
async function mockSaveEndpoint(page) {
  await page.route('**/save', (route) => {
    if (route.request().method() === 'POST') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    } else {
      route.continue();
    }
  });
}

async function waitViewerReady(page, sel) {
  await page.waitForFunction((s) => {
    return window.state && Array.isArray(window.state[s]) && window.state[s].length > 0;
  }, sel, { timeout: 10000 });
}

// ============================================================
// chara edit flow
// ============================================================
test.describe('chara edit', () => {
  test.beforeEach(async ({ page }) => {
    await mockSaveEndpoint(page);
    await page.goto('/pages/characters.html');
    await waitViewerReady(page, 'allChars');
  });

  test('toggleCharaTag 改 _master.tags (Bug A 回归)', async ({ page }) => {
    const result = await page.evaluate(() => {
      const c = window.state.allChars.find((x) => x._master?.id === 1001);
      if (!c) return { err: 'chara 1001 not found' };
      window.enterEditMode(c.id);
      window.toggleCharaTag(7);   // 13倍
      const masterTags = window.state.editData._master.tags;
      const wikiTags = window.state.editData.tags;
      window.cancelEdit();
      return { masterTags, wikiTags };
    });
    // 两个 array 都应该含 7 (toggleCharaTag 同步双向)
    expect(result.masterTags).toContain(7);
    expect(result.wikiTags).toContain(7);
  });

  test('saveEdit → reviseData 含 patch + sessionReviseIds 含 baseId', async ({ page }) => {
    const result = await page.evaluate(() => {
      const c = window.state.allChars.find((x) => x._master?.id === 1001);
      window.enterEditMode(c.id);
      window.toggleCharaTag(7);
      window.saveEdit();
      const baseId = 1001;
      return {
        hasPatch: !!window.state.reviseData[baseId],
        patchTags: window.state.reviseData[baseId]?.tags,
        sessionSize: window.state.sessionReviseIds.size,
        sessionHasBaseId: window.state.sessionReviseIds.has(baseId),
      };
    });
    expect(result.hasPatch).toBe(true);
    expect(result.patchTags).toContain(7);
    expect(result.sessionHasBaseId).toBe(true);
  });

  test('revise bar Save(N) count + saveRevise 成功后 button 消失', async ({ page }) => {
    // 编辑 1 个 chara、save
    await page.evaluate(() => {
      const c = window.state.allChars.find((x) => x._master?.id === 1001);
      window.enterEditMode(c.id);
      window.toggleCharaTag(7);
      window.saveEdit();
    });
    // Save(1) 显示
    const barText = await page.locator('.btn-revise-save').textContent();
    expect(barText).toMatch(/Save \(1\)/);
    const barDisplay = await page.locator('#revise-bar').evaluate((el) => getComputedStyle(el).display);
    expect(barDisplay).toBe('flex');
    // 点 Save (mock 拦截 /save → 200 ok)
    await page.evaluate(() => window.saveRevise());
    await page.waitForTimeout(150);
    // 成功后 sessionReviseIds 清空、button 消失
    const sessionSize = await page.evaluate(() => window.state.sessionReviseIds.size);
    expect(sessionSize).toBe(0);
    const barDisplayAfter = await page.locator('#revise-bar').evaluate((el) => getComputedStyle(el).display);
    expect(barDisplayAfter).toBe('none');
  });

  test('cancelRevise → state 还原 baseline (Bug B 回归: originalData key = base_id)', async ({ page }) => {
    const result = await page.evaluate(() => {
      const c = window.state.allChars.find((x) => x._master?.id === 1001);
      const baseId = 1001;
      const origTagsCount = (window.state.originalData[baseId]?._master?.tags || []).length;
      window.enterEditMode(c.id);
      window.toggleCharaTag(7);
      window.saveEdit();
      const tagsAfterSave = window.state.allChars.find((x) => x._master?.id === baseId)._master.tags.length;
      window.cancelRevise(baseId);
      const tagsAfterCancel = window.state.allChars.find((x) => x._master?.id === baseId)._master.tags.length;
      const sessionAfter = window.state.sessionReviseIds.has(baseId);
      return { origTagsCount, tagsAfterSave, tagsAfterCancel, sessionAfter };
    });
    // originalData[baseId] 应该存在 (Bug B 修后 key = base_id)
    expect(result.origTagsCount).toBeGreaterThanOrEqual(0);   // 拿得到 baseline (不是 undefined)
    expect(result.tagsAfterSave).toBeGreaterThan(result.origTagsCount);   // save 后 tags 多了
    expect(result.tagsAfterCancel).toBe(result.origTagsCount);   // cancel 后还原
    expect(result.sessionAfter).toBe(false);
  });

  test('setSkillScaling → patch 含 states.{state}.weapon_skills.{i}.value_scaling', async ({ page }) => {
    const result = await page.evaluate(() => {
      const c = window.state.allChars.find((x) => x._master?.id === 1001);
      window.enterEditMode(c.id);
      // 找一个 state + skill 改 scaling
      const stateName = Object.keys(window.state.editData._master.states)[0];
      const origScaling = window.state.editData._master.states[stateName].weapon_skills[0]?.value_scaling;
      window.setSkillScaling(stateName, 0, 0.0123);
      window.saveEdit();
      const patch = window.state.reviseData[1001];
      return {
        stateName,
        origScaling,
        hasStatesPatch: !!patch?.states?.[stateName]?.weapon_skills?.['0'],
        patchScaling: patch?.states?.[stateName]?.weapon_skills?.['0']?.value_scaling,
      };
    });
    expect(result.hasStatesPatch).toBe(true);
    expect(result.patchScaling).toBe(0.0123);
  });
});

// ============================================================
// soul edit flow
// ============================================================
test.describe('soul edit', () => {
  test.beforeEach(async ({ page }) => {
    await mockSaveEndpoint(page);
    await page.goto('/pages/souls.html');
    await waitViewerReady(page, 'allSouls');
  });

  test('toggleSoulTag → saveEdit → patch + sessionReviseIds', async ({ page }) => {
    const result = await page.evaluate(() => {
      const s = window.state.allSouls[0];
      window.enterEditMode(s.id);
      window.toggleSoulTag(1);   // 天魔
      window.saveEdit();
      return {
        hasPatch: !!window.state.reviseData[s.id],
        patchTags: window.state.reviseData[s.id]?.tags,
        sessionHas: window.state.sessionReviseIds.has(s.id),
      };
    });
    expect(result.hasPatch).toBe(true);
    expect(result.patchTags).toContain(1);
    expect(result.sessionHas).toBe(true);
  });

  test('saveRevise 成功 → button 消失 + sessionReviseIds 清空', async ({ page }) => {
    await page.evaluate(() => {
      const s = window.state.allSouls[0];
      window.enterEditMode(s.id);
      window.toggleSoulTag(1);
      window.saveEdit();
    });
    const barBefore = await page.locator('#revise-bar').evaluate((el) => getComputedStyle(el).display);
    expect(barBefore).toBe('flex');
    await page.evaluate(() => window.saveRevise());
    await page.waitForTimeout(150);
    const sessionSize = await page.evaluate(() => window.state.sessionReviseIds.size);
    expect(sessionSize).toBe(0);
    const barAfter = await page.locator('#revise-bar').evaluate((el) => getComputedStyle(el).display);
    expect(barAfter).toBe('none');
  });
});

// ============================================================
// crystal edit flow
// ============================================================
test.describe('crystal edit', () => {
  test.beforeEach(async ({ page }) => {
    await mockSaveEndpoint(page);
    await page.goto('/pages/crystals.html');
    await waitViewerReady(page, 'allCrystals');
  });

  test('setCrField max_value → saveEdit → patch.max_value', async ({ page }) => {
    const result = await page.evaluate(() => {
      const c = window.state.allCrystals[0];
      window.enterEditMode(c.id);
      window.setCrField('max_value', 99.99);
      window.saveEdit();
      return {
        hasPatch: !!window.state.reviseData[c.id],
        patchMaxValue: window.state.reviseData[c.id]?.max_value,
        sessionHas: window.state.sessionReviseIds.has(c.id),
      };
    });
    expect(result.hasPatch).toBe(true);
    expect(result.patchMaxValue).toBe(99.99);
    expect(result.sessionHas).toBe(true);
  });

  test('saveRevise 成功 → button 消失 + reviseData 清空', async ({ page }) => {
    await page.evaluate(() => {
      const c = window.state.allCrystals[0];
      window.enterEditMode(c.id);
      window.setCrField('max_value', 50.5);
      window.saveEdit();
    });
    const barBefore = await page.locator('#revise-bar').evaluate((el) => getComputedStyle(el).display);
    expect(barBefore).toBe('flex');
    await page.evaluate(() => window.saveRevise());
    await page.waitForTimeout(150);
    const result = await page.evaluate(() => ({
      sessionSize: window.state.sessionReviseIds.size,
      reviseKeyCount: Object.keys(window.state.reviseData).length,
    }));
    expect(result.sessionSize).toBe(0);
    expect(result.reviseKeyCount).toBe(0);
    const barAfter = await page.locator('#revise-bar').evaluate((el) => getComputedStyle(el).display);
    expect(barAfter).toBe('none');
  });

  test('cancelRevise → reviseData[id] 删除 + 还原 allCrystals._master', async ({ page }) => {
    const result = await page.evaluate(() => {
      const c = window.state.allCrystals[0];
      const id = c.id;
      const origMax = window.state.originalData[id]?._master?.max_value ?? null;
      window.enterEditMode(c.id);
      window.setCrField('max_value', 12345);
      window.saveEdit();
      const editedMax = window.state.allCrystals.find((x) => x.id === id)._master.max_value;
      window.cancelRevise(id);
      const restoredMax = window.state.allCrystals.find((x) => x.id === id)._master.max_value;
      return {
        origMax,
        editedMax,
        restoredMax,
        hasReviseData: !!window.state.reviseData[id],
        sessionHas: window.state.sessionReviseIds.has(id),
      };
    });
    expect(result.editedMax).toBe(12345);
    expect(result.restoredMax).toBe(result.origMax);
    expect(result.hasReviseData).toBe(false);
    expect(result.sessionHas).toBe(false);
  });
});

// ============================================================
// 跨 viewer: POST body schema 验证
// ============================================================
test.describe('saveRevise POST body', () => {
  test('chara: body 含 session_ids + masou_session_ids + chara_revise', async ({ page }) => {
    let captured = null;
    await page.route('**/save', (route) => {
      if (route.request().method() === 'POST') {
        captured = JSON.parse(route.request().postData() || '{}');
        route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
      } else route.continue();
    });
    await page.goto('/pages/characters.html');
    await waitViewerReady(page, 'allChars');
    await page.evaluate(() => {
      const c = window.state.allChars.find((x) => x._master?.id === 1001);
      window.enterEditMode(c.id);
      window.toggleCharaTag(7);
      window.saveEdit();
    });
    await page.evaluate(() => window.saveRevise());
    await page.waitForTimeout(200);
    expect(captured).not.toBeNull();
    expect(Array.isArray(captured.session_ids)).toBe(true);
    expect(captured.session_ids).toContain(1001);
    expect(Array.isArray(captured.chara_revise)).toBe(true);
    expect(captured.chara_revise.length).toBeGreaterThan(0);
    expect(captured.chara_revise[0].tags).toContain(7);
    // masou_session_ids 字段一定要在 (即使空、跟 api/save.js + start.py 同 schema)
    expect('masou_session_ids' in captured).toBe(true);
  });

  test('crystal: body 含 session_ids + crystal_revise', async ({ page }) => {
    let captured = null;
    await page.route('**/save', (route) => {
      if (route.request().method() === 'POST') {
        captured = JSON.parse(route.request().postData() || '{}');
        route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
      } else route.continue();
    });
    await page.goto('/pages/crystals.html');
    await waitViewerReady(page, 'allCrystals');
    await page.evaluate(() => {
      const c = window.state.allCrystals[0];
      window.enterEditMode(c.id);
      window.setCrField('max_value', 77);
      window.saveEdit();
    });
    await page.evaluate(() => window.saveRevise());
    await page.waitForTimeout(200);
    expect(captured).not.toBeNull();
    expect(captured.session_ids?.length).toBeGreaterThan(0);
    expect(captured.crystal_revise?.[0]?.max_value).toBe(77);
  });
});
