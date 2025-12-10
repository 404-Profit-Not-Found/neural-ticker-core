import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, httpClient } from '../lib/api';

// Keys
export const tickerKeys = {
    all: ['tickers'] as const,
    details: (symbol: string) => [...tickerKeys.all, 'details', symbol] as const,
    news: (symbol: string) => [...tickerKeys.all, 'news', symbol] as const,
    risk: (symbol: string) => [...tickerKeys.all, 'risk', symbol] as const,
    social: (symbol: string) => [...tickerKeys.all, 'social', symbol] as const,
    research: (symbol: string) => [...tickerKeys.all, 'research', symbol] as const,
    logo: (symbol: string) => [...tickerKeys.all, 'logo', symbol] as const,
};

export function useTickerLogo(symbol: string, url?: string) {
    return useQuery({
        queryKey: tickerKeys.logo(symbol),
        queryFn: async () => {
            if (!url) return null;
            const isProxy = url.includes('finnhub.io');
            
            let blob: Blob;
            try {
                if (isProxy) {
                     const res = await httpClient.get(`api/proxy/image?url=${encodeURIComponent(url)}`, { responseType: 'blob' });
                     blob = res.data;
                } else {
                     const res = await api.get(`tickers/${symbol}/logo`, { responseType: 'blob' });
                     blob = res.data;
                }
            } catch (e) {
                // Fallback
                if (url && !isProxy) {
                     const res = await httpClient.get(`api/proxy/image?url=${encodeURIComponent(url)}`, { responseType: 'blob' });
                     blob = res.data;
                } else {
                    throw e;
                }
            }

            // Convert to Base64 for reliable JSON/IDB persistence
            return new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        },
        // Cache for 7 days
        staleTime: 1000 * 60 * 60 * 24 * 7, 
        gcTime: 1000 * 60 * 60 * 24 * 7, 
        enabled: !!symbol && !!url,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });
}

export function useTickerDetails(symbol?: string) {
    return useQuery({
        queryKey: tickerKeys.details(symbol || ''),
        queryFn: async () => {
            if (!symbol) return null;
            // Parallel fetch: Snapshot, Watcher Count
            const [snapshotRes, watchersRes] = await Promise.all([
                api.get(`/tickers/${symbol}/snapshot`),
                api.get(`/social/stats/${symbol}/watchers`).catch(() => ({ data: { watchers: 0 } }))
            ]);
            return {
                ...snapshotRes.data,
                watchers: watchersRes.data.watchers
            };
        },
        enabled: !!symbol,
        staleTime: 1000 * 60, // 1 min stale
    });
}

export function useTickerNews(symbol?: string) {
    return useQuery({
        queryKey: tickerKeys.news(symbol || ''),
        queryFn: async () => {
            if (!symbol) return [];
            const res = await api.get(`/tickers/${symbol}/news`);
            return res.data || [];
        },
        enabled: !!symbol,
        staleTime: 1000 * 60 * 5, // 5 min
    });
}

export function useTickerRisk(symbol?: string) {
    return useQuery({
        queryKey: tickerKeys.risk(symbol || ''),
        queryFn: async () => {
            if (!symbol) return null;
            const res = await api.get(`/tickers/${symbol}/risk-reward`);
            return res.data;
        },
        enabled: !!symbol,
        staleTime: 1000 * 60 * 5, // 5 min
    });
}

export function useTickerSocial(symbol?: string) {
    return useQuery({
        queryKey: tickerKeys.social(symbol || ''),
        queryFn: async () => {
             if (!symbol) return [];
             const res = await api.get(`/social/comments/${symbol}`);
             return res.data || [];
        },
        enabled: !!symbol,
        staleTime: 1000 * 30, // 30s
    });
}

export function usePostComment() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ symbol, content }: { symbol: string, content: string }) => {
            await api.post(`/social/comments/${symbol}`, { content });
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: tickerKeys.social(variables.symbol) });
        },
    });
}

// Research is tricky because of polling. 
// We can use useQuery for fetching completed research, and manual mutation for triggering.
export function useTickerResearch(symbol?: string) {
    return useQuery({
        queryKey: tickerKeys.research(symbol || ''),
        queryFn: async () => {
            if (!symbol) return null;
            const res = await api.get('/research');
            // Client side filtering for latest completed
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const relevant = res.data?.data?.find((t: any) => t.tickers.includes(symbol) && t.status === 'completed');
            return relevant || null;
        },
        enabled: !!symbol,
        staleTime: 1000 * 60 * 10, // 10 min
    });
}

export function useTriggerResearch() {
     const queryClient = useQueryClient();
     return useMutation({
        mutationFn: async (symbol: string) => {
             const res = await api.post('/research/ask', {
                tickers: [symbol],
                question: `Deep dive analysis into ${symbol}`,
                quality: 'deep'
            });
            return res.data;
        },
        onSuccess: (_, symbol) => {
            // We might want to invalidate, but polling is usually manual or requires specialized logic.
            // For now, simpler to just return the ticket ID.
            queryClient.invalidateQueries({ queryKey: tickerKeys.research(symbol) });
        }
    });
}
