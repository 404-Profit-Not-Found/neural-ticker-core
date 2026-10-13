import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Brain, ChevronDown, Loader2, Newspaper } from 'lucide-react';
import { Panel, PanelHeader } from '../ui/panel';
import { SegmentedControl } from '../ui/segmented';
import { EmptyState, LoadError } from '../ui/empty-state';
import { Skeleton } from '../ui/skeleton';
import { ModelBadge } from '../ui/model-badge';
import { Markdown } from '../common/Markdown';
import { AiButton } from '../ticker/AiButton';
import { cn } from '../../lib/utils';
import { formatDateTime, formatRelative, isoDateTime } from '../../lib/datetime';
import { preloadRoute } from '../../app/routes';
import { MiniTickerTile } from './MiniTickerTile';
import { useWatchlists } from '../../hooks/useWatchlist';
import {
    useGeneralNews,
    useGenerateDigest,
    useNewsDigest,
    type GeneralNewsItem,
} from '../../hooks/useNews';
import {
    NATIVE_CURRENCY,
    usePortfolioPositions,
    type PortfolioPositionSummary,
} from '../../hooks/usePortfolio';

const EMPTY_NEWS: GeneralNewsItem[] = [];

// The cache keeps the latest 20; the panel shows the first few and links on.
const latestTwenty = (news: GeneralNewsItem[]) =>
    Array.isArray(news) ? news.slice(0, 20) : EMPTY_NEWS;
const HEADLINES_SHOWN = 6;

// A digest longer than this is folded behind "Read the full digest".
const FOLD_AT_CHARS = 1400;

const countPositions = (positions: PortfolioPositionSummary[]) =>
    Array.isArray(positions) ? positions.length : 0;

/** Model output sometimes carries a JSON block or legacy markers; drop them. */
const cleanDigest = (raw?: string): string =>
    (raw || 'No content available.')
        .replace(/```json[\s\S]*?```/g, '')
        .replace(/\[JSON Section\].*$/is, '')
        .trim();

export function NewsFeed({ tickerCount }: { tickerCount?: number }) {
    // Which panel a phone shows; both are visible from `lg` up.
    const [mobilePanel, setMobilePanel] = useState<'digest' | 'news'>('digest');
    // Everything here is read through the query cache. The loading states below
    // are for the very first load only (`isPending`): once a result is cached it
    // renders immediately and refreshes in the background, and a failed refresh
    // leaves the previous result on screen.
    const digestQuery = useNewsDigest();
    const digest = digestQuery.data ?? null;
    const loadingDigest = digestQuery.isPending;
    const isRefreshingDigest = digestQuery.isFetching;
    const newsQuery = useGeneralNews(latestTwenty);
    const news = newsQuery.data ?? EMPTY_NEWS;
    const loadingNews = newsQuery.isPending;
    // A failed FIRST load is an error, not "nothing here". (A failed refresh
    // keeps the previous result on screen and is reported by the status bar.)
    const digestFailed = digestQuery.isError && !digest;
    const newsFailed = newsQuery.isError && news.length === 0;
    const [expanded, setExpanded] = useState(false);
    const { generate, isGenerating, wasRegenerated } = useGenerateDigest();

    // Check if user has watchlist items
    const { data: watchlists = [] } = useWatchlists();
    const watchlistItemCount = watchlists.reduce((acc, wl) => acc + (wl.items?.length || 0), 0);
    // Portfolio count is optional display: 0 until its first load, or if that fails.
    const { data: portfolioCount = 0 } = usePortfolioPositions(NATIVE_CURRENCY, countPositions);
    const hasItems = watchlistItemCount > 0 || portfolioCount > 0;

    // Auto-trigger digest ONLY for returning users (who have a previous digest)
    // If digest is null, it's a new user -> Wait for manual button click.
    // If digest exists but is old -> Auto-generate today's.
    useEffect(() => {
        // Judge the server's digest, not a cached copy that is being refreshed.
        if (!digest || isRefreshingDigest || isGenerating || !hasItems) return;

        const digestDate = new Date(digest.created_at).setHours(0, 0, 0, 0);
        const today = new Date().setHours(0, 0, 0, 0);

        // Once per stale digest: the server may answer with the very same one
        // (it dedups on a rolling 24h window, not on the calendar day).
        if (digestDate < today && !wasRegenerated(digest.id)) {
            generate({ replaces: digest.id });
        }
    }, [digest, isRefreshingDigest, isGenerating, hasItems, generate, wasRegenerated]);

    const triggerDigest = () => {
        if (!hasItems) return;
        generate();
    };

    const body = digest ? cleanDigest(digest.answer_markdown) : '';
    const foldable = body.length > FOLD_AT_CHARS;
    const tokens = digest ? (digest.tokens_out ?? 0) + (digest.tokens_in ?? 0) : 0;

    return (
        <div className="space-y-3">
            {/* Phones show one panel at a time; from `lg` both sit side by side. */}
            <SegmentedControl
                className="lg:hidden"
                fill
                size="sm"
                label="Dashboard feed"
                value={mobilePanel}
                onChange={setMobilePanel}
                options={[
                    { value: 'digest', label: 'AI Digest' },
                    { value: 'news', label: 'Market News' },
                ]}
            />
            {/* The page scrolls; the panels do not scroll inside it. */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-5 lg:items-start">
                {/* AI DIGEST (left, 3/5) */}
                <Panel className={cn('rounded-lg lg:col-span-3 lg:flex lg:rounded-md', mobilePanel !== 'digest' && 'hidden')}>
                    <PanelHeader
                        className="hidden lg:flex"
                        title="AI Market Digest"
                        led="ai"
                        pulse={isGenerating}
                        actions={digest?.models_used?.length ? (
                            <>
                                {digest.models_used.map((model) => (
                                    <ModelBadge key={model} model={model} />
                                ))}
                                {tokens > 0 && (
                                    <span className="num hidden text-[11px] text-muted-foreground sm:inline">
                                        {tokens.toLocaleString('en-US')} tokens
                                    </span>
                                )}
                            </>
                        ) : undefined}
                    />
                    <div className="p-4 lg:pt-1">
                        {isGenerating ? (
                            <div role="status" className="space-y-5">
                                <div className="flex items-center gap-3">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-ai/10 text-ai">
                                        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-foreground">Generating Your Digest</p>
                                        <p className="text-xs text-muted-foreground">
                                            Reading your watchlist and the market news. This usually takes 20–40 seconds.
                                        </p>
                                    </div>
                                </div>
                                <DigestSkeleton />
                            </div>
                        ) : loadingDigest ? (
                            <div role="status" aria-label="Loading digest">
                                <DigestSkeleton />
                            </div>
                        ) : digestFailed ? (
                            <LoadError what="the digest" onRetry={() => digestQuery.refetch()} />
                        ) : digest ? (
                            <div>
                                {digest.relatedTickers && digest.relatedTickers.length > 0 && (
                                    <div className="mb-5">
                                        {/* Phones: one swipeable line of tickers — no boxes inside the box. */}
                                        <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden">
                                            {digest.relatedTickers.map((t) => {
                                                const pct = Number(t.latestPrice?.changePercent || 0);
                                                const flat = Math.abs(pct) < 0.005;
                                                const to = `/ticker/${encodeURIComponent(t.symbol)}`;
                                                return (
                                                    <li key={t.id} className="shrink-0">
                                                        <Link
                                                            to={to}
                                                            onTouchStart={() => preloadRoute(to)}
                                                            className="flex min-h-11 items-center gap-2 rounded-md bg-muted px-3 text-[13px] transition-colors active:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                        >
                                                            <span className="font-semibold text-foreground">{t.symbol}</span>
                                                            <span className={cn('num font-medium', flat ? 'text-muted-foreground' : pct > 0 ? 'text-up' : 'text-down')}>
                                                                {flat ? '' : pct > 0 ? '+' : '−'}{Math.abs(pct).toFixed(2)}%
                                                            </span>
                                                        </Link>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                        <div className="hidden gap-2.5 lg:grid lg:grid-cols-3 xl:grid-cols-4">
                                            {digest.relatedTickers.map((t: { id: string; symbol: string; name: string; currency?: string; latestPrice?: { close: number; changePercent?: number; change?: number }; riskAnalysis?: { overall_score: number; financial_risk?: number } }) => (
                                                <MiniTickerTile
                                                    key={t.id}
                                                    symbol={t.symbol}
                                                    company={t.name}
                                                    price={Number(t.latestPrice?.close || 0)}
                                                    change={Number(t.latestPrice?.changePercent || 0)}
                                                    changeAmount={Number(t.latestPrice?.change || 0)}
                                                    riskScore={t.riskAnalysis?.financial_risk ?? t.riskAnalysis?.overall_score ?? 0}
                                                    href={`/ticker/${t.symbol}`}
                                                    currency={t.currency || 'USD'}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <h3 className="text-lg font-semibold leading-tight tracking-tight text-foreground">
                                    {digest.title}
                                </h3>
                                <div
                                    id="digest-body"
                                    className={cn(
                                        'mt-3',
                                        foldable && !expanded && 'max-h-[26rem] overflow-hidden [mask-image:linear-gradient(to_bottom,black_calc(100%-5rem),transparent)]',
                                    )}
                                >
                                    <Markdown size="sm" measure={false} highlightSentiment>{body}</Markdown>
                                </div>

                                <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                                    {foldable ? (
                                        <button
                                            type="button"
                                            aria-expanded={expanded}
                                            aria-controls="digest-body"
                                            onClick={() => setExpanded((v) => !v)}
                                            className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-medium text-primary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-9"
                                        >
                                            {expanded ? 'Show less' : 'Read the full digest'}
                                            <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} aria-hidden />
                                        </button>
                                    ) : <span />}
                                    <time
                                        dateTime={isoDateTime(digest.created_at)}
                                        className="label-micro"
                                    >
                                        {formatDateTime(digest.created_at)}
                                    </time>
                                </div>
                            </div>
                        ) : (
                            // No digest yet: what it is, and the three things that feed it.
                            <div className="mx-auto max-w-md space-y-6 py-4">
                                <div className="space-y-3 text-center">
                                    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-ai/10 text-ai">
                                        <Brain className="h-6 w-6" aria-hidden />
                                    </span>
                                    <h3 className="text-lg font-semibold">Your AI Digest is Waiting</h3>
                                    <p className="text-sm text-muted-foreground">
                                        A daily briefing written from your watchlist and portfolio. Three steps get it going:
                                    </p>
                                </div>

                                <ol className="space-y-2">
                                    {[
                                        {
                                            to: '/analyzer',
                                            title: 'Browse tickers',
                                            text: typeof tickerCount === 'number' && tickerCount > 0
                                                ? `${tickerCount} analysed tickers are waiting on the Tickers page.`
                                                : 'Every analysed ticker is on the Tickers page.',
                                        },
                                        { to: '/watchlist', title: 'Add to your watchlist', text: 'Tap the star on any ticker to follow it.' },
                                        { to: '/portfolio', title: 'Build your portfolio', text: 'Add positions to track value, gains and losses.' },
                                    ].map((step, i) => (
                                        <li key={step.to}>
                                            <Link
                                                to={step.to}
                                                onMouseEnter={() => preloadRoute(step.to)}
                                                className="group flex items-start gap-3.5 rounded-md bg-muted p-3.5 transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            >
                                                <span className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] bg-background text-sm font-semibold text-foreground">
                                                    {i + 1}
                                                </span>
                                                <span className="min-w-0">
                                                    <span className="block text-sm font-medium text-foreground">{step.title}</span>
                                                    <span className="mt-0.5 block text-xs text-muted-foreground">{step.text}</span>
                                                </span>
                                            </Link>
                                        </li>
                                    ))}
                                </ol>

                                <div className="text-center">
                                    {portfolioCount > 0 ? (
                                        <div className="space-y-2.5">
                                            <AiButton onClick={triggerDigest}>Generate Your Digest</AiButton>
                                            <p className="text-xs text-muted-foreground">
                                                Analyzing {watchlistItemCount + portfolioCount} tracked items
                                                {watchlistItemCount > 0 && portfolioCount > 0 && (
                                                    <span> ({watchlistItemCount} watchlist + {portfolioCount} portfolio)</span>
                                                )}
                                            </p>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-muted-foreground">
                                            Add stocks to your watchlist or portfolio above, then come back to generate your personalized AI digest.
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </Panel>

                {/* GENERAL NEWS FEED (right, 2/5) */}
                <Panel className={cn('rounded-lg lg:col-span-2 lg:flex lg:rounded-md', mobilePanel !== 'news' && 'hidden')}>
                    <PanelHeader
                        className="hidden lg:flex"
                        title="Live Market News"
                        led="info"
                        actions={
                            <Link to="/news" onMouseEnter={() => preloadRoute('/news')} className="label-micro inline-flex min-h-9 items-center transition-colors hover:text-foreground">
                                All news
                            </Link>
                        }
                    />
                    {loadingNews ? (
                        <div role="status" aria-label="Loading news" className="space-y-1 p-1.5 lg:pt-0">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="flex gap-4 p-3">
                                    <Skeleton className="h-16 w-20 shrink-0 sm:h-20 sm:w-28" />
                                    <div className="flex-1 space-y-2 py-1">
                                        <Skeleton className="h-3 w-32" />
                                        <Skeleton className="h-4 w-full" />
                                        <Skeleton className="h-3 w-4/5" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : newsFailed ? (
                        <LoadError what="the news" onRetry={() => newsQuery.refetch()} />
                    ) : news.length > 0 ? (
                        <>
                            <ul className="space-y-1 p-1.5 lg:pt-0">
                                {news.slice(0, HEADLINES_SHOWN).map((item) => (
                                    <li key={item.id} className="group flex gap-4 rounded-md p-3 transition-colors hover:bg-muted/60">
                                        {item.image && (
                                            <div className="h-16 w-20 shrink-0 overflow-hidden rounded-md bg-muted sm:h-20 sm:w-28">
                                                <img
                                                    src={item.image}
                                                    alt=""
                                                    loading="lazy"
                                                    decoding="async"
                                                    className="h-full w-full object-cover"
                                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                />
                                            </div>
                                        )}
                                        <div className="min-w-0 flex-1 space-y-1.5">
                                            <div className="flex items-center gap-2">
                                                <span className="label-micro truncate !text-foreground/80">{item.source}</span>
                                                <time
                                                    dateTime={isoDateTime(item.datetime)}
                                                    title={formatDateTime(item.datetime)}
                                                    className="num shrink-0 text-[11px] text-muted-foreground"
                                                >
                                                    {formatRelative(item.datetime)}
                                                </time>
                                            </div>
                                            <a
                                                href={item.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="line-clamp-2 text-sm font-semibold leading-snug text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:underline sm:text-[15px]"
                                            >
                                                {item.headline}
                                            </a>
                                            <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                                                {item.summary}
                                            </p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                            <div className="px-4 pb-3 pt-1">
                                <Link
                                    to="/news"
                                    onMouseEnter={() => preloadRoute('/news')}
                                    onTouchStart={() => preloadRoute('/news')}
                                    className="inline-flex min-h-11 items-center text-sm font-medium text-primary transition-colors hover:underline focus-visible:outline-none focus-visible:underline lg:min-h-9"
                                >
                                    All market news
                                </Link>
                            </div>
                        </>
                    ) : (
                        <EmptyState icon={<Newspaper className="h-5 w-5" />} title="No recent news found." />
                    )}
                </Panel>
            </div>
        </div>
    );
}

/** The digest's shape while it loads: a title line and a paragraph. */
function DigestSkeleton() {
    return (
        <div className="space-y-3">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-11/12" />
            <Skeleton className="h-3.5 w-4/5" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-2/3" />
        </div>
    );
}
