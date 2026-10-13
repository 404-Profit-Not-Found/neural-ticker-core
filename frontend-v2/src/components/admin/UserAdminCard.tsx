import { formatDateTime, formatTimeAgo } from '../../lib/datetime';
import { Badge } from '../ui/badge';
import { Mail } from 'lucide-react';
import { UserTierBadge } from '../ui/user-tier-badge';

// Define interface compatible with AdminConsole user objects
export interface AdminUser {
    id?: string;
    email: string;
    nickname?: string;
    avatar_url?: string;
    tier: 'free' | 'pro' | 'whale';
    role: string;
    status: 'ACTIVE' | 'BANNED' | 'WAITLIST' | 'INVITED' | 'ADMIN';
    created_at?: string;
    invited_at?: string;
    last_login?: string;
    credits_balance?: number;
}

interface UserAdminCardProps {
    user: AdminUser;
    onClick: (user: AdminUser) => void;
}

export function UserAdminCard({ user, onClick }: UserAdminCardProps) {

    const getTierBadge = (tier: string) => <UserTierBadge tier={tier} />;

    const getStatusBadge = (status: string, role: string) => {
        const badges = [];
        const isAdmin = role === 'admin' || status === 'ADMIN';

        if (isAdmin) {
            badges.push(<UserTierBadge key="admin" tier="admin" />);
        }

        if (status !== 'ADMIN') {
            switch (status) {
                case 'ACTIVE':
                    badges.push(<Badge key="active" variant="outline" className="text-up bg-emerald-500/5 h-5 text-[11px]">ACTIVE</Badge>);
                    break;
                case 'INVITED':
                    badges.push(<Badge key="invited" className="bg-blue-500/10 text-blue-400 h-5 text-[11px]">INVITED</Badge>);
                    break;
                case 'WAITLIST':
                    badges.push(<Badge key="waitlist" variant="secondary" className="text-amber-500 h-5 text-[11px]">WAITLIST</Badge>);
                    break;
                case 'BANNED':
                    badges.push(<Badge key="banned" variant="destructive" className="h-5 text-[11px]">BANNED</Badge>);
                    break;
                default:
                    if (status) {
                        badges.push(<Badge key="pending" variant="outline" className="text-amber-500 bg-amber-500/5 h-5 text-[11px]">PENDING</Badge>);
                    }
            }
        }

        return <div className="flex flex-col items-end gap-1">{badges}</div>;
    };



    return (
        <button
            onClick={() => onClick(user)}
            className="group relative flex w-full flex-col gap-3 rounded-lg bg-card p-4 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >

            <div className="flex w-full items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="relative w-10 h-10 overflow-hidden rounded-full bg-muted flex items-center justify-center shrink-0">
                        {user.avatar_url ? (
                            <img src={user.avatar_url} alt="User" className="w-full h-full object-cover" />
                        ) : (
                            <span className="text-sm font-bold text-muted-foreground">
                                {user.email?.slice(0, 2).toUpperCase() || '??'}
                            </span>
                        )}
                    </div>
                    <div className="flex flex-col min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                            <span className="text-sm font-bold text-foreground truncate" title={user.nickname || user.email}>
                                {user.nickname || user.email?.split('@')[0]}
                            </span>
                            {getTierBadge(user.tier)}
                        </div>
                        {/* `truncate` only works on the text node's own box, not on a flex row. */}
                        <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                            <Mail size={12} className="shrink-0" aria-hidden />
                            <span className="truncate">{user.email}</span>
                        </span>
                    </div>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                    {getStatusBadge(user.status, user.role)}
                    <div className="num mt-1 flex items-center gap-1 text-[11px] leading-none text-muted-foreground">
                        <span>{user.credits_balance?.toLocaleString() ?? 0} credits</span>
                    </div>
                    <div className="num text-[11px] leading-none text-muted-foreground" title={user.last_login ? formatDateTime(user.last_login) : undefined}>
                        {user.last_login ? `seen ${formatTimeAgo(user.last_login)}` : 'never signed in'}
                    </div>
                </div>
            </div>
        </button>
    );
}
