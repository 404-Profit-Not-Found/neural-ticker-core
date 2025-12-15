import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Header } from '../components/layout/Header';
import { api } from '../lib/api';
import { UserService } from '../services/userService'; // Added
import { Settings, User, Save, Shield, Eye, CreditCard, History } from 'lucide-react'; // Added icons
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { useQuery } from '@tanstack/react-query'; // Added
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '../components/ui/table'; // Assuming Table components exist


export function ProfilePage() {
    const { user, refreshSession } = useAuth();
    const navigate = useNavigate();
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
                    {/* Membership & Credits (Full Width on Desktop or 1st in Grid?) Let's put it on top if grid-cols-1 */}
                    <Card className="md:col-span-2">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <CreditCard className="text-primary" size={20} />
                                Membership & Credits
                            </CardTitle>
                            <CardDescription>
                                Your Pro status and research credits
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex flex-col gap-2 p-4 bg-muted/30 rounded-lg border border-border">
                                <div className="flex items-center gap-4">
                                    <Badge
                                        variant="outline"
                                        className={`text-lg px-3 py-1 font-bold ${profile?.tier === 'pro' || profile?.tier === 'admin'
                                            ? 'border-purple-500 text-purple-500 uppercase'
                                            : 'border-emerald-500 text-emerald-500 uppercase'
                                            }`}
                                    >
                                        {profile?.tier ? profile.tier.toUpperCase() : 'FREE'}
                                    </Badge>

                                    <div className="flex items-center gap-2">
                                        <span className="text-3xl font-mono font-bold text-primary">
                                            {profile?.credits_balance ?? 0}
                                        </span>
                                        <span className="text-sm text-muted-foreground self-end mb-1">credits</span>
                                    </div>

                                    {profile?.tier === 'free' && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 text-xs font-semibold text-purple-400 border-purple-500/50 hover:bg-purple-500/10 hover:text-purple-300 ml-auto transition-all shadow-sm shadow-purple-500/10"
                                        >
                                            Upgrade to Pro
                                        </Button>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Refills monthly. Earn more by contributing.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label className="flex items-center gap-2">
                                    <History size={16} /> Transaction History
                                </Label>
                                <div className="border rounded-md overflow-hidden">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Date</TableHead>
                                                <TableHead>Action</TableHead>
                                                <TableHead className="text-right">Amount</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {profile?.credit_transactions?.slice(0, 10).map((tx) => {
                                                const researchId = tx.metadata?.research_id || tx.metadata?.noteId;
                                                const isResearch = (tx.reason === 'research_spend' || tx.metadata?.noteId) && !!researchId;

                                                return (
                                                    <TableRow
                                                        key={tx.id}
                                                        className={isResearch ? "cursor-pointer hover:bg-muted/50 transition-colors group" : ""}
                                                        onClick={() => isResearch && navigate(`/research/${researchId}`)}
                                                    >
                                                        <TableCell className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                                                            {new Date(tx.created_at).toLocaleString(undefined, {
                                                                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                                            })}
                                                        </TableCell>
                                                        <TableCell className="text-sm">
                                                            {isResearch ? (
                                                                <div className="flex items-center gap-2">
                                                                    <Badge variant="outline" className="px-1 py-0 h-5 font-mono text-[10px] text-muted-foreground border-border group-hover:border-primary/50 transition-colors">
                                                                        ID: {(researchId as string).slice(0, 5)}
                                                                    </Badge>
                                                                    <span className="text-xs text-muted-foreground group-hover:text-primary transition-colors">Research Analysis</span>
                                                                </div>
                                                            ) : (
                                                                <span className="capitalize">{tx.reason.replace(/_/g, ' ')}</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className={`text-right font-mono font-bold ${tx.amount > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                            {tx.amount > 0 ? '+' : ''}{tx.amount}
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                            {(!profile?.credit_transactions || profile.credit_transactions.length === 0) && (
                                                <TableRow>
                                                    <TableCell colSpan={3} className="text-center py-6 text-muted-foreground">
                                                        No transactions yet.
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

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

