import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, BellPlus, Eye, RefreshCw, Share2, Star } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '../components/ui/button';
import { SuperLoading } from '../components/ui/SuperLoading';
import { EmptyState } from '../components/ui/empty-state';
import { Led } from '../components/ui/panel';
import {
    Dialog,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { useConfirm } from '../components/ui/confirm';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { api } from '../lib/api';
import { cn } from '../lib/utils';
import { directionOf, formatAbsPercent, formatCount, formatPrice } from '../lib/format';
import { detailVerdictProps } from '../lib/ticker-metrics';
import { RiskLight } from '../components/ticker/RiskLight';
import { VerdictBadge } from '../components/ticker/VerdictBadge';
import { ResearchFeed } from '../components/ticker/ResearchFeed';
import { TickerOverview } from '../components/ticker/TickerOverview';
import { TickerFinancials } from '../components/ticker/TickerFinancials';
import { TickerDiscussion } from '../components/ticker/TickerDiscussion';
import { PriceChart } from '../components/ticker/PriceChart';
import { TickerLogo } from '../components/dashboard/TickerLogo';
import { FiftyTwoWeekRange } from '../components/dashboard/FiftyTwoWeekRange';
import { StocktwitsAnalysis } from '../components/stocktwits/StocktwitsAnalysis';
import { SharePopover } from '../components/common/SharePopover';
import { TINT_DOWN, TINT_UP } from '../components/common/styles';
import { CreateAlertDialog } from '../components/price-alerts/CreateAlertDialog';
import {
    tickerKeys,
    useTickerDetails,
    useTickerNews,
    useTickerSocial,
    useTickerResearch,
    useTriggerResearch,
    usePostComment,
    useDeleteResearch,
    useToggleCommentLike,
    useMyCommentLikes,
    useDeleteComment,
} from '../hooks/useTicker';
import { useFavorite } from '../hooks/useWatchlist';
import { useTickerMarketStatus, getSessionLabel } from '../hooks/useMarketStatus';
import { useAuth } from '../context/AuthContext';
import type { TickerData, NewsItem, ResearchItem } from '../types/ticker';

// One hero for every width. On phones and tablets it stacks as identity →
// price → actions → chart → key levels, so the chart starts within the first
// screen; from `lg` the price and key levels sit in a column beside the chart
// and the actions move up to the identity row.
const HERO_GRID = cn(
    "grid grid-cols-1 gap-y-3 [grid-template-areas:'id'_'price'_'actions'_'chart'_'facts']",
    "lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_auto] lg:grid-rows-[auto_auto_1fr] lg:gap-x-8 lg:gap-y-5",
    "lg:[grid-template-areas:'id_id_actions'_'price_chart_chart'_'facts_chart_chart']",
);

// One of the four ticker actions: a 44px tonal button on touch layouts, a
// compact one beside the title from `lg`.
const ACTION = cn(
    'inline-flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-md bg-muted px-2 text-xs font-medium text-foreground transition-colors duration-150',
    'hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:opacity-50 sm:text-[13px] lg:h-9 lg:px-3',
);

// Phone tabs share the strip equally (44px tall) instead of scrolling a
// half-cut fourth tab out of view.
const TAB = 'max-lg:min-h-11 max-sm:flex-1 max-sm:px-1.5 max-sm:text-[13px]';

/** Market session of this ticker's exchange, as text with a status light. */
function TickerMarketStatus({ symbol }: { symbol?: string }) {
    const { data: status, isLoading } = useTickerMarketStatus(symbol || '');
    if (isLoading || !status) return null;
    const open = status.session === 'regular';
    return (
        <p className="label-micro flex items-center gap-2">
            <Led tone={open ? 'up' : 'off'} />
            <span className={open ? 'text-up' : undefined}>{getSessionLabel(status.session)}</span>
        </p>
    );
}

const RESEARCH_PENDING_GRACE_MS = 45000;
export function TickerDetail() {
    const { symbol } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const confirm = useConfirm();





    const [localResearchRunning, setLocalResearchRunning] = useState(false);

    const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [placeholderId, setPlaceholderId] = useState<string | null>(null);
    const [placeholderTimestamp, setPlaceholderTimestamp] = useState<string | null>(null);

    // Secret Logo Upload State
    const [isLogoUploadOpen, setIsLogoUploadOpen] = useState(false);
    const [logoUploadUrl, setLogoUploadUrl] = useState('');

    const isAdmin = user?.role?.toLowerCase() === 'admin';

    const handleLogoDoubleClick = () => {
        // Admin-only affordance; the backend enforces the permission.
        if (!isAdmin) return;
        setLogoUploadUrl((tickerData as TickerData | undefined)?.profile?.logo_url || '');
        setIsLogoUploadOpen(true);
    };

    const handleLogoUpdate = async () => {
        if (!symbol || !logoUploadUrl) return;
        try {
            await api.patch(`/tickers/${symbol}`, { logo_url: logoUploadUrl });
            // Invalidate query to refetch ticker details and update logo
            queryClient.invalidateQueries({ queryKey: tickerKeys.details(symbol) });
            setIsLogoUploadOpen(false);
            toast.success('Logo updated');
        } catch (err) {
            console.error('Failed to update logo', err);
            toast.error('Failed to update logo (Admin only)');
        }
    };
    const expectedTopResearchIdRef = useRef<string | undefined>(undefined);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isAlertDialogOpen, setIsAlertDialogOpen] = useState(false);
    const queryClient = useQueryClient();

    // Validate tab or default to overview
    const validTabs = ['overview', 'financials', 'research', 'social'] as const;
    // Extract tab from pathname: /ticker/NVDA/research -> research
    // Handle potential trailing slashes and case sensitivity
    const pathSegments = location.pathname.replace(/\/+$/, '').toLowerCase().split('/').filter(Boolean);
    // Expected format: ['ticker', 'symbol', 'tab?']
    const potentialTab = pathSegments.length >= 3 ? pathSegments[pathSegments.length - 1] : null;
    const currentTab = potentialTab && validTabs.includes(potentialTab as typeof validTabs[number])
        ? potentialTab
        : 'overview';

    // -- Hooks --
    const { data: tickerData, isLoading: isLoadingDetails } = useTickerDetails(symbol);
    const { data: marketStatus } = useTickerMarketStatus(symbol || '');



    // Trigger background sync for 5-year history


    const { data: news = [] } = useTickerNews(symbol) as { data: NewsItem[] };
    const { data: socialData } = useTickerSocial(symbol);
    const socialComments = socialData?.comments || [];
    const mentionedUsers = socialData?.mentionedUsers || {};
    const { data: researchList = [] } = useTickerResearch(symbol) as { data: ResearchItem[] };

    // Unified Favorite Hook
    const { isFavorite, toggle, isLoading: isFavLoading } = useFavorite(symbol);

    // -- Social hooks --
    const { data: likedCommentIds = [] } = useMyCommentLikes(symbol);
    const toggleLikeMutation = useToggleCommentLike();

    // -- Mutations --
    const triggerResearchMutation = useTriggerResearch();
    const postCommentMutation = usePostComment();
    const deleteResearchMutation = useDeleteResearch();
    const deleteCommentMutation = useDeleteComment();

    const handleTriggerResearch = (opts?: { provider?: 'gemini' | 'openai' | 'ensemble'; quality?: 'low' | 'medium' | 'high' | 'deep'; question?: string; modelKey?: string }) => {
        if (!symbol) return;
        setLocalResearchRunning(true);
        const newPlaceholderId = `pending-${Date.now()}`;
        const placeholderTime = new Date().toISOString();
        setPlaceholderId(newPlaceholderId);
        setPlaceholderTimestamp(placeholderTime);
        expectedTopResearchIdRef.current = researchList[0]?.id;
        triggerResearchMutation.mutate({
            symbol,
            provider: opts?.provider,
            quality: opts?.quality,
            question: opts?.question,
        });
    };

    const handleDeleteResearch = async (id: string) => {
        const confirmed = await confirm({
            title: 'Delete this research note?',
            description: 'The note and any risk analysis generated from it will be deleted. This can’t be undone.',
            confirmLabel: 'Delete note',
            destructive: true,
        });
        if (!confirmed) return;
        deleteResearchMutation.mutate(id);
    };

    const hasRemotePending = researchList.some(item => item.status === 'processing' || item.status === 'pending');
    useEffect(() => {
        return () => {
            if (graceTimerRef.current) {
                clearTimeout(graceTimerRef.current);
                graceTimerRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (hasRemotePending && placeholderId) {
            setPlaceholderId(null);
            setPlaceholderTimestamp(null);
        }
    }, [hasRemotePending, placeholderId]);

    const latestResearchId = researchList[0]?.id;
    useEffect(() => {
        if (triggerResearchMutation.isPending || hasRemotePending) {
            if (graceTimerRef.current) {
                clearTimeout(graceTimerRef.current);
                graceTimerRef.current = null;
            }
            setLocalResearchRunning(true);
            return;
        }

        if (!localResearchRunning || graceTimerRef.current) {
            return;
        }

        graceTimerRef.current = setTimeout(() => {
            graceTimerRef.current = null;
            setLocalResearchRunning(false);
        }, RESEARCH_PENDING_GRACE_MS);
    }, [triggerResearchMutation.isPending, hasRemotePending, localResearchRunning]);

    const isAnalyzing = triggerResearchMutation.isPending || hasRemotePending || localResearchRunning;

    useEffect(() => {
        if (
            !localResearchRunning ||
            !placeholderId ||
            triggerResearchMutation.isPending ||
            hasRemotePending
        ) {
            return;
        }

        if (latestResearchId && latestResearchId !== expectedTopResearchIdRef.current) {
            setLocalResearchRunning(false);
            setPlaceholderId(null);
            setPlaceholderTimestamp(null);
            expectedTopResearchIdRef.current = undefined;
        }
    }, [latestResearchId, placeholderId, localResearchRunning, triggerResearchMutation.isPending, hasRemotePending]);

    const shouldShowPlaceholder = localResearchRunning && !hasRemotePending && placeholderId && placeholderTimestamp;
    const placeholderEntry: ResearchItem | null = shouldShowPlaceholder
        ? {
            id: placeholderId!,
            created_at: placeholderTimestamp!,
            status: 'processing',
            title: 'Preparing research...',
            user: { nickname: user?.nickname || user?.email || 'You' },
            user_id: user?.id || undefined,
            provider: 'gemini',
            models_used: ['preparing'],
            tokens_in: 0,
            tokens_out: 0,
            tickers: symbol ? [symbol] : [],
        }
        : null;
    const researchWithPlaceholder = placeholderEntry ? [placeholderEntry, ...researchList] : researchList;

    useEffect(() => {
        if (
            !localResearchRunning ||
            !expectedTopResearchIdRef.current ||
            triggerResearchMutation.isPending ||
            hasRemotePending
        ) {
            return;
        }

        if (latestResearchId && latestResearchId !== expectedTopResearchIdRef.current) {
            expectedTopResearchIdRef.current = undefined;
            if (localResearchRunning) {
                setLocalResearchRunning(false);
            }
        }
    }, [latestResearchId, triggerResearchMutation.isPending, hasRemotePending]); // eslint-disable-line react-hooks/exhaustive-deps



    const [showRetry, setShowRetry] = useState(false);

    useEffect(() => {
        if (isLoadingDetails) {
            const timer = setTimeout(() => setShowRetry(true), 10000);
            return () => clearTimeout(timer);
        } else {
            setShowRetry(false);
        }
    }, [isLoadingDetails]);

    const handleSync = async () => {
        if (!symbol) return;
        try {
            setIsSyncing(true);
            await api.post(`/research/sync/${symbol}`);
            queryClient.invalidateQueries({ queryKey: tickerKeys.details(symbol) });
            queryClient.invalidateQueries({ queryKey: tickerKeys.research(symbol) });
        } catch (err) {
            console.error('Sync failed', err);
            toast.error('Could not refresh this ticker');
        } finally {
            setIsSyncing(false);
        }
    };

    const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate('/dashboard'));

    const renderTicker = (data: TickerData) => {
        // Destructure Composite Data
        const { profile, market_data, risk_analysis, fundamentals, watchers } = data;
        // Native-only render — no conversion. Show the currency the stock trades in.
        const nativeCurrency = profile?.currency || 'USD';
        const direction = directionOf(market_data?.change_percent);

        const has52w = !!fundamentals?.fifty_two_week_high && !!market_data?.price;

        let verdict: React.ReactNode = null;
        if (risk_analysis) {
            // Same derivation as every list, so the badge here matches the row.
            verdict = (
                <VerdictBadge
                    {...detailVerdictProps({ price: market_data.price, risk_analysis, fundamentals, news: data.news })}
                />
            );
        }

        return (
            <main key={symbol} className="container mx-auto max-w-[80rem] px-4 pb-6 pt-3 md:py-6 animate-in fade-in duration-300">
                {/* --- 1. HERO --- */}
                <div className={HERO_GRID}>
                    {/* Identity */}
                    <div className="flex min-w-0 items-center gap-2.5 [grid-area:id] md:gap-3">
                        <button
                            type="button"
                            onClick={goBack}
                            aria-label="Go back"
                            className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <ArrowLeft className="h-5 w-5" aria-hidden />
                        </button>
                        <div
                            className="h-11 w-11 shrink-0 md:h-14 md:w-14"
                            onDoubleClick={isAdmin ? handleLogoDoubleClick : undefined}
                            title={isAdmin ? 'Double-click to update logo (Admin)' : undefined}
                        >
                            <TickerLogo url={profile?.logo_url} symbol={profile?.symbol} className="h-full w-full" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                                <h1 className="text-2xl font-bold leading-none tracking-tight md:text-3xl">{profile?.symbol}</h1>
                                {verdict}
                            </div>
                            <p className="mt-1.5 flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                                <span className="min-w-0 truncate font-medium text-foreground/90">{profile?.name}</span>
                                {profile?.industry && (
                                    <span className="hidden min-w-0 shrink truncate sm:inline">{profile.industry}</span>
                                )}
                                <span className="num inline-flex shrink-0 items-center gap-1 text-xs" title="Watchers">
                                    <Eye size={13} aria-hidden />
                                    {formatCount(watchers ?? 0)}
                                    <span className="sr-only"> watchers</span>
                                </span>
                            </p>
                        </div>
                    </div>

                    {/* Price */}
                    <div className="min-w-0 [grid-area:price]">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                            <span className="num text-[clamp(1.75rem,8.4vw,2.125rem)] font-semibold leading-none tracking-tight md:text-4xl">
                                {formatPrice(market_data?.price, nativeCurrency)}
                            </span>
                            <span
                                className={cn(
                                    'num inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold md:text-base',
                                    direction === 'up' ? TINT_UP : direction === 'down' ? TINT_DOWN : 'bg-muted text-muted-foreground',
                                )}
                            >
                                {direction === 'up' && <ArrowUp size={15} aria-hidden />}
                                {direction === 'down' && <ArrowDown size={15} aria-hidden />}
                                <span className="sr-only">{direction === 'up' ? 'up' : direction === 'down' ? 'down' : 'unchanged'} </span>
                                {formatAbsPercent(market_data?.change_percent ?? 0)}
                            </span>
                        </div>
                        <div className="mt-2.5">
                            <TickerMarketStatus symbol={symbol} />
                        </div>
                    </div>

                    {/* Actions: the same four on every width */}
                    <div className="grid grid-cols-4 gap-2 [grid-area:actions] lg:flex lg:items-center lg:self-center">
                        <button
                            type="button"
                            className={ACTION}
                            onClick={() => toggle()}
                            disabled={isFavLoading}
                            aria-pressed={isFavorite}
                            title={isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
                        >
                            <Star size={16} className={isFavorite ? 'fill-yellow-500 text-yellow-500' : 'text-muted-foreground'} aria-hidden />
                            <span className="truncate">Watch</span>
                        </button>
                        <button type="button" className={ACTION} onClick={() => setIsAlertDialogOpen(true)} title="Set Price Alert">
                            <BellPlus size={16} className="text-muted-foreground" aria-hidden />
                            <span className="truncate">Alert</span>
                        </button>
                        {latestResearchId ? (
                            <SharePopover
                                researchId={latestResearchId}
                                title={`${profile?.symbol} Research Analysis`}
                                trigger={
                                    <button type="button" className={ACTION} title="Share the latest research">
                                        <Share2 size={16} className="text-muted-foreground" aria-hidden />
                                        <span className="truncate">Share</span>
                                    </button>
                                }
                            />
                        ) : (
                            <button type="button" className={ACTION} disabled title="No research to share yet">
                                <Share2 size={16} className="text-muted-foreground" aria-hidden />
                                <span className="truncate">Share</span>
                            </button>
                        )}
                        <button type="button" className={ACTION} onClick={handleSync} disabled={isSyncing} title="Sync Data">
                            <RefreshCw size={16} className={cn('text-muted-foreground', isSyncing && 'animate-spin')} aria-hidden />
                            <span className="truncate">Sync</span>
                        </button>
                    </div>

                    {/* Chart */}
                    <section
                        aria-label={`${profile?.symbol} price chart`}
                        className="flex h-[19.5rem] min-w-0 flex-col overflow-hidden rounded-md bg-card [grid-area:chart] md:h-[22rem] lg:h-auto lg:min-h-[18.5rem]"
                    >
                        <PriceChart
                            symbol={symbol}
                            data={market_data?.history}
                            currency={nativeCurrency}
                            marketOpen={marketStatus?.session === 'regular'}
                            className="min-h-0 flex-1"
                        />
                    </section>

                    {/* Key levels: under the chart on a phone, beside it from md */}
                    {(risk_analysis || has52w) && (
                        <div className="min-w-0 space-y-5 rounded-md bg-card p-3 [grid-area:facts] md:grid md:grid-cols-2 md:gap-8 md:space-y-0 md:p-4 lg:block lg:space-y-5 lg:bg-transparent lg:p-0">
                            {risk_analysis && (
                                <RiskLight
                                    score={risk_analysis.overall_score}
                                    reasoning={risk_analysis.summary}
                                    sentiment={risk_analysis.sentiment}
                                    breakdown={{
                                        financial: risk_analysis.financial_risk,
                                        execution: risk_analysis.execution_risk,
                                        dilution: risk_analysis.dilution_risk,
                                        competitive: risk_analysis.competitive_risk,
                                        regulatory: risk_analysis.regulatory_risk,
                                    }}
                                />
                            )}
                            {has52w && fundamentals && (
                                <div>
                                    <p className="label-micro mb-2.5">52-week range</p>
                                    <FiftyTwoWeekRange
                                        low={fundamentals.fifty_two_week_low || 0}
                                        high={fundamentals.fifty_two_week_high || 0}
                                        current={market_data.price}
                                        showLabels={true}
                                        className="w-full"
                                        currency={nativeCurrency}
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* --- 2. TABS --- */}
                <Tabs
                    value={currentTab}
                    onValueChange={(value) => {
                        if (value === 'overview') {
                            navigate(`/ticker/${symbol}`);
                        } else {
                            navigate(`/ticker/${symbol}/${value}`);
                        }
                    }}
                    className="mt-5 w-full md:mt-7"
                >
                    <TabsList className="mb-3 md:mb-4">
                        <TabsTrigger value="overview" className={TAB}>Overview</TabsTrigger>
                        <TabsTrigger value="research" className={TAB}>
                            <span className="sm:hidden">Research</span>
                            <span className="hidden sm:inline">AI Research</span>
                        </TabsTrigger>
                        <TabsTrigger value="financials" className={TAB}>Financials</TabsTrigger>
                        <TabsTrigger value="social" className={TAB}>
                            <span className="sm:hidden">Social</span>
                            <span className="hidden sm:inline">Social &amp; Events</span>
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="mt-0">
                        <TickerOverview
                            risk_analysis={risk_analysis}
                            market_data={market_data}
                            ratings={data.ratings}
                            profile={profile}
                            news={data.news}
                            newsList={news}
                            fundamentals={fundamentals || undefined}
                        />
                    </TabsContent>

                    <TabsContent value="research" className="mt-0">
                        <ResearchFeed
                            research={researchWithPlaceholder}
                            onTrigger={handleTriggerResearch}
                            isAnalyzing={isAnalyzing}
                            onDelete={isAdmin ? handleDeleteResearch : undefined}
                            defaultTicker={symbol}
                        />
                    </TabsContent>

                    <TabsContent value="financials" className="mt-0">
                        <TickerFinancials fundamentals={fundamentals} currency={profile?.currency} />
                    </TabsContent>

                    <TabsContent value="social" className="mt-0">
                        <StocktwitsAnalysis symbol={symbol || ''} />
                    </TabsContent>
                </Tabs>

                {/* --- 3. DISCUSSION (under every tab) --- */}
                <div className="mt-3 sm:mt-4">
                    <TickerDiscussion
                        comments={socialComments}
                        onPostComment={(content, parentId) =>
                            symbol ? postCommentMutation.mutateAsync({ symbol, content, parentId }) : undefined
                        }
                        isPosting={postCommentMutation.isPending}
                        likedCommentIds={likedCommentIds}
                        onToggleLike={(commentId) => {
                            if (symbol) {
                                toggleLikeMutation.mutate({ commentId, symbol });
                            }
                        }}
                        onDeleteComment={(commentId) => {
                            if (symbol) {
                                deleteCommentMutation.mutate({ commentId, symbol });
                            }
                        }}
                        mentionedUsers={mentionedUsers}
                    />
                </div>
            </main>
        );
    };

    return (
        <div className="min-h-page bg-background font-sans text-foreground selection:bg-primary/20">
            {isLoadingDetails ? (
                <main className="container mx-auto flex min-h-page max-w-[80rem] flex-col items-center justify-center gap-6 px-4 py-32">
                    <SuperLoading symbol={symbol} />
                    {showRetry && (
                        <div className="z-50 flex flex-col items-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <p className="text-sm text-muted-foreground">Still loading? The connection might be slow.</p>
                            <Button variant="outline" size="lg" onClick={() => window.location.reload()} className="h-11 gap-2">
                                <RefreshCw className="h-4 w-4" aria-hidden /> Try Refreshing
                            </Button>
                        </div>
                    )}
                </main>
            ) : !tickerData ? (
                <main className="container mx-auto max-w-[80rem] px-4 py-16">
                    <EmptyState
                        role="alert"
                        title="Ticker Not Found"
                        description={symbol ? `There is no ticker "${symbol}" here. It may not be tracked yet, or the symbol is misspelled.` : undefined}
                        action={<Button variant="outline" className="h-11 lg:h-10" onClick={() => navigate('/dashboard')}>Return to Dashboard</Button>}
                    />
                </main>
            ) : (
                renderTicker(tickerData as TickerData)
            )}

            {/* Admin: replace the ticker logo */}
            <Dialog open={isLogoUploadOpen} onOpenChange={setIsLogoUploadOpen}>
                <DialogHeader>
                    <DialogTitle>Update Logo (Admin)</DialogTitle>
                    <DialogDescription>
                        Enter a direct URL to a PNG/JPG image for {symbol}.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-2">
                    <Input
                        id="logo-url"
                        aria-label="Logo image URL"
                        placeholder="https://example.com/logo.png"
                        value={logoUploadUrl}
                        onChange={(e) => setLogoUploadUrl(e.target.value)}
                    />
                </div>
                <DialogFooter className="mt-4">
                    <Button variant="outline" onClick={() => setIsLogoUploadOpen(false)}>Cancel</Button>
                    <Button onClick={handleLogoUpdate}>Save Logo</Button>
                </DialogFooter>
            </Dialog>

            {/* Price Alert Dialog */}
            <CreateAlertDialog
                key={`${symbol}-${isAlertDialogOpen}`}
                symbol={symbol || ''}
                currentPrice={(tickerData as TickerData)?.market_data?.price ?? 0}
                nativeCurrency={(tickerData as TickerData)?.profile?.currency || 'USD'}
                open={isAlertDialogOpen}
                onOpenChange={setIsAlertDialogOpen}
            />
        </div>
    );
}
