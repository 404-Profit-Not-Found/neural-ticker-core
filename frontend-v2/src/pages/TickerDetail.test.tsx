
import { render, screen, fireEvent } from '@testing-library/react';
import { TickerDetail } from './TickerDetail';
import { ConfirmProvider } from '../components/ui/confirm';
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
  useToggleCommentLike,
  useMyCommentLikes,
} from '../hooks/useTicker';
import { useFavorite } from '../hooks/useWatchlist';
import { useTickerMarketStatus } from '../hooks/useMarketStatus';
import { api } from '../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import '@testing-library/jest-dom';

// Mocks
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useParams: vi.fn(),
    useNavigate: vi.fn(),
    useLocation: vi.fn(),
  };
});

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
  useDeleteComment: vi.fn(),
  useToggleCommentLike: vi.fn(),
  useMyCommentLikes: vi.fn(),
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
vi.mock('../components/price-alerts/CreateAlertDialog', () => ({ CreateAlertDialog: () => <div data-testid="create-alert-dialog">CreateAlertDialog</div> }));

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
    (useTickerSocial as Mock).mockReturnValue({ data: { comments: [], mentionedUsers: {} } });
    (useMyCommentLikes as Mock).mockReturnValue({ data: [] });
    (useToggleCommentLike as Mock).mockReturnValue({ mutate: vi.fn() });
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
    render(<BrowserRouter><ConfirmProvider><TickerDetail /></ConfirmProvider></BrowserRouter>);
    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });

  it('renders correctly with ticker data', () => {
    render(<BrowserRouter><ConfirmProvider><TickerDetail /></ConfirmProvider></BrowserRouter>);
    expect(screen.getAllByText('AAPL').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Apple Inc.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$150.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1.20%').length).toBeGreaterThan(0);
  });

  it('handles favorite toggle', () => {
    const mockToggle = vi.fn();
    (useFavorite as Mock).mockReturnValue({ isFavorite: false, toggle: mockToggle, isLoading: false });
    render(<BrowserRouter><ConfirmProvider><TickerDetail /></ConfirmProvider></BrowserRouter>);

    const favBtn = screen.getByTitle('Add to Favorites');
    fireEvent.click(favBtn);
    expect(mockToggle).toHaveBeenCalled();
  });

  it('switches tabs correctly', () => {
    // Default is overview
    render(<BrowserRouter><ConfirmProvider><TickerDetail /></ConfirmProvider></BrowserRouter>);
    expect(screen.getByText('TickerOverview')).toBeInTheDocument();

    // Click Research tab
    fireEvent.click(screen.getByText('AI Research'));
    // TickerDetail component uses navigate to change tab, and then location changes
    expect(mockNavigate).toHaveBeenCalledWith('/ticker/AAPL/research', { replace: true });
  });

  it('renders 404 state when no ticker found', () => {
    (useTickerDetails as Mock).mockReturnValue({ data: null, isLoading: false });
    render(<BrowserRouter><ConfirmProvider><TickerDetail /></ConfirmProvider></BrowserRouter>);
    expect(screen.getByText('Ticker Not Found')).toBeInTheDocument();
  });

  it('handles sync data button click', async () => {
    (api.post as Mock).mockResolvedValue({});
    render(<BrowserRouter><ConfirmProvider><TickerDetail /></ConfirmProvider></BrowserRouter>);

    const syncBtn = screen.getByTitle('Sync Data');
    fireEvent.click(syncBtn);

    expect(api.post).toHaveBeenCalledWith('/research/sync/AAPL');
  });

  it('opens logo upload dialog on double click (Admin only)', () => {
    render(<BrowserRouter><ConfirmProvider><TickerDetail /></ConfirmProvider></BrowserRouter>);

    const logoContainer = screen.getByTitle('Double-click to update logo (Admin)');
    fireEvent.doubleClick(logoContainer);

    expect(screen.getByText('Update Logo (Admin)')).toBeInTheDocument();
  });

  it('does not offer logo editing to non-admins', () => {
    (useAuth as Mock).mockReturnValue({ user: { id: 'user1', nickname: 'Tester', role: 'user' } });
    render(<BrowserRouter><ConfirmProvider><TickerDetail /></ConfirmProvider></BrowserRouter>);
    // The hint used to be shown to everyone ("Double-click to update logo (Admin)").
    expect(screen.queryByTitle('Double-click to update logo (Admin)')).toBeNull();
    expect(screen.queryByText('Update Logo (Admin)')).toBeNull();
  });

  it('offers the same four actions at every width, each exactly once', () => {
    render(<BrowserRouter><ConfirmProvider><TickerDetail /></ConfirmProvider></BrowserRouter>);
    // One hero for phone and desktop: no hidden duplicate, and Alert / Sync
    // are no longer desktop-only.
    for (const name of ['Watch', 'Alert', 'Share', 'Sync']) {
      expect(screen.getAllByRole('button', { name })).toHaveLength(1);
    }
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('disables Share with a reason while there is no research to share', () => {
    render(<BrowserRouter><ConfirmProvider><TickerDetail /></ConfirmProvider></BrowserRouter>);
    const share = screen.getByRole('button', { name: 'Share' });
    expect(share).toBeDisabled();
    expect(share).toHaveAttribute('title', 'No research to share yet');
  });

  it('reflects the favourite state on the Watch button', () => {
    (useFavorite as Mock).mockReturnValue({ isFavorite: true, toggle: vi.fn(), isLoading: false });
    render(<BrowserRouter><ConfirmProvider><TickerDetail /></ConfirmProvider></BrowserRouter>);
    const watch = screen.getByRole('button', { name: 'Watch' });
    expect(watch).toHaveAttribute('aria-pressed', 'true');
    expect(watch).toHaveAttribute('title', 'Remove from Favorites');
  });

  it('states the market session in words', () => {
    render(<BrowserRouter><ConfirmProvider><TickerDetail /></ConfirmProvider></BrowserRouter>);
    // `getSessionLabel` is mocked to "OPEN"; on phones this used to be an unlabelled dot.
    expect(screen.getByText('OPEN')).toBeInTheDocument();
  });

  it('shows the direction of the day change in words as well as colour', () => {
    (useTickerDetails as Mock).mockReturnValue({
      data: { ...mockTickerData, market_data: { ...mockTickerData.market_data, change_percent: -3.41 } },
      isLoading: false,
    });
    render(<BrowserRouter><ConfirmProvider><TickerDetail /></ConfirmProvider></BrowserRouter>);
    const chip = screen.getByText('3.41%', { exact: false }).closest('span[class*="rounded"]');
    expect(chip).toHaveTextContent('down');
    expect(chip?.className).toContain('text-down');
  });

  it('treats an unchanged price as neutral, never green', () => {
    (useTickerDetails as Mock).mockReturnValue({
      data: { ...mockTickerData, market_data: { ...mockTickerData.market_data, change_percent: 0 } },
      isLoading: false,
    });
    render(<BrowserRouter><ConfirmProvider><TickerDetail /></ConfirmProvider></BrowserRouter>);
    const chip = screen.getByText('0.00%', { exact: false }).closest('span[class*="rounded"]');
    expect(chip).toHaveTextContent('unchanged');
    expect(chip?.className).toContain('text-muted-foreground');
    expect(chip?.className).not.toContain('text-up');
  });

  it('keeps four decimals for a sub-dollar price', () => {
    (useTickerDetails as Mock).mockReturnValue({
      data: { ...mockTickerData, market_data: { ...mockTickerData.market_data, price: 0.1834 } },
      isLoading: false,
    });
    render(<BrowserRouter><ConfirmProvider><TickerDetail /></ConfirmProvider></BrowserRouter>);
    expect(screen.getByText('$0.1834')).toBeInTheDocument();
    expect(screen.queryByText('$0.18')).toBeNull();
  });

  it('explains a missing ticker and offers a way out', () => {
    (useTickerDetails as Mock).mockReturnValue({ data: null, isLoading: false });
    render(<BrowserRouter><ConfirmProvider><TickerDetail /></ConfirmProvider></BrowserRouter>);
    expect(screen.getByRole('alert')).toHaveTextContent('There is no ticker "AAPL" here');
    expect(screen.getByRole('button', { name: 'Return to Dashboard' })).toBeInTheDocument();
  });
});
