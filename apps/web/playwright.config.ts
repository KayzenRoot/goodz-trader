import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const appSecret = 'e2e-secret-0123456789-0123456789-0123456789';
const databasePath = `./.data/e2e-${Date.now()}.db`;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3001',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'node apps/api/dist/index.js',
    cwd: repoRoot,
    url: 'http://127.0.0.1:3001/api/health',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: '3001',
      DATABASE_PATH: databasePath,
      APP_SECRET: appSecret,
      SEED_DEMO: 'true',
      WEB_DIST_PATH: 'apps/web/dist',
      LIVE_TRADING_ENABLED: 'false',
      LOG_LEVEL: 'warn',
    },
  },
});
