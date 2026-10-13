import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Brain,
  Clock,
  Cloud,
  CornerDownLeft,
  Database,
  Globe,
  Keyboard,
  LayoutDashboard,
  LineChart,
  Loader2,
  LogOut,
  Moon,
  Newspaper,
  Palette,
  PieChart,
  PlusCircle,
  Search,
  Shield,
  Star,
  Sun,
  User as UserIcon,
  X,
  type LucideProps,
} from 'lucide-react';
import { Dialog, DialogTitle } from '../ui/dialog';
import { Sparkline } from '../ui/Sparkline';
import { TickerLogo } from '../dashboard/TickerLogo';
import { useAuth } from '../../context/AuthContext';
import { useRequestTicker } from '../../hooks/useTickerRequests';
import { useTickerSearch, type TickerSearchResult } from '../../hooks/useTickerSearch';
import { api } from '../../lib/api';
import { shortExchange } from '../../lib/format';
import { cn } from '../../lib/utils';
import {
  closeCommandPalette,
  recentTickers,
  recordRecentTicker,
  toggleCommandPalette,
  useCommandPaletteOpen,
} from '../../app/commandPalette';
import { preloadRoute } from '../../app/routes';
import { applyTheme, type AppTheme } from '../../app/theme';
import { openShortcutsHelp } from './KeyboardShortcuts';

type Icon = ComponentType<LucideProps>;

type Item =
  | { kind: 'ticker'; id: string; ticker: TickerSearchResult }
  | { kind: 'recent'; id: string; symbol: string }
  | { kind: 'nav'; id: string; label: string; to: string; icon: Icon; keywords: string }
  | { kind: 'theme'; id: string; label: string; theme: AppTheme; icon: Icon; keywords: string }
  | { kind: 'action'; id: string; label: string; icon: Icon; keywords: string; run: () => void }
  | { kind: 'external'; id: string; query: string };

interface Section {
  label: string;
  items: Item[];
}

const NAV: Array<{ label: string; to: string; icon: Icon; keywords: string; admin?: boolean }> = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard, keywords: 'home overview' },
  { label: 'Watchlist', to: '/watchlist', icon: Star, keywords: 'favorites tracked lists' },
  { label: 'Tickers', to: '/analyzer', icon: LineChart, keywords: 'analyzer screener stocks' },
  { label: 'Portfolio', to: '/portfolio', icon: PieChart, keywords: 'positions holdings cash trades' },
  { label: 'Price alerts', to: '/alerts', icon: Bell, keywords: 'notifications triggers' },
  { label: 'Market news', to: '/news', icon: Newspaper, keywords: 'digest headlines' },
  { label: 'AI research', to: '/research', icon: Brain, keywords: 'reports notes analysis' },
  { label: 'Profile & credits', to: '/profile', icon: UserIcon, keywords: 'account settings language' },
  { label: 'Admin console', to: '/admin', icon: Shield, keywords: 'users requests logos', admin: true },
];

const THEME_OPTIONS: Array<{ label: string; theme: AppTheme; icon: Icon }> = [
  { label: 'Dark theme', theme: 'dark', icon: Moon },
  { label: 'Light theme', theme: 'light', icon: Sun },
  { label: 'Gray theme', theme: 'gray', icon: Cloud },
  { label: 'RGB theme', theme: 'rgb', icon: Palette },
];

function matches(q: string, ...haystack: string[]): boolean {
  const needle = q.toLowerCase();
  return haystack.some((h) => h.toLowerCase().includes(needle));
}

/**
 * Global command palette (⌘K / Ctrl+K, or "/" when not typing).
 * One place to jump to a ticker, any page, or switch theme — keyboard-first
 * on desktop, full-screen and thumb-friendly on phones.
 */
// Phones and tablets without a hardware keyboard: don't advertise shortcuts.
const HAS_KEYBOARD =
  typeof window === 'undefined' ||
  typeof window.matchMedia !== 'function' ||
  !window.matchMedia('(hover: none) and (pointer: coarse)').matches;

export function CommandPalette() {
  const open = useCommandPaletteOpen();

  // Global shortcuts live here so they work on every signed-in page.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleCommandPalette();
        return;
      }
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const typing =
        !!el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT' ||
          el.isContentEditable);
      if (typing) return;
      e.preventDefault();
      toggleCommandPalette();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Mounted only while open, so each opening starts with a clean query.
  return open ? <PaletteDialog /> : null;
}

function PaletteDialog() {
  const navigate = useNavigate();
  const { user, logout, refreshSession } = useAuth();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [recents] = useState(recentTickers);
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const requestTicker = useRequestTicker();

  const q = query.trim();
  const { results, loading, searchedExternal, error, searchExternal, markQueued } =
    useTickerSearch(query);

  const sections = useMemo<Section[]>(() => {
    const nav = NAV.filter((n) => !n.admin || user?.role === 'admin').map<Item>((n) => ({
      kind: 'nav',
      id: `nav:${n.to}`,
      label: n.label,
      to: n.to,
      icon: n.icon,
      keywords: n.keywords,
    }));
    const themes = THEME_OPTIONS.map<Item>((t) => ({
      kind: 'theme',
      id: `theme:${t.theme}`,
      label: t.label,
      theme: t.theme,
      icon: t.icon,
      keywords: 'appearance color mode',
    }));
    const actions: Item[] = [
      {
        kind: 'action',
        id: 'action:shortcuts',
        label: 'Keyboard shortcuts',
        icon: Keyboard,
        keywords: 'help keys hotkeys',
        run: openShortcutsHelp,
      },
      {
        kind: 'action',
        id: 'action:signout',
        label: 'Sign out',
        icon: LogOut,
        keywords: 'logout log out exit',
        run: logout,
      },
    ];

    if (q.length === 0) {
      return [
        {
          label: 'Recently viewed',
          items: recents.map<Item>((symbol) => ({ kind: 'recent', id: `recent:${symbol}`, symbol })),
        },
        { label: 'Go to', items: nav },
        { label: 'Appearance', items: themes },
        { label: 'Help', items: actions.filter((a) => a.id === 'action:shortcuts' && HAS_KEYBOARD) },
      ].filter((s) => s.items.length > 0);
    }

    const tickerItems = results.map<Item>((t, i) => ({
      kind: 'ticker',
      id: `ticker:${t.symbol}:${i}`,
      ticker: t,
    }));
    // Offer the wider (slower) global lookup once the local one has answered.
    const external: Item[] =
      !loading && !searchedExternal ? [{ kind: 'external', id: 'external', query: q }] : [];

    const filter = (items: Item[]): Item[] =>
      items.filter((it) =>
        it.kind === 'nav' || it.kind === 'theme' || it.kind === 'action'
          ? matches(q, it.label, it.keywords)
          : true,
      );

    return [
      // With no local hit the only row is the offer to look further afield.
      { label: tickerItems.length > 0 ? 'Tickers' : 'No tracked ticker matches', items: [...tickerItems, ...external] },
      { label: 'Go to', items: filter(nav) },
      { label: 'Appearance', items: filter(themes) },
      { label: 'More', items: filter(actions).filter((a) => a.id !== 'action:shortcuts' || HAS_KEYBOARD) },
    ].filter((s) => s.items.length > 0);
  }, [q, results, loading, searchedExternal, recents, user?.role, logout]);

  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  // Index of each section's first item within the flattened list.
  const offsets = useMemo(() => {
    let total = 0;
    return sections.map((s) => {
      const start = total;
      total += s.items.length;
      return start;
    });
  }, [sections]);
  // The list changes under the cursor as results arrive; keep the index valid.
  const activeIndex = flat.length === 0 ? -1 : Math.min(active, flat.length - 1);
  const activeId = activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined;

  useEffect(() => {
    if (!activeId) return;
    document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  const goTicker = (symbol: string): void => {
    recordRecentTicker(symbol);
    closeCommandPalette();
    navigate(`/ticker/${encodeURIComponent(symbol)}`);
  };

  const setTheme = (theme: AppTheme): void => {
    applyTheme(theme); // instant; the saved preference follows
    closeCommandPalette();
    void api
      .patch('/users/me', { theme })
      .then(() => refreshSession())
      .catch(() => undefined);
  };

  const run = (item: Item | undefined): void => {
    if (!item) return;
    switch (item.kind) {
      case 'ticker':
        goTicker(item.ticker.symbol);
        break;
      case 'recent':
        goTicker(item.symbol);
        break;
      case 'nav':
        closeCommandPalette();
        navigate(item.to);
        break;
      case 'theme':
        setTheme(item.theme);
        break;
      case 'action':
        closeCommandPalette();
        item.run();
        break;
      case 'external':
        void searchExternal();
        break;
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(flat.length === 0 ? 0 : (activeIndex + 1) % flat.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(flat.length === 0 ? 0 : (activeIndex - 1 + flat.length) % flat.length);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(Math.max(0, flat.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(flat[activeIndex]);
    }
  };

  const requestAdd = (e: MouseEvent, symbol: string): void => {
    e.stopPropagation();
    requestTicker.mutate(symbol, { onSuccess: () => markQueued(symbol) });
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) closeCommandPalette();
      }}
      hideClose
      containerClassName="items-stretch p-0 sm:items-start sm:justify-center sm:p-6 sm:pt-[12vh]"
      className="flex h-full max-h-none w-full max-w-none flex-col overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[min(34rem,76vh)] sm:max-w-xl sm:rounded-xl"
    >
      <DialogTitle className="sr-only">Search tickers and commands</DialogTitle>

      <div className="flex shrink-0 items-center gap-3 px-4">
        {loading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden />
        ) : (
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <input
          autoFocus
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          aria-label="Search tickers and commands"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="go"
          placeholder="Search tickers, pages, themes…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className="h-14 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/70 sm:h-12 sm:text-sm"
        />
        <button
          type="button"
          onClick={closeCommandPalette}
          aria-label="Close search"
          className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:mr-0 sm:h-9 sm:w-auto sm:px-2"
        >
          <kbd className="kbd hidden sm:inline">
            ESC
          </kbd>
          <X className="h-5 w-5 sm:hidden" aria-hidden />
        </button>
      </div>

      <div
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label="Results"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-2"
      >
        {sections.map((section, sectionIndex) => (
          <div key={section.label} role="group" aria-label={section.label} className="pb-1">
            <div className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {section.label}
            </div>
            {section.items.map((item, itemIndex) => {
              const i = offsets[sectionIndex] + itemIndex;
              const selected = i === activeIndex;
              return (
                <div
                  key={item.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={selected}
                  onMouseMove={() => {
                    if (active !== i) setActive(i);
                  }}
                  onMouseEnter={() => {
                    if (item.kind === 'nav') preloadRoute(item.to);
                    if (item.kind === 'ticker' || item.kind === 'recent') preloadRoute('/ticker');
                  }}
                  onClick={() => run(item)}
                  className={cn(
                    'mx-2 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm',
                    selected ? 'bg-muted text-foreground' : 'text-foreground/90',
                  )}
                >
                  <Row item={item} selected={selected} onRequestAdd={requestAdd} requesting={requestTicker.isPending} />
                </div>
              );
            })}
          </div>
        ))}

        {q.length > 0 && loading && results.length === 0 && (
          <p role="status" className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Searching tickers…
          </p>
        )}

        {q.length > 0 && !loading && results.length === 0 && searchedExternal && (
          <div className="px-4 py-8 text-center">
            <Search className="mx-auto mb-2 h-6 w-6 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium text-foreground">
              {error ? 'Search is unavailable right now' : 'No matches found'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {error
                ? 'Check your connection and try again.'
                : `We couldn't find “${q}” in global markets.`}
            </p>
          </div>
        )}
      </div>

      <div className="hidden shrink-0 items-center gap-4 px-4 py-2.5 text-[11px] text-muted-foreground sm:flex">
        <span className="flex items-center gap-1.5">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> to navigate
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>
            <CornerDownLeft className="h-3 w-3" aria-hidden />
          </Kbd>{' '}
          to select
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <Kbd>/</Kbd> or <Kbd>⌘K</Kbd> to open
        </span>
      </div>
    </Dialog>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-muted px-1 font-mono text-[11px] font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}

function IconTile({ icon: IconCmp, selected }: { icon: Icon; selected: boolean }) {
  return (
    <span
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
        selected ? 'bg-raised text-foreground' : 'bg-muted text-muted-foreground',
      )}
    >
      <IconCmp className="h-4 w-4" aria-hidden />
    </span>
  );
}

function Row({
  item,
  selected,
  onRequestAdd,
  requesting,
}: {
  item: Item;
  selected: boolean;
  onRequestAdd: (e: MouseEvent, symbol: string) => void;
  requesting: boolean;
}) {
  if (item.kind === 'ticker') {
    const t = item.ticker;
    return (
      <>
        <TickerLogo
          symbol={t.symbol}
          url={t.logo_url}
          className="h-8 w-8 shrink-0 rounded-full"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{t.symbol}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {t.name}
            {t.exchange ? ` · ${shortExchange(t.exchange)}` : ''}
          </span>
        </span>
        {t.is_locally_tracked && t.sparkline && t.sparkline.length > 1 ? (
          <Sparkline data={t.sparkline} width={60} height={24} className="shrink-0 opacity-90" />
        ) : t.is_locally_tracked ? (
          <Tag tone="green" icon={Database}>
            Tracked
          </Tag>
        ) : t.is_queued ? (
          <Tag tone="amber" icon={Clock}>
            Queued
          </Tag>
        ) : (
          <button
            type="button"
            onClick={(e) => onRequestAdd(e, t.symbol)}
            disabled={requesting}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold sm:h-7 sm:px-2.5 sm:text-[11px] text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {requesting ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            ) : (
              <PlusCircle className="h-3 w-3" aria-hidden />
            )}
            Request add
          </button>
        )}
      </>
    );
  }

  if (item.kind === 'recent') {
    return (
      <>
        <TickerLogo symbol={item.symbol} className="h-8 w-8 shrink-0 rounded-full" />
        <span className="min-w-0 flex-1 truncate font-semibold">{item.symbol}</span>
        <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </>
    );
  }

  if (item.kind === 'external') {
    return (
      <>
        <IconTile icon={Globe} selected={selected} />
        <span className="min-w-0 flex-1 truncate">
          Search “<span className="font-semibold">{item.query}</span>” in global markets
        </span>
      </>
    );
  }

  return (
    <>
      <IconTile icon={item.icon} selected={selected} />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
    </>
  );
}

function Tag({
  tone,
  icon: IconCmp,
  children,
}: {
  tone: 'green' | 'amber';
  icon: Icon;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[4px] px-2 py-0.5 text-[11px] font-medium',
        tone === 'green'
          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          : 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
      )}
    >
      <IconCmp className="h-3 w-3 opacity-70" aria-hidden />
      {children}
    </span>
  );
}
