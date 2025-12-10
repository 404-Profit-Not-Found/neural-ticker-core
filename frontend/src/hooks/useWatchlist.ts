import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface Watchlist {
    id: string;
    name: string;
    items: WatchlistItem[];
}

export interface WatchlistItem {
    id: string;
    ticker: {
        id: string;
        symbol: string;
    };
    addedAt: string;
}

// Keys for query invalidation
export const watchlistKeys = {
    all: ['watchlists'] as const,
    detail: (id: string) => [...watchlistKeys.all, id] as const,
};

// --- Hooks ---

export function useWatchlists() {
    return useQuery({
        queryKey: watchlistKeys.all,
        queryFn: async () => {
            const { data } = await api.get<Watchlist[]>('/watchlists');
            return data;
        },
    });
}

export function useCreateWatchlist() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (name: string) => {
            const { data } = await api.post<Watchlist>('/watchlists', { name });
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: watchlistKeys.all });
        },
    });
}

export function useDeleteWatchlist() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            await api.delete(`/watchlists/${id}`);
            return id;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: watchlistKeys.all });
        },
    });
}

export function useRenameWatchlist() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, name }: { id: string; name: string }) => {
            await api.patch(`/watchlists/${id}`, { name });
            return { id, name };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: watchlistKeys.all });
        },
    });
}

// --- Item Management ---

export function useAddTickerToWatchlist() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ watchlistId, symbol }: { watchlistId: string; symbol: string }) => {
            const { data } = await api.post(`/watchlists/${watchlistId}/items`, { symbol });
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: watchlistKeys.all });
        },
    });
}

export function useRemoveTickerFromWatchlist() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ watchlistId, itemId }: { watchlistId: string; itemId: string }) => {
            await api.delete(`/watchlists/${watchlistId}/items/${itemId}`);
            return itemId;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: watchlistKeys.all });
        },
    });
}

// --- Market Data ---

export function useMarketSnapshots(symbols: string[]) {
    return useQuery({
        queryKey: ['market-data', 'snapshots', { symbols }],
        queryFn: async () => {
            if (symbols.length === 0) return [];
            const { data } = await api.post('/market-data/snapshots', { symbols });
            return data;
        },
        enabled: symbols.length > 0,
        staleTime: 1000 * 30, // 30s fresh
    });
}

export function useTickerSearch(query: string) {
    return useQuery({
        queryKey: ['tickers', 'search', query],
        queryFn: async () => {
            if (query.trim().length === 0) return [];
            const { data } = await api.get(`/tickers?search=${query}`);
            return data;
        },
        enabled: query.trim().length > 0,
        placeholderData: (previousData) => previousData, // keep previous results while fetching
    });
}
