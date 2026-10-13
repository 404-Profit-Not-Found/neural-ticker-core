/**
 * Market region of a holding, for the Portfolio "Market" filter.
 *
 * Mirrors the backend so the filter means the same here as on the Tickers page:
 *  - `getExchangeSuffix` (src/modules/tickers/utils/exchange-currency.util.ts):
 *    the part after the last dot is a venue only when it is in the known table
 *    — `BRK.B` is a US share class, not a venue;
 *  - `MarketStatusService.getRegion` (src/modules/market-data/market-status.service.ts):
 *    a known venue is EU when it is in the EU set, otherwise neither EU nor US;
 *    no known venue means US.
 * Keep the two lists below in step with those files.
 */
const KNOWN_VENUE_SUFFIXES = new Set([
    'L', 'IL', 'DE', 'F', 'PA', 'AS', 'MI', 'MC', 'BR', 'LS', 'HE', 'IR', 'VI', 'SW', 'ST', 'OL', 'CO', 'WA',
    'T', 'TYO', 'HK', 'SS', 'SZ', 'KS', 'KQ', 'BO', 'NS', 'AX', 'SI', 'TO', 'V', 'SA', 'MX',
]);
const EU_SUFFIXES = new Set(['DE', 'L', 'PA', 'AS', 'MC', 'MI', 'SW', 'VI', 'BR', 'HE', 'CO', 'ST', 'OL']);

export type PositionRegion = 'US' | 'EU' | 'OTHER';

export function positionRegion(symbol: string | null | undefined): PositionRegion {
    const normalized = (symbol || '').trim().toUpperCase();
    const dot = normalized.lastIndexOf('.');
    if (dot > 0) {
        const suffix = normalized.slice(dot + 1);
        if (KNOWN_VENUE_SUFFIXES.has(suffix)) return EU_SUFFIXES.has(suffix) ? 'EU' : 'OTHER';
        // An unknown multi-letter suffix is some other venue; one letter is a share class.
        if (suffix.length >= 2) return 'OTHER';
    }
    return 'US';
}
