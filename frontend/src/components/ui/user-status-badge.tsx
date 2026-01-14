
import { Badge } from './badge';
import { CheckCircle, Clock, Ban, Mail } from 'lucide-react';
import { cn } from '../../lib/utils';

export type UserStatus = 'ACTIVE' | 'INVITED' | 'WAITLIST' | 'BANNED' | string;

interface UserStatusBadgeProps {
    status?: UserStatus;
    className?: string;
    showIcon?: boolean;
}

export function UserStatusBadge({ status, className, showIcon = true }: UserStatusBadgeProps) {
    const normalizedStatus = status?.toUpperCase() || 'UNKNOWN';

    switch (normalizedStatus) {
        case 'ACTIVE':
            return (
                <Badge variant="statusActive" className={cn("gap-1 h-5 text-[10px] px-1.5", className)}>
                    {showIcon && <CheckCircle size={10} />}
                    ACTIVE
                </Badge>
            );
        case 'INVITED':
            return (
                <Badge variant="statusInvited" className={cn("gap-1 h-5 text-[10px] px-1.5", className)}>
                    {showIcon && <Mail size={10} />}
                    INVITED
                </Badge>
            );
        case 'WAITLIST':
            return (
                <Badge variant="statusWaitlist" className={cn("gap-1 h-5 text-[10px] px-1.5", className)}>
                    {showIcon && <Clock size={10} />}
                    WAITLIST
                </Badge>
            );
        case 'BANNED':
            return (
                <Badge variant="statusBanned" className={cn("gap-1 h-5 text-[10px] px-1.5", className)}>
                    {showIcon && <Ban size={10} />}
                    BANNED
                </Badge>
            );
        default:
            return null;
    }
}
