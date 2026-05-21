// Playwright config — UI smoke tests for 4 viewer + hensei.
// webServer 起 scripts/serve.js（零依赖 node http 静态服务、跨平台、Linux CI / Windows local 都能跑）。
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
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'node scripts/serve.js 8765',
    url: 'http://127.0.0.1:8765/pages/characters.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
