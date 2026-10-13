import { lazy, Suspense, useEffect, useId, useState, useCallback, useRef, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Bell, User as UserIcon, Brain, Search } from 'lucide-react';
import { api, cn } from '../../lib/api';
import { queryClient } from '../../lib/queryClient';
import { useActiveResearchCount } from '../../hooks/useTicker';
import { openCommandPalette } from '../../app/commandPalette';
import { SuperLoading } from '../ui/SuperLoading';
import { useLocalAnalysisCount } from '../../store/analysisStore';
import { preloadRoute } from '../../app/routes';
// CurrencySelector was previously rendered in the Header to set a global
// "convert everything to this currency" preference. That model was removed:
// every ticker now displays in its native trading currency app-wide, and
// the only place that converts is the Portfolio page (with its own local
// selector). The CurrencySelector component still exists for the Portfolio
// page; we just don't mount it here.

// The menu bodies are only needed once someone opens a menu, so they stay out
// of the entry chunk: loaded on first intent (hover/focus/press) and on idle.
const loadMenus = () => import('./HeaderMenus');
const NotificationsPanel = lazy(() => loadMenus().then((m) => ({ default: m.NotificationsPanel })));
const AccountPanel = lazy(() => loadMenus().then((m) => ({ default: m.AccountPanel })));
const preloadMenus = (): void => { void loadMenus().catch(() => {}); };
const MENU_FALLBACK = <div className="h-24" aria-busy="true" />;

// Desktop navigation, in the same order as the phone tab bar and the command
// palette. All six stay visible from `lg`: on narrower desktops the search
// field gives up width instead of two destinations disappearing.
const NAV_LINKS: Array<{ to: string; label: string }> = [
  { to: '/watchlist', label: 'Watchlist' },
  { to: '/analyzer', label: 'Tickers' },
  { to: '/portfolio', label: 'Portfolio' },
  { to: '/alerts', label: 'Alerts' },
  { to: '/news', label: 'News' },
  { to: '/research', label: 'Research' },
];

interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  data: Record<string, unknown> | null;
  created_at: string;
}

// React Query for smart polling
function useUnreadNotifications(isAuthenticated: boolean) {
  const { data: unreadCount, refetch } = useQuery({
    queryKey: ['notifications', 'count'],
    queryFn: async () => {
      const { data } = await api.get('/notifications/count');
      return data.count || 0;
    },
    enabled: isAuthenticated,
    refetchInterval: 120000, // Poll every 2 minutes
    staleTime: 60000, // Consider fresh for 60s
    refetchOnWindowFocus: false, // Disable focus refetching to reduce noise
    refetchOnMount: false, // Don't refetch on component remount if data is fresh
  });

  return { unreadCount: unreadCount || 0, check: refetch };
}

// Cached notification list
function useNotificationsList(isAuthenticated: boolean) {
  const { data: notifications } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: async () => {
      const { data } = await api.get<Notification[]>('/notifications');
      return data;
    },
    enabled: isAuthenticated,
    staleTime: 60000, // 1 minute stale time
    refetchOnWindowFocus: true,
  });

  return { notifications: notifications || [] };
}

interface ActiveResearchIndicatorProps {
  count: number;
}

function ActiveResearchIndicator({ count }: ActiveResearchIndicatorProps) {
  const localCount = useLocalAnalysisCount();
  const total = count + localCount;

  const running = total > 0;

  // Always present, so the icons beside it never shift when an analysis
  // starts or ends. It is the way to AI research; it takes the AI colour and
  // a count only while analyses are actually running.
  return (
    <Link
      to="/research"
      onMouseEnter={() => preloadRoute('/research')}
      aria-label={running ? `${total} AI ${total === 1 ? 'analysis' : 'analyses'} running — open research` : 'AI research'}
      title={running ? 'AI research in progress' : 'AI research'}
      className={ICON_BUTTON}
    >
      <Brain className={cn('h-5 w-5', running && 'text-ai')} aria-hidden />
      {running && (
        <span className={cn(COUNT_BADGE, 'bg-violet-600')} aria-hidden>
          {total}
        </span>
      )}
    </Link>
  );
}

// Header icon buttons: a 44px hit area on touch, 36px with a mouse; the glyph
// stays 20px. Hover/open state is a tonal fill, never an outline.
const ICON_BUTTON =
  'relative flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted data-[state=open]:text-foreground lg:h-9 lg:w-9';

// Solid count badge — no cut-out ring.
const COUNT_BADGE =
  'num pointer-events-none absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[11px] font-bold leading-none text-white lg:right-0 lg:top-0';

interface MenuPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible name of the trigger button. */
  triggerLabel: string;
  /** Accessible name of the floating panel. */
  panelLabel: string;
  trigger: ReactNode;
  panelClassName?: string;
  children: ReactNode;
}

/**
 * The header's two menus. Deliberately dependency-free: the shell is in the
 * entry chunk, so it must not pull a popover library in for menus nobody has
 * opened yet. Behaviour: `aria-expanded` on the trigger, focus moves into the
 * panel, Escape closes and returns focus, a press or focus move outside closes.
 * Below `lg` the panel hangs from the header's right gutter (never wider than
 * the screen); from `lg` it hangs from its trigger.
 */
function MenuPopover({
  open,
  onOpenChange,
  triggerLabel,
  panelLabel,
  trigger,
  panelClassName,
  children,
}: MenuPopoverProps) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus({ preventScroll: true });

    const onPointerDown = (e: PointerEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) onOpenChange(false);
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onOpenChange(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onOpenChange]);

  return (
    <div
      ref={rootRef}
      className="lg:relative"
      onBlur={(e) => {
        // Tabbing out of the menu closes it.
        const next = e.relatedTarget as Node | null;
        if (open && next && !e.currentTarget.contains(next)) onOpenChange(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={triggerLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        data-state={open ? 'open' : 'closed'}
        onClick={() => onOpenChange(!open)}
        onPointerEnter={preloadMenus}
        onFocus={preloadMenus}
        className={ICON_BUTTON}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={panelLabel}
          tabIndex={-1}
          className={cn(
            'absolute right-3 top-full z-50 mt-1 max-w-[calc(100vw-1.5rem)] rounded-md bg-popover text-popover-foreground shadow-2xl shadow-black/60 outline-none animate-in fade-in-0 zoom-in-95 duration-150 lg:right-0 lg:mt-2',
            panelClassName,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function Header() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [notificationsMenuOpen, setNotificationsMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Lifted state to synchronize notifications
  const { data: researchCount = 0 } = useActiveResearchCount();
  const prevResearchCount = useRef(researchCount);

  const { unreadCount, check: refreshNotifications } =
    useUnreadNotifications(!!user);

  const { notifications } = useNotificationsList(!!user);



  const closeMenus = useCallback(() => {
    setProfileMenuOpen(false);
    setNotificationsMenuOpen(false);
  }, []);

  // SSE: Real-time notification bridge
  useEffect(() => {
    if (!user) return;

    const sseUrl = '/api/v1/notifications/stream';
    const eventSource = new EventSource(sseUrl, {
      withCredentials: true,
    });

    eventSource.addEventListener('notification', (event) => {
      try {
        const payload = JSON.parse(event.data);
        // 1. Immediately refresh the unread count badge
        void refreshNotifications();

        // 2. If it's a research complete event, update list
        void queryClient.invalidateQueries({ queryKey: ['notifications', 'list'] });

        // 3. Specifically for research updates, invalidate the active research count
        void queryClient.invalidateQueries({
          queryKey: ['research', 'active-count'],
        });

        // 4. Also invalidate specific ticker research if we can derive it
        if (payload.data?.ticker) {
          void queryClient.invalidateQueries({
            queryKey: ['tickers', 'research', payload.data.ticker],
          });
        }
      } catch (e) {
        console.error('[SSE] Failed to parse notification event', e);
      }
    });

    return () => {
      eventSource.close();
    };
  }, [user, refreshNotifications, notificationsMenuOpen]);

  // Sync: When research finishes (count drops to 0), immediately check for new notifications
  useEffect(() => {
    if (prevResearchCount.current > 0 && researchCount === 0) {
      void refreshNotifications();
    }
    prevResearchCount.current = researchCount;
  }, [researchCount, refreshNotifications]);

  // Warm the menu chunk when the browser is idle, so the first open is instant.
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 2000));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const id = idle(preloadMenus);
    return () => cancel(id);
  }, []);

  // Close menus on route change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfileMenuOpen(false);
    setNotificationsMenuOpen(false);
  }, [location.pathname]);

  const handleNotificationClick = async (n: Notification) => {
    try {
      if (!n.read) {
        await api.patch(`/notifications/${n.id}/read`);
        void refreshNotifications();
        void queryClient.invalidateQueries({ queryKey: ['notifications', 'list'] });
      }

      if ((n.type === 'research_complete' || n.type === 'research_complete_watcher') && n.data?.ticker && n.data?.researchId) {
        navigate(`/ticker/${n.data.ticker}/research/${n.data.researchId}`);
      } else if (n.type === 'price_alert' && n.data?.symbol) {
        navigate(`/ticker/${n.data.symbol}`);
      } else if ((n.type === 'comment_reply' || n.type === 'comment_like' || n.type === 'comment_mention') && n.data?.symbol) {
        navigate(`/ticker/${n.data.symbol}`);
      } else if (n.data?.ticker) {
        navigate(`/ticker/${n.data.ticker}`);
      }

      setNotificationsMenuOpen(false);
    } catch (e) {
      console.error('Failed to handle notification click', e);
    }
  };

  const isActive = (path: string) => {
    if (
      path === '/dashboard' &&
      (location.pathname === '/' || location.pathname === '/dashboard')
    )
      return true;
    return location.pathname === path;
  };

  const linkClass = (path: string) =>
    // The current page is a tinted chip in the signal colour — no underline.
    `text-sm font-medium h-8 flex items-center rounded-md px-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isActive(path)
      ? 'bg-signal/10 text-signal'
      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
    }`;

  const goTo = (path: string) => {
    closeMenus();
    navigate(path);
  };

  const handleLogout = () => {
    // Optimistic: Show SuperLoading immediately
    setIsLoggingOut(true);
    // Close all menus
    closeMenus();
    // Call the async logout (redirect happens automatically)
    logout();
  };

  // Show full-screen loader when signing out
  if (isLoggingOut) {
    return <SuperLoading text="Signing out..." fullScreen={true} />;
  }

  return (
    <>
      {/* Opaque on purpose: nothing scrolling underneath may read through. */}
      <header className="rgb-border-b h-14 bg-background sticky top-0 z-50">
        <div className="container max-w-[90rem] mx-auto h-full flex items-center justify-between px-4">
          {/* Left Section: Mobile Toggle & Logo */}
          <div className="flex min-w-0 flex-1 items-center justify-start gap-4">
            <Link
              to="/dashboard"
              aria-label="NeuralTicker — dashboard"
              className="group flex min-h-11 flex-shrink-0 items-center gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <img
                src={`${import.meta.env.BASE_URL}favicon.svg`}
                alt=""
                width={19}
                height={24}
                className="h-6 w-auto shrink-0"
              />
              <span aria-hidden className="text-base font-bold leading-none tracking-tight text-foreground transition-opacity group-hover:opacity-80 sm:text-lg">
                {/* The suffix yields on the narrowest phones so four 44px actions still fit. */}
                NeuralTicker<span className="text-muted-foreground max-[379px]:hidden">.com</span>
              </span>
            </Link>
          </div>

          {/* Center Section: Search & Desktop Nav */}
          <div className="hidden lg:flex items-center gap-4 xl:gap-8 justify-center">
            {/* Looks like a search field, opens the command palette (⌘K). */}
            <button
              type="button"
              onClick={openCommandPalette}
              aria-label="Search tickers and commands"
              aria-keyshortcuts="Meta+K Control+K"
              className="group flex h-9 w-32 xl:w-72 items-center gap-2.5 rounded-md bg-muted/70 pl-3 pr-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Search className="h-4 w-4 shrink-0" aria-hidden />
              <span className="flex-1 truncate text-left">Search<span className="hidden xl:inline"> tickers…</span></span>
              <kbd className="kbd select-none">⌘K</kbd>
            </button>
            <nav aria-label="Primary" className="flex items-center gap-1 xl:gap-2">
              {NAV_LINKS.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onMouseEnter={() => preloadRoute(item.to)}
                  onFocus={() => preloadRoute(item.to)}
                  aria-current={isActive(item.to) ? 'page' : undefined}
                  className={linkClass(item.to)}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Right Section: Actions. On touch the 44px buttons butt together and
              the last one reaches into the gutter, so the glyphs line up with
              the page edge instead of the invisible hit areas. */}
          <div className="-mr-1.5 flex flex-1 flex-shrink-0 items-center justify-end lg:mr-0 lg:gap-2">
            {/* Mobile Search Icon */}
            <button
              type="button"
              className={cn(ICON_BUTTON, 'lg:hidden')}
              onClick={openCommandPalette}
              aria-label="Search"
            >
              <Search size={20} aria-hidden />
            </button>

            <ActiveResearchIndicator count={researchCount} />

            <MenuPopover
              open={notificationsMenuOpen}
              onOpenChange={setNotificationsMenuOpen}
              triggerLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
              panelLabel="Notifications"
              panelClassName="flex max-h-[min(34rem,calc(100dvh-4.5rem-var(--shell-bottom,0px)))] w-[23rem] flex-col overflow-hidden"
              trigger={
                <>
                  <Bell size={20} aria-hidden />
                  {unreadCount > 0 && (
                    <span className={cn(COUNT_BADGE, 'bg-red-600')} aria-hidden>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </>
              }
            >
              <Suspense fallback={MENU_FALLBACK}>
                <NotificationsPanel
                  notifications={notifications}
                  unreadCount={unreadCount}
                  onSelect={(id) => {
                    const picked = notifications.find((n) => n.id === id);
                    if (picked) void handleNotificationClick(picked);
                  }}
                  onMarkAllRead={() => {
                    void (async () => {
                      await api.patch('/notifications/read-all');
                      await queryClient.invalidateQueries({ queryKey: ['notifications', 'list'] });
                      void refreshNotifications();
                    })();
                  }}
                />
              </Suspense>
            </MenuPopover>

            <MenuPopover
              open={profileMenuOpen}
              onOpenChange={setProfileMenuOpen}
              triggerLabel="User menu"
              panelLabel="Account"
              panelClassName="w-[17rem] p-1.5"
              trigger={
                user?.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="h-8 w-8 rounded-full" />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-foreground">
                    <UserIcon size={16} aria-hidden />
                  </span>
                )
              }
            >
              <Suspense fallback={MENU_FALLBACK}>
                <AccountPanel user={user} onNavigate={goTo} onSignOut={handleLogout} />
              </Suspense>
            </MenuPopover>
          </div>
        </div>
      </header>
    </>
  );
}
