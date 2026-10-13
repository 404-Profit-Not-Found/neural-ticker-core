import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { UserTierBadge } from '../ui/user-tier-badge';
import { UserStatusBadge } from '../ui/user-status-badge';
import type { AdminUser } from './UserAdminCard';
import { Gift, Ban, CheckCircle, Clock, Shield, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { SegmentedControl } from '../ui/segmented';
import { formatDateTime, formatTimeAgo } from '../../lib/datetime';
import { cn } from '../../lib/utils';

interface UserDetailDialogProps {
    user: AdminUser | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onUpdateTier: (userId: string, tier: 'free' | 'pro' | 'whale') => void;
    onUpdateRole: (userId: string, role: string) => void;
    onRevoke: (user: AdminUser) => void;
    onUnban: (user: AdminUser) => void;
    onApprove: (email: string) => void;
    onGiftCredits: (user: AdminUser) => void;
    onResetTutorial: (userId: string) => void;
}

export function UserDetailDialog({
    user,
    open,
    onOpenChange,
    onUpdateTier,
    onUpdateRole,
    onRevoke,
    onUnban,
    onApprove,
    onGiftCredits,
    onResetTutorial
}: UserDetailDialogProps) {
    if (!user) return null;

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard');
    };

    const getTierBadge = (tier: string) => <UserTierBadge tier={tier} />;

    const tiers = ['free', 'pro', 'whale'] as const;
    const currentTier = (tiers as readonly string[]).includes(user.tier ?? '') ? (user.tier as (typeof tiers)[number]) : 'free';
    const action = "h-11 justify-start gap-2 lg:h-10";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-full">
                <DialogHeader>
                    <div className="flex items-start gap-4">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xl font-bold text-muted-foreground">
                            {user.avatar_url ? (
                                <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
                            ) : (
                                (user.nickname || user.email)?.slice(0, 2).toUpperCase()
                            )}
                        </div>
                        {/* min-w-0: a long nickname truncates and a long address wraps, instead of pushing out of the dialog. */}
                        <div className="min-w-0 flex-1">
                            <DialogTitle className="truncate text-lg leading-snug">
                                {user.nickname || user.email?.split('@')[0]}
                            </DialogTitle>
                            <DialogDescription className="break-all text-sm">
                                {user.email}
                            </DialogDescription>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {getTierBadge(user.tier)}
                                {(user.role === 'admin' || user.status === 'ADMIN') && <UserTierBadge tier="admin" />}
                                <UserStatusBadge status={user.status} />
                            </div>
                        </div>
                    </div>
                </DialogHeader>

                <div className="grid grid-cols-1 gap-5 pb-2">
                    {/* Facts: unboxed, read together */}
                    <dl className="grid grid-cols-2 gap-4 text-sm">
                        <div className="min-w-0">
                            <dt className="label-micro flex items-center gap-1">
                                <Clock size={12} aria-hidden /> {user.status === 'INVITED' ? 'Invited' : 'Joined'}
                            </dt>
                            <dd className="num mt-1 text-[13px] text-foreground">{formatDateTime(user.created_at || user.invited_at)}</dd>
                        </div>
                        <div className="min-w-0">
                            <dt className="label-micro">Last login</dt>
                            <dd className="num mt-1 text-[13px] text-foreground" title={user.last_login ? formatDateTime(user.last_login) : undefined}>
                                {user.last_login ? formatTimeAgo(user.last_login) : 'Never'}
                            </dd>
                        </div>
                        <div className="min-w-0">
                            <dt className="label-micro">User ID</dt>
                            <dd className="mt-1">
                                {user.id ? (
                                    <button
                                        type="button"
                                        onClick={() => copyToClipboard(user.id as string)}
                                        aria-label="Copy user ID"
                                        className="num -my-2 flex min-h-11 w-full items-center gap-2 rounded-md text-left text-[13px] text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-8"
                                    >
                                        <span className="truncate">{user.id}</span>
                                        <Copy size={14} className="text-muted-foreground" aria-hidden />
                                    </button>
                                ) : (
                                    <span className="text-muted-foreground">—</span>
                                )}
                            </dd>
                        </div>
                    </dl>

                    {/* Actions List */}
                    <div className="flex flex-col gap-2">
                        <p className="label-micro mb-1">Actions</p>

                        {user.id && (
                            <Button variant="outline" className={action} onClick={() => onGiftCredits(user)}>
                                <Gift size={16} className="text-amber-400" />
                                Gift Credits
                            </Button>
                        )}

                        <SegmentedControl
                            label="Tier"
                            fill
                            className="max-lg:[&>button]:min-h-11"
                            value={currentTier}
                            onChange={(tier) => user.id && onUpdateTier(user.id, tier)}
                            options={tiers.map((tier) => ({
                                value: tier,
                                label: tier.charAt(0).toUpperCase() + tier.slice(1),
                                disabled: !user.id,
                            }))}
                        />

                        {user.status === 'WAITLIST' && (
                            <Button
                                className={cn(action, "bg-up/10 text-up hover:bg-up/20")}
                                variant="outline"
                                onClick={() => onApprove(user.email)}
                            >
                                <CheckCircle size={16} />
                                Approve User
                            </Button>
                        )}

                        {user.role === 'admin' ? (
                            <Button
                                variant="outline"
                                className={action}
                                onClick={() => user.id && onUpdateRole(user.id, 'user')}
                                disabled={!user.id}
                            >
                                <Shield size={16} className="text-amber-400" />
                                Remove Admin Role
                            </Button>
                        ) : (
                            <Button
                                variant="outline"
                                className={action}
                                onClick={() => user.id && onUpdateRole(user.id, 'admin')}
                                disabled={!user.id}
                            >
                                <Shield size={16} className="text-violet-500" />
                                Promote to Admin
                            </Button>
                        )}

                        {user.status !== 'BANNED' ? (
                            <Button
                                variant="outline"
                                className={cn(action, "text-down hover:bg-down/10 hover:text-down")}
                                onClick={() => onRevoke(user)}
                            >
                                <Ban size={16} />
                                Revoke Access (Ban)
                            </Button>
                        ) : (
                            <Button
                                className={cn(action, "bg-up/10 text-up hover:bg-up/20")}
                                variant="outline"
                                onClick={() => onUnban(user)}
                            >
                                <CheckCircle size={16} />
                                Unban User
                            </Button>
                        )}

                        {user.id && (
                            <Button
                                variant="outline"
                                className={action}
                                onClick={() => user.id && onResetTutorial(user.id)}
                            >
                                <Clock size={16} className="text-orange-500" />
                                Reset Tutorial State
                            </Button>
                        )}
                    </div>
                </div>

                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
