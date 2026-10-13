import { useEffect, useState } from 'react';
import { AdminService } from '../../services/adminService';

export interface RequestTickerInfo {
    name?: string;
    exchange?: string;
}

/**
 * Name and exchange of a requested symbol, when the ticker is already known
 * to the system (typically once the request has been approved).
 */
export function useRequestTickerInfo(symbol: string): RequestTickerInfo | null {
    const [info, setInfo] = useState<RequestTickerInfo | null>(null);

    useEffect(() => {
        let current = true;
        const fetchInfo = async () => {
            try {
                const results = await AdminService.searchTickersAdmin(symbol);
                const match = results.find((r) => r.symbol === symbol);
                if (match && current) setInfo({ name: match.name, exchange: match.exchange });
            } catch {
                // The row works without it: the symbol is what was requested.
                console.error('Failed to fetch info for', symbol);
            }
        };
        void fetchInfo();
        return () => {
            current = false;
        };
    }, [symbol]);

    return info;
}
