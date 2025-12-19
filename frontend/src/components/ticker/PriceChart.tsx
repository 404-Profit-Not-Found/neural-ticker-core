import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries, LineSeries, AreaSeries } from 'lightweight-charts';
import { CandlestickChart, LineChart, AreaChart as MountainChart } from 'lucide-react';
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import type { CandlePoint } from '../../types/ticker';

type ChartType = 'candle' | 'line' | 'mountain';

interface PriceChartProps {
    data: CandlePoint[];
    className?: string;
}

export function PriceChart({ data, className }: PriceChartProps) {
    const [chartType, setChartType] = useState<ChartType>('mountain');
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<any> | null>(null);

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
        };
    }, []);

    useEffect(() => {
        if (!chartRef.current || !data) return;

        // Remove old series if it exists
        if (seriesRef.current) {
            chartRef.current.removeSeries(seriesRef.current);
            seriesRef.current = null;
        }

        const chart = chartRef.current;

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
            let formattedData: any[] = [];

            if (chartType === 'candle') {
                formattedData = data.map(d => ({
                    time: (new Date(d.ts).getTime() / 1000) as Time,
                    open: d.open,
                    high: d.high,
                    low: d.low,
                    close: d.close,
                }));
            } else {
                formattedData = data.map(d => ({
                    time: (new Date(d.ts).getTime() / 1000) as Time,
                    value: d.close,
                }));
            }

            formattedData.sort((a, b) => (a.time as number) - (b.time as number));
            seriesRef.current.setData(formattedData);
            chart.timeScale().fitContent();
        }
    }, [data, chartType]);

    const chartTypes: { id: ChartType; label: string; icon: React.ElementType }[] = [
        { id: 'mountain', label: 'Mountain', icon: MountainChart },
        { id: 'line', label: 'Line', icon: LineChart },
        { id: 'candle', label: 'Candles', icon: CandlestickChart },
    ];

    return (
        <div className={`relative w-full h-full min-h-[180px] ${className}`}>
            {/* Chart Type Selector - Top Left (to avoid price overlap on right) */}
            <div className="absolute top-2 left-2 z-10 flex bg-muted/20 backdrop-blur-md rounded-md border border-border/40 p-0.5 shadow-sm">
                {chartTypes.map((type) => (
                    <button
                        key={type.id}
                        onClick={() => setChartType(type.id)}
                        className={`p-1.5 rounded transition-all duration-200 ${
                            chartType === type.id
                                ? 'bg-primary text-primary-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                        }`}
                        title={type.label}
                    >
                        <type.icon size={14} />
                    </button>
                ))}
            </div>

            <div 
                ref={chartContainerRef} 
                className="w-full h-full"
            />
        </div>
    );
}
