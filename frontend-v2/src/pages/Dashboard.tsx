import {
  useEffect,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  Zap,
  ArrowRight,
  TrendingDown,
  PieChart,
  Brain,
  Newspaper,
} from 'lucide-react';
import { SegmentedControl } from '../components/ui/segmented';
import { preloadRoute } from '../app/routes';
import { useCompactLayout } from '../hooks/useMediaQuery';
import { cn } from '../lib/api';
import { useCurrency } from '../context/CurrencyContext';
import {
  useStockAnalyzer,
  type AnalyzerParams,
} from '../hooks/useStockAnalyzer';
import {
  useRecentResearchCount,
  useSellCount,
  useStrongBuyCount,
  useTickerCount,
} from '../hooks/useDashboardData';
import {
  usePortfolioPositions,
  type PortfolioPositionSummary,
} from '../hooks/usePortfolio';
import { TickerCarousel } from '../components/dashboard/TickerCarousel';
import { StatPill } from '../components/dashboard/StatPill';
import { Skeleton } from '../components/ui/skeleton';
import { NewsFeed } from '../components/dashboard/NewsFeed';
import type { TickerData } from '../components/dashboard/WatchlistTableView';
import { MarketSessions } from '../components/dashboard/MarketSessions';
import { snapshotToTickerData } from '../lib/ticker-metrics';


// Calculate portfolio stats
function summarizePortfolio(positions: PortfolioPositionSummary[]) {
  let totalValue = 0;
  let totalCost = 0;
  (Array.isArray(positions) ? positions : []).forEach((p) => {
    totalValue += p.current_value || 0;
    totalCost += p.cost_basis || 0;
  });
  const totalGain = totalValue - totalCost;
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

  return {
    value: totalValue,
    gainPct: totalGainPct,
  };
}

// A real count (including 0) prints as a number; "not loaded yet" is a dash.
const count = (value: number | undefined): string =>
  typeof value === 'number' ? String(value) : '—';

export function Dashboard() {
  const { displayCurrency } = useCurrency();
  const compact = useCompactLayout();

  // One cached query per endpoint (shared with KPIGrid and the Portfolio page)
  // instead of one bundle: each pill renders from cache the moment the page
  // opens, refreshes on its own schedule, and keeps its last value if a
  // refresh fails. A field stays `undefined` until its first load.
  const money = (value: number, fractionDigits?: number): string =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: displayCurrency,
      ...(fractionDigits === undefined ? {} : { maximumFractionDigits: fractionDigits }),
    }).format(value);

  const tickersQuery = useTickerCount();
  const strongBuyQuery = useStrongBuyCount();
  const sellQuery = useSellCount();
  const portfolioQuery = usePortfolioPositions(displayCurrency, summarizePortfolio);
  const recentResearchQuery = useRecentResearchCount();
  const stats = {
    tickers: tickersQuery.data,
    strongBuy: strongBuyQuery.data,
    sell: sellQuery.data,
    portfolio: portfolioQuery.data,
    recentResearch: recentResearchQuery.data,
  };

  // Three different things, never shown as one another: still loading (a
  // placeholder), failed with nothing cached (a dash), and loaded (the figure
  // — which may honestly be zero).
  const portfolioLoading = portfolioQuery.isPending;
  const portfolioFailed = portfolioQuery.isError && !stats.portfolio;
  const hasPortfolio = !!stats.portfolio && stats.portfolio.value > 0;
  const portfolioValue = portfolioFailed ? '—' : hasPortfolio ? money(stats.portfolio!.value, 0) : money(0);
  const portfolioNote = portfolioFailed
    ? "Couldn't load your holdings"
    : hasPortfolio
      ? 'Holdings value · all-time return'
      : 'Add a position to start tracking';

  // Each tile is a real link: focusable, right-clickable, prefetched on intent.
  const tiles: Array<{ to: string; tile: React.ReactNode }> = [
    {
      to: '/portfolio',
      tile: (
        <StatPill
          icon={PieChart}
          label="Holdings"
          value={portfolioValue}
          loading={portfolioLoading}
          subValue={hasPortfolio ? (
            <span className={cn(
              "num text-xs font-semibold",
              stats.portfolio!.gainPct >= 0 ? "text-up" : "text-down"
            )}>
              {stats.portfolio!.gainPct >= 0 ? '+' : '−'}{Math.abs(stats.portfolio!.gainPct).toFixed(2)}%
            </span>
          ) : undefined}
          tone="accent"
        />
      ),
    },
    { to: '/analyzer?filter=strong_buy', tile: <StatPill icon={Zap} label="Strong buy" value={count(stats.strongBuy)} loading={strongBuyQuery.isPending} tone="emerald" /> },
    { to: '/analyzer?filter=sell', tile: <StatPill icon={TrendingDown} label="Sell" value={count(stats.sell)} loading={sellQuery.isPending} tone="rose" /> },
    { to: '/research?filter=recent', tile: <StatPill icon={Brain} label="AI reports" value={count(stats.recentResearch)} loading={recentResearchQuery.isPending} subValue={<span className="label-micro" title="In the last 24 hours">24h</span>} tone="muted" /> },
    { to: '/analyzer', tile: <StatPill icon={Activity} label="Tracked" value={count(stats.tickers)} loading={tickersQuery.isPending} tone="primary" /> },
    { to: '/news', tile: <StatPill icon={Newspaper} label="Market News" value="Latest Feed" tone="amber" /> },
  ];

  return (
    <div className="min-h-page bg-background text-foreground font-sans selection:bg-primary/30">

      <h1 className="sr-only">Dashboard</h1>
      <main className="container mx-auto max-w-[90rem] space-y-6 px-4 py-4 lg:space-y-8 lg:py-5 animate-in fade-in duration-300">

        {compact ? (
          // Phone / tablet: the portfolio figure in one tonal block, then four
          // equal tiles that span the same width. The first list still starts
          // within the first screen.
          <section aria-label="Overview" className="space-y-2">
            <Link
              to="/portfolio"
              onTouchStart={() => preloadRoute('/portfolio')}
              className="block rounded-lg bg-card px-4 pb-3.5 pt-4 transition-colors active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="label-micro">Holdings</span>
                <MarketSessions />
              </div>
              <div className="mt-2.5 flex h-8 items-baseline gap-2.5" aria-busy={portfolioLoading || undefined}>
                {portfolioLoading ? (
                  <Skeleton className="h-8 w-40" />
                ) : (
                  <span className="num text-[2rem] font-bold leading-none tracking-tight text-foreground">
                    {portfolioValue}
                  </span>
                )}
                {hasPortfolio && (
                  <span className={cn('num text-sm font-semibold', stats.portfolio!.gainPct >= 0 ? 'text-up' : 'text-down')}>
                    {stats.portfolio!.gainPct >= 0 ? '+' : '−'}{Math.abs(stats.portfolio!.gainPct).toFixed(2)}%
                  </span>
                )}
              </div>
              {/* Nothing is said about the portfolio until it has loaded. */}
              <p className="mt-1.5 h-4 text-xs text-muted-foreground">{portfolioLoading ? null : portfolioNote}</p>
            </Link>

            {/* Four tiles of their own, edge to edge with the block above. */}
            <ul className="grid grid-cols-4 gap-2">
              {[
                { to: '/analyzer?filter=strong_buy', label: 'Strong buy', icon: Zap, query: strongBuyQuery, tone: 'text-up' },
                { to: '/analyzer?filter=sell', label: 'Sell', icon: TrendingDown, query: sellQuery, tone: 'text-down' },
                { to: '/research?filter=recent', label: 'AI reports', icon: Brain, query: recentResearchQuery, tone: 'text-ai' },
                { to: '/analyzer', label: 'Tickers', icon: Activity, query: tickersQuery, tone: 'text-foreground' },
              ].map((item) => (
                <li key={item.label} className="min-w-0">
                  <Link
                    to={item.to}
                    onTouchStart={() => preloadRoute(item.to)}
                    aria-busy={item.query.isPending || undefined}
                    className="flex h-full min-h-[4.25rem] flex-col justify-between gap-2 rounded-lg bg-card px-3 py-2.5 transition-colors active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex items-center justify-between gap-1">
                      {item.query.isPending ? (
                        <Skeleton className="h-5 w-8" />
                      ) : (
                        <span className={cn('num text-xl font-bold leading-none', item.tone)}>{count(item.query.data)}</span>
                      )}
                      <item.icon size={14} className={cn('opacity-70', item.tone === 'text-foreground' ? 'text-muted-foreground' : item.tone)} aria-hidden />
                    </span>
                    <span className="truncate text-[11px] leading-none text-muted-foreground">{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          // Desktop: six headline tiles. Each is a real link: focusable,
          // right-clickable, prefetched on intent.
          <section aria-label="Overview">
            <ul className="grid grid-cols-6 gap-3">
              {tiles.map(({ to, tile }) => (
                <li key={to}>
                  <Link
                    to={to}
                    onMouseEnter={() => preloadRoute(to)}
                    className="block h-full rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    {tile}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <TopOpportunitiesSection />

        <NewsFeed tickerCount={stats?.tickers} />
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

  const analyzerParams: AnalyzerParams = {
    page: 1,
    limit: 6, // Fetch a small buffer to ensure 4 valid picks after filtering
    search: '',
    sortBy: 'upside_percent',
    sortDir: 'DESC',
  };

  if (category === 'yolo') {
    analyzerParams.sortBy = 'upside_percent';
    analyzerParams.sortDir = 'DESC';
    analyzerParams.aiRating = ['Speculative Buy', 'No Brainer', 'Strong Buy'];
  } else if (category === 'conservative') {
    analyzerParams.aiRating = ['Strong Buy', 'No Brainer'];
    analyzerParams.sortBy = 'ai_rating';
    analyzerParams.sortDir = 'DESC';
    analyzerParams.risk = ['Low', 'Very Low']; // Strict Low Risk
    analyzerParams.profitableOnly = true;      // Must be profitable
    analyzerParams.minMarketCap = 5000000000;  // > $5 Billion (Big Companies)
  } else if (category === 'shorts') {
    analyzerParams.aiRating = ['Sell'];
    analyzerParams.sortBy = 'upside_percent';
    analyzerParams.sortDir = 'ASC';
  }

  const { data, isLoading, isError, refetch } = useStockAnalyzer(analyzerParams);
  const items = data?.items || [];
  let tickerData: TickerData[] = items.map(snapshotToTickerData);

  if (category === 'conservative') {
    tickerData = tickerData.filter(t => ['Strong Buy', 'No Brainer'].includes(t.aiRating));
  } else if (category === 'shorts') {
    tickerData = tickerData.filter(t => t.aiRating === 'Sell');
  } else if (category === 'yolo') {
    tickerData = tickerData.filter(t => ['Speculative Buy', 'No Brainer', 'Strong Buy'].includes(t.aiRating));
  }

  const title =
    category === 'yolo' ? 'Top Opportunities' : category === 'conservative' ? 'Conservative Picks' : 'Short Candidates';

  const strategy = (
    <SegmentedControl
      label="Opportunity strategy"
      size="sm"
      value={category}
      onChange={setCategory}
      options={[
        { value: 'yolo', label: 'YOLO' },
        { value: 'conservative', label: 'Classic' },
        { value: 'shorts', label: 'Shorts' },
      ]}
    />
  );

  const viewAll = (
    <Link
      to="/analyzer"
      onMouseEnter={() => preloadRoute('/analyzer')}
      onTouchStart={() => preloadRoute('/analyzer')}
      className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-foreground transition-colors hover:text-signal focus-visible:outline-none focus-visible:text-signal lg:min-h-9 lg:text-xs"
    >
      View all tickers <ArrowRight className="h-3.5 w-3.5" aria-hidden />
    </Link>
  );

  return (
    // A plain section on the canvas: the rows / cards are the only surfaces.
    <section aria-label={title}>
      {/* On the narrowest phones the control drops under the title rather
          than cutting it off. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="text-base font-semibold tracking-tight text-foreground lg:text-lg">{title}</h2>
        {strategy}
      </div>

      <TickerCarousel
        data={tickerData.slice(0, 4)}
        isLoading={isLoading}
        // A failed load with nothing to show is an error, not "no matches".
        error={isError && !data}
        onRetry={() => refetch()}
      />

      <div className="mt-1 flex items-center justify-end gap-3 lg:mt-2 lg:justify-between">
        <span className="hidden text-xs text-muted-foreground lg:inline">
          Ranked by AI rating, risk and upside. Not investment advice.
        </span>
        {viewAll}
      </div>
    </section>
  );
}
