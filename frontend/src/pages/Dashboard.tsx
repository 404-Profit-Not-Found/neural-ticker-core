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
    ArrowRight
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { cn, api } from '../lib/api';
// Removed: useTickerResearch (ResearchFeedWidget removed)
import { useStockAnalyzer, type StockSnapshot } from '../hooks/useStockAnalyzer';
import { WatchlistGridView } from '../components/dashboard/WatchlistGridView';
import { NewsFeed } from '../components/dashboard/NewsFeed';
import type { TickerData } from '../components/dashboard/WatchlistTableView';

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





function mapSnapshotToTickerData(item: StockSnapshot): TickerData {
    // Determine AI Rating from core logic (Strictly calculated, ignoring verbose sentiment string)
    let derivedAiRating = '-';
    if (item.aiAnalysis) {
        const { overall_score, upside_percent } = item.aiAnalysis;
        // Logic matching WatchlistTable
        if (upside_percent > 10 && overall_score <= 7) derivedAiRating = 'Buy';
        if (upside_percent > 20 && overall_score <= 6) derivedAiRating = 'Strong Buy';
        if (upside_percent < 0 || overall_score >= 8) derivedAiRating = 'Sell';
        if (derivedAiRating === '-') derivedAiRating = 'Hold';
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
                                    <h1 className="text-3xl font-semibold tracking-tight">AI assisted stock analyzer</h1>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        Stocks, risks, news, chat ...
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

                <div className="h-[950px]">
                    <NewsFeed />
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
