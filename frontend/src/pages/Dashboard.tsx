import {
  useEffect,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Zap,
  TrendingUp,
  ArrowRight,
  TrendingDown,
  PieChart,
  Brain,
  Newspaper,
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
import { StatPill } from '../components/dashboard/StatPill';
import { NewsFeed } from '../components/dashboard/NewsFeed';
import type { TickerData } from '../components/dashboard/WatchlistTableView';
import { MarketStatusBar } from '../components/dashboard/MarketStatusBar';
import { calculateAiRating, calculateUpside } from '../lib/rating-utils';


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
    fiftyTwoWeekHigh: Number(item.fundamentals?.fifty_two_week_high ?? 0) || null,
    fiftyTwoWeekLow: Number(item.fundamentals?.fifty_two_week_low ?? 0) || null,
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
    sparkline: item.sparkline,
  };
}

export function Dashboard() {
  const navigate = useNavigate();

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const [tickers, strongBuy, sell, positions, recentResearch] = await Promise.all([
        api.get('/tickers/count').catch(() => ({ data: { count: 0 } })),
        api.get('/stats/strong-buy').catch(() => ({ data: { count: 0 } })),
        api.get('/stats/sell').catch(() => ({ data: { count: 0 } })),
        api.get('/portfolio/positions').catch(() => ({ data: [] })),
        api.get('/research', { params: { since: 24, limit: 1 } }).catch(() => ({ data: { total: 0 } })),
      ]);

      // Calculate portfolio stats
      let totalValue = 0;
      let totalCost = 0;
      const posData = (positions.data || []) as Array<{ current_value?: number; cost_basis?: number }>;
      posData.forEach((p) => {
        totalValue += p.current_value || 0;
        totalCost += p.cost_basis || 0;
      });
      const totalGain = totalValue - totalCost;
      const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

      return {
        tickers: tickers.data.count,
        strongBuy: strongBuy.data.count,
        sell: sell.data.count,
        portfolio: {
          value: totalValue,
          gainPct: totalGainPct,
        },
        recentResearch: recentResearch.data.total || 0,
      };
    },
  });

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30">
      <Header />

      <main className="container mx-auto px-4 py-8 max-w-[90rem] space-y-8 animate-in fade-in duration-500">
        {/* Market Status and Stats */}
        <section className="space-y-4">
          {/* Market Status Buttons */}
          <div className="flex justify-center sm:justify-end">
            <MarketStatusBar />
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-6">
            {/* 1. My Portfolio (always first) */}
            <div className="cursor-pointer transition-transform hover:scale-[1.02] h-full" onClick={() => navigate('/portfolio')}>
              <StatPill
                icon={PieChart}
                label="My Portfolio"
                value={stats?.portfolio && stats.portfolio.value > 0
                  ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(stats.portfolio.value)
                  : '$0.00'}
                subValue={stats?.portfolio && stats.portfolio.value > 0 ? (
                  <span className={cn(
                    "text-[10px] sm:text-xs font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5",
                    stats.portfolio.gainPct >= 0 ? "text-emerald-500 bg-emerald-500/10" : "text-rose-500 bg-rose-500/10"
                  )}>
                    {stats.portfolio.gainPct >= 0 ? '+' : ''}{stats.portfolio.gainPct.toFixed(2)}%
                  </span>
                ) : undefined}
                tone="accent"
              />
            </div>

            {/* 2. Strong Buy */}
            <div className="cursor-pointer transition-transform hover:scale-[1.02] h-full" onClick={() => navigate('/analyzer?filter=strong_buy')}>
              <StatPill icon={Zap} label="Strong Buy" value={stats?.strongBuy ? String(stats.strongBuy) : '...'} tone="emerald" />
            </div>

            {/* 3. Sell */}
            <div className="cursor-pointer transition-transform hover:scale-[1.02] h-full" onClick={() => navigate('/analyzer?filter=sell')}>
              <StatPill icon={TrendingDown} label="Sell" value={stats?.sell ? String(stats.sell) : '...'} tone="rose" />
            </div>

            {/* 4. Tickers Tracked */}
            <div className="cursor-pointer transition-transform hover:scale-[1.02] h-full" onClick={() => navigate('/analyzer')}>
              <StatPill icon={Activity} label="Tickers Tracked" value={stats?.tickers ? String(stats.tickers) : '...'} tone="primary" />
            </div>

            {/* 5. AI Reports (24h) */}
            <div className="cursor-pointer transition-transform hover:scale-[1.02] h-full" onClick={() => navigate('/research?filter=recent')}>
              <StatPill
                icon={Brain}
                label="AI Reports (24h)"
                value={stats?.recentResearch ? String(stats.recentResearch) : '0'}
                tone="muted"
              />
            </div>

            {/* 6. Market News */}
            <div className="cursor-pointer transition-transform hover:scale-[1.02] h-full" onClick={() => navigate('/news')}>
              <StatPill
                icon={Newspaper}
                label="Market News"
                value="Latest Feed"
                tone="accent"
              />
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

const STORAGE_KEY = 'NEURAL_TICKER_DASHBOARD_MODE';
type Category = 'yolo' | 'conservative' | 'shorts';

function TopOpportunitiesSection() {
  const [category, setCategory] = useState<Category>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'yolo' || saved === 'conservative' || saved === 'shorts') {
        return saved;
      }
    }
    return 'yolo';
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, category);
  }, [category]);

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
