// Number formatting shared by the ticker, research and public report pages.
//
// Rules (see DESIGN.md §5):
//   · a value that is missing, not a number or not finite renders as an em
//     dash — never as 0, "$0.00" or "N/A";
//   · prices keep enough decimals to be meaningful (a $0.1834 stock is not
//     "$0.18");
//   · changes always carry a sign, using the real minus sign;
//   · nothing here invents or rounds a value into a different magnitude.

export const EM_DASH = '—';
export const MINUS = '−';

const LOCALE = 'en-US';

/** Accepts numbers and numeric strings (the API serialises NUMERIC columns as strings). */
export function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function currencyCode(currency?: string | null): string {
  const code = (currency || 'USD').toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : 'USD';
}

function safeCurrencyFormat(value: number, options: Intl.NumberFormatOptions): string {
  try {
    return new Intl.NumberFormat(LOCALE, { style: 'currency', ...options }).format(value);
  } catch {
    // Unknown ISO code: fall back to the plain number rather than throwing.
    const { currency, ...rest } = options;
    void currency;
    return new Intl.NumberFormat(LOCALE, { ...rest, style: 'decimal' }).format(value);
  }
}

/** Decimals a price needs: 4 below 1 unit of currency, otherwise 2. */
export function priceDecimals(value: number): number {
  const abs = Math.abs(value);
  return abs > 0 && abs < 1 ? 4 : 2;
}

export interface PriceOptions {
  /**
   * For axis labels and tight cells only: six figures and up are shortened
   * ("$689.4K") and four/five-figure prices drop their cents ("$2,613").
   * Prices under 1,000 are never shortened.
   */
  compact?: boolean;
}

/**
 * A price in the instrument's own currency.
 * `121.4 → "$121.40"`, `0.1834 → "$0.1834"`, `689420 → "$689,420.00"`,
 * `null → "—"`.
 */
export function formatPrice(value: unknown, currency?: string | null, options: PriceOptions = {}): string {
  const n = toNumber(value);
  if (n === null) return EM_DASH;
  const code = currencyCode(currency);
  if (options.compact && Math.abs(n) >= 100_000) {
    return safeCurrencyFormat(n, {
      currency: code,
      notation: 'compact',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  }
  if (options.compact && Math.abs(n) >= 1_000) {
    return safeCurrencyFormat(n, {
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }
  const max = priceDecimals(n);
  return safeCurrencyFormat(n, {
    currency: code,
    minimumFractionDigits: 2,
    maximumFractionDigits: max,
  });
}

/**
 * A price target / scenario value. Same as {@link formatPrice}, except that a
 * target of zero or less is not a price anyone can act on and reads as "—".
 */
export function formatTarget(value: unknown, currency?: string | null, options: PriceOptions = {}): string {
  const n = toNumber(value);
  if (n === null || n <= 0) return EM_DASH;
  return formatPrice(n, currency, options);
}

/** Large money amounts: market cap, revenue, cash flow. `2.978e12 → "$2.98T"`. */
export function formatCompactCurrency(value: unknown, currency?: string | null, maxFractionDigits = 2): string {
  const n = toNumber(value);
  if (n === null) return EM_DASH;
  return safeCurrencyFormat(n, {
    currency: currencyCode(currency),
    notation: 'compact',
    // Explicit, because engines disagree on the default for compact currency
    // (some pad to the currency's minor units: "$12.00M").
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  });
}

/** Large plain numbers. `24_530_477_800 → "24.53B"`. */
export function formatCompactNumber(value: unknown, maxFractionDigits = 2): string {
  const n = toNumber(value);
  if (n === null) return EM_DASH;
  return new Intl.NumberFormat(LOCALE, {
    notation: 'compact',
    maximumFractionDigits: maxFractionDigits,
  }).format(n);
}

/** Whole numbers with thousands separators. `14748 → "14,748"`. */
export function formatCount(value: unknown): string {
  const n = toNumber(value);
  if (n === null) return EM_DASH;
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 }).format(n);
}

/** A plain ratio or multiple. `56.9 → "56.90"`. */
export function formatRatio(value: unknown, digits = 2): string {
  const n = toNumber(value);
  if (n === null) return EM_DASH;
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

/**
 * Shares outstanding.
 *
 * The ticker composite returns `shares_outstanding` straight from the
 * `tickers.share_outstanding` column, which stores Finnhub's
 * `profile.shareOutstanding` — a figure **in millions**. Rendering it raw
 * turned 24.5 billion NVDA shares into "25K".
 */
export function formatSharesOutstanding(valueInMillions: unknown): string {
  const n = toNumber(valueInMillions);
  if (n === null || n <= 0) return EM_DASH;
  return formatCompactNumber(n * 1_000_000);
}

function signed(n: number, digits: number, suffix: string, alwaysSign: boolean): string {
  const rounded = Number(Math.abs(n).toFixed(digits));
  const body = `${Math.abs(n).toFixed(digits)}${suffix}`;
  // A value that rounds to zero carries no sign: "0.00%", not "+0.00%".
  if (rounded === 0) return body;
  if (n < 0) return `${MINUS}${body}`;
  return alwaysSign ? `+${body}` : body;
}

/**
 * A level expressed as a fraction: margins, returns, yields.
 * `0.4175 → "41.75%"`. No plus sign — these are levels, not changes.
 */
export function formatFraction(value: unknown, digits = 2): string {
  const n = toNumber(value);
  if (n === null) return EM_DASH;
  return signed(n * 100, digits, '%', false);
}

/**
 * A change that is already in percent. Always signed:
 * `2.84 → "+2.84%"`, `-1.04 → "−1.04%"`, `0 → "0.00%"`.
 */
export function formatChangePercent(value: unknown, digits = 2): string {
  const n = toNumber(value);
  if (n === null) return EM_DASH;
  return signed(n, digits, '%', true);
}

/** Magnitude only, for use next to a direction arrow: `-3.41 → "3.41%"`. */
export function formatAbsPercent(value: unknown, digits = 2): string {
  const n = toNumber(value);
  if (n === null) return EM_DASH;
  return `${Math.abs(n).toFixed(digits)}%`;
}

export type Direction = 'up' | 'down' | 'flat';

/** Exactly zero (after rounding to what is displayed) is neutral, never green. */
export function directionOf(value: unknown, digits = 2): Direction {
  const n = toNumber(value);
  if (n === null) return 'flat';
  const rounded = Number(n.toFixed(digits));
  if (rounded > 0) return 'up';
  if (rounded < 0) return 'down';
  return 'flat';
}

/** Text colour class for a direction (DESIGN.md §1). */
export function directionClass(direction: Direction): string {
  if (direction === 'up') return 'text-up';
  if (direction === 'down') return 'text-down';
  return 'text-muted-foreground';
}

/**
 * Price-axis label for charts (no currency symbol, the axis is narrow).
 * `689420 → "689.4K"`, `121.4 → "121.40"`, `0.1834 → "0.1834"`.
 */
export function formatAxisPrice(value: unknown): string {
  const n = toNumber(value);
  if (n === null) return '';
  const abs = Math.abs(n);
  if (abs >= 10_000) {
    return new Intl.NumberFormat(LOCALE, {
      notation: 'compact',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(n);
  }
  const digits = priceDecimals(n);
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  }).format(n);
}

/**
 * Exchange names arrive as the data vendor's legal string
 * ("NASDAQ NMS - GLOBAL MARKET"). Chips and meta rows show the short code.
 */
export function shortExchange(exchange?: string | null): string {
  if (!exchange) return '';
  const raw = exchange.trim();
  const upper = raw.toUpperCase();
  if (upper.startsWith('NASDAQ')) return 'NASDAQ';
  if (upper.startsWith('NEW YORK STOCK EXCHANGE') || upper === 'NYSE') return 'NYSE';
  if (upper.startsWith('NYSE ARCA')) return 'NYSE ARCA';
  if (upper.startsWith('NYSE AMERICAN') || upper.startsWith('NYSE MKT')) return 'NYSE AMERICAN';
  if (upper.includes('OTC')) return 'OTC';
  if (upper.includes('LONDON')) return 'LSE';
  if (upper.includes('TORONTO')) return 'TSX';
  if (upper.includes('XETRA')) return 'XETRA';
  // Already a short code (AMS, TSE, STO…) or something we do not recognise:
  // keep it, but never let it grow past a chip.
  return raw.length > 14 ? `${raw.slice(0, 13).trimEnd()}…` : raw;
}
