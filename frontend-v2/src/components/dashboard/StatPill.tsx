import { cn } from '../../lib/utils';
import type { LucideIcon } from 'lucide-react';
import { Skeleton } from '../ui/skeleton';

interface StatPillProps {
    icon: LucideIcon;
    label: string;
    value: string | number;
    /** The figure has not loaded yet: show a placeholder, not a number. */
    loading?: boolean;
    subValue?: React.ReactNode;
    tone?: 'primary' | 'muted' | 'accent' | 'emerald' | 'rose' | 'amber';
    onClick?: () => void;
    className?: string;
    isActive?: boolean; // selection state (Admin Console filters)
}

// One accent per tile: the icon's tint. No outline, no rail.
const TONES: Record<NonNullable<StatPillProps['tone']>, string> = {
    primary: 'text-blue-600 dark:text-blue-400',
    muted: 'text-purple-600 dark:text-purple-400',
    accent: 'text-indigo-600 dark:text-indigo-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    rose: 'text-rose-600 dark:text-rose-400',
    amber: 'text-amber-600 dark:text-amber-400',
};

/**
 * KPI tile: micro-label, one big figure, an optional delta. A tonal surface —
 * it gets lighter on hover when it is clickable and takes the signal tint
 * when it is the selected filter.
 */
export function StatPill({
    icon: Icon,
    label,
    value,
    loading,
    subValue,
    tone = 'primary',
    onClick,
    className,
    isActive
}: StatPillProps) {
    // Figures are set in the mono face; words ("Latest Feed") stay in the UI face.
    const isFigure = typeof value === 'number' || /\d/.test(value);

    return (
        <div
            onClick={onClick}
            data-tone={tone}
            aria-busy={loading || undefined}
            className={cn(
                'style-kpi group relative h-full overflow-hidden rounded-md bg-card px-4 py-3 transition-colors duration-150',
                onClick && 'cursor-pointer hover:bg-muted',
                isActive && 'bg-signal/10',
                className
            )}
        >
            <div className="flex h-full flex-col justify-between gap-3">
                <div className="flex items-center justify-between gap-2">
                    <p className={cn('label-micro truncate', isActive && 'text-signal')}>
                        {label}
                    </p>
                    <Icon className={cn('h-4 w-4 shrink-0', TONES[tone])} aria-hidden />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
                    {loading ? (
                        <Skeleton className="h-[22px] w-16" />
                    ) : (
                        <p className={cn(
                            'text-xl sm:text-[1.375rem] font-bold leading-none text-foreground',
                            isFigure ? 'num' : 'tracking-tight',
                        )}>
                            {value}
                        </p>
                    )}
                    {!loading && subValue && (
                        <div className="flex shrink-0 items-center">
                            {subValue}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
