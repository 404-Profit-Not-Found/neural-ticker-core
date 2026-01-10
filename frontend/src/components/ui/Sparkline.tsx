import { useMemo, useId } from 'react';
import { cn } from '../../lib/api';

interface SparklineProps {
    data: number[];
    width?: number;
    height?: number;
    className?: string;
}

export function Sparkline({ data, width = 80, height = 30, className }: SparklineProps) {
    const points = useMemo(() => {
        if (!data || data.length < 2) return [];

        const min = Math.min(...data);
        const max = Math.max(...data);
        const range = max - min || 1;
        
        // Add padding to avoid clipping (top/bottom)
        const padding = 2;
        const availableHeight = height - (padding * 2);

        return data.map((val, i) => ({
            x: (i / (data.length - 1)) * width,
            y: height - padding - ((val - min) / range) * availableHeight
        }));
    }, [data, width, height]);

    // Simple smoothing using cubic bezier control points
    const pathD = useMemo(() => {
        if (!points || points.length === 0) return '';

        // Helper to control line tension
        const tension = 0.2;

        return points.reduce((acc, point, i, a) => {
            if (i === 0) return `M ${point.x},${point.y}`;

            const p0 = a[i - 2] || a[i - 1];
            const p1 = a[i - 1];
            const p2 = point;
            const p3 = a[i + 1] || point;

            const cp1x = p1.x + (p2.x - p0.x) * tension;
            const cp1y = p1.y + (p2.y - p0.y) * tension;

            const cp2x = p2.x - (p3.x - p1.x) * tension;
            const cp2y = p2.y - (p3.y - p1.y) * tension;

            return `${acc} C ${cp1x},${cp1y} ${cp2x},${cp2y} ${point.x},${point.y}`;
        }, '');
    }, [points]);

    // Create unique ID for gradient using useId for stability (React 18+)
    const gradientId = `sparkline-gradient-${useId()}`;

    if (!points.length) return null;

    const isPositive = data[data.length - 1] >= data[0];
    const color = isPositive ? '#10b981' : '#ef4444'; // emerald-500 : red-500
    const lastPoint = points[points.length - 1];

    // Close path for fill area
    const fillPathD = `${pathD} L ${width},${height} L 0,${height} Z`;

    return (
        <div className={cn("relative", className)} style={{ width, height }}>
            <svg width={width} height={height} className="overflow-visible">
                <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                        <stop offset="100%" stopColor={color} stopOpacity="0" />
                    </linearGradient>
                    <filter id={`${gradientId}-glow`} x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                        <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>

                {/* Gradient Fill */}
                <path
                    d={fillPathD}
                    fill={`url(#${gradientId})`}
                    className="transition-all duration-300"
                />

                {/* The Line */}
                <path
                    d={pathD}
                    fill="none"
                    stroke={color}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="transition-all duration-300"
                />

                {/* Glowing Endpoint */}
                <circle
                    cx={lastPoint.x}
                    cy={lastPoint.y}
                    r="2" // Small core
                    fill={color}
                    className="animate-pulse"
                />
                <circle
                    cx={lastPoint.x}
                    cy={lastPoint.y}
                    r="4" // Outer glow
                    fill={color}
                    opacity="0.3"
                />
            </svg>
        </div>
    );
}
