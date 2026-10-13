// Route chunks. Every page is its own lazily-loaded chunk so the first paint
// only ships the shell; `preloadRoute` lets links and the idle callback warm a
// chunk before the user navigates, which makes the transition itself instant.
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

type Loader = () => Promise<unknown>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = ComponentType<any>;

export type PageComponent = LazyExoticComponent<AnyComponent> & {
  preload: Loader;
};

function page<M extends Record<string, unknown>, K extends keyof M>(
  load: () => Promise<M>,
  name: K,
): PageComponent {
  // Dedupe: a preload followed by the real render shares one import promise.
  let pending: Promise<M> | null = null;
  const once = (): Promise<M> => {
    pending ??= load().catch((err: unknown) => {
      pending = null; // allow a retry after a failed chunk fetch
      throw err;
    });
    return pending;
  };
  const C = lazy(() =>
    once()
      .then((m) => {
        clearReloadFlag();
        return { default: m[name] as AnyComponent };
      })
      .catch((err: unknown) => {
        recoverFromStaleDeploy();
        throw err;
      }),
  ) as PageComponent;
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

/** After first paint, warm the routes a signed-in user is most likely to open. */
export function preloadCommonRoutes(): void {
  const run = (): void => {
    for (const p of [Pages.TickerDetail, Pages.Analyzer, Pages.Portfolio, Pages.Watchlist]) {
      void p.preload().catch(() => undefined);
    }
  };
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 4000 });
  } else {
    setTimeout(run, 2500);
  }
}
