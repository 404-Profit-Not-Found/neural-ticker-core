import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../lib/api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../lib/api')>();
    return { ...actual, api: { get: vi.fn() } };
});

import { api } from '../../lib/api';
import { NewsFeed } from './NewsFeed';
import { newsKeys } from '../../hooks/useNews';
import { portfolioKeys } from '../../hooks/usePortfolio';
import { watchlistKeys } from '../../hooks/useWatchlist';

// ── Fixtures ────────────────────────────────────────────────────────────────

const DAY = 24 * 60 * 60 * 1000;

const todaysDigest = () => ({
    id: 'digest-today',
    title: 'Morning briefing',
    answer_markdown: 'Markets are calm.',
    created_at: new Date().toISOString(),
    relatedTickers: [],
});

const yesterdaysDigest = () => ({
    id: 'digest-yesterday',
    title: 'Yesterday briefing',
    answer_markdown: 'Markets were choppy.',
    created_at: new Date(Date.now() - DAY).toISOString(),
    relatedTickers: [],
});

/** What the server returns while a digest is being written: a row, no body. */
const unfinishedDigest = () => ({
    id: 'digest-today',
    title: 'Smart News Briefing - Generating...',
    created_at: new Date().toISOString(),
});

/** What the server returns when the user has no digest at all. */
const noDigest = { status: 'pending', message: 'Digest generation in progress or scheduled.' };

const headline = {
    id: 1,
    category: 'general',
    datetime: 1_700_000_000,
    headline: 'Fed holds rates',
    image: '',
    related: '',
    source: 'Wire',
    summary: 'No change.',
    url: 'https://example.com/a',
};

const position = { id: 'p1', symbol: 'AAPL', current_value: 1500, cost_basis: 1000 };

// ── Fake API ────────────────────────────────────────────────────────────────

type Route = () => Promise<{ data: unknown }>;

const ok = (data: unknown): Route => () => Promise.resolve({ data });
const fail: Route = () => Promise.reject(new Error('Network down'));
const never: Route = () => new Promise(() => {});

let routes: Record<string, Route>;

const requests = () => (api.get as Mock).mock.calls.map(([url]) => url as string);
const requestCount = (url: string) => requests().filter((u) => u === url).length;

// ── Harness ─────────────────────────────────────────────────────────────────

let queryClient: QueryClient;

const view = () => (
    <QueryClientProvider client={queryClient}>
        <MemoryRouter>
            <NewsFeed />
        </MemoryRouter>
    </QueryClientProvider>
);

/** Put results in the cache as if they were fetched ten minutes ago (stale). */
function seedStaleCache(entries: { digest: unknown; news?: unknown; positions?: unknown }) {
    const updatedAt = Date.now() - 10 * 60 * 1000;
    queryClient.setQueryData(newsKeys.digest, entries.digest, { updatedAt });
    queryClient.setQueryData(newsKeys.general, entries.news ?? [headline], { updatedAt });
    queryClient.setQueryData(portfolioKeys.positions(''), entries.positions ?? [position], { updatedAt });
    queryClient.setQueryData(watchlistKeys.all, [], { updatedAt });
}

const isLoadingUiShown = (container: HTMLElement) =>
    screen.queryByText('Generating Your Digest') !== null ||
    screen.queryByRole('status', { name: /Loading (digest|news)/ }) !== null ||
    container.querySelector('.animate-spin') !== null;

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    routes = {
        '/news/digest': ok(todaysDigest()),
        '/news/general': ok([headline]),
        '/portfolio/positions': ok([position]),
        '/watchlists': ok([]),
    };
    (api.get as Mock).mockImplementation((url: string) => {
        const route = routes[url];
        return route ? route() : Promise.reject(new Error(`Unexpected GET ${url}`));
    });
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

// ── Loading and caching ─────────────────────────────────────────────────────

describe('NewsFeed loading', () => {
    it('shows the loading state on the very first load, then the content', async () => {
        const { container } = render(view());

        // A plain fetch is a skeleton — it must not claim a digest is being
        // generated (that is a different, minute-long operation).
        expect(screen.getByRole('status', { name: 'Loading digest' })).toBeInTheDocument();
        expect(screen.getByRole('status', { name: 'Loading news' })).toBeInTheDocument();
        expect(screen.queryByText('Generating Your Digest')).not.toBeInTheDocument();

        expect(await screen.findByText('Morning briefing')).toBeInTheDocument();
        expect(await screen.findByText('Markets are calm.')).toBeInTheDocument();
        expect(await screen.findByText('Fed holds rates')).toBeInTheDocument();
        expect(isLoadingUiShown(container)).toBe(false);
    });

    it('renders cached data immediately, with no loading state, while it refreshes', () => {
        seedStaleCache({ digest: todaysDigest() });
        // The background refresh never answers: the cache alone must carry the UI.
        routes = {
            '/news/digest': never,
            '/news/general': never,
            '/portfolio/positions': never,
            '/watchlists': never,
        };

        const { container } = render(view());

        // No awaiting: this is the first paint.
        expect(screen.getByText('Morning briefing')).toBeInTheDocument();
        expect(screen.getByText('Markets are calm.')).toBeInTheDocument();
        expect(screen.getByText('Fed holds rates')).toBeInTheDocument();
        expect(isLoadingUiShown(container)).toBe(false);

        // …and the refresh really is running behind it.
        expect(queryClient.isFetching()).toBeGreaterThan(0);
        expect(requestCount('/news/digest')).toBe(1);
        expect(requestCount('/news/general')).toBe(1);
    });

    it('shows the first six headlines and links to the rest', async () => {
        routes['/news/general'] = ok(
            Array.from({ length: 30 }, (_, i) => ({ ...headline, id: i, headline: `Story ${i}` })),
        );

        render(view());

        expect(await screen.findByText('Story 5')).toBeInTheDocument();
        expect(screen.queryByText('Story 6')).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'All market news' })).toHaveAttribute('href', '/news');
    });

    it('keeps showing the previous digest and news when their refresh fails', async () => {
        seedStaleCache({ digest: todaysDigest() });
        routes = {
            '/news/digest': fail,
            '/news/general': fail,
            '/portfolio/positions': fail,
            '/watchlists': fail,
        };

        const { container } = render(view());

        await waitFor(() => {
            expect(queryClient.getQueryState(newsKeys.digest)?.status).toBe('error');
            expect(queryClient.getQueryState(newsKeys.general)?.status).toBe('error');
        });
        // The watchlists hook retries once (after a second) before it reports
        // the failure, so "nothing in flight" takes a little longer.
        await waitFor(() => expect(queryClient.isFetching()).toBe(0), { timeout: 4000 });

        expect(screen.getByText('Morning briefing')).toBeInTheDocument();
        expect(screen.getByText('Fed holds rates')).toBeInTheDocument();
        expect(screen.queryByText('Your AI Digest is Waiting')).not.toBeInTheDocument();
        expect(screen.queryByText('No recent news found.')).not.toBeInTheDocument();
        expect(isLoadingUiShown(container)).toBe(false);
    });

    it('keeps the cached portfolio count when its refresh fails', async () => {
        // No digest yet, one position: the "generate" button depends on that count.
        seedStaleCache({ digest: null });
        routes['/news/digest'] = ok(noDigest);
        routes['/portfolio/positions'] = fail;

        render(view());

        expect(screen.getByRole('button', { name: /Generate Your Digest/ })).toBeInTheDocument();

        await waitFor(() =>
            expect(queryClient.getQueryState(portfolioKeys.positions(''))?.status).toBe('error'),
        );
        expect(screen.getByRole('button', { name: /Generate Your Digest/ })).toBeInTheDocument();
        expect(screen.getByText(/Analyzing 1 tracked items/)).toBeInTheDocument();
    });

    it('says so, with a retry, when the first load fails — never "nothing here"', async () => {
        routes['/news/digest'] = fail;
        routes['/news/general'] = fail;
        routes['/portfolio/positions'] = fail;

        const { container } = render(view());

        expect(await screen.findByText("Couldn't load the digest")).toBeInTheDocument();
        expect(await screen.findByText("Couldn't load the news")).toBeInTheDocument();
        // A failure is not the "no digest yet" or "no news" state.
        expect(screen.queryByText('Your AI Digest is Waiting')).not.toBeInTheDocument();
        expect(screen.queryByText('No recent news found.')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Generate Your Digest/ })).not.toBeInTheDocument();
        expect(isLoadingUiShown(container)).toBe(false);
        // The digest endpoint is rate-limited: one automatic attempt, no retry…
        expect(requestCount('/news/digest')).toBe(1);

        // …and exactly one more when the user asks for it.
        routes['/news/digest'] = ok(todaysDigest());
        fireEvent.click(screen.getAllByRole('button', { name: 'Try again' })[0]);
        expect(await screen.findByText('Morning briefing')).toBeInTheDocument();
        expect(requestCount('/news/digest')).toBe(2);
    });
});

// ── Digest generation ───────────────────────────────────────────────────────

describe('NewsFeed digest generation', () => {
    /** Move the fake clock forward and let everything that became due run. */
    const advance = (ms: number) =>
        act(async () => {
            await vi.advanceTimersByTimeAsync(ms);
        });

    // The query cache batches its notifications on a 0ms timer, so the UI
    // catches up a moment after the request that changed it. Assertions are
    // made this long after (or before) the instant they are about.
    const SETTLE = 10;

    /**
     * Advance in small steps, so React re-renders (and re-runs effects) all
     * the way through — what a render-driven request loop needs to show up.
     */
    const advanceInSteps = async (total: number, step = 50) => {
        for (let elapsed = 0; elapsed < total; elapsed += step) await advance(step);
    };

    /** `await sinceClick.reach(2000)` runs the clock to 2000ms after creation. */
    function stopwatch() {
        let elapsed = 0;
        return {
            reach: async (ms: number) => {
                await advance(ms - elapsed);
                elapsed = ms;
            },
        };
    }

    /** A server with no digest until `finish()` is called. */
    function serverWritingADigest() {
        let state: 'none' | 'writing' | 'done' = 'none';
        routes['/news/digest'] = () =>
            ok(state === 'none' ? noDigest : state === 'writing' ? unfinishedDigest() : todaysDigest())();
        routes['/news/digest/trigger'] = () => {
            state = 'writing';
            return ok(unfinishedDigest())();
        };
        return {
            finish: () => {
                state = 'done';
            },
        };
    }

    const clickGenerate = () =>
        fireEvent.click(screen.getByRole('button', { name: /Generate Your Digest/ }));

    beforeEach(() => {
        vi.useFakeTimers();
    });

    it('triggers, waits 2s, then polls every second until the digest is written', async () => {
        const server = serverWritingADigest();
        render(view());
        await advance(SETTLE);
        expect(screen.getByText(/Analyzing 1 tracked items/)).toBeInTheDocument();
        (api.get as Mock).mockClear();

        clickGenerate();
        const sinceClick = stopwatch();
        await sinceClick.reach(SETTLE);
        expect(screen.getByText('Generating Your Digest')).toBeInTheDocument();
        expect(requests()).toEqual(['/news/digest/trigger']);

        // Nothing is polled during the first two seconds.
        await sinceClick.reach(2000 - SETTLE);
        expect(requests()).toEqual(['/news/digest/trigger']);

        // First poll: the digest is still being written.
        await sinceClick.reach(2000 + SETTLE);
        expect(requests()).toEqual(['/news/digest/trigger', '/news/digest']);
        expect(screen.getByText('Generating Your Digest')).toBeInTheDocument();

        // Next poll, one second later: done.
        server.finish();
        await sinceClick.reach(3000 - SETTLE);
        expect(requests()).toHaveLength(2);
        await sinceClick.reach(3000 + SETTLE);
        expect(requests()).toEqual(['/news/digest/trigger', '/news/digest', '/news/digest']);

        expect(screen.queryByText('Generating Your Digest')).not.toBeInTheDocument();
        expect(screen.getByText('Morning briefing')).toBeInTheDocument();
        expect(screen.getByText('Markets are calm.')).toBeInTheDocument();
        expect(queryClient.getQueryData(newsKeys.digest)).toMatchObject({ id: 'digest-today' });

        // Polling has stopped.
        await sinceClick.reach(15_000);
        expect(requests()).toHaveLength(3);
    });

    it('keeps generating across a re-render and across leaving and re-entering the page', async () => {
        const server = serverWritingADigest();
        const first = render(view());
        await advance(SETTLE);

        clickGenerate();
        await advance(SETTLE);
        expect(screen.getByText('Generating Your Digest')).toBeInTheDocument();

        // A re-render does not reset it…
        first.rerender(view());
        expect(screen.getByText('Generating Your Digest')).toBeInTheDocument();

        // …and neither does unmounting: the generation lives in the cache.
        first.unmount();
        await advance(500);
        render(view());
        expect(screen.getByText('Generating Your Digest')).toBeInTheDocument();

        server.finish();
        await advance(3000);
        expect(screen.queryByText('Generating Your Digest')).not.toBeInTheDocument();
        expect(screen.getByText('Morning briefing')).toBeInTheDocument();
        expect(requestCount('/news/digest/trigger')).toBe(1);
    });

    it('starts only one generation at a time', async () => {
        serverWritingADigest();
        render(view());
        await advance(SETTLE);

        const button = screen.getByRole('button', { name: /Generate Your Digest/ });
        fireEvent.click(button);
        fireEvent.click(button);
        await advance(SETTLE);

        expect(requestCount('/news/digest/trigger')).toBe(1);
    });

    it('stops with the previous state when the trigger fails', async () => {
        serverWritingADigest();
        routes['/news/digest/trigger'] = fail;
        render(view());
        await advance(SETTLE);
        (api.get as Mock).mockClear();

        clickGenerate();
        await advance(SETTLE);

        expect(console.error).toHaveBeenCalledWith('Failed to trigger digest');
        expect(screen.queryByText('Generating Your Digest')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Generate Your Digest/ })).toBeInTheDocument();

        // No polling after a failed trigger.
        await advance(10_000);
        expect(requests()).toEqual(['/news/digest/trigger']);
    });

    it('keeps polling through failed reads and gives up after 60 attempts', async () => {
        serverWritingADigest();
        render(view());
        await advance(SETTLE);
        (api.get as Mock).mockClear();

        clickGenerate();
        const sinceClick = stopwatch();
        await sinceClick.reach(SETTLE);
        routes['/news/digest'] = fail;

        // Polls at 2s, 3s, … 60s.
        await sinceClick.reach(60_000 + SETTLE);
        expect(requestCount('/news/digest')).toBe(59);

        // The 60th and last, at 61s…
        await sinceClick.reach(61_000 + SETTLE);
        expect(requestCount('/news/digest')).toBe(60);
        expect(screen.getByText('Generating Your Digest')).toBeInTheDocument();

        // …and a second later it gives up, back where it started.
        await sinceClick.reach(62_000 + SETTLE);
        expect(screen.queryByText('Generating Your Digest')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Generate Your Digest/ })).toBeInTheDocument();

        await sinceClick.reach(90_000);
        expect(requestCount('/news/digest')).toBe(60);
    });

    it('does nothing when there is nothing to analyze', async () => {
        routes['/news/digest'] = ok(noDigest);
        routes['/portfolio/positions'] = ok([]);
        render(view());
        await advance(SETTLE);

        expect(screen.queryByRole('button', { name: /Generate Your Digest/ })).not.toBeInTheDocument();
        expect(screen.getByText(/Add stocks to your watchlist or portfolio above/)).toBeInTheDocument();
        await advance(5000);
        expect(requestCount('/news/digest/trigger')).toBe(0);
    });

    it('auto-generates once for a digest from a previous day, and never loops', async () => {
        // The server keeps answering with the same digest (rolling 24h window).
        routes['/news/digest'] = ok(yesterdaysDigest());
        routes['/news/digest/trigger'] = ok(yesterdaysDigest());

        const first = render(view());
        await advance(SETTLE);
        expect(requestCount('/news/digest/trigger')).toBe(1);
        expect(screen.getByText('Generating Your Digest')).toBeInTheDocument();

        await advance(2000 + SETTLE);
        expect(screen.queryByText('Generating Your Digest')).not.toBeInTheDocument();
        expect(screen.getByText('Yesterday briefing')).toBeInTheDocument();

        // The same digest came back: it is not asked for again…
        await advanceInSteps(30_000);
        expect(requestCount('/news/digest/trigger')).toBe(1);
        expect(requestCount('/news/digest')).toBe(2); // initial load + one poll

        // …not even on the next visit.
        first.unmount();
        render(view());
        await advanceInSteps(30_000);
        expect(requestCount('/news/digest/trigger')).toBe(1);
        expect(screen.getByText('Yesterday briefing')).toBeInTheDocument();
    });

    it('does not retry an automatic generation whose trigger fails', async () => {
        routes['/news/digest'] = ok(yesterdaysDigest());
        // Fails after a round trip, like a 429 from the rate limiter.
        routes['/news/digest/trigger'] = () =>
            new Promise((_, reject) => setTimeout(() => reject(new Error('Too Many Requests')), 50));

        render(view());
        await advanceInSteps(10_000, 10);

        expect(requestCount('/news/digest/trigger')).toBe(1);
        expect(requestCount('/news/digest')).toBe(1);
        // The digest that was on screen is still there.
        expect(screen.queryByText('Generating Your Digest')).not.toBeInTheDocument();
        expect(screen.getByText('Yesterday briefing')).toBeInTheDocument();
    });

    it('does not auto-generate without a watchlist or portfolio', async () => {
        routes['/news/digest'] = ok(yesterdaysDigest());
        routes['/portfolio/positions'] = ok([]);
        render(view());
        await advance(5000);

        expect(screen.getByText('Yesterday briefing')).toBeInTheDocument();
        expect(requestCount('/news/digest/trigger')).toBe(0);
    });

    it('judges the refreshed digest, not the cached one, before auto-generating', async () => {
        // Yesterday's digest is cached; the server already has today's.
        seedStaleCache({ digest: yesterdaysDigest() });

        render(view());
        expect(screen.getByText('Yesterday briefing')).toBeInTheDocument();

        await advance(5000);
        expect(screen.getByText('Morning briefing')).toBeInTheDocument();
        expect(requestCount('/news/digest/trigger')).toBe(0);
        expect(requestCount('/news/digest')).toBe(1);
    });
});
