import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { PublicResearchPage } from './PublicResearchPage';
import { api } from '../lib/api';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, api: { get: vi.fn() } };
});
vi.mock('../components/dashboard/TickerLogo', () => ({
  TickerLogo: ({ symbol }: { symbol: string }) => <span data-testid={`logo-${symbol}`} />,
}));
// The chart needs a real canvas; what matters here is whether it is shown.
vi.mock('../components/ticker/PriceChart', () => ({ PriceChart: () => <div data-testid="price-chart" /> }));

const note = {
  id: '101',
  status: 'completed',
  tickers: ['NVDA'],
  title: 'NVDA: the next leg',
  content: 'Demand is **strong**.',
  created_at: '2026-10-12T08:00:00.000Z',
};

const full = {
  note,
  profile: { symbol: 'NVDA', name: 'NVIDIA Corp', exchange: 'NASDAQ', logo_url: '', currency: 'USD' },
  market_context: { price: 121.4, change_percent: 2.84, history: [{ date: '2026-10-10', price: 118 }, { date: '2026-10-11', price: 121.4 }] },
  risk_analysis: {
    overall_score: 8.4, financial_risk: 3, execution_risk: 3, dilution_risk: 2, competitive_risk: 3, regulatory_risk: 4,
    upside_percent: 31.5,
    scenarios: [
      { scenario_type: 'bear', probability: 0.25, description: 'Slower', price_mid: 108.65, price_low: 100, price_high: 117, expected_market_cap: 2.7e12, key_drivers: [] },
      { scenario_type: 'base', probability: 0.5, description: 'Steady', price_mid: 159.64, price_low: 147, price_high: 172, expected_market_cap: 3.9e12, key_drivers: [] },
    ],
    red_flags: [], catalysts: [],
  },
  news: null,
  ratings: [],
  fundamentals: { pe_ratio: 30, consensus_rating: 'Buy', fifty_two_week_high: 122.72, fifty_two_week_low: 64.32 },
};

function renderPage(payload: unknown) {
  (api.get as Mock).mockResolvedValue({ data: payload });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/report/101/sig']}>
        <Routes>
          <Route path="/report/:researchId/:signature" element={<PublicResearchPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PublicResearchPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  });

  it('shows the ticker, its price and the overview for a tracked ticker', async () => {
    renderPage(full);

    expect(await screen.findByRole('heading', { level: 1, name: 'NVDA' })).toBeInTheDocument();
    expect(screen.getByText('NVIDIA Corp')).toBeInTheDocument();
    expect(screen.getByText('$121.40')).toBeInTheDocument();
    expect(screen.getByTestId('price-chart')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    expect(api.get).toHaveBeenCalledWith('/public/report/101/sig');
  });

  it('shows the analysis without invented figures when the ticker is not tracked', async () => {
    // What the API sends for an untracked ticker: a stub profile, no market data.
    renderPage({ note, profile: { symbol: 'ZZZQ', name: 'ZZZQ' }, market_context: null, risk_analysis: null, ratings: [], news: null, fundamentals: {} });

    expect(await screen.findByRole('heading', { level: 1, name: 'ZZZQ' })).toBeInTheDocument();
    // No price, no 0% chip, no chart, no empty overview tab.
    expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument();
    expect(screen.queryByText(/0\.00%/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('price-chart')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    // The written analysis is what is left, and it is shown straight away.
    expect(screen.getByRole('heading', { level: 2, name: 'NVDA: the next leg' })).toBeInTheDocument();
    expect(screen.getByText('strong')).toBeInTheDocument();
  });

  it('renders a note that has no ticker at all', async () => {
    renderPage({ note: { ...note, tickers: [] } });

    expect(await screen.findByRole('heading', { level: 1, name: 'NVDA: the next leg' })).toBeInTheDocument();
    expect(screen.queryByTestId('price-chart')).not.toBeInTheDocument();
    expect(screen.getByText('strong')).toBeInTheDocument();
  });

  it('explains a link that does not work', async () => {
    (api.get as Mock).mockRejectedValue({ response: { status: 403 } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/report/101/bad']}>
          <Routes>
            <Route path="/report/:researchId/:signature" element={<PublicResearchPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('This report link doesn’t work')).toBeInTheDocument();
  });
});
