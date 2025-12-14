import { useState, useRef, useEffect, type KeyboardEvent, type ComponentType } from 'react';
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
import { Input } from '../components/ui/input';
import { cn, api } from '../lib/api';
// Removed: useTickerResearch (ResearchFeedWidget removed)
import { useStockAnalyzer, type StockSnapshot } from '../hooks/useStockAnalyzer';
import { WatchlistGridView } from '../components/dashboard/WatchlistGridView';
import { NewsFeed } from '../components/dashboard/NewsFeed';
import { TickerLogo } from '../components/dashboard/TickerLogo';
import type { TickerData } from '../components/dashboard/WatchlistTableView';

interface TickerResult {
    symbol: string;
    name: string;
    exchange: string;
    logo_url?: string;
}

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
                'style-kpi relative overflow-hidden rounded-md border px-3 py-2 sm:px-4 sm:py-3',
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
            <div className="relative z-10 flex items-start justify-between gap-2 sm:gap-3">
                <div className="space-y-0.5 sm:space-y-1">
                    <p className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
                    <p className="text-lg sm:text-2xl font-bold text-foreground leading-tight">{value}</p>
                </div>
                <Icon className={cn('w-4 h-4 sm:w-5 sm:h-5', iconColors[tone])} />
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
    const [results, setResults] = useState<TickerResult[]>([]);
    const [showResults, setShowResults] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const searchRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const { data: stats } = useQuery({
        queryKey: ['dashboard-stats'],
        queryFn: async () => {
            // ... logic
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

    // CMD+K Shortcut
    useEffect(() => {
        const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                inputRef.current?.focus();
            }
        };
        document.addEventListener('keydown', handleGlobalKeyDown);
        return () => document.removeEventListener('keydown', handleGlobalKeyDown);
    }, []);

    // Click Outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setShowResults(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Debounced Search
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (searchQuery.trim().length === 0) {
                setResults([]);
                setShowResults(false);
                return;
            }

            setIsLoading(true);
            try {
                const { data } = await api.get<TickerResult[]>('/tickers', {
                    params: { search: searchQuery },
                });
                setResults(data);
                setShowResults(true);
                setHighlightedIndex(-1);
            } catch (error) {
                console.error('Search failed', error);
            } finally {
                setIsLoading(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [searchQuery]);

    const selectTicker = (ticker: TickerResult) => {
        navigate(`/ticker/${ticker.symbol}`);
        setSearchQuery('');
        setShowResults(false);
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex((prev) =>
                prev < results.length - 1 ? prev + 1 : prev
            );
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlightedIndex >= 0 && results[highlightedIndex]) {
                selectTicker(results[highlightedIndex]);
            } else if (searchQuery.trim()) {
                navigate(`/ticker/${searchQuery.toUpperCase()}`);
            }
        } else if (e.key === 'Escape') {
            setShowResults(false);
            (e.target as HTMLInputElement).blur();
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

                    <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between z-50">
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

                        <div ref={searchRef} className="relative w-full max-w-sm">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                                <Input
                                    className="pl-9 h-10 text-sm bg-background/50 border-input shadow-sm focus-visible:ring-primary"
                                    placeholder="Search ticker (e.g. NVDA)..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    onFocus={() => {
                                        if (results.length > 0) setShowResults(true);
                                    }}
                                />
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden sm:flex pointer-events-none items-center gap-2">
                                    {isLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                                    <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                                        <span className="text-xs">⌘</span>K
                                    </kbd>
                                </div>
                            </div>

                            {showResults && results.length > 0 && (
                                <div className="absolute top-full mt-2 w-full border border-border rounded-lg shadow-xl z-[100] overflow-hidden animate-in fade-in zoom-in-95 duration-200" style={{ backgroundColor: '#09090b' }}>
                                    <div className="py-1 max-h-[300px] overflow-y-auto">
                                        {results.map((ticker, index) => (
                                            <button
                                                key={ticker.symbol}
                                                className={cn(
                                                    "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
                                                    index === highlightedIndex ? "bg-primary/10 text-primary" : "hover:bg-muted/50 text-foreground"
                                                )}
                                                onClick={() => selectTicker(ticker)}
                                                onMouseEnter={() => setHighlightedIndex(index)}
                                            >
                                                <TickerLogo symbol={ticker.symbol} url={ticker.logo_url} className="w-8 h-8 rounded-full border border-border flex-shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-bold text-sm">{ticker.symbol}</span>
                                                        <span className="text-[10px] text-muted-foreground border border-border px-1.5 rounded bg-background/50">{ticker.exchange}</span>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground truncate opacity-80">{ticker.name}</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="relative mt-6 grid grid-cols-2 gap-2 sm:gap-4 sm:mt-8 lg:grid-cols-4">
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
