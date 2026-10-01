import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Header } from '../components/layout/Header';
import { api } from '../lib/api';
import { UserService } from '../services/userService';
import {
    ChevronRight,
    CreditCard,
    Fingerprint,
    Settings,
    Moon,
    Sun,
    Palette,
    Mail,
    Plus,
    Camera,
    Cloud,
    Check,
    Loader2,
    Bell,
    Languages,
} from 'lucide-react';
import { Input } from '../components/ui/input';
import { UserTierBadge } from '../components/ui/user-tier-badge';
import { UserStatusBadge } from '../components/ui/user-status-badge';
import { useQuery } from '@tanstack/react-query';
import { cn, debounce } from '../lib/utils';
import { TransactionHistoryDialog } from '../components/profile/TransactionHistoryDialog';
import { useWebPush } from '../hooks/useWebPush';

// Version is injected by Vite (same as SuperLoading)
declare const __APP_VERSION__: string;

export function ProfilePage() {
    const { t } = useTranslation('profile');
    const { language, setLanguage } = useLanguage();
    const { user, refreshSession } = useAuth();
    const [nickname, setNickname] = useState('');
    const [originalNickname, setOriginalNickname] = useState('');
    const [isSavingNickname, setIsSavingNickname] = useState(false);
    const [avatarUrl, setAvatarUrl] = useState('');
    const [theme, setTheme] = useState('g100');
    const [isEditingAvatar, setIsEditingAvatar] = useState(false);
    const { isSupported: pushSupported, isSubscribed: pushSubscribed, isLoading: pushLoading, subscribe: pushSubscribe, unsubscribe: pushUnsubscribe } = useWebPush();

    // DB-backed notification preferences (cross-device)
    const [pushEnabled, setPushEnabled] = useState(true);
    const [emailEnabled, setEmailEnabled] = useState(false);
    const [isSavingNotifPrefs, setIsSavingNotifPrefs] = useState(false);

    // Live Preview Effect
    useEffect(() => {
        let previewTheme = theme;
        if (previewTheme.startsWith('g') && previewTheme !== 'gray') previewTheme = 'dark';
        if (!['light', 'dark', 'rgb', 'gray'].includes(previewTheme)) previewTheme = 'dark';

        document.documentElement.setAttribute('data-theme', previewTheme);
        document.documentElement.classList.remove('theme-light', 'theme-dark', 'theme-rgb', 'theme-gray');
        document.documentElement.classList.add(`theme-${previewTheme}`);

        if (previewTheme === 'light' || previewTheme === 'gray') {
            document.documentElement.classList.remove('dark');
        } else {
            document.documentElement.classList.add('dark');
        }
    }, [theme]);

    useEffect(() => {
        if (user) {
            const nick = user.nickname || '';
            setNickname(nick);
            setOriginalNickname(nick);
            setAvatarUrl(user.avatar_url || '');
            setTheme(user.theme || 'g100');
            // Hydrate notification preferences from DB
            const notifPrefs = user.preferences?.notifications;
            setPushEnabled(notifPrefs?.push_enabled ?? true);
            setEmailEnabled(notifPrefs?.email_enabled ?? false);
        }
    }, [user]);

    // Fetch Full Profile including credits
    const { data: profile } = useQuery({
        queryKey: ['userProfile', user?.id],
        queryFn: UserService.getProfile,
        enabled: !!user?.id,
    });

    // Auto-save function
    const saveChanges = useCallback(async (newNickname: string, newAvatarUrl: string, newTheme: string) => {
        try {
            await api.patch('/users/me', {
                nickname: newNickname,
                avatar_url: newAvatarUrl,
                theme: newTheme
            });
            await refreshSession();
        } catch (error) {
            console.error('Failed to update profile', error);
        }
    }, [refreshSession]);

    // Debounced auto-save for nickname/avatar
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const debouncedSave = useCallback(
        debounce((newNickname: string, newAvatarUrl: string, newTheme: string) => {
            saveChanges(newNickname, newAvatarUrl, newTheme);
        }, 800),
        [saveChanges]
    );

    // Handle nickname change (no auto-save, user must click confirm)
    const handleNicknameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setNickname(e.target.value);
    };

    // Explicit save for nickname
    const handleNicknameSave = async () => {
        if (nickname === originalNickname) return;
        setIsSavingNickname(true);
        try {
            await saveChanges(nickname, avatarUrl, theme);
            setOriginalNickname(nickname);
        } finally {
            setIsSavingNickname(false);
        }
    };

    // Handle avatar URL change with auto-save
    const handleAvatarUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newUrl = e.target.value;
        setAvatarUrl(newUrl);
        debouncedSave(nickname, newUrl, theme);
    };

    // Handle theme change with immediate save
    const handleThemeChange = (newTheme: string) => {
        setTheme(newTheme);
        saveChanges(nickname, avatarUrl, newTheme);
    };

    // Save notification preferences to DB (cross-device)
    const saveNotificationPreference = useCallback(async (key: 'push_enabled' | 'email_enabled', value: boolean) => {
        setIsSavingNotifPrefs(true);
        try {
            await api.post('/users/me/preferences', {
                notifications: {
                    ...(user?.preferences?.notifications || {}),
                    [key]: value,
                },
            });
            await refreshSession();
        } catch (error) {
            console.error('Failed to save notification preference', error);
        } finally {
            setIsSavingNotifPrefs(false);
        }
    }, [user?.preferences?.notifications, refreshSession]);

    // Toggle push: save to DB + subscribe/unsubscribe browser push
    const handlePushToggle = useCallback(async () => {
        const newValue = !pushEnabled;
        setPushEnabled(newValue); // optimistic

        if (newValue) {
            const ok = await pushSubscribe();
            if (!ok) {
                setPushEnabled(false); // revert if browser denied
                return;
            }
        } else {
            await pushUnsubscribe();
        }

        await saveNotificationPreference('push_enabled', newValue);
    }, [pushEnabled, pushSubscribe, pushUnsubscribe, saveNotificationPreference]);

    // Toggle email: save to DB only
    const handleEmailToggle = useCallback(async () => {
        const newValue = !emailEnabled;
        setEmailEnabled(newValue); // optimistic
        await saveNotificationPreference('email_enabled', newValue);
    }, [emailEnabled, saveNotificationPreference]);

    // Get tier badge (exact match to Admin Console UserAdminCard)
    const getTierBadge = (tier: string | undefined) => {
        return <UserTierBadge tier={tier} />;
    };

    // Get status badge (exact match to Admin Console UserAdminCard)
    const getStatusBadge = (role: string | undefined) => {
        // Since profile page only shows ACTIVE/ADMIN usually
        if (role === 'admin') {
            return <UserTierBadge tier="admin" />;
        }
        return <UserStatusBadge status="ACTIVE" />;
    };

    return (
        <div className="min-h-screen bg-background text-foreground font-sans">
            <Header />

            <main className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6 pt-8 pb-24">

                {/* PAGE TITLE */}
                <div className="space-y-1">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t('settings.title')}</h1>
                    <p className="text-muted-foreground text-sm">{t('settings.subtitle')}</p>
                </div>

                {/* USER PROFILE CARD - with avatar, email, tags - colorful accent */}
                <div className="relative bg-card border border-border/40 rounded-xl p-4 overflow-hidden">
                    {/* Subtle gradient accent */}
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-purple-500/5 pointer-events-none" />

                    <div className="relative flex items-center gap-4">
                        {/* Avatar with ring */}
                        <div className="relative group">
                            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500 to-purple-500 p-0.5">
                                <div className="w-full h-full rounded-full overflow-hidden bg-background">
                                    {(() => {
                                        const url = avatarUrl || user?.avatar_url;
                                        const getSafeUrl = (u: string): string | null => {
                                            try {
                                                const parsed = new URL(u);
                                                if (
                                                    ['http:', 'https:'].includes(parsed.protocol) &&
                                                    parsed.hostname
                                                ) {
                                                    // Use the canonical href to avoid odd relative/invalid forms
                                                    return parsed.href;
                                                }
                                                return null;
                                            } catch {
                                                return null;
                                            }
                                        };
                                        const safeUrl = url ? getSafeUrl(url) : null;
                                        return safeUrl ? (
                                            <img src={safeUrl} alt="Profile" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground text-lg font-medium">
                                                {(user?.nickname || user?.email || '??').slice(0, 2).toUpperCase()}
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                            <button
                                onClick={() => setIsEditingAvatar(!isEditingAvatar)}
                                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center border-2 border-background hover:scale-110 transition-transform"
                            >
                                <Camera size={12} className="text-primary-foreground" />
                            </button>
                        </div>

                        {/* User Info */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold truncate">{nickname || user?.nickname || 'User'}</span>
                                {getTierBadge(profile?.tier)}
                            </div>
                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                <Mail size={12} />
                                <span className="truncate">{user?.email}</span>
                            </div>
                        </div>

                        {/* Status Badge */}
                        <div className="shrink-0">
                            {getStatusBadge(user?.role)}
                        </div>
                    </div>

                    {/* Avatar URL Input - appears when editing */}
                    {isEditingAvatar && (
                        <div className="mt-4 pt-4 border-t border-border/40">
                            <Input
                                value={avatarUrl}
                                onChange={handleAvatarUrlChange}
                                placeholder="Paste avatar URL here..."
                                className="bg-muted/30 border-border/40 h-11"
                                autoFocus
                            />
                        </div>
                    )}
                </div>

                {/* ACCOUNT SECTION */}
                <div className="space-y-3">
                    <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground px-1">Account</h2>

                    <div className="bg-card border border-border/40 rounded-xl overflow-hidden">
                        {/* Nickname Row */}
                        <div className="p-4 space-y-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center">
                                    <Fingerprint size={18} className="text-muted-foreground" />
                                </div>
                                <div className="flex-1">
                                    <div className="text-sm font-medium">Trader Designation</div>
                                    <div className="text-xs text-muted-foreground">Your public display name</div>
                                </div>
                            </div>
                            <div className="relative">
                                <Input
                                    value={nickname}
                                    onChange={handleNicknameChange}
                                    onKeyDown={(e) => e.key === 'Enter' && handleNicknameSave()}
                                    placeholder="Enter nickname"
                                    className="bg-muted/30 border-border/40 h-11 pr-10"
                                />
                                {nickname !== originalNickname && (
                                    <button
                                        onClick={handleNicknameSave}
                                        disabled={isSavingNickname}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center transition-colors disabled:opacity-50"
                                        title="Save nickname"
                                    >
                                        {isSavingNickname ? (
                                            <Loader2 size={14} className="animate-spin" />
                                        ) : (
                                            <Check size={14} />
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="h-px bg-border/40" />

                        {/* Credits Row */}
                        <div className="p-4 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center">
                                <CreditCard size={18} className="text-muted-foreground" />
                            </div>
                            <div className="flex-1">
                                <div className="text-sm font-medium">Credits Balance</div>
                                <div className="text-xs text-muted-foreground">Available for AI research</div>
                            </div>
                            <div className="text-right">
                                <div className="text-lg font-bold tabular-nums">{profile?.credits_balance ?? 0}</div>
                                <div className="text-xs text-muted-foreground">credits</div>
                            </div>
                        </div>

                        <div className="h-px bg-border/40" />

                        {/* Add Credits Button */}
                        <button className="w-full p-4 flex items-center gap-3 hover:bg-muted/30 transition-colors text-left">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                <Plus size={18} className="text-primary" />
                            </div>
                            <div className="flex-1">
                                <div className="text-sm font-medium text-primary">Add Credits</div>
                                <div className="text-xs text-muted-foreground">Purchase more credits</div>
                            </div>
                            <ChevronRight size={16} className="text-muted-foreground/50" />
                        </button>

                        <div className="h-px bg-border/40" />

                        {/* Transaction History Row */}
                        <TransactionHistoryDialog
                            transactions={profile?.credit_transactions}
                            trigger={
                                <button className="w-full p-4 flex items-center gap-3 hover:bg-muted/30 transition-colors text-left">
                                    <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center">
                                        <CreditCard size={18} className="text-muted-foreground" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-sm font-medium">Transaction History</div>
                                        <div className="text-xs text-muted-foreground">View and manage your credits</div>
                                    </div>
                                    <ChevronRight size={16} className="text-muted-foreground/50" />
                                </button>
                            }
                        />
                    </div>
                </div>

                {/* PREFERENCE SECTION */}
                <div className="space-y-3">
                    <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground px-1">{t('preference.heading')}</h2>

                    <div className="bg-card border border-border/40 rounded-xl p-4 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center">
                                <Settings size={18} className="text-muted-foreground" />
                            </div>
                            <div className="flex-1">
                                <div className="text-sm font-medium">{t('preference.theme.title')}</div>
                                <div className="text-xs text-muted-foreground">{t('preference.theme.subtitle')}</div>
                            </div>
                        </div>

                        {/* Theme Switcher */}
                        <div className="flex gap-2 p-1 bg-muted/30 rounded-lg border border-border/40">
                            {[
                                { id: 'light', label: 'Light', icon: Sun },
                                { id: 'gray', label: 'Gray', icon: Cloud },
                                { id: 'dark', label: 'Dark', icon: Moon },
                                { id: 'rgb', label: 'RGB', icon: Palette }
                            ].map((t) => (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => handleThemeChange(t.id)}
                                    className={cn(
                                        "flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-md text-sm font-medium transition-all",
                                        (theme === t.id || (t.id === 'dark' && theme.startsWith('g') && theme !== 'gray'))
                                            ? "bg-background text-foreground shadow-sm border border-border/50"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    <t.icon size={14} />
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Language Switcher */}
                    <div className="bg-card border border-border/40 rounded-xl p-4 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center">
                                <Languages size={18} className="text-muted-foreground" />
                            </div>
                            <div className="flex-1">
                                <div className="text-sm font-medium">{t('preference.language.title')}</div>
                                <div className="text-xs text-muted-foreground">{t('preference.language.subtitle')}</div>
                            </div>
                        </div>

                        <div className="flex gap-2 p-1 bg-muted/30 rounded-lg border border-border/40">
                            {[
                                { id: 'en' as const, label: 'English' },
                                { id: 'sk' as const, label: 'Slovenčina' },
                            ].map((l) => (
                                <button
                                    key={l.id}
                                    type="button"
                                    onClick={() => void setLanguage(l.id)}
                                    className={cn(
                                        "flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-md text-sm font-medium transition-all",
                                        language === l.id
                                            ? "bg-background text-foreground shadow-sm border border-border/50"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    {l.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* NOTIFICATIONS SECTION */}
                <div className="space-y-3">
                    <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground px-1">Notifications</h2>

                    <div className="bg-card border border-border/40 rounded-xl overflow-hidden">
                        {/* Push Notifications Toggle */}
                        {pushSupported && (
                            <div className="p-4 flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center">
                                    <Bell size={18} className="text-muted-foreground" />
                                </div>
                                <div className="flex-1">
                                    <div className="text-sm font-medium">Push Notifications</div>
                                    <div className="text-xs text-muted-foreground">
                                        {pushEnabled && pushSubscribed
                                            ? 'Receive alerts even when the tab is closed'
                                            : 'Enable to get price alerts in your browser'}
                                    </div>
                                </div>
                                <button
                                    onClick={handlePushToggle}
                                    disabled={pushLoading || isSavingNotifPrefs}
                                    className={cn(
                                        "relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50",
                                        pushEnabled ? "bg-emerald-500" : "bg-muted"
                                    )}
                                >
                                    <span
                                        className={cn(
                                            "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200",
                                            pushEnabled && "translate-x-5"
                                        )}
                                    />
                                </button>
                            </div>
                        )}

                        {pushSupported && <div className="h-px bg-border/40" />}

                        {/* Email Notifications Toggle */}
                        <div className="p-4 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center">
                                <Mail size={18} className="text-muted-foreground" />
                            </div>
                            <div className="flex-1">
                                <div className="text-sm font-medium">Email Notifications</div>
                                <div className="text-xs text-muted-foreground">
                                    {emailEnabled
                                        ? 'Receive alerts via email'
                                        : 'Enable to get notifications by email'}
                                </div>
                            </div>
                            <button
                                onClick={handleEmailToggle}
                                disabled={isSavingNotifPrefs}
                                className={cn(
                                    "relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50",
                                    emailEnabled ? "bg-emerald-500" : "bg-muted"
                                )}
                            >
                                <span
                                    className={cn(
                                        "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200",
                                        emailEnabled && "translate-x-5"
                                    )}
                                />
                            </button>
                        </div>
                    </div>
                </div>

                {/* VERSION FOOTER */}
                <div className="pt-8 text-center">
                    <span className="text-xs text-muted-foreground">v{__APP_VERSION__}</span>
                </div>

            </main>
        </div>
    );
}

