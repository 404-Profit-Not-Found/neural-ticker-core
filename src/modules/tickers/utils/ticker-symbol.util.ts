// Ticker symbols are uppercase alphanumerics plus dot/hyphen (e.g. BRK.B,
// RDS-A, VOLV-B.ST), max 10 chars. The one format check for a symbol that
// comes from a client, before it is used in a lookup or sent to a data
// provider.
export const TICKER_SYMBOL_REGEX = /^[A-Z0-9.-]{1,10}$/;

/** Trimmed and upper-cased, the form symbols are stored and compared in. */
export function normalizeTickerSymbol(symbol: unknown): string {
  return typeof symbol === 'string' ? symbol.trim().toUpperCase() : '';
}
