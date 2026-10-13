import { useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp } from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/utils';
import { directionOf, formatAbsPercent, formatPrice } from '../lib/format';
import { formatDate, isoDateTime } from '../lib/datetime';
import { MinimalHeader } from '../components/layout/MinimalHeader';
import { buttonVariants } from '../components/ui/button';
import { EmptyState } from '../components/ui/empty-state';
import { Panel } from '../components/ui/panel';
import { Skeleton } from '../components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Markdown } from '../components/common/Markdown';
import { TINT_DOWN, TINT_UP } from '../components/common/styles';
import { TickerLogo } from '../components/dashboard/TickerLogo';
import { PriceChart } from '../components/ticker/PriceChart';
// The public report renders the same components as the app (read-only
// variant) — there are no parallel "public" copies to keep in sync.
import { TickerOverview } from '../components/ticker/TickerOverview';
import { VerdictBadge } from '../components/ticker/VerdictBadge';
import { detailVerdictProps } from '../lib/ticker-metrics';
import type { ResearchItem, TickerData, NewsItem, AnalystRating, CandlePoint } from '../types/ticker';

interface PublicReportData {
    note: ResearchItem;
    /** Absent for a note with no ticker; a `{ symbol, name }` stub when the ticker is not tracked. */
    profile: TickerData['profile'];
    risk_analysis: TickerData['risk_analysis'];
    /** Null when the note's ticker is not tracked. */
    market_context: (Omit<TickerData['market_data'], 'history'> & {
        price: number;
        change_percent: number;
        history?: { date: string; price: number }[]
    }) | null;
    news: NewsItem | null;
    ratings: AnalystRating[];
    /** The four rating inputs — the same values the in-app composite carries. */
    fundamentals?: {
        pe_ratio?: number;
        consensus_rating?: string;
        fifty_two_week_high?: number;
        fifty_two_week_low?: number;
        revenue_ttm?: number;
    };
}

const TAB = 'min-h-11 flex-1 sm:flex-none lg:min-h-10';

export function PublicResearchPage() {
    const { signature, researchId } = useParams<{ signature: string; researchId: string }>();

    // Scroll to top on mount
    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    const { data, isLoading, isError } = useQuery<PublicReportData>({
        queryKey: ['public-research', researchId, signature],
        queryFn: async () => {
            const res = await api.get(`/public/report/${researchId}/${signature}`);
            return res.data;
        },
        // Don't retry if 403 (Invalid Signature)
        retry: (failureCount: number, error: unknown) => {
            const axiosError = error as { response?: { status?: number } };
            if (axiosError.response?.status === 403) return false;
            return failureCount < 1; // Faster fail for UX
        },
        staleTime: 1000 * 60 * 5, // Cache for 5 mins
    });

    // The payload carries closes only; the chart draws them as a static series.
    const history = data?.market_context?.history;
    const chartData = useMemo<CandlePoint[]>(
        () => (history ?? []).map((h) => ({ ts: h.date, open: h.price, high: h.price, low: h.price, close: h.price, volume: 0 })),
        [history],
    );

    if (isLoading && !data) {
        return (
            <div className="flex min-h-dvh flex-col bg-background">
                <MinimalHeader />
                <main className="container mx-auto w-full max-w-5xl space-y-4 px-4 py-6" aria-busy="true" aria-label="Loading report">
                    <div className="flex items-center gap-3">
                        <Skeleton className="h-12 w-12 rounded-full" />
                        <div className="space-y-2">
                            <Skeleton className="h-6 w-28" />
                            <Skeleton className="h-4 w-44" />
                        </div>
                    </div>
                    <Skeleton className="h-72 w-full" />
                    <Skeleton className="h-48 w-full" />
                </main>
            </div>
        );
    }

    // Shown once the query has finished without data (invalid or expired link).
    if (isError || !data) {
        return (
            <div className="flex min-h-dvh flex-col bg-background">
                <MinimalHeader />
                <main className="flex flex-1 items-center justify-center p-4">
                    <EmptyState
                        role="alert"
                        icon={<AlertTriangle className="h-5 w-5" />}
                        title="This report link doesn’t work"
                        description="It is invalid, has expired, or was changed. Ask the person who shared it for a new link."
                        action={<Link to="/" className={cn(buttonVariants({ variant: 'default' }), 'h-11')}>Go to NeuralTicker</Link>}
                    />
                </main>
            </div>
        );
    }

    const { note, profile, risk_analysis, market_context, news, ratings, fundamentals } = data;
    const currency = profile?.currency || 'USD';
    const direction = directionOf(market_context?.change_percent);
    const price = market_context?.price || 0;
    // A report can outlive its market data: a note with no ticker carries no
    // profile at all, and one whose ticker is not tracked has no quote. The
    // written analysis is still worth showing — without invented figures.
    const hasTicker = !!profile?.symbol;
    const hasMarket = hasTicker && !!market_context && price > 0;

    return (
        <div className="flex min-h-dvh flex-col bg-background text-foreground">
            <MinimalHeader />

            <main className="container mx-auto w-full max-w-5xl flex-1 px-4 py-4 sm:py-8">
                {/* --- Hero: the same identity block as the app's ticker page --- */}
                <header className="flex flex-col gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                        {hasTicker && (
                            <TickerLogo url={profile.logo_url} symbol={profile.symbol} className="h-11 w-11 sm:h-14 sm:w-14" />
                        )}
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                                <h1 className="text-2xl font-bold leading-none tracking-tight sm:text-3xl">
                                    {hasTicker ? profile.symbol : note.title || 'AI research note'}
                                </h1>
                                {hasMarket && risk_analysis && (
                                    // Same derivation as inside the app, so a shared
                                    // report never shows a different rating.
                                    <VerdictBadge
                                        {...detailVerdictProps({ price, risk_analysis, fundamentals, news })}
                                    />
                                )}
                            </div>
                            {hasTicker && profile.name && profile.name !== profile.symbol && (
                                <p className="mt-1.5 truncate text-sm font-medium text-muted-foreground">{profile.name}</p>
                            )}
                        </div>
                    </div>

                    {hasMarket && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <span className="num text-[clamp(1.75rem,8.4vw,2.125rem)] font-semibold leading-none tracking-tight sm:text-4xl">
                            {formatPrice(market_context?.price, currency)}
                        </span>
                        <span
                            className={cn(
                                'num inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold sm:text-base',
                                direction === 'up' ? TINT_UP : direction === 'down' ? TINT_DOWN : 'bg-muted text-muted-foreground',
                            )}
                        >
                            {direction === 'up' && <ArrowUp size={15} aria-hidden />}
                            {direction === 'down' && <ArrowDown size={15} aria-hidden />}
                            <span className="sr-only">{direction === 'up' ? 'up' : direction === 'down' ? 'down' : 'unchanged'} </span>
                            {formatAbsPercent(market_context?.change_percent ?? 0)}
                        </span>
                    </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                        AI analysis from{' '}
                        <time dateTime={isoDateTime(note.created_at)} className="num font-medium text-foreground/90">
                            {formatDate(note.created_at)}
                        </time>
                        .
                    </p>
                </header>

                {hasTicker && chartData.length > 0 && (
                    <section
                        aria-label={`${profile.symbol} price history`}
                        className="mt-4 flex h-[17rem] min-w-0 flex-col overflow-hidden rounded-md bg-card sm:h-[19rem]"
                    >
                        <PriceChart data={chartData} currency={currency} className="min-h-0 flex-1" />
                    </section>
                )}

                {/* Without market data there is no overview to show: open on the analysis. */}
                <Tabs defaultValue={hasMarket ? 'overview' : 'analysis'} className="mt-5 w-full">
                    {hasMarket && (
                        <TabsList className="mb-3 sm:mb-4">
                            <TabsTrigger value="overview" className={TAB}>Overview</TabsTrigger>
                            <TabsTrigger value="analysis" className={TAB}>Full analysis</TabsTrigger>
                        </TabsList>
                    )}

                    {hasMarket && market_context && (
                        <TabsContent value="overview" className="mt-0">
                            <TickerOverview
                                variant="public"
                                profile={profile}
                                risk_analysis={risk_analysis}
                                market_data={market_context}
                                news={news}
                                ratings={ratings}
                            />
                        </TabsContent>
                    )}

                    <TabsContent value="analysis" className="mt-0">
                        <Panel as="article" aria-label={note.title || 'Investment thesis'}>
                            <div className="px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
                                {note.title && (
                                    <h2 className="mb-4 max-w-[40ch] break-words text-xl font-bold leading-tight tracking-tight sm:text-2xl">
                                        {note.title}
                                    </h2>
                                )}
                                {note.content ? (
                                    <Markdown breaks stripTitle={note.title}>{note.content}</Markdown>
                                ) : (
                                    <p className="text-sm text-muted-foreground">This report has no written analysis.</p>
                                )}
                            </div>
                        </Panel>
                    </TabsContent>
                </Tabs>

                {/* The page a visitor lands on should say what this is and where to go next. */}
                <section className="mt-6 flex flex-col items-start gap-3 rounded-md bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5" aria-label="About NeuralTicker">
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">Research any ticker like this</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            NeuralTicker writes AI research with price scenarios and risk scores for the stocks you follow.
                        </p>
                    </div>
                    <Link to="/" className={cn(buttonVariants({ variant: 'default' }), 'h-11 shrink-0 gap-2 max-sm:w-full')}>
                        Open NeuralTicker <ArrowRight size={16} aria-hidden />
                    </Link>
                </section>

                <footer className="pb-6 pt-6 text-center text-xs leading-relaxed text-muted-foreground">
                    <p>Generated by NeuralTicker AI. Not financial advice — verify every figure before acting on it.</p>
                </footer>
            </main>
        </div>
    );
}
