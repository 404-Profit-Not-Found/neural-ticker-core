import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Dashboard } from './Dashboard';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Hoist the mock function so it can be used inside vi.mock
const { mockNavigate } = vi.hoisted(() => {
    return { mockNavigate: vi.fn() };
});

vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router-dom')>();
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({
        user: { uid: 'test-user', email: 'test@example.com' },
        loading: false
    })
}));

vi.mock('../context/CurrencyContext', () => ({
    useCurrency: () => ({
        displayCurrency: 'USD',
        formatCurrency: (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val),
        formatNative: (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val),
        convert: (amount: number) => amount,
        rates: {},
        loading: false,
    }),
}));

// Mock Hooks
vi.mock('../hooks/useTicker', () => ({
    useTickerResearch: vi.fn(),
    useTriggerResearch: vi.fn(),
    useActiveResearchCount: vi.fn() // Also mocked to avoid warnings
}));
vi.mock('../hooks/useStockAnalyzer', () => ({
    useStockAnalyzer: vi.fn()
}));
// The stat pills read through the real query cache; only the network is faked.
vi.mock('../lib/api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../lib/api')>();
    return {
        ...actual,
        api: { get: vi.fn() },
    };
});

import '@testing-library/jest-dom';

// Mock Components
vi.mock('../components/dashboard/TickerCarousel', () => ({
    TickerCarousel: ({ data, isLoading }: { data: unknown[]; isLoading?: boolean }) => (
        <div data-testid="watchlist-grid" data-loading={isLoading ? 'yes' : 'no'}>
            Grid Items: {data.length}
        </div>
    )
}));

vi.mock('../components/dashboard/NewsFeed', () => ({
    NewsFeed: () => <div data-testid="news-feed">Latest Research Notes</div>
}));

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
}));

// Mock Chart to avoid canvas issues
vi.mock('recharts', () => ({
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

import { useTickerResearch, useTriggerResearch, useActiveResearchCount } from '../hooks/useTicker';
import { useStockAnalyzer } from '../hooks/useStockAnalyzer';
import { api } from '../lib/api';
import { dashboardKeys } from '../hooks/useDashboardData';
import { portfolioKeys } from '../hooks/usePortfolio';

type ApiResponses = Record<string, unknown>;

const defaultResponses: ApiResponses = {
    '/tickers/count': { count: 100 },
    '/stats/strong-buy': { count: 5, symbols: [] },
    '/stats/sell': { count: 3, symbols: [] },
    '/portfolio/positions': [
        { id: 'p1', symbol: 'AAPL', current_value: 1500, cost_basis: 1000 },
        { id: 'p2', symbol: 'MSFT', current_value: 900, cost_basis: 1000 },
    ],
    '/research': { data: [], total: 50 },
};

/** Answer each endpoint from `responses`; a missing or Error entry rejects. */
function mockApi(responses: ApiResponses) {
    (api.get as Mock).mockImplementation((url: string) => {
        const response = responses[url];
        if (response === undefined || response instanceof Error) {
            return Promise.reject(response ?? new Error(`Unexpected GET ${url}`));
        }
        return Promise.resolve({ data: response });
    });
}

describe('Dashboard', () => {
    const mockTriggerResearch = vi.fn();
    let queryClient: QueryClient;

    beforeEach(() => {
        vi.clearAllMocks();
        mockNavigate.mockClear(); // Clear the hoisted mock
        // A fresh cache per test; no retries so failures surface immediately.
        queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        mockApi(defaultResponses);

        // Default Mock Returns
        (useTickerResearch as Mock).mockReturnValue({
            data: [],
            isLoading: false
        });
        (useTriggerResearch as Mock).mockReturnValue({
            mutate: mockTriggerResearch,
            isPending: false
        });

        (useActiveResearchCount as Mock).mockReturnValue({
            data: 0,
            isLoading: false
        });

        (useStockAnalyzer as Mock).mockReturnValue({
            data: { items: [] },
            isLoading: false
        });
    });

    const renderDashboard = () => {
        return render(
            <QueryClientProvider client={queryClient}>
                <BrowserRouter>
                    <Dashboard />
                </BrowserRouter>
            </QueryClientProvider>
        );
    };

    /** Put every stat in the cache as if fetched ten minutes ago (stale). */
    const seedStaleCache = () => {
        const updatedAt = Date.now() - 10 * 60 * 1000;
        queryClient.setQueryData(dashboardKeys.tickerCount, { count: 77 }, { updatedAt });
        queryClient.setQueryData(dashboardKeys.strongBuy, { count: 8, symbols: [] }, { updatedAt });
        queryClient.setQueryData(dashboardKeys.sell, { count: 4, symbols: [] }, { updatedAt });
        queryClient.setQueryData(dashboardKeys.recentResearch, { data: [], total: 12 }, { updatedAt });
        queryClient.setQueryData(
            portfolioKeys.positions('USD'),
            [{ id: 'p1', symbol: 'AAPL', current_value: 3000, cost_basis: 2000 }],
            { updatedAt },
        );
    };

    const expectSeededStats = () => {
        expect(screen.getByText('77')).toBeTruthy(); // Tickers
        expect(screen.getByText('8')).toBeTruthy(); // Strong Buy
        expect(screen.getByText('4')).toBeTruthy(); // Sell
        expect(screen.getByText('12')).toBeTruthy(); // AI Reports (24h)
        expect(screen.getByText('$3,000')).toBeTruthy(); // Portfolio value
        expect(screen.getByText('+50.00%')).toBeTruthy(); // Portfolio gain
        expect(screen.queryByText('...')).toBeNull();
    };

    it('renders dashboard layout with stats', async () => {
        renderDashboard();
        // Stats should be visible
        expect(screen.getByText('Tracked')).toBeTruthy();
        expect(await screen.findByText('100')).toBeTruthy(); // Tickers count
        expect(screen.getAllByText('Strong buy').length).toBeGreaterThan(0);
        expect((await screen.findAllByText('5')).length).toBeGreaterThan(0); // Strong Buy count
        expect(await screen.findByText('3')).toBeTruthy(); // Sell count
        expect(await screen.findByText('50')).toBeTruthy(); // AI Reports (24h)
    });

    it('treats the previous strategy\'s rows as loading, not as this strategy\'s answer', async () => {
        // What the query returns right after YOLO → Shorts: still the old rows.
        (useStockAnalyzer as Mock).mockReturnValue({
            data: { items: [] },
            isLoading: false,
            isPlaceholderData: true,
        });
        renderDashboard();
        expect(await screen.findByTestId('watchlist-grid')).toHaveAttribute('data-loading', 'yes');
    });

    it('stops loading once the strategy has its own rows', async () => {
        renderDashboard();
        expect(await screen.findByTestId('watchlist-grid')).toHaveAttribute('data-loading', 'no');
    });

    it('shows placeholders until the stats load', () => {
        (api.get as Mock).mockReturnValue(new Promise(() => {})); // Never resolves
        renderDashboard();

        // "Not loaded yet" is a placeholder on every figure — never "...", never
        // a dash (that means "failed") and never a made-up 0 or $0.00: a real
        // zero has to be distinguishable from "unknown".
        const overview = screen.getByRole('region', { name: 'Overview' });
        expect(overview.querySelectorAll('[aria-busy="true"]')).toHaveLength(5); // Holdings + 4 counters
        expect(screen.queryByText('—')).toBeNull();
        expect(screen.queryByText('$0.00')).toBeNull();
        expect(screen.queryByText('0')).toBeNull();
        expect(screen.queryByText('Add a position to start tracking')).toBeNull();
    });

    it('totals the portfolio from positions in the display currency', async () => {
        renderDashboard();

        // 1500 + 900 held, bought for 2000 → +20%
        expect(await screen.findByText('$2,400')).toBeTruthy();
        expect(screen.getByText('+20.00%')).toBeTruthy();
        expect(api.get).toHaveBeenCalledWith('/portfolio/positions', {
            params: { displayCurrency: 'USD' },
        });
    });

    it('requests each stat exactly once', async () => {
        renderDashboard();
        await screen.findByText('100');
        await waitFor(() => expect(queryClient.isFetching()).toBe(0));

        expect((api.get as Mock).mock.calls.map(([url]) => url).sort()).toEqual([
            '/portfolio/positions',
            '/research',
            '/stats/sell',
            '/stats/strong-buy',
            '/tickers/count',
        ]);
        expect(api.get).toHaveBeenCalledWith('/research', { params: { since: 24, limit: 1 } });
    });

    it('renders cached stats immediately while they refresh in the background', async () => {
        seedStaleCache();
        (api.get as Mock).mockReturnValue(new Promise(() => {})); // The refresh never answers

        renderDashboard();

        // No awaiting: this is the first paint.
        expectSeededStats();
        // …and the refresh really is running behind it.
        expect(queryClient.isFetching()).toBe(5);
    });

    it('replaces cached stats once the refresh lands', async () => {
        seedStaleCache();
        renderDashboard();
        expectSeededStats();

        expect(await screen.findByText('100')).toBeTruthy();
        expect(await screen.findByText('$2,400')).toBeTruthy();
        expect(screen.queryByText('77')).toBeNull();
    });

    it('keeps showing the previous stats when a refresh fails', async () => {
        seedStaleCache();
        mockApi({});

        renderDashboard();

        await waitFor(() => {
            expect(queryClient.getQueryState(dashboardKeys.tickerCount)?.status).toBe('error');
            expect(queryClient.getQueryState(dashboardKeys.strongBuy)?.status).toBe('error');
            expect(queryClient.getQueryState(dashboardKeys.sell)?.status).toBe('error');
            expect(queryClient.getQueryState(dashboardKeys.recentResearch)?.status).toBe('error');
            expect(queryClient.getQueryState(portfolioKeys.positions('USD'))?.status).toBe('error');
        });
        expectSeededStats();
    });

    it('lets one failing endpoint fail on its own', async () => {
        mockApi({ ...defaultResponses, '/stats/sell': new Error('Sell stats down') });

        renderDashboard();

        expect(await screen.findByText('100')).toBeTruthy();
        expect((await screen.findAllByText('5')).length).toBeGreaterThan(0);
        expect(await screen.findByText('$2,400')).toBeTruthy();
        await waitFor(() =>
            expect(queryClient.getQueryState(dashboardKeys.sell)?.status).toBe('error'),
        );
        expect(screen.getAllByText('—')).toHaveLength(1); // Only Sell
    });

    it.skip('renders Top Opportunities section', () => {
        (useStockAnalyzer as Mock).mockReturnValue({
            data: {
                items: [
                    {
                        ticker: { symbol: 'AAPL', id: '1' },
                        latestPrice: { close: 150, change: 1 },
                        fundamentals: { pe_ratio: 20 },
                        aiAnalysis: { upside_percent: 15, overall_score: 2, sentiment: 'Buy' }
                    }
                ]
            },
            isLoading: false
        });

        renderDashboard();
        expect(screen.getByText('Top Opportunities')).toBeTruthy();
        expect(screen.getByTestId('watchlist-grid').textContent).toContain('Grid Items: 1');
    });

    it('renders Latest Research Feed', () => {
        renderDashboard();
        expect(screen.getByTestId('news-feed')).toBeTruthy();
    });

    it.skip('renders Smart News widget and triggers generation', () => {
        renderDashboard();
        expect(screen.getByText('Smart News')).toBeTruthy();

        // Should show "Generate Digest" if no recent news
        const generateButton = screen.getByText('Generate Digest');
        expect(generateButton).toBeTruthy();

        fireEvent.click(generateButton);
        expect(mockTriggerResearch).toHaveBeenCalledWith(expect.objectContaining({
            symbol: 'MARKET_NEWS',
            provider: 'gemini'
        }));
    });

    it.skip('displays recent news digest if available', () => {
        const recentDate = new Date().toISOString();
        (useTickerResearch as Mock).mockReturnValue({
            data: [
                {
                    id: 'news-1',
                    title: 'Daily Market News',
                    question: 'news',
                    created_at: recentDate,
                    summary: 'Market is up today.'
                }
            ],
            isLoading: false
        });

        renderDashboard();
        expect(screen.getByText("Today's AI News Digest")).toBeTruthy();
        // It appears in both feed and widget, so we expect at least one, or verify length
        expect(screen.getAllByText('Daily Market News').length).toBeGreaterThanOrEqual(1);
        expect(screen.queryByText('Generate Digest')).toBeNull();
    });

    it.skip('handles search input', () => {
        renderDashboard();
        const searchInput = screen.getByPlaceholderText('Search ticker (e.g. NVDA)...');
        fireEvent.change(searchInput, { target: { value: 'NVDA' } });
        fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter' });

        expect(mockNavigate).toHaveBeenCalledWith('/ticker/NVDA');
    });

    it('links to the full ticker list', () => {
        renderDashboard();
        // A real link (focusable, openable in a new tab), not a click handler.
        expect(screen.getByRole('link', { name: /view all tickers/i })).toHaveAttribute('href', '/analyzer');
    });

    it('makes every headline figure a link to its page', () => {
        renderDashboard();
        const overview = screen.getByRole('region', { name: 'Overview' });
        const hrefs = Array.from(overview.querySelectorAll('a')).map((a) => a.getAttribute('href'));
        expect(hrefs).toEqual([
            '/portfolio',
            '/analyzer?filter=strong_buy',
            '/analyzer?filter=sell',
            '/research?filter=recent',
            '/analyzer',
            '/news',
        ]);
    });
});
