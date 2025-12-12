import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Header } from '../components/layout/Header';
import { api } from '../lib/api';
import { Settings, User, Save, Shield, Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

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
                <div className="flex items-center gap-6 mb-8">
                    <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center border border-border overflow-hidden shrink-0">
                        {user?.avatar_url ? (
                            <img src={user.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                            <User size={40} className="text-muted-foreground" />
                        )}
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-muted-foreground">
                            {nickname || user?.name || 'Trader'}
                        </h1>
                        <p className="text-muted-foreground font-mono text-sm mt-1">{user?.email}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Public Profile Settings */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <User className="text-primary" size={20} />
                                Identity
                            </CardTitle>
                            <CardDescription>
                                Manage your public trading persona
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="nickname">Nickname</Label>
                                <Input
                                    id="nickname"
                                    value={nickname}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNickname(e.target.value)}
                                    placeholder="Enter your nickname"
                                    className="bg-background"
                                />
                                <p className="text-xs text-muted-foreground">Visible to other traders in rankings.</p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* App Preferences */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Settings className="text-primary" size={20} />
                                Preferences
                            </CardTitle>
                            <CardDescription>
                                Customize your terminal experience
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-3">
                                <Label>View Mode</Label>
                                <div className="grid grid-cols-2 gap-3">
                                    <Button
                                        variant={viewMode === 'KISS' ? 'secondary' : 'outline'}
                                        onClick={() => setViewMode('KISS')}
                                        className="h-auto py-3 flex flex-col gap-2 relative overflow-hidden"
                                    >
                                        <Shield size={20} className={viewMode === 'KISS' ? 'text-primary' : 'text-muted-foreground'} />
                                        <span className="font-bold">KISS</span>
                                        {viewMode === 'KISS' && <div className="absolute inset-0 border-2 border-primary rounded-md opacity-20" />}
                                    </Button>
                                    <Button
                                        variant={viewMode === 'PRO' ? 'secondary' : 'outline'}
                                        onClick={() => setViewMode('PRO')}
                                        className="h-auto py-3 flex flex-col gap-2 relative overflow-hidden"
                                    >
                                        <Eye size={20} className={viewMode === 'PRO' ? 'text-primary' : 'text-muted-foreground'} />
                                        <span className="font-bold">PRO</span>
                                        {viewMode === 'PRO' && <div className="absolute inset-0 border-2 border-primary rounded-md opacity-20" />}
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {viewMode === 'KISS' ? 'Keep It Super Simple: Simplified interface for clear signals.' : 'Professional: Full data density and advanced charts.'}
                                </p>
                            </div>

                            <div className="space-y-3">
                                <Label>Theme</Label>
                                <div className="grid grid-cols-3 gap-3">
                                    <Button
                                        variant="outline"
                                        onClick={() => setTheme('light')}
                                        className={`h-auto py-4 flex flex-col gap-2 ${theme === 'light' ? 'border-primary ring-1 ring-primary bg-primary/5' : ''}`}
                                    >
                                        <div className="w-6 h-6 rounded-full bg-gray-200 border border-gray-300" />
                                        <span className="text-xs">Light</span>
                                    </Button>

                                    <Button
                                        variant="outline"
                                        onClick={() => setTheme('dark')}
                                        className={`h-auto py-4 flex flex-col gap-2 ${(theme === 'dark' || theme.startsWith('g')) ? 'border-primary ring-1 ring-primary bg-primary/5' : ''}`}
                                    >
                                        <div className="w-6 h-6 rounded-full bg-[#09090b] border border-[#27272a]" />
                                        <span className="text-xs">Dark</span>
                                    </Button>

                                    <Button
                                        variant="outline"
                                        onClick={() => setTheme('rgb')}
                                        className={`h-auto py-4 flex flex-col gap-2 relative overflow-hidden group ${theme === 'rgb' ? 'border-transparent ring-2 ring-purple-500/50' : ''}`}
                                    >
                                        {theme === 'rgb' && (
                                            <div className="absolute inset-0 bg-gradient-to-r from-red-500/20 via-green-500/20 to-blue-500/20 animate-pulse" />
                                        )}
                                        <div className="w-6 h-6 rounded-full bg-black border border-transparent bg-gradient-to-br from-red-500 via-green-500 to-blue-500 relative z-10" />
                                        <span className="text-xs relative z-10">RGB</span>
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="flex justify-end pt-4">
                    <Button
                        onClick={handleSave}
                        disabled={saving}
                        size="lg"
                        className="gap-2"
                    >
                        {saving ? (
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <Save size={18} />
                        )}
                        {saving ? 'Saving Changes...' : 'Save Preferences'}
                    </Button>
                </div>
            </main>
        </div>
    );
}

