/**
 * Deterministic fixture data for the mocked backend. Everything here is
 * static or derived from a fixed "today" so screenshots are reproducible.
 */

/** Frozen "now" for every test (the browser clock is pinned to it). */
export const NOW = new Date('2026-09-24T10:00:00+02:00');
export const TODAY = '2026-09-24';

export const USER = {
  id: 'e2e-user-1',
  email: 'e2e@neuralticker.test',
  name: 'E2E Trader',
  nickname: 'e2e',
  role: 'user',
  tier: 'pro' as const,
  credits_balance: 50,
  avatar_url: '',
  has_onboarded: true,
  preferences: {},
};

export interface TickerFixture {
  symbol: string;
  name: string;
  currency: string;
  exchange: string;
  sector: string;
  industry: string;
  /** Last close; the mock history ends at this price. */
  price: number;
  prevClose: number;
  color: string;
}

export const TICKERS: Record<string, TickerFixture> = {
  AAPL: {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    currency: 'USD',
    exchange: 'NASDAQ',
    sector: 'Technology',
    industry: 'Consumer Electronics',
    price: 232.29,
    prevClose: 229.87,
    color: '#a1a1aa',
  },
  MSFT: {
    symbol: 'MSFT',
    name: 'Microsoft Corporation',
    currency: 'USD',
    exchange: 'NASDAQ',
    sector: 'Technology',
    industry: 'Software',
    price: 431.1,
    prevClose: 435.62,
    color: '#3b82f6',
  },
  NVDA: {
    symbol: 'NVDA',
    name: 'NVIDIA Corporation',
    currency: 'USD',
    exchange: 'NASDAQ',
    sector: 'Technology',
    industry: 'Semiconductors',
    price: 121.4,
    prevClose: 118.05,
    color: '#22c55e',
  },
  VOLV: {
    symbol: 'VOLV-B.ST',
    name: 'Volvo AB',
    currency: 'SEK',
    exchange: 'STO',
    sector: 'Industrials',
    industry: 'Machinery',
    price: 281.4,
    prevClose: 279.9,
    color: '#f97316',
  },
};

export const tickerBySymbol = (symbol: string) =>
  Object.values(TICKERS).find((t) => t.symbol === symbol.toUpperCase());

const isoDay = (d: Date) => d.toISOString().split('T')[0];

/**
 * Deterministic daily OHLC ending today at `price` (smooth sine wave, no RNG).
 */
export function history(t: TickerFixture, days = 120) {
  const rows = [];
  for (let i = days; i >= 0; i--) {
    const d = new Date(NOW.getTime() - i * 86_400_000);
    const wobble = Math.sin(i / 7) * 0.04 + Math.cos(i / 19) * 0.03;
    const close = +(t.price * (1 + wobble - (i === 0 ? wobble : 0))).toFixed(2);
    rows.push({
      date: isoDay(d),
      open: +(close * 0.995).toFixed(2),
      high: +(close * 1.012).toFixed(2),
      low: +(close * 0.985).toFixed(2),
      close,
    });
  }
  return rows;
}

export function sparkline(t: TickerFixture) {
  return history(t, 30).map((r) => r.close);
}

/** Market snapshot as returned by POST /market-data/snapshots. */
export function marketSnapshot(t: TickerFixture) {
  const d = +(t.price - t.prevClose).toFixed(2);
  return {
    ticker: {
      id: `tk-${t.symbol}`,
      symbol: t.symbol,
      name: t.name,
      currency: t.currency,
      logo_url: `/api/v1/tickers/${t.symbol}/logo`,
    },
    latestPrice: { close: t.price, prevClose: t.prevClose },
    fundamentals: {
      fifty_two_week_high: +(t.price * 1.18).toFixed(2),
      fifty_two_week_low: +(t.price * 0.72).toFixed(2),
      sector: t.sector,
      pe_ttm: 31.2,
      market_cap: 3_400_000_000_000,
    },
    sparkline: sparkline(t),
    quote: { c: t.price, d, dp: +((d / t.prevClose) * 100).toFixed(2) },
  };
}

/** Deterministic single-letter logo so rows render identically every run. */
export function logoSvg(symbol: string) {
  const t = tickerBySymbol(symbol);
  const color = t?.color ?? '#71717a';
  const letter = symbol.substring(0, 1).toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="${color}"/><text x="32" y="42" font-family="Arial" font-size="30" font-weight="700" fill="#fff" text-anchor="middle">${letter}</text></svg>`;
}

export const CURRENCIES_AVAILABLE = [
  { code: 'USD', name: 'US Dollar', symbol: '$', flag: '🇺🇸' },
  { code: 'EUR', name: 'Euro', symbol: '€', flag: '🇪🇺' },
  { code: 'GBP', name: 'British Pound', symbol: '£', flag: '🇬🇧' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr', flag: '🇸🇪' },
];

export const CURRENCY_RATES = {
  base: 'USD',
  rates: { USD: 1, EUR: 0.9, GBP: 0.76, SEK: 10.4 },
};
