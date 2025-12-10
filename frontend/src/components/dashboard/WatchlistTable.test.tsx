import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WatchlistTable } from './WatchlistTable';
import { ToastProvider } from '../ui/toast';
import { api } from '../../lib/api';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { AxiosResponse } from 'axios';

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
        <WatchlistTable />
      </ToastProvider>
    </QueryClientProvider>,
  );

type WatchlistPayload = { id: string; name: string; items: unknown[] }[];
let mockGet: vi.SpyInstance<Promise<AxiosResponse<WatchlistPayload>>, Parameters<typeof api.get>>;
let mockDelete: vi.SpyInstance<Promise<AxiosResponse<{ success: boolean }>>, Parameters<typeof api.delete>>;

describe('WatchlistTable', () => {
  beforeEach(() => {
    mockGet = vi
      .spyOn(api, 'get')
      .mockResolvedValue({ data: [{ id: 'list-1', name: 'My List', items: [] }] } as AxiosResponse<WatchlistPayload>);
    mockDelete = vi
      .spyOn(api, 'delete')
      .mockResolvedValue({ data: { success: true } } as AxiosResponse<{ success: boolean }>);
    vi.spyOn(api, 'post').mockResolvedValue({ data: [] } as AxiosResponse<unknown>);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('renders delete watchlist button when a list is active', async () => {
    renderWithProviders();

    expect(
      await screen.findByRole('button', { name: /delete watchlist/i }),
    ).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalled();
  });

  it('deletes the active watchlist when trash icon is clicked and confirmed', async () => {
    renderWithProviders();

    const deleteButton = await screen.findByRole('button', {
      name: /delete watchlist/i,
    });

    const user = userEvent.setup();
    await user.click(deleteButton);

    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith('/watchlists/list-1'),
    );
    expect(window.confirm).toHaveBeenCalled();
  });
});
