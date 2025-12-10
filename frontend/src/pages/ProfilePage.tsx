
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Header } from '../components/layout/Header';
import { api } from '../lib/api';
import { Settings, User, Save, Shield, Eye } from 'lucide-react';

export function ProfilePage() {
    const { user, refreshSession } = useAuth();
    const [nickname, setNickname] = useState('');
    const [viewMode, setViewMode] = useState('PRO');
    const [theme, setTheme] = useState('g100');
    const [saving, setSaving] = useState(false);

    // Live Preview Effect
    useEffect(() => {
        let previewTheme = theme;
        if (previewTheme.startsWith('g')) previewTheme = 'dark';
        if (!['light', 'dark', 'rgb'].includes(previewTheme)) previewTheme = 'dark';

        document.documentElement.setAttribute('data-theme', previewTheme);
        document.documentElement.classList.remove('theme-light', 'theme-dark', 'theme-rgb');
        document.documentElement.classList.add(`theme-${previewTheme}`);

        if (previewTheme === 'light') {
            document.documentElement.classList.remove('dark');
        } else {
            document.documentElement.classList.add('dark');
        }
    }, [theme]);

    useEffect(() => {
        if (user) {
            setNickname(user.nickname || '');
            setViewMode(user.view_mode || 'PRO');
            setTheme(user.theme || 'g100');
        }
    }, [user]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.patch('/users/me', {
                nickname,
                view_mode: viewMode,
                theme
            });
            await refreshSession(); // Refresh to get updated user data
        } catch (error) {
            console.error('Failed to update profile', error);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30">
            <Header />

            <main className="max-w-4xl mx-auto p-6 space-y-8 animate-in fade-in duration-500">
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center border border-border overflow-hidden">
                        {user?.avatar_url ? (
                            <img src={user.avatar_url} alt="Profile" className="w-full h-full object-cover rounded-full" />
                        ) : (
                            <User size={32} className="text-muted-foreground" />
                        )}
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-foreground to-muted-foreground rgb-text">
                            {nickname || user?.name || 'Trader'}
                        </h1>
                        <p className="text-muted-foreground">{user?.email}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Public Profile Settings */}
                    <div className="bg-card border border-border rounded-lg p-6 space-y-6 rgb-border">
                        <div className="flex items-center gap-2 mb-4">
                            <User className="text-primary" size={20} />
                            <h2 className="text-lg font-semibold">Identity</h2>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">Nickname</label>
                            <input
                                type="text"
                                value={nickname}
                                onChange={(e) => setNickname(e.target.value)}
                                className="w-full bg-background border border-border rounded-md px-4 py-2 focus:ring-2 focus:ring-primary focus:outline-none transition-all"
                                placeholder="Enter your nickname"
                            />
                            <p className="text-xs text-muted-foreground">Visible to other traders in rankings.</p>
                        </div>
                    </div>

                    {/* App Preferences */}
                    <div className="bg-card border border-border rounded-lg p-6 space-y-6 rgb-border">
                        <div className="flex items-center gap-2 mb-4">
                            <Settings className="text-secondary-foreground" size={20} />
                            <h2 className="text-lg font-semibold">Preferences</h2>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-muted-foreground">View Mode</label>
                                <div className="grid grid-cols-2 gap-2 bg-background p-1 rounded-md border border-border">
                                    <button
                                        onClick={() => setViewMode('KISS')}
                                        className={`flex items-center justify-center gap-2 px-4 py-2 rounded-sm text-sm font-medium transition-all ${viewMode === 'KISS'
                                            ? 'bg-muted text-foreground shadow-sm'
                                            : 'text-muted-foreground hover:text-foreground'
                                            }`}
                                    >
                                        <Shield size={14} />
                                        KISS
                                    </button>
                                    <button
                                        onClick={() => setViewMode('PRO')}
                                        className={`flex items-center justify-center gap-2 px-4 py-2 rounded-sm text-sm font-medium transition-all ${viewMode === 'PRO'
                                            ? 'bg-muted text-foreground shadow-sm'
                                            : 'text-muted-foreground hover:text-foreground'
                                            }`}
                                    >
                                        <Eye size={14} />
                                        PRO
                                    </button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {viewMode === 'KISS' ? 'Keep It Super Simple: Simplified interface for clear signals.' : 'Professional: Full data density and advanced charts.'}
                                </p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-muted-foreground">Theme</label>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <button
                                            onClick={() => setTheme('light')}
                                            className={`p-4 rounded-lg border flex flex-col items-center gap-2 transition-all ${theme === 'light'
                                                ? 'bg-background text-foreground border-primary ring-2 ring-primary/50'
                                                : 'bg-muted border-border text-muted-foreground hover:border-foreground/50'
                                                }`}
                                        >
                                            <div className="w-8 h-8 rounded-full bg-gray-200 border border-gray-300"></div>
                                            <span className="text-sm font-medium">Light</span>
                                        </button>

                                        <button
                                            onClick={() => setTheme('dark')}
                                            className={`p-4 rounded-lg border flex flex-col items-center gap-2 transition-all ${(theme === 'dark' || theme.startsWith('g'))
                                                ? 'bg-background text-foreground border-primary ring-2 ring-primary/50'
                                                : 'bg-muted border-border text-muted-foreground hover:border-foreground/50'
                                                }`}
                                        >
                                            <div className="w-8 h-8 rounded-full bg-[#09090b] border border-[#27272a]"></div>
                                            <span className="text-sm font-medium">Dark</span>
                                        </button>

                                        <button
                                            onClick={() => setTheme('rgb')}
                                            className={`p-4 rounded-lg border flex flex-col items-center gap-2 transition-all relative overflow-hidden group ${theme === 'rgb'
                                                ? 'bg-black text-white border-transparent ring-2 ring-purple-500/50'
                                                : 'bg-muted border-border text-muted-foreground hover:border-foreground/50'
                                                }`}
                                        >
                                            {/* RGB Gradient Background for active state */}
                                            {theme === 'rgb' && (
                                                <div className="absolute inset-0 bg-gradient-to-r from-red-500/20 via-green-500/20 to-blue-500/20 animate-pulse"></div>
                                            )}
                                            <div className="w-8 h-8 rounded-full bg-black border border-transparent bg-gradient-to-br from-red-500 via-green-500 to-blue-500 relative z-10"></div>
                                            <span className="text-sm font-medium relative z-10">RGB</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end pt-4">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2 rounded-md font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {saving ? (
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <Save size={18} />
                        )}
                        {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </main>
        </div>
    );
}

