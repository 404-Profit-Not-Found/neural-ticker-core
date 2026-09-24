import { defineConfig, devices } from '@playwright/test';

/**
 * Frontend-only E2E + visual regression suite.
 *
 * The backend is NEVER started: every /api and /auth call is answered by the
 * in-memory mock backend in e2e/mocks (see e2e/fixtures.ts). Only the Vite dev
 * server runs. Screenshot baselines live next to the specs in __snapshots__;
 * `npm run e2e` compares against them and the HTML report shows diffs;
 * `npm run e2e:compare [ref]` diffs the working tree against another ref.
 */
const PORT = Number(process.env.E2E_PORT || 5199);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: process.env.E2E_REPORT_DIR || 'playwright-report' }],
  ],
  outputDir: process.env.E2E_OUTPUT_DIR || 'test-results',
  // E2E_SNAPSHOT_DIR lets e2e/compare.sh diff against another ref's screenshots.
  snapshotDir: process.env.E2E_SNAPSHOT_DIR || './e2e/__snapshots__',
  snapshotPathTemplate: '{snapshotDir}/{testFileName}/{arg}-{projectName}-{platform}{ext}',
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      // Near-zero tolerance: runs are deterministic (mocked data, frozen
      // clock, settled charts), and on a mostly-dark page even a whole new
      // button is < 0.3% of the pixels — a ratio tolerance would hide it.
      // Per-pixel `threshold` (default 0.2) still absorbs antialiasing.
      maxDiffPixels: 10,
      stylePath: './e2e/screenshot.css',
    },
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'en-US',
    timezoneId: 'Europe/Bratislava',
    colorScheme: 'dark',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
