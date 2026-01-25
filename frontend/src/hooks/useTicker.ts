import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

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

// Simplified hook that just returns the DB endpoint URL
export function useTickerLogo(symbol: string) {
    // If no symbol, return null immediately
    if (!symbol) return { data: null, isLoading: false, isError: true };

    // We don't even need to fetch. The URL is deterministic.
    // The TickersController serves cached logos from DB at this endpoint.
    // We append a timestamp/version if we want to bust cache, but cache-control handles it.
    // We just return the URL string. TickerLogo can use it directly in <img src="..." />
    // However, to keep API compatible with existing consuming code that expects { data: string },
    // we'll return a mock query object or just use a simple state.

    // Actually, TickerLogo expects { data, isLoading, isError }.
    // Let's just return a static object since we trust the endpoint exists (or 404s handled by img onError).
    
    // BUT checking for "isValid" might be useful.
    // Let's make a HEAD request to check if it exists? 
    // No, that's extra latency. Just assume it works and handling onError in UI is better.
    
    // Wait, TickerLogo logic is: if (!data) showPlaceholder.
    // If we just return the string, it will always show the image tag.
    // That's fine, the image tag onError can hide itself.
    
    return {
        data: `/api/v1/tickers/${symbol}/logo`,
        isLoading: false,
        isError: false
    };
}

export function useTickerDetails(symbol?: string) {
    return useQuery({
        queryKey: tickerKeys.details(symbol || ''),
        queryFn: async () => {
            if (!symbol) return null;
            // Parallel fetch: Composite Data, Watcher Count
            const [compositeRes, watchersRes] = await Promise.all([
                api.get(`/tickers/${symbol}/composite`),
                api.get(`/social/stats/${symbol}/watchers`).catch(() => ({ data: { watchers: 0 } }))
            ]);
            return {
                ...compositeRes.data,
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
        queryKey: tickerKeys.research(symbol || 'all'), // Changed to distinct key if symbol exists
        queryFn: async () => {
            // If no symbol, we might want to return empty or all, but here we expect usage context
            // But API now supports filtering.
            const params: Record<string, string | number> = { limit: 50 }; // Increased limit
            if (symbol) {
                params.ticker = symbol;
            }
            
            const res = await api.get('/research', { params });
            // API returns paginated structure { data: [], total, ... }
            return res.data?.data || [];
        },
        enabled: !!symbol,
        staleTime: 0, 
        refetchInterval: (query) => {
            const data = query.state.data as Array<{ status: string }> | undefined;
            // If data is not yet available (initial load), we might want to poll briefly or wait.
            // But if we have data, check statuses.
            if (data?.some((item) => item.status === 'processing' || item.status === 'pending')) {
                return 5000; // Poll every 5s if analysis is in progress
            }
            return false;
        }
    });
}

export function useTriggerResearch() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ symbol, provider, quality, question }: { symbol: string; provider?: 'openai' | 'gemini' | 'ensemble'; quality?: 'low' | 'medium' | 'high' | 'deep'; question?: string }) => {
            const res = await api.post('/research/ask', {
                tickers: [symbol],
                question: question || `Deep dive analysis into ${symbol}`,
                quality: quality || 'deep',
                provider: provider || 'gemini'
            });
            return res.data;
        },
        onSuccess: (_, variables) => {
            // We might want to invalidate, but polling is usually manual or requires specialized logic.
            // For now, simpler to just return the ticket ID.
            queryClient.invalidateQueries({ queryKey: tickerKeys.research(variables.symbol) });
            // FORCE UPDATE GLOBAL INDICATOR
            queryClient.invalidateQueries({ queryKey: ['research', 'active-count'] });
        }
    });
}

export function useDeleteResearch() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            await api.delete(`/research/${id}`);
        },
        onSuccess: () => {
            // Invalidate all research queries
            queryClient.invalidateQueries({ queryKey: tickerKeys.all }); 
        },
    });
}

export function useUpdateResearchTitle() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, title }: { id: string; title: string }) => {
            await api.post(`/research/${id}/title`, { title });
        },
        onSuccess: () => {
             queryClient.invalidateQueries({ queryKey: tickerKeys.all });
        }
    });
}



export function useActiveResearchCount() {
    return useQuery({
        queryKey: ['research', 'active-count'],
        queryFn: async () => {
            // Fetch recent research to check status
            // Ideally backend supports status filtering, but we can fetch recent 20 and check.
            const res = await api.get('/research', { params: { limit: 20 } });
            const items = (res.data?.data || []) as { status: string }[];
            return items.filter(i => i.status !== 'completed' && i.status !== 'failed').length;
        },
        refetchInterval: (query) => {
            const count = query.state.data as number | undefined;
            if (count && count > 0) {
                return 5000; // Poll every 5s if we have active items
            }
            return 60000; // Poll only once per minute if idle
        },
        staleTime: 0,
    });
}



