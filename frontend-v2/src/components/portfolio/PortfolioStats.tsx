import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip,
  ComposedChart, Area, CartesianGrid
} from 'recharts';
import { TrendingUp, TrendingDown, Bot, AlertTriangle, Wallet, History, Info } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { format, parseISO } from 'date-fns';
import { useCurrency } from '../../context/CurrencyContext';
import { Skeleton } from '../ui/skeleton';
import { PageHeader } from '../ui/page-header';
import { SegmentedControl } from '../ui/segmented';
import {
  PORTFOLIO_RANGES,
  usePortfolioHistory,
  type PortfolioPositionRow,
  type PortfolioRange,
} from '../../hooks/usePortfolioHistory';

interface Position {
  symbol: string;
  shares: number;
  buy_price: number;
  current_price: number;
  current_value?: number;
  buy_date?: string;
  sector?: string;
  ticker?: { sector?: string; name?: string };
  fundamentals?: { sector?: string };
  [key: string]: unknown;
}

interface PortfolioStatsProps {
  totalValue: number;
  totalGainLoss: number;
  totalGainLossPercent: number;
  positions: Position[];
  onAnalyze: () => void;
  credits?: number;
  todayGain?: number;
  todayGainPct?: number;
  /** Currency code the totals are denominated in (empty string when NATIVE). */
  displayCurrency?: string;
  /** True when the Portfolio is showing each row in its own native currency. */
  isNativeMode?: boolean;
  /** Count of rows the backend could not convert (FX rate missing). */
  conversionUnavailable?: number;
  /** Total simulator cash, converted to displayCurrency (from /portfolio/summary). */
  cashValue?: number;
  /** Net worth = holdings + cash, in displayCurrency. Falls back to holdings. */
  netWorth?: number;
  /** Opens the deposit/withdraw cash dialog. */
  onManageCash?: () => void;
  /** Opens the trade-history dialog. */
  onViewHistory?: () => void;
}

// Professional Palette - Carbon/Minimalist
const COLORS = [
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
];

const RANGES = PORTFOLIO_RANGES;
type Range = PortfolioRange;

// 'YYYY-MM-DD' → axis / tooltip labels. Parsed as a calendar date (no time
// zone shift), so the label always matches the trading day.
const axisDay = (day: string): string => format(parseISO(day), 'MMM dd');
const fullDay = (day: string): string => format(parseISO(day), 'EEE, MMM d, yyyy');

// Standard Tooltip (Theme-Aware)
const CustomTooltip = ({ active, payload, label, currency }: { active?: boolean; payload?: Array<Record<string, unknown>>; label?: string; currency?: string }) => {
  if (active && payload && payload.length) {
    const formatCurrency = (val: number) =>
      new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(val);

    // History points carry the day and the trades made on it.
    const point = payload[0]?.payload as
      | { date?: string; bought?: string[]; sold?: string[] }
      | undefined;
    const heading = point?.date ? fullDay(point.date) : label;

    return (
      <div className="rounded-lg bg-popover p-3 text-xs shadow-2xl shadow-black/60">
        <p className="font-semibold text-popover-foreground mb-1.5">{heading}</p>
        {payload.map((entry, index: number) => (
          <p key={index} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: (entry.color || entry.stroke) as string }} />
            <span className="text-muted-foreground">{entry.name as string}:</span>
            <span className="font-medium text-popover-foreground">{typeof entry.value === 'number' ? formatCurrency(entry.value) : entry.value as string}</span>
          </p>
        ))}
        {(point?.bought?.length || point?.sold?.length) ? (
          <div className="mt-2 space-y-0.5">
            {point?.bought?.map((sym) => (
              <p key={`b-${sym}`} className="flex items-center gap-1.5 font-semibold text-up">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Bought {sym}
              </p>
            ))}
            {point?.sold?.map((sym) => (
              <p key={`s-${sym}`} className="flex items-center gap-1.5 font-semibold text-down">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                Sold {sym}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    );
  }
  return null;
};

const renderPieLabel = ({ cx, cy, sectorCount }: { cx: number; cy: number; sectorCount: number }) => {
  return (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
      <tspan x={cx} dy="-0.3em" className="fill-muted-foreground text-[11px] font-medium">{sectorCount === 1 ? 'Sector' : 'Sectors'}</tspan>
      <tspan x={cx} dy="1.3em" className="fill-foreground text-sm font-bold">{sectorCount}</tspan>
    </text>
  );
};

export function PortfolioStats({
  totalValue,
  totalGainLoss,
  totalGainLossPercent,
  positions,
  onAnalyze,
  credits = 0,
  displayCurrency: portfolioCurrency,
  isNativeMode = false,
  conversionUnavailable = 0,
  cashValue,
  netWorth,
  onManageCash,
  onViewHistory,
}: PortfolioStatsProps) {

  const [range, setRange] = useState<Range>('1M');
  const { formatCurrency: ctxFormatCurrency, displayCurrency: ctxDisplayCurrency } = useCurrency();

  // Prefer the Portfolio-local currency (passed in from the page) over the
  // context default — the page owns the truth now that the global selector
  // has been removed.
  const effectiveCurrency = portfolioCurrency || ctxDisplayCurrency;
  // In NATIVE mode the totals are a mathematically meaningless sum of values
  // across different currencies; we render "MIXED" instead.
  const formatTotal = (val: number): string =>
    isNativeMode ? 'MIXED' : ctxFormatCurrency(val, effectiveCurrency);
  const formatCurrency = (val: number): string =>
    ctxFormatCurrency(val, effectiveCurrency);
  const displayCurrency = effectiveCurrency;


  // --- Data Preparation ---

  // 1. Sector Allocation with percentages for legend
  const { sectorData, sectorWithPercent } = useMemo(() => {
    const map = new Map<string, number>();
    let total = 0;
    positions.forEach(p => {
      const sector = p.ticker?.sector || p.fundamentals?.sector || 'Other';
      const val = Number(p.current_value || 0);
      map.set(sector, (map.get(sector) || 0) + val);
      total += val;
    });
    const data = Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const withPercent = data.map(item => ({
      ...item,
      percent: total > 0 ? ((item.value / total) * 100).toFixed(1) : '0'
    }));

    return { sectorData: data, sectorWithPercent: withPercent };
  }, [positions]);

  // 2. Holdings history — real, not simulated: the trade ledger × actual
  // daily closes (see lib/portfolio-history.ts). While it loads, or when it
  // cannot be computed, the chart says so instead of drawing a made-up line.
  const history = usePortfolioHistory(
    positions as unknown as PortfolioPositionRow[],
    range,
    isNativeMode ? '' : effectiveCurrency,
  );
  const series = history.status === 'ready' ? history.series : null;
  const historyData = series?.points ?? [];
  const hasHistory = historyData.some((p) => p.value > 0 || p.invested > 0);

  // Performance over the selected range, net of money added or withdrawn.
  const periodGain = series?.periodGain ?? 0;
  const periodGainPct = series?.periodGainPct ?? 0;
  const isPeriodProfit = periodGain >= 0;

  const historyNotes: string[] = [];
  if (history.status === 'ready') {
    if (history.usesFxConversion) historyNotes.push("Past values use today's exchange rates");
    if (history.series.missingHistory.length > 0) {
      historyNotes.push(`No price history for ${history.series.missingHistory.join(', ')} — shown at cost`);
    }
    if (history.series.excluded.length > 0) {
      historyNotes.push(`${history.series.excluded.join(', ')} not charted — no exchange rate`);
    }
  }

  const isProfit = totalGainLoss >= 0;
  const isFlat = Math.abs(totalGainLoss) < 0.005;
  const hasPositions = positions.length > 0;
  const chartColor = isProfit ? '#10b981' : '#f43f5e'; // Emerald-500 or Rose-500


  return (
    <div className="w-full space-y-4 sm:space-y-5">

      {/* Header Section */}
      <PageHeader
        title="My Portfolio"
        description="Real-time cross-asset performance analytics"
        actions={
          <>
            {onViewHistory && (
              <Button
                onClick={onViewHistory}
                variant="outline"
                size="sm"
                className="h-11 min-w-11 gap-2 px-3 text-xs lg:h-9"
                title="View trade history"
                aria-label="View trade history"
              >
                <History size={16} />
                <span className="hidden sm:inline">History</span>
              </Button>
            )}
            {onManageCash && (
              <Button
                onClick={onManageCash}
                variant="outline"
                size="sm"
                className="h-11 min-w-11 gap-2 px-3 text-xs lg:h-9"
                title="Deposit or withdraw simulator cash"
                aria-label="Deposit or withdraw simulator cash"
              >
                <Wallet size={16} />
                <span className="hidden sm:inline">Cash</span>
              </Button>
            )}
            <Button
              onClick={onAnalyze}
              disabled={credits <= 0}
              size="sm"
              className={cn(
                "h-11 min-w-11 gap-2 px-3 text-xs lg:h-9",
                credits > 0
                  ? "bg-violet-600 text-white hover:bg-violet-700"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
              title={credits <= 0 ? "Insufficient credits to analyze" : "Click to analyze portfolio with AI"}
              aria-label="Analyze portfolio with AI"
            >
              <Bot size={16} />
              <span className="hidden sm:inline">AI Analyze</span>
            </Button>
          </>
        }
      />

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3 lg:gap-4">

        {/* 1. Portfolio Performance Chart (Main Card) */}
        <div className={cn("flex flex-col rounded-lg bg-card sm:h-72 lg:h-80", hasPositions ? "lg:col-span-2" : "lg:col-span-3")}>
          <div className="flex flex-col gap-3 p-4 pb-2 sm:flex-row sm:items-start sm:justify-between sm:p-6 sm:pb-2">
            <div className="min-w-0">
              <p
                className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1"
                title={
                  isNativeMode
                    ? 'Pick a single currency to see totals — summing across currencies is not meaningful.'
                    : undefined
                }
              >
                Net Worth
              </p>
              <h2 className="num text-2xl font-bold tracking-tight text-foreground">
                {formatTotal(netWorth ?? totalValue)}
              </h2>
              {!isNativeMode && cashValue !== undefined && (
                <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-muted-foreground">
                  <span className="whitespace-nowrap">Holdings <span className="num font-semibold text-foreground">{formatCurrency(totalValue)}</span></span>
                  <span className="whitespace-nowrap">Cash <span className="num font-semibold text-foreground">{formatCurrency(cashValue)}</span></span>
                  {/* The Invested column is hidden on phones; keep the figure with its siblings. */}
                  <span className="whitespace-nowrap sm:hidden">Invested <span className="num font-semibold text-foreground">{formatTotal(totalValue - totalGainLoss)}</span></span>
                </p>
              )}
              {isNativeMode ? (
                <div className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-md text-xs font-semibold bg-muted/60 text-muted-foreground">
                  Switch from NATIVE to a single currency for totals
                </div>
              ) : hasPositions ? (
                // With nothing held there is no return to report — not "+0.00%" in green.
                <div className={cn(
                  "num mt-2 inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-semibold",
                  isFlat ? "bg-muted text-muted-foreground" : isProfit ? "bg-up/10 text-up" : "bg-down/10 text-down"
                )}>
                  {isFlat ? null : isProfit ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                  {isFlat ? '' : isProfit ? '+' : '−'}{formatCurrency(Math.abs(totalGainLoss))} ({isFlat ? '' : totalGainLossPercent >= 0 ? '+' : '−'}{Math.abs(totalGainLossPercent).toFixed(2)}%) <span className="ml-1 font-sans font-medium text-muted-foreground">All Time</span>
                </div>
              ) : null}
              {conversionUnavailable > 0 && !isNativeMode && (
                <span
                  className="inline-flex items-center gap-1 mt-2 ml-2 text-[11px] font-medium text-amber-600 dark:text-amber-400 cursor-help"
                  title={`Live FX rate unavailable for ${conversionUnavailable} of ${positions.length} position(s) — those rows are shown in their native currency.`}
                >
                  <AlertTriangle size={12} />
                  {conversionUnavailable} in native FX
                </span>
              )}
            </div>

            {/* Middle: Invested Amount */}
             <div className="hidden sm:flex flex-col items-center justify-center pt-1">
              <span className="label-micro mb-0.5">Invested</span>
              <span className="num text-xl font-bold text-foreground">
                {formatTotal(totalValue - totalGainLoss)}
              </span>
            </div>

            {/* Range Selectors & Period Gain */}
            <div className="flex flex-col gap-2 sm:items-end">
              <SegmentedControl
                label="Chart range"
                size="sm"
                value={range}
                onChange={setRange}
                options={RANGES.map((r) => ({ value: r, label: r }))}
                className="max-sm:flex max-sm:w-full max-sm:[&>button]:min-h-11 max-sm:[&>button]:flex-1"
              />

              {/* Selected Period Gain */}
              {history.status === 'loading' ? (
                <Skeleton className="h-4 w-36" />
              ) : series && hasHistory ? (
                <div
                  className={cn(
                    "num flex flex-wrap items-center gap-x-1.5 text-xs font-semibold",
                    isPeriodProfit ? "text-up" : "text-down"
                  )}
                  title="Change in holdings value over this period, excluding money added or withdrawn"
                >
                  {isPeriodProfit ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                  {isPeriodProfit ? '+' : '−'}{formatCurrency(Math.abs(periodGain))} ({periodGainPct >= 0 ? '+' : ''}{periodGainPct.toFixed(2)}%) <span className="ml-1 font-sans font-medium text-muted-foreground">{range}</span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Chart Area */}
          <div className="relative h-44 w-full px-3 pb-2 sm:h-auto sm:min-h-0 sm:flex-1 sm:px-4">
            {history.status === 'loading' ? (
              <div className="h-full w-full flex flex-col justify-end gap-2 pb-2" role="status" aria-label="Loading holdings history">
                <Skeleton className="h-full w-full rounded-lg" />
              </div>
            ) : history.status === 'mixed-currency' ? (
              <div className="h-full w-full flex flex-col items-center justify-center text-center px-6 gap-1.5">
                <Info size={18} className="text-muted-foreground" aria-hidden />
                <p className="text-sm font-medium text-foreground">Pick a display currency to chart your holdings</p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Your positions trade in different currencies, so their values can&apos;t be added up in native mode.
                </p>
              </div>
            ) : !hasHistory ? (
              <div className="h-full w-full flex flex-col items-center justify-center text-center px-6 gap-1.5">
                <TrendingUp size={18} className="text-muted-foreground" aria-hidden />
                <p className="text-sm font-medium text-foreground">No holdings in this period</p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Once you hold a position, its real daily value is charted here.
                </p>
              </div>
            ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={historyData} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorValuePortfolio" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColor} stopOpacity={0.1} />
                    <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={true} strokeDasharray="3 3" stroke="var(--border)" opacity={0.2} />
                <XAxis
                  dataKey="date"
                  tickFormatter={axisDay}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  interval="preserveStartEnd"
                  minTickGap={50}
                  dy={4}
                />
                <YAxis
                  orientation="right"
                  width={40}
                  tickFormatter={(value) => new Intl.NumberFormat('en-US', { notation: "compact", compactDisplay: "short" }).format(value)}
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  domain={['auto', 'auto']}
                  hide={false}
                />
                <Tooltip
                  content={<CustomTooltip currency={displayCurrency} />}
                  cursor={{ stroke: '#9ca3af', strokeWidth: 1, strokeDasharray: '4 4' }}
                />
                <Area
                  // Straight segments between real daily closes — no smoothing
                  // that would suggest values the market never printed.
                  type="linear"
                  dataKey="value"
                  name="Holdings value"
                  stroke={chartColor}
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorValuePortfolio)"
                  isAnimationActive={false}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  dot={(props: any) => {
                    const { cx, cy, payload } = props;
                    const bought = payload?.bought?.length > 0;
                    const sold = payload?.sold?.length > 0;
                    if (!bought && !sold) return <g key={payload?.date} />;
                    return (
                      <circle
                        key={payload.date}
                        cx={cx}
                        cy={cy}
                        r={4}
                        fill={bought ? '#ffffff' : 'rgb(var(--card))'}
                        stroke={bought ? '#10b981' : '#f43f5e'}
                        strokeWidth={2}
                      />
                    );
                  }}
                />
                 <Area
                  type="stepAfter"
                  dataKey="invested"
                  name="Cost basis"
                  stroke="#6366f1" // Indigo-500
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  fill="none"
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
            )}
          </div>
          {historyNotes.length > 0 && (
            <p className="-mt-1 flex items-start gap-1.5 px-4 pb-3 text-[11px] leading-snug text-muted-foreground sm:px-6">
              <Info size={12} className="mt-px shrink-0" aria-hidden />
              <span>{historyNotes.join(' · ')}</span>
            </p>
          )}
        </div>

        {/* 2. Sector Allocation — only when there is something to allocate */}
        {hasPositions && (
        <div className="flex flex-col rounded-lg bg-card p-4 sm:p-5 lg:h-80">
          <h3 className="label-micro mb-3">Allocation</h3>
          <div className="flex min-h-0 flex-1 items-center justify-center gap-4 lg:flex-col lg:gap-3 xl:flex-row xl:gap-4">
            <div className="w-[140px] h-[140px] flex-shrink-0 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    // Drawn complete on the first frame: an entrance animation
                    // that stalls (a background tab) leaves a broken chart.
                    isAnimationActive={false}
                    data={sectorData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={65}
                    paddingAngle={2}
                    stroke="none"
                    cornerRadius={3}
                    labelLine={false}
                    label={(props: { cx: number; cy: number }) => renderPieLabel({ ...props, sectorCount: sectorData.length })}
                  >
                    {sectorData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                        className="hover:opacity-80 transition-opacity"
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {/* Legend */}
            <div className="min-w-0 max-w-[16rem] flex-1 space-y-2.5 lg:w-full lg:flex-none xl:w-auto xl:flex-1">
              {sectorWithPercent.slice(0, 6).map((item, index) => (
                <div key={item.name} className="flex items-center gap-2 text-xs">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-muted-foreground truncate flex-1">{item.name}</span>
                  <span className="num font-medium text-foreground">{item.percent}%</span>
                </div>
              ))}
              {sectorWithPercent.length > 6 && (
                <div className="pl-5 text-[11px] text-muted-foreground">
                  +{sectorWithPercent.length - 6} more
                </div>
              )}
            </div>
          </div>
        </div>
        )}

      </div>
    </div>
  );

}
