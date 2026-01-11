import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
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

describe('WatchlistTable - Typing Performance Test', () => {
  let apiCallCount = 0;
  let queryClient: QueryClient;

  beforeEach(() => {
    apiCallCount = 0;
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    });

    vi.spyOn(api, 'get').mockImplementation((url) => {
      apiCallCount++;
      console.log(`API GET call #${apiCallCount}: ${url}`);
      
      if (apiCallCount > 20) {
        throw new Error(`TOO MANY API CALLS: ${apiCallCount} calls detected during typing!`);
      }

      if (url === '/watchlists') {
        return Promise.resolve({
          data: [{ id: 'list-1', name: 'My List', items: [] }],
        } as AxiosResponse);
      }

      // Search endpoint
      if (url.includes('/tickers?search=')) {
        const query = url.split('search=')[1];
        return Promise.resolve({
          data: [
            { symbol: query.toUpperCase(), name: 'Test Company', exchange: 'NASDAQ', logo_url: '' }
          ],
        } as AxiosResponse);
      }

      return Promise.resolve({ data: [] } as AxiosResponse);
    });

    vi.spyOn(api, 'post').mockResolvedValue({ data: [] } as AxiosResponse);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    console.log(`Total API calls after typing: ${apiCallCount}`);
  });

  it('should not make excessive API calls when typing in search box', async () => {
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <WatchlistTable />
        </ToastProvider>
      </QueryClientProvider>,
    );

    // Wait for initial render
    await waitFor(() => {
      expect(container.textContent).toContain('My List');
    });

    const initialCallCount = apiCallCount;
    console.log(`Initial API calls: ${initialCallCount}`);

    // Find search input
    const searchInput = container.querySelector('input[placeholder*="Add ticker"]') as HTMLInputElement;
    expect(searchInput).toBeTruthy();

    const user = userEvent.setup();

    // Type "AAPL" character by character (simulating real typing)
    await user.type(searchInput, 'AAPL');

    // Wait for debouncing to settle
    await new Promise((resolve) => setTimeout(resolve, 300));

    const typingCallCount = apiCallCount - initialCallCount;
    console.log(`API calls during typing: ${typingCallCount}`);

    // With useDeferredValue and 2-char minimum:
    // - Should NOT call API for "A" (1 char)
    // - Should call API for "AA", "AAP", "AAPL" (3 calls max)
    // But with debouncing, might be even fewer
    expect(typingCallCount).toBeLessThan(5);
    expect(apiCallCount).toBeLessThan(10);
  }, 10000);

  it('should not search with single character', async () => {
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <WatchlistTable />
        </ToastProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(container.textContent).toContain('My List');
    });

    const initialCallCount = apiCallCount;

    const searchInput = container.querySelector('input[placeholder*="Add ticker"]') as HTMLInputElement;
    const user = userEvent.setup();

    // Type single character
    await user.type(searchInput, 'A');
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Should not have made any search API calls (only initial watchlist call)
    const searchCalls = apiCallCount - initialCallCount;
    expect(searchCalls).toBe(0);
  }, 10000);
});

// Made with Bob
