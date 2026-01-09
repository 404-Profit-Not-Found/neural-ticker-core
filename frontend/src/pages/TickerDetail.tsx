import { useParams, useNavigate } from 'react-router-dom';
import {
    Loader2,
    TrendingUp,
    TrendingDown,
    Eye,
    Share2,
    ArrowLeft,
    RefreshCw
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { api } from '../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { tickerKeys } from '../hooks/useTicker';
import { Header } from '../components/layout/Header';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { RiskLight } from '../components/ticker/RiskLight';
import { VerdictBadge } from '../components/ticker/VerdictBadge';
import { calculateLiveUpside, getBasePriceFromScenarios } from '../lib/rating-utils';
import { ResearchFeed } from '../components/ticker/ResearchFeed';
import { TickerLogo } from '../components/dashboard/TickerLogo';
import { TickerOverview } from '../components/ticker/TickerOverview';
import { TickerFinancials } from '../components/ticker/TickerFinancials';
import { TickerNews } from '../components/ticker/TickerNews';
import { TickerDiscussion } from '../components/ticker/TickerDiscussion';
import { PriceChart } from '../components/ticker/PriceChart';
import {
    useTickerDetails,
    useTickerNews,
    useTickerSocial,
    useTickerResearch,
    useTriggerResearch,
    usePostComment,
    useDeleteResearch,
    useToggleFavorite
} from '../hooks/useTicker';
import { useWatchlists } from '../hooks/useWatchlist';
import { useAuth } from '../context/AuthContext';
import type { TickerData, NewsItem, SocialComment, ResearchItem } from '../types/ticker';
import { useEffect, useState, useRef } from 'react';
import { Star } from 'lucide-react';

const RESEARCH_PENDING_GRACE_MS = 45000;
export function TickerDetail() {
    const { symbol, tab } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [localResearchRunning, setLocalResearchRunning] = useState(false);
    const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [placeholderId, setPlaceholderId] = useState<string | null>(null);
    const [placeholderTimestamp, setPlaceholderTimestamp] = useState<string | null>(null);
    const expectedTopResearchIdRef = useRef<string | undefined>(undefined);
    const [isSyncing, setIsSyncing] = useState(false);
    const queryClient = useQueryClient();

    // Validate tab or default to overview
    const validTabs = ['overview', 'financials', 'research', 'news'];
    const currentTab = (tab && validTabs.includes(tab)) ? tab : 'overview';

    // -- Hooks --
    const { data: tickerData, isLoading: isLoadingDetails } = useTickerDetails(symbol);
    const { data: news = [] } = useTickerNews(symbol) as { data: NewsItem[] };
    const { data: socialComments = [] } = useTickerSocial(symbol) as { data: SocialComment[] };
    const { data: researchList = [] } = useTickerResearch(symbol) as { data: ResearchItem[] };
    const { data: watchlists = [] } = useWatchlists();

    const isFavorite = watchlists?.some(wl =>
        wl.items?.some(item => item.ticker.symbol === symbol)
    ) ?? false;

    // -- Mutations --
    const triggerResearchMutation = useTriggerResearch();
    const postCommentMutation = usePostComment();
    const deleteResearchMutation = useDeleteResearch();
    const favoriteMutation = useToggleFavorite();

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

    const handleDeleteResearch = (id: string) => {
        if (confirm('Are you sure you want to delete this research?')) {
            deleteResearchMutation.mutate(id);
        }
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



    return (
        <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20">
            <Header />

            {isLoadingDetails ? (
                <main className="container mx-auto px-4 py-32 max-w-[80rem] flex flex-col items-center justify-center gap-4">
                    <Loader2 className="animate-spin w-8 h-8 text-primary" />
                    <div className="text-muted-foreground animate-pulse text-sm">Loading Terminal Data...</div>
                </main>
            ) : !tickerData ? (
                <main className="container mx-auto px-4 py-32 max-w-[80rem] flex flex-col items-center justify-center gap-4">
                    <div className="text-destructive font-bold text-lg">Ticker Not Found</div>
                    <Button variant="outline" onClick={() => navigate('/dashboard')}>Return to Dashboard</Button>
                </main>
            ) : (() => {
                // Destructure Composite Data
                const { profile, market_data, risk_analysis, fundamentals, watchers } = tickerData as TickerData;
                const isPriceUp = market_data?.change_percent >= 0;

                return (
                    <main className="container mx-auto px-4 py-6 max-w-[80rem] space-y-6 animate-in fade-in duration-500">

                        {/* --- 1. HERO HEADER --- */}
                        <div className="relative z-30 space-y-4 pb-4 md:pb-6">
                            {/* Mobile Actions (Absolute Top Right) */}
                            <div className="md:hidden absolute top-0 right-0 flex items-center gap-2 z-40">
                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground mr-1" title="Watchers">
                                    <Eye size={12} />
                                    <span className="font-semibold">{(watchers ?? 0).toLocaleString()}</span>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-full hover:bg-muted text-muted-foreground hover:text-yellow-400 -mr-2"
                                    title="Add to Favourites"
                                    onClick={() => {
                                        if (symbol) favoriteMutation.mutate(symbol);
                                    }}
                                >
                                    <Star
                                        size={16}
                                        className={isFavorite ? "fill-yellow-400 text-yellow-400" : ""}
                                    />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-muted -mr-2" title="Share">
                                    <Share2 size={16} className="text-muted-foreground" />
                                </Button>
                            </div>

                            {/* --- DESKTOP LAYOUT --- */}
                            <div className="hidden md:block space-y-6">
                                {/* Row 1: Identity & Actions */}
                                <div className="flex items-center justify-between">
                                    {/* Left: Identity */}
                                    <div className="flex items-center gap-4">
                                        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full hover:bg-muted h-10 w-10 shrink-0">
                                            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
                                        </Button>
                                        <TickerLogo url={profile?.logo_url} symbol={profile?.symbol} className="w-14 h-14 shrink-0 rounded-lg" />
                                        <div>
                                            <div className="flex items-center gap-3">
                                                <h1 className="text-3xl font-bold tracking-tight leading-none">{profile?.symbol}</h1>
                                                {(() => {
                                                    const liveUpside = calculateLiveUpside(
                                                        market_data.price,
                                                        getBasePriceFromScenarios(risk_analysis.scenarios),
                                                        risk_analysis.upside_percent
                                                    );
                                                    
                                                    // Extract Bear Price
                                                    const bearScenario = risk_analysis.scenarios.find(s => s.scenario_type.toLowerCase() === 'bear');
                                                    const bearPrice = bearScenario ? Number(bearScenario.price_mid) : undefined;
                                                    
                                                    const liveDownside = typeof bearPrice === 'number' && market_data.price > 0
                                                        ? ((bearPrice - market_data.price) / market_data.price) * 100
                                                        : -(risk_analysis.financial_risk * 5); // Fallback

                                                    // We call calculateAiRating inside VerdictBadge now, but we need to pass the props.
                                                    // The previous calculation here was unused.
                                                    
                                                    return (
                                                        <VerdictBadge
                                                            risk={risk_analysis.financial_risk}
                                                            upside={liveUpside}
                                                            downside={liveDownside}
                                                            consensus={fundamentals?.consensus_rating}
                                                            overallScore={risk_analysis.overall_score}
                                                            pe={fundamentals?.pe_ratio}
                                                        />
                                                    );
                                                })()}

                                            </div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-sm text-foreground font-medium truncate">{profile?.name}</span>
                                                {profile?.industry && (
                                                    <>
                                                        <span className="text-muted-foreground/40">•</span>
                                                        <span className="text-sm text-muted-foreground">{profile.industry}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right: Actions */}
                                    <div className="flex items-center gap-1">
                                        <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/30 rounded-full border border-border/40 mr-2" title="Watchers">
                                            <Eye size={14} className="text-muted-foreground" />
                                            <span className="text-xs font-semibold text-foreground">{(watchers ?? 0).toLocaleString()}</span>
                                        </div>

                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-9 w-9 data-[state=active]:bg-muted rounded-full"
                                            onClick={async () => {
                                                if (!symbol) return;
                                                try {
                                                    setIsSyncing(true);
                                                    await api.post(`/research/sync/${symbol}`);
                                                    queryClient.invalidateQueries({ queryKey: tickerKeys.details(symbol) });
                                                    queryClient.invalidateQueries({ queryKey: tickerKeys.research(symbol) });
                                                } catch (err) {
                                                    console.error("Sync failed", err);
                                                } finally {
                                                    setIsSyncing(false);
                                                }
                                            }}
                                            disabled={isSyncing}
                                            title="Sync Data"
                                        >
                                            <RefreshCw size={18} className={isSyncing ? "animate-spin text-primary" : "text-muted-foreground"} />
                                        </Button>

                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-9 w-9 rounded-full"
                                            onClick={() => {
                                                if (symbol) favoriteMutation.mutate(symbol);
                                            }}
                                            title={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
                                        >
                                            <Star
                                                size={18}
                                                className={isFavorite ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground hover:text-yellow-400"}
                                            />
                                        </Button>

                                        <Button variant="ghost" size="sm" className="h-9 w-9 rounded-full" title="Share">
                                            <Share2 size={18} className="text-muted-foreground" />
                                        </Button>
                                    </div>
                                </div>
                                {/* Row 2: Data & Context */}
                                <div className="flex items-start gap-12">
                                    {/* Price & Risk Block */}
                                    <div className="shrink-0 min-w-[200px]">
                                        <div className="flex items-baseline gap-3 mb-4">
                                            <span className="text-4xl font-mono font-semibold tracking-tighter">
                                                ${market_data?.price?.toFixed(2)}
                                            </span>
                                            <div className={`flex items-center text-lg font-medium px-2 py-0.5 rounded ${isPriceUp ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                                {isPriceUp ? <TrendingUp size={18} className="mr-1.5" /> : <TrendingDown size={18} className="mr-1.5" />}
                                                {Math.abs(market_data?.change_percent || 0).toFixed(2)}%
                                            </div>
                                        </div>

                                        {risk_analysis && (
                                            <div className="pt-2 border-t border-border/50 flex items-center">
                                                <RiskLight
                                                    score={risk_analysis.overall_score}
                                                    reasoning={risk_analysis.summary}
                                                    sentiment={risk_analysis.sentiment}
                                                    breakdown={{
                                                        financial: risk_analysis.financial_risk,
                                                        execution: risk_analysis.execution_risk,
                                                        dilution: risk_analysis.dilution_risk,
                                                        competitive: risk_analysis.competitive_risk,
                                                        regulatory: risk_analysis.regulatory_risk
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* Chart Area */}
                                    <div className="flex-1 space-y-4">
                                        <div className="min-h-[200px] bg-muted/10 rounded-xl border border-border/40 p-1 relative overflow-hidden group">
                                            {market_data?.history && market_data.history.length > 0 ? (
                                                <PriceChart data={market_data.history} className="h-full" />
                                            ) : (
                                                <div className="h-full flex items-center justify-center text-muted-foreground/50 text-xs italic">
                                                    No historical data available for chart
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* --- MOBILE LAYOUT (Unchanged structure, ensuring compatibility) --- */}
                            <div className="md:hidden">
                                {/* Top: Back + Logo + Symbol/Name */}
                                <div className="flex items-start gap-3 pr-24">
                                    <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full hover:bg-muted h-8 w-8 shrink-0 mt-1">
                                        <ArrowLeft className="w-4 h-4 text-muted-foreground" />
                                    </Button>

                                    <TickerLogo url={profile?.logo_url} symbol={profile?.symbol} className="w-10 h-10 shrink-0" />

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h1 className="text-xl font-bold tracking-tight leading-none">{profile?.symbol}</h1>
                                            {(() => {
                                                const liveUpside = calculateLiveUpside(
                                                    market_data.price,
                                                    getBasePriceFromScenarios(risk_analysis.scenarios),
                                                    risk_analysis.upside_percent
                                                );
                                                
                                                const bearScenario = risk_analysis.scenarios.find(s => s.scenario_type.toLowerCase() === 'bear');
                                                const bearPrice = bearScenario && bearScenario.price_mid ? Number(bearScenario.price_mid) : undefined;
                                                
                                                const liveDownside = typeof bearPrice === 'number' && market_data.price > 0
                                                    ? ((bearPrice - market_data.price) / market_data.price) * 100
                                                    : -(risk_analysis.financial_risk * 5);

                                                return (
                                                    <VerdictBadge
                                                        risk={risk_analysis.financial_risk}
                                                        upside={liveUpside}
                                                        downside={liveDownside}
                                                        consensus={fundamentals?.consensus_rating}
                                                        overallScore={risk_analysis.overall_score}
                                                    />
                                                );
                                            })()}
                                        </div>
                                        <div className="text-xs text-muted-foreground font-medium truncate mt-0.5">
                                            {profile?.name}
                                        </div>
                                        <div className="flex items-baseline gap-2 mt-1">
                                            <span className="text-lg font-mono font-bold tracking-tight">
                                                ${market_data?.price?.toFixed(2)}
                                            </span>
                                            <span className={`flex items-center text-xs font-bold ${isPriceUp ? 'text-green-500' : 'text-red-500'}`}>
                                                {isPriceUp ? <TrendingUp size={10} className="mr-0.5" /> : <TrendingDown size={10} className="mr-0.5" />}
                                                {Math.abs(market_data?.change_percent || 0).toFixed(2)}%
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Mobile: Risk Row */}
                                <div className="md:hidden flex items-center justify-center mt-4">
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
                                                regulatory: risk_analysis.regulatory_risk
                                            }}
                                        />
                                    )}
                                </div>

                                {/* Mobile: Chart Area */}
                                <div className="md:hidden mt-6 space-y-4">
                                    <div className="h-[200px] bg-muted/10 rounded-xl border border-border/40 p-1 relative overflow-hidden">
                                        {market_data?.history && market_data.history.length > 0 ? (
                                            <PriceChart data={market_data.history} className="h-full" />
                                        ) : (
                                            <div className="h-full flex items-center justify-center text-muted-foreground/50 text-xs italic">
                                                No historical data available for chart
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>



                        {/* --- 2. TABS LAYOUT --- */}
                        <Tabs
                            value={currentTab}
                            onValueChange={(value) => navigate(`/ticker/${symbol}/${value}`)}
                            className="w-full relative z-0"
                        >
                            <TabsList className="mb-6">
                                <TabsTrigger value="overview">Overview</TabsTrigger>
                                <TabsTrigger value="research">AI Research</TabsTrigger>
                                <TabsTrigger value="financials">Financials</TabsTrigger>
                                <TabsTrigger value="news">News</TabsTrigger>
                            </TabsList>

                            {/* OVERVIEW TAB */}
                            <TabsContent value="overview" className="space-y-6">
                                <TickerOverview
                                    risk_analysis={risk_analysis}
                                    market_data={market_data}
                                    ratings={tickerData.ratings}
                                    profile={profile}
                                />
                            </TabsContent>

                            {/* AI RESEARCH TAB */}
                            <TabsContent value="research">
                                <ResearchFeed
                                    research={researchWithPlaceholder}
                                    onTrigger={handleTriggerResearch}
                                    isAnalyzing={isAnalyzing}
                                    onDelete={(user?.role?.toLowerCase() === 'admin') ? handleDeleteResearch : undefined}
                                    defaultTicker={symbol}
                                />
                            </TabsContent>

                            {/* FINANCIALS TAB */}
                            <TabsContent value="financials">
                                <TickerFinancials fundamentals={fundamentals} />
                            </TabsContent>

                            {/* NEWS TAB */}
                            <TabsContent value="news">
                                <TickerNews news={news} />
                            </TabsContent>
                        </Tabs>

                        {/* --- 3. DISCUSSION (Global Footer) --- */}
                        <div className="mt-12 border-t border-border pt-8 pb-12">
                            <div className="max-w-3xl mx-auto">
                                <TickerDiscussion
                                    comments={socialComments}
                                    onPostComment={(content) => {
                                        if (symbol) {
                                            postCommentMutation.mutate({ symbol, content });
                                        }
                                    }}
                                    isPosting={postCommentMutation.isPending}
                                />
                            </div>
                        </div>

                    </main>
                );
            })()}
        </div>
    );
}
