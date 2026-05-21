// tests/ui/helpers.js — Playwright smoke 共享工具
// 1) attachPageErrorWatcher: 监听 page error / console error、test 末尾 expect 没出错
// 2) mockSaveEndpoints: 防止 saveRevise POST 真发到 Vercel/start.py、本地 mock 返回成功
// 3) captureSaveEndpoint: 同 mock、但额外把 POST body 收集到 return 的数组里、
//    供 test 断言 saveRevise payload 内容（用 page.evaluate 拿到 capture[0].revise[0] 等）

export const attachPageErrorWatcher = (page) => {
  const errors = [];
  // 真实 404 通过 page.on('response') 检查、跳过 gitignored optional 文件
  // (*_revise / *_extra / *_check / omoide_templates)、对其他 404 记 error。
  // viewer 加载时 fetch 这些 optional file 有 .catch(() => []) / [] 兜底、本地 data-staging
  // 上文件存在不会 404、main / CI 上不存在就 404 — 不算 test error。
  page.on('response', (resp) => {
    if (resp.status() !== 404) return;
    const url = resp.url();
    if (/_(revise|extra|check)\.json|omoide_templates\.json|favicon/.test(url)) return;
    errors.push(`response 404: ${url}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const txt = msg.text();
    // favicon / chrome devtools 噪音忽略
    if (/favicon|net::ERR_FAILED.*\.ico|DevTools/.test(txt)) return;
    // 浏览器把 fetch 404 也以 console.error 报 "Failed to load resource ... 404"
    // — page.on('response') 已经处理这类、避免 double-count、全部忽略
    if (/Failed to load resource.*\b40[0-9]\b/.test(txt)) return;
    errors.push(`console.error: ${txt}`);
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

// mock saveRevise POST 返回 500 error — 用于测错误处理（wrapSaveReviseUi catch 分支）
export const mockSaveEndpointError = async (page, status = 500) => {
  const handler = (route) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ error: `mock ${status}` }),
    });
  await page.route('**/save', handler);
  await page.route('https://bxb-calculator.vercel.app/api/save', handler);
};

// 拦截 + capture body。返回 captured 数组、test 在调用 saveRevise 后读它做 assert。
// 每次 saveRevise POST 会 append 一个 entry（JSON parse postData、失败则 rawBody string）。
export const captureSaveEndpoint = async (page) => {
  const captured = [];
  const handler = (route) => {
    let body;
    try {
      body = route.request().postDataJSON();
    } catch (_) {
      body = { rawBody: route.request().postData() };
    }
    captured.push(body);
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  };
  await page.route('**/save', handler);
  await page.route('https://bxb-calculator.vercel.app/api/save', handler);
  return captured;
};
