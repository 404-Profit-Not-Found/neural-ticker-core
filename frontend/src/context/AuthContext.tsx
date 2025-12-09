import React, { createContext, useContext, useState, useEffect } from 'react';
import { httpClient } from '../lib/api';

interface User {
    id: string;
    email: string;
    name: string;
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
        checkSession();
    }, []);

    const checkSession = async () => {
        try {
            // Attempt to fetch profile using cookie - use httpClient (root) not api (v1)
            const { data } = await httpClient.get('/auth/profile');
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
        window.location.href = '/auth/google'; // Full redirect
    };

    const loginWithDevToken = async (email: string) => {
        try {
            // Use httpClient for auth endpoints
            const { data } = await httpClient.post('/auth/dev/token', { email });
            console.log('Dev token received:', data);
            await checkSession();
        } catch (error) {
            console.error('Login failed', error);
            throw error;
        }
    };

    const logout = () => {
        // Ideally call logout endpoint to clear cookie
        setUser(null);
        // document.cookie = ... (clearing)
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
