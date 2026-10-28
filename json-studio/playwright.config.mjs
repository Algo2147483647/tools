import { defineConfig } from '@playwright/test';
import { python } from './scripts/python.mjs';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.mjs',
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:4190',
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `"${python}" server.py --port 4190`,
    url: 'http://127.0.0.1:4190',
    reuseExistingServer: false,
  },
});
