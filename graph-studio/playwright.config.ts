import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const channel = process.env.PLAYWRIGHT_CHANNEL ||
  (process.platform === 'win32' && existsSync(`${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`) ? 'msedge' : undefined);

export default defineConfig({
  testDir: './tests/browser',
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    ...devices['Desktop Chrome'], channel,
    baseURL: 'http://127.0.0.1:5186',
    viewport: { width: 1600, height: 1000 },
    actionTimeout: 10_000,
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
  },
  webServer: {
    command: `"${process.execPath}" node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5186 --strictPort`,
    url: 'http://127.0.0.1:5186', timeout: 30_000, reuseExistingServer: !process.env.CI,
  },
});
