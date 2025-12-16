import { BrowserRouter, Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
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


import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { useEffect } from 'react';
import { api, httpClient } from './lib/api';

// Protected Route Wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="min-h-screen bg-[#09090b] flex items-center justify-center text-blue-500">Loading NeuralTicker...</div>;

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
      <AuthProvider>
        <ThemeController />
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <ErrorBoundary>
                    <Dashboard />
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            />
            <Route
              path="/ticker/:symbol/:tab?"
              element={
                <ProtectedRoute>
                  <TickerDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/research/:id"
              element={
                <ProtectedRoute>
                  <ResearchPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/research"
              element={
                <ProtectedRoute>
                  <ResearchListPage />
                </ProtectedRoute>
              }
            />
            {/* Redirect Legacy Route */}
            <Route path="/dashboard/ticker/:symbol" element={<Navigate to="/ticker/:symbol" replace />} />

            {/* Add more routes here */}
            <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            <Route path="/portfolio" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/watchlist" element={<ProtectedRoute><WatchlistPage /></ProtectedRoute>} />
            <Route path="/analyzer" element={<ProtectedRoute><AnalyzerPage /></ProtectedRoute>} />
            <Route path="/news" element={<ProtectedRoute><NewsPage /></ProtectedRoute>} />



            <Route path="/admin" element={
              <AdminRoute>
                <ErrorBoundary>
                  <AdminConsole />
                </ErrorBoundary>
              </AdminRoute>
            } />
            <Route path="/access-denied" element={<AccessDenied />} />
            <Route path="/oauth-callback" element={<OAuthCallback />} />
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

  return null;
}

// Simple Callback Handler to refresh user state
function OAuthCallback() {
  const { refreshSession } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      const searchParams = new URLSearchParams(window.location.search);
      const token = searchParams.get('token');

      if (token) {
        console.log('OAuth Header Fallback Active');
        // Set header for current session as fallback if cookie fails
        httpClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }

      await refreshSession();
      navigate('/');
    };

    handleCallback();
  }, [refreshSession, navigate]);

  return <div className="min-h-screen bg-[#09090b] flex items-center justify-center text-[#a1a1aa]">Authenticating...</div>;
}

export default App;
