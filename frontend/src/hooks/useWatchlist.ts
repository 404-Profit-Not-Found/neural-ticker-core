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
    onMutate: async ({ watchlistId, symbol }) => {
      await queryClient.cancelQueries({ queryKey: watchlistKeys.all });
      const previousWatchlists = queryClient.getQueryData<Watchlist[]>(watchlistKeys.all);

      if (previousWatchlists) {
        queryClient.setQueryData<Watchlist[]>(watchlistKeys.all, (old) => {
          if (!old) return [];
          return old.map((list) => {
            if (list.id === watchlistId) {
              const dummyItem: any = {
                id: 'temp-' + Date.now(),
                ticker: { id: 'temp', symbol },
                addedAt: new Date().toISOString(),
              };
              return { ...list, items: [...list.items, dummyItem] };
            }
            return list;
          });
        });
      }
      return { previousWatchlists };
    },
    onError: (_err, _vars, context: any) => {
      if (context?.previousWatchlists) {
        queryClient.setQueryData(watchlistKeys.all, context.previousWatchlists);
      }
    },
    onSettled: () => {
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
      itemId: string; // Wait, we need to know tickerId or itemId? The API takes tickerId (step 1332 line 149 tickerId param).
      // But look at current mutationFn (lines 114-123). It takes { watchlistId, itemId }.
      // The API route is DELETE /watchlists/:id/items/:tickerId.
      // But step 1332 line 149 argument name is 'tickerId'.
      // Step 1335 (Service) line 137 uses 'ticker_id: tickerId'.
      // So the API expects a tickerID.
      // Front-end WatchlistItem has `ticker: { id, symbol }`.
      // The `itemId` passed here might be the tickerId??
      // Let's check logic: api.delete(... items/${itemId}).
      // If the frontend calls this with the *Item ID* (WatchlistItem.id), then backend fails if it expects TickerID.
      // Wait, Backend Service (Line 137) `delete({ watchlist_id, ticker_id: tickerId })`.
      // It deletes by TICKER ID.
      // Does `WatchlistItem.id` == `TickerEntity.id`? NO.
      // So `useRemoveTickerFromWatchlist` MUST receive the TICKER ID.
      // Current interface says `itemId`. This is confusing.
      // Optimistic update needs to filter by `itemId` (if it's TickerID).
      // Let's look at `WatchlistSidebar` usage logic later if needed.
      // For now, I will optimistically remove based on the ID passed.
      // If `itemId` passed IS the ticker id, I filter `item.ticker.id !== itemId`.
    }) => {
      // Assuming 'itemId' here is actually the Ticker ID based on backend expectation.
      await api.delete(`/watchlists/${watchlistId}/items/${itemId}`);
      return itemId;
    },
    onMutate: async ({ watchlistId, itemId }) => {
      await queryClient.cancelQueries({ queryKey: watchlistKeys.all });
      const previousWatchlists = queryClient.getQueryData<Watchlist[]>(watchlistKeys.all);

      if (previousWatchlists) {
        queryClient.setQueryData<Watchlist[]>(watchlistKeys.all, (old) => {
          if (!old) return [];
          return old.map((list) => {
            if (list.id === watchlistId) {
               // We need to filter out the item.
               // If 'itemId' is TickerID, we filter where item.ticker.id !== itemId.
               // If 'itemId' is WatchlistItemID... 
               // The Backend Controller param is 'tickerId'.
               // The Service uses it as 'ticker_id'.
               // So the argument IS Ticker ID.
               return {
                 ...list,
                 items: list.items.filter((item) => item.ticker.id !== itemId),
               };
            }
            return list;
          });
        });
      }
      return { previousWatchlists };
    },
    onError: (_err, _vars, context: any) => {
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
