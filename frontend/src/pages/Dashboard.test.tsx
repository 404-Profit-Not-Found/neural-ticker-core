import { render, screen, fireEvent } from '@testing-library/react';
import { Dashboard } from './Dashboard';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
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
    useTriggerResearch: vi.fn(),
    useWatchlists: vi.fn(),
    useToggleFavorite: vi.fn(),
    useActiveResearchCount: vi.fn() // Also mocked to avoid warnings
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

import '@testing-library/jest-dom';

// Mock Components
vi.mock('../components/dashboard/TickerCarousel', () => ({
    TickerCarousel: ({ data }: { data: unknown[] }) => (
        <div data-testid="watchlist-grid">
            Grid Items: {data.length}
        </div>
    )
}));

vi.mock('../components/dashboard/NewsFeed', () => ({
    NewsFeed: () => <div data-testid="news-feed">Latest Research Notes</div>
}));

vi.mock('../components/layout/Header', () => ({
    Header: () => <div data-testid="header">Header</div>
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

import { useTickerResearch, useTriggerResearch, useWatchlists, useToggleFavorite, useActiveResearchCount } from '../hooks/useTicker';
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
        (useWatchlists as Mock).mockReturnValue({
            data: [],
            isLoading: false
        });
        (useToggleFavorite as Mock).mockReturnValue({
            mutate: vi.fn(),
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
        expect(screen.getByText('AI assisted stock analyzer')).toBeTruthy();
        expect(screen.getByText('Tickers Tracked')).toBeTruthy();
        expect(screen.getByText('100')).toBeTruthy(); // Tickers count
        expect(screen.getByText('Strong Buy')).toBeTruthy();
        expect(screen.getByText('5')).toBeTruthy(); // Strong Buy count
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

    it('navigates to analyzer page', () => {
        renderDashboard();
        const viewAllButton = screen.getByText('View Analyzer');
        fireEvent.click(viewAllButton);
        expect(mockNavigate).toHaveBeenCalledWith('/analyzer');
    });
});
