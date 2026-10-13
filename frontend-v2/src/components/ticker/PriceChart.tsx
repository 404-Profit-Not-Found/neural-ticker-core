import { useEffect, useMemo, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries, LineSeries, AreaSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, Time, MouseEventParams, CandlestickData, LineData, AreaData } from 'lightweight-charts';
import { AreaChart, CandlestickChart, LineChart } from 'lucide-react';
import type { CandlePoint } from '../../types/ticker';
import { SegmentedControl } from '../ui/segmented';
import { Skeleton } from '../ui/skeleton';
import { Led } from '../ui/panel';
import { useTickerHistory } from '../../hooks/useTicker';
import { cn } from '../../lib/utils';
import {
    directionClass,
    directionOf,
    formatAxisPrice,
    formatChangePercent,
    formatPrice,
    priceDecimals,
} from '../../lib/format';
import { DEFAULT_LOCALE, formatDate, formatDateTime } from '../../lib/datetime';

type ChartType = 'candle' | 'line' | 'mountain';
type TimeRange = '1D' | '1W' | '1M' | '1Y' | '2Y' | '5Y';

interface PriceChartProps {
    /** Preloaded series; the only data source when no `symbol` is given. */
    data?: CandlePoint[];
    /** With a symbol the chart fetches its own history per range. */
    symbol?: string;
    className?: string;
    /** Currency of the instrument, for the read-out above the plot. */
    currency?: string;
    /**
     * True while the instrument's market is in its regular session. Only then
     * does the intraday view say "Live" — the indicator reports real activity.
     */
    marketOpen?: boolean;
}

const RANGES: TimeRange[] = ['1D', '1W', '1M', '1Y', '2Y', '5Y'];
const TYPES: ChartType[] = ['mountain', 'line', 'candle'];

const INTERVAL: Record<TimeRange, string> = { '1D': '5m', '1W': '15m', '1M': '60m', '1Y': '1d', '2Y': '1d', '5Y': '1d' };
const DAYS: Record<TimeRange, number> = { '1D': 2, '1W': 7, '1M': 31, '1Y': 365, '2Y': 730, '5Y': 1825 };
const INTRADAY: ReadonlySet<TimeRange> = new Set<TimeRange>(['1D', '1W', '1M']);

const TYPE_KEY = 'ticker_chart_type';
const RANGE_KEY = 'ticker_chart_range';

function stored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
    try {
        const value = localStorage.getItem(key) as T | null;
        return value && allowed.includes(value) ? value : fallback;
    } catch {
        return fallback;
    }
}

function remember(key: string, value: string) {
    try {
        localStorage.setItem(key, value);
    } catch {
        /* storage unavailable: the choice still applies for this visit */
    }
}

interface Point {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
}

function toPoints(data: CandlePoint[]): Point[] {
    const valid = data
        .filter((d) => d && d.ts && d.close !== undefined && d.close !== null)
        .map((d) => ({
            time: Math.floor(new Date(d.ts).getTime() / 1000),
            open: d.open ?? d.close,
            high: d.high ?? d.close,
            low: d.low ?? d.close,
            close: d.close,
        }))
        .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.close))
        .sort((a, b) => a.time - b.time);
    // The chart rejects duplicate timestamps.
    return valid.filter((p, i) => i === 0 || p.time !== valid[i - 1].time);
}

/** Theme token (`--name: r g b`) as a CSS colour the canvas can use. */
function token(name: string, alpha = 1, fallback = '128 128 128'): string {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
    return `rgba(${raw.split(/[\s,]+/).join(', ')}, ${alpha})`;
}

const LINE_COLOR = '#3b82f6';

export function PriceChart({ data: initialData, symbol, className, currency = 'USD', marketOpen }: PriceChartProps) {
    const [chartType, setChartType] = useState<ChartType>(() => stored(TYPE_KEY, TYPES, 'mountain'));
    const [activeRange, setActiveRange] = useState<TimeRange>(() => stored(RANGE_KEY, RANGES, '1Y'));
    const [hover, setHover] = useState<{ time: number; value: number } | null>(null);

    // Without a symbol the series is static: there is nothing to re-fetch, so
    // no range control is offered and the hook stays idle.
    const { data: fetchedData, isLoading } = useTickerHistory(symbol || '', INTERVAL[activeRange], DAYS[activeRange]);

    const points = useMemo(() => {
        const source = symbol && fetchedData ? (fetchedData as CandlePoint[]) : initialData || [];
        return toPoints(source);
    }, [symbol, fetchedData, initialData]);

    // A close-only series (the public report) has no candles to draw.
    const hasOhlc = useMemo(() => points.some((p) => p.high !== p.low || p.open !== p.close), [points]);
    const type: ChartType = chartType === 'candle' && !hasOhlc ? 'mountain' : chartType;
    const intraday = !!symbol && INTRADAY.has(activeRange);

    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<'Candlestick' | 'Line' | 'Area'> | null>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const chart = createChart(container, {
            // Follows the container, so the plot can never be wider than its box.
            autoSize: true,
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: token('--muted-foreground'),
                fontFamily: getComputedStyle(document.body).fontFamily,
                fontSize: 11,
            },
            grid: {
                vertLines: { visible: false },
                horzLines: { color: token('--foreground', 0.06) },
            },
            timeScale: {
                borderVisible: false,
                secondsVisible: false,
            },
            rightPriceScale: {
                borderVisible: false,
                scaleMargins: { top: 0.12, bottom: 0.08 },
                // A tick at the very edge is dropped rather than drawn half-cut.
                entireTextOnly: true,
            },
            crosshair: {
                vertLine: { color: token('--muted-foreground', 0.5), labelBackgroundColor: token('--muted') },
                horzLine: { color: token('--muted-foreground', 0.5), labelBackgroundColor: token('--muted') },
            },
            localization: {
                // The axis follows the app's language, not the browser's: by
                // default the library prints month names in the OS locale
                // ("máj", "okt") inside an otherwise English page.
                locale: DEFAULT_LOCALE,
                priceFormatter: (price: number) => formatAxisPrice(price),
            },
            handleScroll: true,
            handleScale: true,
        });
        chartRef.current = chart;

        const onMove = (param: MouseEventParams) => {
            const series = seriesRef.current;
            const row = series && param.time !== undefined ? param.seriesData.get(series) : undefined;
            if (!row || typeof param.time !== 'number') {
                setHover(null);
                return;
            }
            const value = 'close' in row ? row.close : 'value' in row ? row.value : undefined;
            setHover(typeof value === 'number' ? { time: param.time, value } : null);
        };
        chart.subscribeCrosshairMove(onMove);

        return () => {
            chart.unsubscribeCrosshairMove(onMove);
            chart.remove();
            chartRef.current = null;
            seriesRef.current = null;
        };
    }, []);

    useEffect(() => {
        const chart = chartRef.current;
        if (!chart) return;

        if (seriesRef.current) {
            try {
                chart.removeSeries(seriesRef.current);
            } catch (e) {
                console.warn('Could not remove series:', e);
            }
            seriesRef.current = null;
        }

        // The axis shows clock times only when the bars are intraday; a daily
        // bar labelled "00:00" is noise. Timestamps are plotted in UTC.
        chart.applyOptions({
            // `fitContent` keeps this many empty bars after the last point, so
            // the last axis label is drawn whole instead of cut by the edge.
            timeScale: { timeVisible: intraday, rightOffset: Math.max(1, Math.round(points.length * 0.03)) },
            localization: {
                timeFormatter: (time: Time) =>
                    typeof time === 'number'
                        ? intraday
                            ? `${formatDateTime(time, { timeZone: 'UTC' })} UTC`
                            : formatDate(time, { timeZone: 'UTC' })
                        : String(time),
            },
        });

        const last = points[points.length - 1];
        const precision = last ? priceDecimals(last.close) : 2;
        const priceFormat = { type: 'price' as const, precision, minMove: 1 / 10 ** precision };

        if (type === 'candle') {
            seriesRef.current = chart.addSeries(CandlestickSeries, {
                upColor: token('--up'),
                downColor: token('--down'),
                borderVisible: false,
                wickUpColor: token('--up'),
                wickDownColor: token('--down'),
                priceFormat,
            });
        } else if (type === 'line') {
            seriesRef.current = chart.addSeries(LineSeries, { color: LINE_COLOR, lineWidth: 2, priceFormat });
        } else {
            seriesRef.current = chart.addSeries(AreaSeries, {
                topColor: 'rgba(59, 130, 246, 0.35)',
                bottomColor: 'rgba(59, 130, 246, 0)',
                lineColor: LINE_COLOR,
                lineWidth: 2,
                priceFormat,
            });
        }

        const formatted: (CandlestickData | LineData | AreaData)[] =
            type === 'candle'
                ? points.map((p) => ({ time: p.time as Time, open: p.open, high: p.high, low: p.low, close: p.close }))
                : points.map((p) => ({ time: p.time as Time, value: p.close }));

        try {
            seriesRef.current.setData(formatted);
            chart.timeScale().fitContent();
        } catch (e) {
            console.error('Failed to set chart data:', e);
        }
    }, [points, type, intraday]);

    const first = points[0];
    const last = points[points.length - 1];
    const periodChange = first && last && first.close > 0 ? ((last.close - first.close) / first.close) * 100 : null;
    const direction = directionOf(periodChange);
    const shown = hover ?? (last ? { time: last.time, value: last.close } : null);
    const isEmpty = points.length === 0;
    const showLive = intraday && activeRange === '1D' && marketOpen === true;

    const typeOptions = [
        { value: 'mountain' as const, label: <AreaChart className="h-4 w-4" aria-hidden />, ariaLabel: 'Area chart' },
        { value: 'line' as const, label: <LineChart className="h-4 w-4" aria-hidden />, ariaLabel: 'Line chart' },
        ...(hasOhlc || isEmpty
            ? [{ value: 'candle' as const, label: <CandlestickChart className="h-4 w-4" aria-hidden />, ariaLabel: 'Candlestick chart' }]
            : []),
    ];

    const rangeControl = (phone: boolean) => (
        <SegmentedControl
            label="Chart range"
            size="sm"
            fill={phone}
            // 44px targets on touch layouts (phones and tablets).
            className={phone ? '[&>button]:min-h-11 [&>button]:px-1' : undefined}
            value={activeRange}
            onChange={(value) => {
                setActiveRange(value);
                remember(RANGE_KEY, value);
            }}
            options={RANGES.map((r) => ({ value: r, label: r }))}
        />
    );

    return (
        <div className={cn('flex h-full w-full min-w-0 flex-col', className)}>
            {/* Read-out and controls sit above the plot, never on top of it. */}
            <div className="flex min-h-11 items-center justify-between gap-3 px-3 pt-2 sm:px-3.5">
                <div className="min-w-0" aria-live="off">
                    {shown ? (
                        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                            <span className="num text-sm font-semibold text-foreground">{formatPrice(shown.value, currency)}</span>
                            {hover ? (
                                <span className="num text-xs text-muted-foreground">
                                    {intraday
                                        ? `${formatDateTime(hover.time, { timeZone: 'UTC' })} UTC`
                                        : formatDate(hover.time, { timeZone: 'UTC' })}
                                </span>
                            ) : (
                                periodChange !== null && (
                                    <span className={cn('num text-xs font-medium', directionClass(direction))}>
                                        {formatChangePercent(periodChange)}
                                        <span className="ml-1.5 font-normal text-muted-foreground">
                                            {symbol ? `past ${activeRange}` : 'over this period'}
                                        </span>
                                    </span>
                                )
                            )}
                            {showLive && !hover && (
                                <span className="label-micro inline-flex items-center gap-1.5 text-up">
                                    <Led tone="up" pulse /> Live
                                </span>
                            )}
                        </div>
                    ) : (
                        <span className="label-micro">Price history</span>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    {symbol && <div className="hidden lg:block">{rangeControl(false)}</div>}
                    <SegmentedControl
                        label="Chart type"
                        size="sm"
                        className="[&>button]:min-h-11 [&>button]:min-w-11 [&>button]:px-0 lg:[&>button]:min-h-7 lg:[&>button]:min-w-8"
                        value={type}
                        onChange={(value) => {
                            setChartType(value);
                            remember(TYPE_KEY, value);
                        }}
                        options={typeOptions}
                    />
                </div>
            </div>

            <div className="relative min-h-0 flex-1">
                <div ref={containerRef} className="absolute inset-0" />
                {isEmpty && (
                    <div className="absolute inset-0 flex items-center justify-center p-4">
                        {isLoading ? (
                            <Skeleton className="h-full w-full" aria-label="Loading price history" />
                        ) : (
                            <p className="text-sm text-muted-foreground">No price history for this range.</p>
                        )}
                    </div>
                )}
            </div>

            {symbol && <div className="px-2 pb-2 pt-1 lg:hidden">{rangeControl(true)}</div>}
        </div>
    );
}
