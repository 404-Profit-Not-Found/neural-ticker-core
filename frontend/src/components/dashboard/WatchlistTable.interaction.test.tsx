import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
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

describe('WatchlistTable - Interaction Freeze', () => {
    let mockGet: vi.SpyInstance;

    beforeEach(() => {
        vi.clearAllMocks();
        mockGet = vi.spyOn(api, 'get').mockResolvedValue({
            data: [{ id: 'list-1', name: 'Test List', items: [] }],
        } as AxiosResponse);
        vi.spyOn(api, 'post').mockResolvedValue({ values: [] });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should not freeze when clicking document body', async () => {
        const queryClient = createQueryClient();

        renderWithProviders(queryClient);

        await waitFor(() => {
            expect(screen.getByText(/Test List/i)).toBeInTheDocument();
        });

        // Simulate clicking "anything" (the body)
        // We do this multiple times to see if it triggers an explosion
        for (let i = 0; i < 5; i++) {
            await act(async () => {
                fireEvent.mouseDown(document.body);
                await new Promise((resolve) => setTimeout(resolve, 50));
            });
        }

        // If we survive this, we are good?
        // Let's check if we triggered excessive API calls
        expect(mockGet.mock.calls.length).toBeLessThan(10);
    });
});
