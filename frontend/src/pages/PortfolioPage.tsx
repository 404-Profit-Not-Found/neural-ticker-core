import { useState, useMemo } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import { Header } from '../components/layout/Header';
import { PortfolioTable } from '../components/portfolio/PortfolioTable';
import { PortfolioGridView } from '../components/portfolio/PortfolioGridView';
import { PortfolioStats } from '../components/portfolio/PortfolioStats';
import { AddPositionDialog } from '../components/portfolio/AddPositionDialog';
import { EditPositionDialog } from '../components/portfolio/EditPositionDialog';
import { PortfolioAiAnalyzer } from '../components/portfolio/PortfolioAiAnalyzer';
import { FilterBar, type AnalyzerFilters } from '../components/analyzer/FilterBar';
import { Toaster, toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { Search, LayoutGrid, List, Plus, X, Bot, PieChart } from 'lucide-react';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';
import { calculateAiRating } from '../lib/rating-utils';
import { useMarketSnapshots } from '../hooks/useWatchlist';

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
  const [editingPosition, setEditingPosition] = useState<PortfolioPosition | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [search, setSearch] = useState('');

  // State for filters
  const [filters, setFilters] = useState<AnalyzerFilters>({
    risk: [],
    aiRating: [],
    upside: null,
    sector: [],
    overallScore: null,
  });

  const { displayCurrency } = useCurrency();

  const { data: positions = [], isLoading, refetch } = useQuery({
    queryKey: ['portfolio', displayCurrency],
    queryFn: async () => {
      const { data } = await api.get('/portfolio/positions', {
        params: { displayCurrency },
      });
      return data;
    },
  });



  // -- Market Data for Sparklines & 52-Week Range --
  const symbols = useMemo(() => positions.map((p: PortfolioPosition) => p.symbol), [positions]);
  const { data: snapshots = [] } = useMarketSnapshots(symbols, { refetchInterval: 10000 });

  // Merge Snapshots with Positions
  const enrichedPositions = useMemo(() => {
    if (!snapshots || snapshots.length === 0) return positions;
    const snapMap = new Map(snapshots.map((s: Record<string, unknown> & { ticker: { symbol: string }; quote?: { d?: number; dp?: number }; fundamentals?: { fifty_two_week_high?: number; fifty_two_week_low?: number }; sparkline?: unknown }) => [s.ticker.symbol, s]));

    return positions.map((p: PortfolioPosition) => {
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

    enrichedPositions.forEach((p: PortfolioPosition & { quote?: { d?: number } }) => {
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
    });

    totalGain = totalValue - totalCost;
    const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
    const avgRisk = riskCount > 0 ? totalRisk / riskCount : null;

    // Estimate previous close value to calculate today's % change
    const previousValue = totalValue - todayGain;
    const todayGainPct = previousValue > 0 ? (todayGain / previousValue) * 100 : 0;

    return { totalValue, totalGain, totalGainPct, count: positions.length, avgRisk, todayGain, todayGainPct };
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

      // 3. AI Rating
      if (filters.aiRating.length > 0) {
        const risk = Number(typedItem.aiAnalysis?.financial_risk || 0);
        const upside = Number(typedItem.aiAnalysis?.upside_percent || 0);
        const overallScore = typedItem.aiAnalysis?.overall_score;
        const { rating } = calculateAiRating(risk, upside, overallScore); // e.g. "Strong Buy"

        // Check direct match ("Strong Buy" === "Strong Buy")
        // Or simple inclusion logic
        const matchesRating = filters.aiRating.includes(rating);
        if (!matchesRating) return false;
      }

      // 4. Sector
      if (filters.sector.length > 0) {
        const sec = typedItem.ticker?.sector || typedItem.fundamentals?.sector;
        if (!sec || !filters.sector.includes(sec)) return false;
      }

      // 5. Upside
      if (filters.upside) {
        // "> 10%"
        const minUpside = parseInt(filters.upside.replace(/[^0-9]/g, ''));
        const up = Number(typedItem.aiAnalysis?.upside_percent || 0);

        // Or calculate base_price upside dynamically? 
        // Let's stick to stored 'upside_percent' for filtering consistency vs display.
        // Display logic uses base_price if available.
        // Let's use the better logic:
        let displayUpside = up;
        if (typeof typedItem.aiAnalysis?.base_price === 'number' && (typedItem.current_price || 0) > 0) {
          displayUpside = ((typedItem.aiAnalysis.base_price - (typedItem.current_price || 0)) / (typedItem.current_price || 0)) * 100;
        }

        if (displayUpside <= minUpside) return false;
      }

      // 6. Overall Score (Risk/Reward)
      if (filters.overallScore) {
        const minScore = parseFloat(filters.overallScore.replace(/[^0-9.]/g, ''));
        const score = Number(typedItem.aiAnalysis?.overall_score || 0);
        if (score <= minScore) return false;
      }

      return true;
    });
  }, [enrichedPositions, search, filters]);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this position?')) return;
    try {
      await api.delete(`/portfolio/positions/${id}`);
      toast.success('Position removed');
      refetch();
    } catch {
      toast.error('Failed to remove position');
    }
  };

  const { user } = useAuth();

  return (
    <div className="dark min-h-screen bg-background text-foreground font-sans selection:bg-primary/30">
      <div className="fixed inset-0 bg-black -z-10" /> {/* Fallback/Reinforce Black BG */}
      <Header />
      <Toaster position="top-right" theme="dark" />

      <main className="container mx-auto px-4 py-8 max-w-[90rem] space-y-4 sm:space-y-5 animate-in fade-in duration-500">

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
        />

        {/* TOOLBAR: SEARCH & FILTERS */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3 bg-card/30 p-2 sm:p-3 rounded-lg border border-border/40">
            {/* Search and Filters */}
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:flex-1 gap-3">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  placeholder="Search symbols or names..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-10 w-full rounded-md border border-input bg-background/50 px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              <div className="overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0">
                <FilterBar
                  filters={filters}
                  onFilterChange={(key, val) => setFilters(prev => ({ ...prev, [key]: val }))}
                  onReset={() => setFilters({ risk: [], aiRating: [], upside: null, sector: [], overallScore: null })}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0 border-t border-border/30 sm:border-0">
              <Button
                onClick={() => setIsAddOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white gap-2 h-8 shadow-sm flex-1 sm:flex-initial"
              >
                <Plus size={16} />
                Add Position
              </Button>

              <div className="flex items-center space-x-1 border border-border/50 rounded-md p-1 bg-card h-8">
                <button
                  onClick={() => setViewMode('table')}
                  className={`p-1.5 rounded transition-colors ${viewMode === 'table' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                  title="Table View"
                >
                  <List size={16} />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                  title="Grid View"
                >
                  <LayoutGrid size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* CONTENT */}
        {viewMode === 'table' ? (
          <div className="border border-border/50 rounded-xl bg-card overflow-hidden">
            <PortfolioTable
              positions={filteredPositions}
              loading={isLoading}
              onDelete={handleDelete}
              onEdit={(pos) => setEditingPosition(pos as unknown as PortfolioPosition)}
            />
          </div>
        ) : (
          <PortfolioGridView
            data={filteredPositions}
            isLoading={isLoading}
            onEdit={(pos) => setEditingPosition(pos as unknown as PortfolioPosition)}
          />
        )}
      </main>

      <AddPositionDialog open={isAddOpen} onOpenChange={setIsAddOpen} onSuccess={refetch} />

      <PortfolioAiAnalyzer open={isAiOpen} onOpenChange={setIsAiOpen} />

      {/* Edit Dialog - To be implemented or reused AddPositionDialog with edit mode */}
      {editingPosition && (
        <EditPositionDialog
          open={!!editingPosition}
          onOpenChange={(open: boolean) => !open && setEditingPosition(null)}
          position={editingPosition}
          onSuccess={() => {
            setEditingPosition(null);
            refetch();
          }}
        />
      )}
      {/* Mobile Expandable FAB (Fixed to Viewport) */}
      <div className="sm:hidden fixed bottom-6 right-6 flex flex-col items-end gap-4 z-[9999]">
        {/* Menu Items (Stacked bottom-to-top) */}
        {isFabOpen && (
          <div className="flex flex-col items-end gap-4 mb-2 animate-in fade-in slide-in-from-bottom-6 duration-300">
            {/* 2nd Item: Add Position */}
            <div className="flex items-center gap-3">
              <span className="bg-background/90 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-bold shadow-lg border border-blue-500/20 text-blue-400">Add Position</span>
              <Button
                onClick={() => { setIsAddOpen(true); setIsFabOpen(false); }}
                className="h-14 w-14 rounded-full shadow-[0_8px_30px_rgb(59,130,246,0.3)] flex items-center justify-center p-0 bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                <PieChart size={24} />
              </Button>
            </div>

            {/* 1st Item: AI Analysis */}
            <div className="flex items-center gap-3">
              <span className="bg-background/90 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-bold shadow-lg border border-purple-500/20 text-purple-400">AI Analysis</span>
              <Button
                onClick={() => { setIsAiOpen(true); setIsFabOpen(false); }}
                disabled={(user?.credits_balance || 0) <= 0}
                className={cn(
                  "h-14 w-14 rounded-full shadow-[0_8px_30px_rgb(168,85,247,0.4)] border-0 flex items-center justify-center p-0 transition-all active:scale-90",
                  (user?.credits_balance || 0) > 0
                    ? "bg-gradient-to-r from-violet-600 to-fuchsia-600"
                    : "bg-muted cursor-not-allowed opacity-70 shadow-none grayscale"
                )}
              >
                <Bot size={26} className={cn((user?.credits_balance || 0) > 0 ? "text-white" : "text-muted-foreground")} />
              </Button>
            </div>
          </div>
        )}

        {/* Main Trigger Button */}
        <Button
          onClick={() => setIsFabOpen(!isFabOpen)}
          className={cn(
            "rounded-full flex items-center justify-center p-0 transition-all duration-300",
            isFabOpen
              ? "h-12 w-12 rotate-90 bg-slate-800 hover:bg-slate-700 shadow-none mr-2"
              : "h-16 w-16 shadow-[0_12px_40px_rgb(168,85,247,0.4)] hover:scale-110 active:scale-95 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white"
          )}
        >
          {isFabOpen ? <X size={24} /> : <Plus size={32} />}
        </Button>
      </div>
    </div>
  );
}
