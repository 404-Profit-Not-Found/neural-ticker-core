
import { Badge } from './badge';
import { Crown, Sparkles, Shield } from 'lucide-react';
import { cn } from '../../lib/utils';

export type UserTier = 'free' | 'pro' | 'whale' | string;

interface UserTierBadgeProps {
    tier?: UserTier;
    className?: string;
    showIcon?: boolean;
}

export function UserTierBadge({ tier, className, showIcon = true }: UserTierBadgeProps) {
    // Normalize tier to lowercase for consistent matching
    const normalizedTier = tier?.toLowerCase() || 'free';

    switch (normalizedTier) {
        case 'whale':
            return (
                <Badge variant="tierWhale" className={cn("gap-1 h-5 text-[10px] px-1.5", className)}>
                    {showIcon && <Crown size={10} className="mb-[1px]" />}
                    WHALE
                </Badge>
            );
        case 'pro':
            return (
                <Badge variant="tierPro" className={cn("gap-1 h-5 text-[10px] px-1.5", className)}>
                    {showIcon && <Sparkles size={10} />}
                    PRO
                </Badge>
            );
        case 'admin':
            return (
                <Badge variant="tierAdmin" className={cn("gap-1 h-5 text-[10px] px-1.5", className)}>
                    {showIcon && <Shield size={10} />}
                    ADMIN
                </Badge>
            );
        default:
            // Optional: return nothing for 'free' or a simple badge?
            // Usually 'free' users don't show a badge in this app context, but we can support it if needed.
            return null;
    }
}
