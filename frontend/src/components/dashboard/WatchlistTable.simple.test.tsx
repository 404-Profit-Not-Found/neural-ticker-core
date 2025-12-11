import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
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

describe('WatchlistTable - Simple Render Test', () => {
  let apiCallCount = 0;
  let queryClient: QueryClient;

  beforeEach(() => {
    apiCallCount = 0;
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
          staleTime: Infinity, // Never go stale during test
        },
      },
    });

    vi.spyOn(api, 'get').mockImplementation((url) => {
      apiCallCount++;
      console.log(`API GET call #${apiCallCount}: ${url}`);
      
      if (apiCallCount > 50) {
        throw new Error(`INFINITE LOOP: More than 50 API calls detected!`);
      }

      return Promise.resolve({
        data: [{ id: 'list-1', name: 'Empty List', items: [] }],
      } as AxiosResponse);
    });

    vi.spyOn(api, 'post').mockImplementation((url) => {
      apiCallCount++;
      console.log(`API POST call #${apiCallCount}: ${url}`);
      
      if (apiCallCount > 50) {
        throw new Error(`INFINITE LOOP: More than 50 API calls detected!`);
      }

      return Promise.resolve({ data: [] } as AxiosResponse);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    console.log(`Total API calls: ${apiCallCount}`);
  });

  it('should render empty watchlist without excessive API calls', async () => {
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <WatchlistTable />
        </ToastProvider>
      </QueryClientProvider>,
    );

    // Wait for initial render
    await waitFor(
      () => {
        expect(container.textContent).toContain('Empty List');
      },
      { timeout: 2000 }
    );

    // Wait a bit more to catch any delayed loops
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Should have made only a few API calls:
    // 1. Initial watchlists fetch
    // 2. Maybe one more for snapshots (but should be disabled for empty)
    console.log(`Final API call count: ${apiCallCount}`);
    expect(apiCallCount).toBeLessThan(5);
  }, 10000);
});

// Made with Bob
