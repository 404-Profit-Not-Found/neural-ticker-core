import { Badge } from '../ui/badge';
import { Crown, Sparkles, Mail } from 'lucide-react';
import { UserTierBadge } from '../ui/user-tier-badge';
import { UserStatusBadge } from '../ui/user-status-badge';

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
                    badges.push(<Badge key="active" variant="outline" className="text-emerald-500 border-emerald-500/20 bg-emerald-500/5 h-5 text-[10px]">ACTIVE</Badge>);
                    break;
                case 'INVITED':
                    badges.push(<Badge key="invited" className="bg-blue-500/10 text-blue-400 border-blue-500/20 h-5 text-[10px]">INVITED</Badge>);
                    break;
                case 'WAITLIST':
                    badges.push(<Badge key="waitlist" variant="secondary" className="text-amber-500 border-amber-500/20 h-5 text-[10px]">WAITLIST</Badge>);
                    break;
                case 'BANNED':
                    badges.push(<Badge key="banned" variant="destructive" className="h-5 text-[10px]">BANNED</Badge>);
                    break;
                default:
                    if (status) {
                        badges.push(<Badge key="pending" variant="outline" className="text-amber-500 border-amber-500/20 bg-amber-500/5 h-5 text-[10px]">PENDING</Badge>);
                    }
            }
        }

        return <div className="flex flex-col items-end gap-1">{badges}</div>;
    };



    return (
        <button
            onClick={() => onClick(user)}
            className="w-full text-left bg-card rounded-xl p-4 border border-border/40 shadow-sm flex flex-col gap-3 group hover:border-primary/40 transition-all hover:shadow-md relative overflow-hidden"
        >
            {/* Gradient Glow */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

            <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="relative w-10 h-10 overflow-hidden rounded-full ring-1 ring-border/50 bg-muted flex items-center justify-center shrink-0">
                        {user.avatar_url ? (
                            <img src={user.avatar_url} alt="User" className="w-full h-full object-cover" />
                        ) : (
                            <span className="text-sm font-bold text-muted-foreground">
                                {user.email?.slice(0, 2).toUpperCase() || '??'}
                            </span>
                        )}
                    </div>
                    <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-foreground truncate" title={user.nickname || user.email}>
                                {user.nickname || user.email?.split('@')[0]}
                            </span>
                            {getTierBadge(user.tier)}
                        </div>
                        <span className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                            <Mail size={10} />
                            {user.email}
                        </span>
                    </div>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                    {getStatusBadge(user.status, user.role)}
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground tabular-nums font-mono leading-none mt-1">
                        <span>{user.credits_balance?.toLocaleString() ?? 0} credits</span>
                    </div>
                </div>
            </div>
        </button>
    );
}
