// tests/ui/test_effect_tags.spec.js — 効果 tag (分類 / scope / 発動条件) 的跨页面一致性
//
// 発動条件 tag 统一走 parameter-class.js 的 conditionTrigger(master parameter) + COND_TRIGGER_LABEL
// (0..5、含「倒れ」「敵ブレイク状態」),跟各 spec 的 condition_trigger filter 同一套 enum。
// 改造前显示侧读的是 adapter 产出的 e.condition (0..4):FellDown_ 被映射成 0、Enemy_Break* 不在
// 表里也落 0 → 全库 41 条 FellDown_ + 100 条 Enemy_Break* 的条件在 viewer 上整个看不见,
// 而 crystals/bladegraphs 的 filter 早就能按这两档筛 —— 同一个页面里筛得出来却不标。
//
// scope tag 同理补上 weapon_base_id → 「キャラ限」(結晶 328 / 心象結晶 67 / soul skill 243 条)。

import { test, expect } from '@playwright/test';

// #f-condition_trigger 里按 label 找 .ftog 按钮并点开
async function toggleCondFilter(page, label) {
  const btn = page.locator('#f-condition_trigger .ftog', { hasText: new RegExp(`^${label}$`) });
  await btn.click();
  await page.waitForTimeout(700);
}

// 可见行的 badge 文本（結晶行 = .badge.bunrui-sm 分類 + 条件）
async function rowBadges(page, limit = 5) {
  return page.evaluate((n) => {
    const rows = [];
    const seen = new Set();
    for (const bd of [...document.querySelectorAll('.badge.bunrui-sm')].slice(0, 40)) {
      const row = bd.closest('[class*="row"]') || bd.parentElement?.parentElement;
      if (!row || seen.has(row)) continue;
      seen.add(row);
      rows.push([...row.querySelectorAll('.badge.bunrui-sm')].map((s) => s.textContent));
      if (rows.length >= n) break;
    }
    return rows;
  }, limit);
}

test.describe('効果 tag', () => {
  // ★ 核心回归: filter 能筛出来的条件,行上必须标得出来
  for (const label of ['破損', '窮鼠', '倒れ', '敵ブレイク状態']) {
    test(`crystals: condition_trigger filter「${label}」→ 行にも同じ条件 badge`, async ({ page }) => {
      const errs = [];
      page.on('pageerror', (e) => errs.push(e.message));
      await page.goto('/pages/crystals.html');
      await page.waitForFunction(() => window.state?.allCrystals?.length > 0, { timeout: 15000 });
      await toggleCondFilter(page, label);

      const rows = await rowBadges(page);
      expect(rows.length, `filter「${label}」で 1 件も出ない`).toBeGreaterThan(0);
      // 絞り込んだ条件は、出てきた全行に badge として出ていること
      for (const badges of rows) expect(badges, JSON.stringify(rows)).toContain(label);
      expect(errs, errs.join('\n')).toHaveLength(0);
    });
  }

  test('crystals: weapon_base_id → キャラ限 badge (scope filter と揃う)', async ({ page }) => {
    await page.goto('/pages/crystals.html');
    await page.waitForFunction(() => window.state?.allCrystals?.length > 0, { timeout: 15000 });
    await page.fill('#search', '純真記憶');
    await page.waitForTimeout(800);
    const n = await page.locator('.badge.scope5').count();
    expect(n).toBeGreaterThan(0);
    // 样式は shared.css 側 (bladegraphs.css から移設) — 背景が付いていること
    const bg = await page.locator('.badge.scope5').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('characters: 詳細パネルに 倒れ / 敵ブレイク状態 が出る (chara 107701)', async ({ page }) => {
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto('/pages/characters.html');
    await page.waitForFunction(() => window.state?.allChars?.length > 0, { timeout: 15000 });
    await page.click('.char-item[data-id="107701"]');   // FellDown_Attack + Enemy_BreakAttack 持ち
    await page.waitForTimeout(600);
    const cond = await page.evaluate(() => [
      ...new Set([...document.querySelectorAll('#chara-detail .cond-tag')].map((x) => x.textContent)),
    ]);
    expect(cond).toContain('倒れ');
    expect(cond).toContain('敵ブレイク状態');
    expect(errs, errs.join('\n')).toHaveLength(0);
  });

  test('souls: 詳細パネルに 倒れ が出る + utils と soul-render の出力が一致', async ({ page }) => {
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto('/pages/souls.html');
    await page.waitForFunction(() => window.state?.allSouls?.length > 0, { timeout: 15000 });
    const id = await page.evaluate(() => {
      const s = window.state.allSouls.find((s) =>
        (s.skills || []).some((sk) => (sk.effects || [])[0]?._parameter?.startsWith('FellDown_')),
      );
      return s?.id ?? null;
    });
    expect(id).not.toBeNull();
    await page.evaluate((i) => document.querySelector(`[data-id="${i}"]`)?.click(), id);
    await page.waitForTimeout(600);
    const cond = await page.evaluate(() => [
      ...new Set([...document.querySelectorAll('.cond-tag')].map((x) => x.textContent)),
    ]);
    expect(cond).toContain('倒れ');

    // 同じ effect を 2 つの renderRightTags に食わせて出力一致を確認 (3 份实现が漂移してないこと)
    const same = await page.evaluate(async () => {
      const utils = await import('../js/utils.js');
      const soulR = await import('../js/soul-render.js');
      const txt = (h) =>
        [...new DOMParser().parseFromString('<d>' + h + '</d>', 'text/html').querySelectorAll('span')]
          .map((s) => s.textContent)
          .join(' ');
      const out = [];
      for (const s of window.state.allSouls.slice(0, 60)) {
        for (const sk of s.skills || []) {
          out.push([txt(utils.renderRightTags(sk)), txt(soulR.renderRightTags(sk))]);
        }
      }
      return out;
    });
    expect(same.length).toBeGreaterThan(20);
    for (const [a, c] of same) expect(c).toBe(a);
    expect(errs, errs.join('\n')).toHaveLength(0);
  });

  test('bladegraphs: 一覧が描画される + 無 pageerror', async ({ page }) => {
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto('/pages/bladegraphs.html');
    await page.waitForFunction(() => window.state?.allBG?.length > 0, { timeout: 15000 });
    await page.waitForTimeout(800);
    expect(await page.locator('.badge.bunrui-sm').count()).toBeGreaterThan(0);
    expect(errs, errs.join('\n')).toHaveLength(0);
  });
});
