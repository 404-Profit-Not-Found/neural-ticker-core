import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { AdminService } from '../services/adminService';
import { useAuth } from '../context/AuthContext';
import { Plus, SearchX } from 'lucide-react';
import { ShadowBanManager } from '../components/admin/ShadowBanManager';
import { LogoManager } from '../components/admin/LogoManager';
import { useNavigate } from 'react-router-dom';
import { TickerRequestRow } from '../components/admin/TickerRequestRow';
import { TickerRequestListRow } from '../components/admin/TickerRequestListRow';
import { UserListRow } from '../components/admin/UserListRow';
import { UserTable, type UserSort } from '../components/admin/UserTable';
import type { AdminUser } from '../components/admin/model';
import {
    ADMIN_LIST,
    ADMIN_TABLE,
    AdminRowsSkeleton,
    AdminTableSkeleton,
    Pager,
    SearchField,
    Th,
} from '../components/admin/admin-ui';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import { useConfirm, usePrompt } from '../components/ui/confirm';
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { AdminStatsBar, type AdminFilterKey } from '../components/admin/AdminStatsBar';
import { UserDetailDialog } from '../components/admin/UserDetailDialog';
import { RequestStatsBar, type RequestFilterKey } from '../components/admin/RequestStatsBar';
import { PageHeader } from '../components/ui/page-header';
import { BackButton } from '../components/ui/back-button';
import { EmptyState, LoadError } from '../components/ui/empty-state';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { useCompactLayout } from '../hooks/useMediaQuery';

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

/** The tabs whose list this page loads itself (the other two load their own). */
type ListTab = 'users' | 'requests';

export function AdminConsole() {
    const { user: currentUser } = useAuth();
    const navigate = useNavigate();
    const confirm = useConfirm();
    const promptText = usePrompt();

    // Tab State
    const [activeTab, setActiveTab] = useState<AdminTab>('users');

    // Users Tab State
    const [identities, setIdentities] = useState<AdminUser[]>([]);
    const [newEmail, setNewEmail] = useState('');
    // Which lists have arrived at least once. Until then a tab shows a
    // skeleton (or the load error) — never "nothing here".
    const [loaded, setLoaded] = useState<Record<ListTab, boolean>>({ users: false, requests: false });
    const loadedRef = useRef(loaded);
    const [error, setError] = useState<{ tab: ListTab; message: string } | null>(null);
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
    const [sortConfig, setSortConfig] = useState<UserSort>({ key: 'created_at', direction: 'desc' });
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const isSuperAdmin = currentUser?.email === SUPERADMIN_EMAIL;

    // One tree per width: compact rows below `lg`, tables from there up.
    const compact = useCompactLayout();

    // Redirect non-admin users immediately
    useEffect(() => {
        if (currentUser && currentUser.role !== 'admin') {
            navigate('/access-denied', { replace: true });
        }
    }, [currentUser, navigate]);

    const loadData = useCallback(async () => {
        // Don't load if not admin
        if (!currentUser || currentUser.role !== 'admin') return;
        if (activeTab !== 'users' && activeTab !== 'requests') return;
        const tab: ListTab = activeTab;

        setError(null);
        try {
            if (tab === 'users') {
                const data = await AdminService.getIdentities();
                setIdentities(data);
            } else {
                const data = await AdminService.getTickerRequests();
                setRequests(Array.isArray(data) ? data : []);
            }
            loadedRef.current = { ...loadedRef.current, [tab]: true };
            setLoaded(loadedRef.current);
        } catch (err: unknown) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const errorResponse = (err as any).response;
            if (errorResponse?.status === 403 || errorResponse?.status === 401) {
                setError({ tab, message: 'Access denied. Admin privileges required.' });
                navigate('/access-denied', { replace: true });
            } else {
                const msg = errorResponse?.data?.message || 'Failed to load data';
                setError({ tab, message: msg });
                // A list already on screen stays; say that the refresh failed.
                if (loadedRef.current[tab]) toast.error(msg);
            }
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

        // A column sorts by what it shows: "Joined" falls back to the invite date.
        const sortValue = (user: AdminUser) =>
            sortConfig.key === 'created_at'
                ? user.created_at || user.invited_at
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                : (user as any)[sortConfig.key];

        return [...filtered].sort((a, b) => {
            const aVal = sortValue(a);
            const bVal = sortValue(b);

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
    const paginatedData = processedData.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const tabError = (tab: ListTab) => (error?.tab === tab ? error.message : null);
    const isFiltered = !!searchTerm || statusFilter !== 'ALL';

    return (
        <div className="min-h-page bg-background">
            <main className="container mx-auto max-w-7xl space-y-4 px-4 pb-10 pt-4 sm:px-6 lg:space-y-5 lg:pt-6">
                {/* One fixed title; the tab says where you are. */}
                <PageHeader
                    back={<BackButton />}
                    title="Admin"
                    description={ADMIN_TABS.find((tab) => tab.id === activeTab)?.description}
                />

                <Tabs
                    className="space-y-4"
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

                    {/* Users */}
                    <TabsContent value="users" className="mt-0 space-y-3">
                        {/* Toolbar: search and the one action on a line, the counts-as-filter
                            under it (one scrolling row on phones). From `lg` it is one line. */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
                            <SearchField
                                className="order-1 min-w-0 flex-1 lg:w-64 lg:flex-none xl:w-72"
                                label="Search users by email or nickname"
                                placeholder="Search users…"
                                value={searchTerm}
                                onChange={(value) => {
                                    setSearchTerm(value);
                                    setCurrentPage(1);
                                }}
                            />
                            {/* Tonal on purpose: blue is kept for the commit inside the sheet. */}
                            <Button
                                variant="outline"
                                className="order-2 h-11 shrink-0 gap-1.5 px-3.5 lg:order-3 lg:h-9"
                                onClick={() => setIsInviteOpen(true)}
                            >
                                <Plus size={16} aria-hidden />
                                Add user
                            </Button>
                            <div className="order-3 w-full min-w-0 lg:order-2 lg:w-auto lg:flex-1">
                                <AdminStatsBar
                                    stats={stats}
                                    loading={!loaded.users}
                                    selectedFilter={statusFilter}
                                    onFilterChange={(filter) => {
                                        setStatusFilter(filter);
                                        setCurrentPage(1);
                                    }}
                                />
                            </div>
                        </div>

                        {!loaded.users ? (
                            tabError('users') ? (
                                <LoadError what="users" onRetry={() => void loadData()} className="rounded-lg bg-card" />
                            ) : compact ? (
                                <AdminRowsSkeleton rows={8} label="Loading users" />
                            ) : (
                                <AdminTableSkeleton rows={8} columns={6} label="Loading users" />
                            )
                        ) : paginatedData.length === 0 ? (
                            <EmptyState
                                className="rounded-lg bg-card"
                                icon={<SearchX className="h-5 w-5" />}
                                title={isFiltered ? 'No users match' : 'No users yet'}
                                description={isFiltered ? 'Try a different search, or clear the filter above.' : undefined}
                                action={isFiltered ? <Button variant="outline" size="sm" onClick={() => { setSearchTerm(''); setStatusFilter('ALL'); setCurrentPage(1); }}>Show all users</Button> : undefined}
                            />
                        ) : compact ? (
                            <ul className={ADMIN_LIST}>
                                {paginatedData.map((user, index) => (
                                    <li key={user.id || user.email || `user-${index}`}>
                                        <UserListRow user={user} onOpen={openUserDetail} />
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <UserTable
                                users={paginatedData}
                                sort={sortConfig}
                                onSort={handleSort}
                                onOpen={openUserDetail}
                                onUpdateTier={handleUpdateTier}
                                onGiftCredits={handleGiftCredits}
                                onApprove={handleApprove}
                                onRevoke={handleRevoke}
                                onUnban={handleUnban}
                            />
                        )}

                        {loaded.users && (
                            <Pager page={currentPage} pageSize={itemsPerPage} total={processedData.length} onPage={setCurrentPage} />
                        )}
                    </TabsContent>

                    {/* Ticker requests */}
                    <TabsContent value="requests" className="mt-0 space-y-3">
                        <RequestStatsBar
                            stats={requestStats}
                            loading={!loaded.requests}
                            selectedFilter={requestFilter}
                            onFilterChange={setRequestFilter}
                        />

                        {!loaded.requests ? (
                            tabError('requests') ? (
                                <LoadError what="ticker requests" onRetry={() => void loadData()} className="rounded-lg bg-card" />
                            ) : compact ? (
                                <AdminRowsSkeleton rows={5} label="Loading ticker requests" />
                            ) : (
                                <AdminTableSkeleton rows={5} columns={5} label="Loading ticker requests" />
                            )
                        ) : processedRequests.length === 0 ? (
                            <EmptyState
                                className="rounded-lg bg-card"
                                title={requestFilter === 'ALL' ? 'No ticker requests yet' : `No ${requestFilter.toLowerCase()} requests`}
                                action={requestFilter === 'ALL' ? undefined : <Button variant="outline" size="sm" onClick={() => setRequestFilter('ALL')}>Show all requests</Button>}
                            />
                        ) : compact ? (
                            <ul className={ADMIN_LIST}>
                                {processedRequests.map((req) => (
                                    <li key={req.id}>
                                        <TickerRequestListRow
                                            request={req}
                                            onApprove={handleApproveRequest}
                                            onReject={handleRejectRequest}
                                        />
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className={ADMIN_TABLE}>
                                    <thead>
                                        <tr>
                                            <Th>Ticker</Th>
                                            <Th>Status</Th>
                                            <Th>Requested by</Th>
                                            <Th>Date</Th>
                                            <Th className="text-right">
                                                <span className="sr-only">Actions</span>
                                            </Th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {processedRequests.map((req) => (
                                            <TickerRequestRow
                                                key={req.id}
                                                request={req}
                                                onApprove={handleApproveRequest}
                                                onReject={handleRejectRequest}
                                            />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </TabsContent>

                    {/* Shadow ban */}
                    <TabsContent value="shadowban" className="mt-0">
                        <ShadowBanManager />
                    </TabsContent>

                    {/* Logos */}
                    <TabsContent value="logo" className="mt-0">
                        <LogoManager />
                    </TabsContent>
                </Tabs>
            </main>

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
                            className="h-11 lg:h-10"
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
