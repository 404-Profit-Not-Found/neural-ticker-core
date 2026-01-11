import { BrowserRouter, Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SuperLoading } from './components/ui/SuperLoading';
import { ToastProvider } from './components/ui/toast';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { WatchlistPage } from './pages/WatchlistPage';
import { AnalyzerPage } from './pages/AnalyzerPage';
// import TickerDetails from './pages/TickerDetails'; // Legacy replaced by TickerDetail
import { ProfilePage } from './pages/ProfilePage';
import { AccessDenied } from './pages/AccessDenied';
import { AdminConsole } from './pages/AdminConsole';
import { AdminRoute } from './components/routes/AdminRoute';
import { TickerDetail } from './pages/TickerDetail';
import { ResearchPage } from './pages/ResearchPage';
import { ResearchListPage } from './pages/ResearchListPage';
import { NewsPage } from './pages/NewsPage';
import { PortfolioPage } from './pages/PortfolioPage';


import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { useEffect, useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

function ScrollToTop() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    // Disable native scroll restoration to prevent browser jumping
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
    
    // Immediate reset
    window.scrollTo(0, 0);
    
    // Secondary reset after a frame to catch any browser-initiated jumps
    // (e.g. from autofocus or scroll restoration attempts)
    const handle = requestAnimationFrame(() => {
      window.scrollTo(0, 0);
    });
    
    return () => cancelAnimationFrame(handle);
  }, [pathname]);

  return null;
}


// Protected Route Wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <SuperLoading text="Initializing..." fullScreen />;

  if (!user) {
    // Redirect to internal login page instead of auto-redirecting to Google
    // This prevents infinite loops if auth fails repeatedly
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <AuthProvider>
        <ThemeController />
        <ToastProvider>
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/access-denied" element={<AccessDenied />} />
            <Route path="/oauth-callback" element={<OAuthCallback />} />

            {/* Protected Routes */}
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/ticker/:symbol" element={<ProtectedRoute><TickerDetail /></ProtectedRoute>} />
            <Route path="/research" element={<ProtectedRoute><ResearchListPage /></ProtectedRoute>} />
            <Route path="/research/:ticker" element={<ProtectedRoute><ResearchPage /></ProtectedRoute>} />
            
            <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            <Route path="/portfolio" element={<ProtectedRoute><PortfolioPage /></ProtectedRoute>} />
            <Route path="/watchlist" element={<ProtectedRoute><WatchlistPage /></ProtectedRoute>} />
            <Route path="/analyzer" element={<ProtectedRoute><AnalyzerPage /></ProtectedRoute>} />
            <Route path="/news" element={<ProtectedRoute><NewsPage /></ProtectedRoute>} />

            {/* Admin Route */}
            <Route path="/admin" element={
              <AdminRoute>
                <ErrorBoundary>
                  <AdminConsole />
                </ErrorBoundary>
              </AdminRoute>
            } />

            {/* Redirect Legacy Route */}
            <Route path="/dashboard/ticker/:symbol" element={<Navigate to="/ticker/:symbol" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

// Separate component to consume AuthContext inside AuthProvider
function ThemeController() {
  const { user } = useAuth();

  useEffect(() => {
    // Map legacy 'g100' or default to 'dark'
    let theme = user?.theme || 'dark';
    if (theme.startsWith('g')) theme = 'dark'; // Fallback for old themes
    if (!['light', 'dark', 'rgb'].includes(theme)) theme = 'dark';

    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.classList.remove('theme-light', 'theme-dark', 'theme-rgb');
    document.documentElement.classList.add(`theme-${theme}`);

    // For RGB mode, we might want to ensure dark mode base styles are applied
    if (theme === 'rgb') {
      document.documentElement.classList.add('dark');
    } else if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    // Dynamic Meta Theme Color Update for Mobile Browsers
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', theme === 'light' ? '#ffffff' : '#09090b');
    }

  }, [user?.theme]);

  // Handle global loader removal if it exists
  useEffect(() => {
     // If we are mounting, maybe we should remove index.html loader if it's still there?
     // React usually wipes "root", but the loader is often outside or inside root.
     // In our case, index.html has static content in #root. React wipes it.
     // So no manual removal needed.
  }, []);

  return null;
}

// Simple Callback Handler to refresh user state
function OAuthCallback() {
  const { refreshSession } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      await refreshSession();
      navigate('/', { replace: true });
    };

    handleCallback();
  }, [refreshSession, navigate]);

  return <SuperLoading text="Authenticating..." fullScreen />;
}

export default App;
