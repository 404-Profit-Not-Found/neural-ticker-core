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

// Constant empty array to prevent reference changes
const EMPTY_WATCHLISTS: Watchlist[] = [];

// --- Hooks ---

export function useWatchlists() {
  return useQuery({
    queryKey: watchlistKeys.all,
    queryFn: async () => {
      try {
        const { data } = await api.get<Watchlist[]>('/watchlists');
        return Array.isArray(data) && data.length > 0 ? data : EMPTY_WATCHLISTS;
      } catch (error) {
        console.error('Failed to fetch watchlists:', error);
        // Return the constant empty array to prevent infinite loops
        return EMPTY_WATCHLISTS;
      }
    },
    retry: 1,
    staleTime: 1000 * 60, // 1 minute
    refetchOnWindowFocus: false, // Prevent refetch on window focus
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
    mutationFn: async ({
      watchlistId,
      symbol,
    }: {
      watchlistId: string;
      symbol: string;
    }) => {
      const { data } = await api.post(`/watchlists/${watchlistId}/items`, {
        symbol,
      });
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
    mutationFn: async ({
      watchlistId,
      itemId,
    }: {
      watchlistId: string;
      itemId: string;
    }) => {
      await api.delete(`/watchlists/${watchlistId}/items/${itemId}`);
      return itemId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: watchlistKeys.all });
    },
  });
}

// --- Market Data ---

// Constant empty array for snapshots
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EMPTY_SNAPSHOTS: any[] = [];

export function useMarketSnapshots(symbols: string[]) {
  return useQuery({
    queryKey: ['market-data', 'snapshots', symbols],
    queryFn: async () => {
      if (symbols.length === 0) return EMPTY_SNAPSHOTS;
      try {
        const { data } = await api.post('/market-data/snapshots', { symbols });
        return Array.isArray(data) && data.length > 0 ? data : EMPTY_SNAPSHOTS;
      } catch (error) {
        console.error('Failed to fetch market snapshots:', error);
        return EMPTY_SNAPSHOTS;
      }
    },
    enabled: symbols.length > 0,
    placeholderData: EMPTY_SNAPSHOTS,
    staleTime: 1000 * 30, // 30s fresh
    retry: 1,
    refetchOnWindowFocus: false,
  });
}

// Constant empty array for search results
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EMPTY_SEARCH_RESULTS: any[] = [];

export function useTickerSearch(query: string) {
  return useQuery({
    queryKey: ['tickers', 'search', query],
    queryFn: async () => {
      if (query.trim().length < 2) return EMPTY_SEARCH_RESULTS;
      try {
        const { data } = await api.get(`/tickers?search=${query}`);
        return Array.isArray(data) && data.length > 0 ? data : EMPTY_SEARCH_RESULTS;
      } catch (error) {
        console.error('Failed to search tickers:', error);
        return EMPTY_SEARCH_RESULTS;
      }
    },
    enabled: query.trim().length >= 2, // Only search with 2+ characters
    placeholderData: (previousData) => previousData, // keep previous results while fetching
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: 1000 * 10, // Cache results for 10 seconds
  });
}
