import { cn } from '../../lib/utils';
import type { LucideIcon } from 'lucide-react';

interface StatPillProps {
    icon: LucideIcon;
    label: string;
    value: string | number;
    subValue?: React.ReactNode;
    tone?: 'primary' | 'muted' | 'accent' | 'emerald' | 'rose' | 'amber';
    onClick?: () => void;
    className?: string;
    isActive?: boolean; // Added for Admin Console selection state
}

export function StatPill({
    icon: Icon,
    label,
    value,
    subValue,
    tone = 'primary',
    onClick,
    className,
    isActive
}: StatPillProps) {
    const gradients: Record<string, string> = {
        primary: 'linear-gradient(90deg, #22d3ee, #2563eb)',
        muted: 'linear-gradient(90deg, #a855f7, #6366f1)',
        accent: 'linear-gradient(90deg, #6366f1, #a855f7)',
        emerald: 'linear-gradient(90deg, #22c55e, #14b8a6)',
        rose: 'linear-gradient(90deg, #f472b6, #e11d48)',
        amber: 'linear-gradient(90deg, #fbbf24, #d97706)',
    };

    const iconColors: Record<string, string> = {
        primary: 'text-blue-600 dark:text-blue-400',
        muted: 'text-purple-600 dark:text-purple-300',
        accent: 'text-indigo-600 dark:text-indigo-300',
        emerald: 'text-emerald-600 dark:text-emerald-300',
        rose: 'text-rose-600 dark:text-rose-300',
        amber: 'text-amber-600 dark:text-amber-300',
    };

    // If I make them all look like dashboard cards, how do I show selection?
    // Maybe "selected" = colored border, "unselected" = gray border?

    // Always use gradient border for consistent aesthetics
    const backgroundStyle = {
        background: `linear-gradient(rgb(var(--card)), rgb(var(--card))) padding-box, ${gradients[tone]} border-box`,
    };

    return (
        <div
            onClick={onClick}
            className={cn(
                'style-kpi relative overflow-hidden rounded-md border-2 border-transparent px-3 py-2 sm:px-4 sm:py-3 h-full transition-all duration-200',
                onClick && 'cursor-pointer hover:scale-[1.02]',
                isActive && 'bg-accent/5 shadow-md ring-1 ring-primary/20', // distinct active state
                !isActive && onClick && 'opacity-90 hover:opacity-100', // slight fade for unselected
                className
            )}
            style={backgroundStyle}
        >
            <div
                className="style-kpi-grid absolute inset-0 opacity-25 pointer-events-none"
                style={{
                    backgroundImage:
                        'linear-gradient(rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.2) 1px, transparent 1px)',
                    backgroundSize: '18px 18px',
                }}
                aria-hidden
            />
            <div className="relative z-10 flex items-start justify-between gap-2 sm:gap-3">
                <div className="space-y-0.5 sm:space-y-1">
                    <p className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {label}
                    </p>
                    <div className="flex items-baseline gap-2">
                        <p className="text-lg sm:text-2xl font-bold text-foreground leading-tight">
                            {value}
                        </p>
                        {subValue && (
                            <div className="flex items-center">
                                {subValue}
                            </div>
                        )}
                    </div>
                </div>
                <Icon className={cn('w-4 h-4 sm:w-5 sm:h-5', iconColors[tone])} />
            </div>
        </div>
    );
}
