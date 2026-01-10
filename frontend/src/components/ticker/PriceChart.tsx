import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries, LineSeries, AreaSeries } from 'lightweight-charts';
import { CandlestickChart, LineChart, AreaChart as MountainChart } from 'lucide-react';
import type { IChartApi, ISeriesApi, Time, CandlestickData, LineData, AreaData } from 'lightweight-charts';
import type { CandlePoint } from '../../types/ticker';

type ChartType = 'candle' | 'line' | 'mountain';

interface PriceChartProps {
    data: CandlePoint[];
    className?: string;
}

export function PriceChart({ data, className }: PriceChartProps) {
    const [chartType, setChartType] = useState<ChartType>(() => {
        if (typeof window !== 'undefined') {
            return (localStorage.getItem('ticker_chart_type') as ChartType) || 'mountain';
        }
        return 'mountain';
    });
    const [activeRange, setActiveRange] = useState<'1Y' | '2Y' | '5Y'>(() => {
        if (typeof window !== 'undefined') {
            return (localStorage.getItem('ticker_chart_range') as '1Y' | '2Y' | '5Y') || '1Y';
        }
        return '1Y';
    });

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
        if (!chart || !data) return;

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

        if (seriesRef.current && data.length > 0) {
            let formattedData: (CandlestickData | LineData | AreaData)[] = [];

            // Filter by Time Range
            const now = new Date();
            let cutoffDate = new Date(0); // Default all time (5Y)

            if (activeRange === '1Y') {
                cutoffDate = new Date();
                cutoffDate.setFullYear(now.getFullYear() - 1);
            } else if (activeRange === '2Y') {
                cutoffDate = new Date();
                cutoffDate.setFullYear(now.getFullYear() - 2);
            }
            // 5Y is effectively "all" since backend limits to 5Y

            const rangeFilteredData = data.filter(d => new Date(d.ts) >= cutoffDate);


            // Filter and transform data
            const validPoints = rangeFilteredData
                .filter(d => d && d.ts && d.close !== undefined && d.close !== null)
                .map(d => ({
                    ...d,
                    time: (new Date(d.ts).getTime() / 1000) as Time,
                }))
                .filter(p => !isNaN(p.time as number))
                .sort((a, b) => (a.time as number) - (b.time as number));

            // Remove duplicate timestamps (lightweight-charts requirement)
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
                } catch (e) {
                    console.error('Failed to set chart data:', e);
                }
            }
        }
    }, [data, chartType, activeRange]);

    const chartTypes: { id: ChartType; label: string; icon: React.ElementType }[] = [
        { id: 'mountain', label: 'Mountain', icon: MountainChart },
        { id: 'line', label: 'Line', icon: LineChart },
        { id: 'candle', label: 'Candles', icon: CandlestickChart },
    ];

    return (
        <div className={`relative w-full h-full min-h-[180px] ${className}`}>
            {/* Toolbar Container */}
            <div className="absolute top-2 left-2 z-10 flex items-center gap-2">
                {/* Chart Type Selector */}
                <div className="flex bg-muted/20 backdrop-blur-md rounded-md border border-border/40 p-0.5 shadow-sm">
                    {chartTypes.map((type) => (
                        <button
                            key={type.id}
                            onClick={() => setChartType(type.id)}
                            className={`p-1.5 rounded transition-all duration-200 ${chartType === type.id
                                    ? 'bg-primary text-primary-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                                }`}
                            title={type.label}
                        >
                            <type.icon size={14} />
                        </button>
                    ))}
                </div>

                {/* Time Range Selector */}
                <div className="flex bg-muted/20 backdrop-blur-md rounded-md border border-border/40 p-0.5 shadow-sm">
                    {(['1Y', '2Y', '5Y'] as const).map((range) => (
                        <button
                            key={range}
                            onClick={() => setActiveRange(range)}
                            className={`px-2 py-1 text-[10px] font-medium rounded transition-all duration-200 ${activeRange === range
                                    ? 'bg-primary text-primary-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                                }`}
                        >
                            {range}
                        </button>
                    ))}
                </div>
            </div>

            <div
                ref={chartContainerRef}
                className="w-full h-full"
            />
        </div>
    );
}
