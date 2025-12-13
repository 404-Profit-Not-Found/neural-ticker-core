import { render, screen, fireEvent } from '@testing-library/react';
import { Dashboard } from './Dashboard';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';

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

// Mock Hooks
vi.mock('../hooks/useTicker', () => ({
    useTickerResearch: vi.fn(),
    useTriggerResearch: vi.fn()
}));
vi.mock('../hooks/useStockAnalyzer', () => ({
    useStockAnalyzer: vi.fn()
}));
vi.mock('@tanstack/react-query', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@tanstack/react-query')>();
    return {
        ...actual,
        useQuery: vi.fn(),
        useMutation: vi.fn(),
        useQueryClient: vi.fn(),
        QueryClient: vi.fn()
    };
});

// Mock Components
vi.mock('../components/dashboard/WatchlistGridView', () => ({
    WatchlistGridView: ({ data, isLoading }: { data: unknown[], isLoading: boolean }) => (
        <div data-testid="watchlist-grid">
            {isLoading ? 'Loading Grid...' : `Grid Items: ${data.length} `}
        </div>
    )
}));
// Mock Chart to avoid canvas issues
vi.mock('recharts', () => ({
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

import { useTickerResearch, useTriggerResearch } from '../hooks/useTicker';
import { useStockAnalyzer } from '../hooks/useStockAnalyzer';
import { useQuery } from '@tanstack/react-query';

describe('Dashboard', () => {
    const mockTriggerResearch = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        mockNavigate.mockClear(); // Clear the hoisted mock

        // Default Mock Returns
        (useTickerResearch as Mock).mockReturnValue({
            data: [],
            isLoading: false
        });
        (useTriggerResearch as Mock).mockReturnValue({
            mutate: mockTriggerResearch,
            isPending: false
        });
        (useStockAnalyzer as Mock).mockReturnValue({
            data: { items: [] },
            isLoading: false
        });
        (useQuery as Mock).mockReturnValue({
            data: { tickers: 100, strongBuy: 5, research: 50 },
            isLoading: false
        });
    });

    const renderDashboard = () => {
        return render(
            <BrowserRouter>
                <Dashboard />
            </BrowserRouter>
        );
    };

    it('renders dashboard layout with stats', () => {
        renderDashboard();
        expect(screen.getByText('AI assisted stock analyzer')).toBeInTheDocument();
        expect(screen.getByText('Tickers Tracked')).toBeInTheDocument();
        expect(screen.getByText('100')).toBeInTheDocument(); // Tickers count
        expect(screen.getByText('Strong Buy')).toBeInTheDocument();
        expect(screen.getByText('5')).toBeInTheDocument(); // Strong Buy count
    });

    it('renders Top Opportunities section', () => {
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
        expect(screen.getByText('Top Opportunities')).toBeInTheDocument();
        expect(screen.getByTestId('watchlist-grid')).toHaveTextContent('Grid Items: 1');
    });

    it('renders Latest Research Feed', () => {
        (useTickerResearch as Mock).mockReturnValue({
            data: [
                { id: '1', title: 'Research Note 1', status: 'completed', tickers: ['AAPL'], created_at: new Date().toISOString() }
            ],
            isLoading: false
        });
        renderDashboard();
        expect(screen.getByText('Latest Research Notes')).toBeInTheDocument();
        expect(screen.getByText('Research Note 1')).toBeInTheDocument();
    });

    it('renders Smart News widget and triggers generation', () => {
        renderDashboard();
        expect(screen.getByText('Smart News')).toBeInTheDocument();

        // Should show "Generate Digest" if no recent news
        const generateButton = screen.getByText('Generate Digest');
        expect(generateButton).toBeInTheDocument();

        fireEvent.click(generateButton);
        expect(mockTriggerResearch).toHaveBeenCalledWith(expect.objectContaining({
            symbol: 'MARKET_NEWS',
            provider: 'gemini'
        }));
    });

    it('displays recent news digest if available', () => {
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
        expect(screen.getByText("Today's AI News Digest")).toBeInTheDocument();
        // It appears in both feed and widget, so we expect at least one, or verify length
        expect(screen.getAllByText('Daily Market News').length).toBeGreaterThanOrEqual(1);
        expect(screen.queryByText('Generate Digest')).not.toBeInTheDocument();
    });

    it('handles search input', () => {
        renderDashboard();
        const searchInput = screen.getByPlaceholderText('Search ticker (e.g. NVDA)...');
        fireEvent.change(searchInput, { target: { value: 'NVDA' } });

        const form = searchInput.closest('form');
        fireEvent.submit(form!);

        expect(mockNavigate).toHaveBeenCalledWith('/ticker/NVDA');
    });

    it('navigates to analyzer page', () => {
        renderDashboard();
        const viewAllButton = screen.getByText('View Analyzer');
        fireEvent.click(viewAllButton);
        expect(mockNavigate).toHaveBeenCalledWith('/analyzer');
    });
});
