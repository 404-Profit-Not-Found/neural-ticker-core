import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// The table renders real links (ticker symbols), so it needs a router.
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WatchlistTable } from './WatchlistTable';
import { ToastProvider } from '../ui/toast';
import { ConfirmProvider } from '../ui/confirm';
import { api } from '../../lib/api';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, beforeEach, afterEach, type MockInstance } from 'vitest';
import type { AxiosResponse } from 'axios';

// Radix popovers measure their anchor; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
} as unknown as typeof ResizeObserver;


vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom',
  );
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
        <ConfirmProvider>
          <MemoryRouter>
            <WatchlistTable />
          </MemoryRouter>
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );

type WatchlistPayload = { id: string; name: string; items: unknown[] }[];
let mockGet: MockInstance;
let mockDelete: MockInstance;

describe('WatchlistTable', () => {
  beforeEach(() => {
    mockGet = vi
      .spyOn(api, 'get')
      .mockResolvedValue({ data: [{ id: 'list-1', name: 'My List', items: [] }] } as unknown as AxiosResponse<WatchlistPayload>);
    mockDelete = vi
      .spyOn(api, 'delete')
      .mockResolvedValue({ data: { success: true } } as unknown as AxiosResponse<{ success: boolean }>);
    vi.spyOn(api, 'post').mockResolvedValue({ data: [] } as unknown as AxiosResponse<unknown>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('renders delete watchlist button when a list is active', async () => {
    renderWithProviders();

    // List actions live in the list-switcher menu, opened from the page title.
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /my list/i }, { timeout: 3000 }));

    expect(
      await screen.findByRole('button', { name: /delete watchlist/i }),
    ).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalled();
  });

  it('deletes the active watchlist when trash icon is clicked and confirmed', async () => {
    renderWithProviders();

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /my list/i }));
    const deleteButton = await screen.findByRole('button', {
      name: /delete watchlist/i,
    });

    await user.click(deleteButton);

    // The themed confirm dialog names the list; nothing is deleted until confirmed.
    const dialog = await screen.findByRole('dialog', { name: /delete watchlist “My List”\?/i });
    expect(mockDelete).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: /delete watchlist/i }));

    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith('/watchlists/list-1'),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the watchlist when the confirm dialog is cancelled', async () => {
    renderWithProviders();

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /my list/i }));
    const deleteButton = await screen.findByRole('button', {
      name: /delete watchlist/i,
    });

    await user.click(deleteButton);

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
