import { Suspense, useEffect, useLayoutEffect, useRef } from 'react';
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useNavigationType,
  useParams,
} from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CurrencyProvider } from './context/CurrencyContext';
import { LanguageProvider } from './context/LanguageContext';
import { SuperLoading } from './components/ui/SuperLoading';
import { AppToaster, ToastProvider } from './components/ui/toast';
import { ConfirmProvider } from './components/ui/confirm';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { AppShell } from './components/layout/AppShell';
import { PageFallback } from './components/layout/PageFallback';
import { ThemeController } from './app/ThemeController';
import { Pages, preloadRoutes } from './app/routes';
import { BASE } from './lib/base';

// Scroll handling for a single-page app:
//  - a new navigation (PUSH/REPLACE) starts at the top of the page;
//  - Back/Forward (POP) returns to where the user was on that entry.
// Tab switches inside the ticker page keep their position (same page, new URL).
const scrollPositions = new Map<string, number>();

function ScrollManager() {
  const location = useLocation();
  const navType = useNavigationType();
  const prev = useRef<{ key: string; page: string } | null>(null);

  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  useLayoutEffect(() => {
    const page = pageId(location.pathname);
    const last = prev.current;
    prev.current = { key: location.key, page };
    if (!last) return;

    if (navType === 'POP') {
      const y = scrollPositions.get(location.key) ?? 0;
      window.scrollTo(0, y);
      // Lazily-rendered content may not have its full height on the first
      // frame; try once more after layout settles.
      const raf = requestAnimationFrame(() => window.scrollTo(0, y));
      return () => cancelAnimationFrame(raf);
    }
    if (last.page !== page) {
      window.scrollTo(0, 0);
      const raf = requestAnimationFrame(() => window.scrollTo(0, 0));
      return () => cancelAnimationFrame(raf);
    }
    return undefined;
  }, [location.key, location.pathname, navType]);

  // Record the outgoing entry's position continuously (cheap, passive).
  useEffect(() => {
    const key = location.key;
    const onScroll = (): void => {
      scrollPositions.set(key, window.scrollY);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [location.key]);

  return null;
}

// `/ticker/NVDA/news` and `/ticker/NVDA/financials` are the same page.
function pageId(pathname: string): string {
  const seg = pathname.split('/').filter(Boolean);
  if (seg[0] === 'ticker' && seg[1]) {
    return seg[2] === 'research' && seg[3]
      ? `ticker/${seg[1]}/research/${seg[3]}`
      : `ticker/${seg[1]}`;
  }
  return pathname;
}

// Signed-in area: session gate + the persistent shell (header, mobile nav,
// command palette). The shell stays mounted across navigations, so the header,
// its notification stream and cached queries are never torn down.
function ProtectedLayout() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (user) preloadRoutes();
  }, [user]);

  if (loading) {
    return <SuperLoading text="Initializing..." fullScreen={true} />;
  }
  if (!user) {
    // Send to the in-app login page rather than straight to Google: avoids an
    // infinite redirect loop when auth keeps failing.
    return <Navigate to="/login" replace />;
  }
  return <AppShell />;
}

function AdminOnly() {
  const { user } = useAuth();
  if (!user || user.role !== 'admin') {
    return <Navigate to="/access-denied" replace />;
  }
  return <Outlet />;
}

// Public pages render outside the shell but still need chunk loading + an
// error boundary of their own.
function PublicLayout() {
  const location = useLocation();
  return (
    <ErrorBoundary key={location.pathname}>
      <Suspense fallback={<PageFallback fullScreen />}>
        <Outlet />
      </Suspense>
    </ErrorBoundary>
  );
}

function LegacyTickerRedirect() {
  const { symbol } = useParams();
  return <Navigate to={symbol ? `/ticker/${symbol}` : '/'} replace />;
}

// After Google sign-in the backend lands here with the session cookie set.
function OAuthCallback() {
  const { refreshSession } = useAuth();
  const navigate = useNavigate();
  const didRun = useRef(false);

  useEffect(() => {
    // StrictMode double-invokes effects in dev; the exchange must run once.
    if (didRun.current) return;
    didRun.current = true;

    void refreshSession().then((sessionUser) => {
      navigate(sessionUser ? '/' : '/login', { replace: true });
    });
  }, [refreshSession, navigate]);

  return <SuperLoading text="Authenticating..." fullScreen />;
}

function App() {
  return (
    // No transitions for navigation: wrapped in one, React keeps the page you
    // are leaving on screen until the next one is ready, and a tap looks as if
    // it did nothing. A tap must change the screen at once — to the page, or
    // to its loading state.
    <BrowserRouter basename={BASE || undefined} unstable_useTransitions={false}>
      <ScrollManager />
      <AuthProvider>
        <LanguageProvider>
          <CurrencyProvider>
            <ThemeController />
            <ToastProvider>
              <ConfirmProvider>
              <Routes>
                {/* Public */}
                <Route element={<PublicLayout />}>
                  <Route path="/login" element={<Pages.Login />} />
                  <Route path="/access-denied" element={<Pages.AccessDenied />} />
                  <Route path="/oauth-callback" element={<OAuthCallback />} />
                  <Route path="/privacy" element={<Pages.Privacy />} />
                  <Route path="/privacy-policy" element={<Pages.Privacy />} />
                  <Route path="/terms" element={<Pages.Terms />} />
                  <Route path="/terms-of-service" element={<Pages.Terms />} />
                  <Route path="/about" element={<Pages.About />} />
                  <Route
                    path="/report/:researchId/:signature"
                    element={<Pages.PublicResearch />}
                  />
                </Route>

                {/* Signed-in */}
                <Route element={<ProtectedLayout />}>
                  <Route path="/" element={<Pages.Dashboard />} />
                  <Route path="/dashboard" element={<Pages.Dashboard />} />
                  <Route path="/ticker/:symbol" element={<Pages.TickerDetail />} />
                  <Route
                    path="/ticker/:symbol/overview"
                    element={<Pages.TickerDetail />}
                  />
                  <Route
                    path="/ticker/:symbol/research"
                    element={<Pages.TickerDetail />}
                  />
                  <Route
                    path="/ticker/:symbol/financials"
                    element={<Pages.TickerDetail />}
                  />
                  <Route
                    path="/ticker/:symbol/news"
                    element={<Pages.TickerDetail />}
                  />
                  <Route
                    path="/ticker/:symbol/social"
                    element={<Pages.TickerDetail />}
                  />
                  <Route
                    path="/ticker/:symbol/research/:id"
                    element={<Pages.Research />}
                  />
                  <Route path="/research" element={<Pages.ResearchList />} />
                  <Route path="/profile" element={<Pages.Profile />} />
                  <Route path="/portfolio" element={<Pages.Portfolio />} />
                  <Route path="/watchlist" element={<Pages.Watchlist />} />
                  <Route path="/analyzer" element={<Pages.Analyzer />} />
                  <Route path="/news" element={<Pages.News />} />
                  <Route path="/alerts" element={<Pages.Alerts />} />

                  <Route element={<AdminOnly />}>
                    <Route path="/admin" element={<Pages.Admin />} />
                  </Route>

                  <Route
                    path="/dashboard/ticker/:symbol"
                    element={<LegacyTickerRedirect />}
                  />
                </Route>

                {/* Unknown URLs go home (ProtectedLayout handles the auth bounce). */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              </ConfirmProvider>
              <AppToaster />
            </ToastProvider>
          </CurrencyProvider>
        </LanguageProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
