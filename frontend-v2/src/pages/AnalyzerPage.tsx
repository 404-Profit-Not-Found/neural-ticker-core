import { AnalyzerTable } from '../components/analyzer/AnalyzerTable';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import {
  type AnalyzerFilters,
} from '../components/analyzer/FilterBar';
import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/ui/page-header';

export function AnalyzerPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // State
  // State (Lazy init from URL)
  const [filters, setFilters] = useState<AnalyzerFilters>(() => {
    const riskParam = searchParams.getAll('risk');
    const aiRatingParam = searchParams.getAll('aiRating');
    const sectorParam = searchParams.getAll('sector');
    const upsideParam = searchParams.get('upside');
    const regionParam = searchParams.getAll('region');
    const overallScoreParam = searchParams.get('overallScore');
    const filterParam = searchParams.get('filter');

    const initialFilters: AnalyzerFilters = {
      risk: riskParam.length > 0 ? riskParam : [],
      aiRating: aiRatingParam.length > 0 ? aiRatingParam : [],
      sector: sectorParam.length > 0 ? sectorParam : [],
      upside: upsideParam || null,
      overallScore: overallScoreParam || null,
      region: regionParam.length > 0 ? regionParam : [],
    };

    if (filterParam === 'strong_buy' && initialFilters.aiRating.length === 0) {
      initialFilters.aiRating = ['Strong Buy'];
    }

    if (filterParam === 'sell' && initialFilters.aiRating.length === 0) {
      initialFilters.aiRating = ['Sell'];
    }

    if (filterParam === 'eu_market' && initialFilters.region.length === 0) {
      initialFilters.region = ['EU'];
    }

    if (filterParam === 'us_market' && initialFilters.region.length === 0) {
      initialFilters.region = ['US'];
    }

    return initialFilters;
  });

  const [viewMode, setViewMode] = useState<'table' | 'grid'>(() => {
    const viewParam = searchParams.get('view');
    if (viewParam === 'grid' || viewParam === 'table') {
      return viewParam;
    }
    // "table" is the default everywhere; on phones it renders as a list of
    // compact rows (see AnalyzerTable).
    return 'table';
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
    filters.region?.forEach((r) => params.append('region', r));
    if (filters.upside) params.append('upside', filters.upside);
    if (filters.overallScore) params.append('overallScore', filters.overallScore);

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
    setFilters({ risk: [], aiRating: [], sector: [], upside: null, overallScore: null, region: [] });
    // View mode persists on reset usually, or reset to table? Let's persist.
  };

  return (
    <div className="min-h-page bg-background text-foreground font-sans selection:bg-primary/30">

      <main className="container mx-auto max-w-[90rem] space-y-4 px-4 py-4 lg:space-y-6 lg:py-6 animate-in fade-in duration-300">
        <PageHeader
          title="Tickers"
          description="Screen every tracked ticker by AI rating, risk, upside and fundamentals."
        />

        <div className="space-y-4">
          <ErrorBoundary>
            <AnalyzerTable
              filters={filters}
              onFilterChange={handleFilterChange}
              onReset={handleReset}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
