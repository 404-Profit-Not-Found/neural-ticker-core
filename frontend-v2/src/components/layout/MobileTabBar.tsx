import { useEffect, useRef, useState, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  BellRing,
  Brain,
  Info,
  LayoutDashboard,
  LineChart,
  LogOut,
  Menu,
  Newspaper,
  PieChart,
  Shield,
  Star,
  User as UserIcon,
  X,
  type LucideProps,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { preloadRoute } from '../../app/routes';
import { useConfirm } from '../ui/confirm';
import { cn } from '../../lib/utils';

type Icon = ComponentType<LucideProps>;

interface Destination {
  to: string;
  label: string;
  icon: Icon;
  /** Extra path prefixes that should light this tab up. */
  match?: string[];
}

const TABS: Destination[] = [
  { to: '/', label: 'Home', icon: LayoutDashboard, match: ['/dashboard'] },
  { to: '/watchlist', label: 'Watchlist', icon: Star },
  { to: '/analyzer', label: 'Tickers', icon: LineChart, match: ['/ticker'] },
  { to: '/portfolio', label: 'Portfolio', icon: PieChart },
];

const MORE: Destination[] = [
  { to: '/alerts', label: 'Price alerts', icon: BellRing },
  { to: '/news', label: 'Market news', icon: Newspaper },
  { to: '/research', label: 'AI research', icon: Brain },
  { to: '/profile', label: 'Profile & credits', icon: UserIcon },
];

function isActive(pathname: string, d: Destination): boolean {
  if (d.to === '/') {
    return pathname === '/' || (d.match ?? []).some((m) => pathname.startsWith(m));
  }
  return (
    pathname === d.to ||
    pathname.startsWith(`${d.to}/`) ||
    (d.match ?? []).some((m) => pathname === m || pathname.startsWith(`${m}/`))
  );
}

/**
 * Phone navigation: a thumb-reachable tab bar for the four core destinations
 * plus a "More" sheet for everything else. Hidden from `lg` up, where the
 * header carries the full navigation.
 */
export function MobileTabBar() {
  const { pathname, key } = useLocation();
  // The sheet is open "for" the history entry it was opened on, so any
  // navigation (a tap inside it, the Back button) closes it by construction.
  const [openForKey, setOpenForKey] = useState<string | null>(null);
  const moreOpen = openForKey === key;
  const setMoreOpen = (open: boolean): void => setOpenForKey(open ? key : null);

  const moreActive = MORE.some((d) => isActive(pathname, d)) || pathname.startsWith('/admin') || pathname.startsWith('/about');

  return (
    <>
      <nav
        aria-label="Primary"
        className="lg:hidden fixed inset-x-0 bottom-0 z-40 bg-card pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.6)]"
      >
        <ul className="grid grid-cols-5 h-[3.75rem]">
          {TABS.map((d) => {
            const active = isActive(pathname, d);
            return (
              <li key={d.to} className="contents">
                <NavLink
                  to={d.to}
                  end={d.to === '/'}
                  aria-current={active ? 'page' : undefined}
                  onTouchStart={() => preloadRoute(d.to)}
                  className={cn(
                    'relative flex flex-col items-center justify-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                    active ? 'text-signal' : 'text-muted-foreground active:text-foreground',
                  )}
                >
                  <d.icon size={20} strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                  <span className="text-[11px] font-medium leading-none">{d.label}</span>
                </NavLink>
              </li>
            );
          })}
          <li className="contents">
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className={cn(
                'relative flex flex-col items-center justify-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                moreActive ? 'text-signal' : 'text-muted-foreground active:text-foreground',
              )}
            >
              <Menu size={20} strokeWidth={moreActive ? 2.25 : 1.75} aria-hidden />
              <span className="text-[11px] font-medium leading-none">More</span>
            </button>
          </li>
        </ul>
      </nav>

      {moreOpen && <MoreSheet pathname={pathname} onClose={() => setMoreOpen(false)} />}
    </>
  );
}

function MoreSheet({ pathname, onClose }: { pathname: string; onClose: () => void }) {
  const { user, logout } = useAuth();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);

  // Modal behaviour: lock page scroll, close on Escape, move focus in and
  // hand it back to whatever opened the sheet.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, [onClose]);

  const items: Destination[] = [
    ...MORE,
    ...(user?.role === 'admin'
      ? [{ to: '/admin', label: 'Admin console', icon: Shield }]
      : []),
    { to: '/about', label: 'About NeuralTicker', icon: Info },
  ];

  return createPortal(
    <div className="lg:hidden fixed inset-0 z-[60]">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="More"
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-popover shadow-2xl outline-none animate-in slide-in-from-bottom-6 duration-200 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="sticky top-0 flex items-center justify-between gap-3 bg-popover px-4 pb-2 pt-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {user?.nickname || user?.name || 'Trader'}
            </p>
            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="-mr-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X size={20} />
          </button>
        </div>

        <ul className="p-2">
          {items.map((d) => {
            const active = isActive(pathname, d);
            return (
              <li key={d.to}>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    navigate(d.to);
                  }}
                  onTouchStart={() => preloadRoute(d.to)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active
                      ? 'bg-signal/10 text-signal'
                      : 'text-foreground hover:bg-muted active:bg-muted',
                  )}
                >
                  <d.icon size={18} className={active ? 'text-signal' : 'text-muted-foreground'} aria-hidden />
                  {d.label}
                </button>
              </li>
            );
          })}
        </ul>

        {/* Set apart and confirmed: it sits where the thumb just tapped "More". */}
        <div className="mt-2 p-2 pt-0">
          <button
            type="button"
            onClick={async () => {
              onClose();
              if (await confirm({ title: 'Sign out of NeuralTicker?', confirmLabel: 'Sign out' })) logout();
            }}
            className="flex h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] font-medium text-foreground hover:bg-muted active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LogOut size={18} className="text-muted-foreground" aria-hidden />
            Sign out
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
