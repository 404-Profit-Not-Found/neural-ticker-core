import { useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
    Activity,
    Search,
    Brain,
    Zap,
    TrendingUp,
    Newspaper,
    ArrowRight,
    Loader2
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { cn, api } from '../lib/api';
import { useTickerResearch, useTriggerResearch } from '../hooks/useTicker';
import { useStockAnalyzer, type StockSnapshot } from '../hooks/useStockAnalyzer';
import { WatchlistGridView } from '../components/dashboard/WatchlistGridView';
import type { TickerData } from '../components/dashboard/WatchlistTableView';
import { Sparkles } from 'lucide-react';

// --- Components based on StyleGuidePage ---

function StatPill({
    icon: Icon,
    label,
    value,
    tone = 'muted'
}: {
    icon: ComponentType<{ className?: string }>;
    label: string;
    value: string;
    tone?: 'primary' | 'muted' | 'accent' | 'emerald' | 'rose';
}) {
    const gradients: Record<string, string> = {
        primary: 'linear-gradient(90deg, #22d3ee, #2563eb)',
        muted: 'linear-gradient(90deg, #a855f7, #6366f1)',
        accent: 'linear-gradient(90deg, #6366f1, #a855f7)',
        emerald: 'linear-gradient(90deg, #22c55e, #14b8a6)',
        rose: 'linear-gradient(90deg, #f472b6, #e11d48)',
    };

    const iconColors: Record<string, string> = {
        primary: 'text-blue-600 dark:text-blue-400',
        muted: 'text-purple-600 dark:text-purple-300',
        accent: 'text-indigo-600 dark:text-indigo-300',
        emerald: 'text-emerald-600 dark:text-emerald-300',
        rose: 'text-rose-600 dark:text-rose-300',
    };

    return (
        <div
            className={cn(
                'style-kpi relative overflow-hidden rounded-md border px-4 py-3',
            )}
            style={{
                background:
                    'linear-gradient(rgb(var(--card)), rgb(var(--card))) padding-box, ' +
                    `${gradients[tone] || gradients.primary} border-box`,
            }}
        >
            <div
                className="style-kpi-grid absolute inset-0 opacity-25 pointer-events-none"
                style={{
                    backgroundImage: 'linear-gradient(rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.2) 1px, transparent 1px)',
                    backgroundSize: '18px 18px'
                }}
                aria-hidden
            />
            <div className="relative z-10 flex items-start justify-between gap-3">
                <div className="space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
                    <p className="text-2xl font-bold text-foreground leading-tight">{value}</p>
                </div>
                <Icon className={cn('w-5 h-5', iconColors[tone])} />
            </div>
        </div>
    );
}

interface ResearchNote {
    id: string;
    title?: string;
    question?: string;
    status: string;
    tickers: string[];
    created_at: string;
    models_used?: string[];
}

function ResearchFeedWidget() {
    const navigate = useNavigate();
    const { data: research, isLoading } = useTickerResearch();
    const recentResearch = research?.slice(0, 5) || [];

    if (isLoading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>;

    return (
        <div className="divide-y divide-border/50">
            {recentResearch.map((item: ResearchNote) => (
                <div
                    key={item.id}
                    className="group flex items-center justify-between p-3 hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/research/${item.id}`)}
                >
                    <div className="flex items-center gap-4 min-w-0">
                        <div className={cn("w-2 h-2 rounded-full shrink-0", item.status === 'completed' ? "bg-green-500" : "bg-yellow-500 animate-pulse")} />
                        <div className="space-y-0.5 min-w-0">
                            <div className="text-sm font-semibold group-hover:text-primary transition-colors truncate">
                                {item.title || item.question || "Analysis Request"}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                {item.tickers && item.tickers[0] && (
                                    <>
                                        <span className="font-medium text-foreground">{item.tickers[0]}</span>
                                        <span>•</span>
                                    </>
                                )}
                                <span>{new Date(item.created_at).toLocaleDateString()}</span>
                                {item.models_used && item.models_used[0] && (
                                    <span className="px-1.5 py-0.5 rounded-sm bg-muted text-[10px] font-bold text-muted-foreground uppercase tracking-wider hidden sm:inline-block">
                                        {item.models_used[0]}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <ArrowRight size={14} />
                    </Button>
                </div>
            ))}
            {recentResearch.length === 0 && (
                <div className="py-8 text-center text-muted-foreground text-sm">
                    No recent analysis found.
                </div>
            )}
        </div>
    );
}

function AiNewsWidget() {
    const navigate = useNavigate();
    const { data: research } = useTickerResearch();
    const typedResearch = research as ResearchNote[] | undefined;
    const { mutate: triggerResearch, isPending } = useTriggerResearch();

    // Find a recent "News Digest" or similar generic report
    // Check purely against created_at string if possible or move date calc outside render if strictly needed,
    // but typically filter inside useMemo or safe block is fine.
    // The lint error `Cannot call impure function...` suggests Date.now() should not be in render.
    // We can use a stable reference time or just suppress if we accept minor hydration mismatch risk, 
    // but better to just use a fixed "yesterday" ref or similar.
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    const oneDayAgoMs = oneDayAgo.getTime();

    const newsDigest = typedResearch?.find((r) =>
        (r.title?.includes('News') || r.question?.includes('news')) &&
        new Date(r.created_at).getTime() > oneDayAgoMs
    );

    const handleGenerate = () => {
        triggerResearch({
            symbol: 'MARKET_NEWS', // Special symbol or generic
            question: "Generate a daily news digest for the top active stocks in the market. Focus on high impact events.",
            quality: 'deep',
            provider: 'gemini'
        });
    };

    if (newsDigest) {
        return (
            <div className="p-4 bg-muted/30 rounded-lg border border-border">
                <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <h3 className="font-semibold text-sm">Today's AI News Digest</h3>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-3 mb-3">
                    {newsDigest.title || "Daily market analysis and news summary."}
                </p>
                <Button variant="outline" size="sm" className="w-full" onClick={() => navigate(`/research/${newsDigest.id}`)}>
                    Read Full Digest
                </Button>
            </div>
        );
    }

    return (
        <div className="p-4 bg-muted/30 rounded-lg border border-border text-center">
            <h3 className="font-semibold text-sm mb-1">AI News Digest</h3>
            <p className="text-xs text-muted-foreground mb-3">No digest generated for today.</p>
            <Button
                size="sm"
                className="w-full gap-2"
                onClick={handleGenerate}
                disabled={isPending}
            >
                {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                Generate Digest
            </Button>
        </div>
    );
}




function mapSnapshotToTickerData(item: StockSnapshot): TickerData {
    // Determine AI Rating from core logic similar to WatchlistTable if not explicit
    let derivedAiRating = item.aiAnalysis?.sentiment || '-';
    if (derivedAiRating === '-' && item.aiAnalysis) {
        const { overall_score, upside_percent } = item.aiAnalysis;
        if (upside_percent > 10 && overall_score <= 7) derivedAiRating = 'Buy';
        else if (upside_percent > 20 && overall_score <= 6) derivedAiRating = 'Strong Buy';
        else if (upside_percent < 0 || overall_score >= 8) derivedAiRating = 'Sell';
        else derivedAiRating = 'Hold';
    }

    return {
        symbol: item.ticker.symbol,
        company: item.ticker.name,
        logo: item.ticker.logo_url,
        sector: item.ticker.sector || 'Unknown',
        price: Number(item.latestPrice?.close ?? 0),
        change: Number(item.latestPrice?.change ?? 0),
        pe: Number(item.fundamentals.pe_ratio ?? 0) || null,
        marketCap: Number(item.fundamentals.market_cap ?? 0) || null,
        potentialUpside: Number(item.aiAnalysis?.upside_percent ?? 0),
        riskScore: Number(item.aiAnalysis?.overall_score ?? 0),
        rating: item.fundamentals.consensus_rating as string || '-',
        aiRating: derivedAiRating,
        analystCount: item.counts?.analysts || 0,
        newsCount: item.counts?.news || 0,
        researchCount: item.counts?.research || 0,
        socialCount: item.counts?.social || 0,
        itemId: item.ticker.id
    };
}

export function Dashboard() {
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');

    const { data: stats } = useQuery({
        queryKey: ['dashboard-stats'],
        queryFn: async () => {
            const [tickers, strongBuy, research] = await Promise.all([
                api.get('/tickers/count').catch(() => ({ data: { count: 0 } })),
                api.get('/stats/strong-buy').catch(() => ({ data: { count: 0 } })),
                api.get('/research', { params: { limit: 1 } }).catch(() => ({ data: { total: 0 } }))
            ]);
            return {
                tickers: tickers.data.count,
                strongBuy: strongBuy.data.count,
                research: research.data.total || 0
            };
        }
    });

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            navigate(`/ticker/${searchQuery.toUpperCase()}`);
        }
    };

    return (
        <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30">
            <Header />

            <main className="container mx-auto px-4 py-8 max-w-[90rem] space-y-8 animate-in fade-in duration-500">

                {/* --- HEADER / HERO SECTION --- */}
                <section className="style-hero rgb-border relative overflow-hidden rounded-lg border border-border bg-card p-8">
                    <div
                        className="style-hero-grid absolute inset-0 pointer-events-none"
                        aria-hidden
                    />
                    <div className="absolute inset-x-8 bottom-6 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-70" />

                    <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between z-10">
                        <div className="space-y-4 max-w-3xl">
                            <div className="flex items-center gap-3">
                                <Brain className="w-10 h-10 text-primary" />
                                <div>
                                    <h1 className="text-3xl font-semibold tracking-tight">Market Intelligence</h1>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        Real-time neural analysis of financial markets, news, and risks.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <form onSubmit={handleSearch} className="relative w-full max-w-sm">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                                <Input
                                    className="pl-9 h-10 text-sm bg-background/50 border-input shadow-sm focus-visible:ring-primary"
                                    placeholder="Search ticker (e.g. NVDA)..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden sm:flex pointer-events-none">
                                    <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                                        <span className="text-xs">⌘</span>K
                                    </kbd>
                                </div>
                            </div>
                        </form>
                    </div>

                    <div className="relative mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <StatPill
                            icon={Activity}
                            label="Tickers Tracked"
                            value={stats?.tickers ? String(stats.tickers) : "..."}
                            tone="primary"
                        />
                        <StatPill
                            icon={Zap}
                            label="Strong Buy"
                            value={stats?.strongBuy ? String(stats.strongBuy) : "..."}
                            tone="emerald"
                        />
                        <StatPill
                            icon={Brain}
                            label="AI Reports"
                            value={stats?.research !== undefined ? String(stats.research) : "..."}
                            tone="muted"
                        />
                        <StatPill
                            icon={Newspaper}
                            label="News Sentiment"
                            value="Bullish"
                            tone="accent"
                        />
                    </div>
                </section>

                {/* --- MAIN CONTENT GRID --- */}
                {/* --- MAIN CONTENT GRID --- */}

                {/* Top Opportunities Section */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-emerald-500" />
                            Top Opportunities
                        </h2>
                        <Button variant="ghost" size="sm" onClick={() => navigate('/analyzer')}>
                            View Analyzer <ArrowRight className="ml-1 w-4 h-4" />
                        </Button>
                    </div>

                    {/* Using Analyzer Hook directly for top items */}
                    <TopOpportunitiesSection />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* LEFT COLUMN: Research & News */}
                    <div className="lg:col-span-2 space-y-6">
                        <Card className="h-full flex flex-col overflow-hidden">
                            <CardHeader className="py-4 border-b border-border bg-muted/10">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="font-bold text-sm flex items-center gap-2">
                                        <Brain className="w-4 h-4 text-primary" />
                                        Latest Research Notes
                                    </CardTitle>
                                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => navigate('/research')}>
                                        View All <ArrowRight size={12} />
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                <ResearchFeedWidget />
                            </CardContent>
                        </Card>
                    </div>

                    {/* RIGHT COLUMN: AI News & Quick Actions */}
                    <div className="space-y-6">
                        <Card className="overflow-hidden border-primary/20 shadow-md">
                            <CardHeader className="py-4 border-b border-border bg-gradient-to-r from-emerald-500/10 to-transparent">
                                <CardTitle className="font-bold text-sm flex items-center gap-2">
                                    <Newspaper className="w-4 h-4 text-emerald-500" />
                                    Smart News
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 space-y-4">
                                <AiNewsWidget />
                            </CardContent>
                        </Card>
                    </div>
                </div>

            </main>
        </div>
    );
}

function TopOpportunitiesSection() {
    const { data, isLoading } = useStockAnalyzer({
        page: 1,
        limit: 4,
        sortBy: 'upside_percent',
        sortDir: 'DESC',
        search: ''
    });

    const items = data?.items || [];
    const tickerData: TickerData[] = items.map(mapSnapshotToTickerData);

    return (
        <WatchlistGridView
            data={tickerData}
            isLoading={isLoading}
        // onRemove undefined implies read-only/no-delete
        />
    );
}
