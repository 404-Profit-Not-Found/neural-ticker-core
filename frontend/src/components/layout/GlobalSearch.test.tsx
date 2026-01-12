import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GlobalSearch } from './GlobalSearch';
import { api } from '../../lib/api';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { Mock } from 'vitest';

// Mock API
vi.mock('../../lib/api', () => ({
    api: {
        get: vi.fn(),
    },
    cn: (...args: (string | boolean | undefined)[]) => args.filter(Boolean).join(' '),
}));

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: false,
        },
    },
});

describe('GlobalSearch', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        queryClient.clear();
    });

    const renderWithContext = (ui: React.ReactNode) => {
        return render(
            <QueryClientProvider client={queryClient}>
                <MemoryRouter>
                    {ui}
                </MemoryRouter>
            </QueryClientProvider>
        );
    };

    it('updates query on input change', () => {
        renderWithContext(<GlobalSearch />);
        const input = screen.getByPlaceholderText(/search tickers/i) as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'AAPL' } });
        expect(input.value).toBe('AAPL');
    });

    it('calls api with debounced query (works for 1+ char)', async () => {
        (api.get as Mock).mockResolvedValue({ data: [] });
        renderWithContext(<GlobalSearch />);
        const input = screen.getByPlaceholderText(/search tickers/i);
        fireEvent.change(input, { target: { value: 'N' } });
        fireEvent.change(input, { target: { value: 'NVDA' } });

        // Should not be called immediately
        expect(api.get).not.toHaveBeenCalled();

        // Wait for debounce (300ms)
        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith('/tickers', {
                params: { search: 'NVDA', external: 'false' },
            });
        }, { timeout: 1000 });
    });

    it('triggers external search on Enter when local results are empty', async () => {
        (api.get as Mock).mockResolvedValueOnce({ data: [] }); // Local search returns empty
        renderWithContext(<GlobalSearch />);
        const input = screen.getByPlaceholderText(/search tickers/i);

        // Type query
        fireEvent.change(input, { target: { value: 'UNKNOWN' } });

        // Wait for debounce local search
        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith('/tickers', {
                params: { search: 'UNKNOWN', external: 'false' },
            });
        });

        // Press Enter
        fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 });

        // Verify external search is triggered
        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith('/tickers', {
                params: { search: 'UNKNOWN', external: 'true' },
            });
        });

    });

    it('displays results and navigates on click', async () => {
        const mockResults = [
            { symbol: 'AAPL', name: 'Apple Inc', exchange: 'NASDAQ', is_locally_tracked: true }
        ];
        (api.get as Mock).mockResolvedValue({ data: mockResults });

        renderWithContext(<GlobalSearch />);
        const input = screen.getByPlaceholderText(/search tickers/i);
        fireEvent.change(input, { target: { value: 'AAPL' } });

        await waitFor(() => expect(screen.getByText('Apple Inc')).toBeDefined());

        const resultButton = screen.getByText('AAPL').closest('div');
        fireEvent.click(resultButton!);

        expect(mockNavigate).toHaveBeenCalledWith('/ticker/AAPL');
        expect((input as HTMLInputElement).value).toBe(''); // Should clear query
    });
});
