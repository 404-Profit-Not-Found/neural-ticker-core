import { useEffect, useState, useCallback, useMemo } from 'react';
import { AdminService } from '../services/adminService';
import { useAuth } from '../context/AuthContext';
import {
    Plus,
    Search,
    ChevronLeft,
    ArrowUpDown,
    Crown,
    Sparkles,
    Gift,
    Ban,
    CheckCircle,
    LayoutGrid,
    List,
} from 'lucide-react';
import { TickerRequestCard } from '../components/admin/TickerRequestCard';
import { UserAdminCard, type AdminUser } from '../components/admin/UserAdminCard';
import { ShadowBanManager } from '../components/admin/ShadowBanManager';
import { LogoManager } from '../components/admin/LogoManager';
import { useNavigate } from 'react-router-dom';
import { TickerRequestRow } from '../components/admin/TickerRequestRow';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { useConfirm, usePrompt } from '../components/ui/confirm';
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import {
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '../components/ui/table';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '../components/ui/popover';
import { AdminStatsBar, type AdminFilterKey } from '../components/admin/AdminStatsBar';
import { UserDetailDialog } from '../components/admin/UserDetailDialog';
import { UserTierBadge } from '../components/ui/user-tier-badge';
import { RequestStatsBar, type RequestFilterKey } from '../components/admin/RequestStatsBar';
import { PageHeader } from '../components/ui/page-header';
import { BackButton } from '../components/ui/back-button';
import { SegmentedControl } from '../components/ui/segmented';
import { EmptyState } from '../components/ui/empty-state';
import { Label } from '../components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { useCompactLayout } from '../hooks/useMediaQuery';
import { formatDateTime, formatTimeAgo } from '../lib/datetime';

/**
 * The one account allowed to revoke another admin's access.
 * NOTE(owner): this is a client-side check on a hard-coded address; the real
 * guard has to be a server-side permission. Kept in one named place until then.
 */
const SUPERADMIN_EMAIL = 'branislavlang@gmail.com';

type AdminTab = 'users' | 'requests' | 'shadowban' | 'logo';
const ADMIN_TABS: ReadonlyArray<{ id: AdminTab; label: string; description: string }> = [
    { id: 'users', label: 'Users', description: 'Verify and manage users, tiers, and access control.' },
    { id: 'requests', label: 'Ticker Requests', description: 'Review and approve new asset requests from the community.' },
    { id: 'shadowban', label: 'Shadow Ban', description: 'Hide bankrupt or problematic tickers from suggestions.' },
    { id: 'logo', label: 'Logos', description: 'Assign logos to tickers that are missing one.' },
];

type SortConfig = {
    key: string;
    direction: 'asc' | 'desc';
};

// Get user initials for avatar
function getInitials(email: string, nickname?: string): string {
    if (nickname) {
        const parts = nickname.split(' ');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return nickname.slice(0, 2).toUpperCase();
    }
    return email.slice(0, 2).toUpperCase();
}

export function AdminConsole() {
    const { user: currentUser } = useAuth();
    const navigate = useNavigate();
    const confirm = useConfirm();
    const promptText = usePrompt();

    // Tab State
    const [activeTab, setActiveTab] = useState<AdminTab>('users');
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

    // Users Tab State
    const [identities, setIdentities] = useState<AdminUser[]>([]);
    const [newEmail, setNewEmail] = useState('');
    const [loading, setLoading] = useState(true);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_error, setError] = useState<string | null>(null);
    const [isInviteOpen, setIsInviteOpen] = useState(false);
    const [inviteError, setInviteError] = useState<string | null>(null);

    // Dialog & Detail State
    const [isUserDetailOpen, setIsUserDetailOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

    // Requests Tab State
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [requests, setRequests] = useState<any[]>([]);

    // Table State
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<AdminFilterKey>('ALL');
    const [requestFilter, setRequestFilter] = useState<RequestFilterKey>('ALL');
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'created_at', direction: 'desc' });
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const isSuperAdmin = currentUser?.email === SUPERADMIN_EMAIL;

    // Below `lg` a users/requests table cannot fit: cards are the only view.
    const compact = useCompactLayout();
    const view: 'list' | 'grid' = compact ? 'grid' : viewMode;

    // Redirect non-admin users immediately
    useEffect(() => {
        if (currentUser && currentUser.role !== 'admin') {
            navigate('/access-denied', { replace: true });
        }
    }, [currentUser, navigate]);

    const loadData = useCallback(async () => {
        // Don't load if not admin
        if (!currentUser || currentUser.role !== 'admin') {
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);
        try {
            if (activeTab === 'users') {
                const data = await AdminService.getIdentities();
                setIdentities(data);
            } else if (activeTab === 'requests') {
                const data = await AdminService.getTickerRequests();
                setRequests(Array.isArray(data) ? data : []);
            }
        } catch (err: unknown) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const errorResponse = (err as any).response;
            if (errorResponse?.status === 403 || errorResponse?.status === 401) {
                setError('Access denied. Admin privileges required.');
                navigate('/access-denied', { replace: true });
            } else {
                const msg = errorResponse?.data?.message || 'Failed to load data';
                setError(msg);
            }
        } finally {
            setLoading(false);
        }
    }, [currentUser, navigate, activeTab]);

    useEffect(() => {
        if (currentUser && currentUser.role === 'admin' && (activeTab === 'users' || activeTab === 'requests')) {
            loadData();
        }
    }, [currentUser, activeTab, loadData]);

    const handleAddEmail = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!newEmail) return;
        try {
            await AdminService.addToUserlist(newEmail);
            setNewEmail('');
            setIsInviteOpen(false);
            toast.success('User added to waitlist');
            loadData();
        } catch (err: unknown) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const msg = (err as any).response?.data?.message || 'Failed to add user';
            toast.error(msg);
        }
    };

    const handleApprove = async (email: string) => {
        try {
            const user = identities.find(u => u.email === email);
            if (!user || !user.id) throw new Error('User not found or missing ID');

            await AdminService.approveUser(user.id);
            toast.success(`Approved ${email}`);

            // Refresh data explicitly or optimistically update
            setIdentities(prev => prev.map(u => u.email === email ? { ...u, status: 'ACTIVE' } : u));
            if (selectedUser?.email === email) {
                setSelectedUser(prev => prev ? { ...prev, status: 'ACTIVE' } : null);
            }
        } catch (err: unknown) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const msg = (err as any).response?.data?.message || (err as any).message || 'Failed to approve user';
            toast.error(msg);
        }
    };

    const handleRevoke = async (user: AdminUser) => {
        if (!user.email) return;
        if (user.role === 'admin' && !isSuperAdmin) {
            toast.error("Only Superadmin can revoke Admin access.");
            return;
        }

        const confirmed = await confirm({
            title: `Revoke access for ${user.email}?`,
            description: 'They will no longer be able to sign in. Their data is kept.',
            confirmLabel: 'Revoke access',
            destructive: true,
        });
        if (!confirmed) return;
        try {
            await AdminService.revokeAccess(user.email);
            toast.success(`Revoked access for ${user.email}`);
            // Refresh data
            setIdentities(prev => prev.map(u => u.id === user.id ? { ...u, status: 'BANNED' } : u));
            if (selectedUser?.id === user.id) {
                setSelectedUser(prev => prev ? { ...prev, status: 'BANNED' } : null);
            }
        } catch (err: unknown) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const msg = (err as any).response?.data?.message || 'Failed to revoke access';
            toast.error(msg);
        }
    };

    const handleUnban = async (user: AdminUser) => {
        if (!user.email) return;
        const confirmed = await confirm({
            title: `Unban ${user.email}?`,
            description: 'Their access to the app will be restored.',
            confirmLabel: 'Unban',
        });
        if (!confirmed) return;
        try {
            // Re-add to userlist to restore access
            await AdminService.addToUserlist(user.email);
            // If they have an ID, also ensure they are approved/active in users table if needed
            if (user.id) {
                try {
                    await AdminService.approveUser(user.id);
                } catch (e) {
                    console.log("User might already be approved", e);
                }
            }

            toast.success(`Unbanned ${user.email}`);
            // Refresh data
            setIdentities(prev => prev.map(u => u.id === user.id ? { ...u, status: 'ACTIVE' } : u));
            if (selectedUser?.id === user.id) {
                setSelectedUser(prev => prev ? { ...prev, status: 'ACTIVE' } : null);
            }
        } catch (err: unknown) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const msg = (err as any).response?.data?.message || 'Failed to unban user';
            toast.error(msg);
        }
    };

    const handleUpdateTier = async (userId: string, tier: 'free' | 'pro' | 'whale') => {
        try {
            await AdminService.updateTier(userId, tier);
            setIdentities(prev => prev.map(u => u.id === userId ? { ...u, tier } : u));
            if (selectedUser?.id === userId) {
                setSelectedUser(prev => prev ? { ...prev, tier } : null);
            }
            toast.success(`Updated tier to ${tier}`);
        } catch (err: unknown) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const msg = (err as any).response?.data?.message || 'Failed to update tier';
            toast.error(msg);
        }
    };

    const handleUpdateRole = async (userId: string, role: string) => {
        // A change of privileges is never one tap away.
        const who = identities.find((u) => u.id === userId)?.email ?? 'this user';
        const makingAdmin = role === 'admin';
        const confirmed = await confirm({
            title: makingAdmin ? `Make ${who} an admin?` : `Remove the admin role from ${who}?`,
            description: makingAdmin
                ? 'Admins can manage users, credits, tickers and comments.'
                : 'They keep their account and lose access to the admin console.',
            confirmLabel: makingAdmin ? 'Make admin' : 'Remove admin role',
            destructive: !makingAdmin,
        });
        if (!confirmed) return;
        try {
            await AdminService.updateRole(userId, role);
            setIdentities(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
            if (selectedUser?.id === userId) {
                setSelectedUser(prev => prev ? { ...prev, role } : null);
            }
            toast.success(`Updated role to ${role}`);
        } catch (err: unknown) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const msg = (err as any).response?.data?.message || 'Failed to update role';
            toast.error(msg);
        }
    };

    const openUserDetail = (user: AdminUser) => {
        setSelectedUser(user);
        setIsUserDetailOpen(true);
    };

    // Gift Credits Handler for Dialog
    const handleGiftCredits = async (user: AdminUser) => {
        const amountStr = await promptText({
            title: `Gift credits to ${user.email ?? 'this user'}`,
            label: 'Credits',
            defaultValue: '1',
            inputMode: 'numeric',
            maxLength: 6,
            confirmLabel: 'Send credits',
            validate: (v) =>
                /^[1-9]\d*$/.test(v) ? null : 'Enter a whole number greater than 0.',
        });
        if (!amountStr) return;
        const amount = parseInt(amountStr, 10);

        try {
            if (!user.id) throw new Error('User ID is missing');
            const updated = await AdminService.giftCredits(user.id, amount, "Admin Gift");
            // The list shows the balance, so it has to move with the gift.
            const balance = updated?.credits_balance ?? (user.credits_balance ?? 0) + amount;
            setIdentities(prev => prev.map(u => u.id === user.id ? { ...u, credits_balance: balance } : u));
            setSelectedUser(prev => prev && prev.id === user.id ? { ...prev, credits_balance: balance } : prev);
            toast.success(`Sent ${amount} credits to ${user.email}`);
        } catch (err: unknown) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const msg = (err as any).response?.data?.message || 'Failed to gift credits';
            toast.error(msg);
        }
    };

    const handleResetTutorial = async (userId: string) => {
        const email = identities.find((u) => u.id === userId)?.email;
        const confirmed = await confirm({
            title: `Reset tutorial state for ${email ?? 'this user'}?`,
            description: 'This will wipe their watchlist, portfolio, and digest.',
            confirmLabel: 'Reset tutorial',
            destructive: true,
        });
        if (!confirmed) return;
        try {
            await AdminService.resetTutorial(userId);
            toast.success('User tutorial state reset successfully');
            setIsUserDetailOpen(false);
        } catch (err: unknown) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const msg = (err as any).response?.data?.message || 'Failed to reset tutorial state';
            toast.error(msg);
        }
    };

    // Requests Actions
    const handleApproveRequest = async (id: string, symbol: string) => {
        try {
            await AdminService.approveTickerRequest(id);
            toast.success(`Approved ${symbol}`);
            loadData();
        } catch (err: unknown) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const msg = (err as any).response?.data?.message || 'Failed to approve request';
            toast.error(msg);
        }
    };

    const handleRejectRequest = async (id: string, symbol: string) => {
        const confirmed = await confirm({
            title: `Reject request for ${symbol}?`,
            confirmLabel: 'Reject request',
            destructive: true,
        });
        if (!confirmed) return;
        try {
            await AdminService.rejectTickerRequest(id);
            toast.success(`Rejected ${symbol}`);
            loadData();
        } catch (err: unknown) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const msg = (err as any).response?.data?.message || 'Failed to reject request';
            toast.error(msg);
        }
    };
    // Sorting
    const handleSort = (key: string) => {
        setSortConfig((current) => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
        }));
    };

    // Create processed data
    const processedData = useMemo(() => {
        let filtered = identities;

        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            filtered = filtered.filter((item) =>
                item.email?.toLowerCase().includes(lower) ||
                item.nickname?.toLowerCase().includes(lower)
            );
        }

        if (statusFilter !== 'ALL') {
            if (statusFilter === 'PRO') {
                filtered = filtered.filter(u => u.tier === 'pro' && u.status !== 'BANNED');
            } else if (statusFilter === 'WHALE') {
                filtered = filtered.filter(u => u.tier === 'whale' && u.status !== 'BANNED');
            } else {
                filtered = filtered.filter((item) => item.status === statusFilter);
            }
        } else if (!searchTerm) {
            // Default view: banned users stay out of the way. A search is a
            // question about one person, so it finds them whatever their status.
            filtered = filtered.filter(u => u.status !== 'BANNED');
        }

        return [...filtered].sort((a, b) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const aVal = (a as any)[sortConfig.key];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const bVal = (b as any)[sortConfig.key];

            // No value (never signed in, no balance yet) goes last either way,
            // instead of landing wherever the comparison happens to leave it.
            const aMissing = aVal === null || aVal === undefined || aVal === '';
            const bMissing = bVal === null || bVal === undefined || bVal === '';
            if (aMissing || bMissing) return aMissing === bMissing ? 0 : aMissing ? 1 : -1;

            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [identities, searchTerm, statusFilter, sortConfig]);

    // Processed Requests with Filter
    const processedRequests = useMemo(() => {
        let filtered = requests;
        if (requestFilter !== 'ALL') {
            filtered = filtered.filter(r => r.status?.toUpperCase() === requestFilter);
        }
        return filtered;
    }, [requests, requestFilter]);

    // Stats calculations
    const stats = useMemo(() => {
        const total = identities.length;
        const active = identities.filter(u => u.status === 'ACTIVE').length;
        const waitlist = identities.filter(u => u.status === 'WAITLIST').length;
        const banned = identities.filter(u => u.status === 'BANNED').length;
        const pro = identities.filter(u => u.tier === 'pro').length;
        const whale = identities.filter(u => u.tier === 'whale').length;
        return { total, active, waitlist, banned, pro, whale };
    }, [identities]);

    const requestStats = useMemo(() => {
        const total = requests.length;
        const pending = requests.filter(r => r.status?.toUpperCase() === 'PENDING').length;
        const approved = requests.filter(r => r.status?.toUpperCase() === 'APPROVED').length;
        const rejected = requests.filter(r => r.status?.toUpperCase() === 'REJECTED').length;
        return { total, pending, approved, rejected };
    }, [requests]);

    // Pagination
    const totalPages = Math.ceil(processedData.length / itemsPerPage);
    const paginatedData = processedData.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const renderSortIcon = (key: string) => {
        if (sortConfig.key !== key) return <ArrowUpDown size={14} className="ml-1 text-muted-foreground opacity-50" />;
        return sortConfig.direction === 'asc' ? (
            <ChevronLeft size={14} className="ml-1 rotate-90 text-primary" />
        ) : (
            <ChevronLeft size={14} className="ml-1 -rotate-90 text-primary" />
        );
    };

    // Get status badge variant - using standard variants
    const getStatusBadge = (status: string, role?: string) => {
        const badges = [];
        const isAdmin = role === 'admin' || status === 'ADMIN';

        if (isAdmin) {
            badges.push(<UserTierBadge key="admin" tier="admin" />);
        }

        if (status !== 'ADMIN') {
            switch (status) {
                case 'ACTIVE':
                    badges.push(<Badge key="active" variant="outline" className="text-up bg-emerald-500/5">ACTIVE</Badge>);
                    break;
                case 'WAITLIST':
                    badges.push(<Badge key="waitlist" variant="secondary" className="text-amber-500">WAITLIST</Badge>);
                    break;
                case 'INVITED':
                    badges.push(<Badge key="invited" variant="outline" className="text-blue-500 bg-blue-500/5">INVITED</Badge>);
                    break;
                case 'BANNED':
                    badges.push(<Badge key="banned" variant="destructive">BANNED</Badge>);
                    break;
                default:
                    if (status) badges.push(<Badge key="other" variant="outline">{status}</Badge>);
            }
        }

        return <div className="flex flex-wrap gap-1">{badges}</div>;
    };

    // Get tier badge - matches mobile card styling (UserAdminCard)
    const getTierBadge = (tier: string | undefined) => <UserTierBadge tier={tier} />;

    // Loading skeleton - view-aware to avoid hydration errors
    const LoadingSkeleton = ({ mode = view }: { mode?: 'list' | 'grid' }) => {
        const items = [...Array(mode === 'list' ? 5 : 6)];

        if (mode === 'list') {
            // Wrap TableRow elements in proper table structure to avoid hydration errors
            return (
                <div className="overflow-x-auto">
                    <table className="w-full caption-bottom text-sm border-separate border-spacing-y-2">
                        <TableBody>
                            {items.map((_, i) => (
                                <TableRow key={`skeleton-row-${i}`} className="bg-card rounded-lg">
                                    <TableCell className="pl-6 rounded-l-lg">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-muted animate-pulse shrink-0" />
                                            <div className="space-y-2">
                                                <div className="h-4 w-40 bg-muted animate-pulse rounded" />
                                                <div className="h-3 w-32 bg-muted animate-pulse rounded" />
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell><div className="h-5 w-16 bg-muted animate-pulse rounded-full" /></TableCell>
                                    <TableCell><div className="h-4 w-12 bg-muted animate-pulse rounded" /></TableCell>
                                    <TableCell><div className="h-4 w-24 bg-muted animate-pulse rounded" /></TableCell>
                                    <TableCell className="rounded-r-lg"><div className="h-4 w-8 bg-muted animate-pulse rounded ml-auto" /></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </table>
                </div>
            );
        }

        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
                {items.map((_, i) => (
                    <div key={`skeleton-card-${i}`} className="h-32 bg-card rounded-xl animate-pulse" />
                ))}
            </div>
        );
    };

    return (
        <div className="min-h-page bg-background relative flex flex-col">

            {/* Main Content Area */}
            <main className="flex-1">
                <div className="container mx-auto max-w-7xl space-y-5 px-4 pb-10 pt-6 sm:px-6 sm:pt-8">
                    {/* One fixed title; the tab says where you are. */}
                    <PageHeader
                        back={<BackButton />}
                        title="Admin"
                        description={ADMIN_TABS.find((tab) => tab.id === activeTab)?.description}
                    />

                    <Tabs
                        value={activeTab}
                        onValueChange={(next) => {
                            setActiveTab(next as AdminTab);
                            setCurrentPage(1);
                        }}
                    >
                        <TabsList aria-label="Admin sections">
                            {ADMIN_TABS.map((tab) => (
                                <TabsTrigger key={tab.id} value={tab.id}>{tab.label}</TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>

                    <div>
                        {/* Shadow Ban Tab */}
                        {activeTab === 'shadowban' && <ShadowBanManager />}
                        {/* Logo Manager Tab */}
                        {activeTab === 'logo' && <LogoManager />}

                        {/* Requests Tab */}
                        {
                            activeTab === 'requests' && (
                                <div className="space-y-6 animate-in fade-in duration-300">
                                    <RequestStatsBar
                                        stats={requestStats}
                                        selectedFilter={requestFilter}
                                        onFilterChange={setRequestFilter}
                                    />
                                    {!compact && (
                                        <div className="flex justify-end">
                                            <SegmentedControl
                                                    label="View"
                                                    size="sm"
                                                    value={viewMode}
                                                    onChange={setViewMode}
                                                    options={[
                                                        { value: 'list', label: <List size={14} aria-hidden />, ariaLabel: 'Table' },
                                                        { value: 'grid', label: <LayoutGrid size={14} aria-hidden />, ariaLabel: 'Cards' },
                                                    ]}
                                                />
                                        </div>
                                    )}

                                    {/* Requests Grid/List Logic same as before... */}
                                    {view === 'list' ? (
                                        <div className="overflow-x-auto">
                                            <table className="w-full caption-bottom text-sm border-separate border-spacing-y-2">
                                                <TableHeader>
                                                    <TableRow className="bg-transparent hover:bg-transparent">
                                                        <TableHead className="font-medium text-muted-foreground pl-6">Symbol</TableHead>
                                                        <TableHead className="font-medium text-muted-foreground">Status</TableHead>
                                                        <TableHead className="font-medium text-muted-foreground">Requested By</TableHead>
                                                        <TableHead className="font-medium text-muted-foreground">Date</TableHead>
                                                        <TableHead className="text-right font-medium text-muted-foreground pr-6">Actions</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody className="space-y-2">
                                                    {loading ? (
                                                        <TableRow><TableCell colSpan={5} className="h-24 text-center"><LoadingSkeleton /></TableCell></TableRow>
                                                    ) : processedRequests.length === 0 ? (
                                                        <TableRow className="bg-card hover:bg-card rounded-lg">
                                                            <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">{requestFilter === 'ALL' ? 'No ticker requests yet' : `No ${requestFilter.toLowerCase()} requests`}</TableCell>
                                                        </TableRow>
                                                    ) : (
                                                        processedRequests.map((req) => (
                                                            <TickerRequestRow
                                                                key={req.id}
                                                                request={req}
                                                                onApprove={handleApproveRequest}
                                                                onReject={handleRejectRequest}
                                                            />
                                                        ))
                                                    )}
                                                </TableBody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="w-full">
                                            {loading ? (
                                                <LoadingSkeleton mode="grid" />
                                            ) : processedRequests.length === 0 ? (
                                                <div className="h-32 flex items-center justify-center text-muted-foreground bg-muted/20 rounded-lg col-span-full">{requestFilter === 'ALL' ? 'No ticker requests yet' : `No ${requestFilter.toLowerCase()} requests`}</div>
                                            ) : (
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                    {processedRequests.map((req) => (
                                                        <TickerRequestCard
                                                            key={req.id}
                                                            request={req}
                                                            onApprove={handleApproveRequest}
                                                            onReject={handleRejectRequest}
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )
                        }

                        {/* Users Tab (Refactored) */}
                        {
                            activeTab === 'users' && (
                                <div className="space-y-6">
                                    {/* New Admin Stats Bar */}
                                    <AdminStatsBar
                                        stats={stats}
                                        selectedFilter={statusFilter}
                                        onFilterChange={setStatusFilter}
                                    />

                                    {/* User Management Section */}
                                    <div className="space-y-4">

                                        {/* Search & Actions Row */}
                                        <div className="flex w-full flex-col items-center gap-3 sm:flex-row">
                                            <div className="relative flex-1 w-full">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                <Input
                                                    placeholder="Search by email or nickname..."
                                                    className="h-11 pl-10 lg:h-9"
                                                    aria-label="Search users"
                                                    value={searchTerm}
                                                    onChange={(e) => setSearchTerm(e.target.value)}
                                                />
                                            </div>

                                            <Button
                                                className="h-11 w-full shrink-0 gap-2 lg:h-9 sm:w-auto"
                                                onClick={() => setIsInviteOpen(true)}
                                            >
                                                <Plus size={16} />
                                                Add User
                                            </Button>
                                            {!compact && (
                                                <SegmentedControl
                                                    label="View"
                                                    size="sm"
                                                    value={viewMode}
                                                    onChange={setViewMode}
                                                    options={[
                                                        { value: 'list', label: <List size={14} aria-hidden />, ariaLabel: 'Table' },
                                                        { value: 'grid', label: <LayoutGrid size={14} aria-hidden />, ariaLabel: 'Cards' },
                                                    ]}
                                                />
                                            )}

                                            <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
                                                <form
                                                    noValidate
                                                    onSubmit={(e) => {
                                                        e.preventDefault();
                                                        if (!/^\S+@\S+\.\S+$/.test(newEmail.trim())) {
                                                            setInviteError('Enter a valid email address.');
                                                            return;
                                                        }
                                                        void handleAddEmail();
                                                    }}
                                                >
                                                    <DialogHeader>
                                                        <DialogTitle>Add a user</DialogTitle>
                                                        <DialogDescription>
                                                            The address is added to the waitlist so the person can sign in.
                                                        </DialogDescription>
                                                    </DialogHeader>
                                                    <div className="space-y-2 pb-5">
                                                        <Label htmlFor="admin-invite-email">Email address</Label>
                                                        <Input
                                                            id="admin-invite-email"
                                                            type="email"
                                                            inputMode="email"
                                                            autoComplete="off"
                                                            autoFocus
                                                            value={newEmail}
                                                            onChange={(e) => {
                                                                setNewEmail(e.target.value);
                                                                if (inviteError) setInviteError(null);
                                                            }}
                                                            placeholder="user@example.com"
                                                            aria-invalid={inviteError ? true : undefined}
                                                            aria-describedby={inviteError ? 'admin-invite-error' : undefined}
                                                        />
                                                        {inviteError && (
                                                            <p id="admin-invite-error" role="alert" className="text-xs text-down">{inviteError}</p>
                                                        )}
                                                    </div>
                                                    <DialogFooter>
                                                        <Button type="button" variant="ghost" onClick={() => setIsInviteOpen(false)}>Cancel</Button>
                                                        <Button type="submit">Add user</Button>
                                                    </DialogFooter>
                                                </form>
                                            </Dialog>
                                        </div>

                                        {/* Consolidated List/Grid View */}
                                        <div className="w-full">
                                            {loading ? (
                                                <LoadingSkeleton mode={view} />
                                            ) : (
                                                <>
                                                    {paginatedData.length === 0 ? (
                                                        <EmptyState
                                                            className="rounded-lg bg-card py-14"
                                                            title="No users match"
                                                            description="Try a different search, or clear the filter above."
                                                            action={searchTerm || statusFilter !== 'ALL' ? <Button variant="outline" onClick={() => { setSearchTerm(''); setStatusFilter('ALL'); }}>Show all users</Button> : undefined}
                                                        />
                                                    ) : view === 'list' ? (
                                                        <div className="overflow-x-auto">
                                                            <table className="w-full caption-bottom text-sm border-separate border-spacing-y-2">
                                                                <TableHeader>
                                                                    <TableRow className="bg-transparent hover:bg-transparent">
                                                                        <TableHead className="w-[260px] cursor-pointer pl-6 font-medium text-muted-foreground xl:w-[350px]" onClick={() => handleSort('email')}>
                                                                            <div className="flex items-center gap-1">User {renderSortIcon('email')}</div>
                                                                        </TableHead>
                                                                        <TableHead className="cursor-pointer text-muted-foreground font-medium" onClick={() => handleSort('status')}>
                                                                            <div className="flex items-center gap-1">Status {renderSortIcon('status')}</div>
                                                                        </TableHead>
                                                                        <TableHead className="cursor-pointer text-muted-foreground font-medium" onClick={() => handleSort('credits_balance')}>
                                                                            <div className="flex items-center gap-1">Credits {renderSortIcon('credits_balance')}</div>
                                                                        </TableHead>
                                                                        <TableHead className="cursor-pointer text-muted-foreground font-medium" onClick={() => handleSort('created_at')}>
                                                                            <div className="flex items-center gap-1">Joined {renderSortIcon('created_at')}</div>
                                                                        </TableHead>
                                                                        <TableHead className="cursor-pointer text-muted-foreground font-medium" onClick={() => handleSort('last_login')}>
                                                                            <div className="flex items-center gap-1">Last login {renderSortIcon('last_login')}</div>
                                                                        </TableHead>
                                                                        <TableHead className="text-right text-muted-foreground font-medium pr-6">Actions</TableHead>
                                                                    </TableRow>
                                                                </TableHeader>
                                                                <TableBody className="space-y-2">
                                                                    {paginatedData.map((user, index) => (
                                                                        <TableRow
                                                                            key={user.id || user.email || `user-${index}`}
                                                                            className="bg-card hover:bg-card/80 transition-colors rounded-lg group text-xs sm:text-sm cursor-pointer"
                                                                            onClick={() => openUserDetail(user)}
                                                                        >
                                                                            <TableCell className="pl-6 font-medium rounded-l-lg py-3">
                                                                                <div className="flex items-center gap-3">
                                                                                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground overflow-hidden shrink-0">
                                                                                        {user.avatar_url ? (
                                                                                            <img src={user.avatar_url} alt="User" className="w-full h-full object-cover" />
                                                                                        ) : (
                                                                                            getInitials(user.email, user.nickname)
                                                                                        )}
                                                                                    </div>
                                                                                    <div className="flex flex-col">
                                                                                        <div className="flex items-center gap-2">
                                                                                            <span className="font-bold text-foreground truncate max-w-[150px]">{user.nickname || user.email?.split('@')[0]}</span>
                                                                                            {getTierBadge(user.tier)}
                                                                                        </div>
                                                                                        <span className="text-xs text-muted-foreground font-normal truncate max-w-[200px]">{user.email}</span>
                                                                                    </div>
                                                                                </div>
                                                                            </TableCell>
                                                                            <TableCell className="py-3">
                                                                                {getStatusBadge(user.status, user.role)}
                                                                            </TableCell>
                                                                            <TableCell className="py-3">
                                                                                <div className="font-mono text-xs bg-muted/30 w-fit px-2 py-1 rounded">
                                                                                    <span>{user.credits_balance?.toLocaleString() ?? 0}</span>
                                                                                </div>
                                                                            </TableCell>
                                                                            <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                                                                                {formatDateTime(user.created_at || user.invited_at)}
                                                                            </TableCell>
                                                                            <TableCell className="font-mono text-xs whitespace-nowrap">
                                                                                {user.last_login ? (
                                                                                    <time dateTime={user.last_login} title={formatDateTime(user.last_login)} className="text-foreground/90">
                                                                                        {formatTimeAgo(user.last_login)}
                                                                                    </time>
                                                                                ) : (
                                                                                    <span className="text-muted-foreground">Never</span>
                                                                                )}
                                                                            </TableCell>
                                                                            <TableCell className="text-right pr-6 rounded-r-lg py-3">
                                                                                <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                                                                                    {/* DESKTOP ACTIONS - Always Visible with Text */}
                                                                                    <Popover>
                                                                                        <PopoverTrigger asChild>
                                                                                            <Button
                                                                                                variant="ghost"
                                                                                                size="sm"
                                                                                                className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                                                                                            >
                                                                                                <Sparkles size={12} className="text-purple-400" />
                                                                                                <span className="sr-only xl:not-sr-only">Tier</span>
                                                                                            </Button>
                                                                                        </PopoverTrigger>
                                                                                        <PopoverContent className="w-48 p-0" align="end">
                                                                                            <div className="p-2">
                                                                                                <p className="text-xs font-medium text-muted-foreground px-2 py-1 mb-1">Set Tier</p>
                                                                                                {(['free', 'pro', 'whale'] as const).map((t) => (
                                                                                                    <Button
                                                                                                        key={t}
                                                                                                        variant={user.tier === t ? 'secondary' : 'ghost'}
                                                                                                        size="sm"
                                                                                                        className="w-full justify-start h-8 text-xs mb-1"
                                                                                                        onClick={() => user.id && handleUpdateTier(user.id, t)}
                                                                                                        disabled={!user.id}
                                                                                                    >
                                                                                                        {t === 'whale' && <Crown size={10} className="mr-2 text-amber-400" />}
                                                                                                        {t.charAt(0).toUpperCase() + t.slice(1)}
                                                                                                    </Button>
                                                                                                ))}
                                                                                            </div>
                                                                                        </PopoverContent>
                                                                                    </Popover>

                                                                                    <Button
                                                                                        variant="ghost"
                                                                                        size="sm"
                                                                                        className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:bg-pink-500/10 hover:text-pink-500 transition-colors"
                                                                                        onClick={() => handleGiftCredits(user)}
                                                                                    >
                                                                                        <Gift size={12} className="text-pink-500" />
                                                                                        <span className="sr-only xl:not-sr-only">Gift</span>
                                                                                    </Button>

                                                                                    {user.status === 'WAITLIST' && (
                                                                                        <Button
                                                                                            variant="ghost"
                                                                                            size="sm"
                                                                                            className="h-8 gap-1.5 px-2 text-xs text-up hover:bg-emerald-500/10 hover:text-emerald-500 transition-colors"
                                                                                            onClick={() => user.email && handleApprove(user.email)}
                                                                                        >
                                                                                            <CheckCircle size={12} className="text-up" />
                                                                                            <span className="sr-only xl:not-sr-only">Approve</span>
                                                                                        </Button>
                                                                                    )}

                                                                                    {user.status !== 'BANNED' ? (
                                                                                        <Button
                                                                                            variant="ghost"
                                                                                            size="sm"
                                                                                            className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:bg-down/10 hover:text-down"
                                                                                            onClick={() => handleRevoke(user)}
                                                                                        >
                                                                                            <Ban size={12} className="text-down" />
                                                                                            <span className="sr-only xl:not-sr-only">Ban</span>
                                                                                        </Button>
                                                                                    ) : (
                                                                                        <Button
                                                                                            variant="ghost"
                                                                                            size="sm"
                                                                                            className="h-8 gap-1.5 px-2 text-xs text-up hover:bg-emerald-500/10 hover:text-emerald-500"
                                                                                            onClick={() => handleUnban(user)}
                                                                                        >
                                                                                            <CheckCircle size={12} className="text-up" />
                                                                                            <span className="sr-only xl:not-sr-only">Unban</span>
                                                                                        </Button>
                                                                                    )}

                                                                                    <Button
                                                                                        variant="ghost"
                                                                                        size="icon"
                                                                                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                                                                        onClick={() => openUserDetail(user)}
                                                                                        title="User details"
                                                                                        aria-label={`Details for ${user.email}`}
                                                                                    >
                                                                                        <List size={16} />
                                                                                    </Button>
                                                                                </div>
                                                                            </TableCell>
                                                                        </TableRow>
                                                                    ))}
                                                                </TableBody>
                                                            </table>
                                                        </div>
                                                    ) : (
                                                        /* Grid View */
                                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                                            {paginatedData.map((user, index) => (
                                                                <UserAdminCard
                                                                    key={user.id || user.email || `user-grid-${index}`}
                                                                    user={user}
                                                                    onClick={openUserDetail}
                                                                />
                                                            ))}
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>

                                        {/* Pagination */}
                                        {totalPages > 1 && (
                                            <div className="flex items-center justify-between mt-4">
                                                <p className="text-sm text-muted-foreground">
                                                    Page {currentPage} of {totalPages}
                                                </p>
                                                <div className="flex gap-2">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-11 lg:h-9"
                                                        disabled={currentPage === 1}
                                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                                    >
                                                        Previous
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-11 lg:h-9"
                                                        disabled={currentPage === totalPages}
                                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                                    >
                                                        Next
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                    </div>
                </div>
            </main>

            <UserDetailDialog
                user={selectedUser}
                open={isUserDetailOpen}
                onOpenChange={setIsUserDetailOpen}
                onUpdateTier={handleUpdateTier}
                onUpdateRole={handleUpdateRole}
                onRevoke={handleRevoke}
                onUnban={handleUnban}
                onApprove={handleApprove}
                onGiftCredits={handleGiftCredits}
                onResetTutorial={handleResetTutorial}
            />
        </div>
    );
}
