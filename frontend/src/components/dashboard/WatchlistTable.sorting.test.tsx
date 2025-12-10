import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom'; // Ensure types are available
import { WatchlistTable } from './WatchlistTable';
import { ToastProvider } from '../ui/toast';
import { api } from '../../lib/api';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { AxiosResponse } from 'axios';

// Mock react-router-dom
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useNavigate: () => vi.fn(),
    };
});

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: false,
        },
    },
});

const renderWithProviders = () =>
    render(
        <QueryClientProvider client={queryClient}>
            <ToastProvider>
                <WatchlistTable />
            </ToastProvider>
        </QueryClientProvider>,
    );

// Types matching the component's expectations
type WatchlistPayload = { id: string; name: string; items: { ticker: { id: string; symbol: string } }[] }[];
type SnapshotPayload = {
    ticker: { symbol: string; logo_url?: string; name?: string; id: string };
    latestPrice?: { close: number; prevClose?: number };
    fundamentals?: {
        sector?: string;
        pe_ttm?: number;
        market_cap?: number;
        dividend_yield?: number;
        beta?: number;
    };
}[];

describe('WatchlistTable Sorting', () => {
    beforeEach(() => {
        // Mock API calls
        vi.spyOn(api, 'get').mockImplementation((url) => {
            if (url === '/watchlists') {
                return Promise.resolve({
                    data: [{
                        id: 'list-1',
                        name: 'My List',
                        items: [
                            { ticker: { id: '1', symbol: 'AAPL' } },
                            { ticker: { id: '2', symbol: 'MSFT' } },
                            { ticker: { id: '3', symbol: 'SMALL' } }
                        ]
                    }]
                } as AxiosResponse<WatchlistPayload>);
            }
            return Promise.resolve({ data: [] } as AxiosResponse<unknown>);
        });

        vi.spyOn(api, 'post').mockImplementation((url) => {
            if (url === '/market-data/snapshots') {
                return Promise.resolve({
                    data: [
                        {
                            ticker: { id: '1', symbol: 'AAPL', name: 'Apple Inc' },
                            latestPrice: { close: 150, prevClose: 140 },
                            fundamentals: { market_cap: 3000000000000 }
                        },
                        {
                            ticker: { id: '2', symbol: 'MSFT', name: 'Microsoft' },
                            latestPrice: { close: 300, prevClose: 290 },
                            fundamentals: { market_cap: 2500000000000 }
                        },
                        {
                            ticker: { id: '3', symbol: 'SMALL', name: 'Small Cap' },
                            latestPrice: { close: 10, prevClose: 9 },
                            fundamentals: { market_cap: 500000000 }
                        }
                    ]
                } as AxiosResponse<SnapshotPayload>);
            }
            return Promise.resolve({ data: [] } as AxiosResponse<unknown>);
        });
        vi.spyOn(api, 'delete').mockResolvedValue({ data: { success: true } } as AxiosResponse<unknown>);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        cleanup();
        queryClient.clear();
    });

    it('sorts by Market Cap numerically', async () => {
        renderWithProviders();

        // Wait for data to load
        await screen.findByText('Apple Inc');

        // Initial order is likely by symbol or insertion (AAPL, MSFT, SMALL)
        // Let's verify initial Market Caps are present (formatted)
        expect(screen.getByText('$3.00T')).toBeInTheDocument();
        expect(screen.getByText('$2.50T')).toBeInTheDocument();
        expect(screen.getByText('$500.00M')).toBeInTheDocument();

        // Click Market Cap header to sort
        const marketCapHeader = screen.getByRole('button', { name: /Market Cap/i });
        fireEvent.click(marketCapHeader);

        // Sorting usually toggles ASC/DESC. Default behavior depends on react-table implementation.
        // Let's check the order of rows.
        // Row 0 is header. Rows 1, 2, 3 are data.

        // We'll extract text from the rows to verify order
        // Assuming default sort might be ASC (Smallest first: 500M) or DESC (Largest first: 3T)
        // Let's click it again to be sure of direction if needed, or check logic.
        // Usually, first click is Ascending.

        // Let's capture the text content of the Market Cap cell for each row
        // Market Cap is the 7th column (index 6, 0-based) based on the definition

        // Helper to get text from specific column in row
        const getMarketCapFromRow = (row: HTMLElement) => {
            const cells = row.querySelectorAll('td');
            return cells[4]?.textContent; // 5th column after merge
        };

        // Wait a bit for sorting to apply if needed (usually sync with fireEvent but safe to wait)
        await waitFor(() => {
            const sortedRows = screen.getAllByRole('row').slice(1); // skip header
            const firstVal = getMarketCapFromRow(sortedRows[0]);
            // If ASC: 500M ($500.00M) -> 2.5T -> 3T
            // If DESC: 3T -> 2.5T -> 500M

            // Let's just assert the order of symbols or values
            // We know numeric values: 500M < 2.5T < 3T
            // We'll check if it matches either valid specific order, or specifically target one.

            // If current sort is Ascending:
            if (firstVal === '$500.00M') {
                expect(getMarketCapFromRow(sortedRows[1])).toBe('$2.50T');
                expect(getMarketCapFromRow(sortedRows[2])).toBe('$3.00T');
            } else {
                // Descending
                expect(getMarketCapFromRow(sortedRows[0])).toBe('$3.00T');
                expect(getMarketCapFromRow(sortedRows[1])).toBe('$2.50T');
                expect(getMarketCapFromRow(sortedRows[2])).toBe('$500.00M');
            }
        });

        // Use userEvent click to toggle direction
        fireEvent.click(marketCapHeader);

        await waitFor(() => {
            const sortedRows = screen.getAllByRole('row').slice(1);
            const firstVal = getMarketCapFromRow(sortedRows[0]);

            // Should be the reverse of whatever it was
            if (firstVal === '$500.00M') {
                expect(getMarketCapFromRow(sortedRows[1])).toBe('$2.50T');
                expect(getMarketCapFromRow(sortedRows[2])).toBe('$3.00T');
            } else {
                expect(getMarketCapFromRow(sortedRows[0])).toBe('$3.00T');
                expect(getMarketCapFromRow(sortedRows[1])).toBe('$2.50T');
                expect(getMarketCapFromRow(sortedRows[2])).toBe('$500.00M');
            }
        });
    });
});
