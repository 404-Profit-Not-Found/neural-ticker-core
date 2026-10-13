import { useMemo } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Database, ExternalLink, FileText, Printer, Quote } from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/utils';
import { directionClass, directionOf, formatChangePercent, formatCount, formatPrice, shortExchange } from '../lib/format';
import { formatDateTime, formatRelative, isoDateTime } from '../lib/datetime';
import { Button, buttonVariants } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Panel, PanelHeader, PanelBody, Led } from '../components/ui/panel';
import { EmptyState } from '../components/ui/empty-state';
import { Skeleton } from '../components/ui/skeleton';
import { ModelBadge } from '../components/ui/model-badge';
import { SharePopover } from '../components/common/SharePopover';
import { Markdown } from '../components/common/Markdown';
import { extractHeadings } from '../components/common/markdown-utils';
import { VerdictBadge } from '../components/ticker/VerdictBadge';
import { detailVerdictProps } from '../lib/ticker-metrics';
import { TickerLogo } from '../components/dashboard/TickerLogo';
import { useTickerDetails } from '../hooks/useTicker';

interface ResearchNote {
    id: string;
    request_id: string;
    created_at: string;
    status: 'completed' | 'pending' | 'failed' | 'processing';
    question?: string;
    title?: string;
    answer_markdown?: string;
    thinking_process?: string;
    grounding_metadata?: {
        webSearchQueries?: string[];
        searchEntryPoint?: unknown;
        groundingChunks?: Array<{ web?: { title?: string; uri?: string };[key: string]: unknown }>;
        groundingSupports?: unknown[];
        [key: string]: unknown;
    };
    tickers: string[];
    models_used?: string[];
    error?: string;
    tokens_in?: number;
    tokens_out?: number;
    numeric_context?: Record<string, unknown>;
    rarity?: string;
}

const TAB = 'max-lg:min-h-11 gap-2';

/** What went wrong, in words a reader can act on. The raw text stays available. */
function describeFailure(error?: string): string {
    const text = (error || '').toLowerCase();
    if (/overload|unavailable|\b503\b|\b529\b/.test(text)) {
        return 'The AI model was temporarily overloaded, so this note was not written. Running it again in a few minutes usually works.';
    }
    if (/rate limit|quota|\b429\b/.test(text)) {
        return 'The AI provider turned the request down because of a usage limit. Try again later.';
    }
    if (/timeout|timed out|deadline/.test(text)) {
        return 'The AI model took too long to answer and the run was stopped. Try again, or pick a faster model.';
    }
    return 'Something went wrong while this note was being written, so there is nothing to show.';
}

function hostname(url?: string): string {
    if (!url) return '';
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return url;
    }
}

export function ResearchPage() {
    // Route: /ticker/:symbol/research/:id
    const { id, symbol } = useParams<{ id: string; symbol: string }>();
    const navigate = useNavigate();
    const location = useLocation();

    const { data: note, isLoading, error } = useQuery<ResearchNote>({
        queryKey: ['research', id],
        queryFn: async () => {
            const res = await api.get(`/research/${id}`);
            return res.data as ResearchNote;
        },
        enabled: !!id,
        refetchInterval: (data: unknown) => {
            const d = data as ResearchNote | undefined;
            if (!d) return 2000;
            return (d.status === 'pending' || d.status === 'processing') ? 2000 : false;
        }
    });

    const primaryTicker = note?.tickers?.[0];
    const { data: tickerData } = useTickerDetails(primaryTicker);

    const content = note?.answer_markdown;
    const headings = useMemo(
        () => (content ? extractHeadings(content).filter((h) => h.depth === 2) : []),
        [content],
    );

    const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate(symbol ? `/ticker/${symbol}/research` : '/research'));

    const backButton = (
        <button
            type="button"
            onClick={goBack}
            className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring print:hidden"
        >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back
        </button>
    );

    if (isLoading) {
        return (
            <div className="min-h-page bg-background font-sans text-foreground">
                <main className="container mx-auto max-w-[80rem] space-y-4 px-4 py-4 sm:py-6" aria-busy="true" aria-label="Loading research note">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-8 w-4/5 max-w-2xl" />
                    <Skeleton className="h-4 w-64" />
                    <Skeleton className="h-[28rem] w-full" />
                </main>
            </div>
        );
    }

    if (error || !note) {
        return (
            <div className="min-h-page bg-background font-sans text-foreground">
                <main className="container mx-auto max-w-[80rem] px-4 py-4 sm:py-6">
                    {backButton}
                    <EmptyState
                        role="alert"
                        icon={<AlertTriangle className="h-5 w-5" />}
                        title="Research note not found"
                        description="It may have been deleted, or the link is incomplete."
                        action={<Button variant="outline" className="h-11 lg:h-9" onClick={goBack}>Go back</Button>}
                    />
                </main>
            </div>
        );
    }

    const profile = tickerData?.profile;
    const marketData = tickerData?.market_data;
    const currency = profile?.currency || 'USD';
    const direction = directionOf(marketData?.change_percent);

    const title = note.title || note.question || 'Analysis request';

    const isProcessing = note.status === 'pending' || note.status === 'processing';
    const isFailed = note.status === 'failed';
    const isComplete = !isProcessing && !isFailed;

    // Extract sources if available (Gemini grounding)
    const sources = (note.grounding_metadata?.groundingChunks ?? [])
        .map((chunk, i) => ({
            index: i + 1,
            title: chunk.web?.title || `Source ${i + 1}`,
            url: chunk.web?.uri,
        }))
        .filter((s): s is { index: number; title: string; url: string } => !!s.url);

    const tokens = (note.tokens_in ?? 0) + (note.tokens_out ?? 0);
    const model = note.models_used?.[0];
    const exchange = shortExchange(profile?.exchange);

    let verdict: React.ReactNode = null;
    if (isComplete && note.rarity && tickerData?.risk_analysis) {
        const { market_data, risk_analysis, fundamentals } = tickerData;
        // Same derivation as every list, so the badge here matches the row.
        verdict = (
            <VerdictBadge
                {...detailVerdictProps({ price: market_data.price, risk_analysis, fundamentals, news: tickerData.news })}
            />
        );
    }

    return (
        <div className="min-h-page bg-background font-sans text-foreground selection:bg-primary/20">
            <main className="container mx-auto max-w-[80rem] px-4 py-2 sm:py-5">
                {/* Back on the left; a finished note's actions on the right. */}
                <div className="flex items-center justify-between gap-3">
                    {backButton}
                    {isComplete && (
                        <div className="flex shrink-0 items-center gap-2 print:hidden">
                            <Button variant="outline" size="sm" className="h-11 min-w-11 gap-2 px-3 lg:h-9" onClick={() => window.print()} aria-label="Print this note">
                                <Printer size={16} className="text-muted-foreground" aria-hidden />
                                <span className="hidden sm:inline">Print</span>
                            </Button>
                            <SharePopover researchId={note.id} title={note.title || 'Research Report'} />
                        </div>
                    )}
                </div>

                {/* --- Header: the note's title is the page title --- */}
                <header>
                    <div className="min-w-0">
                        {primaryTicker && (
                            <Link
                                to={`/ticker/${encodeURIComponent(primaryTicker)}`}
                                className="-ml-1 inline-flex min-h-11 max-w-full items-center gap-2 rounded-md px-1 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-9"
                            >
                                <TickerLogo url={profile?.logo_url} symbol={primaryTicker} className="h-6 w-6" />
                                <span className="font-semibold text-foreground">{primaryTicker}</span>
                                {exchange && <span className="label-micro hidden sm:inline" title={profile?.exchange}>{exchange}</span>}
                                {marketData && (
                                    <>
                                        <span className="num font-medium text-foreground">{formatPrice(marketData.price, currency)}</span>
                                        <span className={cn('num font-medium', directionClass(direction))}>
                                            {formatChangePercent(marketData.change_percent)}
                                        </span>
                                    </>
                                )}
                            </Link>
                        )}
                        <h1 className="break-words text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-[1.75rem] lg:mt-1">
                            {title}
                        </h1>
                        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
                            {isProcessing && (
                                <Badge variant="outline" className="bg-signal/15 text-signal">
                                    <Led pulse /> {note.status === 'pending' ? 'Queued' : 'Running'}
                                </Badge>
                            )}
                            {isFailed && <Badge variant="sell">Failed</Badge>}
                            {verdict}
                            <time dateTime={isoDateTime(note.created_at)} title={formatDateTime(note.created_at)} className="num whitespace-nowrap">
                                {formatRelative(note.created_at)}
                            </time>
                            {isComplete && model && <ModelBadge model={model} rarity={note.rarity} />}
                            {isComplete && tokens > 0 && <span className="num whitespace-nowrap">{formatCount(tokens)} tokens</span>}
                            <span className="num hidden whitespace-nowrap sm:inline">Note #{note.id}</span>
                        </div>
                    </div>

                </header>

                <div className="mt-4 sm:mt-5">
                    {isFailed && (
                        <Panel>
                            <EmptyState
                                role="alert"
                                icon={<AlertTriangle className="h-5 w-5" />}
                                title="This research run failed"
                                description={describeFailure(note.error)}
                                action={
                                    primaryTicker ? (
                                        <Link
                                            to={`/ticker/${encodeURIComponent(primaryTicker)}/research`}
                                            className={cn(buttonVariants({ variant: 'default' }), 'h-11 lg:h-9')}
                                        >
                                            Run it again from {primaryTicker} research
                                        </Link>
                                    ) : undefined
                                }
                            />
                            {note.error && (
                                <details className="mx-3.5 mb-3.5 rounded-md bg-muted px-3 text-xs text-muted-foreground">
                                    <summary className="flex min-h-11 cursor-pointer select-none items-center font-medium text-foreground/90 lg:min-h-8">Technical details</summary>
                                    <p className="pb-2 break-words font-mono leading-relaxed">{note.error}</p>
                                </details>
                            )}
                        </Panel>
                    )}

                    {isProcessing && (
                        <Panel>
                            <div role="status" aria-live="polite" className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                                <Led tone="ai" pulse className="mb-2 h-2.5 w-2.5" />
                                <p className="text-sm font-semibold text-foreground">Research in progress</p>
                                <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                                    The model is reading market data, news and financials. Most notes are ready in under a minute;
                                    this page updates on its own.
                                </p>
                            </div>
                        </Panel>
                    )}

                    {isComplete && (
                        <Tabs defaultValue="report" className="w-full">
                            <TabsList className="mb-3 print:hidden">
                                <TabsTrigger value="report" className={TAB}>
                                    <FileText size={15} aria-hidden /> Report
                                </TabsTrigger>
                                {sources.length > 0 && (
                                    <TabsTrigger value="sources" className={TAB}>
                                        <Quote size={15} aria-hidden /> Sources <span className="num text-muted-foreground">{sources.length}</span>
                                    </TabsTrigger>
                                )}
                                <TabsTrigger value="raw" className={TAB}>
                                    <Database size={15} aria-hidden /> Raw data
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="report" className="mt-0">
                                <Panel as="article" aria-label={title}>
                                    {content ? (
                                        // Text and contents are centred as one group, so the
                                        // panel never has a dead band between them.
                                        <div className="mx-auto flex w-full max-w-[66rem] gap-12 px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
                                            <Markdown breaks stripTitle={title} className="min-w-0 flex-1">
                                                {content}
                                            </Markdown>
                                            {headings.length >= 3 && (
                                                <nav aria-label="On this page" className="hidden w-56 shrink-0 lg:block print:hidden">
                                                    <div className="sticky top-28">
                                                        <p className="label-micro mb-2">On this page</p>
                                                        <ul className="space-y-0.5">
                                                            {headings.map((heading) => (
                                                                <li key={heading.id}>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => document.getElementById(heading.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                                                                        className="w-full rounded-md px-2 py-1.5 text-left text-[13px] leading-snug text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                                    >
                                                                        {heading.text}
                                                                    </button>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                </nav>
                                            )}
                                        </div>
                                    ) : (
                                        <EmptyState
                                            icon={<FileText className="h-5 w-5" />}
                                            title="This note has no text"
                                            description="The run finished without producing a report."
                                        />
                                    )}
                                </Panel>
                            </TabsContent>

                            {sources.length > 0 && (
                                <TabsContent value="sources" className="mt-0">
                                    <Panel aria-label="Sources">
                                        <ul className="p-1.5">
                                            {sources.map((source) => (
                                                <li key={source.index}>
                                                    <a
                                                        href={source.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="group flex min-h-14 items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                                                    >
                                                        <span className="num flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground group-hover:bg-background">
                                                            {source.index}
                                                        </span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="line-clamp-2 text-sm font-medium text-foreground">{source.title}</span>
                                                            <span className="block truncate text-xs text-muted-foreground">{hostname(source.url)}</span>
                                                        </span>
                                                        <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                                                        <span className="sr-only">(opens in a new tab)</span>
                                                    </a>
                                                </li>
                                            ))}
                                        </ul>
                                    </Panel>
                                </TabsContent>
                            )}

                            <TabsContent value="raw" className="mt-0 space-y-3 sm:space-y-4">
                                <Panel aria-label="Raw markdown">
                                    <PanelHeader title="Raw markdown" led={null} />
                                    <PanelBody>
                                        <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 font-mono text-xs leading-relaxed text-foreground/90" tabIndex={0}>
                                            {note.answer_markdown || 'No markdown content.'}
                                        </pre>
                                    </PanelBody>
                                </Panel>

                                <Panel aria-label="Metadata">
                                    <PanelHeader title="Metadata" led={null} />
                                    <PanelBody>
                                        <pre className="max-h-[22rem] overflow-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed text-foreground/90" tabIndex={0}>
                                            {JSON.stringify({
                                                id: note.id,
                                                request_id: note.request_id,
                                                models_used: note.models_used,
                                                tokens_in: note.tokens_in,
                                                tokens_out: note.tokens_out,
                                                created_at: note.created_at,
                                                grounding_metadata: note.grounding_metadata,
                                                numeric_context: note.numeric_context
                                            }, null, 2)}
                                        </pre>
                                    </PanelBody>
                                </Panel>
                            </TabsContent>
                        </Tabs>
                    )}
                </div>
            </main>
        </div>
    );
}
