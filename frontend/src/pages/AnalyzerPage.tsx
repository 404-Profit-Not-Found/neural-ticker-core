import { Header } from '../components/layout/Header';
import { AnalyzerTable } from '../components/analyzer/AnalyzerTable';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import {
  FilterBar,
  type AnalyzerFilters,
} from '../components/analyzer/FilterBar';
import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

export function AnalyzerPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // State
  // State (Lazy init from URL)
  const [filters, setFilters] = useState<AnalyzerFilters>(() => {
    const riskParam = searchParams.getAll('risk');
    const aiRatingParam = searchParams.getAll('aiRating');
    const sectorParam = searchParams.getAll('sector');
    const upsideParam = searchParams.get('upside');
    const filterParam = searchParams.get('filter');

    const initialFilters: AnalyzerFilters = {
      risk: riskParam.length > 0 ? riskParam : [],
      aiRating: aiRatingParam.length > 0 ? aiRatingParam : [],
      sector: sectorParam.length > 0 ? sectorParam : [],
      upside: upsideParam || null,
      overallScore: null,
    };

    if (filterParam === 'strong_buy' && initialFilters.aiRating.length === 0) {
      initialFilters.aiRating = ['Strong Buy'];
    }

    if (filterParam === 'sell' && initialFilters.aiRating.length === 0) {
      initialFilters.aiRating = ['Sell'];
    }

    return initialFilters;
  });

  const [viewMode, setViewMode] = useState<'table' | 'grid'>(() => {
    const viewParam = searchParams.get('view');
    if (viewParam === 'grid' || viewParam === 'table') {
      return viewParam;
    }
    return window.innerWidth < 768 ? 'grid' : 'table';
  });

  // Sync State -> URL
  // We use a ref to track if this is the initial mount to avoid
  // potentially overwriting URL params or creating history entries unnecessarily,
  // though replacing with same values is mostly harmless.
  const isMounted = useRef(false);

  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }

    const params = new URLSearchParams();

    // Filters
    filters.risk?.forEach((r) => params.append('risk', r));
    filters.aiRating?.forEach((r) => params.append('aiRating', r));
    filters.sector?.forEach((s) => params.append('sector', s));
    if (filters.upside) params.append('upside', filters.upside);

    // View
    params.set('view', viewMode);

    setSearchParams(params, { replace: true });
  }, [filters, viewMode, setSearchParams]);

  const handleFilterChange = (
    key: keyof AnalyzerFilters,
    value: AnalyzerFilters[keyof AnalyzerFilters],
  ) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleReset = () => {
    setFilters({ risk: [], aiRating: [], sector: [], upside: null, overallScore: null });
    // View mode persists on reset usually, or reset to table? Let's persist.
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30">
      <Header />

      <main className="container mx-auto px-4 py-6 max-w-[80rem] space-y-4 sm:space-y-6 animate-in fade-in duration-500">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Tickers</h1>
          <p className="text-muted-foreground">
            Advanced screening for all {new Date().getFullYear()} market data.
            Filter by AI risk, upside potential, and fundamentals.
          </p>
        </div>

        <div className="space-y-4">
          <FilterBar
            filters={filters}
            onFilterChange={handleFilterChange}
            onReset={handleReset}
          />

          <ErrorBoundary>
            <AnalyzerTable
              filters={filters}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
