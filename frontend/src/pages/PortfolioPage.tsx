import { useState, useMemo } from 'react';
import { api } from '../lib/api';
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
  };
  aiAnalysis?: {
    financial_risk?: number;
    upside_percent?: number;
    overall_score?: number;
    base_price?: number;
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

  const { data: positions = [], isLoading, refetch } = useQuery({
    queryKey: ['portfolio'],
    queryFn: async () => {
      const { data } = await api.get('/portfolio/positions');
      return data;
    },
  });

  // Calculate Aggregates
  const stats = useMemo(() => {
    let totalValue = 0;
    let totalGain = 0;
    let totalCost = 0;
    let totalRisk = 0;
    let riskCount = 0;

    positions.forEach((p: PortfolioPosition) => {
      totalValue += p.current_value;
      totalCost += p.cost_basis;

      const risk = p.aiAnalysis?.financial_risk;
      if (typeof risk === 'number') {
        totalRisk += risk;
        riskCount++;
      }
    });

    totalGain = totalValue - totalCost;
    const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
    const avgRisk = riskCount > 0 ? totalRisk / riskCount : null;

    return { totalValue, totalGain, totalGainPct, count: positions.length, avgRisk };
  }, [positions]);

  // Client-Side Filtering
  const filteredPositions = useMemo(() => {
    return positions.filter((item: PortfolioPosition) => {
      // 1. Search (Symbol or Name)
      const matchSearch = !search ||
        item.symbol.includes(search.toUpperCase()) ||
        item.ticker?.name?.toLowerCase().includes(search.toLowerCase());

      if (!matchSearch) return false;

      // 2. Risk
      if (filters.risk.length > 0) {
        const risk = Number(item.aiAnalysis?.financial_risk || 0);
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
        const risk = Number(item.aiAnalysis?.financial_risk || 0);
        const upside = Number(item.aiAnalysis?.upside_percent || 0);
        const { rating } = calculateAiRating(risk, upside); // e.g. "Strong Buy"

        // Check direct match ("Strong Buy" === "Strong Buy")
        // Or simple inclusion logic
        const matchesRating = filters.aiRating.includes(rating);
        if (!matchesRating) return false;
      }

      // 4. Sector
      if (filters.sector.length > 0) {
        const sec = item.ticker?.sector || item.fundamentals?.sector;
        if (!sec || !filters.sector.includes(sec)) return false;
      }

      // 5. Upside
      if (filters.upside) {
        // "> 10%"
        const minUpside = parseInt(filters.upside.replace(/[^0-9]/g, ''));
        const up = Number(item.aiAnalysis?.upside_percent || 0);

        // Or calculate base_price upside dynamically? 
        // Let's stick to stored 'upside_percent' for filtering consistency vs display.
        // Display logic uses base_price if available.
        // Let's use the better logic:
        let displayUpside = up;
        if (typeof item.aiAnalysis?.base_price === 'number' && item.current_price > 0) {
          displayUpside = ((item.aiAnalysis.base_price - item.current_price) / item.current_price) * 100;
        }

        if (displayUpside <= minUpside) return false;
      }

      // 6. Overall Score (Risk/Reward)
      if (filters.overallScore) {
        const minScore = parseFloat(filters.overallScore.replace(/[^0-9.]/g, ''));
        const score = Number(item.aiAnalysis?.overall_score || 0);
        if (score <= minScore) return false;
      }

      return true;
    });
  }, [positions, search, filters]);

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

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30">
      <Header />
      <Toaster position="top-right" theme="dark" />

      <main className="container mx-auto px-4 py-8 max-w-[90rem] space-y-4 sm:space-y-5 animate-in fade-in duration-500">

        {/* HERO STATS */}
        <PortfolioStats
          totalValue={stats.totalValue}
          totalGainLoss={stats.totalGain}
          totalGainLossPercent={stats.totalGainPct}
          positionCount={stats.count}
          avgRisk={stats.avgRisk}
          onAddPosition={() => setIsAddOpen(true)}
          onAnalyze={() => setIsAiOpen(true)}
        />

        {/* FILTERS & TOOLBAR */}
        <div className="space-y-4">
          <FilterBar
            filters={filters}
            onFilterChange={(key, val) => setFilters(prev => ({ ...prev, [key]: val }))}
            onReset={() => setFilters({ risk: [], aiRating: [], upside: null, sector: [], overallScore: null })}
          />

          <div className="flex flex-row items-center justify-between gap-3">
            <div className="relative flex-1 sm:max-w-md">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                placeholder="Search symbols or names..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-10 w-full rounded-md border border-input bg-background/50 px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              {/* View Toggle */}
              <div className="flex items-center space-x-1 border border-border rounded-md p-1 bg-card h-10">
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
          <div className="border border-border rounded-lg bg-card overflow-hidden">
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
                className="h-14 w-14 rounded-full shadow-[0_8px_30px_rgb(168,85,247,0.4)] bg-gradient-to-r from-violet-600 to-fuchsia-600 border-0 flex items-center justify-center p-0 transition-all active:scale-90"
              >
                <Bot size={26} className="text-white" />
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
