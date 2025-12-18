import { useState } from 'react';
import { createColumnHelper, type SortingState } from '@tanstack/react-table';
import {
  Search,
  ChevronRight,
  ChevronLeft,
  LayoutGrid,
  List,
  ArrowUp,
  ArrowDown,
  Bot,
  Brain,
  Newspaper,
  ShieldCheck,
  AlertTriangle,
  Flame,
  MessageCircle,
} from 'lucide-react';
import {
  useStockAnalyzer,
  type StockSnapshot,
} from '../../hooks/useStockAnalyzer';
import { useNavigate } from 'react-router-dom';
import { AnalyzerTableView } from './AnalyzerTableView';
import { AnalyzerGridView } from './AnalyzerGridView';
import { Badge } from '../ui/badge';
import { TickerLogo } from '../dashboard/TickerLogo';
import { cn } from '../../lib/api';
import { calculateAiRating } from '../../lib/rating-utils';

import { type AnalyzerFilters } from './FilterBar';

export interface AnalyzerTableProps {
  filters?: AnalyzerFilters;
  viewMode: 'table' | 'grid';
  onViewModeChange: (mode: 'table' | 'grid') => void;
}

export function AnalyzerTable({
  filters,
  viewMode,
  onViewModeChange,
}: AnalyzerTableProps) {
  const navigate = useNavigate();

  // UI State
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'market_cap', desc: true },
  ]);

  // Fetch Data
  const { data, isLoading } = useStockAnalyzer({
    page,
    limit: pageSize,
    sortBy: sorting[0]?.id || 'market_cap',
    sortDir: sorting[0]?.desc ? 'DESC' : 'ASC',
    search,
    // Pass filters
    risk: filters?.risk,
    aiRating: filters?.aiRating,
    upside: filters?.upside,
    sector: filters?.sector,
    overallScore: filters?.overallScore,
  });

  const items = data?.items || [];
  const meta = data?.meta;

  // Column Definitions (passed to Table View)
  const columnHelper = createColumnHelper<StockSnapshot>();
  const columns = [
    // 1. Asset Column (Symbol, Name, Insights Next to Symbol)
    columnHelper.accessor('ticker.symbol', {
      header: 'Asset',
      cell: (info) => {
        const { research, news, social } = info.row.original.counts || {};
        const hasInsights = (research || 0) + (news || 0) + (social || 0) > 0;

        return (
          <div className="flex items-start gap-3">
            <div
              className="cursor-pointer"
              onClick={() => navigate(`/ticker/${info.getValue()}`)}
            >
              <TickerLogo
                url={info.row.original.ticker.logo_url}
                symbol={info.getValue()}
                className="w-10 h-10 rounded-full"
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span
                  className="text-base font-bold text-foreground hover:underline cursor-pointer"
                  onClick={() => navigate(`/ticker/${info.getValue()}`)}
                >
                  {info.getValue()}
                </span>

                {/* Insight Icons Next to Symbol */}
                {hasInsights && (
                  <div className="flex items-center gap-2">
                    {research ? (
                      <div className="flex items-center gap-0.5 text-purple-400" title={`${research} Reports`}>
                        <Brain size={10} />
                        <span className="text-[9px] font-medium">{research}</span>
                      </div>
                    ) : null}
                    {news ? (
                      <div className="flex items-center gap-0.5 text-sky-400" title={`${news} News`}>
                        <Newspaper size={10} />
                        <span className="text-[9px] font-medium">{news}</span>
                      </div>
                    ) : null}
                    {social ? (
                      <div className="flex items-center gap-0.5 text-blue-400" title={`${social} Social`}>
                        <MessageCircle size={10} />
                        <span className="text-[9px] font-medium">{social}</span>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground truncate max-w-[180px]" title={info.row.original.ticker.name}>
                  {info.row.original.ticker.name}
                </span>
                {info.row.original.ticker.sector && (
                  <span className="text-[10px] text-muted-foreground/70 truncate max-w-[150px]">
                    {info.row.original.ticker.sector}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      },
    }),

    // 2. Price / Change (Moved to 2nd position)
    columnHelper.accessor((row) => row.latestPrice?.change, {
      id: 'price_change',
      header: 'Price / Change',
      cell: (info) => {
        const change = info.getValue();
        const price = info.row.original.latestPrice?.close;

        if (!price) return '-';

        const isPositive = (change || 0) >= 0;

        return (
          <div className="flex flex-col items-end">
            <span className="text-sm font-mono font-medium text-foreground/70">
              ${price.toFixed(2)}
            </span>
            {change !== undefined && change !== null ? (
              <div className={cn("flex items-center text-xs font-bold", isPositive ? "text-emerald-500" : "text-red-500")}>
                {isPositive ? <ArrowUp size={12} className="mr-0.5" /> : <ArrowDown size={12} className="mr-0.5" />}
                {Math.abs(change).toFixed(2)}%
              </div>
            ) : <span className="text-xs text-muted-foreground">-</span>}
          </div>
        );
      },
    }),

    // 3. Market Cap
    columnHelper.accessor((row) => row.fundamentals.market_cap, {
      id: 'market_cap',
      header: 'Mkt Cap',
      cell: (info) => {
        const val = info.getValue();
        // Hide if 0 or null/undefined
        if (!val || val === 0) return <span className="text-muted-foreground">-</span>;

        const formatCap = (n: number) => {
          if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
          if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
          return (n / 1e6).toFixed(2) + 'M';
        };

        return <span className="font-mono text-muted-foreground text-xs">{formatCap(val)}</span>;
      },
    }),

    // 4. P/E
    columnHelper.accessor((row) => row.fundamentals.pe_ttm, {
      id: 'pe_ttm',
      header: 'P/E',
      cell: (info) => {
        const val = info.getValue();
        return val ? <span className="font-mono text-muted-foreground text-xs">{Number(val).toFixed(2)}</span> : '-';
      },
    }),

    // 5. Financial Risk
    columnHelper.accessor((row) => row.aiAnalysis?.financial_risk, {
      id: 'financial_risk',
      header: 'Risk',
      cell: (info) => {
        const val = info.getValue();
        if (val === undefined || val === null) return '-';

        let colorClass = 'text-muted-foreground';
        let Icon = ShieldCheck;
        if (val <= 3.5) { colorClass = 'text-emerald-500'; Icon = ShieldCheck; }
        else if (val <= 6.5) { colorClass = 'text-yellow-500'; Icon = AlertTriangle; }
        else { colorClass = 'text-red-500'; Icon = Flame; }

        return (
          <span className={cn('flex items-center gap-1.5 font-bold', colorClass)}>
            <Icon size={14} />
            {Number(val).toFixed(1)}
          </span>
        );
      },
    }),

    // 5.5 Risk/Reward (Overall Score)
    columnHelper.accessor((row) => row.aiAnalysis?.overall_score, {
      id: 'overall_score',
      header: 'Risk/Reward',
      cell: (info) => {
        const val = info.getValue();
        if (val === undefined || val === null) return '-';

        let colorClass = 'text-muted-foreground';
        if (val >= 7.5) colorClass = 'text-emerald-500';
        else if (val >= 5.0) colorClass = 'text-yellow-500';
        else colorClass = 'text-red-500';

        return (
          <span className={cn('font-bold', colorClass)}>
            {Number(val).toFixed(1)}
          </span>
        );
      },
    }),

    // 6. Upside (Base Case)
    columnHelper.accessor((row) => row.aiAnalysis?.base_price, {
      id: 'upside_percent',
      header: 'Upside',
      cell: (info) => {
        const basePrice = info.getValue();
        const price = info.row.original.latestPrice?.close ?? 0;

        let upside = 0;
        if (typeof basePrice === 'number' && price > 0) {
          upside = ((basePrice - price) / price) * 100;
        } else {
          upside = Number(info.row.original.aiAnalysis?.upside_percent ?? 0);
        }

        const isPositive = upside > 0;

        return (
          <div className={cn('flex items-center font-bold text-xs', isPositive ? 'text-emerald-500' : 'text-muted-foreground')}>
            {isPositive && <ArrowUp size={12} className="mr-0.5" />}
            {upside.toFixed(1)}%
          </div>
        );
      },
    }),

    // 6.5 Downside (Bear Case)
    columnHelper.accessor((row) => row.aiAnalysis?.bear_price, {
      id: 'downside_percent',
      header: 'Downside',
      cell: (info) => {
        const bearPrice = info.getValue();
        const price = info.row.original.latestPrice?.close ?? 0;
        const risk = Number(info.row.original.aiAnalysis?.financial_risk ?? 0);

        let downside = 0;
        if (typeof bearPrice === 'number' && price > 0) {
          downside = ((bearPrice - price) / price) * 100;
        } else if (risk >= 8) {
          downside = -100;
        } else {
          downside = -(risk * 2.5);
        }

        return (
          <div className="flex items-center font-bold text-xs text-amber-500">
            <ArrowDown size={12} className="mr-0.5" />
            {downside.toFixed(1)}%
          </div>
        );
      },
    }),

    // 7. AI Rating (Sortable by Financial Risk)
    columnHelper.accessor((row) => row.aiAnalysis?.financial_risk, {
      id: 'ai_rating',
      header: 'AI Rating',
      enableSorting: true,
      cell: (info) => {
        // Use financial_risk instead of overall_score to align with the visible Risk column
        const riskRaw = info.row.original.aiAnalysis?.financial_risk;
        const upsideRaw = info.row.original.aiAnalysis?.upside_percent;
        let rating = 'Hold';
        let variant: 'default' | 'strongBuy' | 'buy' | 'hold' | 'sell' | 'outline' = 'outline';

        if (riskRaw !== undefined && upsideRaw !== undefined) {
          const risk = Number(riskRaw);
          const upside = Number(upsideRaw);
          const result = calculateAiRating(risk, upside);
          rating = result.rating;
          variant = result.variant;
        }

        return (
          <Badge variant={variant} className="whitespace-nowrap h-6 px-2 gap-1.5 cursor-default">
            <Bot size={12} />
            {rating}
          </Badge>
        );
      }
    }),

    // 8. Analyst Rating (Last)
    columnHelper.accessor((row) => row.fundamentals.consensus_rating, {
      id: 'consensus',
      header: 'Analyst',
      cell: (info) => {
        const rawRating = info.getValue() as string;
        if (!rawRating || rawRating === '-') return <span className="text-muted-foreground">-</span>;

        const rLower = rawRating.toLowerCase();
        let displayRating = 'Hold';
        let variant: 'default' | 'strongBuy' | 'buy' | 'hold' | 'sell' | 'outline' = 'hold';

        if (rLower.includes('strong buy')) {
          displayRating = 'Strong Buy';
          variant = 'strongBuy';
        } else if (rLower.includes('buy')) {
          displayRating = 'Buy';
          variant = 'buy';
        } else if (rLower.includes('sell')) {
          displayRating = 'Sell';
          variant = 'sell';
        } else {
          displayRating = 'Hold';
          variant = 'hold';
        }

        const count = info.row.original.counts?.analysts || 0;
        const label = count > 0 ? `${displayRating} (${count})` : displayRating;

        return (
          <Badge variant={variant} className="whitespace-nowrap h-6 px-2">
            {label}
          </Badge>
        );
      },
    }),
  ];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-row items-center justify-between gap-4">
        <div className="relative flex-1 sm:flex-none sm:w-64">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            placeholder="Search tickers..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-8 h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        {/* View Toggle */}
        <div className="flex items-center space-x-1 border border-border rounded-md p-1 bg-card">
          <button
            onClick={() => onViewModeChange('table')}
            className={`p-1.5 rounded transition-colors ${viewMode === 'table' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
            title="Table View"
          >
            <List size={16} />
          </button>
          <button
            onClick={() => onViewModeChange('grid')}
            className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
            title="Grid View"
          >
            <LayoutGrid size={16} />
          </button>
        </div>
      </div>

      {/* Content Switcher */}
      {viewMode === 'table' ? (
        <AnalyzerTableView
          data={items}
          columns={columns}
          sorting={sorting}
          setSorting={setSorting}
          navigate={(path) => navigate(path)}
          isLoading={isLoading}
        />
      ) : (
        <AnalyzerGridView data={items} isLoading={isLoading} />
      )}

      {/* Pagination Controls */}
      {meta && (
        <div className="flex items-center justify-between px-2">
          <div className="text-sm text-muted-foreground">
            Showing {(page - 1) * pageSize + 1} to{' '}
            {Math.min(page * pageSize, meta.total)} of {meta.total} results
          </div>
          <div className="flex items-center space-x-2">
            <button
              className="h-8 w-8 p-0 flex items-center justify-center rounded-md border border-input bg-transparent hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || isLoading}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-sm font-medium">
              Page {page} of {meta.totalPages}
            </div>
            <button
              className="h-8 w-8 p-0 flex items-center justify-center rounded-md border border-input bg-transparent hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
              onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
              disabled={page >= meta.totalPages || isLoading}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
