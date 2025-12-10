import React, { createContext, useContext, useState, useEffect } from 'react';
import { httpClient } from '../lib/api';

interface User {
    id: string;
    email: string;
    name: string;
    nickname?: string;
    view_mode?: string;
    theme?: string;
    role: string;
    avatar: string;
}

interface AuthContextType {
    user: User | null;
    loading: boolean;
    loginWithGoogle: () => void;
    loginWithDevToken: (email: string) => Promise<void>;
    logout: () => void;
    refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    // Check session on mount
    useEffect(() => {
        // Skip check if handling callback (OAuthCallback component will handle it)
        if (window.location.pathname.startsWith('/oauth-callback')) {
            return;
        }
        checkSession();
    }, []);

    const checkSession = async () => {
        try {
            // Attempt to fetch profile using cookie - use httpClient (root) not api (v1)
            const { data } = await httpClient.get('/api/auth/profile');
            setUser(data);
        } catch (err) {
            console.warn('Session check failed:', err); // Log error for debug
            setUser(null);
        } finally {
            setLoading(false);
        }
    };

    const refreshSession = checkSession;

    const loginWithGoogle = () => {
        window.location.href = '/api/auth/google'; // Full redirect
    };

    const loginWithDevToken = async (email: string) => {
        try {
            // Use httpClient for auth endpoints
            const { data } = await httpClient.post('/api/auth/dev/token', { email });
            console.log('Dev token received:', data);
            await checkSession();
        } catch (error) {
            console.log('Login failed', error);
            throw error;
        }
    };

    const logout = async () => {
        try {
            // Call backend logout to clear cookie
            await httpClient.post('/api/auth/logout');
        } catch (e) {
            console.warn('Logout endpoint failed:', e);
        }
        // Clear local state
        setUser(null);
        // Redirect to login
        window.location.href = '/';
    };

    return (
        <AuthContext.Provider value={{ user, loading, loginWithGoogle, loginWithDevToken, logout, refreshSession }}>
            {children}
        </AuthContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within an AuthProvider');
    return context;
};
