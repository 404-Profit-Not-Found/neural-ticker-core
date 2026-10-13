// Route chunks. Every page is its own lazily-loaded chunk so the first paint
// only ships the shell. After that the app must never make a tap wait for the
// network:
//   - once the user is signed in, every page chunk is fetched in the
//     background (`preloadRoutes`), and links warm theirs on intent
//     (`preloadRoute`);
//   - a page whose chunk is already in memory renders synchronously — no
//     Suspense round-trip, so no flash of the fallback;
//   - a page that is not loaded yet shows the loading screen at once (the
//     router does not hold the old page on screen; see App.tsx).
import { createElement, lazy, useState, type ComponentType } from 'react';

type Loader = () => Promise<unknown>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = ComponentType<any>;

export type PageComponent = AnyComponent & {
  preload: Loader;
};

function page<M extends Record<string, unknown>, K extends keyof M>(
  load: () => Promise<M>,
  name: K,
): PageComponent {
  // Dedupe: a preload followed by the real render shares one import promise.
  let pending: Promise<M> | null = null;
  // The page itself, as soon as its chunk has arrived.
  let loaded: AnyComponent | null = null;
  const once = (): Promise<M> => {
    pending ??= load()
      .then((m) => {
        loaded = m[name] as AnyComponent;
        clearReloadFlag();
        return m;
      })
      .catch((err: unknown) => {
        pending = null; // allow a retry after a failed chunk fetch
        throw err;
      });
    return pending;
  };
  const Lazy = lazy(() =>
    once()
      .then((m) => ({ default: m[name] as AnyComponent }))
      .catch((err: unknown) => {
        // Only a page the user actually asked for may reload the tab — a
        // failed background preload must not.
        recoverFromStaleDeploy();
        throw err;
      }),
  );

  function Page(props: Record<string, unknown>) {
    // Chosen once per mount: swapping the type later would remount the page.
    const [Impl] = useState<AnyComponent>(() => loaded ?? Lazy);
    return createElement(Impl, props);
  }
  Page.displayName = `Page(${String(name)})`;

  const C = Page as PageComponent;
  C.preload = once;
  return C;
}

// A tab opened before a deploy still references the previous build's chunk
// hashes; those files are gone, so the import fails. One reload picks up the
// new index.html. Guarded per session so a genuinely broken chunk (or being
// offline) cannot cause a reload loop — the error boundary shows instead.
const RELOAD_FLAG = 'nt_v2_chunk_reload';

function recoverFromStaleDeploy(): void {
  if (!navigator.onLine) return;
  try {
    if (sessionStorage.getItem(RELOAD_FLAG)) return;
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  } catch {
    return; // storage unavailable: don't risk a loop
  }
  window.location.reload();
}

// A chunk loaded fine, so the build on disk matches this tab again: re-arm
// the recovery for the next deploy.
function clearReloadFlag(): void {
  try {
    sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    /* storage unavailable */
  }
}

export const Pages = {
  Dashboard: page(() => import('../pages/Dashboard'), 'Dashboard'),
  Watchlist: page(() => import('../pages/WatchlistPage'), 'WatchlistPage'),
  Analyzer: page(() => import('../pages/AnalyzerPage'), 'AnalyzerPage'),
  TickerDetail: page(() => import('../pages/TickerDetail'), 'TickerDetail'),
  Research: page(() => import('../pages/ResearchPage'), 'ResearchPage'),
  ResearchList: page(
    () => import('../pages/ResearchListPage'),
    'ResearchListPage',
  ),
  Portfolio: page(() => import('../pages/PortfolioPage'), 'PortfolioPage'),
  News: page(() => import('../pages/NewsPage'), 'NewsPage'),
  Alerts: page(() => import('../pages/AlertsPage'), 'AlertsPage'),
  Profile: page(() => import('../pages/ProfilePage'), 'ProfilePage'),
  Admin: page(() => import('../pages/AdminConsole'), 'AdminConsole'),
  PublicResearch: page(
    () => import('../pages/PublicResearchPage'),
    'PublicResearchPage',
  ),
  About: page(() => import('../pages/AboutPage'), 'AboutPage'),
  Privacy: page(() => import('../pages/PrivacyPolicy'), 'PrivacyPolicy'),
  Terms: page(() => import('../pages/TermsOfService'), 'TermsOfService'),
  Login: page(() => import('../pages/Login'), 'Login'),
  AccessDenied: page(() => import('../pages/AccessDenied'), 'AccessDenied'),
} as const;

// First path segment → chunk. Keep in sync with the <Route> table in App.tsx.
const BY_SEGMENT: Record<string, PageComponent> = {
  '': Pages.Dashboard,
  dashboard: Pages.Dashboard,
  watchlist: Pages.Watchlist,
  analyzer: Pages.Analyzer,
  ticker: Pages.TickerDetail,
  research: Pages.ResearchList,
  portfolio: Pages.Portfolio,
  news: Pages.News,
  alerts: Pages.Alerts,
  profile: Pages.Profile,
  admin: Pages.Admin,
  report: Pages.PublicResearch,
  about: Pages.About,
  privacy: Pages.Privacy,
  terms: Pages.Terms,
  login: Pages.Login,
};

/** Warm the chunk for an in-app path (e.g. `/ticker/NVDA`). Never throws. */
export function preloadRoute(path: string): void {
  const seg = path.replace(/^\/+/, '').split(/[/?#]/)[0] ?? '';
  const target = BY_SEGMENT[seg];
  if (target) void target.preload().catch(() => undefined);
}

/**
 * Once the user is signed in: fetch every page of the app in the background,
 * most likely destinations first, one at a time so they never compete with
 * the data the current page is loading. After this no navigation waits for
 * the network.
 */
export function preloadRoutes(): void {
  // Respect "use less data"; links still warm their own chunk on intent.
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return;

  const order = [
    Pages.TickerDetail,
    Pages.Analyzer,
    Pages.Watchlist,
    Pages.Portfolio,
    Pages.Profile,
    Pages.Alerts,
    Pages.News,
    Pages.ResearchList,
    Pages.Research,
    Pages.Dashboard,
    Pages.Admin,
    Pages.About,
  ];
  const run = async (): Promise<void> => {
    for (const p of order) {
      try {
        await p.preload();
      } catch {
        // Offline or a stale deploy: the page will try again when opened.
      }
    }
  };
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => void run(), { timeout: 3000 });
  } else {
    setTimeout(() => void run(), 1500);
  }
}
