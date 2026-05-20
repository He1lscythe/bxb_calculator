// tests/ui/helpers.js — Playwright smoke 共享工具
// 1) attachPageErrorWatcher: 监听 page error / console error、test 末尾 expect 没出错
// 2) mockSaveEndpoints: 防止 saveRevise POST 真发到 Vercel/start.py、本地 mock 返回成功

export const attachPageErrorWatcher = (page) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const txt = msg.text();
      // favicon / chrome devtools / extra.json 404 等无害噪音忽略
      if (/favicon|net::ERR_FAILED.*\.ico|DevTools/.test(txt)) return;
      errors.push(`console.error: ${txt}`);
    }
  });
  return errors;
};

export const mockSaveEndpoints = async (page) => {
  // /save (start.py local) + Vercel /api/save 两条都拦
  await page.route('**/save', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    }),
  );
  await page.route('https://bxb-calculator.vercel.app/api/save', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    }),
  );
};
