import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface MarketStatusData {
    isOpen: boolean;
    holiday?: string | null;
    exchange: string;
    session: 'pre' | 'regular' | 'post' | 'closed';
    timezone?: string;
    region?: 'US' | 'EU' | 'OTHER';
    fallback?: boolean;
}

export interface AllMarketsStatusData {
    us: MarketStatusData;
    eu: MarketStatusData;
}

/**
 * Fetches market status for a specific ticker symbol.
 * Routes to Yahoo Finance for EU stocks and Finnhub for US stocks.
 */
export function useTickerMarketStatus(symbol: string, enabled: boolean = true) {
    return useQuery({
        queryKey: ['market-status', 'ticker', symbol],
        queryFn: async (): Promise<MarketStatusData> => {
            try {
                const { data } = await api.get<MarketStatusData>(`/tickers/${symbol}/status`);
                return data;
            } catch {
                return getMarketStatusFromTime('US');
            }
        },
        refetchInterval: 60000,
        staleTime: 30000,
        enabled: !!symbol && enabled,
    });
}

/**
 * Fetches status of all major markets (US and EU) for the MarketStatusBar.
 */
export function useAllMarketsStatus() {
    return useQuery({
        queryKey: ['market-status', 'all'],
        queryFn: async (): Promise<AllMarketsStatusData> => {
            try {
                const { data } = await api.get<AllMarketsStatusData>('/market/status/all');
                return data;
            } catch {
                return {
                    us: getMarketStatusFromTime('US'),
                    eu: getMarketStatusFromTime('EU'),
                };
            }
        },
        refetchInterval: 60000,
        staleTime: 30000,
    });
}

/**
 * Legacy hook for backward compatibility.
 * Returns US market status.
 */
export function useMarketStatus() {
    return useQuery({
        queryKey: ['market-status', 'US'],
        queryFn: async (): Promise<MarketStatusData> => {
            try {
                const { data } = await api.get<MarketStatusData>('/tickers/AAPL/status');
                return data;
            } catch {
                return getMarketStatusFromTime('US');
            }
        },
        refetchInterval: 60000,
        staleTime: 30000,
    });
}

/**
 * Time-based fallback for market status.
 */
function getMarketStatusFromTime(region: 'US' | 'EU'): MarketStatusData {
    const now = new Date();
    
    if (region === 'EU') {
        const cetTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
        const day = cetTime.getDay();
        const hours = cetTime.getHours();
        const minutes = cetTime.getMinutes();
        const timeInMinutes = hours * 60 + minutes;

        const isWeekday = day >= 1 && day <= 5;
        const marketOpen = 8 * 60; // 8:00 AM CET
        const marketClose = 16 * 60 + 30; // 4:30 PM CET
        const isOpen = isWeekday && timeInMinutes >= marketOpen && timeInMinutes < marketClose;

        return {
            isOpen,
            exchange: 'EU',
            session: isOpen ? 'regular' : 'closed',
            timezone: 'Europe/Berlin',
            region: 'EU',
            fallback: true,
        };
    }

    // US Market with premarket/postmarket
    const nyTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const day = nyTime.getDay();
    const hours = nyTime.getHours();
    const minutes = nyTime.getMinutes();
    const timeInMinutes = hours * 60 + minutes;

    const isWeekday = day >= 1 && day <= 5;
    const preMarketStart = 4 * 60; // 4:00 AM
    const marketOpen = 9 * 60 + 30; // 9:30 AM
    const marketClose = 16 * 60; // 4:00 PM
    const postMarketEnd = 20 * 60; // 8:00 PM

    let session: 'pre' | 'regular' | 'post' | 'closed' = 'closed';
    let isOpen = false;

    if (isWeekday) {
        if (timeInMinutes >= marketOpen && timeInMinutes < marketClose) {
            session = 'regular';
            isOpen = true;
        } else if (timeInMinutes >= preMarketStart && timeInMinutes < marketOpen) {
            session = 'pre';
        } else if (timeInMinutes >= marketClose && timeInMinutes < postMarketEnd) {
            session = 'post';
        }
    }

    return {
        isOpen,
        exchange: 'US',
        session,
        timezone: 'America/New_York',
        region: 'US',
        fallback: true,
    };
}

/**
 * Helper to get display label for market session.
 */
export function getSessionLabel(session: MarketStatusData['session']): string {
    switch (session) {
        case 'regular':
            return 'Market Open';
        case 'pre':
            // return 'Premarket'; // Disabled per user request
            return 'Closed'; 
        case 'post':
            // return 'Postmarket'; // Disabled per user request
             return 'Closed';
        case 'closed':
        default:
            return 'Closed';
    }
}

/**
 * Helper to get color class for market session.
 */
export function getSessionColor(session: MarketStatusData['session']): string {
    switch (session) {
        case 'regular':
            return 'text-emerald-500';
        case 'pre':
        case 'post':
            // return 'text-amber-500'; // Disabled per user request
            return 'text-muted-foreground';
        case 'closed':
        default:
            return 'text-muted-foreground';
    }
}

// Helpers logic to determine region
export function getRegionForStatus(symbol: string): 'US' | 'EU' {
    const s = symbol.toUpperCase();
    // Known EU Extensions
    const euExts = ['.DE', '.L', '.PA', '.AS', '.MC', '.MI', '.SW', '.VI', '.BR', '.HE', '.CO', '.ST', '.OL'];
    
    // Check for extension
    for (const ext of euExts) {
        if (s.endsWith(ext)) return 'EU';
    }
    
    return 'US';
}
