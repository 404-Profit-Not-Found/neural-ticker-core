import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { ResearchPage } from './ResearchPage';
import { api } from '../lib/api';
import { useTickerDetails } from '../hooks/useTicker';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, api: { get: vi.fn() } };
});

vi.mock('../hooks/useTicker', () => ({
  useTickerDetails: vi.fn(),
}));

vi.mock('../components/dashboard/TickerLogo', () => ({ TickerLogo: () => <span data-testid="logo" /> }));
vi.mock('../components/ticker/VerdictBadge', () => ({ VerdictBadge: () => <span>VerdictBadge</span> }));
vi.mock('../components/common/SharePopover', () => ({ SharePopover: () => <button type="button">Share</button> }));

const baseNote = {
  id: '101',
  request_id: 'req-1',
  created_at: '2026-10-13T05:39:57Z',
  tickers: ['NVDA'],
  title: 'NVDA: Demand Is Supply-Constrained',
};

const ticker = {
  profile: { symbol: 'NVDA', name: 'NVIDIA Corp', exchange: 'NASDAQ NMS - GLOBAL MARKET', currency: 'USD', logo_url: '' },
  market_data: { price: 121.4, change_percent: 2.84 },
  risk_analysis: { financial_risk: 3, overall_score: 8.4, upside_percent: 31.5, scenarios: [] },
  fundamentals: null,
};

function renderNote(note: Record<string, unknown> | null) {
  if (note) (api.get as Mock).mockResolvedValue({ data: note });
  else (api.get as Mock).mockRejectedValue(new Error('404'));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/ticker/NVDA/research/101']}>
        <Routes>
          <Route path="/ticker/:symbol/research/:id" element={<ResearchPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ResearchPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useTickerDetails as Mock).mockReturnValue({ data: ticker });
  });

  describe('a failed note', () => {
    const failed = { ...baseNote, status: 'failed', error: 'Deep research failed: 503 The model is overloaded. Please try again later.' };

    it('explains the failure in plain words and keeps the raw error behind a disclosure', async () => {
      renderNote(failed);

      const alert = await screen.findByRole('alert');
      expect(within(alert).getByText('This research run failed')).toBeInTheDocument();
      expect(within(alert).getByText(/temporarily unavailable/i)).toBeInTheDocument();

      const details = screen.getByText('Technical details').closest('details');
      expect(details).not.toBeNull();
      expect(details).not.toHaveAttribute('open');
      expect(details).toHaveTextContent('503 The model is overloaded');
    });

    it('offers a way forward and hides actions that need a finished note', async () => {
      renderNote(failed);
      const retry = await screen.findByRole('link', { name: /Run it again from NVDA research/i });
      expect(retry).toHaveAttribute('href', '/ticker/NVDA/research');

      expect(screen.getByText('Failed')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Print/i })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
      expect(screen.queryByRole('tablist')).toBeNull();
    });

    it('still makes sense when the backend sent no error text', async () => {
      renderNote({ ...baseNote, status: 'failed' });
      expect(await screen.findByText(/Something went wrong while this note was being written/i)).toBeInTheDocument();
      expect(screen.queryByText('Technical details')).toBeNull();
    });
  });

  describe('a note that is still running', () => {
    it.each([
      ['processing', 'Running'],
      ['pending', 'Queued'],
    ])('shows progress for a %s note', async (status, stamp) => {
      renderNote({ ...baseNote, status });

      const progress = await screen.findByRole('status');
      expect(progress).toHaveTextContent('Research in progress');
      expect(progress).toHaveAttribute('aria-live', 'polite');
      expect(screen.getByText(stamp)).toBeInTheDocument();

      // Nothing to read, print or share yet.
      expect(screen.queryByRole('tablist')).toBeNull();
      expect(screen.queryByRole('button', { name: /Print/i })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
    });
  });

  describe('a completed note', () => {
    const completed = {
      ...baseNote,
      status: 'completed',
      rarity: 'Legendary',
      models_used: ['gemini-3-pro-preview'],
      tokens_in: 12000,
      tokens_out: 2748,
      answer_markdown: '# NVDA: Demand is supply-constrained\n\n## 1. Summary\n\nBody text.\n\n## 2. Moat\n\nMore.\n\n## 3. Risks\n\nEnd.',
      grounding_metadata: { groundingChunks: [{ web: { title: 'sec.gov', uri: 'https://www.sec.gov/x' } }, { web: { title: 'no url' } }] },
    };

    it('uses the note title as the one page heading', async () => {
      renderNote(completed);
      const h1 = await screen.findByRole('heading', { level: 1 });
      expect(h1).toHaveTextContent('NVDA: Demand Is Supply-Constrained');
      // The markdown's own copy of the title is not repeated under it.
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(screen.getByRole('heading', { level: 2, name: '1. Summary' })).toBeInTheDocument();
    });

    it('shows readable metadata', async () => {
      renderNote(completed);
      expect(await screen.findByText('14,748 tokens')).toBeInTheDocument();
      expect(screen.getByText('gemini-3-pro-preview')).toBeInTheDocument();
      expect(screen.getByText('NASDAQ')).toBeInTheDocument();
      expect(screen.queryByText('NASDAQ NMS - GLOBAL MARKET')).toBeNull();
      expect(screen.getByText('$121.40')).toBeInTheDocument();
      expect(screen.getByText('+2.84%')).toHaveClass('text-up');
    });

    it('offers print and share, a contents list and only sources that have a URL', async () => {
      renderNote(completed);
      expect(await screen.findByRole('button', { name: 'Print this note' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();

      const toc = screen.getByRole('navigation', { name: 'On this page' });
      expect(within(toc).getAllByRole('button').map((b) => b.textContent)).toEqual(['1. Summary', '2. Moat', '3. Risks']);

      expect(screen.getByRole('tab', { name: /Sources/ })).toHaveTextContent('1');
    });

    it('does not print a model stamp it does not know', async () => {
      renderNote({ ...completed, models_used: [] });
      await screen.findByRole('heading', { level: 1 });
      // The page used to print a badge reading "ai" here.
      expect(screen.queryByText('ai')).toBeNull();
      expect(screen.queryByText('AI')).toBeNull();
    });
  });

  it('shows a not-found state with a way back', async () => {
    renderNote(null);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Research note not found');
    expect(screen.getByRole('button', { name: 'Go back' })).toBeInTheDocument();
  });
});
