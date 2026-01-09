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

    it('calls api with debounced query', async () => {
        (api.get as Mock).mockResolvedValue({ data: [] });
        renderWithContext(<GlobalSearch />);
        const input = screen.getByPlaceholderText(/search tickers/i);
        fireEvent.change(input, { target: { value: 'NA' } });
        fireEvent.change(input, { target: { value: 'NVDA' } });

        // Should not be called immediately
        expect(api.get).not.toHaveBeenCalled();

        // Wait for debounce (300ms)
        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith('/tickers', {
                params: { search: 'NVDA' },
            });
        }, { timeout: 1000 });
    });

    it('displays results and navigates on click', async () => {
        const mockResults = [
            { symbol: 'AAPL', name: 'Apple Inc', exchange: 'NASDAQ' }
        ];
        (api.get as Mock).mockResolvedValue({ data: mockResults });

        renderWithContext(<GlobalSearch />);
        const input = screen.getByPlaceholderText(/search tickers/i);
        fireEvent.change(input, { target: { value: 'AAPL' } });

        await waitFor(() => screen.getByText('Apple Inc'));

        const resultButton = screen.getByText('AAPL').closest('button');
        fireEvent.click(resultButton!);

        expect(mockNavigate).toHaveBeenCalledWith('/ticker/AAPL');
        expect((input as HTMLInputElement).value).toBe(''); // Should clear query
    });
});
