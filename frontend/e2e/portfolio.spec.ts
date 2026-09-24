import { test, expect, gotoPortfolio, snap, openAddDialog, pickTicker } from './fixtures';

/**
 * Page-level regression coverage for My Portfolio. These specs only use UI
 * that predates the paper-trading cash work, so they also run against older
 * builds — screenshot diffs then show exactly what a change did to the page.
 */

const HOLDINGS = {
  cash: [{ currency: 'USD', amount: 12_500 }],
  positions: [
    { symbol: 'AAPL', shares: 10, buy_price: 190.5, buy_date: '2026-03-02T00:00:00.000Z' },
    { symbol: 'MSFT', shares: 4, buy_price: 455.2, buy_date: '2026-05-14T00:00:00.000Z' },
    { symbol: 'NVDA', shares: 25, buy_price: 98.75, buy_date: '2026-01-20T00:00:00.000Z' },
  ],
};

test.describe('portfolio — empty account', () => {
  test('empty state', async ({ page }) => {
    await gotoPortfolio(page);
    await snap(page, 'empty.png', { fullPage: true });
  });

  test('add-position dialog (blank)', async ({ page }) => {
    await gotoPortfolio(page);
    await openAddDialog(page);
    await snap(page, 'add-dialog-blank.png');
  });

  test('add-position dialog with a ticker selected', async ({ page }) => {
    await gotoPortfolio(page);
    await openAddDialog(page);
    await pickTicker(page, 'AAPL', 'Apple Inc');
    await page.getByRole('button', { name: 'By Shares' }).click();
    await page.locator('#shares-input').fill('5');
    await expect(page.getByRole('button', { name: /add aapl/i })).toBeEnabled();
    await snap(page, 'add-dialog-aapl.png');
  });
});

test.describe('portfolio — with holdings', () => {
  test.use({ seed: HOLDINGS });

  test('table view', async ({ page }) => {
    await gotoPortfolio(page);
    for (const s of ['AAPL', 'MSFT', 'NVDA']) {
      await expect(page.getByText(s, { exact: true }).first()).toBeVisible();
    }
    await snap(page, 'holdings-table.png', { fullPage: true });
  });

  test('grid view', async ({ page }) => {
    await gotoPortfolio(page);
    await page.getByTitle('Grid View').click();
    await expect(page.getByText('NVDA', { exact: true }).first()).toBeVisible();
    await snap(page, 'holdings-grid.png', { fullPage: true });
  });

  test('search filters the holdings', async ({ page }) => {
    await gotoPortfolio(page);
    await page.getByPlaceholder(/search symbols or names/i).fill('micro');
    await expect(page.getByText('MSFT', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('AAPL', { exact: true })).toHaveCount(0);
  });

  // Deletes the FIRST row: on mobile the floating "+" button covers the
  // actions of the last visible row (known UX issue).
  test('delete a position', async ({ page, backend }) => {
    await gotoPortfolio(page);
    page.once('dialog', (d) => d.accept());
    const row = page.getByRole('row').filter({ hasText: 'AAPL' });
    await row.getByRole('button', { name: /delete position/i }).click();
    await expect(page.getByText('Position removed')).toBeVisible();
    expect(backend.callsTo('DELETE', '/api/v1/portfolio/positions/pos-1')).toHaveLength(1);
    await expect(page.getByRole('row').filter({ hasText: 'AAPL' })).toHaveCount(0);
  });
});
