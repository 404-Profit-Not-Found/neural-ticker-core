import { test, expect, gotoPortfolio, snap, openAddDialog, pickTicker } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * Paper-trading cash: virtual deposits/withdrawals and strict (cash-funded)
 * buys. The mock backend enforces the same rules as PortfolioService, so the
 * insufficient-cash rejection here is the real message format.
 */

const cashButton = (page: Page) => page.getByRole('button', { name: /^\$[\d,]+/ });
const cashDialog = (page: Page) =>
  page.locator('div.fixed.inset-0').filter({ has: page.getByRole('heading', { name: 'Manage Cash' }) });

test.describe('cash — empty account', () => {
  test('toolbar shows a $0 balance', async ({ page }) => {
    await gotoPortfolio(page);
    await expect(cashButton(page)).toHaveText(/\$0/);
    await snap(page, 'toolbar-zero-cash.png', { fullPage: true });
  });

  test('deposit with a preset', async ({ page, backend }) => {
    await gotoPortfolio(page);
    await cashButton(page).click();
    const dialog = cashDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/no real money/i)).toBeVisible();
    await snap(page, 'cash-dialog-deposit.png');

    await dialog.getByRole('button', { name: '+10,000' }).click();
    await expect(dialog.getByLabel('Amount')).toHaveValue('10000');
    await dialog.getByRole('button', { name: /^deposit$/i }).click();

    await expect(page.getByText('Deposited $10,000.00')).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(cashButton(page)).toHaveText(/\$10,000/);
    expect(backend.callsTo('POST', '/api/v1/portfolio/cash/deposit').map((c) => c.body)).toEqual([
      { amount: 10000, currency: 'USD' },
    ]);
  });

  test('deposit in another currency', async ({ page, backend }) => {
    await gotoPortfolio(page);
    await cashButton(page).click();
    const dialog = cashDialog(page);
    await dialog.getByLabel('Amount').fill('2500');
    await dialog.locator('select').selectOption('SEK');
    await dialog.getByRole('button', { name: /^deposit$/i }).click();
    await expect(page.getByText(/Deposited SEK/)).toBeVisible();
    expect(backend.cashOf('SEK')).toBe(2500);
  });
});

test.describe('cash — funded account', () => {
  test.use({ seed: { cash: [{ currency: 'USD', amount: 25_000 }, { currency: 'EUR', amount: 1_200 }] } });

  test('toolbar shows the primary balance and the other-currency count', async ({ page }) => {
    await gotoPortfolio(page);
    await expect(cashButton(page)).toHaveText(/\$25,000\s*\+1/);
  });

  test('withdraw more than the balance is blocked client-side', async ({ page, backend }) => {
    await gotoPortfolio(page);
    await cashButton(page).click();
    const dialog = cashDialog(page);
    await dialog.getByRole('tab', { name: /withdraw/i }).click();
    await dialog.getByLabel('Amount').fill('30000');
    await expect(dialog.getByText('Amount exceeds your USD balance')).toBeVisible();
    await expect(dialog.getByRole('button', { name: /^withdraw$/i })).toBeDisabled();
    await snap(page, 'cash-dialog-withdraw-too-much.png');
    expect(backend.callsTo('POST', '/api/v1/portfolio/cash/withdraw')).toHaveLength(0);
  });

  // Regression: switching to the Withdraw tab with an amount entered used to
  // submit the form (tab triggers defaulted to type="submit").
  test('switching tabs with an amount entered moves no money', async ({ page, backend }) => {
    await gotoPortfolio(page);
    await cashButton(page).click();
    const dialog = cashDialog(page);
    await dialog.getByLabel('Amount').fill('500');
    await dialog.getByRole('tab', { name: /withdraw/i }).click();
    await expect(dialog.getByRole('tab', { name: /withdraw/i })).toHaveAttribute('aria-selected', 'true');
    await expect(dialog).toBeVisible();
    expect(backend.calls.filter((c) => c.method === 'POST').map((c) => c.path)).toEqual([]);
    expect(backend.cashOf('USD')).toBe(25_000);
  });

  test('net worth includes cash (converted to the display currency)', async ({ page }) => {
    await gotoPortfolio(page);
    // No holdings: net worth = 25,000 USD + 1,200 EUR / 0.9 = 26,333.33
    await expect(page.getByRole('heading', { name: '$26,333.33' })).toBeVisible();
    await expect(page.getByText(/Cash\s*\$26,333\.33/)).toBeVisible();
  });

  test('withdraw within the balance', async ({ page, backend }) => {
    await gotoPortfolio(page);
    await cashButton(page).click();
    const dialog = cashDialog(page);
    await dialog.getByRole('tab', { name: /withdraw/i }).click();
    await dialog.getByLabel('Amount').fill('5000');
    await dialog.getByRole('button', { name: /^withdraw$/i }).click();
    await expect(page.getByText('Withdrew $5,000.00')).toBeVisible();
    await expect(cashButton(page)).toHaveText(/\$20,000/);
    expect(backend.cashOf('USD')).toBe(20_000);
  });

  test('a funded buy debits cash', async ({ page, backend }) => {
    await gotoPortfolio(page);
    await openAddDialog(page);
    await pickTicker(page, 'AAPL', 'Apple Inc');
    await page.getByRole('tab', { name: 'By Shares' }).click();
    await page.locator('#shares-input').fill('10');
    await expect(page.getByText('Available USD cash:')).toBeVisible();
    await page.getByRole('button', { name: /add aapl/i }).click();

    await expect(page.getByPlaceholder('Search symbol (e.g. AAPL)...')).toBeHidden();
    await expect(page.getByText('AAPL', { exact: true }).first()).toBeVisible();
    // 10 × 232.29 = 2,322.90 → 25,000 − 2,322.90
    expect(backend.cashOf('USD')).toBe(22_677.1);
    await expect(cashButton(page)).toHaveText(/\$22,677/);
  });
});

test.describe('cash — insufficient funds recovery', () => {
  test('rejected buy → deposit the shortfall → buy succeeds', async ({ page, backend }) => {
    await gotoPortfolio(page);
    await openAddDialog(page);
    await pickTicker(page, 'AAPL', 'Apple Inc');
    await page.getByRole('tab', { name: 'By Shares' }).click();
    await page.locator('#shares-input').fill('5');
    await page.getByRole('button', { name: /add aapl/i }).click();

    // Backend rejection, surfaced with a one-click fix.
    await expect(page.getByText('Insufficient USD cash: need 1161.45, have 0.00. Deposit cash first.')).toBeVisible();
    await snap(page, 'buy-rejected-insufficient-cash.png');

    await page.getByRole('button', { name: 'Deposit cash' }).click();
    const dialog = cashDialog(page);
    await expect(dialog).toBeVisible();
    // Pre-filled with the shortfall, rounded up to whole units.
    await expect(dialog.getByLabel('Amount')).toHaveValue('1162');
    await snap(page, 'deposit-over-add-dialog.png');
    // Presets add to the amount (they're labelled "+…"), they don't replace it.
    await dialog.getByRole('button', { name: '+1,000' }).click();
    await expect(dialog.getByLabel('Amount')).toHaveValue('2162');
    await dialog.getByLabel('Amount').fill('1162');
    await dialog.getByRole('button', { name: /^deposit$/i }).click();

    // Back on the (still filled-in) order; error cleared, cash now covers it.
    await expect(dialog).toBeHidden();
    await expect(page.getByText(/Insufficient USD cash/)).toBeHidden();
    await expect(page.locator('#shares-input')).toHaveValue('5');
    await expect(page.locator('span', { hasText: 'Available USD cash:' })).toContainText('$1,162.00');
    await page.getByRole('button', { name: /add aapl/i }).click();

    await expect(page.getByPlaceholder('Search symbol (e.g. AAPL)...')).toBeHidden();
    expect(backend.positions.map((p) => p.symbol)).toEqual(['AAPL']);
    expect(backend.cashOf('USD')).toBe(0.55);
  });

  test('"Deposit shortfall" link before submitting', async ({ page }) => {
    await gotoPortfolio(page);
    await openAddDialog(page);
    await pickTicker(page, 'AAPL', 'Apple Inc');
    await page.getByRole('tab', { name: 'By Shares' }).click();
    await page.locator('#shares-input').fill('2');
    await page.getByRole('button', { name: 'Deposit shortfall' }).click();
    // 2 × 232.29 = 464.58 → rounded up
    await expect(cashDialog(page).getByLabel('Amount')).toHaveValue('465');
  });

  test('non-USD ticker funds in its own currency', async ({ page }) => {
    await gotoPortfolio(page);
    await openAddDialog(page);
    await pickTicker(page, 'VOLV', 'Volvo AB');
    await expect(page.getByText('Available SEK cash:')).toBeVisible();
    await page.getByRole('button', { name: 'Deposit', exact: true }).click();
    await expect(cashDialog(page).locator('select')).toHaveValue('SEK');
  });
});
