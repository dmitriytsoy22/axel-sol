import { defineConfig, devices } from '@playwright/test';
import { URLS } from './e2e/stack/config';

/*
 * End-to-end suite: the real app, backend and axel_v2 on a local validator seeded with the
 * demo fleet (e2e/stack/global-setup.ts starts all of it). Only a flaky test hides behind a
 * retry, so there are none.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/stack/global-setup.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  // Every wait is on the chain: a transaction, then the app reading it back.
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: URLS.frontend,
    locale: 'en-US',
    // A missing button fails the test here, not at the end of its timeout.
    actionTimeout: 30_000,
    // `next dev` compiles a page on its first visit.
    navigationTimeout: 120_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
