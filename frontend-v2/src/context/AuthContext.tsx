import { clearRecentTickers } from '../app/commandPalette';
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { httpClient } from '../lib/api';
import { queryClient, persister, claimCacheFor } from '../lib/queryClient';
import { appPath, appPathname, startGoogleLogin } from '../lib/base';

interface NotificationPreferences {
    push_enabled?: boolean;
    email_enabled?: boolean;
}

interface UserPreferences {
    notifications?: NotificationPreferences;
    language?: string;
    [key: string]: unknown;
}

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
    preferences?: UserPreferences;
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

    // Deduplication: prevent concurrent checkSession calls from racing
    const sessionCheckRef = useRef<Promise<User | null> | null>(null);

    const checkSession = useCallback(async (): Promise<User | null> => {
        // If a check is already in-flight, return the existing promise (dedup)
        if (sessionCheckRef.current) {
            return sessionCheckRef.current;
        }

        const promise = (async () => {
            try {
                const { data } = await httpClient.get('/api/auth/profile');
                // Drop any cache left behind by a different account BEFORE the
                // app renders with this user.
                await claimCacheFor(data?.id ?? null);
                setUser(data);
                return data;
            } catch (err) {
                console.warn('Session check failed:', err);
                // Only a definite "not signed in" proves the cache is orphaned;
                // a network blip must not wipe a signed-in user's offline cache.
                const status = (err as { response?: { status?: number } })?.response?.status;
                if (status === 401 || status === 403) {
                    await claimCacheFor(null);
                }
                setUser(null);
                return null;
            } finally {
                setLoading(false);
                sessionCheckRef.current = null; // Clear after completion
            }
        })();

        sessionCheckRef.current = promise;
        return promise;
    }, []);

    // Check session on mount
    useEffect(() => {
        // Skip check if handling callback or viewing a public report
        const path = appPathname();
        if (path.startsWith('/oauth-callback') ||
            path.startsWith('/report/') ||
            path.startsWith('/privacy') ||
            path.startsWith('/terms') ||
            path.startsWith('/about')) {
            setLoading(false);
            return;
        }
        checkSession();
    }, [checkSession]);

    const refreshSession = checkSession;

    const loginWithGoogle = () => {
        startGoogleLogin(); // Full redirect
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
            await claimCacheFor(null);      // Forget who owned it
            clearRecentTickers();           // "Recently viewed" is per person too
        } catch (e) {
            console.error('Failed to clear local cache:', e);
        }

        // Clear local state
        setUser(null);
        // Redirect to login
        window.location.href = appPath('/');
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
