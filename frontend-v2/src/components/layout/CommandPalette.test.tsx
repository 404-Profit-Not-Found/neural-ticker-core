import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import { CommandPalette } from './CommandPalette';
import { api } from '../../lib/api';
import {
  closeCommandPalette,
  openCommandPalette,
  recentTickers,
} from '../../app/commandPalette';

vi.mock('../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  cn: (...args: (string | boolean | undefined)[]) => args.filter(Boolean).join(' '),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const auth = {
  user: { id: 'u1', role: 'user' } as { id: string; role: string },
  logout: vi.fn(),
  refreshSession: vi.fn().mockResolvedValue(null),
};
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));

vi.mock('../dashboard/TickerLogo', () => ({
  TickerLogo: ({ symbol }: { symbol: string }) => <span data-testid={`logo-${symbol}`} />,
}));

vi.mock('../../app/routes', () => ({ preloadRoute: vi.fn() }));

const LOCAL = [
  { symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', is_locally_tracked: true },
  { symbol: 'NVO', name: 'Novo Nordisk', exchange: 'NYSE', is_locally_tracked: true },
];

function renderPalette(sibling?: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        {sibling}
        <CommandPalette />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const input = () => screen.getByRole('combobox');

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    auth.user = { id: 'u1', role: 'user' };
    act(() => closeCommandPalette());
    (api.get as Mock).mockResolvedValue({ data: [] });
    (api.patch as Mock).mockResolvedValue({ data: {} });
    // jsdom does not implement scrollIntoView.
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('is closed until opened, and opens with Cmd/Ctrl+K', () => {
    renderPalette();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.getByRole('dialog', { name: /search tickers and commands/i })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens with "/" but not while the user is typing in a field', () => {
    renderPalette(<input aria-label="other field" />);
    fireEvent.keyDown(screen.getByLabelText('other field'), { key: '/' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: '/' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('lists pages when empty and hides the admin console from non-admins', () => {
    renderPalette();
    act(() => openCommandPalette());
    expect(screen.getByRole('option', { name: /portfolio/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /admin console/i })).not.toBeInTheDocument();
  });

  it('shows the admin console to admins', () => {
    auth.user = { id: 'u1', role: 'admin' };
    renderPalette();
    act(() => openCommandPalette());
    expect(screen.getByRole('option', { name: /admin console/i })).toBeInTheDocument();
  });

  it('navigates to a page with the keyboard and closes', () => {
    renderPalette();
    act(() => openCommandPalette());
    fireEvent.change(input(), { target: { value: 'portf' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(mockNavigate).toHaveBeenCalledWith('/portfolio');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('searches tracked tickers (debounced) and opens the chosen one', async () => {
    (api.get as Mock).mockResolvedValue({ data: LOCAL });
    renderPalette();
    act(() => openCommandPalette());
    fireEvent.change(input(), { target: { value: 'nv' } });

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/tickers', {
        params: { search: 'nv', external: 'false' },
      }),
    );
    const option = await screen.findByRole('option', { name: /NVIDIA Corporation/i });
    fireEvent.click(option);

    expect(mockNavigate).toHaveBeenCalledWith('/ticker/NVDA');
    expect(recentTickers()).toEqual(['NVDA']);
  });

  it('moves the selection with the arrow keys', async () => {
    (api.get as Mock).mockResolvedValue({ data: LOCAL });
    renderPalette();
    act(() => openCommandPalette());
    fireEvent.change(input(), { target: { value: 'nv' } });
    await screen.findByRole('option', { name: /NVIDIA Corporation/i });

    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(mockNavigate).toHaveBeenCalledWith('/ticker/NVO');
  });

  it('offers a global search when nothing is tracked, and reports no matches', async () => {
    renderPalette();
    act(() => openCommandPalette());
    fireEvent.change(input(), { target: { value: 'zzzq' } });

    const external = await screen.findByRole('option', { name: /in global markets/i });
    fireEvent.click(external);

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/tickers', {
        params: { search: 'zzzq', external: 'true' },
      }),
    );
    expect(await screen.findByText(/no matches found/i)).toBeInTheDocument();
    // Still open: the user can refine the query.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('never shows results that belong to an earlier query', async () => {
    let resolveSlow: (v: unknown) => void = () => undefined;
    (api.get as Mock).mockImplementation((_url: string, opts: { params: { search: string } }) =>
      opts.params.search === 'aa'
        ? new Promise((resolve) => {
            resolveSlow = resolve;
          })
        : Promise.resolve({ data: LOCAL }),
    );
    renderPalette();
    act(() => openCommandPalette());

    fireEvent.change(input(), { target: { value: 'aa' } });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    fireEvent.change(input(), { target: { value: 'nv' } });
    await screen.findByRole('option', { name: /NVIDIA Corporation/i });

    await act(async () => {
      resolveSlow({
        data: [{ symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', is_locally_tracked: true }],
      });
    });
    expect(screen.queryByRole('option', { name: /Apple Inc/i })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /NVIDIA Corporation/i })).toBeInTheDocument();
  });

  it('switches theme immediately and saves the preference', async () => {
    renderPalette();
    act(() => openCommandPalette());
    fireEvent.change(input(), { target: { value: 'light' } });
    fireEvent.click(screen.getByRole('option', { name: /light theme/i }));

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(api.patch).toHaveBeenCalledWith('/users/me', { theme: 'light' });
    await waitFor(() => expect(auth.refreshSession).toHaveBeenCalled());
  });

  it('shows recently viewed tickers and ignores tampered storage', () => {
    localStorage.setItem(
      'nt_v2_recent_tickers',
      JSON.stringify(['MSFT', '<img src=x onerror=alert(1)>', '../../admin', 42, 'BRK.B']),
    );
    renderPalette();
    act(() => openCommandPalette());
    expect(screen.getByRole('option', { name: 'MSFT' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'BRK.B' })).toBeInTheDocument();
    expect(screen.queryByText(/onerror/)).not.toBeInTheDocument();
    expect(screen.queryByText(/admin$/)).not.toBeInTheDocument();
  });

  it('closes on Escape', () => {
    renderPalette();
    act(() => openCommandPalette());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
