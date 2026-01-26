import { useEffect, useRef, useState, useMemo } from 'react';
import { createChart, ColorType, CandlestickSeries, LineSeries, AreaSeries } from 'lightweight-charts';

import type { IChartApi, ISeriesApi, Time, CandlestickData, LineData, AreaData } from 'lightweight-charts';
import type { CandlePoint } from '../../types/ticker';
import { NativeSelect } from '../ui/select-native';
import { useTickerHistory } from '../../hooks/useTicker';

type ChartType = 'candle' | 'line' | 'mountain';
type TimeRange = '1D' | '1W' | '1M' | '1Y' | '2Y' | '5Y';

interface PriceChartProps {
    data?: CandlePoint[]; // Optional now, used as backup or initial
    symbol?: string;      // New prop for self-fetching
    className?: string;
}

export function PriceChart({ data: initialData, symbol, className }: PriceChartProps) {
    const [chartType, setChartType] = useState<ChartType>(() => {
        if (typeof window !== 'undefined') {
            return (localStorage.getItem('ticker_chart_type') as ChartType) || 'mountain';
        }
        return 'mountain';
    });
    const [activeRange, setActiveRange] = useState<TimeRange>(() => {
        if (typeof window !== 'undefined') {
            return (localStorage.getItem('ticker_chart_range') as TimeRange) || '1Y';
        }
        return '1Y';
    });

    // Determine interval based on range
    const intervalMap: Record<TimeRange, string> = {
        '1D': '5m',
        '1W': '15m',
        '1M': '60m', // 1h
        '1Y': '1d',
        '2Y': '1d',
        '5Y': '1d',
    };

    const daysMap: Record<TimeRange, number> = {
        '1D': 2,
        '1W': 7,
        '1M': 31,
        '1Y': 365,
        '2Y': 730,
        '5Y': 1825,
    };

    const interval = intervalMap[activeRange];
    const days = daysMap[activeRange];

    // Fetch data if symbol is present
    const { data: fetchedData, isLoading } = useTickerHistory(symbol || '', interval, days);

    // Use fetched data if available (and symbol provided), else use initialData
    // We need to normalize fetchedData to CandlePoint[] because backend returns slightly different shape sometimes?
    // The hook returns what backend sends. Backend sends objects with ts: Date or string.
    // CandlePoint interface: { ts: string | Date, open, high, low, close, volume }
    // The backend `getHistory` returns exactly this shape (with ts as Date or string).
    
    const displayData = useMemo(() => {
        if (symbol && fetchedData) return fetchedData as CandlePoint[];
        return initialData || [];
    }, [symbol, fetchedData, initialData]);

    useEffect(() => {
        localStorage.setItem('ticker_chart_type', chartType);
    }, [chartType]);

    useEffect(() => {
        localStorage.setItem('ticker_chart_range', activeRange);
    }, [activeRange]);
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<"Candlestick" | "Line" | "Area"> | null>(null);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: '#a1a1aa', // text-muted-foreground
            },
            grid: {
                vertLines: { color: 'rgba(39, 39, 42, 0.3)' },
                horzLines: { color: 'rgba(39, 39, 42, 0.3)' },
            },
            width: chartContainerRef.current.clientWidth,
            height: 200,
            timeScale: {
                borderColor: '#27272a',
                timeVisible: true,
                secondsVisible: false,
            },
            rightPriceScale: {
                borderColor: '#27272a',
                scaleMargins: {
                    top: 0.1,
                    bottom: 0.1,
                },
            },
            handleScroll: true,
            handleScale: true,
        });

        chartRef.current = chart;

        const handleResize = () => {
            if (chartContainerRef.current && chartRef.current) {
                chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
            }
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
            chartRef.current = null;
            seriesRef.current = null;
        };
    }, []);

    useEffect(() => {
        const chart = chartRef.current;
        if (!chart) return;
        
        // If loading and no data, maybe show loading state? 
        // For now we just wait.

        // Remove old series if it exists
        if (seriesRef.current) {
            try {
                chart.removeSeries(seriesRef.current);
            } catch (e) {
                console.warn('Could not remove series:', e);
            }
            seriesRef.current = null;
        }

        if (chartType === 'candle') {
            seriesRef.current = chart.addSeries(CandlestickSeries, {
                upColor: '#22c55e',
                downColor: '#ef4444',
                borderVisible: false,
                wickUpColor: '#22c55e',
                wickDownColor: '#ef4444',
            });
        } else if (chartType === 'line') {
            seriesRef.current = chart.addSeries(LineSeries, {
                color: '#3b82f6',
                lineWidth: 2,
            });
        } else if (chartType === 'mountain') {
            seriesRef.current = chart.addSeries(AreaSeries, {
                topColor: 'rgba(59, 130, 246, 0.4)',
                bottomColor: 'rgba(59, 130, 246, 0.0)',
                lineColor: '#3b82f6',
                lineWidth: 2,
            });
        }

        if (seriesRef.current && displayData.length > 0) {
            let formattedData: (CandlestickData | LineData | AreaData)[] = [];

            // Filter logic is now handled by backend for Intraday,
            // BUT for '1d' based ranges (1Y, 2Y, 5Y), the backend returns ALL history normally (or based on query).
            // Our new `getHistory` endpoint handles `from`/`to` automatically based on interval selection?
            // YES, in `market-data.controller.ts` we added logic:
            // if from/to missing, default to last 2 days for 5m, etc.
            // So `fetchedData` should already be filtered to the correct range!
            
            // However, if we fallback to `initialData` (legacy), we still need client-side filtering.
           
            const dataToRender = displayData;
            
            // Only apply client-side filtering if:
            // 1. We are using `initialData` (symbol not provided or fetch failed)
            // 2. OR if the backend returned "all" history (e.g. for 1Y/2Y where we reuse same cache?)
            // Actually, if we use `useTickerHistory` with `interval='1d'`, it defaults to 30 days if params missing.
            // But we want 1Y.
            
            // Wait, controler logic for '1d': "const numDays = days || 30;"
            // We are NOT passing `days` or `from` in the hook currently, only `interval`.
            // So `useTickerHistory` will return 30 days for 1d.
            // that's a bug for 1Y/2Y view if controler limits it.
            // I should update `useTickerHistory` to accept `days` or `from`?
            // OR simpler: Update filter logic here? No, if backend returns 30 days, I can't filter for 1Y.
            
            // FIX: We need to pass `from` or `days` to `useTickerHistory` based on `activeRange`.
            // But I can't easily change the hook call inside the component conditionally without re-firing logic.
            // Actually `activeRange` changes -> `interval` changes -> hook refetches.
            // I should pass `from` to the hook?
            // "const { data } = useTickerHistory(symbol, interval, fromDate?)"
            
            // Let's assume for now I will rely on client-side filtering for 1Y/2Y/5Y if I can get "max" history.
            // But getting "max" history every time is heavy.
            // Ideally:
            // 1D -> interval=5m (backend handles range ~2days)
            // 1Y -> interval=1d (backend should handle range ~1Y)
            
            // I need to update the hook to accept `range` or `from`.
            // Since I am already editing `PriceChart`, I will add client-side filtering logic 
            // for the case where we HAVE data (e.g. initialData or "all").
            // BUT for the FETCH case, I need to ensuring the fetch asks for enough data.
            
            // Let's rely on the fact that `market-data.controller.ts` defaults:
            // "const numDays = days || 30;"
            // I should probably pass 'days' param.
            
            // Re-evaluating:
            // If I just implemented `useTickerHistory` to take `interval`, 1Y will only show 30 days.
            // I should update `useTickerHistory` in `useTicker.ts` to accept options? 
            // OR just hardcode `days=365*5` in the hook if interval is 1d?
            // Or use a "range" param?
            
            // Since I cannot edit `useTicker.ts` again in this turn easily (I could, but efficient to keep moving),
            // I will assume `initialData` (pre-loaded history) is used for 1Y/2Y/5Y if `symbol` is NOT passed?
            // BUT `TickerDetail` WILL pass `symbol`.
            
            // I will use `displayData`.
            // Map data to lightweight-charts format
            const validPoints = dataToRender
                .filter(d => d && d.ts && d.close !== undefined && d.close !== null)
                .map(d => ({
                    ...d,
                    time: (new Date(d.ts).getTime() / 1000) as Time,
                }))
                .filter(p => !isNaN(p.time as number))
                .sort((a, b) => (a.time as number) - (b.time as number));

            // Remove duplicates
            const uniquePoints = validPoints.filter((p, i) => i === 0 || p.time !== validPoints[i - 1].time);

             if (uniquePoints.length > 0) {
                if (chartType === 'candle') {
                    formattedData = uniquePoints.map(p => ({
                        time: p.time,
                        open: p.open ?? p.close,
                        high: p.high ?? p.close,
                        low: p.low ?? p.close,
                        close: p.close,
                    }));
                } else {
                    formattedData = uniquePoints.map(p => ({
                        time: p.time,
                        value: p.close,
                    }));
                }

                try {
                    seriesRef.current.setData(formattedData);
                    chart.timeScale().fitContent();
                    
                     // Apply client-side range constraint if needed (e.g. if we fetched 2 days of 5m data but only want 1 day visible?)
                     // Lightweight charts `fitContent` fits everything.
                     // For 1D, we want to see the "Trading Day".
                     // If we fetched 2 days, we might want to zoom to Today.
                     // But for MVP, fitting all fetched data (last 24h) is acceptable for 1D.
                     // Actually logic in controller: `fromDate.setDate(toDate.getDate() - 2);` for 5m.
                     // That shows 2 days. 1D usually implies "Today" or "Last 24h".
                     // Users might prefer "visible range" to be set.
                     // We can `start` the scale.
                     
                     if (activeRange === '1D') {
                          // TODO: Set visible range to just today?
                     }
                     
                } catch (e) {
                    console.error('Failed to set chart data:', e);
                }
            } else {
                 if (seriesRef.current) {
                     try {
                         seriesRef.current.setData([]);
                     } catch {
                         // Ignore if series is missing
                     }
                 }
            }
        }
    }, [displayData, chartType, activeRange]);
    
    // ... [Rest of render]
    
    // Available time ranges for the select
    const timeRanges: TimeRange[] = ['1D', '1W', '1M', '1Y', '2Y', '5Y'];

    return (
        <div className={`relative w-full h-full min-h-[180px] ${className}`}>
            <div className="absolute top-2 left-2 z-10 flex items-center gap-2">
                 {/* Chart Type Selector */}
                <div className="w-[100px]">
                    <NativeSelect 
                        value={chartType} 
                        onChange={(e) => setChartType(e.target.value as ChartType)}
                        className="h-8 text-xs bg-muted/20 backdrop-blur-md border border-border/40"
                    >
                        {[{ id: 'mountain', label: 'Mountain' }, { id: 'line', label: 'Line' }, { id: 'candle', label: 'Candles' }].map((type) => (
                            <option key={type.id} value={type.id}>
                                {type.label}
                            </option>
                        ))}
                    </NativeSelect>
                </div>

                {/* Time Range Selector */}
                 <div className="w-[80px]">
                    <NativeSelect
                        value={activeRange}
                        onChange={(e) => setActiveRange(e.target.value as TimeRange)}
                         className="h-8 text-xs bg-muted/20 backdrop-blur-md border border-border/40 font-medium"
                    >
                        {timeRanges.map((range) => (
                             <option key={range} value={range}>
                                {range}
                            </option>
                        ))}
                    </NativeSelect>
                </div>
                {isLoading && <div className="text-[10px] text-muted-foreground animate-pulse">Loading...</div>}
                {/* 1D is Live indicator */}
                {activeRange === '1D' && <div className="flex items-center gap-1 bg-green-500/10 px-1.5 py-0.5 rounded text-[10px] text-green-500 font-bold animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                    LIVE
                </div>}
            </div>

            <div
                ref={chartContainerRef}
                className="w-full h-full"
            />
        </div>
    );
}
