/**
 * Network budget of the dashboard, measured against the real page: the real
 * CurrencyProvider, market bar, opportunities carousel and news feed, with only
 * `api.get` faked. A cold load must issue each request exactly once; coming
 * back to the page (or reloading it) must paint from the cache.
 */
import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider, dehydrate, hydrate } from '@tanstack/react-query';

// The real provider is under test here: `setupTests.ts` mocks it globally.
vi.mock('../context/CurrencyContext', async () => {
    const actual = await vi.importActual<typeof import('../context/CurrencyContext')>(
        '../context/CurrencyContext',
    );
    return actual;
});

vi.mock('../lib/api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../lib/api')>();
    return {
        ...actual,
        api: { get: vi.fn(), post: vi.fn() },
    };
});

vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({ user: { id: 'user-1', email: 'test@example.com' }, loading: false }),
}));

import { api } from '../lib/api';
import { CurrencyProvider } from '../context/CurrencyContext';
import { Dashboard } from './Dashboard';

const marketStatus = {
    isOpen: true,
    exchange: 'US',
    session: 'regular' as const,
};

const ANALYZER =
    '/market-data/analyzer?page=1&limit=6&sortBy=upside_percent&sortDir=DESC' +
    '&aiRating=Speculative+Buy&aiRating=No+Brainer&aiRating=Strong+Buy';

/** `GET url?params` as one comparable string, whatever shape `params` has. */
function describeRequest(url: string, config?: { params?: unknown }): string {
    const params = config?.params;
    if (!params) return url;
    const query =
        params instanceof URLSearchParams
            ? params.toString()
            : new URLSearchParams(
                  Object.entries(params as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
              ).toString();
    return query ? `${url}?${query}` : url;
}

function respond(url: string): unknown {
    switch (url) {
        case '/currency/available':
            return { currencies: [{ code: 'USD', flag: '🇺🇸' }, { code: 'EUR', flag: '🇪🇺' }] };
        case '/currency/rates':
            return { rates: { EUR: 0.92 } };
        case '/tickers/count':
            return { count: 123 };
        case '/stats/strong-buy':
            return { count: 7, symbols: [] };
        case '/stats/sell':
            return { count: 4, symbols: [] };
        case '/portfolio/positions':
            return [{ id: 'p1', symbol: 'AAPL', current_value: 1500, cost_basis: 1000 }];
        case '/research':
            return { data: [], total: 9 };
        case '/news/digest':
            return {
                id: 'digest-1',
                title: 'Morning briefing',
                answer_markdown: 'Markets are calm.',
                created_at: new Date().toISOString(),
                relatedTickers: [],
            };
        case '/news/general':
            return [
                {
                    id: 1,
                    category: 'general',
                    datetime: 1_700_000_000,
                    headline: 'Fed holds rates',
                    image: '',
                    related: '',
                    source: 'Wire',
                    summary: 'No change.',
                    url: 'https://example.com/a',
                },
            ];
        case '/watchlists':
            return [];
        case '/market/status/all':
            return { us: marketStatus, eu: marketStatus, asia: marketStatus };
        case '/market-data/analyzer':
            return { items: [], meta: { total: 0, page: 1, limit: 6, totalPages: 0 } };
        default:
            throw new Error(`Unexpected request: ${url}`);
    }
}

/** Same query defaults as the app's client (30s fresh), minus retries. */
const createClient = () =>
    new QueryClient({
        defaultOptions: { queries: { staleTime: 1000 * 30, retry: false } },
    });

/** Every GET since the last `mockClear`, as `{ 'url?params': count }`. */
function requestCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const [url, config] of (api.get as Mock).mock.calls) {
        const key = describeRequest(url as string, config as { params?: unknown });
        counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
}

function App({ client, showDashboard = true }: { client: QueryClient; showDashboard?: boolean }) {
    return (
        <QueryClientProvider client={client}>
            <MemoryRouter>
                {/* App-level provider: stays mounted while pages come and go. */}
                <CurrencyProvider>{showDashboard && <Dashboard />}</CurrencyProvider>
            </MemoryRouter>
        </QueryClientProvider>
    );
}

/** Wait until the page has everything, and nothing fires late. */
async function settle(client: QueryClient, portfolioValue = '$1,500') {
    expect(await screen.findByText('Fed holds rates')).toBeInTheDocument();
    expect(await screen.findByText('Morning briefing')).toBeInTheDocument();
    expect(await screen.findByText('123')).toBeInTheDocument();
    expect(await screen.findByText(portfolioValue)).toBeInTheDocument();
    await waitFor(() => expect(client.isFetching()).toBe(0));
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
    });
}

/** The dashboard is fully painted, with no skeleton, spinner or placeholder. */
function expectPaintedFromCache(container: HTMLElement) {
    expect(screen.getByText('Fed holds rates')).toBeInTheDocument();
    expect(screen.getByText('Morning briefing')).toBeInTheDocument();
    expect(screen.getByText('Markets are calm.')).toBeInTheDocument();
    expect(screen.getByText('123')).toBeInTheDocument(); // Tickers
    expect(screen.getByText('7')).toBeInTheDocument(); // Strong Buy
    expect(screen.getByText('4')).toBeInTheDocument(); // Sell
    expect(screen.getByText('9')).toBeInTheDocument(); // AI Reports (24h)
    expect(screen.getByText('$1,500')).toBeInTheDocument(); // Portfolio
    expect(screen.queryByText('...')).not.toBeInTheDocument();
    expect(screen.queryByText('Generating Your Digest')).not.toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).toBeNull();
    expect(container.querySelector('.animate-pulse')).toBeNull();
}

describe('Dashboard network budget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        (api.get as Mock).mockImplementation((url: string) =>
            Promise.resolve({ data: respond(url) }),
        );
    });

    it('cold load: issues every request exactly once', async () => {
        const client = createClient();
        render(<App client={client} />);
        await settle(client);

        expect(requestCounts()).toEqual({
            '/currency/available': 1,
            '/currency/rates': 1,
            '/market/status/all': 1,
            '/tickers/count': 1,
            '/stats/strong-buy': 1,
            '/stats/sell': 1,
            '/portfolio/positions?displayCurrency=USD': 1,
            '/research?since=24&limit=1': 1,
            [ANALYZER]: 1,
            '/watchlists': 1,
            '/portfolio/positions': 1,
            '/news/digest': 1,
            '/news/general': 1,
        });
        expect(api.post).not.toHaveBeenCalled();
    });

    it('cold load with a saved display currency: still once each, in that currency only', async () => {
        localStorage.setItem('displayCurrency', 'EUR');
        const client = createClient();
        render(<App client={client} />);
        await settle(client, '€1,500');

        expect(requestCounts()).toEqual({
            '/currency/available': 1,
            '/currency/rates': 1,
            '/market/status/all': 1,
            '/tickers/count': 1,
            '/stats/strong-buy': 1,
            '/stats/sell': 1,
            '/portfolio/positions?displayCurrency=EUR': 1,
            '/research?since=24&limit=1': 1,
            [ANALYZER]: 1,
            '/watchlists': 1,
            '/portfolio/positions': 1,
            '/news/digest': 1,
            '/news/general': 1,
        });
    });

    it('revisit: paints from the cache at once and issues no requests while it is fresh', async () => {
        const client = createClient();
        const page = render(<App client={client} />);
        await settle(client);

        // Navigate away…
        page.rerender(<App client={client} showDashboard={false} />);
        expect(screen.queryByText('Morning briefing')).not.toBeInTheDocument();
        (api.get as Mock).mockClear();

        // …and back. No awaiting before the assertions: this is the first paint.
        page.rerender(<App client={client} />);
        expectPaintedFromCache(page.container);

        // Portfolio mutations invalidate every positions entry together
        // (PortfolioPage.refetchAll), so positions no longer need a
        // revalidate-on-every-mount safety net.
        await waitFor(() => expect(client.isFetching()).toBe(0));
        expect(requestCounts()).toEqual({});
        expectPaintedFromCache(page.container);
    });

    it('reload: paints from the persisted cache before the network answers', async () => {
        const firstVisit = createClient();
        const page = render(<App client={firstVisit} />);
        await settle(firstVisit);
        page.unmount();

        // What the IndexedDB persister stores and restores: successful queries, as JSON.
        const persisted = JSON.parse(
            JSON.stringify(
                dehydrate(firstVisit, {
                    shouldDehydrateQuery: (query) => query.state.status === 'success',
                }),
            ),
        );
        const afterReload = createClient();
        hydrate(afterReload, persisted);

        // The network is now silent: only the cache can fill the page.
        (api.get as Mock).mockClear();
        (api.get as Mock).mockReturnValue(new Promise(() => {}));

        const reloaded = render(<App client={afterReload} />);
        expectPaintedFromCache(reloaded.container);
    });
});
