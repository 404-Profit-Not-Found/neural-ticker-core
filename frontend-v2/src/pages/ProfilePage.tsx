import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
// Initialises i18next (bundled catalogs) — loaded with this page, not at app start.
import '../i18n';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
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
    Camera,
    Cloud,
    Check,
    Loader2,
    Bell,
    Languages,
    History,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { PageHeader } from '../components/ui/page-header';
import { BackButton } from '../components/ui/back-button';
import { SegmentedControl } from '../components/ui/segmented';
import { formatDate } from '../lib/datetime';
import { apiErrorMessage } from '../lib/api-error';
import { toast } from 'sonner';
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
    const [nicknameError, setNicknameError] = useState<string | null>(null);
    const [avatarError, setAvatarError] = useState<string | null>(null);
    const [avatarUrl, setAvatarUrl] = useState('');
    const [theme, setTheme] = useState('g100');
    const [isEditingAvatar, setIsEditingAvatar] = useState(false);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
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

    // PATCH only the fields that changed. The API validates every field it is
    // sent (and rejects unknown ones), so a half-typed display name must never
    // ride along with a theme change. Throws: each caller shows its own error.
    const patchProfile = useCallback(async (patch: { nickname?: string; avatar_url?: string; theme?: string }) => {
        await api.patch('/users/me', patch);
        await refreshSession();
    }, [refreshSession]);

    // Display name: saved explicitly, with the server's verdict shown inline.
    const handleNicknameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setNickname(e.target.value);
        if (nicknameError) setNicknameError(null);
    };

    const handleNicknameSave = async () => {
        const next = nickname.trim();
        if (next === originalNickname) return;
        if (!NICKNAME_PATTERN.test(next)) {
            setNicknameError(NICKNAME_RULE);
            return;
        }
        setIsSavingNickname(true);
        setNicknameError(null);
        try {
            await patchProfile({ nickname: next });
            setNickname(next);
            setOriginalNickname(next);
        } catch (error) {
            // Reserved (400) or already taken (409): say so, keep what was typed.
            setNicknameError(apiErrorMessage(error, 'Couldn’t save your display name. Try again.'));
        } finally {
            setIsSavingNickname(false);
        }
    };

    // Avatar URL: auto-saved a moment after typing stops.
    const saveAvatar = useCallback(async (url: string) => {
        try {
            await patchProfile({ avatar_url: url });
            setAvatarError(null);
        } catch (error) {
            setAvatarError(apiErrorMessage(error, 'Couldn’t save the avatar. Check the address and try again.'));
        }
    }, [patchProfile]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const debouncedSaveAvatar = useCallback(
        debounce((url: string) => {
            void saveAvatar(url);
        }, 800),
        [saveAvatar]
    );

    const handleAvatarUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newUrl = e.target.value;
        setAvatarUrl(newUrl);
        if (avatarError) setAvatarError(null);
        debouncedSaveAvatar(newUrl);
    };

    // Theme: applied at once (live preview), saved on its own.
    const handleThemeChange = async (newTheme: string) => {
        const previous = theme;
        setTheme(newTheme);
        try {
            await patchProfile({ theme: newTheme });
        } catch (error) {
            setTheme(previous);
            toast.error(apiErrorMessage(error, 'Couldn’t save the theme. Try again.'));
        }
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

    const themeValue: ThemeId = (THEME_IDS as readonly string[]).includes(theme) ? (theme as ThemeId) : 'dark';
    const safeAvatarUrl = (() => {
        const url = avatarUrl || user?.avatar_url;
        if (!url) return null;
        try {
            const parsed = new URL(url);
            // Use the canonical href to avoid odd relative/invalid forms
            return ['http:', 'https:'].includes(parsed.protocol) && parsed.hostname ? parsed.href : null;
        } catch {
            return null;
        }
    })();
    const nicknameDirty = nickname !== originalNickname;

    return (
        <div className="min-h-page bg-background text-foreground font-sans">

            <main className="mx-auto max-w-2xl space-y-6 px-4 pb-10 pt-6 sm:px-6 sm:pt-8">

                <PageHeader
                    back={<BackButton label={t('common.back', 'Back')} />}
                    title={t('settings.title')}
                    description={t('settings.subtitle')}
                />

                {/* IDENTITY */}
                <section className="rounded-lg bg-card p-4">
                    <div className="flex items-center gap-4">
                        <div className="relative shrink-0">
                            <div className="h-16 w-16 overflow-hidden rounded-full bg-muted">
                                {safeAvatarUrl ? (
                                    <img src={safeAvatarUrl} alt="" className="h-full w-full object-cover" />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center text-lg font-medium text-muted-foreground">
                                        {(user?.nickname || user?.email || '??').slice(0, 2).toUpperCase()}
                                    </div>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsEditingAvatar(!isEditingAvatar)}
                                aria-label={t('avatar.edit', 'Change avatar')}
                                aria-expanded={isEditingAvatar}
                                // 44px target around a 28px disc.
                                className="absolute -bottom-3 -right-3 flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
                                    <Camera size={14} />
                                </span>
                            </button>
                        </div>

                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="min-w-0 truncate font-semibold">{nickname || user?.nickname || 'User'}</span>
                                {getTierBadge(profile?.tier)}
                                {getStatusBadge(user?.role)}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                                <Mail size={14} className="shrink-0" aria-hidden />
                                <span className="truncate">{user?.email}</span>
                            </div>
                        </div>
                    </div>

                    {isEditingAvatar && (
                        <div className="mt-5 space-y-1.5">
                            <Label htmlFor="profile-avatar-url" className="text-xs font-medium text-muted-foreground">
                                {t('avatar.url', 'Avatar image URL')}
                            </Label>
                            <Input
                                id="profile-avatar-url"
                                type="url"
                                inputMode="url"
                                value={avatarUrl}
                                onChange={handleAvatarUrlChange}
                                placeholder="https://…"
                                className="h-11"
                                autoFocus
                                aria-invalid={avatarError ? true : undefined}
                                aria-describedby={avatarError ? 'profile-avatar-error' : undefined}
                            />
                            {avatarError && <p id="profile-avatar-error" role="alert" className="text-xs leading-snug text-down">{avatarError}</p>}
                        </div>
                    )}
                </section>

                {/* ACCOUNT */}
                <section className="space-y-2.5" aria-labelledby="profile-account">
                    <h2 id="profile-account" className="label-micro px-1">{t('account.heading', 'Account')}</h2>

                    <div className="space-y-5 rounded-lg bg-card p-4">
                        {/* Display name */}
                        <div className="space-y-2.5">
                            <SettingRow
                                icon={<Fingerprint size={18} />}
                                title={<label htmlFor="profile-nickname">{t('account.nickname.title', 'Display name')}</label>}
                                subtitle={t('account.nickname.subtitle', 'Shown publicly next to your comments and research')}
                            />
                            <div className="flex items-center gap-2">
                                <Input
                                    id="profile-nickname"
                                    value={nickname}
                                    onChange={handleNicknameChange}
                                    onKeyDown={(e) => e.key === 'Enter' && void handleNicknameSave()}
                                    placeholder={t('account.nickname.placeholder', 'Enter a display name')}
                                    maxLength={24}
                                    autoComplete="nickname"
                                    autoCapitalize="none"
                                    spellCheck={false}
                                    aria-invalid={nicknameError ? true : undefined}
                                    aria-describedby={nicknameError ? 'profile-nickname-error' : 'profile-nickname-hint'}
                                    className="h-11"
                                />
                                {nicknameDirty && (
                                    <Button onClick={() => void handleNicknameSave()} disabled={isSavingNickname || nickname.trim().length === 0} className="h-11 shrink-0 gap-2">
                                        {isSavingNickname ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                        {t('common.save', 'Save')}
                                    </Button>
                                )}
                            </div>
                            {nicknameError ? (
                                <p id="profile-nickname-error" role="alert" className="text-xs leading-snug text-down">{nicknameError}</p>
                            ) : (
                                <p id="profile-nickname-hint" className="text-xs leading-snug text-muted-foreground">{t('account.nickname.rule', NICKNAME_RULE)}</p>
                            )}
                        </div>

                        {/* Credits: the balance and when it refills, read together */}
                        <SettingRow
                            icon={<CreditCard size={18} />}
                            title={t('account.credits.title', 'Credits balance')}
                            subtitle={
                                profile?.credits_reset_at
                                    ? t('account.credits.refill', { defaultValue: 'Refills on {{date}}', date: formatDate(profile.credits_reset_at) })
                                    : t('account.credits.subtitle', 'Available for AI research')
                            }
                            trailing={
                                <div className="text-right">
                                    <div className="num text-lg font-bold leading-tight">{profile?.credits_balance ?? 0}</div>
                                    <div className="text-xs text-muted-foreground">{t('account.credits.unit', 'credits')}</div>
                                </div>
                            }
                        />

                        {/* Credit history */}
                        <button
                            type="button"
                            onClick={() => setIsHistoryOpen(true)}
                            className="-mx-2 flex w-[calc(100%+1rem)] items-center rounded-md px-2 py-1 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <SettingRow
                                icon={<History size={18} />}
                                title={t('account.history.title', 'Credit history')}
                                subtitle={t('account.history.subtitle', 'What you earned and spent')}
                                trailing={<ChevronRight size={18} className="text-muted-foreground" aria-hidden />}
                            />
                        </button>
                    </div>
                </section>

                {/* PREFERENCES */}
                <section className="space-y-2.5" aria-labelledby="profile-preferences">
                    <h2 id="profile-preferences" className="label-micro px-1">{t('preference.heading')}</h2>

                    <div className="space-y-5 rounded-lg bg-card p-4">
                        <div className="space-y-3">
                            <SettingRow
                                icon={<Settings size={18} />}
                                title={t('preference.theme.title')}
                                subtitle={t('preference.theme.subtitle')}
                            />
                            <SegmentedControl
                                label={t('preference.theme.title')}
                                fill
                                className="max-lg:[&>button]:min-h-11"
                                value={themeValue}
                                onChange={(next) => void handleThemeChange(next)}
                                options={THEME_OPTIONS.map((option) => ({
                                    value: option.id,
                                    label: (
                                        <>
                                            {/* Four labels plus icons do not fit a 360px phone. */}
                                            <option.icon size={14} className="hidden min-[420px]:block" aria-hidden />
                                            {t(`preference.theme.${option.id}`, option.label)}
                                        </>
                                    ),
                                }))}
                            />
                        </div>

                        <div className="space-y-3">
                            <SettingRow
                                icon={<Languages size={18} />}
                                title={t('preference.language.title')}
                                subtitle={t('preference.language.subtitle')}
                            />
                            <SegmentedControl
                                label={t('preference.language.title')}
                                fill
                                className="max-lg:[&>button]:min-h-11"
                                value={language}
                                onChange={(next) => void setLanguage(next)}
                                options={[
                                    { value: 'en', label: 'English' },
                                    { value: 'sk', label: 'Slovenčina' },
                                ]}
                            />
                        </div>
                    </div>
                </section>

                {/* NOTIFICATIONS */}
                <section className="space-y-2.5" aria-labelledby="profile-notifications">
                    <h2 id="profile-notifications" className="label-micro px-1">{t('notifications.heading', 'Notifications')}</h2>

                    <div className="space-y-3 rounded-lg bg-card p-4">
                        {pushSupported && (
                            <SettingRow
                                icon={<Bell size={18} />}
                                title={<span id="profile-push-label">{t('notifications.push.title', 'Push notifications')}</span>}
                                subtitle={
                                    pushEnabled && pushSubscribed
                                        ? t('notifications.push.on', 'Price alerts reach this browser even when the tab is closed')
                                        : t('notifications.push.off', 'Get price alerts in this browser')
                                }
                                trailing={
                                    <Switch
                                        checked={pushEnabled}
                                        onChange={handlePushToggle}
                                        disabled={pushLoading || isSavingNotifPrefs}
                                        labelledBy="profile-push-label"
                                    />
                                }
                            />
                        )}

                        <SettingRow
                            icon={<Mail size={18} />}
                            title={<span id="profile-email-label">{t('notifications.email.title', 'Email notifications')}</span>}
                            subtitle={
                                emailEnabled
                                    ? t('notifications.email.on', 'Alerts are also sent to your email')
                                    : t('notifications.email.off', 'Also send alerts to your email')
                            }
                            trailing={
                                <Switch
                                    checked={emailEnabled}
                                    onChange={handleEmailToggle}
                                    disabled={isSavingNotifPrefs}
                                    labelledBy="profile-email-label"
                                />
                            }
                        />
                    </div>
                </section>

                <p className="num pt-2 text-center text-xs text-muted-foreground">v{__APP_VERSION__}</p>

            </main>

            <TransactionHistoryDialog
                transactions={profile?.credit_transactions}
                open={isHistoryOpen}
                onOpenChange={setIsHistoryOpen}
            />
        </div>
    );
}

// The server's rule for display names (it is the authority; this mirrors it
// so an obviously invalid name is caught without a round trip).
const NICKNAME_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{1,22})[A-Za-z0-9]$/;
const NICKNAME_RULE = '3–24 characters: letters, digits, dots, underscores or hyphens — starting and ending with a letter or digit.';

const THEME_IDS = ['light', 'gray', 'dark', 'rgb'] as const;
type ThemeId = (typeof THEME_IDS)[number];
const THEME_OPTIONS: ReadonlyArray<{ id: ThemeId; label: string; icon: typeof Sun }> = [
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'gray', label: 'Gray', icon: Cloud },
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'rgb', label: 'RGB', icon: Palette },
];

/** Icon tile · title + one line of context · optional trailing control. */
function SettingRow({ icon, title, subtitle, trailing }: { icon: ReactNode; title: ReactNode; subtitle?: ReactNode; trailing?: ReactNode }) {
    return (
        <div className="flex w-full min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground" aria-hidden>
                {icon}
            </div>
            <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">{title}</div>
                {subtitle && <div className="text-xs leading-snug text-muted-foreground">{subtitle}</div>}
            </div>
            {trailing && <div className="shrink-0">{trailing}</div>}
        </div>
    );
}

/** A real switch: role, state and name for assistive tech; 44px touch target. */
function Switch({ checked, onChange, disabled, labelledBy }: { checked: boolean; onChange: () => void; disabled?: boolean; labelledBy: string }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-labelledby={labelledBy}
            onClick={onChange}
            disabled={disabled}
            className="group -mr-1.5 flex h-11 w-14 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
            <span className={cn('relative h-6 w-11 rounded-full transition-colors duration-150', checked ? 'bg-up' : 'bg-raised')}>
                <span
                    className={cn(
                        'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-150',
                        checked && 'translate-x-5',
                    )}
                />
            </span>
        </button>
    );
}
