/**
 * Maps a ticker's exchange / symbol-suffix to its native trading currency.
 *
 * This is a SAFETY NET, not the primary source. The primary path is:
 *   profile.currency (Finnhub) → quote.currency (Yahoo fallback) → THIS HELPER → 'USD'
 *
 * Only fires when both upstream APIs returned a null/empty currency, which
 * happens during degraded windows (rate limits, outages) for tickers we'd
 * otherwise mislabel as USD purely because of the codepath default.
 *
 * Returns `null` when no rule matches, so the caller can decide the
 * ultimate default (typically 'USD'). Pure function — trivially testable
 * and side-effect free.
 */

// Suffix → currency. Ordered by likelihood / specificity (longer prefix wins
// where applicable; e.g. '.KS' must be tested before any single-char rule).
// Use uppercase suffix without leading dot — we normalize before lookup.
const SUFFIX_TO_CURRENCY: ReadonlyArray<[RegExp, string]> = [
  // United Kingdom — London Stock Exchange
  [/\.L$/i, 'GBP'],
  [/\.IL$/i, 'GBP'], // pence quote — treat as GBP for display

  // Eurozone — Germany / France / Netherlands / Italy / Spain / Belgium /
  // Portugal / Finland / Ireland / Austria
  [/\.DE$/i, 'EUR'],
  [/\.F$/i, 'EUR'], // Frankfurt
  [/\.PA$/i, 'EUR'],
  [/\.AS$/i, 'EUR'],
  [/\.MI$/i, 'EUR'],
  [/\.MC$/i, 'EUR'],
  [/\.BR$/i, 'EUR'],
  [/\.LS$/i, 'EUR'],
  [/\.HE$/i, 'EUR'],
  [/\.IR$/i, 'EUR'],
  [/\.VI$/i, 'EUR'],

  // Other Europe
  [/\.SW$/i, 'CHF'], // Switzerland
  [/\.ST$/i, 'SEK'], // Stockholm
  [/\.OL$/i, 'NOK'], // Oslo
  [/\.CO$/i, 'DKK'], // Copenhagen
  [/\.WA$/i, 'PLN'], // Warsaw

  // Asia-Pacific
  [/\.T$/i, 'JPY'],
  [/\.TYO$/i, 'JPY'],
  [/\.HK$/i, 'HKD'],
  [/\.SS$/i, 'CNY'], // Shanghai
  [/\.SZ$/i, 'CNY'], // Shenzhen
  [/\.KS$/i, 'KRW'], // KOSPI
  [/\.KQ$/i, 'KRW'], // KOSDAQ
  [/\.BO$/i, 'INR'], // Bombay
  [/\.NS$/i, 'INR'], // NSE India
  [/\.AX$/i, 'AUD'],
  [/\.SI$/i, 'SGD'],

  // Americas (non-US)
  [/\.TO$/i, 'CAD'], // Toronto
  [/\.V$/i, 'CAD'], // TSX Venture
  [/\.SA$/i, 'BRL'], // São Paulo
  [/\.MX$/i, 'MXN'],
];

// Exchange-name → currency lookup for cases where the symbol is bare but the
// `exchange` field carries the venue. Matched case-insensitively, whole word.
const EXCHANGE_TO_CURRENCY: Readonly<Record<string, string>> = {
  LSE: 'GBP',
  LON: 'GBP',
  XETRA: 'EUR',
  FRA: 'EUR',
  EPA: 'EUR', // Euronext Paris
  AMS: 'EUR', // Euronext Amsterdam
  EBR: 'EUR', // Euronext Brussels
  ELI: 'EUR', // Euronext Lisbon
  HEL: 'EUR',
  ISE: 'EUR',
  VIE: 'EUR',
  BME: 'EUR', // Madrid
  MIL: 'EUR',
  SWX: 'CHF',
  STO: 'SEK',
  OSL: 'NOK',
  CPH: 'DKK',
  WAR: 'PLN',
  TYO: 'JPY',
  TSE: 'JPY',
  HKEX: 'HKD',
  SSE: 'CNY',
  SZSE: 'CNY',
  KRX: 'KRW',
  BSE: 'INR',
  NSE: 'INR',
  ASX: 'AUD',
  SGX: 'SGD',
  TSX: 'CAD',
  TSXV: 'CAD',
  BVMF: 'BRL',
  BMV: 'MXN',
  // US venues — explicitly mapped so a caller that only knows the exchange
  // (no symbol) still gets a definite answer rather than null → USD default.
  NYSE: 'USD',
  NASDAQ: 'USD',
  AMEX: 'USD',
  ARCA: 'USD',
  BATS: 'USD',
};

/**
 * The symbol's exchange suffix — the part after its LAST dot — when it is a
 * venue we know: `SAP.DE` → 'DE', `VOLV-B.ST` → 'ST' (the hyphen separates the
 * share class, the dot the venue), `7203.T` → 'T'.
 *
 * Returns `null` for a bare symbol (`AAPL`) and for a dot that is not a venue:
 * US share classes are written the same way (`BRK.A`, `BRK.B`), so a dotted
 * symbol is only foreign when its suffix is in the table above.
 */
export function getExchangeSuffix(
  symbol: string | null | undefined,
): string | null {
  const normalized = (symbol || '').trim();
  const dot = normalized.lastIndexOf('.');
  if (dot < 0) return null;
  return SUFFIX_TO_CURRENCY.some(([pattern]) => pattern.test(normalized))
    ? normalized.slice(dot + 1).toUpperCase()
    : null;
}

/**
 * True for a symbol written the US way: bare (`AAPL`, `RDS-A`) or with a
 * share-class suffix — a dot and ONE letter that is not a venue (`BRK.A`,
 * `BRK.B`, `BF.B`). False for anything carrying an exchange suffix, whether we
 * know the venue (`SAP.DE`, `7203.T`) or not (`BBCA.JK`).
 *
 * Use this instead of `symbol.includes('.')` to tell US from non-US listings:
 * the dot alone also matches US share classes.
 */
export function isUsStyleSymbol(symbol: string | null | undefined): boolean {
  const normalized = (symbol || '').trim();
  const dot = normalized.lastIndexOf('.');
  if (dot < 0) return true;
  if (getExchangeSuffix(normalized)) return false;
  return /^[A-Za-z]$/.test(normalized.slice(dot + 1));
}

/**
 * The venues written as ONE letter (`.L` London, `.F` Frankfurt, `.T` Tokyo,
 * `.V` TSX Venture) — the only dotted one-letter endings that are NOT a US
 * share class. Derived from the suffix table, so it cannot drift from it.
 */
export const ONE_LETTER_VENUE_SUFFIXES: readonly string[] =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    .split('')
    .filter((letter) => getExchangeSuffix(`X.${letter}`) !== null);

/**
 * {@link isUsStyleSymbol} as a SQL predicate over a symbol column, for
 * queries that have to decide in the database (the analyzer's region filter).
 * `column` is a trusted column reference, never user input. Bind
 * `:oneLetterVenues` to {@link ONE_LETTER_VENUE_SUFFIXES}.
 *
 *   no dot at all                              → US-style
 *   ends in ".<one letter>" that is no venue   → US-style (BRK.B)
 *   anything else with a dot (SAP.DE, VOD.L)   → not
 *
 * test/db/region-filter.db-spec.ts checks it against isUsStyleSymbol symbol
 * by symbol on PostgreSQL.
 */
export function usStyleSymbolSql(column: string): string {
  return (
    `(${column} NOT LIKE '%.%' OR (` +
    `${column} ~ '\\.[A-Za-z]$' AND ` +
    `UPPER(RIGHT(${column}, 1)) NOT IN (:...oneLetterVenues)))`
  );
}

/**
 * Infer the native trading currency from a ticker's exchange / symbol.
 *
 * @param exchange The exchange code as returned by the data provider
 *   (e.g. 'XETRA', 'LSE', 'NASDAQ'). May be empty/undefined.
 * @param symbol  The ticker symbol (e.g. 'SAP.DE', 'BARC.L', 'AAPL'). May be
 *   empty/undefined.
 * @returns ISO 4217 currency code, or `null` when no rule matches.
 */
export function inferCurrencyFromExchange(
  exchange: string | null | undefined,
  symbol: string | null | undefined,
): string | null {
  // 1. Symbol-suffix rules win — they are stricter and the data provider's
  //    `exchange` field is sometimes generic (e.g. 'OTC').
  if (symbol) {
    for (const [pattern, currency] of SUFFIX_TO_CURRENCY) {
      if (pattern.test(symbol)) return currency;
    }
  }

  // 2. Fall back to exchange-name lookup.
  if (exchange) {
    const normalized = exchange.trim().toUpperCase();
    if (normalized in EXCHANGE_TO_CURRENCY) {
      return EXCHANGE_TO_CURRENCY[normalized];
    }
  }

  return null;
}
