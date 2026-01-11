import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
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

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
    },
  });

const renderWithProviders = (queryClient: QueryClient) =>
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <WatchlistTable />
      </ToastProvider>
    </QueryClientProvider>,
  );

describe('WatchlistTable - Infinite Loop Prevention', () => {
  let mockGet: vi.SpyInstance;
  let mockPost: vi.SpyInstance;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('should not cause infinite loop with empty watchlist', async () => {
    const queryClient = createQueryClient();

    // Mock empty watchlist
    mockGet = vi.spyOn(api, 'get').mockResolvedValue({
      data: [{ id: 'list-1', name: 'Empty List', items: [] }],
    } as AxiosResponse);

    mockPost = vi.spyOn(api, 'post').mockResolvedValue({
      data: [],
    } as AxiosResponse);

    const OriginalWatchlistTable = WatchlistTable;
    let componentRenderCount = 0;
    const TrackedWatchlistTable = () => {
      componentRenderCount++;
      return <OriginalWatchlistTable />;
    };

    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <TrackedWatchlistTable />
        </ToastProvider>
      </QueryClientProvider>,
    );

    // Wait for initial render and data fetch
    await waitFor(() => {
      expect(screen.getByText(/Empty List/i)).toBeInTheDocument();
    });

    // Wait a bit more to ensure no additional renders
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    // Component should render a reasonable number of times (not hundreds)
    // Initial render + data fetch + potential React StrictMode re-render = ~3-5 renders max
    expect(componentRenderCount).toBeLessThan(10);
    // Allow up to 2 calls in case of StrictMode double-render or retry
    expect(mockGet.mock.calls.length).toBeLessThan(3);
    expect(mockPost).toHaveBeenCalledTimes(0); // No snapshots call for empty list
  });

  it('should not cause infinite loop when searching with no results', async () => {
    const queryClient = createQueryClient();

    mockGet = vi.spyOn(api, 'get').mockImplementation((url) => {
      if (url === '/watchlists') {
        return Promise.resolve({
          data: [{ id: 'list-1', name: 'My List', items: [] }],
        } as AxiosResponse);
      }
      // Search endpoint returns empty
      return Promise.resolve({ data: [] } as AxiosResponse);
    });

    mockPost = vi.spyOn(api, 'post').mockResolvedValue({
      data: [],
    } as AxiosResponse);

    renderWithProviders(queryClient);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Add stock/i)).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Add stock/i);
    const user = userEvent.setup();

    // Type in search box
    await user.type(searchInput, 'INVALID');

    // Wait for search to complete
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/tickers?search=INVALID');
    });

    // Wait to ensure no infinite loop
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    // Should only call search once per character typed
    const searchCalls = mockGet.mock.calls.filter((call) =>
      call[0].includes('/tickers?search='),
    );
    expect(searchCalls.length).toBeLessThan(20); // Reasonable number for typing
  });

  it('should maintain stable array references for empty states', async () => {
    const queryClient = createQueryClient();

    mockGet = vi.spyOn(api, 'get').mockResolvedValue({
      data: [{ id: 'list-1', name: 'Empty List', items: [] }],
    } as AxiosResponse);

    mockPost = vi.spyOn(api, 'post').mockResolvedValue({
      data: [],
    } as AxiosResponse);

    const { rerender } = renderWithProviders(queryClient);

    await waitFor(() => {
      expect(screen.getByText(/Empty List/i)).toBeInTheDocument();
    });

    const initialGetCallCount = mockGet.mock.calls.length;

    // Force a re-render
    rerender(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <WatchlistTable />
        </ToastProvider>
      </QueryClientProvider>,
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Should not trigger additional API calls on re-render
    expect(mockGet.mock.calls.length).toBe(initialGetCallCount);
  });

  it('should not cause infinite loop when adding ticker to empty watchlist', async () => {
    const queryClient = createQueryClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let watchlistItems: any[] = [];

    mockGet = vi.spyOn(api, 'get').mockImplementation((url) => {
      if (url === '/watchlists') {
        return Promise.resolve({
          data: [{ id: 'list-1', name: 'My List', items: watchlistItems }],
        } as AxiosResponse);
      }
      if (url.includes('/tickers?search=')) {
        return Promise.resolve({
          data: [{ symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', logo_url: '' }],
        } as AxiosResponse);
      }
      return Promise.resolve({ data: [] } as AxiosResponse);
    });

    mockPost = vi.spyOn(api, 'post').mockImplementation((url) => {
      if (url.includes('/items')) {
        // Simulate adding ticker
        watchlistItems = [
          {
            id: 'item-1',
            ticker: { id: 'ticker-1', symbol: 'AAPL' },
            addedAt: new Date().toISOString(),
          },
        ];
        queryClient.invalidateQueries({ queryKey: ['watchlists'] });
        return Promise.resolve({ data: { success: true } } as AxiosResponse);
      }
      if (url.includes('/snapshots')) {
        return Promise.resolve({
          data: [
            {
              ticker: { symbol: 'AAPL', id: 'ticker-1', name: 'Apple Inc.' },
              latestPrice: { close: 150, prevClose: 148 },
              fundamentals: { sector: 'Technology' },
            },
          ],
        } as AxiosResponse);
      }
      return Promise.resolve({ data: [] } as AxiosResponse);
    });

    renderWithProviders(queryClient);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Add stock/i)).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Add stock/i);
    const user = userEvent.setup();

    // Type and select a ticker
    await user.type(searchInput, 'AAPL');

    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });

    // Click on suggestion
    const suggestion = screen.getByText('AAPL');
    await user.click(suggestion);

    // Wait for ticker to be added
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        expect.stringContaining('/items'),
        expect.objectContaining({ symbol: 'AAPL' }),
      );
    });

    // Wait to ensure no infinite loop after adding
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    // Should have reasonable number of API calls
    expect(mockGet.mock.calls.length).toBeLessThan(20);
    expect(mockPost.mock.calls.length).toBeLessThan(10);
  });

  it('should handle rapid state changes without infinite loops', async () => {
    const queryClient = createQueryClient();

    mockGet = vi.spyOn(api, 'get').mockResolvedValue({
      data: [
        { id: 'list-1', name: 'List 1', items: [] },
        { id: 'list-2', name: 'List 2', items: [] },
      ],
    } as AxiosResponse);

    mockPost = vi.spyOn(api, 'post').mockResolvedValue({
      data: [],
    } as AxiosResponse);

    renderWithProviders(queryClient);

    await waitFor(() => {
      expect(screen.getByText(/List 1/i)).toBeInTheDocument();
    });

    const user = userEvent.setup();

    // Rapidly interact with UI
    const dropdown = screen.getByText(/List 1/i);
    await user.click(dropdown);

    await waitFor(() => {
      expect(screen.getByText(/List 2/i)).toBeInTheDocument();
    });

    // Switch lists rapidly
    const list2Button = screen.getByText(/List 2/i);
    await user.click(list2Button);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    // Should not cause excessive re-renders
    expect(mockGet.mock.calls.length).toBeLessThan(10);
  });
});

// Made with Bob
