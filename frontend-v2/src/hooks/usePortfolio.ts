import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

/**
 * Positions are cached per display currency, under the same key the Portfolio
 * page uses: `['portfolio', 'EUR']` is converted server-side, `['portfolio', '']`
 * (`PORTFOLIO_DISPLAY_NATIVE`) is every position in its own currency.
 * `portfolioKeys.all` matches every variant, for invalidation.
 */
export const portfolioKeys = {
    all: ['portfolio'] as const,
    positions: (currency: string) => [...portfolioKeys.all, currency] as const,
};

/** "No conversion": the same value as the selector's `PORTFOLIO_DISPLAY_NATIVE`. */
export const NATIVE_CURRENCY = '';

// Position values follow live prices. 30s is what the Portfolio page's own
// observer of this entry runs with (the client default), so every screen agrees
// on when positions are stale.
const POSITIONS_STALE_TIME = 1000 * 30;

/** The fields shared screens read; the Portfolio page has the full shape. */
export interface PortfolioPositionSummary {
    id: string;
    symbol: string;
    current_value?: number;
    cost_basis?: number;
}

/**
 * The user's positions, valued in `currency` (`NATIVE_CURRENCY` = no conversion).
 * Shares its cache entry with the Portfolio page, so opening either screen
 * warms the other.
 */
export function usePortfolioPositions<TData = PortfolioPositionSummary[]>(
    currency: string,
    select?: (positions: PortfolioPositionSummary[]) => TData,
) {
    return useQuery({
        queryKey: portfolioKeys.positions(currency),
        queryFn: async () => {
            const { data } = await api.get<PortfolioPositionSummary[]>('/portfolio/positions', {
                // Omitted in native mode, exactly as the Portfolio page does.
                params: currency ? { displayCurrency: currency } : {},
            });
            return data;
        },
        select,
        // Every portfolio mutation invalidates `portfolioKeys.all` (see
        // PortfolioPage.refetchAll), so all currency variants go stale together.
        staleTime: POSITIONS_STALE_TIME,
    });
}
