import { useState, useEffect } from 'react';
// import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Header } from '../components/layout/Header';
import { api } from '../lib/api';
import { UserService } from '../services/userService'; // Added
import { Settings, User, Save, CreditCard, History } from 'lucide-react'; // Added icons
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { useQuery } from '@tanstack/react-query'; // Added
import {
    // Table,
    // TableBody,
    // TableCell,
    // TableHead,
    // TableHeader,
    // TableRow,
} from '../components/ui/table';
import { TransactionHistoryDialog } from '../components/profile/TransactionHistoryDialog';


export function ProfilePage() {
    const { user, refreshSession } = useAuth();
    const [nickname, setNickname] = useState('');
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
            setTheme(user.theme || 'g100');
        }
    }, [user]);

    // Fetch Full Profile including credits
    const { data: profile } = useQuery({
        queryKey: ['userProfile', user?.id],
        queryFn: UserService.getProfile,
        enabled: !!user?.id,
    });


    const handleSave = async () => {
        setSaving(true);
        try {
            await api.patch('/users/me', {
                nickname,
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

            <main className="max-w-5xl mx-auto p-4 sm:p-8 space-y-8 animate-in fade-in duration-500">

                {/* Header Section */}
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 mb-8 text-center sm:text-left">
                    <div className="relative group">
                        <div className="relative w-24 h-24 rounded-full bg-muted flex items-center justify-center border-2 border-background overflow-hidden shrink-0">
                            {user?.avatar_url ? (
                                <img src={user.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                            ) : (
                                <User size={48} className="text-muted-foreground" />
                            )}
                        </div>
                    </div>
                    <div>
                        <div className="flex items-center justify-center sm:justify-start gap-3">
                            <h1 className="text-3xl font-bold tracking-tight text-foreground">
                                {nickname || user?.name || 'Trader'}
                            </h1>
                            {profile?.tier === 'pro' && (
                                <Badge className="bg-gradient-to-r from-violet-600 to-fuchsia-600 border-0">PRO</Badge>
                            )}
                        </div>
                        <p className="text-muted-foreground font-mono text-sm mt-1">{user?.email}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Membership & Credits */}
                    <Card className="md:col-span-2 border-primary/20 bg-muted/10 overflow-hidden relative">
                        <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 via-transparent to-transparent pointer-events-none" />
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <CreditCard className="text-primary" size={20} />
                                Membership & Credits
                            </CardTitle>
                            <CardDescription>
                                Your subscription status and available research credits
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6 relative z-10">
                            <div className="flex flex-col sm:flex-row gap-6 items-center justify-between p-6 bg-background/50 rounded-xl border border-border/50 shadow-sm">
                                <div className="text-center sm:text-left space-y-1">
                                    <div className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Current Balance</div>
                                    <div className="text-3xl font-mono font-bold text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-fuchsia-400">
                                        {profile?.credits_balance ?? 0}
                                    </div>
                                    <div className="text-xs text-muted-foreground">credits remaining this month</div>
                                </div>

                                <div className="h-12 w-[1px] bg-border hidden sm:block" />

                                <div className="flex flex-col gap-3 w-full sm:w-auto">
                                    <TransactionHistoryDialog
                                        transactions={profile?.credit_transactions}
                                        trigger={
                                            <Button variant="outline" className="w-full justify-start gap-2 border-primary/20 hover:border-primary/50 hover:bg-primary/5">
                                                <History size={16} className="text-primary" />
                                                View History
                                                <span className="ml-auto text-xs text-muted-foreground font-mono">
                                                    {profile?.credit_transactions?.length ?? 0} tx
                                                </span>
                                            </Button>
                                        }
                                    />
                                    {profile?.tier === 'free' && (
                                        <Button className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:opacity-90 transition-opacity border-0">
                                            Upgrade to Pro
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Identity */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <User className="text-primary" size={20} />
                                Identity
                            </CardTitle>
                            <CardDescription>
                                How you appear in the community
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="nickname">Display Name</Label>
                                <Input
                                    id="nickname"
                                    value={nickname}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNickname(e.target.value)}
                                    placeholder="Enter your nickname"
                                    className="bg-muted/50 border-input focus:ring-primary h-11"
                                />
                                <p className="text-xs text-muted-foreground">This name will be visible on your shared research notes.</p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Preferences */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Settings className="text-primary" size={20} />
                                Appearance
                            </CardTitle>
                            <CardDescription>
                                Customize your terminal experience
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-3 gap-3">
                                <Button
                                    variant="outline"
                                    onClick={() => setTheme('light')}
                                    className={`h-24 flex flex-col gap-3 hover:bg-muted/50 border-input ${theme === 'light' ? 'border-primary ring-1 ring-primary bg-primary/5' : ''}`}
                                >
                                    <div className="w-8 h-8 rounded-full bg-white border border-gray-200 shadow-sm" />
                                    <span className="text-xs font-medium">Light</span>
                                </Button>

                                <Button
                                    variant="outline"
                                    onClick={() => setTheme('dark')}
                                    className={`h-24 flex flex-col gap-3 hover:bg-muted/50 border-input ${(theme === 'dark' || theme.startsWith('g')) ? 'border-primary ring-1 ring-primary bg-primary/5' : ''}`}
                                >
                                    <div className="w-8 h-8 rounded-full bg-zinc-950 border border-zinc-800 shadow-sm" />
                                    <span className="text-xs font-medium">Dark</span>
                                </Button>

                                <Button
                                    variant="outline"
                                    onClick={() => setTheme('rgb')}
                                    className={`h-24 flex flex-col gap-3 relative overflow-hidden group border-input ${theme === 'rgb' ? 'border-[transparent] ring-2 ring-fuchsia-500/50' : ''}`}
                                >
                                    <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 via-fuchsia-500/10 to-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    <div className="w-8 h-8 rounded-full bg-black border-0 bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-500 relative z-10 shadow-sm" />
                                    <span className="text-xs font-medium relative z-10">RGB</span>
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="flex justify-end pt-4 pb-20 sm:pb-4">
                    <Button
                        onClick={handleSave}
                        disabled={saving}
                        size="lg"
                        className="w-full sm:w-auto gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
                    >
                        {saving ? (
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <Save size={18} />
                        )}
                        {saving ? 'Saving...' : 'Save Configuration'}
                    </Button>
                </div>
            </main >
        </div >
    );
}

