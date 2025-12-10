import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/ui/toast';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import TickerDetails from './pages/TickerDetails'; // Added
import { ProfilePage } from './pages/ProfilePage';
import { AccessDenied } from './pages/AccessDenied';
import { AdminConsole } from './pages/AdminConsole';
import { AdminRoute } from './components/routes/AdminRoute';
import { useEffect } from 'react';
import { api, httpClient } from './lib/api';

// Protected Route Wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = '/api/auth/google';
    }
  }, [loading, user]);

  if (loading) return <div className="min-h-screen bg-[#09090b] flex items-center justify-center text-blue-500">Loading Neural Terminal...</div>;

  if (!user) return null;

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
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/ticker/:symbol"
              element={
                <ProtectedRoute>
                  <TickerDetails />
                </ProtectedRoute>
              }
            />
            {/* Add more routes here */}
            <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            <Route path="/portfolio" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/watchlist" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/analyzer" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

            <Route path="/admin" element={<AdminRoute><AdminConsole /></AdminRoute>} />
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
