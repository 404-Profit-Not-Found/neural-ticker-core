import { useState, useMemo, useEffect } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import { PortfolioTable } from '../components/portfolio/PortfolioTable';
import { PortfolioGridView } from '../components/portfolio/PortfolioGridView';
import { PortfolioStats } from '../components/portfolio/PortfolioStats';
import { AddPositionDialog } from '../components/portfolio/AddPositionDialog';
import { EditPositionDialog } from '../components/portfolio/EditPositionDialog';
import { SellPositionDialog } from '../components/portfolio/SellPositionDialog';
import { BuyAtMarketDialog } from '../components/portfolio/BuyAtMarketDialog';
import { PendingOrdersPanel } from '../components/portfolio/PendingOrdersPanel';
import { CashDialog, type CashBalance } from '../components/portfolio/CashDialog';
import { TradeHistoryDialog } from '../components/portfolio/TradeHistoryDialog';
import { PortfolioAiAnalyzer } from '../components/portfolio/PortfolioAiAnalyzer';
import {
  PortfolioCurrencySelector,
  PORTFOLIO_DISPLAY_NATIVE,
} from '../components/portfolio/PortfolioCurrencySelector';
import { FilterBar, type AnalyzerFilters } from '../components/analyzer/FilterBar';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, LayoutGrid, List, Plus, X, Bot, Wallet } from 'lucide-react';
import { Button } from '../components/ui/button';
import { useConfirm } from '../components/ui/confirm';
import { cn } from '../lib/utils';
import { useMarketSnapshots } from '../hooks/useWatchlist';
import { portfolioKeys } from '../hooks/usePortfolio';
import { useCompactLayout } from '../hooks/useMediaQuery';
import { PositionRowList, PositionRowListSkeleton } from '../components/portfolio/PositionListRow';
import { positionRegion } from '../components/portfolio/position-region';
import { positionVerdict, type PositionVerdictInput } from '../components/portfolio/position-verdict';
import { EmptyState } from '../components/ui/empty-state';
import { SegmentedControl } from '../components/ui/segmented';
import { Input } from '../components/ui/input';
import { ScrollX } from '../components/common/ScrollX';

interface MarketSnapshot {
  ticker: { symbol: string; logo_url?: string; name?: string; id: string; currency?: string };
  latestPrice?: { close: number; prevClose?: number };
  fundamentals?: {
    fifty_two_week_high?: number;
    fifty_two_week_low?: number;
    sector?: string;
    pe_ttm?: number;
    market_cap?: number;
  };
  sparkline?: number[];
  quote?: Record<string, unknown>;
}

interface PortfolioPosition {
  id: string;
  symbol: string;
  shares: number;
  buy_price: number;
  buy_date: string;
  current_price: number;
  current_value: number;
  cost_basis: number;
  total_gain: number;
  total_gain_percent: number;
  ticker?: {
    name?: string;
    sector?: string;
  };
  fundamentals?: {
    sector?: string;
    pe_ttm?: number;
    consensus_rating?: string;
    market_cap?: number;
  };
  aiAnalysis?: {
    financial_risk?: number;
    upside_percent?: number;
    overall_score?: number;
    base_price?: number;
    bear_price?: number;
  };
}

export function PortfolioPage() {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [isFabOpen, setIsFabOpen] = useState(false);
  // Cash dialog: `null` = closed; otherwise the currency/amount to pre-fill.
  const [cashRequest, setCashRequest] = useState<{ currency: string; amount?: number } | null>(null);
  const [editingPosition, setEditingPosition] = useState<PortfolioPosition | null>(null);
  const [sellingPosition, setSellingPosition] = useState<PortfolioPosition | null>(null);
  const [buyingPosition, setBuyingPosition] = useState<PortfolioPosition | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  // 'list' is the table from `lg` up and mini-card rows below it; 'grid' is
  // the full cards at any width.
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const compact = useCompactLayout();
  // The floating quick-actions button is only useful once the toolbar's own
  // "Add Position" has scrolled away. Where IntersectionObserver is missing
  // (unit tests) it is simply shown.
  const [toolbarEl, setToolbarEl] = useState<HTMLDivElement | null>(null);
  const [toolbarPassed, setToolbarPassed] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (!toolbarEl || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      setToolbarPassed(!entry.isIntersecting && entry.boundingClientRect.bottom < 0);
    });
    observer.observe(toolbarEl);
    return () => observer.disconnect();
  }, [toolbarEl]);
  const showFab = toolbarPassed;
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  // State for filters
  const [filters, setFilters] = useState<AnalyzerFilters>({
    risk: [],
    aiRating: [],
    upside: null,
    sector: [],
    overallScore: null,
    region: [],
  });

  // `displayCurrency` from the context is the user's *saved* default for the
  // Portfolio view (legacy localStorage key, no longer applied globally).
  // We mirror it into a Portfolio-local state that also supports a NATIVE
  // mode (= empty string), which the global context cannot represent.
  const { displayCurrency, setDisplayCurrency, convert } = useCurrency();
  const [portfolioCurrency, setPortfolioCurrency] = useState<string>(
    () => displayCurrency || 'USD',
  );

  // Keep the local pick in sync if the saved default changes (e.g. user logs
  // in and their server-side preference loads asynchronously).
  useEffect(() => {
    setPortfolioCurrency((current) =>
      current === '' ? current : displayCurrency || current,
    );
  }, [displayCurrency]);

  const isNativeMode = portfolioCurrency === PORTFOLIO_DISPLAY_NATIVE;

  const { data: positions = [], isLoading, isError, refetch: refetchPositions } = useQuery({
    queryKey: ['portfolio', portfolioCurrency],
    queryFn: async () => {
      const { data } = await api.get('/portfolio/positions', {
        // Omit param entirely in NATIVE mode so the backend returns each
        // position in its own native currency without conversion.
        params: isNativeMode ? {} : { displayCurrency: portfolioCurrency },
      });
      return data;
    },
  });

  // Virtual paper-trading cash (per currency). Buys are funded from it.
  const { data: cashData, refetch: refetchCash } = useQuery({
    queryKey: ['portfolio-cash'],
    queryFn: async () => {
      const { data } = await api.get<CashBalance[]>('/portfolio/cash');
      return data;
    },
  });
  // Postgres decimals can arrive as strings — coerce before handing to the UI.
  const cashBalances = useMemo<CashBalance[]>(
    () =>
      Array.isArray(cashData)
        ? cashData
            .filter((b) => !!b && typeof b.currency === 'string')
            .map((b) => ({ currency: b.currency, amount: Number(b.amount) }))
        : [],
    [cashData],
  );
  const primaryCash =
    cashBalances.find((b) => b.currency === (portfolioCurrency || 'USD')) ??
    cashBalances.find((b) => b.currency === 'USD') ??
    cashBalances[0];
  const primaryCashLabel = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: primaryCash?.currency || 'USD',
    maximumFractionDigits: 0,
  }).format(primaryCash?.amount ?? 0);
  // Cash in the Portfolio display currency, so Net Worth = holdings + cash.
  // Undefined in NATIVE mode, where summing across currencies is meaningless.
  // (Same fallback as the backend summary: an unknown FX rate counts 1:1.)
  const cashValue = isNativeMode
    ? undefined
    : cashBalances.reduce((sum, b) => sum + convert(b.amount, b.currency, portfolioCurrency), 0);

  const openCashDialog = (currency?: string, amount?: number) =>
    setCashRequest({ currency: currency || primaryCash?.currency || 'USD', amount });

  const handlePortfolioCurrencyChange = (next: string) => {
    setPortfolioCurrency(next);
    // Persist non-NATIVE selections as the user's default for next visit.
    if (next !== PORTFOLIO_DISPLAY_NATIVE) {
      void setDisplayCurrency(next);
    }
  };

  // Refetch positions and cash after any mutation (buy, sell, deposit,
  // withdraw) so the hero stats, toolbar balance and table stay in sync.
  const refetchAll = () => {
    // Every cached view of the portfolio — each display currency, the
    // dashboard's totals and the trade ledger behind the history chart —
    // lives under this prefix; invalidate them together so none goes stale.
    void queryClient.invalidateQueries({ queryKey: portfolioKeys.all });
    void refetchCash();
    // A buy/sell may have been queued as a pending order while the market is
    // closed — refresh the queued-orders panel too.
    void queryClient.invalidateQueries({ queryKey: ['portfolio-pending-orders'] });
  };

  // -- Market Data for Sparklines & 52-Week Range --
  const symbols = useMemo(() => (positions || []).filter((p: PortfolioPosition) => p && p.symbol).map((p: PortfolioPosition) => p.symbol), [positions]);
  const { data: snapshots = [] } = useMarketSnapshots(symbols, { refetchInterval: 10000 });

  // Merge Snapshots with Positions
  const enrichedPositions = useMemo(() => {
    if (!snapshots || snapshots.length === 0) return (positions || []);
    
    const snapMap = new Map(
      (snapshots as MarketSnapshot[])
        .filter((s: MarketSnapshot) => s && s.ticker && s.ticker.symbol)
        .map((s: MarketSnapshot) => [s.ticker.symbol, s])
    );

    return (positions || []).map((p: PortfolioPosition) => {
      const snap = snapMap.get(p.symbol);
      if (!snap) return p;
      return {
        ...p,
        sparkline: snap.sparkline,
        fiftyTwoWeekHigh: snap.fundamentals?.fifty_two_week_high,
        fiftyTwoWeekLow: snap.fundamentals?.fifty_two_week_low,
        quote: snap.quote,
      };
    });
  }, [positions, snapshots]);

  // Calculate Aggregates
  const stats = useMemo(() => {
    let totalValue = 0;
    let totalGain = 0;
    let totalCost = 0;
    let totalRisk = 0;
    let riskCount = 0;
    let todayGain = 0;
    let conversionUnavailable = 0;

    enrichedPositions.forEach((p: PortfolioPosition & { quote?: { d?: number }; conversion_unavailable?: boolean }) => {
      totalValue += p.current_value;
      totalCost += p.cost_basis;

      if (p.quote?.d) {
        todayGain += (p.shares * p.quote.d);
      }

      const risk = p.aiAnalysis?.financial_risk;
      if (typeof risk === 'number') {
        totalRisk += risk;
        riskCount++;
      }

      if (p.conversion_unavailable) conversionUnavailable++;
    });

    totalGain = totalValue - totalCost;
    const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
    const avgRisk = riskCount > 0 ? totalRisk / riskCount : null;

    // Estimate previous close value to calculate today's % change
    const previousValue = totalValue - todayGain;
    const todayGainPct = previousValue > 0 ? (todayGain / previousValue) * 100 : 0;

    return {
      totalValue,
      totalGain,
      totalGainPct,
      count: positions.length,
      avgRisk,
      todayGain,
      todayGainPct,
      conversionUnavailable,
    };
  }, [enrichedPositions, positions.length]);
  const filteredPositions = useMemo(() => {
    return enrichedPositions.filter((item: unknown) => {
      const typedItem = item as Record<string, unknown> & Partial<PortfolioPosition>;
      // 1. Search (Symbol or Name)
      const matchSearch = !search ||
        typedItem.symbol?.includes(search.toUpperCase()) ||
        typedItem.ticker?.name?.toLowerCase().includes(search.toLowerCase());

      if (!matchSearch) return false;

      // 2. Risk
      if (filters.risk.length > 0) {
        const risk = Number(typedItem.aiAnalysis?.financial_risk || 0);
        const matchesRisk = filters.risk.some(range => {
          if (range.includes('Low')) return risk <= 3.5;
          if (range.includes('Medium')) return risk > 3.5 && risk <= 6.5;
          if (range.includes('High')) return risk > 6.5;
          return false;
        });
        if (!matchesRisk) return false;
      }

      // 3. AI Rating — the rating the row shows (one derivation, see position-verdict)
      if (filters.aiRating.length > 0) {
        const { rating } = positionVerdict(typedItem as PositionVerdictInput);
        if (!filters.aiRating.includes(rating)) return false;
      }

      // 4. Sector
      if (filters.sector.length > 0) {
        const sec = typedItem.ticker?.sector || typedItem.fundamentals?.sector;
        if (!sec || !filters.sector.includes(sec)) return false;
      }

      // 5. Upside — again the figure the row shows
      if (filters.upside) {
        // "> 10%"
        const minUpside = parseInt(filters.upside.replace(/[^0-9]/g, ''));
        const upside = positionVerdict(typedItem as PositionVerdictInput).upside;
        if (upside === null || upside <= minUpside) return false;
      }

      // 6. Market region (EU / US), derived from the symbol's venue suffix
      if (filters.region && filters.region.length > 0) {
        if (!filters.region.includes(positionRegion(typedItem.symbol))) return false;
      }

      // 7. Overall Score (Risk/Reward)
      if (filters.overallScore) {
        const minScore = parseFloat(filters.overallScore.replace(/[^0-9.]/g, ''));
        const score = Number(typedItem.aiAnalysis?.overall_score || 0);
        if (score <= minScore) return false;
      }

      return true;
    });
  }, [enrichedPositions, search, filters]);

  const handleDelete = async (id: string) => {
    const symbol = (positions || []).find((p: PortfolioPosition) => p && p.id === id)?.symbol;
    const confirmed = await confirm({
      title: symbol ? `Delete ${symbol} position?` : 'Delete this position?',
      description: 'The holding is removed without crediting its value to your cash — to close it for cash, sell it instead. This can’t be undone.',
      confirmLabel: 'Delete position',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await api.delete(`/portfolio/positions/${id}`);
      toast.success('Position removed');
      refetchAll();
    } catch {
      toast.error('Failed to remove position');
    }
  };

  const { user } = useAuth();

  const EMPTY_FILTERS: AnalyzerFilters = { risk: [], aiRating: [], upside: null, sector: [], overallScore: null, region: [] };
  const resetFilters = () => {
    setSearch('');
    setFilters(EMPTY_FILTERS);
  };
  const hasPositions = (positions || []).length > 0;
  const canAnalyze = (user?.credits_balance || 0) > 0;
  // A failed load is not an empty portfolio: say so, and never print $0 totals.
  const loadFailed = !!isError && !hasPositions;

  if (loadFailed) {
    return (
      <div className="min-h-page bg-background text-foreground font-sans">
        <main className="container mx-auto max-w-[90rem] px-4 pt-6 sm:pt-8">
          <EmptyState
            role="alert"
            className="rounded-lg bg-card py-16"
            title="Couldn’t load your portfolio"
            description="Your positions are safe — we just couldn’t reach the server. Check your connection and try again."
            action={<Button className="h-11 lg:h-10" onClick={() => { void refetchPositions?.(); void refetchCash?.(); }}>Try again</Button>}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-page bg-background text-foreground font-sans selection:bg-primary/30">

      <main className="container mx-auto px-4 pt-6 sm:pt-8 pb-28 lg:pb-8 max-w-[90rem] space-y-3 sm:space-y-4">

        {/* HERO STATS */}
        <PortfolioStats
          totalValue={stats.totalValue}
          totalGainLoss={stats.totalGain}
          totalGainLossPercent={stats.totalGainPct}
          todayGain={stats.todayGain}
          todayGainPct={stats.todayGainPct}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          positions={enrichedPositions as any[]}
          onAnalyze={() => setIsAiOpen(true)}
          credits={user?.credits_balance}
          displayCurrency={portfolioCurrency}
          isNativeMode={isNativeMode}
          conversionUnavailable={stats.conversionUnavailable}
          cashValue={cashValue}
          netWorth={cashValue !== undefined ? stats.totalValue + cashValue : undefined}
          onManageCash={() => openCashDialog()}
          onViewHistory={() => setIsHistoryOpen(true)}
        />

        {/* TOOLBAR: one tonal surface — search + actions, then the filters */}
        <div ref={setToolbarEl} className="space-y-2.5 rounded-lg bg-card p-2.5 sm:p-3">
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:w-72 lg:shrink-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                placeholder="Search symbols or names..."
                aria-label="Search positions"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-11 pl-9 lg:h-9"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <PortfolioCurrencySelector
                value={portfolioCurrency}
                onChange={handlePortfolioCurrencyChange}
              />
              <Button
                variant="outline"
                onClick={() => openCashDialog()}
                title={
                  cashBalances.length
                    ? cashBalances.map((b) => `${b.currency} ${b.amount.toFixed(2)}`).join('\n')
                    : 'Deposit virtual cash to start paper trading'
                }
                aria-label={`Cash ${primaryCashLabel} — deposit or withdraw`}
                className="num h-11 gap-2 px-3 lg:h-9"
              >
                <Wallet size={16} />
                {primaryCashLabel}
                {cashBalances.length > 1 && (
                  <span className="text-[11px] text-muted-foreground">+{cashBalances.length - 1}</span>
                )}
              </Button>
              <Button
                onClick={() => setIsAddOpen(true)}
                className="h-11 flex-1 gap-2 lg:h-9 sm:flex-initial"
              >
                <Plus size={16} />
                Add Position
              </Button>
              <SegmentedControl
                label="Positions view"
                size="sm"
                value={viewMode}
                onChange={setViewMode}
                className="max-lg:[&>button]:min-h-11 max-lg:[&>button]:min-w-11"
                options={[
                  { value: 'list', label: <List size={16} aria-hidden />, ariaLabel: compact ? 'Rows' : 'Table' },
                  { value: 'grid', label: <LayoutGrid size={16} aria-hidden />, ariaLabel: 'Cards' },
                ]}
              />
            </div>
          </div>

          {/* Filters scroll sideways on narrow screens instead of wrapping. */}
          <ScrollX label="Position filters" surface="card" innerClassName="[&>div]:w-max [&>div]:flex-nowrap">
            <FilterBar
              filters={filters}
              onFilterChange={(key, val) => setFilters(prev => ({ ...prev, [key]: val }))}
              onReset={() => setFilters(EMPTY_FILTERS)}
            />
          </ScrollX>
        </div>

        {/* QUEUED (market-hours-pending) ORDERS */}
        <PendingOrdersPanel onChanged={refetchAll} />

        {/* CONTENT */}
        {isLoading && !hasPositions ? (
          compact
            ? <PositionRowListSkeleton />
            : viewMode === 'list'
              ? <PortfolioTable positions={[]} loading onDelete={handleDelete} />
              : <PortfolioGridView data={[]} isLoading onEdit={() => {}} />
        ) : !hasPositions ? (
          <EmptyState
            className="rounded-lg bg-card py-14"
            title="Your portfolio is empty"
            description={
              (primaryCash?.amount ?? 0) > 0
                ? 'Add your first position to start tracking performance and get AI insights.'
                : 'Paper trading is funded from virtual cash. Deposit some first, then add your first position.'
            }
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button variant="outline" onClick={() => openCashDialog()} className="h-11 gap-2 lg:h-10">
                  <Wallet size={16} />
                  Deposit cash
                </Button>
                <Button onClick={() => setIsAddOpen(true)} className="h-11 gap-2 lg:h-10">
                  <Plus size={16} />
                  Add position
                </Button>
              </div>
            }
          />
        ) : filteredPositions.length === 0 ? (
          <EmptyState
            className="rounded-lg bg-card py-14"
            title="No positions match"
            description="None of your holdings fit this search and these filters."
            action={<Button variant="outline" className="h-11 lg:h-10" onClick={resetFilters}>Reset filters</Button>}
          />
        ) : viewMode === 'grid' ? (
          <PortfolioGridView
            data={filteredPositions}
            isLoading={isLoading}
            onEdit={(pos) => setEditingPosition(pos as unknown as PortfolioPosition)}
            onSell={(pos) => setSellingPosition(pos as unknown as PortfolioPosition)}
            onBuy={(pos) => setBuyingPosition(pos as unknown as PortfolioPosition)}
          />
        ) : compact ? (
          <PositionRowList
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            positions={filteredPositions as any[]}
            onDelete={handleDelete}
            onEdit={(pos) => setEditingPosition(pos as unknown as PortfolioPosition)}
            onSell={(pos) => setSellingPosition(pos as unknown as PortfolioPosition)}
            onBuy={(pos) => setBuyingPosition(pos as unknown as PortfolioPosition)}
          />
        ) : (
          <PortfolioTable
            positions={filteredPositions}
            loading={isLoading}
            onDelete={handleDelete}
            onEdit={(pos) => setEditingPosition(pos as unknown as PortfolioPosition)}
            onSell={(pos) => setSellingPosition(pos as unknown as PortfolioPosition)}
            onBuy={(pos) => setBuyingPosition(pos as unknown as PortfolioPosition)}
          />
        )}
      </main>

      <AddPositionDialog
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        onSuccess={refetchAll}
        cashBalances={cashBalances}
        onDepositRequest={openCashDialog}
      />

      <CashDialog
        open={!!cashRequest}
        onOpenChange={(open) => !open && setCashRequest(null)}
        balances={cashBalances}
        defaultCurrency={cashRequest?.currency}
        defaultAmount={cashRequest?.amount}
        onSuccess={refetchAll}
      />

      <PortfolioAiAnalyzer open={isAiOpen} onOpenChange={setIsAiOpen} />

      {editingPosition && (
        <EditPositionDialog
          open={!!editingPosition}
          onOpenChange={(open: boolean) => !open && setEditingPosition(null)}
          position={editingPosition}
          onSuccess={() => {
            setEditingPosition(null);
            refetchAll();
          }}
        />
      )}

      {/* Sell Dialog - credits proceeds to the position's native cash balance */}
      {sellingPosition && (
        <SellPositionDialog
          open={!!sellingPosition}
          onOpenChange={(open: boolean) => !open && setSellingPosition(null)}
          position={sellingPosition}
          onSuccess={() => {
            setSellingPosition(null);
            refetchAll();
          }}
        />
      )}

      {/* Buy at Market - funds from the position's native cash balance; queued
          as a pending order when the market is closed */}
      {buyingPosition && (
        <BuyAtMarketDialog
          open={!!buyingPosition}
          onOpenChange={(open: boolean) => !open && setBuyingPosition(null)}
          position={buyingPosition}
          cashBalances={cashBalances}
          onRequestDeposit={(currency) => {
            setBuyingPosition(null);
            openCashDialog(currency);
          }}
          onSuccess={() => {
            setBuyingPosition(null);
            refetchAll();
          }}
        />
      )}

      {/* Trade History - full buy/sell ledger across all sources */}
      <TradeHistoryDialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen} />

      {/* Phone quick actions. Shown only once the toolbar (which has the same
          actions) has scrolled out of view, so it never sits on top of the
          summary. A scrim — not see-through labels — separates the open menu
          from the content behind it. */}
      {showFab && isFabOpen && (
        <button
          type="button"
          aria-label="Close quick actions"
          className="lg:hidden fixed inset-0 z-20 bg-background/80"
          onClick={() => setIsFabOpen(false)}
        />
      )}
      {showFab && (
      <div className="lg:hidden fixed right-4 bottom-[calc(var(--shell-bottom)+1rem)] z-30 flex flex-col items-end gap-3">
        {isFabOpen && (
          <div className="flex flex-col items-end gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200">
            <div className="flex items-center gap-3">
              <span className="rounded-md bg-popover px-3 py-2 text-sm font-medium text-foreground shadow-2xl shadow-black/60">Add Position</span>
              <Button
                onClick={() => { setIsAddOpen(true); setIsFabOpen(false); }}
                aria-label="Add position"
                className="h-12 w-12 rounded-full p-0 shadow-xl shadow-black/50"
              >
                <Plus size={22} />
              </Button>
            </div>

            <div className="flex items-center gap-3">
              <span className="rounded-md bg-popover px-3 py-2 text-sm font-medium text-foreground shadow-2xl shadow-black/60">AI Analysis</span>
              <Button
                onClick={() => { setIsAiOpen(true); setIsFabOpen(false); }}
                disabled={!canAnalyze}
                aria-label="Analyze portfolio with AI"
                className={cn(
                  "h-12 w-12 rounded-full p-0 shadow-xl shadow-black/50",
                  canAnalyze ? "bg-violet-600 text-white hover:bg-violet-700" : "bg-muted text-muted-foreground"
                )}
              >
                <Bot size={22} />
              </Button>
            </div>
          </div>
        )}

        <Button
          onClick={() => setIsFabOpen(!isFabOpen)}
          aria-expanded={isFabOpen}
          aria-label={isFabOpen ? 'Close quick actions' : 'Quick actions'}
          className={cn(
            "h-14 w-14 rounded-full p-0 shadow-xl shadow-black/50 transition-transform duration-150",
            isFabOpen ? "bg-raised text-foreground hover:bg-raised" : ""
          )}
        >
          {isFabOpen ? <X size={22} /> : <Plus size={26} />}
        </Button>
      </div>
      )}
    </div>
  );
}
