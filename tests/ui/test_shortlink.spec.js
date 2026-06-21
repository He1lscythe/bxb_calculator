// tests/ui/test_shortlink.spec.js — 编成短链 (#s:<key>) 客户端流程
// serve.js 是纯静态、没有 /share;故 mock `**/share` (regex 兼容带 query 的 GET)。
// 不触真 Upstash —— 只验证客户端: copy url 拼 #s:<key> + #s: 自动加载 fetch→decode→apply。

import { test, expect } from '@playwright/test';

const HENSEI_URL = '/pages/hensei.html';
const SHARE_RE = /\/share(\?|$)/; // 同时匹配 POST /share 与 GET /share?k=...

async function waitReady(page) {
  await page.waitForFunction(
    () => {
      const g = document.getElementById('slots-grid');
      return g && getComputedStyle(g).display === 'grid';
    },
    { timeout: 10000 },
  );
}

// ============================================================
// 1. export 按钮顺序: copy url / copy code / .json
// ============================================================
test('export modal: 按钮顺序 = copy url / copy code / .json', async ({ page }) => {
  await page.goto(HENSEI_URL);
  await waitReady(page);
  const labels = await page.locator('#io-modal .io-sec').first().locator('.io-btn').allTextContents();
  expect(labels.map((s) => s.trim())).toEqual(['copy url', 'copy code', '.json']);
});

// ============================================================
// 2. copy url: POST #hash → 拿 key → 复制 …#s:<key>
// ============================================================
test('copy url: POST bxb1 → 短链 #s:testkey 写入剪贴板', async ({ page }) => {
  // 桩住剪贴板、记录写入值
  await page.addInitScript(() => {
    window.__copied = null;
    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: (t) => { window.__copied = String(t); return Promise.resolve(); } },
      });
    } catch (e) { /* ignore */ }
  });

  let postedHash = null;
  await page.route(SHARE_RE, (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      try { postedHash = JSON.parse(req.postData() || '{}').hash; } catch { /* ignore */ }
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ key: 'testkey' }) });
    } else {
      route.continue();
    }
  });

  await page.goto(HENSEI_URL);
  await waitReady(page);
  await page.evaluate(() => window.setChara(0, 100101));
  await page.waitForTimeout(800); // omoide fetch
  await page.evaluate(() => window.openIoModal()); // 生成 bxb1 到 textarea
  await page.evaluate(() => window.copyIoUrl()); // POST → 拿 key → 写剪贴板
  await page.waitForTimeout(200);

  expect(postedHash, 'POST body 应带 bxb1 #hash').toMatch(/^bxb[01]:/);
  const copied = await page.evaluate(() => window.__copied);
  expect(copied).toMatch(/#s:testkey$/);
  expect(copied).toContain('/pages/hensei.html');
});

// ============================================================
// 3. #s:<key> 自动加载: GET 反查 → decode → apply team + 清 hash
// ============================================================
test('load #s:<key>: auto-fetch → 队伍载入 + hash 清空', async ({ page }) => {
  await page.goto(HENSEI_URL);
  await waitReady(page);
  await page.evaluate(() => window.setChara(0, 100101));
  await page.waitForTimeout(800);
  // 拿一份真 bxb1 串 (含 slot0=100101) 作为 mock GET 返回
  const known = await page.evaluate(async () => {
    await window.openIoModal();
    return document.getElementById('io-export-str').value;
  });
  expect(known).toMatch(/^bxb1:/);

  await page.route(SHARE_RE, (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hash: known }) });
  });

  // 先 about:blank 再导航 → 强制整页重载 (同路径只换 hash 浏览器视为同文档、不重新加载)
  await page.goto('about:blank');
  await page.goto(HENSEI_URL + '#s:testkey'); // 全新加载 → 触发 #s: 自动载入
  await waitReady(page);
  await page.waitForTimeout(700); // fetch + decode + apply + render

  const chara0 = await page.evaluate(() => window.state?.team?.[0]?.chara);
  expect(chara0).toBe(100101);
  const hash = await page.evaluate(() => location.hash);
  expect(hash).toBe('');
});
