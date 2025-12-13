import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useStockAnalyzer } from './useStockAnalyzer';
import { api } from '../lib/api';

// Mock API
vi.mock('../lib/api', () => ({
    api: {
        get: vi.fn(),
    }
}));

const queryClient = new QueryClient();

const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('useStockAnalyzer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        queryClient.clear();
    });

    it('fetches stock analysis data with params', async () => {
        const mockData = { items: [], total: 0 };
        (api.get as any).mockResolvedValueOnce({ data: mockData });

        const params = {
            page: 1,
            limit: 10,
            sortBy: 'market_cap',
            sortDir: 'DESC' as const,
            search: ''
        };

        const { result } = renderHook(() => useStockAnalyzer(params), { wrapper });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        expect(result.current.data).toEqual(mockData);
        expect(api.get).toHaveBeenCalledWith('/market-data/analyzer', { params });
    });

    it('fetches stock analysis data with updated filters', async () => {
        const mockData = { items: [{ id: 1 }], total: 1 };
        (api.get as any).mockResolvedValueOnce({ data: mockData });

        const params = {
            page: 2,
            search: 'AAPL',
            sortBy: 'pe',
            sortDir: 'ASC' as const,
            limit: 20
        };

        const { result } = renderHook(() => useStockAnalyzer(params), { wrapper });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        expect(result.current.data).toEqual(mockData);
        expect(api.get).toHaveBeenCalledWith('/market-data/analyzer', {
            params
        });
    });
});
