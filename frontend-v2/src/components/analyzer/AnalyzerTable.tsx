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
  Brain,
  Newspaper,
  MessageCircle,
  SearchX
} from 'lucide-react';
import {
  useStockAnalyzer,
  type StockSnapshot,
} from '../../hooks/useStockAnalyzer';
import { Link, useNavigate } from 'react-router-dom';
import { AnalyzerTableView } from './AnalyzerTableView';
import { AnalyzerGridView } from './AnalyzerGridView';
import { Badge } from '../ui/badge';
import { TickerLogo } from '../dashboard/TickerLogo';
import { cn } from '../../lib/api';
import type { RatingVariant } from '../../lib/rating-utils';
import { VerdictBadge } from "../ticker/VerdictBadge";
import { FiftyTwoWeekRange } from '../dashboard/FiftyTwoWeekRange';
import { Sparkline } from "../ui/Sparkline";
import { RiskBar } from '../ui/RiskBar';
import { FavoriteStar } from '../watchlist/FavoriteStar';

import { FilterBar, type AnalyzerFilters } from './FilterBar';
import { DownsideCell, UpsideCell, type TickerColumnMeta } from './table-chrome';
import { useCurrency } from '../../context/CurrencyContext';
import { useCompactLayout } from '../../hooks/useMediaQuery';
import { SCORE_TEXT, scoreBand, snapshotToTickerData, verdictProps } from '../../lib/ticker-metrics';
import { TickerRowList, TickerRowListSkeleton } from '../dashboard/TickerListRow';
import { Button } from '../ui/button';
import { EmptyState, LoadError } from '../ui/empty-state';
import { Input } from '../ui/input';
import { SegmentedControl } from '../ui/segmented';

export interface AnalyzerTableProps {
  filters?: AnalyzerFilters;
  onFilterChange?: (
    key: keyof AnalyzerFilters,
    value: AnalyzerFilters[keyof AnalyzerFilters],
  ) => void;
  onReset?: () => void;
  viewMode: 'table' | 'grid';
  onViewModeChange: (mode: 'table' | 'grid') => void;
}

export function AnalyzerTable({
  filters,
  onFilterChange,
  onReset,
  viewMode,
  onViewModeChange,
}: AnalyzerTableProps) {
  const navigate = useNavigate();
  const { formatNative } = useCurrency();

  // UI State
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'ai_rating', desc: true },
  ]);

  // Fetch Data
  const { data, isLoading, isError, refetch } = useStockAnalyzer({
    page,
    limit: pageSize,
    sortBy: sorting[0]?.id || 'ai_rating',
    sortDir: sorting[0]?.desc ? 'DESC' : 'ASC',
    search,
    // Pass filters
    risk: filters?.risk,
    aiRating: filters?.aiRating,
    upside: filters?.upside,
    sector: filters?.sector,
    overallScore: filters?.overallScore,
    region: filters?.region,
  });

  const items = data?.items || [];
  const meta = data?.meta;

  // Column Definitions (passed to Table View)
  const columnHelper = createColumnHelper<StockSnapshot>();
  const columns = [
    // 1. Asset Column (Logo, Symbol + Star, Company, Industry + Icons)
    columnHelper.accessor((row) => row.ticker.symbol, {
      // `symbol` is the key the API sorts by (the dotted accessor id is not).
      id: 'symbol',
      header: 'Asset',
      size: 232,
      minSize: 200,
      cell: (info) => {
        const { research, news, social } = info.row.original.counts || {};
        const hasInsights = (research || 0) + (news || 0) + (social || 0) > 0;
        const ticker = info.row.original.ticker;
        // Industry first, like the rows and cards of the same ticker.
        const sector = ticker.industry || ticker.sector;

        return (
          <div className="flex items-center gap-3">
            <TickerLogo
              url={ticker.logo_url}
              symbol={info.getValue()}
              className="h-10 w-10 shrink-0 rounded-full"
            />

            <div className="flex min-w-0 flex-col gap-0.5">
              {/* Row 1: symbol (the row's keyboard target) + favourite */}
              <div className="flex items-center gap-1.5">
                <Link
                  to={`/ticker/${info.getValue()}`}
                  onClick={(e) => e.stopPropagation()}
                  className="rounded-sm text-base font-bold text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {info.getValue()}
                </Link>
                <FavoriteStar symbol={info.getValue()} size={16} className="h-6 w-6" />
              </div>

              {/* Row 2: Company Name */}
              <span className="max-w-[150px] truncate text-xs text-muted-foreground" title={ticker.name}>
                {ticker.name}
              </span>

              {/* Row 3: Industry + insight counts */}
              <div className="mt-0.5 flex items-center gap-2">
                <span className="max-w-[84px] truncate text-xs text-muted-foreground xl:max-w-[110px]" title={sector || undefined}>
                  {sector || 'Unknown'}
                </span>
                {hasInsights && (
                  <div className="num flex items-center gap-1.5 text-[11px] font-medium">
                    {research ? (
                      <span className="flex items-center gap-0.5 text-purple-400" title={`${research} AI reports`}>
                        <Brain size={11} aria-hidden />
                        {research}
                      </span>
                    ) : null}
                    {news ? (
                      <span className="flex items-center gap-0.5 text-sky-400" title={`${news} news items`}>
                        <Newspaper size={11} aria-hidden />
                        {news}
                      </span>
                    ) : null}
                    {social ? (
                      <span className="flex items-center gap-0.5 text-blue-400" title={`${social} comments`}>
                        <MessageCircle size={11} aria-hidden />
                        {social}
                      </span>
                    ) : null}
                  </div>
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
      header: 'Price',
      cell: (info) => {
        const change = info.getValue();
        const price = info.row.original.latestPrice?.close;

        if (!price) return <span className="text-muted-foreground">—</span>;

        const isPositive = (change || 0) >= 0;

        const currency = info.row.original.ticker?.currency || 'USD';

        return (
          <div className="flex flex-col items-end">
            <span className="text-sm font-mono font-medium text-foreground/70">
              {formatNative(price, currency)}
            </span>
            {change !== undefined && change !== null ? (
              <div className={cn("num flex items-center text-xs font-semibold", change === 0 ? "text-muted-foreground" : isPositive ? "text-up" : "text-down")}>
                {/* Exactly zero is neutral: no arrow, no colour. */}
                                    {change === 0 ? null : isPositive ? <ArrowUp size={12} className="mr-0.5" aria-hidden /> : <ArrowDown size={12} className="mr-0.5" aria-hidden />}
                {Math.abs(change).toFixed(2)}%
              </div>
            ) : <span className="text-xs text-muted-foreground">-</span>}
          </div>
        );
      },
    }),


    // 2.5 Sparkline
    columnHelper.accessor('sparkline', {
      header: 'Trend (14d)',
      enableSorting: false,
      cell: (info) => {
        const data = info.getValue();
        if (!data || data.length === 0) return <span className="text-muted-foreground text-xs">-</span>;
        return (
          <div className="w-[100px] h-8 flex items-center justify-center">
            <Sparkline
              data={data}
              width={100}
              height={32}
              className="opacity-80 group-hover:opacity-100 transition-opacity"
            />
          </div>
        );
      },
    }),

    // 2.75 52-Week Range
    columnHelper.display({
      id: 'fifty_two_week_range',
      header: '52-week range',
      meta: { showFrom: 'xl' } satisfies TickerColumnMeta,
      cell: (info) => {
        const row = info.row.original;
        const low = row.fundamentals?.fifty_two_week_low;
        const high = row.fundamentals?.fifty_two_week_high;
        const price = row.latestPrice?.close;

        if (!low || !high || !price) return <span className="text-muted-foreground text-xs">-</span>;

        return (
          <div className="w-[150px]">
            <FiftyTwoWeekRange
              low={Number(low)}
              high={Number(high)}
              current={price}
              showLabels={true}
              caption={false}
              currency={row.ticker?.currency || 'USD'}
            />
          </div>
        );
      },
    }),

    // 3. P/E


    // 5. Financial Risk — segmented gauge to match Watchlist
    columnHelper.accessor((row) => row.aiAnalysis?.financial_risk, {
      id: 'financial_risk',
      header: 'Risk',
      cell: (info) => <RiskBar value={info.getValue()} segments={5} />,
    }),

    // 5.5 Risk/Reward (Overall Score)
    columnHelper.accessor((row) => row.aiAnalysis?.overall_score, {
      id: 'overall_score',
      header: () => <abbr title="Risk / reward score (0–10)" className="no-underline">R/R</abbr>,
      cell: (info) => {
        const val = info.getValue();
        if (val === undefined || val === null) return <span className="text-muted-foreground">—</span>;

        return (
          <span className={cn('num text-sm font-semibold', SCORE_TEXT[scoreBand(Number(val))])}>
            {Number(val).toFixed(1)}
          </span>
        );
      },
    }),

    // 6. Upside (Base Case)
    columnHelper.accessor((row) => row.aiAnalysis?.base_price, {
      id: 'upside_percent',
      header: 'Upside',
      cell: (info) => <UpsideCell value={snapshotToTickerData(info.row.original).potentialUpside} />,
    }),

    // 6.5 Downside (Bear Case)
    columnHelper.accessor((row) => row.aiAnalysis?.bear_price, {
      id: 'downside_percent',
      header: 'Downside',
      cell: (info) => {
        const record = snapshotToTickerData(info.row.original);
        return <DownsideCell value={record.potentialDownside} estimated={record.downsideEstimated} />;
      },
    }),

    // 7. AI Rating (Sortable by Financial Risk)
    columnHelper.accessor((row) => row.aiAnalysis?.financial_risk, {
      id: 'ai_rating',
      header: 'AI Rating',
      enableSorting: true,
      cell: (info) => {
        const record = snapshotToTickerData(info.row.original);
        if (record.aiRating === '-') return <span className="text-muted-foreground">—</span>;
        // Same inputs as the row, the card and the dashboard filters.
        return <VerdictBadge {...verdictProps(record)} />;
      }
    }),

    // 8. Analyst Rating (Last)
    columnHelper.accessor((row) => row.fundamentals.consensus_rating, {
      id: 'consensus',
      header: 'Analyst',
      meta: { showFrom: 'wide' } satisfies TickerColumnMeta,
      cell: (info) => {
        const rawRating = info.getValue() as string;
        if (!rawRating || rawRating === '-') return <span className="text-muted-foreground">—</span>;

        const rLower = rawRating.toLowerCase();
        let displayRating = 'Hold';
        let variant: RatingVariant = 'hold';

        if (rLower.includes('strong buy')) {
          displayRating = 'Strong Buy';
          variant = 'strongBuy';
        } else if (rLower.includes('buy')) {
          displayRating = 'Buy';
          variant = 'buy';
        } else if (rLower.includes('sell')) {
          displayRating = 'Sell';
          variant = 'sell';
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

  const compact = useCompactLayout();
  const firstShown = meta ? (meta.total === 0 ? 0 : (page - 1) * pageSize + 1) : 0;

  return (
    <div className="space-y-4">
      {/* Toolbar: search and view switch on one line, filters on the next
          (one scrolling row on phones). From `lg` everything shares a line. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
        <div className="relative order-1 min-w-0 flex-1 lg:w-56 lg:flex-none xl:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            aria-label="Search tickers"
            placeholder="Search tickers..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="h-11 pl-9 lg:h-9"
          />
        </div>

        <SegmentedControl
          className="order-2 shrink-0 lg:order-3"
          label="View"
          size="sm"
          value={viewMode}
          onChange={onViewModeChange}
          options={[
            { value: 'table', label: <List size={16} aria-hidden />, ariaLabel: compact ? 'List view' : 'Table view' },
            { value: 'grid', label: <LayoutGrid size={16} aria-hidden />, ariaLabel: 'Card view' },
          ]}
        />

        <div className="order-3 w-full min-w-0 lg:order-2 lg:w-auto lg:flex-1">
          <FilterBar
            filters={filters || { risk: [], aiRating: [], sector: [], upside: null, overallScore: null, region: [] }}
            onFilterChange={onFilterChange || (() => { })}
            onReset={onReset || (() => { })}
          />
        </div>
      </div>

      {/* Content. Below `lg` the "table" is a list of mini-card rows. */}
      {isError && !data ? (
        <LoadError what="tickers" onRetry={() => refetch()} className="rounded-md bg-card" />
      ) : viewMode === 'grid' ? (
        <AnalyzerGridView data={items} isLoading={isLoading} onReset={onReset} />
      ) : compact ? (
        isLoading ? (
          <TickerRowListSkeleton rows={8} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<SearchX className="h-5 w-5" />}
            title="No tickers match"
            description="Try a different search or remove a filter."
            action={onReset ? <Button variant="outline" size="sm" onClick={onReset}>Reset filters</Button> : undefined}
          />
        ) : (
          <TickerRowList items={items.map(snapshotToTickerData)} />
        )
      ) : (
        <AnalyzerTableView
          data={items}
          columns={columns}
          sorting={sorting}
          setSorting={setSorting}
          navigate={(path) => navigate(path)}
          isLoading={isLoading}
        />
      )}

      {/* Pagination */}
      {meta && meta.total > 0 && (
        <nav aria-label="Pagination" className="flex items-center justify-between gap-3">
          <p className="num text-xs text-muted-foreground sm:text-sm">
            {firstShown}–{Math.min(page * pageSize, meta.total)} of {meta.total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 lg:h-8 lg:w-8"
              aria-label="Previous page"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || isLoading}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="num text-sm font-medium">
              {page} / {meta.totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 lg:h-8 lg:w-8"
              aria-label="Next page"
              onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
              disabled={page >= meta.totalPages || isLoading}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </nav>
      )}
    </div>
  );
}
