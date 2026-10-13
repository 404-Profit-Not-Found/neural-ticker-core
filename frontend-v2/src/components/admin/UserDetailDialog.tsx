import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { UserTierBadge } from '../ui/user-tier-badge';
import { UserStatusBadge } from '../ui/user-status-badge';
import { Gift, Ban, CheckCircle, RotateCcw, Shield, ShieldOff, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { SegmentedControl } from '../ui/segmented';
import { formatDateTime } from '../../lib/datetime';
import { cn } from '../../lib/utils';
import { UserAvatar } from './admin-ui';
import { isAdminUser, userName, type AdminUser } from './model';

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

const TIERS = ['free', 'pro', 'whale'] as const;

// One quiet tonal button per action; only what approves or revokes is coloured.
const ACTION = 'h-11 justify-start gap-2.5 px-3 lg:h-9';
const ACTION_ICON = 'h-4 w-4 shrink-0 text-muted-foreground';

/**
 * Everything about one user, and everything an admin can do to the account:
 * a bottom sheet on phones, a dialog on desktop.
 */
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

    const currentTier = (TIERS as readonly string[]).includes(user.tier ?? '') ? (user.tier as (typeof TIERS)[number]) : 'free';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-full">
                <DialogHeader>
                    <div className="flex items-center gap-3.5">
                        <UserAvatar
                            email={user.email}
                            nickname={user.nickname}
                            avatarUrl={user.avatar_url}
                            className="h-12 w-12 text-base"
                        />
                        {/* min-w-0: a long nickname truncates and a long address wraps, instead of pushing out of the dialog. */}
                        <div className="min-w-0 flex-1">
                            <DialogTitle className="truncate text-lg leading-snug">
                                {userName(user)}
                            </DialogTitle>
                            <DialogDescription className="break-all text-sm">
                                {user.email}
                            </DialogDescription>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-2">
                        <UserTierBadge tier={user.tier} />
                        {isAdminUser(user) && <UserTierBadge tier="admin" />}
                        <UserStatusBadge status={user.status} />
                    </div>
                </DialogHeader>

                <div className="space-y-5">
                    {/* Facts: unboxed, read together */}
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                        <div className="min-w-0">
                            <dt className="label-micro">{user.status === 'INVITED' ? 'Invited' : 'Joined'}</dt>
                            <dd className="num mt-1 text-[13px] text-foreground">{formatDateTime(user.created_at || user.invited_at)}</dd>
                        </div>
                        <div className="min-w-0">
                            <dt className="label-micro">Credits</dt>
                            <dd className="num mt-1 text-[13px] text-foreground">
                                {user.credits_balance != null ? user.credits_balance.toLocaleString() : <span className="text-muted-foreground">—</span>}
                            </dd>
                        </div>
                        <div className="col-span-2 min-w-0">
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
                                        <Copy size={14} className="shrink-0 text-muted-foreground" aria-hidden />
                                    </button>
                                ) : (
                                    <span className="text-muted-foreground">—</span>
                                )}
                            </dd>
                        </div>
                    </dl>

                    <div className="space-y-2">
                        <p className="label-micro">Tier</p>
                        <SegmentedControl
                            label="Tier"
                            fill
                            className="max-lg:[&>button]:min-h-11"
                            value={currentTier}
                            onChange={(tier) => user.id && onUpdateTier(user.id, tier)}
                            options={TIERS.map((tier) => ({
                                value: tier,
                                label: tier.charAt(0).toUpperCase() + tier.slice(1),
                                disabled: !user.id,
                            }))}
                        />
                    </div>

                    <div className="space-y-2">
                        <p className="label-micro">Actions</p>
                        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                            {user.status === 'WAITLIST' && (
                                <Button
                                    variant="outline"
                                    className={cn(ACTION, 'bg-up/10 text-up hover:bg-up/20')}
                                    onClick={() => onApprove(user.email)}
                                >
                                    <CheckCircle className="h-4 w-4 shrink-0" aria-hidden />
                                    Approve User
                                </Button>
                            )}

                            {user.id && (
                                <Button variant="outline" className={ACTION} onClick={() => onGiftCredits(user)}>
                                    <Gift className={ACTION_ICON} aria-hidden />
                                    Gift Credits
                                </Button>
                            )}

                            {user.role === 'admin' ? (
                                <Button
                                    variant="outline"
                                    className={ACTION}
                                    onClick={() => user.id && onUpdateRole(user.id, 'user')}
                                    disabled={!user.id}
                                >
                                    <ShieldOff className={ACTION_ICON} aria-hidden />
                                    Remove Admin Role
                                </Button>
                            ) : (
                                <Button
                                    variant="outline"
                                    className={ACTION}
                                    onClick={() => user.id && onUpdateRole(user.id, 'admin')}
                                    disabled={!user.id}
                                >
                                    <Shield className={ACTION_ICON} aria-hidden />
                                    Promote to Admin
                                </Button>
                            )}

                            {user.id && (
                                <Button
                                    variant="outline"
                                    className={ACTION}
                                    onClick={() => user.id && onResetTutorial(user.id)}
                                >
                                    <RotateCcw className={ACTION_ICON} aria-hidden />
                                    Reset Tutorial State
                                </Button>
                            )}

                            {user.status !== 'BANNED' ? (
                                <Button
                                    variant="outline"
                                    className={cn(ACTION, 'text-down hover:bg-down/10 hover:text-down')}
                                    onClick={() => onRevoke(user)}
                                >
                                    <Ban className="h-4 w-4 shrink-0" aria-hidden />
                                    Revoke Access (Ban)
                                </Button>
                            ) : (
                                <Button
                                    variant="outline"
                                    className={cn(ACTION, 'bg-up/10 text-up hover:bg-up/20')}
                                    onClick={() => onUnban(user)}
                                >
                                    <CheckCircle className="h-4 w-4 shrink-0" aria-hidden />
                                    Unban User
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
