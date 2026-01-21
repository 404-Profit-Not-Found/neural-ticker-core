
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TickerDetail } from './TickerDetail';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import { BrowserRouter, useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  useTickerDetails,
  useTickerNews,
  useTickerSocial,
  useTickerResearch,
  useTriggerResearch,
  usePostComment,
  useDeleteResearch,
} from '../hooks/useTicker';
import { useFavorite } from '../hooks/useWatchlist';
import { useTickerMarketStatus } from '../hooks/useMarketStatus';
import { api } from '../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import '@testing-library/jest-dom';

// Mocks
vi.mock('react-router-dom', async (importOriginal) => ({
  ...await importOriginal<any>(),
  useParams: vi.fn(),
  useNavigate: vi.fn(),
  useLocation: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../hooks/useTicker', () => ({
  useTickerDetails: vi.fn(),
  useTickerNews: vi.fn(),
  useTickerSocial: vi.fn(),
  useTickerResearch: vi.fn(),
  useTriggerResearch: vi.fn(),
  usePostComment: vi.fn(),
  useDeleteResearch: vi.fn(),
  tickerKeys: {
    details: (s: string) => ['ticker', 'details', s],
    research: (s: string) => ['ticker', 'research', s],
  },
}));

vi.mock('../hooks/useWatchlist', () => ({
  useFavorite: vi.fn(),
}));

vi.mock('../hooks/useMarketStatus', () => ({
  useTickerMarketStatus: vi.fn(),
  getSessionLabel: vi.fn(() => 'OPEN'),
  getSessionColor: vi.fn(() => 'text-emerald-500'),
}));

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: vi.fn(),
}));

// Mock sub-components
vi.mock('../components/ui/SuperLoading', () => ({ SuperLoading: () => <div data-testid="loading">Loading...</div> }));
vi.mock('../components/ticker/RiskLight', () => ({ RiskLight: () => <div>RiskLight</div> }));
vi.mock('../components/ticker/VerdictBadge', () => ({ VerdictBadge: () => <div>VerdictBadge</div> }));
vi.mock('../components/ticker/ResearchFeed', () => ({ ResearchFeed: () => <div>ResearchFeed</div> }));
vi.mock('../components/ticker/TickerOverview', () => ({ TickerOverview: () => <div>TickerOverview</div> }));
vi.mock('../components/ticker/TickerFinancials', () => ({ TickerFinancials: () => <div>TickerFinancials</div> }));
vi.mock('../components/ticker/TickerNews', () => ({ TickerNews: () => <div>TickerNews</div> }));
vi.mock('../components/ticker/TickerDiscussion', () => ({ TickerDiscussion: () => <div>TickerDiscussion</div> }));
vi.mock('../components/ticker/PriceChart', () => ({ PriceChart: () => <div>PriceChart</div> }));
vi.mock('../components/dashboard/TickerLogo', () => ({ TickerLogo: () => <div>Logo</div> }));
vi.mock('../components/dashboard/FiftyTwoWeekRange', () => ({ FiftyTwoWeekRange: () => <div>52W Range</div> }));
vi.mock('../components/common/SharePopover', () => ({ SharePopover: () => <div>Share</div> }));
vi.mock('../components/layout/Header', () => ({ Header: () => <div>Header</div> }));

describe('TickerDetail', () => {
  const mockNavigate = vi.fn();
  const mockTickerData = {
    profile: { symbol: 'AAPL', name: 'Apple Inc.', logo_url: 'logo.png', industry: 'Tech' },
    market_data: { price: 150, change_percent: 1.2, history: [{ time: '2023-01-01', close: 145 }] },
    risk_analysis: { overall_score: 75, summary: 'Good', sentiment: 'positive', scenarios: [], financial_risk: 2 },
    fundamentals: { pe_ratio: 25, fifty_two_week_high: 160, fifty_two_week_low: 130 },
    watchers: 1000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useParams as Mock).mockReturnValue({ symbol: 'AAPL' });
    (useNavigate as Mock).mockReturnValue(mockNavigate);
    (useLocation as Mock).mockReturnValue({ pathname: '/ticker/AAPL' });
    (useAuth as Mock).mockReturnValue({ user: { id: 'user1', nickname: 'Tester', role: 'admin' } });
    (useTickerDetails as Mock).mockReturnValue({ data: mockTickerData, isLoading: false });
    (useTickerNews as Mock).mockReturnValue({ data: [] });
    (useTickerSocial as Mock).mockReturnValue({ data: [] });
    (useTickerResearch as Mock).mockReturnValue({ data: [] });
    (useTriggerResearch as Mock).mockReturnValue({ mutate: vi.fn(), isPending: false });
    (usePostComment as Mock).mockReturnValue({ mutate: vi.fn(), isPending: false });
    (useDeleteResearch as Mock).mockReturnValue({ mutate: vi.fn() });
    (useFavorite as Mock).mockReturnValue({ isFavorite: false, toggle: vi.fn(), isLoading: false });
    (useTickerMarketStatus as Mock).mockReturnValue({ data: { session: 'regular' }, isLoading: false });
    (useQueryClient as Mock).mockReturnValue({ invalidateQueries: vi.fn() });
    (api.post as Mock).mockResolvedValue({});
  });

  it('renders loading state', () => {
    (useTickerDetails as Mock).mockReturnValue({ data: null, isLoading: true });
    render(<BrowserRouter><TickerDetail /></BrowserRouter>);
    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });

  it('renders correctly with ticker data', () => {
    render(<BrowserRouter><TickerDetail /></BrowserRouter>);
    expect(screen.getAllByText('AAPL').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Apple Inc.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$150.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1.20%').length).toBeGreaterThan(0);
  });

  it('handles favorite toggle', () => {
    const mockToggle = vi.fn();
    (useFavorite as Mock).mockReturnValue({ isFavorite: false, toggle: mockToggle, isLoading: false });
    render(<BrowserRouter><TickerDetail /></BrowserRouter>);
    
    const favBtn = screen.getByTitle('Add to Favorites');
    fireEvent.click(favBtn);
    expect(mockToggle).toHaveBeenCalled();
  });

  it('switches tabs correctly', () => {
     // Default is overview
     render(<BrowserRouter><TickerDetail /></BrowserRouter>);
     expect(screen.getByText('TickerOverview')).toBeInTheDocument();

     // Click Research tab
     fireEvent.click(screen.getByText('AI Research'));
     // TickerDetail component uses navigate to change tab, and then location changes
     expect(mockNavigate).toHaveBeenCalledWith('/ticker/AAPL/research');
  });

  it('renders 404 state when no ticker found', () => {
    (useTickerDetails as Mock).mockReturnValue({ data: null, isLoading: false });
    render(<BrowserRouter><TickerDetail /></BrowserRouter>);
    expect(screen.getByText('Ticker Not Found')).toBeInTheDocument();
  });

  it('handles sync data button click', async () => {
    (api.post as Mock).mockResolvedValue({});
    render(<BrowserRouter><TickerDetail /></BrowserRouter>);
    
    const syncBtn = screen.getByTitle('Sync Data');
    fireEvent.click(syncBtn);
    
    expect(api.post).toHaveBeenCalledWith('/research/sync/AAPL');
  });

  it('opens logo upload dialog on double click (Admin only)', () => {
    render(<BrowserRouter><TickerDetail /></BrowserRouter>);
    
    const logoContainer = screen.getByTitle('Double-click to update logo (Admin)');
    fireEvent.doubleClick(logoContainer);
    
    expect(screen.getByText('Update Logo (Admin)')).toBeInTheDocument();
  });
});
