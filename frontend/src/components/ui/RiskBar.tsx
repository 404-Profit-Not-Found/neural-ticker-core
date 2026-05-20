import { cn } from '../../lib/api';

interface RiskBarProps {
    value: number | null | undefined;
    max?: number;
    segments?: number;
    showValue?: boolean;
    size?: 'sm' | 'md';
    className?: string;
}

export function RiskBar({
    value,
    max = 10,
    segments,
    showValue = true,
    size = 'md',
    className,
}: RiskBarProps) {
    if (value === null || value === undefined) {
        return <span className="text-muted-foreground">-</span>;
    }

    const segCount = segments ?? max;
    const clamped = Math.max(0, Math.min(max, value));
    const filled = Math.round((clamped / max) * segCount);

    // Risk-tier colors: green (low) → yellow (medium) → red (high)
    let fillColor = 'bg-emerald-500';
    let fillColorDim = 'bg-emerald-500/20';
    if (clamped > 6.5) {
        fillColor = 'bg-red-500';
        fillColorDim = 'bg-red-500/20';
    } else if (clamped > 3.5) {
        fillColor = 'bg-yellow-500';
        fillColorDim = 'bg-yellow-500/20';
    }

    const segHeight = size === 'sm' ? 'h-2' : 'h-3';
    const segWidth = size === 'sm' ? 'w-1' : 'w-1.5';
    const gap = size === 'sm' ? 'gap-1' : 'gap-2';

    return (
        <div className={cn('flex items-center', gap, className)}>
            <div className="flex gap-[2px]" aria-label={`Risk ${Math.round(clamped)} of ${max}`}>
                {Array.from({ length: segCount }, (_, i) => (
                    <div
                        key={i}
                        className={cn(
                            segHeight,
                            segWidth,
                            'rounded-[1px] transition-colors',
                            i < filled ? fillColor : fillColorDim,
                        )}
                    />
                ))}
            </div>
            {showValue && (
                <span className={cn('font-mono text-muted-foreground tabular-nums', size === 'sm' ? 'text-[10px]' : 'text-xs')}>
                    {Math.round(clamped)}
                </span>
            )}
        </div>
    );
}
