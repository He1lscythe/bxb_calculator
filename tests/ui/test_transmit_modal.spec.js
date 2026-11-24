// tests/ui/test_transmit_modal.spec.js — characters 伝承ボーナス弹窗 (js/transmit.js) e2e
// + 选择器弹窗通用样式 (shared.css) 在 hensei / characters 两边都生效

import { test, expect } from '@playwright/test';

const HAJIMARI = 1698; // 实测:メビウス / リコさまちゃん = 無限円環
const RIKO = 1675;
const HAKUBI = 1702; // 未検証 里稀有度混杂 (筛选用)

async function openChara(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/pages/characters.html');
  await page.waitForFunction(
    () => window.state?.allChars?.length > 0 && window.state.transmit,
    null,
    { timeout: 10000 },
  );
  return errors;
}

const variantOf = (page, base) =>
  page.evaluate((b) => window.state.allChars.find((c) => c.sort_id === b)?.id, base);

// 详情页点「伝承」按钮开弹窗
async function openViaButton(page, base) {
  const vid = await variantOf(page, base);
  await page.evaluate((id) => window.selectChar(id), vid);
  await page.locator('#chara-detail .btn-transmit').click();
  await expect(page.locator('#transmit-modal')).toHaveClass(/open/);
}

const tabCount = async (page, tab) => {
  const t = await page.locator(`#tm-sidebar [data-tab="${tab}"]`).textContent();
  return parseInt(t.replace(/\D/g, ''), 10);
};
const listCount = async (page) =>
  parseInt((await page.locator('#tm-count').textContent()).replace(/\D/g, ''), 10);

test('开弹窗:标题带伝承先名、默认 あり tab、无页面报错', async ({ page }) => {
  const errors = await openChara(page);
  await openViaButton(page, HAJIMARI);
  const name = await page.evaluate(
    (b) => window.state.allChars.find((c) => c.sort_id === b).name,
    HAJIMARI,
  );
  await expect(page.locator('#tm-title')).toContainText(name);
  await expect(page.locator('#tm-sidebar [data-tab="bonus"]')).toHaveClass(/on/);
  expect(errors, errors.join('\n')).toHaveLength(0);
});

test('没有 bonus 的魔剣也有 伝承 按钮、あり 0 → 該当なし', async ({ page }) => {
  await openChara(page);
  const noBonus = await page.evaluate(() => {
    const tm = window.state.transmit;
    const cell = (a, b) => {
      let i = a - tm.base;
      let j = b - tm.base;
      if (i < j) [i, j] = [j, i];
      return j < 0 || i >= tm.n ? 1 : tm.tri[(i * (i + 1)) / 2 + j];
    };
    const ids = window.state.allChars.map((c) => c.sort_id);
    return ids.find((t) => !ids.some((s) => s !== t && tm.sources.has(s) && cell(s, t) >= 2));
  });
  expect(noBonus).toBeTruthy();
  await openViaButton(page, noBonus);
  expect(await tabCount(page, 'bonus')).toBe(0);
  await expect(page.locator('#tm-no-results')).toBeVisible();
});

test('あり:实测 bonus 行 + 标记 + 计数一致', async ({ page }) => {
  await openChara(page);
  await openViaButton(page, HAJIMARI);
  const rows = page.locator('#tm-list .em-item');
  await expect(rows.first()).toBeVisible();
  const n = await tabCount(page, 'bonus');
  expect(n).toBeGreaterThanOrEqual(2);
  expect(await listCount(page)).toBe(n);
  await expect(rows).toHaveCount(n);
  const riko = rows.filter({ hasText: 'リコさまちゃん' });
  await expect(riko).toHaveCount(1);
  await expect(riko.locator('.tb-tag')).toContainText('無限円環 −1');
  await expect(riko.locator('.tb-inf-mark')).toHaveCount(0);
});

test('あり + 未検証 + なし = 能当伝承元的魔剣数 (不含自身)', async ({ page }) => {
  await openChara(page);
  await openViaButton(page, HAJIMARI);
  const bonus = await tabCount(page, 'bonus');
  const unknown = await tabCount(page, 'unknown');
  const none = parseInt(
    (await page.locator('#tm-sidebar .tb-none').textContent()).replace(/\D/g, ''),
    10,
  );
  const total = await page.evaluate((t) => {
    const tm = window.state.transmit;
    return window.state.allChars.filter((c) => c.sort_id !== t && tm.sources.has(c.sort_id)).length;
  }, HAJIMARI);
  expect(bonus + unknown + none).toBe(total);
});

test('未検証 tab:计数一致、无 bonus 标记、不含伝承先自身', async ({ page }) => {
  await openChara(page);
  await openViaButton(page, HAJIMARI);
  await page.locator('#tm-sidebar [data-tab="unknown"]').click();
  await expect(page.locator('#tm-sidebar [data-tab="unknown"]')).toHaveClass(/on/);
  const n = await tabCount(page, 'unknown');
  await expect.poll(() => listCount(page)).toBe(n);
  await expect(page.locator('#tm-list .tb-tag')).toHaveCount(0);
  const name = await page.evaluate(
    (b) => window.state.allChars.find((c) => c.sort_id === b).name,
    HAJIMARI,
  );
  await expect(
    page.locator('#tm-list .em-bg-name', { hasText: new RegExp(`^${name}$`) }),
  ).toHaveCount(0);
});

test('筛选:レア度 SS → 列表只剩 SS、件数变少;リセット 复原', async ({ page }) => {
  await openChara(page);
  await openViaButton(page, HAKUBI);
  await page.locator('#tm-sidebar [data-tab="unknown"]').click();
  const all = await tabCount(page, 'unknown');
  await expect.poll(() => listCount(page)).toBe(all);
  await page.locator('#tm-sidebar [data-fkey="rarity"][data-fval="4"]').click();
  await expect.poll(() => listCount(page)).toBeLessThan(all);
  const rows = page.locator('#tm-list .em-item');
  const visible = await rows.count();
  expect(visible).toBeGreaterThan(0);
  await expect(page.locator('#tm-list .em-item .badge.SS')).toHaveCount(visible);
  await page.locator('#tm-sidebar [data-reset]').click();
  await expect.poll(() => listCount(page)).toBe(all);
});

test('搜索:base_id 命中单把', async ({ page }) => {
  await openChara(page);
  await openViaButton(page, HAJIMARI);
  await page.locator('#tm-search').fill(String(RIKO));
  await expect.poll(() => listCount(page)).toBe(1);
  await expect(page.locator('#tm-list .em-bg-name')).toHaveText('リコさまちゃん');
});

test('推定:系列补齐的组合带「推定」标记', async ({ page }) => {
  await openChara(page);
  // inferred 里找一对:伝承元能当伝承元
  const pair = await page.evaluate(() => {
    const tm = window.state.transmit;
    const ids = new Set(window.state.allChars.map((c) => c.sort_id));
    for (const k of tm.inferred) {
      const a = Math.floor(k / 100000);
      const b = k % 100000;
      if (ids.has(a) && ids.has(b) && tm.sources.has(a)) return { src: a, dst: b };
      if (ids.has(a) && ids.has(b) && tm.sources.has(b)) return { src: b, dst: a };
    }
    return null;
  });
  expect(pair).toBeTruthy();
  await openViaButton(page, pair.dst);
  const srcName = await page.evaluate(
    (b) => window.state.allChars.find((c) => c.sort_id === b).name,
    pair.src,
  );
  await page.locator('#tm-search').fill(String(pair.src));
  const row = page.locator('#tm-list .em-item', { hasText: srcName });
  await expect(row).toHaveCount(1);
  await expect(row.locator('.tb-tag.tb-inf .tb-inf-mark')).toHaveText('推定');
});

test('詳細 → 关弹窗、跳到伝承元详情;Esc 关弹窗', async ({ page }) => {
  await openChara(page);
  await openViaButton(page, HAJIMARI);
  const riko = page.locator('#tm-list .em-item', { hasText: 'リコさまちゃん' });
  await riko.locator('.em-detail-btn').click();
  await expect(page.locator('#transmit-modal')).not.toHaveClass(/open/);
  const sel = await page.evaluate(() => window.state.selectedId);
  expect(sel).toBe(await variantOf(page, RIKO));
  await page.locator('#chara-detail .btn-transmit').click();
  await expect(page.locator('#transmit-modal')).toHaveClass(/open/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#transmit-modal')).not.toHaveClass(/open/);
});

// 选择器弹窗样式从 hensei.css 挪到 shared.css 后两边都要套上
const pickerStyle = (page, sidebarSel, listSel) =>
  page.evaluate(
    ([s, l]) => {
      const sb = getComputedStyle(document.querySelector(s));
      const li = getComputedStyle(document.querySelector(l));
      return { sbWidth: sb.width, sbDisplay: sb.display, listOverflow: li.overflowY };
    },
    [sidebarSel, listSel],
  );

test('样式:characters 伝承弹窗套上 shared.css 选择器样式', async ({ page }) => {
  await openChara(page);
  await openViaButton(page, HAJIMARI);
  expect(await pickerStyle(page, '#tm-sidebar', '#tm-list')).toEqual({
    sbWidth: '300px',
    sbDisplay: 'flex',
    listOverflow: 'auto',
  });
});

test('样式:hensei 魔剣选择弹窗不受影响', async ({ page }) => {
  await page.goto('/pages/hensei.html');
  await page.waitForFunction(() => typeof window.openEM === 'function', null, { timeout: 10000 });
  await page.evaluate(() => window.openEM(0, 'chara'));
  await expect(page.locator('#entity-modal')).toHaveClass(/open/);
  await expect(page.locator('#em-list .em-item').first()).toBeVisible();
  expect(await pickerStyle(page, '#em-sidebar', '#em-list')).toEqual({
    sbWidth: '300px',
    sbDisplay: 'flex',
    listOverflow: 'auto',
  });
});
