import {
  useState,
  type ComponentType,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Brain,
  Zap,
  TrendingUp,
  ArrowRight,
  TrendingDown,
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/button';
import { cn, api } from '../lib/api';
import {
  useStockAnalyzer,
  type StockSnapshot,
  type AnalyzerParams,
} from '../hooks/useStockAnalyzer';
import { TickerCarousel } from '../components/dashboard/TickerCarousel';
import { NewsFeed } from '../components/dashboard/NewsFeed';
import type { TickerData } from '../components/dashboard/WatchlistTableView';
import { calculateAiRating, calculateUpside } from '../lib/rating-utils';

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
  let derivedAiRating = '-';
  const riskRaw = item.aiAnalysis?.financial_risk;
  const risk = typeof riskRaw === 'number' ? riskRaw : Number(riskRaw || 0);

  const currentPrice = Number(item.latestPrice?.close ?? 0);
  let potentialUpside: number | null = null;
  let potentialDownside: number | null = null;

  if (item.aiAnalysis) {
    const { base_price, overall_score, upside_percent: fallbackUpside } = item.aiAnalysis;
    potentialUpside = calculateUpside(currentPrice, base_price, fallbackUpside);
    const { rating } = calculateAiRating(risk, potentialUpside, overall_score);
    derivedAiRating = rating;
  }

  const bearPrice = item.aiAnalysis?.bear_price;
  if (typeof bearPrice === 'number' && currentPrice > 0) {
    potentialDownside = ((bearPrice - currentPrice) / currentPrice) * 100;
  } else if (risk >= 8) {
    potentialDownside = -100;
  } else if (risk > 0) {
    potentialDownside = -(risk * 2.5);
  }

  return {
    symbol: item.ticker.symbol,
    company: item.ticker.name,
    logo: item.ticker.logo_url,
    sector:
      item.ticker.industry ||
      item.ticker.sector ||
      (item.fundamentals?.sector as string) ||
      'Unknown',
    price: currentPrice,
    change: Number(item.latestPrice?.change ?? 0),
    pe: Number(item.fundamentals?.pe_ratio ?? 0) || null,
    marketCap: Number(item.fundamentals?.market_cap ?? 0) || null,
    potentialUpside,
    potentialDownside,
    riskScore: risk,
    rating: (item.fundamentals?.consensus_rating as string) || '-',
    aiRating: derivedAiRating,
    analystCount: item.counts?.analysts || 0,
    newsCount: item.counts?.news || 0,
    researchCount: item.counts?.research || 0,
    socialCount: item.counts?.social || 0,
    overallScore: item.aiAnalysis?.overall_score ?? null,
    itemId: item.ticker.id,
  };
}

export function Dashboard() {
  const navigate = useNavigate();

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
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

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30">
      <Header />

      <main className="container mx-auto px-4 py-8 max-w-[90rem] space-y-8 animate-in fade-in duration-500">
        <section className="style-hero rgb-border relative overflow-hidden rounded-lg border border-border bg-card p-8">
          <div className="style-hero-grid absolute inset-0 pointer-events-none" aria-hidden />
          <div className="absolute inset-x-8 bottom-6 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-70" />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between z-30">
            <div className="space-y-4 max-w-3xl">
              <div className="flex items-center gap-3">
                <Brain className="w-10 h-10 text-primary" />
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight">AI assisted stock analyzer</h1>
                  <p className="text-sm text-muted-foreground mt-1">Stocks, risks, news, chat ...</p>
                </div>
              </div>
            </div>
          </div>

          <div className="relative mt-6 grid grid-cols-2 gap-2 sm:gap-4 sm:mt-8 lg:grid-cols-4">
            <div className="cursor-pointer transition-transform hover:scale-[1.02]" onClick={() => navigate('/analyzer')}>
              <StatPill icon={Activity} label="Tickers Tracked" value={stats?.tickers ? String(stats.tickers) : '...'} tone="primary" />
            </div>
            <div className="cursor-pointer transition-transform hover:scale-[1.02]" onClick={() => navigate('/analyzer?filter=strong_buy')}>
              <StatPill icon={Zap} label="Strong Buy" value={stats?.strongBuy ? String(stats.strongBuy) : '...'} tone="emerald" />
            </div>
            <div className="cursor-pointer transition-transform hover:scale-[1.02]" onClick={() => navigate('/research?filter=recent')}>
              <StatPill icon={Brain} label="AI Reports (24h)" value={stats?.research !== undefined ? String(stats.research) : '...'} tone="muted" />
            </div>
            <div className="cursor-pointer transition-transform hover:scale-[1.02]" onClick={() => navigate('/analyzer?filter=sell')}>
              <StatPill icon={TrendingDown} label="Sell" value={stats?.sell ? String(stats.sell) : '...'} tone="rose" />
            </div>
          </div>
        </section>

        <div className="space-y-4">
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

  const analyzerParams: AnalyzerParams = {
    page: 1,
    limit: 4,
    search: '',
    sortBy: 'upside_percent',
    sortDir: 'DESC',
  };

  if (category === 'yolo') {
    analyzerParams.sortBy = 'upside_percent';
    analyzerParams.sortDir = 'DESC';
  } else if (category === 'conservative') {
    analyzerParams.aiRating = ['Strong Buy', 'Buy'];
    analyzerParams.sortBy = 'market_cap';
    analyzerParams.sortDir = 'DESC';
  } else if (category === 'shorts') {
    analyzerParams.aiRating = ['Sell'];
    analyzerParams.sortBy = 'upside_percent';
    analyzerParams.sortDir = 'ASC';
  }

  const { data, isLoading } = useStockAnalyzer(analyzerParams);
  const items = data?.items || [];
  let tickerData: TickerData[] = items.map(mapSnapshotToTickerData);

  if (category === 'conservative') {
    tickerData = tickerData.filter(t => ['Strong Buy', 'Buy'].includes(t.aiRating));
  } else if (category === 'shorts') {
    tickerData = tickerData.filter(t => t.aiRating === 'Sell');
  } else if (category === 'yolo') {
    tickerData = tickerData.filter(t => ['Strong Buy', 'Buy', 'Speculative Buy'].includes(t.aiRating));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <TrendingUp className={cn("w-5 h-5", category === 'shorts' ? "text-red-500" : "text-emerald-500")} />
            {category === 'yolo' ? 'Top Opportunities' : category === 'conservative' ? 'Conservative Picks' : 'Short Candidates'}
          </h2>
          <div className="flex items-center bg-muted/50 p-1 rounded-lg border border-border/50">
            {(['yolo', 'conservative', 'shorts'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-md transition-all",
                  category === cat ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {cat === 'yolo' ? '🚀 YOLO' : cat === 'conservative' ? '🛡️ Classic' : '🐻 Shorts'}
              </button>
            ))}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/analyzer')} className="hidden sm:flex">
          View Analyzer <ArrowRight className="ml-1 w-4 h-4" />
        </Button>
      </div>

      <TickerCarousel data={tickerData} isLoading={isLoading} />
    </div>
  );
}
