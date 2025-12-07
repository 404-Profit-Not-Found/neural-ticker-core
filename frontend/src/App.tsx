import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { useEffect } from 'react';
import { api, httpClient } from './lib/api';

// Protected Route Wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="min-h-screen bg-[#09090b] flex items-center justify-center text-blue-500">Loading Neural Terminal...</div>;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
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
          {/* Add more routes here */}
          <Route path="/portfolio" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/watchlist" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/analyzer" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

          <Route path="/oauth-callback" element={<OAuthCallback />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
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
