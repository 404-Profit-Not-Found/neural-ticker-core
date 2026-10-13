import { cn } from '../../lib/api';
import { riskBand, type RiskBand } from '../../lib/ticker-metrics';

interface RiskBarProps {
    value: number | null | undefined;
    max?: number;
    segments?: number;
    showValue?: boolean;
    size?: 'sm' | 'md';
    className?: string;
}

const FILL: Record<RiskBand, [filled: string, empty: string]> = {
    low: ['bg-up', 'bg-up/20'],
    medium: ['bg-amber-500 dark:bg-yellow-500', 'bg-amber-500/20 dark:bg-yellow-500/20'],
    high: ['bg-down', 'bg-down/20'],
};

/**
 * A 0–10 risk score as a few bars plus its number. Bars, colour and number
 * are all derived from the one rounded value, so the same score always looks
 * the same: "3" is always the same bars in the same colour, in every view.
 */
export function RiskBar({
    value,
    max = 10,
    segments,
    showValue = true,
    size = 'md',
    className,
}: RiskBarProps) {
    if (value === null || value === undefined || !Number.isFinite(value)) {
        return <span className="text-muted-foreground">—</span>;
    }

    const segCount = segments ?? max;
    const shown = Math.round(Math.max(0, Math.min(max, value)));
    const filled = Math.ceil((shown / max) * segCount);
    const [fill, empty] = FILL[riskBand(shown)];

    return (
        <div className={cn('flex items-center', size === 'sm' ? 'gap-1' : 'gap-2', className)}>
            <div className="flex gap-[2px]" role="img" aria-label={`Risk ${shown} of ${max}`}>
                {Array.from({ length: segCount }, (_, i) => (
                    <div
                        key={i}
                        className={cn(size === 'sm' ? 'h-2 w-1' : 'h-3 w-1.5', 'rounded-[1px]', i < filled ? fill : empty)}
                    />
                ))}
            </div>
            {showValue && (
                <span aria-hidden className={cn('num text-muted-foreground', size === 'sm' ? 'text-[11px]' : 'text-xs')}>
                    {shown}
                </span>
            )}
        </div>
    );
}
