/**
 * E2E: Portfolio 52-week range marker must be computed in NATIVE units.
 *
 * Regression guard for the cross-currency marker bug: when a display currency
 * (e.g. EUR) is selected, the backend converts `current_price` to that currency,
 * but the 52-week low/high come from the native snapshot fundamentals (USD).
 * Mixing them placed the marker dot at the wrong spot. The fix feeds the marker
 * the NATIVE quote close (`quote.c`) so the geometry matches the native low/high.
 *
 * The whole network surface is stubbed so the scenario is deterministic and the
 * test does not depend on a live backend or seeded multi-currency data.
 */

type InterceptBody = Record<string, unknown> | unknown[];

const USER = {
  id: 'u1',
  email: 'tester@example.com',
  name: 'Tester',
  role: 'user',
  tier: 'pro',
  credits_balance: 10,
  avatar_url: '',
  theme: 'dark',
};

function stubCommonApis() {
  // Catch-all FIRST so the specific intercepts defined afterwards take
  // precedence (Cypress matches the most-recently-defined route).
  cy.intercept({ url: '**/api/**' }, { statusCode: 200, body: [] }).as('catchAll');

  cy.intercept('GET', '**/api/auth/profile', { statusCode: 200, body: USER }).as('profile');
  cy.intercept('GET', '**/api/v1/currency/available', {
    statusCode: 200,
    body: { currencies: [{ code: 'USD', flag: '🇺🇸' }, { code: 'EUR', flag: '🇪🇺' }] },
  }).as('currencies');
  cy.intercept('GET', '**/api/v1/currency/rates', {
    statusCode: 200,
    body: { rates: { EUR: 0.92 } },
  }).as('rates');
  cy.intercept('GET', '**/api/v1/notifications*', { statusCode: 200, body: [] });
  cy.intercept('GET', '**/api/v1/notifications/count', { statusCode: 200, body: { count: 0 } });
}

function visitPortfolio(displayCurrency: string) {
  cy.viewport(1440, 900); // 52-week column is `hidden lg:block` — needs a wide viewport.
  cy.visit('/portfolio', {
    onBeforeLoad(win) {
      // Drives PortfolioPage out of NATIVE mode into the chosen display currency.
      win.localStorage.setItem('displayCurrency', displayCurrency);
      win.localStorage.setItem('theme-preference', 'dark');
      // React Query persists to IndexedDB (idb-keyval's `keyval-store`) with a 30s
      // staleTime. Cypress clears localStorage between tests but NOT IndexedDB, so a
      // prior test using the same currency (its query key is ['portfolio', currency])
      // would otherwise serve this test stale cached positions and no request would
      // fire. Wipe the store before load so every test fetches fresh, deterministic data.
      return new Cypress.Promise<void>((resolve) => {
        const req = win.indexedDB.deleteDatabase('keyval-store');
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      });
    },
  });
}

function interceptPortfolio(position: InterceptBody) {
  cy.intercept('GET', '**/api/v1/portfolio/positions*', {
    statusCode: 200,
    body: [position],
  }).as('positions');
}

function interceptSnapshots(snapshot: InterceptBody) {
  cy.intercept('POST', '**/api/v1/market-data/snapshots', {
    statusCode: 200,
    body: [snapshot],
  }).as('snapshots');
}

describe('Portfolio 52-week range marker (cross-currency)', () => {
  it('places the marker using the NATIVE quote close, not the EUR-converted price', () => {
    stubCommonApis();

    // USD stock. Native 52-week low/high = 100 / 200 (from snapshot fundamentals).
    // Native latest close = 150  -> marker should sit at (150-100)/(200-100) = 50%.
    // current_price is backend-converted to EUR (~138). The OLD code used that and
    // skewed the marker to (138-100)/100 = 38%.
    interceptPortfolio({
      id: 'p1',
      symbol: 'AAPL',
      shares: 10,
      buy_price: 120,
      current_price: 138, // EUR-converted by the backend
      change_percent: 1.2,
      current_value: 1380,
      cost_basis: 1200,
      gain_loss: 180,
      gain_loss_percent: 15,
      original_currency: 'USD',
      currency: 'EUR',
      ticker: { name: 'Apple Inc.' },
      aiAnalysis: { financial_risk: 2, overall_score: 7, base_price: 160 },
    });
    interceptSnapshots({
      ticker: { id: 't1', symbol: 'AAPL', name: 'Apple Inc.', currency: 'USD' },
      latestPrice: { close: 150 },
      quote: { c: 150, d: 1.5, dp: 1.0 }, // NATIVE USD close
      fundamentals: { fifty_two_week_low: 100, fifty_two_week_high: 200 },
      sparkline: [140, 145, 150],
    });

    visitPortfolio('EUR');

    cy.wait('@positions');
    cy.wait('@snapshots');

    cy.contains('td', 'AAPL', { timeout: 10000 }).should('be.visible');

    // Authoritative geometric assertion: the marker dot's inline left offset.
    // 50% == correct (native). 38% == the bug (converted price vs native range).
    cy.get('[style*="left: 50%"]', { timeout: 10000 }).should('exist');
    cy.get('[style*="left: 38%"]').should('not.exist');

    // Human-readable label rendered by FiftyTwoWeekRange.
    cy.contains('50%').should('be.visible');

    cy.screenshot('portfolio-52week-marker-native-50pct');
  });

  it('falls back to current_price for the marker when no native quote exists', () => {
    stubCommonApis();

    // USD display (== native here): current_price is already native, and the
    // snapshot exposes no `quote.c`, so the marker falls back to current_price.
    // (150-100)/(200-100) = 50%.
    interceptPortfolio({
      id: 'p2',
      symbol: 'MSFT',
      shares: 5,
      buy_price: 130,
      current_price: 150, // native USD, no conversion
      change_percent: 0.5,
      current_value: 750,
      cost_basis: 650,
      gain_loss: 100,
      gain_loss_percent: 15.38,
      original_currency: 'USD',
      currency: 'USD',
      ticker: { name: 'Microsoft Corp.' },
      aiAnalysis: { financial_risk: 2, overall_score: 8, base_price: 170 },
    });
    interceptSnapshots({
      ticker: { id: 't2', symbol: 'MSFT', name: 'Microsoft Corp.', currency: 'USD' },
      latestPrice: { close: 150 },
      quote: {}, // no native close available
      fundamentals: { fifty_two_week_low: 100, fifty_two_week_high: 200 },
      sparkline: [140, 145, 150],
    });

    visitPortfolio('USD');

    cy.wait('@positions');
    cy.wait('@snapshots');

    cy.contains('td', 'MSFT', { timeout: 10000 }).should('be.visible');
    cy.get('[style*="left: 50%"]', { timeout: 10000 }).should('exist');
  });

  it('uses original_current_price when the snapshot quote is null (real-data path)', () => {
    stubCommonApis();

    // The path that actually happens with live data: the snapshot `quote` is
    // null (no fresh live quote), so quote.c is unavailable. A USD stock shown
    // in EUR still carries its NATIVE price in original_current_price, while
    // current_price has been converted to EUR. The marker must use the native
    // 150 -> (150-100)/(200-100) = 50%, NOT the converted 138 -> 38%.
    interceptPortfolio({
      id: 'p3',
      symbol: 'AAPL',
      shares: 10,
      buy_price: 120,
      current_price: 138, // EUR-converted
      original_current_price: 150, // native USD
      change_percent: 1.2,
      current_value: 1380,
      cost_basis: 1200,
      gain_loss: 180,
      gain_loss_percent: 15,
      original_currency: 'USD',
      currency: 'EUR',
      ticker: { name: 'Apple Inc.' },
      aiAnalysis: { financial_risk: 2, overall_score: 7, base_price: 160 },
    });
    interceptSnapshots({
      ticker: { id: 't1', symbol: 'AAPL', name: 'Apple Inc.', currency: 'USD' },
      latestPrice: { close: 150 },
      quote: null, // no live quote -> quote.c unavailable
      fundamentals: { fifty_two_week_low: 100, fifty_two_week_high: 200 },
      sparkline: [140, 145, 150],
    });

    visitPortfolio('EUR');

    cy.wait('@positions');
    cy.wait('@snapshots');

    cy.contains('td', 'AAPL', { timeout: 10000 }).should('be.visible');
    cy.get('[style*="left: 50%"]', { timeout: 10000 }).should('exist');
    cy.get('[style*="left: 38%"]').should('not.exist');
  });
});
