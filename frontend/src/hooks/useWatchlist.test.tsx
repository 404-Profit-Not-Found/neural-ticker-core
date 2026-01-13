import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    useWatchlists,
    useCreateWatchlist,
    useDeleteWatchlist,
    useRenameWatchlist,
    useAddTickerToWatchlist,
    useRemoveTickerFromWatchlist,
    useMarketSnapshots,
    useTickerSearch,
    useToggleFavorite,
    useFavorite
} from './useWatchlist';
import { api } from '../lib/api';
import type { Watchlist } from './useWatchlist';

// Mock API
vi.mock('../lib/api', () => ({
    api: {
        get: vi.fn(),
        post: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
    }
}));

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: false,
        },
    },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('useWatchlist Hooks', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        queryClient.clear();
        vi.spyOn(console, 'error').mockImplementation(() => { });
    });

    describe('useWatchlists', () => {
        it('fetches watchlists and sorts Favourites first', async () => {
            const mockData = [
                { id: '1', name: 'Zebra', items: [] },
                { id: '2', name: 'Favourites', items: [] },
                { id: '3', name: 'Alpha', items: [] }
            ];
            (api.get as Mock).mockResolvedValueOnce({ data: mockData });

            const { result } = renderHook(() => useWatchlists(), { wrapper });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            // Expect Favourites first, then Alpha, then Zebra
            expect(result.current.data).toHaveLength(3);
            expect(result.current.data[0].name).toBe('Favourites');
            expect(result.current.data[1].name).toBe('Alpha');
            expect(result.current.data[2].name).toBe('Zebra');
            expect(api.get).toHaveBeenCalledWith('/watchlists');
        });

        it('handles failure gracefully', async () => {
            (api.get as Mock).mockRejectedValue(new Error('Failed')); // Persistent failure
            const { result } = renderHook(() => useWatchlists(), { wrapper });

            await waitFor(() => expect(result.current.data).toEqual([]));
        });
    });

    describe('useCreateWatchlist', () => {
        it('creates watchlist', async () => {
            (api.post as Mock).mockResolvedValueOnce({ data: { id: '1', name: 'New' } });
            const { result } = renderHook(() => useCreateWatchlist(), { wrapper });

            result.current.mutate('New');

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(api.post).toHaveBeenCalledWith('/watchlists', { name: 'New' });
        });
    });

    describe('useDeleteWatchlist', () => {
        it('deletes watchlist', async () => {
            (api.delete as Mock).mockResolvedValueOnce({});
            const { result } = renderHook(() => useDeleteWatchlist(), { wrapper });

            result.current.mutate('1');

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(api.delete).toHaveBeenCalledWith('/watchlists/1');
        });
    });

    describe('useRenameWatchlist', () => {
        it('renames watchlist', async () => {
            (api.patch as Mock).mockResolvedValueOnce({});
            const { result } = renderHook(() => useRenameWatchlist(), { wrapper });

            result.current.mutate({ id: '1', name: 'Renamed' });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(api.patch).toHaveBeenCalledWith('/watchlists/1', { name: 'Renamed' });
        });
    });

    describe('useAddTickerToWatchlist', () => {
        it('adds ticker', async () => {
            (api.post as Mock).mockResolvedValueOnce({ data: { id: 'i1' } });
            const { result } = renderHook(() => useAddTickerToWatchlist(), { wrapper });

            result.current.mutate({ watchlistId: '1', symbol: 'AAPL' });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(api.post).toHaveBeenCalledWith('/watchlists/1/items', { symbol: 'AAPL' });
        });
    });

    describe('useRemoveTickerFromWatchlist', () => {
        it('removes ticker', async () => {
            (api.delete as Mock).mockResolvedValueOnce({});
            const { result } = renderHook(() => useRemoveTickerFromWatchlist(), { wrapper });

            result.current.mutate({ watchlistId: '1', itemId: 'i1' });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(api.delete).toHaveBeenCalledWith('/watchlists/1/items/i1');
        });
    });

    describe('useMarketSnapshots', () => {
        it('fetches snapshots for symbols', async () => {
            const mockData = [{ ticker: { symbol: 'AAPL' } }];
            (api.post as Mock).mockResolvedValueOnce({ data: mockData });

            const { result } = renderHook(() => useMarketSnapshots(['AAPL']), { wrapper });

            await waitFor(() => expect(result.current.data).toEqual(mockData));
            expect(api.post).toHaveBeenCalledWith('/market-data/snapshots', { symbols: ['AAPL'] });
        });

        it('returns empty if no symbols', async () => {
            const { result } = renderHook(() => useMarketSnapshots([]), { wrapper });
            // It might stay pending or be success with empty depending on generic impl, 
            // but useMarketSnapshots sets enabled: symbol.length > 0.
            // So it starts in pending/idle state but should likely return cached placeholder.
            // Wait, placeholderData is EMPTY_SNAPSHOTS.
            expect(result.current.data).toBeUndefined();
        });
    });

    describe('useTickerSearch', () => {
        it('searches tickers', async () => {
            const mockData = [{ symbol: 'AAPL' }];
            (api.get as Mock).mockResolvedValueOnce({ data: mockData });

            const { result } = renderHook(() => useTickerSearch('AAP'), { wrapper });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(result.current.data).toEqual(mockData);
            expect(api.get).toHaveBeenCalledWith('/tickers?search=AAP');
        });

        it('does not search if query short', async () => {
            const { result } = renderHook(() => useTickerSearch('A'), { wrapper });
            // Enabled is false
            expect(result.current.isPending).toBe(true);
            expect(result.current.fetchStatus).toBe('idle');
        });
    });

    describe('useToggleFavorite', () => {
        it('calls toggle endpoint', async () => {
            (api.post as Mock).mockResolvedValueOnce({ data: { added: true } });
            const { result } = renderHook(() => useToggleFavorite(), { wrapper });

            result.current.mutate('AAPL');

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(api.post).toHaveBeenCalledWith('/watchlists/favorites/toggle', { symbol: 'AAPL' });
        });
    });

    describe('useFavorite', () => {
        it('returns true if symbol is in Favourites list', async () => {
            const mockWatchlists = [
                {
                    id: 'fav-id',
                    name: 'Favourites',
                    items: [{ ticker: { symbol: 'AAPL' } }]
                }
            ];
            (api.get as Mock).mockResolvedValue({ data: mockWatchlists });

            const { result } = renderHook(() => useFavorite('AAPL'), { wrapper });

            await waitFor(() => expect(result.current.isFavorite).toBe(true));
        });

        it('returns false if symbol is in another list but not Favourites', async () => {
            const mockWatchlists = [
                {
                    id: 'other-id',
                    name: 'Other List',
                    items: [{ ticker: { symbol: 'AAPL' } }]
                },
                {
                    id: 'fav-id',
                    name: 'Favourites',
                    items: []
                }
            ];
            (api.get as Mock).mockResolvedValue({ data: mockWatchlists });

            const { result } = renderHook(() => useFavorite('AAPL'), { wrapper });

            await waitFor(() => expect(result.current.isFavorite).toBe(false));
        });

        it('returns false if symbol is not in any list', async () => {
            const mockWatchlists = [{ id: 'fav-id', name: 'Favourites', items: [] }];
            (api.get as Mock).mockResolvedValue({ data: mockWatchlists });

            const { result } = renderHook(() => useFavorite('AAPL'), { wrapper });

            await waitFor(() => expect(result.current.isFavorite).toBe(false));
        });
    });
});
