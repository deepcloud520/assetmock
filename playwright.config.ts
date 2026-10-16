import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', timeout: 90000, workers: 1, retries: 0,
  expect: { timeout: 15000 },
  use: { channel: 'chromium', baseURL: 'http://127.0.0.1:3100', viewport: { width: 1440, height: 1000 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev -- --port 3100', url: 'http://127.0.0.1:3100', reuseExistingServer: false,
    timeout: 90000, env: { LLM_API_KEY: '', DOUBAO_SEARCH_API_KEY: '', DATABASE_PATH: './data/e2e.sqlite', NEXT_TELEMETRY_DISABLED: '1' },
  },
});
