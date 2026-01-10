import { useEffect, useState, useCallback, useMemo } from 'react';
import { LogoManager } from '../components/admin/LogoManager';
import { AdminService } from '../services/adminService';
import { useAuth } from '../context/AuthContext';
import { 
    Plus, 
    CheckCircle, 
    Search, 
    ChevronLeft, 
    ArrowUpDown, 
    Shield, 
    Coins, 
    EyeOff, 
    Users, 
    Image as ImageIcon,
    Crown,
    Sparkles,
    UserCircle,
    Clock,
    ChevronDown,
    MoreHorizontal,
    Gift,
    Ban
} from 'lucide-react';
import { ShadowBanManager } from '../components/admin/ShadowBanManager';
import { Header } from '../components/layout/Header';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import {
    Table,
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

type SortConfig = {
    key: string;
    direction: 'asc' | 'desc';
};

// Helper function for relative time
function getRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 604800)}w ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
    const [activeTab, setActiveTab] = useState<'users' | 'shadowban' | 'logo'>('users');

    // Users Tab State
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [identities, setIdentities] = useState<any[]>([]);
    const [newEmail, setNewEmail] = useState('');
    const [loading, setLoading] = useState(true);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_error, setError] = useState<string | null>(null);
    const [isInviteOpen, setIsInviteOpen] = useState(false);
    const [isCreditModalOpen, setIsCreditModalOpen] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [selectedUserForCredits, setSelectedUserForCredits] = useState<any | null>(null);
    const [creditAmount, setCreditAmount] = useState(1);
    const [creditReason, setCreditReason] = useState('Admin Gift');

    // Table State
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'WAITLIST' | 'INVITED'>('ALL');
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'created_at', direction: 'desc' });
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

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
            const data = await AdminService.getIdentities();
            setIdentities(data);
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
    }, [currentUser, navigate]);

    useEffect(() => {
        if (currentUser && currentUser.role === 'admin' && activeTab === 'users') {
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
        // We'll need userId for approve, but let's see if we have it in the item
        try {
             // Find user ID from identities
            const user = identities.find(u => u.email === email);
            if (!user) throw new Error('User not found');
            
            await AdminService.approveUser(user.id);
            toast.success(`Approved ${email}`);
            loadData();
        } catch (err: unknown) {
             // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const msg = (err as any).response?.data?.message || (err as any).message || 'Failed to approve user';
            toast.error(msg);
        }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleRevoke = async (item: any) => {
        if (!confirm(`Revoke access for ${item.email}?`)) return;
        try {
            await AdminService.revokeAccess(item.email);
            toast.success(`Revoked access for ${item.email}`);
            loadData();
        } catch (err: unknown) {
             // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const msg = (err as any).response?.data?.message || 'Failed to revoke access';
            toast.error(msg);
        }
    };

    const handleUpdateTier = async (userId: string, tier: 'free' | 'pro' | 'whale') => {
        try {
            await AdminService.updateTier(userId, tier);
            // Optimistic update
             
            setIdentities(prev => prev.map(u => u.id === userId ? { ...u, tier } : u));
            toast.success(`Updated tier to ${tier}`);
        } catch (err: unknown) {
             // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const msg = (err as any).response?.data?.message || 'Failed to update tier';
            toast.error(msg);
        }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const openCreditModal = (user: any) => {
        setSelectedUserForCredits(user);
        setCreditAmount(1);
        setCreditReason('Admin Gift');
        setIsCreditModalOpen(true);
    };

    const handleGiftCredits = async () => {
        if (!selectedUserForCredits) return;
        try {
            await AdminService.giftCredits(selectedUserForCredits.id, creditAmount, creditReason);
            toast.success(`Sent ${creditAmount} credits to ${selectedUserForCredits.email}`);
            setIsCreditModalOpen(false);
            setSelectedUserForCredits(null);
            // Optionally reload to see credit counts (if displayed)
        } catch (err: unknown) {
             // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const msg = (err as any).response?.data?.message || 'Failed to gift credits';
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
             // eslint-disable-next-line @typescript-eslint/no-explicit-any
            filtered = filtered.filter((item: any) =>
                item.email?.toLowerCase().includes(lower) ||
                item.nickname?.toLowerCase().includes(lower)
            );
        }

        if (statusFilter !== 'ALL') {
             // eslint-disable-next-line @typescript-eslint/no-explicit-any
            filtered = filtered.filter((item: any) => item.status === statusFilter);
        }

        return [...filtered].sort((a, b) => {
              
            const aVal = a[sortConfig.key];
              
            const bVal = b[sortConfig.key];

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
        const pro = identities.filter(u => u.tier === 'pro').length;
        const whale = identities.filter(u => u.tier === 'whale').length;
        return { total, active, waitlist, pro, whale };
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
        if (role === 'admin') {
            return <Badge variant="secondary" className="gap-1"><Shield size={10} /> ADMIN</Badge>;
        }
        switch (status) {
            case 'ACTIVE':
                return <Badge variant="default">ACTIVE</Badge>;
            case 'WAITLIST':
                return <Badge variant="secondary">WAITLIST</Badge>;
            case 'INVITED':
                return <Badge variant="outline">INVITED</Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    // Get tier badge - matches existing app styling (Header, TickerDiscussion)
    const getTierBadge = (tier: string | undefined) => {
        const tierValue = tier || 'free';
        const isPremium = tierValue === 'pro' || tierValue === 'whale';
        return (
            <Badge
                variant="outline"
                className={`text-[10px] h-5 px-1.5 uppercase ${
                    isPremium
                        ? 'border-purple-500 text-purple-500'
                        : 'border-emerald-500 text-emerald-500'
                }`}
            >
                {tierValue.toUpperCase()}
            </Badge>
        );
    };

    // Loading skeleton
    const LoadingSkeleton = () => (
        <>
            {[...Array(5)].map((_, i) => (
                <TableRow key={i} className="admin-table-row">
                    <TableCell>
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
                            <div className="space-y-2">
                                <div className="h-4 w-40 bg-muted animate-pulse rounded" />
                                <div className="h-3 w-24 bg-muted animate-pulse rounded" />
                            </div>
                        </div>
                    </TableCell>
                    <TableCell><div className="h-5 w-16 bg-muted animate-pulse rounded-full" /></TableCell>
                    <TableCell><div className="h-5 w-16 bg-muted animate-pulse rounded-full" /></TableCell>
                    <TableCell><div className="h-4 w-20 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-8 w-8 bg-muted animate-pulse rounded" /></TableCell>
                </TableRow>
            ))}
        </>
    );

    return (
        <div className="flex flex-col min-h-screen bg-background">
            <Header />
            <main className="flex-1 container mx-auto p-4 md:p-8 pt-24">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-violet-500">
                            Admin Console
                        </h1>
                        <p className="text-muted-foreground mt-1">Manage users, access, and system content</p>
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="flex gap-2 mb-6 border-b border-border">
                    <button
                        onClick={() => setActiveTab('users')}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                            activeTab === 'users'
                                ? 'border-primary text-primary'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <Users size={16} />
                        Users
                    </button>
                    <button
                        onClick={() => setActiveTab('shadowban')}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                            activeTab === 'shadowban'
                                ? 'border-primary text-primary'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <EyeOff size={16} />
                        Shadow Ban
                    </button>
                    <button
                        onClick={() => setActiveTab('logo')}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                            activeTab === 'logo'
                                ? 'border-primary text-primary'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <ImageIcon size={16} />
                        Logo Manager
                    </button>
                </div>

                {/* Shadow Ban Tab */}
                {activeTab === 'shadowban' && <ShadowBanManager />}
                {/* Logo Manager Tab */}
                {activeTab === 'logo' && <LogoManager />}

                {/* Users Tab (Inline) */}
                {activeTab === 'users' && (
                    <div className="space-y-6">
                        {/* Stats Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <Card className="admin-stats-card">
                                <CardContent className="p-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Users</p>
                                            <p className="text-2xl font-bold mt-1">{stats.total}</p>
                                        </div>
                                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                            <Users size={20} className="text-primary" />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="admin-stats-card">
                                <CardContent className="p-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-xs text-muted-foreground uppercase tracking-wider">Active</p>
                                            <p className="text-2xl font-bold mt-1 text-emerald-400">{stats.active}</p>
                                        </div>
                                        <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                                            <CheckCircle size={20} className="text-emerald-400" />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="admin-stats-card">
                                <CardContent className="p-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-xs text-muted-foreground uppercase tracking-wider">Waitlist</p>
                                            <p className="text-2xl font-bold mt-1 text-amber-400">{stats.waitlist}</p>
                                        </div>
                                        <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                                            <Clock size={20} className="text-amber-400" />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="admin-stats-card">
                                <CardContent className="p-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-xs text-muted-foreground uppercase tracking-wider">Pro</p>
                                            <p className="text-2xl font-bold mt-1 text-purple-400">{stats.pro}</p>
                                        </div>
                                        <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                                            <Sparkles size={20} className="text-purple-400" />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="admin-stats-card">
                                <CardContent className="p-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-xs text-muted-foreground uppercase tracking-wider">Whale</p>
                                            <p className="text-2xl font-bold mt-1 text-amber-300">{stats.whale}</p>
                                        </div>
                                        <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                                            <Crown size={20} className="text-amber-300" />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Main Table Card */}
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between pb-4">
                                <CardTitle className="text-xl flex items-center gap-2">
                                    <Shield className="text-primary" size={20} />
                                    User Management
                                </CardTitle>
                                 <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
                                    <DialogTrigger asChild>
                                        <Button className="gap-2">
                                            <Plus size={16} />
                                            Add User
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>Add to Waitlist / Invite</DialogTitle>
                                            <DialogDescription>
                                                Enter the email address to add. They will see the 'You are on the list' screen until approved.
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
                            </CardHeader>
                            <CardContent>
                                {/* Filters */}
                                <div className="flex flex-col md:flex-row gap-4 mb-6 justify-between">
                                    <div className="relative w-full md:w-72">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            placeholder="Search by email or nickname..."
                                            className="pl-10"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                        />
                                    </div>
                                    <div className="flex gap-2 flex-wrap">
                                        {(['ALL', 'ACTIVE', 'WAITLIST', 'INVITED'] as const).map((status) => (
                                            <Button
                                                key={status}
                                                variant={statusFilter === status ? 'default' : 'outline'}
                                                size="sm"
                                                onClick={() => setStatusFilter(status)}
                                                className="transition-all duration-200"
                                            >
                                                {status}
                                            </Button>
                                        ))}
                                    </div>
                                </div>

                                {/* Table */}
                                <div className="rounded-lg border border-border overflow-hidden">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-muted/30 hover:bg-muted/30">
                                                <TableHead className="w-[280px] cursor-pointer" onClick={() => handleSort('email')}>
                                                    <div className="flex items-center font-semibold">User {renderSortIcon('email')}</div>
                                                </TableHead>
                                                <TableHead className="cursor-pointer" onClick={() => handleSort('status')}>
                                                    <div className="flex items-center font-semibold">Status {renderSortIcon('status')}</div>
                                                </TableHead>
                                                <TableHead className="cursor-pointer" onClick={() => handleSort('tier')}>
                                                    <div className="flex items-center font-semibold">Tier {renderSortIcon('tier')}</div>
                                                </TableHead>
                                                <TableHead className="cursor-pointer" onClick={() => handleSort('created_at')}>
                                                    <div className="flex items-center font-semibold">Joined {renderSortIcon('created_at')}</div>
                                                </TableHead>
                                                <TableHead className="text-right font-semibold">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {loading ? (
                                                <LoadingSkeleton />
                                            ) : paginatedData.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={5} className="h-32 text-center">
                                                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                                            <Users size={40} className="opacity-20" />
                                                            <p>No users found</p>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                paginatedData.map((item) => (
                                                    <TableRow key={item.id} className="admin-table-row">
                                                        <TableCell>
                                                            <div className="flex items-center gap-3">
                                                                <div className="admin-user-avatar">
                                                                    {getInitials(item.email, item.nickname)}
                                                                </div>
                                                                <div className="flex flex-col">
                                                                    <span className="font-medium">{item.email}</span>
                                                                    {item.nickname && (
                                                                        <span className="text-xs text-muted-foreground">
                                                                            @{item.nickname}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            {getStatusBadge(item.status, item.role)}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Popover>
                                                                <PopoverTrigger asChild>
                                                                    <button className="tier-selector flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/50 transition-colors">
                                                                        {getTierBadge(item.tier)}
                                                                        <ChevronDown size={12} className="text-muted-foreground" />
                                                                    </button>
                                                                </PopoverTrigger>
                                                                <PopoverContent className="w-40 p-2" align="start">
                                                                    <div className="flex flex-col gap-1">
                                                                        <button
                                                                            onClick={() => item.id && handleUpdateTier(item.id, 'free')}
                                                                            disabled={!item.id}
                                                                            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors hover:bg-muted ${item.tier === 'free' ? 'bg-muted' : ''} ${!item.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                                        >
                                                                            <UserCircle size={14} className="text-zinc-400" />
                                                                            Free
                                                                        </button>
                                                                        <button
                                                                            onClick={() => item.id && handleUpdateTier(item.id, 'pro')}
                                                                            disabled={!item.id}
                                                                            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors hover:bg-muted ${item.tier === 'pro' ? 'bg-muted' : ''} ${!item.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                                        >
                                                                            <Sparkles size={14} className="text-purple-400" />
                                                                            Pro
                                                                        </button>
                                                                        <button
                                                                            onClick={() => item.id && handleUpdateTier(item.id, 'whale')}
                                                                            disabled={!item.id}
                                                                            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors hover:bg-muted ${item.tier === 'whale' ? 'bg-muted' : ''} ${!item.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                                        >
                                                                            <Crown size={14} className="text-amber-400" />
                                                                            Whale
                                                                        </button>
                                                                    </div>
                                                                </PopoverContent>
                                                            </Popover>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="flex flex-col">
                                                                <span className="text-sm">{getRelativeTime(item.created_at)}</span>
                                                                <span className="text-xs text-muted-foreground">
                                                                    {new Date(item.created_at).toLocaleDateString()}
                                                                </span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="flex justify-end gap-1">
                                                                {item.status === 'WAITLIST' && (
                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        className="h-8 gap-1 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                                                                        onClick={() => handleApprove(item.email)}
                                                                    >
                                                                        <CheckCircle size={14} />
                                                                        Approve
                                                                    </Button>
                                                                )}
                                                                
                                                                <Popover>
                                                                    <PopoverTrigger asChild>
                                                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                                                            <MoreHorizontal size={16} />
                                                                        </Button>
                                                                    </PopoverTrigger>
                                                                    <PopoverContent className="w-48 p-2" align="end">
                                                                        <div className="flex flex-col gap-1">
                                                                            <button
                                                                                onClick={() => openCreditModal(item)}
                                                                                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors hover:bg-muted w-full text-left"
                                                                            >
                                                                                <Gift size={14} className="text-amber-400" />
                                                                                Gift Credits
                                                                            </button>
                                                                            {item.status === 'ACTIVE' && (
                                                                                <button
                                                                                    onClick={() => handleRevoke(item)}
                                                                                    className="flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors hover:bg-destructive/10 w-full text-left text-destructive"
                                                                                >
                                                                                    <Ban size={14} />
                                                                                    Revoke Access
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    </PopoverContent>
                                                                </Popover>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>

                                {/* Pagination */}
                                {totalPages > 1 && (
                                    <div className="flex items-center justify-between mt-4">
                                        <p className="text-sm text-muted-foreground">
                                            Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, processedData.length)} of {processedData.length} users
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
                                            <div className="flex items-center gap-1">
                                                {[...Array(Math.min(5, totalPages))].map((_, i) => {
                                                    let pageNum: number;
                                                    if (totalPages <= 5) {
                                                        pageNum = i + 1;
                                                    } else if (currentPage <= 3) {
                                                        pageNum = i + 1;
                                                    } else if (currentPage >= totalPages - 2) {
                                                        pageNum = totalPages - 4 + i;
                                                    } else {
                                                        pageNum = currentPage - 2 + i;
                                                    }
                                                    return (
                                                        <Button
                                                            key={pageNum}
                                                            variant={currentPage === pageNum ? 'default' : 'outline'}
                                                            size="sm"
                                                            className="w-8 h-8 p-0"
                                                            onClick={() => setCurrentPage(pageNum)}
                                                        >
                                                            {pageNum}
                                                        </Button>
                                                    );
                                                })}
                                            </div>
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
                            </CardContent>
                        </Card>
                    </div>
                )}
            </main>

            <Dialog open={isCreditModalOpen} onOpenChange={setIsCreditModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Gift className="text-amber-400" size={20} />
                            Gift Credits
                        </DialogTitle>
                        <DialogDescription>
                            Send credits to {selectedUserForCredits?.email}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <label className="text-sm font-medium">Amount</label>
                            <Input
                                type="number"
                                min="1"
                                value={creditAmount}
                                onChange={(e) => setCreditAmount(parseInt(e.target.value) || 0)}
                            />
                        </div>
                        <div className="grid gap-2">
                            <label className="text-sm font-medium">Reason</label>
                            <Input
                                value={creditReason}
                                onChange={(e) => setCreditReason(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreditModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleGiftCredits} className="gap-2">
                            <Coins size={16} />
                            Send Gift
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
