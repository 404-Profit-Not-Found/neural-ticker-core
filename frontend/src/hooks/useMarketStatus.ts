import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface MarketStatusData {
    isOpen: boolean;
    holiday?: string | null;
    exchange: string;
    session?: string;
    timezone?: string;
    t?: number;
}

export function useMarketStatus() {
    return useQuery({
        queryKey: ['market-status', 'US'],
        queryFn: async () => {
            try {
                const { data } = await api.get<MarketStatusData | null>('/tickers/US/status', { params: { exchange: 'US' } });
                
                // If API returns null (e.g., Finnhub plan restriction), use local time-based fallback
                if (!data) {
                    return getMarketStatusFromTime();
                }
                return data;
            } catch {
                // On any error, use fallback
                return getMarketStatusFromTime();
            }
        },
        refetchInterval: 60000, // Check every minute
        staleTime: 30000,
    });
}

/**
 * Simple heuristic: US market is open Mon-Fri, 9:30 AM - 4:00 PM ET.
 * This is a fallback when Finnhub API is unavailable.
 */
function getMarketStatusFromTime(): MarketStatusData {
    const now = new Date();
    // Get current time in New York timezone
    const nyTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const day = nyTime.getDay(); // 0 = Sunday, 6 = Saturday
    const hours = nyTime.getHours();
    const minutes = nyTime.getMinutes();
    const timeInMinutes = hours * 60 + minutes;

    // Market hours: 9:30 AM (570 min) to 4:00 PM (960 min)
    const isWeekday = day >= 1 && day <= 5;
    const isMarketHours = timeInMinutes >= 570 && timeInMinutes < 960;
    const isOpen = isWeekday && isMarketHours;

    return {
        isOpen,
        exchange: 'US',
        session: isOpen ? 'market' : 'closed',
        timezone: 'America/New_York',
    };
}
