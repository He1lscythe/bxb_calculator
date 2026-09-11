// tests/ui/test_crystal_ui.spec.js — 結晶ページの UI 細部 (説明 modal / 因子行)
import { test, expect } from '@playwright/test';

test('結晶 説明: ? で中央 modal 開閉 / 画面内に収まる', async ({ page }) => {
  await page.goto('/pages/crystals.html');
  await page.waitForFunction(() => window.state?.allCrystals?.length > 0);

  const btn = page.locator('#cr-help-btn');
  const modal = page.locator('#cr-help-modal');
  const panel = page.locator('#cr-help-modal .ce-modal-content');

  await expect(btn).toBeVisible();
  await expect(modal).toBeHidden();

  await btn.click();
  await expect(modal).toBeVisible();
  await expect(panel).toContainText('効果値');
  await expect(panel).toContainText('M(Lv)');
  await expect(panel).toContainText('M(重量)');
  await expect(panel).toContainText('M(純度)');
  await expect(panel).toContainText('最大値');

  // 画面内に完全に収まる (popover 版はここで上にはみ出していた)
  const vp = page.viewportSize();
  const r = await panel.boundingBox();
  expect(r.y).toBeGreaterThanOrEqual(0);
  expect(r.x).toBeGreaterThanOrEqual(0);
  expect(r.y + r.height).toBeLessThanOrEqual(vp.height + 1);
  expect(r.x + r.width).toBeLessThanOrEqual(vp.width + 1);
  // 中央に出る (基準は実際の centering container = #cr-help-modal。
  //  viewportSize() はスクロールバー幅を含むので直接比べると半分ずれる)
  const c = await modal.boundingBox();
  expect(Math.abs(r.x + r.width / 2 - (c.x + c.width / 2))).toBeLessThan(2);
  expect(Math.abs(r.y + r.height / 2 - (c.y + c.height / 2))).toBeLessThan(2);

  // × で閉じる
  await page.locator('#cr-help-modal .ce-modal-close').click();
  await expect(modal).toBeHidden();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');

  // overlay クリックで閉じる
  await btn.click();
  await expect(modal).toBeVisible();
  await page.locator('#cr-help-modal .ce-modal-overlay').click({ position: { x: 5, y: 5 } });
  await expect(modal).toBeHidden();
});

test('結晶 説明: 狭い画面でも ? が押せて modal が収まる', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto('/pages/crystals.html');
  await page.waitForFunction(() => window.state?.allCrystals?.length > 0);

  const btn = page.locator('#cr-help-btn');
  await expect(btn).toBeVisible();
  await btn.click();
  const panel = page.locator('#cr-help-modal .ce-modal-content');
  await expect(panel).toBeVisible();
  const r = await panel.boundingBox();
  expect(r.x).toBeGreaterThanOrEqual(0);
  expect(r.y).toBeGreaterThanOrEqual(0);
  expect(r.x + r.width).toBeLessThanOrEqual(390 + 1);
  expect(r.y + r.height).toBeLessThanOrEqual(780 + 1);
});

test('結晶 説明: 検索入力は壊れていない', async ({ page }) => {
  await page.goto('/pages/crystals.html');
  await page.waitForFunction(() => window.state?.allCrystals?.length > 0);
  const before = await page.locator('#crystal-count').textContent();
  await page.fill('#search', 'アタック');
  await expect(page.locator('#crystal-count')).not.toHaveText(before);
});

test('結晶 因子行: 先頭に初期値', async ({ page }) => {
  await page.goto('/pages/crystals.html');
  await page.waitForFunction(() => window.state?.allCrystals?.length > 0);

  // 適当な 1 件を展開
  await page.locator('.crystal-row .crystal-row-hd').first().click();
  const row = page.locator('.crystal-row.expanded').first();
  await expect(row).toBeVisible();

  // 因子 の field-row を取る
  const val = row.locator('.field-row', { has: page.locator('.field-key', { hasText: '因子' }) })
    .locator('.field-val');
  await expect(val).toBeVisible();
  const txt = (await val.innerText()).replace(/\s+/g, ' ').trim();

  // 初期値 が先頭 + Lv より前
  expect(txt.startsWith('初期値')).toBe(true);
  expect(txt.indexOf('初期値')).toBeLessThan(txt.indexOf('Lv'));

  // 値は master の initial_value と一致 (fmtLarge 3 桁)
  const expected = await row.evaluate((el) => {
    const id = +el.id.replace('row-', '');   // .crystal-row の id は row-<id>
    const c = window.state.allCrystals.find((x) => x.id === id);
    const n = c?._master?.initial_value;
    if (n == null) return '-';
    const a = Math.abs(n);
    if (a >= 1e8) return parseFloat((n / 1e8).toFixed(3)) + '億';
    if (a >= 1e4) return parseFloat((n / 1e4).toFixed(3)) + '万';
    return Number.isInteger(n) ? String(n) : parseFloat(n.toFixed(3)).toString();
  });
  expect(txt).toContain('初期値 ' + expected);
});

const open = async (page) => {
  await page.goto('/pages/crystals.html');
  await page.waitForFunction(() => window.state?.allCrystals?.length > 0);
};

// 三因子ぜんぶ設定済み + RemHP_* の結晶を探す (残HP が効くケース)
const findRemHp = (page) =>
  page.evaluate(() => {
    const c = window.state.allCrystals.find(
      (x) => (x._master?.parameter || '').startsWith('RemHP_')
        && x._master?.M_L_max != null && (x._master?.max_level || 1) > 1,
    );
    return c ? c.id : null;
  });

test('修正: id = の等号前後にスペース / ラベル 説明・効果・最大Lv', async ({ page }) => {
  await open(page);
  const id = await page.locator('.crystal-row').first().evaluate((el) => +el.id.replace('row-', ''));
  await page.evaluate((i) => window.enterEditMode(i), id);
  const body = page.locator(`#row-${id}`);
  await expect(body).toBeVisible();
  const txt = await body.innerText();
  expect(txt).toContain('id = ' + id);
  expect(txt).not.toContain('id=' + id);
  expect(txt).toContain('最大Lv');
  expect(txt).not.toContain('max_level');
  expect(txt).not.toContain('parameter');
});

test('修正: 効果 / 初期値 / 最大Lv が 1 行 (desktop) → 窄屏では 2 行', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page);
  const id = await page.locator('.crystal-row').first().evaluate((el) => +el.id.replace('row-', ''));
  await page.evaluate((i) => window.enterEditMode(i), id);
  const items = page.locator(`#row-${id} .ro-meta .ro-item`);
  await expect(items).toHaveCount(3);
  const tops = await items.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);            // desktop: 3 つ同じ行

  await page.setViewportSize({ width: 390, height: 780 });
  await page.waitForTimeout(150);
  const tops2 = await items.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops2).size).toBe(2);           // 窄屏: 効果 が 1 行 + 初期値/最大Lv が 1 行
  expect(tops2[1]).toBe(tops2[2]);               // 初期値 と 最大Lv は同じ行
});

// 针对「三个挤在一起」: desktop 各占 1/3、窄屏第二行 50/50。
// 顺带让 説明 和 効果 的 field-key 宽度一致、值的左端在一条线上。
test('修正 ro-meta: desktop 3 等分 / 窄屏 2 行目は 50/50 / 説明・効果 の左端が揃う', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page);
  const id = await page.locator('.crystal-row').first().evaluate((el) => +el.id.replace('row-', ''));
  await page.evaluate((i) => window.enterEditMode(i), id);

  const geo = () =>
    page.evaluate((i) => {
      const body = document.querySelector(`#row-${i} .crystal-edit-body`);
      const b = (el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, w: r.width };
      };
      const meta = body.querySelector('.ro-meta');
      const descRow = [...body.querySelectorAll('.field-row')].find((e) => !e.classList.contains('ro-meta'));
      return {
        meta: b(meta),
        descKey: b(descRow.querySelector('.field-key')),
        descVal: b(descRow.querySelector('.field-val')),
        items: [...meta.querySelectorAll('.ro-item')].map((it) => ({
          box: b(it),
          key: b(it.querySelector('.field-key')),
          val: b(it.querySelector('.edit-ro')),
        })),
      };
    }, id);

  const d = await geo();
  // 三等分 (算上 gap 把剩余宽度均分、x 也等间距)
  const ws = d.items.map((it) => it.box.w);
  expect(Math.max(...ws) - Math.min(...ws)).toBeLessThan(1.5);
  const step1 = d.items[1].box.x - d.items[0].box.x;
  const step2 = d.items[2].box.x - d.items[1].box.x;
  expect(Math.abs(step1 - step2)).toBeLessThan(1.5);
  // 説明 和 効果: key 宽度和值的左端都对齐
  expect(Math.abs(d.items[0].key.w - d.descKey.w)).toBeLessThan(0.5);
  expect(Math.abs(d.items[0].key.x - d.descKey.x)).toBeLessThan(0.5);
  expect(Math.abs(d.items[0].val.x - d.descVal.x)).toBeLessThan(0.5);

  await page.setViewportSize({ width: 390, height: 780 });
  await page.waitForTimeout(150);
  const m = await geo();
  expect(Math.abs(m.items[0].box.w - m.meta.w)).toBeLessThan(1.5);          // 効果 占满一行
  expect(Math.abs(m.items[1].box.w - m.items[2].box.w)).toBeLessThan(1.5);  // 50/50
  expect(m.items[1].box.w).toBeLessThan(m.meta.w * 0.55);
  expect(m.items[1].box.w).toBeGreaterThan(m.meta.w * 0.45);
  expect(Math.abs(m.items[0].key.w - m.descKey.w)).toBeLessThan(0.5);       // 効果 的 key = 説明 的 key
  expect(Math.abs(m.items[0].val.x - m.descVal.x)).toBeLessThan(0.5);
  // 初期値 / 最大Lv 的 key 是 3 个字的自然宽 (固定 24px 会折行)
  expect(m.items[1].key.w).toBeGreaterThan(m.descKey.w);
  expect(m.items[2].key.w).toBeGreaterThan(m.descKey.w);
});

test('⚙ は 修正 の左・同じ行', async ({ page }) => {
  await open(page);
  await page.locator('.crystal-row .crystal-row-hd').first().click();
  const row = page.locator('.crystal-row.expanded').first();
  const gear = row.locator('.btn-gear');
  const edit = row.locator('.btn-edit');
  await expect(gear).toBeVisible();
  expect(await gear.evaluate((el) => getComputedStyle(el).fontSize)).toBe('17px');
  const [g, e] = [await gear.boundingBox(), await edit.boundingBox()];
  expect(g.x + g.width).toBeLessThanOrEqual(e.x + 1);                       // 左
  expect(Math.abs(g.y + g.height / 2 - (e.y + e.height / 2))).toBeLessThan(3); // 同じ行

  // ⚙ + 修正 を合わせた幅 = 上の icon と同じ (左右も揃う)
  const icon = row.locator('.crystal-icon');
  const [i, box] = [await icon.boundingBox(), await row.locator('.cr-body-actions').boundingBox()];
  expect(Math.abs(box.width - i.width)).toBeLessThan(1.5);
  expect(Math.abs(box.x - i.x)).toBeLessThan(1.5);
  expect(Math.abs(box.x + box.width - (i.x + i.width))).toBeLessThan(1.5);
});

test('⚙ modal: Lv/重量/純度/HP を動かすと効果値が変わる', async ({ page }) => {
  await open(page);
  const id = await findRemHp(page);
  test.skip(!id, 'RemHP_* の三因子結晶が無い');
  await page.evaluate((i) => window.openCrSim(i), id);

  const modal = page.locator('#cr-sim-modal');
  await expect(modal).toBeVisible();
  await expect(page.locator('#cr-sim-title')).not.toHaveText('');
  const out = page.locator('#cr-sim-out');
  await expect(out).toContainText('効果値');
  await expect(out).toContainText('残HP 適用後');   // RemHP_* なので出る
  await expect(out).toContainText('条件係数');
  expect(await out.locator('.sim-note').count()).toBe(0);   // note 行は出さない

  // HP=100 → RemHP 係数 0 なので「残HP 適用後」は ×1 (or +0)
  const hpRow = modal.locator('.pop-row[data-kind="hp"] input[type=number]');
  await expect(hpRow).toHaveValue('100');

  // Lv を 1 に落とすと効果値が下がる
  const before = await out.innerText();
  const lvRow = modal.locator('.pop-row[data-kind="lv"] input[type=number]');
  await lvRow.fill('1');
  await lvRow.dispatchEvent('input');
  await expect(out).not.toHaveText(before);

  // HP を 0 にすると 残HP 適用後 = 効果値 (係数 1)
  await hpRow.fill('0');
  await hpRow.dispatchEvent('input');
  const t = await out.innerText();
  const nums = [...t.matchAll(/[×+]([\d.]+)/g)].map((m) => m[1]);
  expect(nums.length).toBeGreaterThanOrEqual(2);
  expect(nums[0]).toBe(nums[1]);                  // 係数 1 → 一致

  await modal.locator('.ce-modal-close').click();
  await expect(modal).toBeHidden();
});
