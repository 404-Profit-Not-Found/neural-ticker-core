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
                            fundamentals: { market_cap: 3000000000000 },
                            aiAnalysis: { upside_percent: 25.5, overall_score: 4 }
                        },
                        {
                            ticker: { id: '2', symbol: 'MSFT', name: 'Microsoft' },
                            latestPrice: { close: 300, prevClose: 290 },
                            fundamentals: { market_cap: 2500000000000 },
                            aiAnalysis: { upside_percent: 10.0, overall_score: 3 }
                        },
                        {
                            ticker: { id: '3', symbol: 'SMALL', name: 'Small Cap' },
                            latestPrice: { close: 10, prevClose: 9 },
                            fundamentals: { market_cap: 500000000 },
                            aiAnalysis: { upside_percent: -5.0, overall_score: 8 }
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

    it('sorts by Potential Upside numerically', async () => {
        renderWithProviders();

        // Wait for data to load
        await screen.findByText('Apple Inc');

        // Initial check for formatted upside values
        expect(screen.getByText('25.5%')).toBeInTheDocument();
        expect(screen.getByText('10.0%')).toBeInTheDocument();
        expect(screen.getByText('-5.0%')).toBeInTheDocument();

        // Click Potential Upside header to sort
        const upsideHeader = screen.getByRole('button', { name: /Potential Upside/i });
        fireEvent.click(upsideHeader);

        // Helper to get text from specific column in row
        const getUpsideFromRow = (row: HTMLElement) => {
            const cells = row.querySelectorAll('td');
            // Columns: Symbol(0), Price(1), Change(2), Potential Upside(3)
            return cells[3]?.textContent;
        };

        // Wait a bit for sorting to apply
        await waitFor(() => {
            const sortedRows = screen.getAllByRole('row').slice(1); // skip header
            const firstVal = getUpsideFromRow(sortedRows[0]);

            // Numeric Sort: -5.0 < 10.0 < 25.5

            // If Ascending: -5.0% -> 10.0% -> 25.5%
            if (firstVal === '-5.0%') {
                expect(getUpsideFromRow(sortedRows[1])).toBe('10.0%');
                expect(getUpsideFromRow(sortedRows[2])).toBe('25.5%');
            } else {
                // Descending: 25.5% -> 10.0% -> -5.0%
                expect(getUpsideFromRow(sortedRows[0])).toBe('25.5%');
                expect(getUpsideFromRow(sortedRows[1])).toBe('10.0%');
                expect(getUpsideFromRow(sortedRows[2])).toBe('-5.0%');
            }
        });

        // Toggle direction
        fireEvent.click(upsideHeader);

        await waitFor(() => {
            const sortedRows = screen.getAllByRole('row').slice(1);
            const firstVal = getUpsideFromRow(sortedRows[0]);

            // Should be reversed
            if (firstVal === '-5.0%') {
                expect(getUpsideFromRow(sortedRows[1])).toBe('10.0%');
                expect(getUpsideFromRow(sortedRows[2])).toBe('25.5%');
            } else {
                expect(getUpsideFromRow(sortedRows[0])).toBe('25.5%');
                expect(getUpsideFromRow(sortedRows[1])).toBe('10.0%');
                expect(getUpsideFromRow(sortedRows[2])).toBe('-5.0%');
            }
        });
    });
});
