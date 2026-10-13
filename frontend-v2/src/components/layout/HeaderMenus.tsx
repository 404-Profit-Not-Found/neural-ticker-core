import { Bell, Info, LogOut, Shield, User as UserIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { UserTierBadge } from '../ui/user-tier-badge';

/**
 * Bodies of the header's two menus. Kept in their own chunk: `Header` loads
 * this file the first time someone reaches for a menu (and on idle), so the
 * entry bundle only carries the two trigger buttons.
 */

export interface HeaderNotification {
  id: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

const MENU_ITEM =
  'flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none lg:min-h-9';

/** "5m ago" style timestamp; the full date stays available as a tooltip. */
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface NotificationsPanelProps {
  notifications: HeaderNotification[];
  unreadCount: number;
  /** Called with the id of the notification that was opened. */
  onSelect: (id: string) => void;
  onMarkAllRead: () => void;
}

export function NotificationsPanel({
  notifications,
  unreadCount,
  onSelect,
  onMarkAllRead,
}: NotificationsPanelProps) {
  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-3 pl-4 pr-2 pt-2">
        <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
        <button
          type="button"
          disabled={unreadCount === 0}
          onClick={onMarkAllRead}
          className="flex min-h-11 items-center rounded-md px-2 text-xs font-medium text-primary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:text-muted-foreground lg:min-h-9"
        >
          Mark all read
        </button>
      </div>

      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-1.5">
        {notifications.length === 0 ? (
          <li className="px-6 py-10 text-center">
            <Bell className="mx-auto mb-2 h-6 w-6 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium text-foreground">You're all caught up</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Price alerts, finished research and replies will show up here.
            </p>
          </li>
        ) : (
          notifications.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => onSelect(n.id)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-md px-2.5 py-2.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  // Unread = a tonal fill plus a dot; read rows sit on the popover.
                  !n.read && 'bg-muted/60',
                )}
              >
                <span
                  aria-hidden
                  className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-primary')}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className={cn('min-w-0 text-sm', n.read ? 'text-muted-foreground' : 'font-semibold text-foreground')}>
                      {!n.read && <span className="sr-only">Unread: </span>}
                      {n.title}
                    </span>
                    <time
                      dateTime={n.created_at}
                      title={new Date(n.created_at).toLocaleString()}
                      className="num shrink-0 text-[11px] text-muted-foreground"
                    >
                      {timeAgo(n.created_at)}
                    </time>
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
                    {n.message}
                  </span>
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </>
  );
}

interface AccountPanelProps {
  user: { nickname?: string | null; email?: string | null; tier?: string | null; role?: string | null } | null | undefined;
  onNavigate: (path: string) => void;
  onSignOut: () => void;
}

export function AccountPanel({ user, onNavigate, onSignOut }: AccountPanelProps) {
  return (
    <>
      <div className="px-3 pb-2 pt-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="truncate">{user?.nickname || 'Trader'}</span>
          {user?.tier === 'whale' && <UserTierBadge tier="whale" />}
          {user?.tier === 'pro' && <UserTierBadge tier="pro" />}
        </p>
        <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
      </div>

      {/* Same destinations, labels and icons as the phone "More" sheet. */}
      <nav aria-label="Account" className="space-y-0.5">
        <button type="button" onClick={() => onNavigate('/profile')} className={MENU_ITEM}>
          <UserIcon size={16} className="text-muted-foreground" aria-hidden />
          Profile &amp; credits
        </button>
        {user && user.role === 'admin' && (
          <button type="button" onClick={() => onNavigate('/admin')} className={MENU_ITEM}>
            <Shield size={16} className="text-purple-500" aria-hidden />
            Admin console
          </button>
        )}
        <button type="button" onClick={() => onNavigate('/about')} className={MENU_ITEM}>
          <Info size={16} className="text-muted-foreground" aria-hidden />
          About NeuralTicker
        </button>
        <button type="button" onClick={onSignOut} className={cn(MENU_ITEM, 'mt-1.5')}>
          <LogOut size={16} className="text-muted-foreground" aria-hidden />
          Sign out
        </button>
      </nav>
    </>
  );
}
