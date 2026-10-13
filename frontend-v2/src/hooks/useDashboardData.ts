import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

/** Window behind the dashboard's "AI Reports (24h)" pill. */
const RECENT_RESEARCH_HOURS = 24;

// Keys follow the resource they read, like the rest of the app
// (`['tickers', …]`, `['research', …]`), so prefix invalidations keep working.
export const dashboardKeys = {
    tickerCount: ['tickers', 'count'] as const,
    strongBuy: ['stats', 'strong-buy'] as const,
    sell: ['stats', 'sell'] as const,
    recentResearch: ['research', 'recent-count', RECENT_RESEARCH_HOURS] as const,
};

// Counts and rating stats only move when the scanner or a research run
// finishes. A minute of staleness is invisible on a stat pill, and it stops
// every visit to the dashboard from refetching all of them.
const STATS_STALE_TIME = 1000 * 60;

interface CountResponse {
    count: number;
}

interface RatingStatsResponse {
    count: number;
    symbols: string[];
}

interface ResearchListResponse {
    total?: number;
}

const selectCount = (data: CountResponse | undefined) => data?.count;
const selectTotal = (data: ResearchListResponse | undefined) => data?.total || 0;

/** Number of tickers in the database (`GET /tickers/count`). */
export function useTickerCount() {
    return useQuery({
        queryKey: dashboardKeys.tickerCount,
        queryFn: async () => {
            const { data } = await api.get<CountResponse>('/tickers/count');
            return data;
        },
        select: selectCount,
        staleTime: STATS_STALE_TIME,
    });
}

/** Tickers rated Strong Buy by both analysts and the AI (`GET /stats/strong-buy`). */
export function useStrongBuyCount() {
    return useQuery({
        queryKey: dashboardKeys.strongBuy,
        queryFn: async () => {
            const { data } = await api.get<RatingStatsResponse>('/stats/strong-buy');
            return data;
        },
        select: selectCount,
        staleTime: STATS_STALE_TIME,
    });
}

/** Tickers rated Sell by both analysts and the AI (`GET /stats/sell`). */
export function useSellCount() {
    return useQuery({
        queryKey: dashboardKeys.sell,
        queryFn: async () => {
            const { data } = await api.get<RatingStatsResponse>('/stats/sell');
            return data;
        },
        select: selectCount,
        staleTime: STATS_STALE_TIME,
    });
}

/**
 * How many of the user's research notes were created in the last 24 hours.
 * Only `total` is read, hence `limit: 1`.
 */
export function useRecentResearchCount() {
    return useQuery({
        queryKey: dashboardKeys.recentResearch,
        queryFn: async () => {
            const { data } = await api.get<ResearchListResponse>('/research', {
                params: { since: RECENT_RESEARCH_HOURS, limit: 1 },
            });
            return data;
        },
        select: selectTotal,
        staleTime: STATS_STALE_TIME,
    });
}
