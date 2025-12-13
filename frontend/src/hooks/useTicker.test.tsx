import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    useTickerDetails,
    useTickerNews,
    useTickerLogo,
    useTickerResearch,
    useTickerRisk,
    useTickerSocial,
    usePostComment,
    useTriggerResearch,
    useDeleteResearch,
    useUpdateResearchTitle
} from './useTicker';
import { api, httpClient } from '../lib/api';

// Mock API
vi.mock('../lib/api', () => ({
    api: {
        get: vi.fn(),
        post: vi.fn(),
        delete: vi.fn()
    },
    httpClient: {
        get: vi.fn()
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

describe('useTicker Hooks', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        queryClient.clear();
    });

    describe('useTickerDetails', () => {
        it('fetches composite details and watchers', async () => {
            (api.get as Mock)
                .mockResolvedValueOnce({ data: { symbol: 'AAPL', price: 150 } }) // composite
                .mockResolvedValueOnce({ data: { watchers: 42 } }); // watchers

            const { result } = renderHook(() => useTickerDetails('AAPL'), { wrapper });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));

            expect(result.current.data).toEqual({
                symbol: 'AAPL',
                price: 150,
                watchers: 42
            });
            expect(api.get).toHaveBeenCalledWith('/tickers/AAPL/composite');
            expect(api.get).toHaveBeenCalledWith('/social/stats/AAPL/watchers');
        });

        it('handles missing symbol', async () => {
            const { result } = renderHook(() => useTickerDetails(''), { wrapper });
            expect(result.current.data).toBeUndefined();
            expect(result.current.isLoading).toBe(false); // Should be disabled
        });
    });

    describe('useTickerNews', () => {
        it('fetches news properly', async () => {
            const mockNews = [{ id: 1, headline: 'Apple is King' }];
            (api.get as Mock).mockResolvedValueOnce({ data: mockNews });

            const { result } = renderHook(() => useTickerNews('AAPL'), { wrapper });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(result.current.data).toEqual(mockNews);
            expect(api.get).toHaveBeenCalledWith('/tickers/AAPL/news');
        });
    });

    describe('useTickerLogo', () => {
        it('fetches logo via proxy if finnhub', async () => {
            const mockBlob = new Blob(['fake-image'], { type: 'image/png' });
            (httpClient.get as Mock).mockResolvedValueOnce({ data: mockBlob });

            const { result } = renderHook(() => useTickerLogo('AAPL', 'https://finnhub.io/logo.png'), { wrapper });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            // The hook returns a data URL string from FileReader
            expect(result.current.data).toContain('data:image/png;base64');
            expect(httpClient.get).toHaveBeenCalledWith(expect.stringContaining('proxy/image'), expect.anything());
        });

        it('fetches logo via api if not finnhub', async () => {
            const mockBlob = new Blob(['fake-image'], { type: 'image/png' });
            (api.get as Mock).mockResolvedValueOnce({ data: mockBlob });

            const { result } = renderHook(() => useTickerLogo('AAPL', 'https://other.com/logo.png'), { wrapper });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(result.current.data).toContain('data:image/png;base64');
            expect(api.get).toHaveBeenCalledWith('tickers/AAPL/logo', expect.anything());
        });
    });

    describe('useTickerOthers', () => {
        it('fetches risk data', async () => {
            (api.get as Mock).mockResolvedValueOnce({ data: { score: 5 } });
            const { result } = renderHook(() => useTickerRisk('AAPL'), { wrapper });
            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(result.current.data).toEqual({ score: 5 });
        });

        it('fetches social data', async () => {
            (api.get as Mock).mockResolvedValueOnce({ data: [{ id: 1 }] });
            const { result } = renderHook(() => useTickerSocial('AAPL'), { wrapper });
            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(result.current.data).toEqual([{ id: 1 }]);
        });
    });

    describe('useTickerMutations', () => {
        it('posts a comment', async () => {
            (api.post as Mock).mockResolvedValueOnce({});
            const { result } = renderHook(() => usePostComment(), { wrapper });

            result.current.mutate({ symbol: 'AAPL', content: 'Hello' });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(api.post).toHaveBeenCalledWith('/social/comments/AAPL', { content: 'Hello' });
        });

        it('triggers research', async () => {
            (api.post as Mock).mockResolvedValueOnce({ data: { id: 'job-1' } });
            const { result } = renderHook(() => useTriggerResearch(), { wrapper });

            result.current.mutate({ symbol: 'AAPL', provider: 'gemini' });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(api.post).toHaveBeenCalledWith('/research/ask', expect.anything());
        });

        it('deletes research', async () => {
            (api.delete as Mock).mockResolvedValueOnce({});
            const { result } = renderHook(() => useDeleteResearch(), { wrapper });
            result.current.mutate('r1');
            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(api.delete).toHaveBeenCalledWith('/research/r1');
        });

        it('updates research title', async () => {
            (api.post as Mock).mockResolvedValueOnce({});
            const { result } = renderHook(() => useUpdateResearchTitle(), { wrapper });
            result.current.mutate({ id: 'r1', title: 'New Title' });
            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(api.post).toHaveBeenCalledWith('/research/r1/title', { title: 'New Title' });
        });
    });

    describe('useTickerResearch', () => {
        it('fetches research with params', async () => {
            const mockResearch = { data: [{ id: 'r1' }] };
            (api.get as Mock).mockResolvedValueOnce({ data: mockResearch });

            const { result } = renderHook(() => useTickerResearch('AAPL'), { wrapper });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(result.current.data).toEqual([{ id: 'r1' }]);
            expect(api.get).toHaveBeenCalledWith('/research', { params: { limit: 50, ticker: 'AAPL' } });
        });
    });
});
