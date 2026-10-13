import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { ResearchListPage } from './ResearchListPage';
import { ConfirmProvider } from '../components/ui/confirm';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, api: { get: vi.fn(), delete: vi.fn() } };
});
vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../components/dashboard/TickerLogo', () => ({ TickerLogo: ({ symbol }: { symbol: string }) => <span data-testid={`logo-${symbol}`} /> }));

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

const notes = [
  { id: '109', status: 'pending', tickers: ['JPM'], title: 'How exposed is net interest income to cuts?', created_at: hoursAgo(0.4), user: { nickname: 'SwiftFalcon482' } },
  { id: '108', status: 'processing', tickers: ['COIN'], title: 'Deep dive analysis into COIN', created_at: hoursAgo(0.5), user: { nickname: 'SwiftFalcon482' } },
  { id: '111', status: 'completed', tickers: ['NVDA', 'TSLA', 'AAPL', 'INTC', 'ASML.AS'], title: 'Smart News Briefing', created_at: hoursAgo(2), user: { nickname: 'SwiftFalcon482' }, provider: 'gemini', models_used: ['gemini-3.8-flash'], tokens_in: 4000, tokens_out: 1100 },
  { id: '110', status: 'failed', tickers: ['SMCI'], title: 'Deep dive analysis into SMCI', created_at: hoursAgo(9), user: { nickname: 'QuietOtter17' } },
  { id: '102', status: 'completed', tickers: ['AAPL'], title: 'AAPL: services margin at risk', created_at: hoursAgo(30), user: { nickname: 'IronBadger903' }, provider: 'openai', models_used: ['gpt-5.1'], rarity: 'Rare', tokens_in: 9000, tokens_out: 6096 },
];

function renderPage(payload: { data: unknown[]; total: number } | Error = { data: notes, total: notes.length }, route = '/research') {
  if (payload instanceof Error) (api.get as Mock).mockRejectedValue(payload);
  else (api.get as Mock).mockResolvedValue({ data: payload });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ConfirmProvider>
        <MemoryRouter initialEntries={[route]}>
          <ResearchListPage />
        </MemoryRouter>
      </ConfirmProvider>
    </QueryClientProvider>,
  );
}

const rowOf = (title: string) => screen.getByRole('link', { name: title }).closest('li') as HTMLElement;

describe('ResearchListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as Mock).mockReturnValue({ user: { id: 'u1', role: 'user' } });
  });

  it('has one page heading and links every report to its note', async () => {
    renderPage();
    expect(await screen.findByRole('link', { name: 'AAPL: services margin at risk' })).toHaveAttribute('href', '/ticker/AAPL/research/102');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('AI Reports');
  });

  it('tells queued, running and failed reports apart in words', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Deep dive analysis into SMCI' });

    // These three used to share one grey "pending / processing / failed" chip.
    expect(within(rowOf('How exposed is net interest income to cuts?')).getByText('Queued')).toBeInTheDocument();
    expect(within(rowOf('Deep dive analysis into COIN')).getByText('Running')).toBeInTheDocument();
    const failed = within(rowOf('Deep dive analysis into SMCI')).getByText('Failed');
    // Red for failure, amber for work in progress.
    expect(failed.className).toMatch(/rose|red|down/);
    expect(within(rowOf('Deep dive analysis into COIN')).getByText('Running').className).toContain('signal');
    // A finished report carries no status stamp.
    expect(within(rowOf('AAPL: services margin at risk')).queryByText(/Queued|Running|Failed/)).toBeNull();
  });

  it('shows relative time, the model and grouped token counts', async () => {
    renderPage();
    const row = rowOf((await screen.findByRole('link', { name: 'AAPL: services margin at risk' })).textContent ?? '');
    expect(within(row).getByText('1d ago')).toBeInTheDocument();
    expect(within(row).getByText('gpt-5.1')).toBeInTheDocument();
    expect(within(row).getByText('15,096 tokens')).toBeInTheDocument();
  });

  it('caps a long ticker list instead of wrapping a row of chips', async () => {
    renderPage();
    const row = rowOf((await screen.findByRole('link', { name: 'Smart News Briefing' })).textContent ?? '');
    expect(row).toHaveTextContent('NVDA · TSLA · AAPL +2');
    expect(row).not.toHaveTextContent('INTC');
  });

  it('filters by ticker, title, author, model or status', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Smart News Briefing' });
    const filter = screen.getByRole('searchbox', { name: 'Filter reports' });

    fireEvent.change(filter, { target: { value: 'smci' } });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Deep dive analysis into SMCI' })).toBeInTheDocument();

    fireEvent.change(filter, { target: { value: 'ironbadger' } });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);

    fireEvent.change(filter, { target: { value: 'gpt-5.1' } });
    expect(screen.getByRole('link', { name: 'AAPL: services margin at risk' })).toBeInTheDocument();

    fireEvent.change(filter, { target: { value: 'failed' } });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);

    // Every term must match.
    fireEvent.change(filter, { target: { value: 'aapl briefing' } });
    expect(screen.getByRole('link', { name: 'Smart News Briefing' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'AAPL: services margin at risk' })).toBeNull();
  });

  it('says when nothing matches and lets the filter be cleared', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Smart News Briefing' });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter reports' }), { target: { value: 'zzzz' } });

    const empty = screen.getByRole('status');
    expect(empty).toHaveTextContent('No reports match that filter');
    // Clearable from the empty state as well as from the field itself.
    expect(screen.getAllByRole('button', { name: 'Clear filter' })).toHaveLength(2);
    fireEvent.click(within(empty).getByRole('button', { name: 'Clear filter' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(notes.length);
  });

  it('says so when the list is only the newest part of a longer history', async () => {
    renderPage({ data: notes, total: 137 });
    expect(await screen.findByText('Showing the 5 most recent of 137 reports.')).toBeInTheDocument();
  });

  it('asks for the last 24 hours on the recent view and marks it selected', async () => {
    renderPage({ data: [], total: 0 }, '/research?filter=recent');
    expect(await screen.findByText('No new reports in the last 24 hours')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/research', { params: { limit: 50, since: 24 } });
    expect(screen.getByRole('radio', { name: 'New (24h)' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'All reports' })).toHaveAttribute('aria-checked', 'false');
  });

  it('shows an empty state when there are no reports at all', async () => {
    renderPage({ data: [], total: 0 });
    expect(await screen.findByText('No reports yet')).toBeInTheDocument();
  });

  it('reports a load failure and offers a retry', async () => {
    renderPage(new Error('boom'));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Couldn’t load the reports');
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('offers delete only to admins, behind a confirmation', async () => {
    const { unmount } = renderPage();
    await screen.findByRole('link', { name: 'Smart News Briefing' });
    expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull();
    unmount();

    (useAuth as Mock).mockReturnValue({ user: { id: 'a1', role: 'admin' } });
    (api.delete as Mock).mockResolvedValue({});
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete "Smart News Briefing"' }));

    const dialog = await screen.findByRole('dialog');
    expect(api.delete).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete note' }));
    await vi.waitFor(() => expect(api.delete).toHaveBeenCalledWith('/research/111'));
  });
});
