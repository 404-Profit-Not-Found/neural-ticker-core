import { Ban, Check, CheckCircle, Gift, MoreHorizontal, Sparkles } from 'lucide-react';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { formatDateTime } from '../../lib/datetime';
import { cn } from '../../lib/utils';
import { ADMIN_CELL, ADMIN_CELL_HOVER, ADMIN_TABLE, SortTh, Th, UserAvatar, UserStatusStamp, UserTierStamps } from './admin-ui';
import { userName, type AdminUser, type SortDirection } from './model';

const TIERS = ['free', 'pro', 'whale'] as const;

export interface UserSort {
    key: string;
    direction: SortDirection;
}

interface UserTableProps {
    users: AdminUser[];
    sort: UserSort;
    onSort: (key: string) => void;
    onOpen: (user: AdminUser) => void;
    onUpdateTier: (userId: string, tier: (typeof TIERS)[number]) => void;
    onGiftCredits: (user: AdminUser) => void;
    onApprove: (email: string) => void;
    onRevoke: (user: AdminUser) => void;
    onUnban: (user: AdminUser) => void;
}

// A row's shortcuts: quiet until pointed at, so a page of users is not a page of buttons.
const ROW_ACTION = 'h-8 gap-1.5 px-2 text-xs font-medium text-muted-foreground hover:bg-raised hover:text-foreground';

/**
 * Users as a table — the desktop view. A row opens the user's dialog; the most
 * used actions are also one click away at the end of the row.
 */
export function UserTable({ users, sort, onSort, onOpen, onUpdateTier, onGiftCredits, onApprove, onRevoke, onUnban }: UserTableProps) {
    const sorted = (key: string) => (sort.key === key ? sort.direction : false);

    return (
        <div className="overflow-x-auto">
            <table className={ADMIN_TABLE}>
                <thead>
                    <tr>
                        <SortTh label="User" sorted={sorted('email')} onSort={() => onSort('email')} />
                        <SortTh label="Status" sorted={sorted('status')} onSort={() => onSort('status')} />
                        <SortTh label="Credits" sorted={sorted('credits_balance')} onSort={() => onSort('credits_balance')} />
                        <SortTh label="Joined" sorted={sorted('created_at')} onSort={() => onSort('created_at')} />
                        <Th className="text-right">
                            <span className="sr-only">Actions</span>
                        </Th>
                    </tr>
                </thead>
                <tbody>
                    {users.map((user, index) => (
                        <tr
                            key={user.id || user.email || `user-${index}`}
                            className="group cursor-pointer"
                            onClick={() => onOpen(user)}
                        >
                            {/* The one flexible column: it takes the room the others leave, and a
                                long name or address truncates instead of widening the table. */}
                            <td className={cn(ADMIN_CELL, ADMIN_CELL_HOVER, 'w-full max-w-0')}>
                                <div className="flex min-w-0 items-center gap-3">
                                    <UserAvatar email={user.email} nickname={user.nickname} avatarUrl={user.avatar_url} className="h-8 w-8 text-[11px]" />
                                    <div className="min-w-0">
                                        <div className="flex min-w-0 items-center gap-2">
                                            <span className="truncate text-sm font-semibold text-foreground">{userName(user)}</span>
                                            <UserTierStamps user={user} />
                                        </div>
                                        <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                                    </div>
                                </div>
                            </td>
                            <td className={cn(ADMIN_CELL, ADMIN_CELL_HOVER, 'whitespace-nowrap')}>
                                <UserStatusStamp user={user} />
                            </td>
                            <td className={cn(ADMIN_CELL, ADMIN_CELL_HOVER, 'num whitespace-nowrap text-[13px] text-foreground')}>
                                {/* An invited address has no balance yet: an em dash, not a zero. */}
                                {user.credits_balance != null ? (
                                    <span>{user.credits_balance.toLocaleString()}</span>
                                ) : (
                                    <span className="text-muted-foreground">—</span>
                                )}
                            </td>
                            <td className={cn(ADMIN_CELL, ADMIN_CELL_HOVER, 'num whitespace-nowrap text-xs text-muted-foreground')}>
                                {formatDateTime(user.created_at || user.invited_at)}
                            </td>
                            <td className={cn(ADMIN_CELL, ADMIN_CELL_HOVER, 'whitespace-nowrap')}>
                                <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                                    {user.status === 'WAITLIST' && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className={cn(ROW_ACTION, 'text-up hover:text-up')}
                                            onClick={() => user.email && onApprove(user.email)}
                                        >
                                            <CheckCircle size={14} aria-hidden />
                                            <span className="sr-only xl:not-sr-only">Approve</span>
                                        </Button>
                                    )}

                                    {/* Tier and credits belong to an account; an invited address has none yet. */}
                                    {user.id && (
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button variant="ghost" size="sm" className={ROW_ACTION}>
                                                    <Sparkles size={14} aria-hidden />
                                                    <span className="sr-only xl:not-sr-only">Tier</span>
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-44 p-1.5" align="end">
                                                <p className="label-micro px-2.5 pb-1.5 pt-1">Set tier</p>
                                                {TIERS.map((tier) => (
                                                    <button
                                                        key={tier}
                                                        type="button"
                                                        role="menuitemradio"
                                                        aria-checked={user.tier === tier}
                                                        onClick={() => user.id && onUpdateTier(user.id, tier)}
                                                        className={cn(
                                                            'flex min-h-8 w-full items-center justify-between rounded-md px-2.5 text-left text-sm capitalize transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none',
                                                            user.tier === tier ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
                                                        )}
                                                    >
                                                        {tier}
                                                        {user.tier === tier && <Check className="h-3.5 w-3.5 text-signal" aria-hidden />}
                                                    </button>
                                                ))}
                                            </PopoverContent>
                                        </Popover>
                                    )}

                                    {user.id && (
                                        <Button variant="ghost" size="sm" className={ROW_ACTION} onClick={() => onGiftCredits(user)}>
                                            <Gift size={14} aria-hidden />
                                            <span className="sr-only xl:not-sr-only">Gift</span>
                                        </Button>
                                    )}

                                    {user.status !== 'BANNED' ? (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className={cn(ROW_ACTION, 'hover:text-down')}
                                            onClick={() => onRevoke(user)}
                                        >
                                            <Ban size={14} aria-hidden />
                                            <span className="sr-only xl:not-sr-only">Ban</span>
                                        </Button>
                                    ) : (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className={cn(ROW_ACTION, 'text-up hover:text-up')}
                                            onClick={() => onUnban(user)}
                                        >
                                            <CheckCircle size={14} aria-hidden />
                                            <span className="sr-only xl:not-sr-only">Unban</span>
                                        </Button>
                                    )}

                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground hover:bg-raised hover:text-foreground"
                                        onClick={() => onOpen(user)}
                                        title="User details"
                                        aria-label={`Details for ${user.email}`}
                                    >
                                        <MoreHorizontal size={16} aria-hidden />
                                    </Button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
