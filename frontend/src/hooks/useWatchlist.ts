import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
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
        if (Array.isArray(data) && data.length > 0) {
            // Sort: Favourites first, then others alphabetically
            return data.sort((a, b) => {
                if (a.name === 'Favourites') return -1;
                if (b.name === 'Favourites') return 1;
                return a.name.localeCompare(b.name);
            });
        }
        return EMPTY_WATCHLISTS;
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
    onMutate: async ({ watchlistId, itemId }) => {
      // Cancel refetches
      await queryClient.cancelQueries({ queryKey: watchlistKeys.all });

      // Snapshot previous
      const previousWatchlists = queryClient.getQueryData<Watchlist[]>(watchlistKeys.all);

      // Optimistically update
      if (previousWatchlists) {
        queryClient.setQueryData<Watchlist[]>(watchlistKeys.all, (old) => {
            if (!old) return [];
            return old.map(wl => {
                if (wl.id !== watchlistId) return wl;
                const newItems = wl.items.filter(item => item.id !== itemId);
                return {
                    ...wl,
                    items: newItems
                };
            });
        });
      }

      return { previousWatchlists };
    },
    onError: (_err, _variables, context) => {
        if (context?.previousWatchlists) {
            queryClient.setQueryData(watchlistKeys.all, context.previousWatchlists);
        }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: watchlistKeys.all });
    },
  });
}

// --- Market Data ---

// Constant empty array for snapshots
const EMPTY_SNAPSHOTS: unknown[] = [];

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
    placeholderData: keepPreviousData,
    staleTime: 1000 * 30, // 30s fresh
    retry: 1,
    refetchOnWindowFocus: false,
  });
}

// Constant empty array for search results
const EMPTY_SEARCH_RESULTS: unknown[] = [];

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

export function useToggleFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (symbol: string) => {
      console.log(`[useToggleFavorite] Mutating symbol: ${symbol}`);
      const { data } = await api.post('/watchlists/favorites/toggle', { symbol });
      console.log(`[useToggleFavorite] Mutation response for ${symbol}:`, data);
      return data;
    },
    onMutate: async (symbol) => {
      console.log(`[useToggleFavorite] Optimistic update for ${symbol}`);
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: watchlistKeys.all });

      // Snapshot the previous value
      const previousWatchlists = queryClient.getQueryData<Watchlist[]>(watchlistKeys.all);

      // Optimistically update to the new value
      if (previousWatchlists) {
        queryClient.setQueryData<Watchlist[]>(watchlistKeys.all, (old) => {
          if (!old) return [];
          return old.map(wl => {
             // Logic: Only affect 'Favourites' list
             if (wl.name !== 'Favourites') return wl;
             
             const exists = wl.items?.some(item => item.ticker.symbol === symbol);
             
             if (exists) {
                 // Remove
                 return {
                     ...wl,
                     items: wl.items.filter(item => item.ticker.symbol !== symbol)
                 };
             } else {
                 // Add (Mock)
                 const newItem: WatchlistItem = {
                     id: 'temp-id-' + Math.random(),
                     ticker: { id: 'temp-ticker-id', symbol },
                     addedAt: new Date().toISOString()
                 };
                 return {
                     ...wl,
                     items: [...(wl.items || []), newItem]
                     // items: [newItem, ...(wl.items || [])] // Add to top? Backend usually appends or specific order?
                 };
             }
          });
        });
      }

      // Return a context object with the snapshotted value
      return { previousWatchlists };
    },
    onError: (err, symbol, context) => {
      console.error(`[useToggleFavorite] Mutation error for ${symbol}:`, err);
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousWatchlists) {
        queryClient.setQueryData(watchlistKeys.all, context.previousWatchlists);
      }
    },
    onSettled: (_, __, symbol) => {
      console.log(`[useToggleFavorite] Settled for ${symbol}, invalidating queries...`);
      queryClient.invalidateQueries({ queryKey: watchlistKeys.all });
      queryClient.invalidateQueries({ queryKey: ['tickers', 'details', symbol] });
    },
  });
}

export function useFavorite(symbol?: string) {
  const { data: watchlists = [] } = useWatchlists();
  const toggleMutation = useToggleFavorite();

  const isFavorite = !!symbol && watchlists.some(wl =>
    wl.name === 'Favourites' && wl.items?.some(item => item.ticker.symbol === symbol)
  );

  const toggle = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    console.log(`[useFavorite] Toggle clicked for ${symbol}. Current isFavorite: ${isFavorite}`);
    if (symbol) {
      toggleMutation.mutate(symbol);
    } else {
        console.warn('[useFavorite] No symbol provided for toggle');
    }
  };

  return {
    isFavorite,
    toggle,
    isLoading: toggleMutation.isPending
  };
}
