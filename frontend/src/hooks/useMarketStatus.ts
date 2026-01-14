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
    
    const timeZone = region === 'EU' ? 'Europe/Berlin' : 'America/New_York';
    
    // Robust time extraction
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
        weekday: 'short'
    });

    const parts = formatter.formatToParts(now);
    const hourPart = parts.find(p => p.type === 'hour')?.value;
    const minutePart = parts.find(p => p.type === 'minute')?.value;
    const weekdayPart = parts.find(p => p.type === 'weekday')?.value;

    if (!hourPart || !minutePart || !weekdayPart) {
         return { isOpen: false, session: 'closed', timezone: timeZone, exchange: region, region, fallback: true };
    }

    const hours = parseInt(hourPart === '24' ? '0' : hourPart, 10);
    const minutes = parseInt(minutePart, 10);
    const timeInMinutes = hours * 60 + minutes;
    
    const isWeekend = weekdayPart === 'Sat' || weekdayPart === 'Sun';
    const isWeekday = !isWeekend;
    
    if (region === 'EU') {
        const marketOpen = 8 * 60; // 8:00 AM CET
        const marketClose = 17 * 60 + 30; // 5:30 PM CET

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

    // US Market
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
        session,
        timezone: 'America/New_York',
        exchange: 'US',
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
