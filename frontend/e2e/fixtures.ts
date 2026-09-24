import { test as base, expect, type Page } from '@playwright/test';
import { MockBackend, type CashBalance, type SeedPosition } from './mocks/backend';
import { NOW } from './mocks/data';

export interface BackendSeed {
  cash?: CashBalance[];
  positions?: SeedPosition[];
}

type Fixtures = {
  /** Initial mock-backend state; override per describe with `test.use({ seed })`. */
  seed: BackendSeed;
  /** The in-memory API behind every /api call of this test. */
  backend: MockBackend;
};

export const test = base.extend<Fixtures>({
  seed: [{}, { option: true }],

  backend: [
    async ({ page, seed }, use, testInfo) => {
      const backend = new MockBackend(seed);
      const pageErrors: string[] = [];
      page.on('pageerror', (e) => pageErrors.push(e.message));

      // No real network: third-party hosts (fonts, analytics, CDNs) are
      // blocked so screenshots never depend on what they return.
      await page.route(
        (url) => url.hostname !== 'localhost' && url.hostname !== '127.0.0.1',
        (route) => route.abort(),
      );
      await backend.install(page);
      // Freeze Date (timers keep running) so "today" and buy dates are stable.
      await page.clock.setFixedTime(NOW);

      await use(backend);

      await testInfo.attach('api-calls.json', {
        body: JSON.stringify(backend.calls, null, 2),
        contentType: 'application/json',
      });
      expect(backend.unmocked, 'UI called API endpoints the mock backend does not handle').toEqual([]);
      expect(pageErrors, 'uncaught errors in the page').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/**
 * Open the portfolio page and wait until positions have loaded. (Deliberately
 * not waiting on /portfolio/cash, so page-level specs also run against
 * builds that predate the cash UI — that's how before/after diffs are made.)
 */
export async function gotoPortfolio(page: Page) {
  const positions = page.waitForResponse((r) => r.url().includes('/api/v1/portfolio/positions'));
  await page.goto('/portfolio');
  await positions;
  await expect(page.getByRole('button', { name: /add position/i }).first()).toBeVisible();
}

/** Open the Add Position dialog from the toolbar. */
export async function openAddDialog(page: Page) {
  await page.getByRole('button', { name: /add position/i }).first().click();
  await expect(page.getByPlaceholder('Search symbol (e.g. AAPL)...')).toBeVisible();
}

/** Search and select a ticker inside the Add Position dialog. */
export async function pickTicker(page: Page, query: string, name: string) {
  await page.getByPlaceholder('Search symbol (e.g. AAPL)...').fill(query);
  await page.getByRole('button', { name: new RegExp(name) }).click();
  // Price auto-fills from the (mocked) snapshot once history has loaded.
  await expect(page.getByText(/price selection/i)).toBeVisible();
}

/**
 * Wait until every Recharts SVG has stopped animating. Recharts (3.x) animates
 * in JS and ignores prefers-reduced-motion, so Playwright's
 * `animations: 'disabled'` can't freeze it — we poll the path geometry until
 * two consecutive samples match.
 */
export async function settleCharts(page: Page) {
  // Must be longer than Recharts' animationBegin (Pie: 400ms), otherwise two
  // identical samples taken *before* the animation starts look "settled".
  const STABLE_FOR_MS = 1000;
  const STEP_MS = 200;
  let prev = '';
  let stableMs = 0;
  for (let waited = 0; waited < 10_000; waited += STEP_MS) {
    const cur = await page.evaluate(() =>
      [...document.querySelectorAll('svg path, svg rect, svg circle')]
        .map((p) => p.getAttribute('d') ?? `${p.getAttribute('width')}x${p.getAttribute('height')}@${p.getAttribute('cx')}`)
        .join('|'),
    );
    stableMs = cur === prev ? stableMs + STEP_MS : 0;
    if (stableMs >= STABLE_FOR_MS) return;
    prev = cur;
    await page.waitForTimeout(STEP_MS);
  }
  throw new Error('charts did not settle within 10s');
}

/** Visual snapshot of the page once charts have settled. */
export async function snap(page: Page, name: string, opts: { fullPage?: boolean } = {}) {
  await settleCharts(page);
  await expect(page).toHaveScreenshot(name, opts);
}
