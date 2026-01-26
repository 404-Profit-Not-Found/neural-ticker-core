import React, { createContext, useContext, useState, useEffect } from 'react';
import { httpClient } from '../lib/api';
import { queryClient, persister } from '../lib/queryClient';

interface User {
    id: string;
    email: string;
    name: string;
    nickname?: string;
    view_mode?: string;
    theme?: string;
    role: string;
    tier: 'free' | 'pro' | 'whale' | 'admin';
    credits_balance?: number;
    avatar_url: string;
    has_onboarded?: boolean;
}

interface AuthContextType {
    user: User | null;
    loading: boolean;
    loginWithGoogle: () => void;
    logout: () => void;
    refreshSession: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    // Check session on mount
    useEffect(() => {
        // Skip check if handling callback or viewing a public report
        if (window.location.pathname.startsWith('/oauth-callback') ||
            window.location.pathname.startsWith('/report/') ||
            window.location.pathname.startsWith('/privacy') ||
            window.location.pathname.startsWith('/terms') ||
            window.location.pathname.startsWith('/about')) {
            setLoading(false); // Important: set loading to false so components can render
            return;
        }
        checkSession();
    }, []);

    const checkSession = async (): Promise<User | null> => {
        try {
            // Attempt to fetch profile using cookie - use httpClient (root) not api (v1)
            const { data } = await httpClient.get('/api/auth/profile');
            setUser(data);
            return data;
        } catch (err) {
            console.warn('Session check failed:', err); // Log error for debug
            setUser(null);
            return null;
        } finally {
            setLoading(false);
        }
    };

    const refreshSession = checkSession;

    const loginWithGoogle = () => {
        window.location.href = '/api/auth/google'; // Full redirect
    };

    const logout = async () => {
        try {
            // Call backend logout to clear cookie
            await httpClient.post('/api/auth/logout');
        } catch (e) {
            console.warn('Logout endpoint failed:', e);
        }

        // CRITICAL: Clear all local state to prevent data leaks between users
        try {
            await persister.removeClient(); // Clear IndexedDB
            queryClient.clear();            // Clear in-memory cache
        } catch (e) {
            console.error('Failed to clear local cache:', e);
        }

        // Clear local state
        setUser(null);
        // Redirect to login
        window.location.href = '/';
    };

    return (
        <AuthContext.Provider value={{ user, loading, loginWithGoogle, logout, refreshSession }}>
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
