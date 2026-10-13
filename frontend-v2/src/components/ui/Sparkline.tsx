import { useId, useMemo } from 'react';
import { cn } from '../../lib/api';

interface SparklineProps {
    data: number[];
    width?: number;
    height?: number;
    className?: string;
    /** What the series covers, for the text alternative ("14-day trend"). */
    label?: string;
}

/**
 * A small trend line. It draws the samples it was given and nothing else:
 * straight segments between points (no smoothing that would invent values in
 * between), one static end dot, colours from the theme's up/down tokens, and
 * no looping animation.
 */
export function Sparkline({ data, width = 80, height = 30, className, label = 'Trend' }: SparklineProps) {
    const gradientId = `sparkline-${useId()}`;

    const points = useMemo(() => {
        if (!data || data.length < 2) return [];
        const min = Math.min(...data);
        const max = Math.max(...data);
        const range = max - min || 1;
        // Padding keeps the stroke and the end dot inside the box.
        const padding = 3;
        const available = height - padding * 2;
        return data.map((value, i) => ({
            x: (i / (data.length - 1)) * (width - padding) + padding / 2,
            y: height - padding - ((value - min) / range) * available,
        }));
    }, [data, width, height]);

    if (points.length === 0) return null;

    const first = data[0];
    const last = data[data.length - 1];
    const changePct = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
    const flat = Math.abs(changePct) < 0.005;
    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const end = points[points.length - 1];
    const area = `${line} L${end.x.toFixed(1)},${height} L${points[0].x.toFixed(1)},${height} Z`;

    return (
        <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={`${label}: ${flat ? 'unchanged' : `${changePct > 0 ? '+' : '−'}${Math.abs(changePct).toFixed(1)}%`}`}
            // The stroke and fill take the current text colour.
            className={cn('shrink-0 overflow-visible', flat ? 'text-muted-foreground' : changePct > 0 ? 'text-up' : 'text-down', className)}
        >
            <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={area} fill={`url(#${gradientId})`} />
            <path d={line} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={end.x} cy={end.y} r="2" fill="currentColor" />
        </svg>
    );
}
