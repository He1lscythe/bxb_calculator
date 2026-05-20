// Playwright config — UI smoke tests for 4 viewer + hensei.
// webServer 起 python -m http.server（纯静态、不是 start.py、跑完 Playwright 自己关）。
// 测试 spec 在 tests/ui/、通过 baseURL 访问 pages/*.html。

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: false, // 5 个 viewer 共用一个 server，避免 race
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:8765',
    headless: true,
    actionTimeout: 10000,
    navigationTimeout: 15000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'python -m http.server 8765 --bind 127.0.0.1',
    url: 'http://127.0.0.1:8765/pages/characters.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
