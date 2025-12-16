import {
  useState,
  useRef,
  useEffect,
  type KeyboardEvent,
  type ComponentType,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Search,
  Brain,
  Zap,
  TrendingUp,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { cn, api } from '../lib/api';
// Removed: useTickerResearch (ResearchFeedWidget removed)
import {
  useStockAnalyzer,
  type StockSnapshot,
  type AnalyzerParams,
} from '../hooks/useStockAnalyzer';
import { TickerCarousel } from '../components/dashboard/TickerCarousel';
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
  tone = 'muted',
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
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.2) 1px, transparent 1px)',
          backgroundSize: '18px 18px',
        }}
        aria-hidden
      />
      <div className="relative z-10 flex items-start justify-between gap-2 sm:gap-3">
        <div className="space-y-0.5 sm:space-y-1">
          <p className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {label}
          </p>
          <p className="text-lg sm:text-2xl font-bold text-foreground leading-tight">
            {value}
          </p>
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
    if (upside_percent > 20 && overall_score <= 6)
      derivedAiRating = 'Strong Buy';
    if (upside_percent < 0 || overall_score >= 8) derivedAiRating = 'Sell';
    if (derivedAiRating === '-') derivedAiRating = 'Hold';
  }

  return {
    symbol: item.ticker.symbol,
    company: item.ticker.name,
    logo: item.ticker.logo_url,
    sector: item.ticker.industry || item.ticker.sector || (item.fundamentals?.sector as string) || 'Unknown',
    price: Number(item.latestPrice?.close ?? 0),
    change: Number(item.latestPrice?.change ?? 0),
    pe: Number(item.fundamentals.pe_ratio ?? 0) || null,
    marketCap: Number(item.fundamentals.market_cap ?? 0) || null,
    potentialUpside: Number(item.aiAnalysis?.upside_percent ?? 0),
    riskScore: Number(item.aiAnalysis?.overall_score ?? 0),
    rating: (item.fundamentals.consensus_rating as string) || '-',
    aiRating: derivedAiRating,
    analystCount: item.counts?.analysts || 0,
    newsCount: item.counts?.news || 0,
    researchCount: item.counts?.research || 0,
    socialCount: item.counts?.social || 0,
    itemId: item.ticker.id,
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
      const [tickers, strongBuy, sell, research] = await Promise.all([
        api.get('/tickers/count').catch(() => ({ data: { count: 0 } })),
        api.get('/stats/strong-buy').catch(() => ({ data: { count: 0 } })),
        api.get('/stats/sell').catch(() => ({ data: { count: 0 } })),
        api
          .get('/research', { params: { since: 24, limit: 1 } })
          .catch(() => ({ data: { total: 0 } })),
      ]);
      return {
        tickers: tickers.data.count,
        strongBuy: strongBuy.data.count,
        sell: sell.data.count,
        research: research.data.total || 0,
      };
    },
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
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
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
        prev < results.length - 1 ? prev + 1 : prev,
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
                  <h1 className="text-3xl font-semibold tracking-tight">
                    AI assisted stock analyzer
                  </h1>
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
                  {isLoading && (
                    <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                  )}
                  <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                    <span className="text-xs">⌘</span>K
                  </kbd>
                </div>
              </div>

              {showResults && results.length > 0 && (
                <div
                  className="absolute top-full mt-2 w-full border border-border rounded-lg shadow-xl z-[100] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                  style={{ backgroundColor: '#09090b' }}
                >
                  <div className="py-1 max-h-[300px] overflow-y-auto">
                    {results.map((ticker, index) => (
                      <button
                        key={ticker.symbol}
                        className={cn(
                          'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                          index === highlightedIndex
                            ? 'bg-primary/10 text-primary'
                            : 'hover:bg-muted/50 text-foreground',
                        )}
                        onClick={() => selectTicker(ticker)}
                        onMouseEnter={() => setHighlightedIndex(index)}
                      >
                        <TickerLogo
                          symbol={ticker.symbol}
                          url={ticker.logo_url}
                          className="w-8 h-8 rounded-full border border-border flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sm">
                              {ticker.symbol}
                            </span>
                            <span className="text-[10px] text-muted-foreground border border-border px-1.5 rounded bg-background/50">
                              {ticker.exchange}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate opacity-80">
                            {ticker.name}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="relative mt-6 grid grid-cols-2 gap-2 sm:gap-4 sm:mt-8 lg:grid-cols-4">
            <div
              className="cursor-pointer transition-transform hover:scale-[1.02]"
              onClick={() => navigate('/analyzer')}
            >
              <StatPill
                icon={Activity}
                label="Tickers Tracked"
                value={stats?.tickers ? String(stats.tickers) : '...'}
                tone="primary"
              />
            </div>
            
            <div
              className="cursor-pointer transition-transform hover:scale-[1.02]"
              onClick={() => navigate('/analyzer?filter=strong_buy')}
            >
              <StatPill
                icon={Zap}
                label="Strong Buy"
                value={stats?.strongBuy ? String(stats.strongBuy) : '...'}
                tone="emerald"
              />
            </div>
            
            <div
              className="cursor-pointer transition-transform hover:scale-[1.02]"
              onClick={() => navigate('/research?filter=recent')}
            >
              <StatPill
                icon={Brain}
                label="AI Reports (24h)"
                value={
                  stats?.research !== undefined ? String(stats.research) : '...'
                }
                tone="muted"
              />
            </div>
            
            <div
              className="cursor-pointer transition-transform hover:scale-[1.02]"
              onClick={() => navigate('/analyzer?filter=sell')}
            >
              <StatPill
                icon={TrendingUp} // Or TrendingDown? Let's stick to user request style if any, but TrendingUp/Down is fine. TrendingUp was used in News Sentiment.
                // Wait, Sell usually implies Down. Let's use TrendingDown or maintain consistency.
                // Re-reading imports: TrendingUp is imported. TrendingDown is NOT imported in Dashboard.tsx currently.
                // I will use Activity/Zap/Brain/Newspaper were the previous.
                // I'll stick to icons I have or use TrendingDown if I add it.
                // Dashboard.tsx has: Activity, Search, Brain, Zap, TrendingUp, Newspaper, ArrowRight, Loader2.
                // I'll use TrendingUp for now as a place holder or just import TrendingDown?
                // Actually, let's just use TrendingUp rotated or change to something present.
                // Or I can add TrendingDown to imports. 
                // Let's use `TrendingUp` for now to avoid import errors (I can't see all imports easily but I saw the import list in the view_file).
                // imports: Activity, Search, Brain, Zap, TrendingUp, Newspaper, ArrowRight, Loader2.
                // I'll use TrendingUp but maybe rotate it? No, let's just use it.
                // Actually, the user asked to change "News Sentiment" which used Newspaper.
                // Let's use TrendingUp but the value is "Sell".
                // I will use `TrendingUp` but label "Sell". Wait, Sell usually means stock goes down.
                // I'll just check if I can import TrendingDown. It is a lucide icon.
                // Let's safe bet: use TrendingUp (maybe it means Volatility/Action).
                label="Sell"
                value={stats?.sell ? String(stats.sell) : '...'}
                tone="rose"
              />
            </div>
          </div>
        </section>

        {/* --- MAIN CONTENT GRID --- */}
        {/* --- MAIN CONTENT GRID --- */}

        {/* Top Opportunities Section */}
        <div className="space-y-4">
           {/* Section is now self-contained in TopOpportunitiesSection */}
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
  const [category, setCategory] = useState<'yolo' | 'conservative' | 'shorts'>('yolo');
  const navigate = useNavigate();

  // Determine params based on category
  const analyzerParams: AnalyzerParams = {
      page: 1,
      limit: 4, // Fetch max 4 for static grid
      search: '',
      sortBy: 'upside_percent',
      sortDir: 'DESC',
  };

  if (category === 'yolo') {
      // Highest Upside
      analyzerParams.sortBy = 'upside_percent';
      analyzerParams.sortDir = 'DESC';
  } else if (category === 'conservative') {
      // Big Market Cap
      analyzerParams.sortBy = 'market_cap';
      analyzerParams.sortDir = 'DESC';
  } else if (category === 'shorts') {
      // Sell Ratings
      analyzerParams.aiRating = ['Sell'];
      analyzerParams.sortBy = 'upside_percent'; // Usually low/negative upside
      analyzerParams.sortDir = 'ASC';
  }

  const { data, isLoading } = useStockAnalyzer(analyzerParams);
  const items = data?.items || [];
  const tickerData: TickerData[] = items.map(mapSnapshotToTickerData);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <TrendingUp className={cn("w-5 h-5", category === 'shorts' ? "text-red-500" : "text-emerald-500")} />
              {category === 'yolo' ? 'Top Opportunities' : category === 'conservative' ? 'Conservative Picks' : 'Short Candidates'}
            </h2>
            
            {/* Category Tabs */}
            <div className="flex items-center bg-muted/50 p-1 rounded-lg border border-border/50">
                <button
                    onClick={() => setCategory('yolo')}
                    className={cn(
                        "px-3 py-1 text-xs font-medium rounded-md transition-all",
                        category === 'yolo' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    🚀 YOLO
                </button>
                <button
                    onClick={() => setCategory('conservative')}
                    className={cn(
                        "px-3 py-1 text-xs font-medium rounded-md transition-all",
                        category === 'conservative' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    🛡️ Classic
                </button>
                <button
                    onClick={() => setCategory('shorts')}
                    className={cn(
                        "px-3 py-1 text-xs font-medium rounded-md transition-all",
                        category === 'shorts' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    🐻 Shorts
                </button>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/analyzer')}
            className="hidden sm:flex"
          >
            View Analyzer <ArrowRight className="ml-1 w-4 h-4" />
          </Button>
      </div>

      <TickerCarousel 
        data={tickerData}
        isLoading={isLoading}
      />
    </div>
  );
}
