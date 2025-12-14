import { useParams, useNavigate } from 'react-router-dom';
import {
    Loader2,
    TrendingUp,
    TrendingDown,
    Eye,
    Share2,
    ArrowLeft
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Header } from '../components/layout/Header';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { RiskLight } from '../components/ticker/RiskLight';
import { ResearchFeed } from '../components/ticker/ResearchFeed';
import { TickerLogo } from '../components/dashboard/TickerLogo';
import { TickerOverview } from '../components/ticker/TickerOverview';
import { TickerFinancials } from '../components/ticker/TickerFinancials';
import { TickerNews } from '../components/ticker/TickerNews';
import { TickerDiscussion } from '../components/ticker/TickerDiscussion';
import {
    useTickerDetails,
    useTickerNews,
    useTickerSocial,
    useTickerResearch,
    useTriggerResearch,
    usePostComment,
    useDeleteResearch
} from '../hooks/useTicker';
import { useAuth } from '../context/AuthContext';
import type { TickerData, NewsItem, SocialComment, ResearchItem } from '../types/ticker';

export function TickerDetail() {
    const { symbol, tab } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();

    // Validate tab or default to overview
    const validTabs = ['overview', 'financials', 'research', 'news'];
    const currentTab = (tab && validTabs.includes(tab)) ? tab : 'overview';

    // -- Hooks --
    const { data: tickerData, isLoading: isLoadingDetails } = useTickerDetails(symbol);
    const { data: news = [] } = useTickerNews(symbol) as { data: NewsItem[] };
    const { data: socialComments = [] } = useTickerSocial(symbol) as { data: SocialComment[] };
    const { data: researchList = [] } = useTickerResearch(symbol) as { data: ResearchItem[] };

    // -- Mutations --
    const triggerResearchMutation = useTriggerResearch();
    const postCommentMutation = usePostComment();
    const deleteResearchMutation = useDeleteResearch();

    const handleTriggerResearch = (opts?: { provider?: 'gemini' | 'openai' | 'ensemble'; quality?: 'low' | 'medium' | 'high' | 'deep'; question?: string; modelKey?: string }) => {
        if (!symbol) return;
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



    if (isLoadingDetails) return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <Loader2 className="animate-spin w-8 h-8 text-primary" />
                <div className="text-muted-foreground animate-pulse text-sm">Loading Terminal Data...</div>
            </div>
        </div>
    );

    if (!tickerData) return (
        <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-4">
            <div className="text-destructive font-bold text-lg">Ticker Not Found</div>
            <Button variant="outline" onClick={() => navigate('/dashboard')}>Return to Dashboard</Button>
        </div>
    );

    // Destructure Composite Data
    const { profile, market_data, risk_analysis, fundamentals, watchers } = tickerData as TickerData;
    const isPriceUp = market_data?.change_percent >= 0;

    return (
        <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20">
            <Header />

            <main className="container mx-auto px-4 py-6 max-w-[80rem] space-y-6">

                {/* --- 1. HERO HEADER --- */}
                {/* --- 1. HERO HEADER --- */}
                <div className="relative z-[999] flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6 pb-4 md:pb-6">
                    <div className="flex items-start md:items-center gap-3 md:gap-4 w-full">
                        <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} className="rounded-full hover:bg-muted h-8 w-8 shrink-0">
                            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
                        </Button>

                        <div className="flex-1 min-w-0 grid grid-cols-[auto_1fr] md:flex md:items-center gap-x-3 gap-y-1">
                            {/* Logo */}
                            <TickerLogo url={profile?.logo_url} symbol={profile?.symbol} className="w-10 h-10 md:w-12 md:h-12 row-span-2 md:row-span-1" />

                            {/* Top Row: Symbol + Exchange + Price (Mobile Right) */}
                            <div className="flex items-center justify-between md:justify-start gap-2 col-start-2">
                                <div className="flex items-center gap-2">
                                    <h1 className="text-xl md:text-2xl font-bold tracking-tight leading-none">{profile?.symbol}</h1>
                                    <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-bold text-muted-foreground uppercase tracking-wide hidden md:inline-block">{profile?.exchange}</span>

                                    {/* Watch & Share */}
                                    <div className="hidden md:flex items-center gap-2 ml-2 pl-2 border-l border-border/50">
                                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-default" title="Watchers">
                                            <Eye size={12} />
                                            <span className="font-semibold">{(watchers ?? 0).toLocaleString()}</span>
                                        </div>
                                        <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-muted" title="Share">
                                            <Share2 size={12} className="text-muted-foreground" />
                                        </Button>
                                    </div>
                                </div>

                                {/* Mobile Price Display */}
                                <div className="md:hidden flex items-center gap-2">
                                    <span className={`flex items-center text-xs font-bold ${isPriceUp ? 'text-green-500' : 'text-red-500'}`}>
                                        {isPriceUp ? <TrendingUp size={12} className="mr-1" /> : <TrendingDown size={12} className="mr-1" />}
                                        {Math.abs(market_data?.change_percent || 0).toFixed(2)}%
                                    </span>
                                    <span className="text-lg font-mono font-bold tracking-tight">
                                        ${market_data?.price?.toFixed(2)}
                                    </span>
                                </div>
                            </div>

                            {/* Bottom Row: Name + Divider + Regular Price (Desktop) */}
                            <div className="flex items-center justify-between md:justify-start gap-4 col-start-2 md:col-auto w-full md:w-auto">
                                <div className="text-xs md:text-sm text-muted-foreground font-medium truncate">{profile?.name}</div>

                                {/* Desktop Price Display */}
                                <div className="hidden md:flex items-center gap-4">
                                    <div className="h-4 w-px bg-border hidden md:block" />
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-2xl font-mono font-semibold tracking-tight">
                                            ${market_data?.price?.toFixed(2)}
                                        </span>
                                        <span className={`flex items-center text-sm font-medium ${isPriceUp ? 'text-green-500' : 'text-red-500'}`}>
                                            {isPriceUp ? <TrendingUp size={14} className="mr-1" /> : <TrendingDown size={14} className="mr-1" />}
                                            {Math.abs(market_data?.change_percent || 0).toFixed(2)}%
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-3 w-full md:w-auto">
                        <div className="flex items-center gap-3">
                            {risk_analysis && (
                                <>
                                    {/* Desktop Risk */}
                                    <div className="hidden md:block">
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
                                    {/* Mobile Risk */}
                                    <div className="md:hidden block">
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
                                </>
                            )}
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
                        />
                    </TabsContent>

                    {/* AI RESEARCH TAB */}
                    <TabsContent value="research">
                        <ResearchFeed
                            research={researchList}
                            onTrigger={handleTriggerResearch}
                            isAnalyzing={triggerResearchMutation.isPending || researchList.some(item => item.status === 'processing' || item.status === 'pending')}
                            onDelete={(user?.role?.toLowerCase() === 'admin') ? handleDeleteResearch : undefined}
                            defaultTicker={symbol}
                        />
                    </TabsContent>

                    {/* FINANCIALS TAB */}
                    <TabsContent value="financials">
                        <TickerFinancials symbol={symbol!} fundamentals={fundamentals} />
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
        </div>
    );
}
