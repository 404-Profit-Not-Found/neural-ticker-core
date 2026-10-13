import { Suspense, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { CommandPalette } from './CommandPalette';
import { Header } from './Header';
import { KeyboardShortcuts } from './KeyboardShortcuts';
import { MobileTabBar } from './MobileTabBar';
import { PageFallback } from './PageFallback';
import { StatusBar } from './StatusBar';
import { TickerTape } from './TickerTape';
import { recordRecentTicker } from '../../app/commandPalette';

/** Pages about the account or the app itself, not the market: no live strip. */
const NO_TAPE = /^\/(profile|admin)(\/|$)/;

/**
 * Persistent frame for the signed-in app. Mounted once: navigating between
 * pages only swaps the <Outlet>, so the header (and its live notification
 * stream) and the mobile tab bar never remount or flicker.
 */
export function AppShell() {
  const location = useLocation();
  const isHome = location.pathname === '/' || location.pathname === '/dashboard';
  const showTape = !NO_TAPE.test(location.pathname);

  // Feed the palette's "Recently viewed" list from actual ticker visits,
  // however the user got there (search, a card, a notification, a deep link).
  useEffect(() => {
    const match = /^\/ticker\/([^/]+)/.exec(location.pathname);
    if (match) recordRecentTicker(decodeURIComponent(match[1]));
  }, [location.pathname]);

  return (
    <div className="min-h-dvh bg-background text-foreground font-sans selection:bg-primary/30">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <Header />
      {/* Live market strip: on desktop on every market page; on phones only on
          the home screen, where it sets the scene without costing every page
          a row. Never on account pages (profile, admin). */}
      {showTape && <TickerTape className={isHome ? undefined : 'hidden lg:block'} />}

      {/* Bottom padding keeps content clear of the fixed tab bar / status bar. */}
      <div
        id="main"
        tabIndex={-1}
        className="outline-none pb-[var(--shell-bottom)]"
      >
        {/* Keyed by path so a crashed page recovers on the next navigation. */}
        <ErrorBoundary key={location.pathname}>
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </div>

      <MobileTabBar />
      <StatusBar />
      <CommandPalette />
      <KeyboardShortcuts />
    </div>
  );
}
