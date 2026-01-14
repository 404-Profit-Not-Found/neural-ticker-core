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
import { cn } from '../lib/utils';
import { NativeSelect } from '../components/ui/select-native';
import { TickerRequestCard } from '../components/admin/TickerRequestCard';
import { UserAdminCard, type AdminUser } from '../components/admin/UserAdminCard';
import { ShadowBanManager } from '../components/admin/ShadowBanManager';
import { LogoManager } from '../components/admin/LogoManager';
import { Header } from '../components/layout/Header';
import { useNavigate } from 'react-router-dom';
import { TickerRequestRow } from '../components/admin/TickerRequestRow';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
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

type SortConfig = {
    key: string;
    direction: 'asc' | 'desc';
};

// Helper function for full timestamp
function formatTimestamp(dateString: string | undefined): string {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Never';
    return date.toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).replace(/,/g, '');
}

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

    // Tab State
    const [activeTab, setActiveTab] = useState<'users' | 'shadowban' | 'logo' | 'requests'>('users');
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

    // Users Tab State
    const [identities, setIdentities] = useState<AdminUser[]>([]);
    const [newEmail, setNewEmail] = useState('');
    const [loading, setLoading] = useState(true);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_error, setError] = useState<string | null>(null);
    const [isInviteOpen, setIsInviteOpen] = useState(false);

    // Dialog & Detail State
    const [isUserDetailOpen, setIsUserDetailOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

    // Requests Tab State
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [requests, setRequests] = useState<any[]>([]);

    // Table State
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<AdminFilterKey>('ALL');
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'created_at', direction: 'desc' });
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const isSuperAdmin = currentUser?.email === 'branislavlang@gmail.com';

    // Force grid view on mobile
    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth < 768) {
                setViewMode('grid');
            }
        };
        handleResize(); // Initial check
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

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

        if (!confirm(`Revoke access for ${user.email}?`)) return;
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
        if (!confirm(`Unban ${user.email}?`)) return;
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
        // Ask for amount via prompt for simplicity or reuse a dedicated modal?
        // User requested "Modal shows actions".
        // If "Gift Credits" clicked in Detail Dialog, we can show a prompt or sub-dialog.
        // For now, let's use a browser prompt to keep it simple as the original design had a separate complex modal.
        // OR better: reuse the existing logic but we need amount.
        // Let's implement a simple prompt flow for now, or just default to 1 credit?
        // The original code had a dedicated modal.
        // We can use a `toast` with input? No.
        // Let's assume we gift 5 credits by default or prompt.
        const amountStr = prompt("Enter credit amount to gift:", "1");
        if (!amountStr) return;
        const amount = parseInt(amountStr);
        if (!amount || amount <= 0) return;

        try {
            if (!user.id) throw new Error('User ID is missing');
            await AdminService.giftCredits(user.id, amount, "Admin Gift");
            toast.success(`Sent ${amount} credits to ${user.email}`);
        } catch (err: unknown) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const msg = (err as any).response?.data?.message || 'Failed to gift credits';
            toast.error(msg);
        }
    };

    const handleResetTutorial = async (userId: string) => {
        if (!confirm('Are you sure you want to reset the tutorial state for this user? This will wipe their Watchlist, Portfolio, and Digest.')) return;
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
        if (!confirm(`Reject request for ${symbol}?`)) return;
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
        } else {
            // Default view: exclude banned users
            filtered = filtered.filter(u => u.status !== 'BANNED');
        }

        return [...filtered].sort((a, b) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const aVal = (a as any)[sortConfig.key];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const bVal = (b as any)[sortConfig.key];

            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [identities, searchTerm, statusFilter, sortConfig]);

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
                    badges.push(<Badge key="active" variant="outline" className="text-emerald-500 border-emerald-500/20 bg-emerald-500/5">ACTIVE</Badge>);
                    break;
                case 'WAITLIST':
                    badges.push(<Badge key="waitlist" variant="secondary" className="text-amber-500 border-amber-500/20">WAITLIST</Badge>);
                    break;
                case 'INVITED':
                    badges.push(<Badge key="invited" variant="outline" className="text-blue-500 border-blue-500/20 bg-blue-500/5">INVITED</Badge>);
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
    const LoadingSkeleton = ({ mode = viewMode }: { mode?: 'list' | 'grid' }) => {
        const items = [...Array(mode === 'list' ? 5 : 6)];

        if (mode === 'list') {
            // Wrap TableRow elements in proper table structure to avoid hydration errors
            return (
                <div className="overflow-x-auto">
                    <table className="w-full caption-bottom text-sm border-separate border-spacing-y-2">
                        <TableBody>
                            {items.map((_, i) => (
                                <TableRow key={`skeleton-row-${i}`} className="bg-card border-none rounded-lg">
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
                    <div key={`skeleton-card-${i}`} className="h-32 bg-card border border-border/40 rounded-xl animate-pulse" />
                ))}
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-background relative flex flex-col">
            <Header />

            {/* Main Content Area */}
            <main className="flex-1 pt-6 overflow-y-auto h-screen scrollbar-thin">
                <div className="container mx-auto p-4 md:p-8 max-w-7xl">
                    <div className="flex flex-col gap-2 mb-6">
                        <h1 className="text-3xl font-bold tracking-tight">
                            {activeTab === 'users' && 'User Management'}
                            {activeTab === 'requests' && 'Ticker Requests'}
                            {activeTab === 'shadowban' && 'Shadow Ban Quality'}
                            {activeTab === 'logo' && 'Logo Manager'}
                        </h1>
                        <p className="text-muted-foreground">
                            {activeTab === 'users' && 'Verify and manage users, tiers, and access control.'}
                            {activeTab === 'requests' && 'Review and approve new asset requests from the community.'}
                            {activeTab === 'shadowban' && 'Monitor and manage shadow-banned accounts.'}
                            {activeTab === 'logo' && 'Update and verify asset branding and logos.'}
                        </p>
                    </div>

                    {/* Integrated Tab Navigation */}
                    <div className="flex items-center justify-between gap-4 mb-8">
                        {/* Mobile Select */}
                        <div className="md:hidden w-full">
                            <NativeSelect
                                value={activeTab}
                                onChange={(e) => {
                                    setActiveTab(e.target.value as 'users' | 'shadowban' | 'logo' | 'requests');
                                    setCurrentPage(1);
                                }}
                            >
                                <option value="users">User Management</option>
                                <option value="requests">Ticker Requests</option>
                                <option value="shadowban">Shadow Ban</option>
                                <option value="logo">Logo Manager</option>
                            </NativeSelect>
                        </div>

                        {/* Desktop Navigation - Simple underline tabs like TickerDetail */}
                        <div className="hidden md:flex items-center border-b border-border w-full">
                            {(['users', 'requests', 'shadowban', 'logo'] as const).map((tabId) => {
                                const labels: Record<string, string> = {
                                    users: 'Users',
                                    requests: 'Ticker Requests',
                                    shadowban: 'Shadow Ban',
                                    logo: 'Logo Manager'
                                };
                                const isActive = activeTab === tabId;

                                return (
                                    <button
                                        key={tabId}
                                        className={cn(
                                            "py-2 px-4 text-sm font-medium border-b-2 transition-all",
                                            isActive
                                                ? "border-primary text-foreground font-bold"
                                                : "border-transparent text-muted-foreground hover:text-foreground"
                                        )}
                                        onClick={() => {
                                            setActiveTab(tabId);
                                            setCurrentPage(1);
                                        }}
                                    >
                                        {labels[tabId]}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {/* Shadow Ban Tab */}
                        {activeTab === 'shadowban' && <ShadowBanManager />}
                        {/* Logo Manager Tab */}
                        {activeTab === 'logo' && <LogoManager />}

                        {/* Requests Tab */}
                        {
                            activeTab === 'requests' && (
                                <div className="space-y-6 animate-in fade-in duration-300">
                                    {/* ... Requests Content ... */}
                                    {/* Re-implementing Requests Header for view toggle */}
                                    <div className="flex items-center justify-between pb-2 border-b border-border/50">
                                        <div className="flex items-center gap-3">
                                            {/* Redundant Title Removed */}
                                        </div>
                                        {/* Hidden on mobile since grid is forced */}
                                        <div className="hidden md:flex items-center gap-1 bg-muted/50 p-1 rounded-lg border border-border/40">
                                            <Button
                                                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                                                size="icon"
                                                className="h-7 w-7"
                                                onClick={() => setViewMode('list')}
                                            >
                                                <List size={14} />
                                            </Button>
                                            <Button
                                                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                                                size="icon"
                                                className="h-7 w-7"
                                                onClick={() => setViewMode('grid')}
                                            >
                                                <LayoutGrid size={14} />
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Requests Grid/List Logic same as before... */}
                                    {viewMode === 'list' ? (
                                        <div className="overflow-x-auto">
                                            <table className="w-full caption-bottom text-sm border-separate border-spacing-y-2">
                                                <TableHeader>
                                                    <TableRow className="bg-transparent hover:bg-transparent border-none">
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
                                                    ) : requests.length === 0 ? (
                                                        <TableRow className="bg-card hover:bg-card border-none rounded-lg">
                                                            <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">No pending requests</TableCell>
                                                        </TableRow>
                                                    ) : (
                                                        requests.map((req) => (
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
                                            ) : requests.length === 0 ? (
                                                <div className="h-32 flex items-center justify-center text-muted-foreground bg-muted/20 rounded-lg col-span-full">No requests</div>
                                            ) : (
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                    {requests.map((req) => (
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
                                        <div className="flex flex-row items-center justify-between pb-2 border-b border-border/50">
                                            <div className="flex items-center gap-3">
                                                {/* Redundant Title Removed */}
                                            </div>
                                            <div className="flex items-center gap-3">
                                                {/* View Toggle (Desktop Only) */}
                                                <div className="hidden md:flex items-center gap-1 bg-muted/50 p-1 rounded-lg border border-border/40">
                                                    <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="icon" className="h-7 w-7" onClick={() => setViewMode('list')}><List size={14} /></Button>
                                                    <Button variant={viewMode === 'grid' ? 'secondary' : 'ghost'} size="icon" className="h-7 w-7" onClick={() => setViewMode('grid')}><LayoutGrid size={14} /></Button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Search & Actions Row */}
                                        <div className="flex flex-col sm:flex-row gap-4 items-center w-full">
                                            <div className="relative flex-1 w-full">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                <Input
                                                    placeholder="Search by email or nickname..."
                                                    className="pl-10 bg-muted/20 border-border/40 focus:bg-background transition-colors"
                                                    value={searchTerm}
                                                    onChange={(e) => setSearchTerm(e.target.value)}
                                                />
                                            </div>

                                            <Button
                                                className="gap-2 h-9 w-full sm:w-auto shrink-0 bg-primary text-primary-foreground"
                                                onClick={() => setIsInviteOpen(true)}
                                            >
                                                <Plus size={16} />
                                                Add User
                                            </Button>

                                            <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
                                                <DialogContent>
                                                    <DialogHeader>
                                                        <DialogTitle>Add to Waitlist / Invite</DialogTitle>
                                                        <DialogDescription>
                                                            Enter the email address to add.
                                                        </DialogDescription>
                                                    </DialogHeader>
                                                    <div className="grid gap-4 py-4">
                                                        <Input
                                                            value={newEmail}
                                                            onChange={(e) => setNewEmail(e.target.value)}
                                                            placeholder="user@example.com"
                                                        />
                                                    </div>
                                                    <DialogFooter>
                                                        <Button variant="outline" onClick={() => setIsInviteOpen(false)}>Cancel</Button>
                                                        <Button onClick={handleAddEmail}>Add User</Button>
                                                    </DialogFooter>
                                                </DialogContent>
                                            </Dialog>
                                        </div>

                                        {/* Consolidated List/Grid View */}
                                        <div className="w-full">
                                            {loading ? (
                                                <LoadingSkeleton mode={viewMode} />
                                            ) : (
                                                <>
                                                    {viewMode === 'list' ? (
                                                        <div className="overflow-x-auto">
                                                            <table className="w-full caption-bottom text-sm border-separate border-spacing-y-2">
                                                                <TableHeader>
                                                                    <TableRow className="bg-transparent hover:bg-transparent border-none">
                                                                        <TableHead className="w-[350px] cursor-pointer text-muted-foreground font-medium pl-6" onClick={() => handleSort('email')}>
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
                                                                        <TableHead className="text-right text-muted-foreground font-medium pr-6">Actions</TableHead>
                                                                    </TableRow>
                                                                </TableHeader>
                                                                <TableBody className="space-y-2">
                                                                    {paginatedData.map((user, index) => (
                                                                        <TableRow
                                                                            key={user.id || user.email || `user-${index}`}
                                                                            className="bg-card hover:bg-card/80 transition-colors border-none rounded-lg group text-xs sm:text-sm cursor-pointer"
                                                                            onClick={() => openUserDetail(user)}
                                                                        >
                                                                            <TableCell className="pl-6 font-medium rounded-l-lg py-3">
                                                                                <div className="flex items-center gap-3">
                                                                                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground ring-1 ring-border/50 overflow-hidden shrink-0">
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
                                                                                {formatTimestamp(user.created_at || user.invited_at)}
                                                                            </TableCell>
                                                                            <TableCell className="text-right pr-6 rounded-r-lg py-3">
                                                                                <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                                                                                    {/* DESKTOP ACTIONS - Always Visible with Text */}
                                                                                    <Popover>
                                                                                        <PopoverTrigger asChild>
                                                                                            <Button
                                                                                                variant="ghost"
                                                                                                size="sm"
                                                                                                className="h-7 gap-1.5 text-xs text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                                                                                            >
                                                                                                <Sparkles size={12} className="text-purple-400" />
                                                                                                Tier
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
                                                                                        className="h-7 gap-1.5 text-xs text-muted-foreground hover:bg-pink-500/10 hover:text-pink-500 transition-colors"
                                                                                        onClick={() => handleGiftCredits(user)}
                                                                                    >
                                                                                        <Gift size={12} className="text-pink-500" />
                                                                                        Gift
                                                                                    </Button>

                                                                                    {user.status === 'WAITLIST' && (
                                                                                        <Button
                                                                                            variant="ghost"
                                                                                            size="sm"
                                                                                            className="h-7 gap-1.5 text-xs text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-500 transition-colors"
                                                                                            onClick={() => user.email && handleApprove(user.email)}
                                                                                        >
                                                                                            <CheckCircle size={12} className="text-emerald-500" />
                                                                                            Approve
                                                                                        </Button>
                                                                                    )}

                                                                                    {user.status !== 'BANNED' ? (
                                                                                        <Button
                                                                                            variant="ghost"
                                                                                            size="sm"
                                                                                            className="h-7 gap-1.5 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                                                                            onClick={() => handleRevoke(user)}
                                                                                        >
                                                                                            <Ban size={12} className="text-destructive" />
                                                                                            Ban
                                                                                        </Button>
                                                                                    ) : (
                                                                                        <Button
                                                                                            variant="ghost"
                                                                                            size="sm"
                                                                                            className="h-7 gap-1.5 text-xs text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-500"
                                                                                            onClick={() => handleUnban(user)}
                                                                                        >
                                                                                            <CheckCircle size={12} className="text-emerald-500" />
                                                                                            Unban
                                                                                        </Button>
                                                                                    )}

                                                                                    <Button
                                                                                        variant="ghost"
                                                                                        size="sm"
                                                                                        className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                                                                                        onClick={() => openUserDetail(user)}
                                                                                        title="View Details / Reset Tutorial"
                                                                                    >
                                                                                        <List size={16} className="text-blue-500" />
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
                                                        disabled={currentPage === 1}
                                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                                    >
                                                        Previous
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
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
