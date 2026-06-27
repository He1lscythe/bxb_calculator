// tests/ui/test_crystal_vlist.spec.js — crystal 虚拟列表行为
//
// 覆盖两点:
//   A. resize 跨响应式断点 (desktop #crystal-list overflow:auto ↔ mobile overflow:visible→window)
//      时 virtual-list 重检测 _scrollEl + 重绑监听、保持虚拟化。
//   B. expandAll/collapseAll/applyFilters 改 row kind 时、setItems 清 heights 缓存、totalHeight 不失真。
import { test, expect } from '@playwright/test';

async function loadCrystals(page) {
  await page.route('**/save', (r) =>
    r.request().method() === 'POST'
      ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
      : r.continue(),
  );
  await page.goto('/pages/crystals.html');
  await page.waitForFunction(() => window.state?.allCrystals?.length > 0, null, { timeout: 15000 });
  await page.waitForTimeout(300);
}

test('A. resize 桌面→移动端 仍虚拟化 (不把全部 row 灌进 DOM)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await loadCrystals(page);
  const total = await page.evaluate(() => window.state.filteredCrystals.length);
  expect(total, '大列表 (确保虚拟化有意义)').toBeGreaterThan(500);

  await page.setViewportSize({ width: 480, height: 800 }); // 跨断点
  await page.waitForTimeout(300);

  const domRows = await page.evaluate(() => document.querySelectorAll('.crystal-row').length);
  // 修前: mobile #crystal-list overflow:visible → clientHeight=全内容 → 全部 (2066) 进 DOM。
  // 修后: _scrollEl 重检测为 window、按 viewport±buffer 渲染 → 远小于总数。
  expect(domRows, 'resize 后 DOM row 数应受限 (虚拟化未失效)').toBeLessThan(200);
  expect(domRows).toBeGreaterThan(0);
});

test('B. expandAll→collapseAll 后高度不虚高 + 滚到底有 row', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await loadCrystals(page);
  const n = await page.evaluate(() => window.state.filteredCrystals.length);

  // expandAll → 分段滚一遍 (测量一批 expanded 高度) → collapseAll
  await page.evaluate(async () => {
    const list = document.getElementById('crystal-list');
    const sc = list.scrollHeight > list.clientHeight ? list : document.scrollingElement;
    window.expandAll();
    for (let f = 0; f <= 1; f += 0.25) {
      sc.scrollTop = (sc.scrollHeight - sc.clientHeight) * f;
      sc.dispatchEvent(new Event('scroll'));
      await new Promise((r) => setTimeout(r, 60));
    }
    window.collapseAll();
    await new Promise((r) => setTimeout(r, 80));
  });

  const diag = await page.evaluate(async () => {
    const list = document.getElementById('crystal-list');
    const sc = list.scrollHeight > list.clientHeight ? list : document.scrollingElement;
    sc.scrollTop = sc.scrollHeight - sc.clientHeight;
    sc.dispatchEvent(new Event('scroll'));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 150));
    const rows = [...document.querySelectorAll('.crystal-row')];
    const vpBot = sc === document.scrollingElement ? window.innerHeight : list.getBoundingClientRect().bottom;
    const inVP = rows.filter((r) => {
      const x = r.getBoundingClientRect();
      return x.bottom > 0 && x.top < vpBot;
    }).length;
    return { scrollHeight: sc.scrollHeight, inVP };
  });

  // collapsed 高度 ~44px/行 → totalHeight ≈ n*44。修前 collapseAll 残留 expanded 高度会撑大。
  expect(diag.scrollHeight, 'collapseAll 后 scrollHeight 不应虚高').toBeLessThan(n * 60);
  // 底部不空白
  expect(diag.inVP, '滚到底视口 row 数').toBeGreaterThan(0);
});
