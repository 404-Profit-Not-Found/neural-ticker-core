import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Loader2,
    TrendingUp,
    TrendingDown,
    Eye,
    Share2,
    ArrowLeft,
    MessageSquare,
    Send
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Header } from '../components/layout/Header';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { RiskLight } from '../components/ticker/RiskLight';
import { ResearchFeed } from '../components/ticker/ResearchFeed';
import { TickerLogo } from '../components/dashboard/TickerLogo';
import { TickerOverview } from '../components/ticker/TickerOverview';
import { TickerFinancials } from '../components/ticker/TickerFinancials';
import { TickerNews } from '../components/ticker/TickerNews';
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

    // -- Local State --
    const [commentInput, setCommentInput] = useState('');

    const handleTriggerResearch = () => {
        if (symbol) {
            triggerResearchMutation.mutate(symbol);
        }
    };

    const handleDeleteResearch = (id: string) => {
        if (confirm('Are you sure you want to delete this research?')) {
            deleteResearchMutation.mutate(id);
        }
    };

    const handlePostComment = () => {
        if (symbol && commentInput.trim()) {
            postCommentMutation.mutate({ symbol, content: commentInput }, {
                onSuccess: () => setCommentInput('')
            });
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
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-border pb-6">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} className="rounded-full hover:bg-muted h-8 w-8">
                            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
                        </Button>

                        <TickerLogo url={profile?.logo_url} symbol={profile?.symbol} className="w-12 h-12" />

                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-2xl font-bold tracking-tight">{profile?.symbol}</h1>
                                <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-bold text-muted-foreground uppercase tracking-wide">{profile?.exchange}</span>
                            </div>
                            <div className="text-sm text-muted-foreground font-medium">{profile?.name}</div>
                        </div>

                        <div className="h-8 w-px bg-border mx-2 hidden md:block" />

                        <div className="hidden md:block">
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

                    <div className="flex items-center gap-3">
                        {risk_analysis && (
                            <RiskLight
                                score={risk_analysis.overall_score}
                                reasoning={risk_analysis.summary}
                            />
                        )}
                        <div className="h-4 w-px bg-border mx-1" />
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/30 px-2 py-1.5 rounded-md border border-border/50">
                            <Eye size={12} />
                            <span className="font-semibold text-foreground">{watchers?.toLocaleString() || 0}</span>
                        </div>
                        <Button variant="outline" size="sm" className="gap-2 h-9 text-xs">
                            <Share2 size={12} /> Share
                        </Button>
                    </div>
                </div>

                {/* --- 2. TABS LAYOUT --- */}
                <Tabs
                    value={currentTab}
                    onValueChange={(value) => navigate(`/ticker/${symbol}/${value}`)}
                    className="w-full"
                >
                    <TabsList className="mb-6">
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="financials">Financials & Details</TabsTrigger>
                        <TabsTrigger value="research">AI Research</TabsTrigger>
                        <TabsTrigger value="news">News</TabsTrigger>
                    </TabsList>

                    {/* OVERVIEW TAB */}
                    <TabsContent value="overview" className="space-y-6">
                        <TickerOverview
                            risk_analysis={risk_analysis}
                            market_data={market_data}
                        />
                    </TabsContent>

                    {/* FINANCIALS TAB */}
                    <TabsContent value="financials">
                        <TickerFinancials fundamentals={fundamentals} />
                    </TabsContent>

                    {/* AI RESEARCH TAB */}
                    <TabsContent value="research">
                        <ResearchFeed
                            research={researchList}
                            onTrigger={handleTriggerResearch}
                            isAnalyzing={triggerResearchMutation.isPending}
                            onDelete={(user?.role?.toLowerCase() === 'admin') ? handleDeleteResearch : undefined}
                            defaultTicker={symbol}
                        />
                    </TabsContent>

                    {/* NEWS TAB */}
                    <TabsContent value="news">
                        <TickerNews news={news} />
                    </TabsContent>
                </Tabs>

                {/* --- 3. DISCUSSION (Global Footer) --- */}
                <div className="mt-12 border-t border-border pt-8">
                    <Card className="flex flex-col border-t-4 border-t-pink-500/20 max-w-4xl mx-auto shadow-sm">
                        <CardHeader className="py-4 border-b border-border bg-muted/10">
                            <CardTitle className="font-bold flex items-center gap-2 text-sm text-pink-400">
                                <MessageSquare size={14} /> Community Discussion
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0 flex flex-col">
                            <div className="flex-1 max-h-[400px] overflow-y-auto p-4 space-y-4">
                                {socialComments.length > 0 ? socialComments.map((comment: SocialComment) => (
                                    <div key={comment.id} className="flex gap-3 text-sm">
                                        <div className="w-8 h-8 rounded-full bg-muted border border-border flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden">
                                            {comment.user?.avatar_url ? (
                                                <img src={comment.user.avatar_url} alt={comment.user.nickname || comment.user.name || 'User avatar'} className="w-full h-full object-cover" />
                                            ) : (
                                                (comment.user?.nickname || comment.user?.name || comment.user?.email || 'User').slice(0, 1).toUpperCase()
                                            )}
                                        </div>
                                        <div className="bg-muted/10 p-3 rounded-lg rounded-tl-none flex-1">
                                            <div className="flex items-baseline justify-between mb-1">
                                                <span className="font-semibold text-foreground text-xs">
                                                    {comment.user?.nickname || comment.user?.name || comment.user?.email?.split('@')[0] || 'Trader'}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground">{new Date(comment.created_at).toLocaleString()}</span>
                                            </div>
                                            <p className="text-muted-foreground leading-relaxed text-xs">{comment.content}</p>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="text-center text-muted-foreground py-10 text-sm">No comments yet. Be the first to start the discussion!</div>
                                )}
                            </div>
                            <div className="p-4 border-t border-border bg-muted/5">
                                <div className="flex gap-3">
                                    <input
                                        className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary placeholder:text-muted-foreground"
                                        placeholder="Share your thoughts on this ticker..."
                                        value={commentInput}
                                        onChange={(e) => setCommentInput(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handlePostComment()}
                                    />
                                    <Button className="w-10 h-10" size="icon" onClick={handlePostComment} disabled={postCommentMutation.isPending || !commentInput.trim()}>
                                        <Send size={16} />
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

            </main>
        </div>
    );
}
