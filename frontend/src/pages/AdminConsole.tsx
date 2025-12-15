import { useEffect, useState, useMemo, useCallback } from 'react';
import { AdminService } from '../services/adminService';
import { useAuth } from '../context/AuthContext';
import { Trash2, Plus, ShieldAlert, CheckCircle, Search, ChevronLeft, ChevronRight, ArrowUpDown, Shield, User, Coins, TrendingUp } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '../components/ui/table';

type SortConfig = {
    key: string;
    direction: 'asc' | 'desc';
};

export function AdminConsole() {
    const { user: currentUser } = useAuth();
    const navigate = useNavigate();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [identities, setIdentities] = useState<any[]>([]);
    const [newEmail, setNewEmail] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isInviteOpen, setIsInviteOpen] = useState(false);
    const [isCreditModalOpen, setIsCreditModalOpen] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [selectedUserForCredits, setSelectedUserForCredits] = useState<any | null>(null);
    const [creditAmount, setCreditAmount] = useState(1);
    const [creditReason, setCreditReason] = useState('Admin Gift');

    // Redirect non-admin users immediately
    useEffect(() => {
        if (currentUser && currentUser.role !== 'admin') {
            navigate('/access-denied', { replace: true });
        }
    }, [currentUser, navigate]);

    // Table State
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'WAITLIST' | 'INVITED'>('ALL');
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'created_at', direction: 'desc' });
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

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
        void loadData();
    }, [loadData]);

    const handleAddEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newEmail) return;
        try {
            await AdminService.addToUserlist(newEmail);
            setNewEmail('');
            await loadData();
            setIsInviteOpen(false);
        } catch (err: unknown) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            alert((err as any).response?.data?.message || 'Failed to add email');
        }
    };

    const handleRevoke = async (item: { email: string; status: string }) => {
        const isWaitlist = item.status === 'WAITLIST';
        const message = isWaitlist
            ? `Are you sure you want to REJECT ${item.email}? They will be removed from the database.`
            : `Are you sure you want to REVOKE access for ${item.email}?`;

        if (!globalThis.confirm(message)) return;

        try {
            if (isWaitlist) {
                await AdminService.rejectWaitlistUser(item.email);
            } else {
                await AdminService.revokeAccess(item.email);
            }
            await loadData();
        } catch (err: unknown) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            alert((err as any).response?.data?.message || 'Failed to perform action');
        }
    };

    const handleApprove = async (email: string) => {
        try {
            await AdminService.addToUserlist(email); // Add to allowed list
            await loadData();
        } catch (err: unknown) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            alert((err as any).response?.data?.message || 'Failed to approve user');
        }
    };

    const handleUpdateTier = async (userId: string, tier: 'free' | 'pro' | 'admin') => {
        if (!globalThis.confirm(`Are you sure you want to change user tier to ${tier}?`)) return;
        try {
            // Assuming 'newTier' was meant to be 'tier' and 'adminService' was a typo for 'AdminService'
            // Also, the instruction implies restricting the tier value to 'free' or 'pro' for the service call.
            // If 'tier' is 'admin', this cast will allow it but the service might reject it.
            // For strict 'free' | 'pro', a runtime check would be needed, but the instruction only provides a type cast.
            await AdminService.updateTier(userId, tier as 'free' | 'pro');
            setIdentities(identities.map(u => u.id === userId ? { ...u, tier: tier as 'free' | 'pro' } : u));
        } catch (err: unknown) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            alert((err as any).response?.data?.message || 'Failed to update tier');
        }
    };

    const handleGiftCredits = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedUserForCredits) return;
        try {
            await AdminService.giftCredits(selectedUserForCredits.id, Number(creditAmount), creditReason);
            setIsCreditModalOpen(false);
            setCreditAmount(1);
            await loadData();
        } catch (err: unknown) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            alert((err as any).response?.data?.message || 'Failed to gift credits');
        }
    };

    const openCreditModal = (user: any) => {
        setSelectedUserForCredits(user);
        setIsCreditModalOpen(true);
    };

    // --- Data Processing Pipeline ---
    const processedData = useMemo(() => {
        let filtered = [...identities];

        // 1. Search Filter
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            filtered = filtered.filter(item =>
                item.email.toLowerCase().includes(lower) ||
                (item.full_name && item.full_name.toLowerCase().includes(lower))
            );
        }

        // 2. Status Filter
        if (statusFilter !== 'ALL') {
            filtered = filtered.filter(item => {
                if (statusFilter === 'ACTIVE') return item.status === 'ACTIVE' || item.status === 'ADMIN';
                return item.status === statusFilter;
            });
        }

        // 3. Sorting
        filtered.sort((a, b) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const aVal = (a as any)[sortConfig.key];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const bVal = (b as any)[sortConfig.key];

            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return filtered;
    }, [identities, searchTerm, statusFilter, sortConfig]);

    // 4. Pagination
    const totalPages = Math.ceil(processedData.length / itemsPerPage);
    const paginatedData = processedData.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const handleSort = (key: string) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc'
        }));
    };

    return (
        <div className="min-h-screen bg-background text-foreground transition-colors duration-300 font-sans">
            <Header />

            <main className="container mx-auto px-4 py-8 max-w-7xl animate-in fade-in duration-500">
                {error && (
                    <div className="mb-6 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive flex items-center gap-2">
                        <ShieldAlert size={20} />
                        {error}
                    </div>
                )}

                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-primary/10 rounded-full">
                            <Shield className="w-8 h-8 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight">Access Management</h1>
                            <p className="text-muted-foreground mt-1">Manage users, invites, and permissions</p>
                        </div>
                    </div>

                    <Button
                        onClick={() => setIsInviteOpen(true)}
                        className="gap-2"
                    >
                        <Plus size={18} />
                        Invite User
                    </Button>
                </div>

                <Card>
                    <CardHeader className="pb-3">
                        <div className="flex flex-col md:flex-row gap-4 justify-between md:items-center">
                            <CardTitle>Users Directory</CardTitle>

                            <div className="flex flex-col md:flex-row gap-3 md:items-center">
                                {/* Search */}
                                <div className="relative w-full md:w-64">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                                    <Input
                                        type="text"
                                        placeholder="Search users..."
                                        value={searchTerm}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                                        className="pl-9 h-9"
                                    />
                                </div>

                                {/* Status Filter */}
                                <div className="flex p-1 bg-muted rounded-md border border-border">
                                    {(['ALL', 'ACTIVE', 'WAITLIST', 'INVITED'] as const).map(status => (
                                        <button
                                            key={status}
                                            onClick={() => setStatusFilter(status)}
                                            className={`px-3 py-1 text-xs font-medium rounded-sm transition-all ${statusFilter === status
                                                ? 'bg-background text-foreground shadow-sm'
                                                : 'text-muted-foreground hover:text-foreground'
                                                }`}
                                        >
                                            {status.charAt(0) + status.slice(1).toLowerCase()}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="hidden md:block">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent">
                                        {[
                                            { label: 'User', key: 'email' },
                                            { label: 'Role', key: 'role' },
                                            { label: 'Tier', key: 'tier' },
                                            { label: 'Credits', key: 'credits_balance' },
                                            { label: 'Status', key: 'status' },
                                            { label: 'Timestamp', key: 'created_at' },
                                            { label: 'Actions', key: 'actions' }
                                        ].map((head) => (
                                            <TableHead
                                                key={head.key}
                                                onClick={() => head.key !== 'actions' && handleSort(head.key)}
                                                className={`${head.key !== 'actions' ? 'cursor-pointer hover:text-primary transition-colors' : ''}`}
                                            >
                                                <div className="flex items-center gap-1">
                                                    {head.label}
                                                    {head.key !== 'actions' && <ArrowUpDown className="w-3 h-3 opacity-50" />}
                                                </div>
                                            </TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-24 text-center">
                                                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                                                    <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                                                    Loading directory...
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : paginatedData.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                                No users found matching filters.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        paginatedData.map((item) => {
                                            const isSelf = currentUser?.email === item.email;
                                            const isTargetAdmin = item.role === 'admin' || item.role === 'ADMIN';

                                            return (
                                                <TableRow key={item.email}>
                                                    <TableCell>
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                                                                <User size={14} />
                                                            </div>
                                                            <div>
                                                                {item.full_name && <div className="font-medium">{item.full_name}</div>}
                                                                <div className="text-xs text-muted-foreground font-mono">{item.email}</div>
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className={item.role === 'admin' ? 'border-amber-400 text-amber-400 lowercase' : 'border-emerald-500 text-emerald-500 lowercase'}>
                                                            {(item.role || 'guest').toLowerCase()}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className={item.tier === 'pro' ? 'border-purple-500 text-purple-500 uppercase' : 'border-emerald-500 text-emerald-500 uppercase'}>
                                                            {(item.tier || 'free').toUpperCase()}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="font-mono text-sm">
                                                        {item.credits_balance || 0}
                                                    </TableCell>

                                                    <TableCell>
                                                        {item.status === 'ADMIN' && <div className="flex items-center gap-1.5 text-xs text-purple-500 font-medium"><ShieldAlert size={14} /> Admin</div>}
                                                        {item.status === 'ACTIVE' && <div className="flex items-center gap-1.5 text-xs text-emerald-500 font-medium"><CheckCircle size={14} /> Active</div>}
                                                        {item.status === 'WAITLIST' && <div className="flex items-center gap-1.5 text-xs text-orange-500 font-medium"><div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" /> Waitlist</div>}
                                                        {item.status === 'INVITED' && <div className="flex items-center gap-1.5 text-xs text-blue-500 font-medium"><div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Invited</div>}
                                                    </TableCell>
                                                    <TableCell className="text-xs text-muted-foreground font-mono">
                                                        {new Date(item.created_at || item.invited_at || Date.now()).toLocaleDateString()}
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2 justify-end">
                                                            {item.status === 'WAITLIST' && (
                                                                <Button
                                                                    onClick={() => handleApprove(item.email)}
                                                                    size="sm"
                                                                    variant="outline"
                                                                    className="h-8 border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-600"
                                                                >
                                                                    <CheckCircle size={14} className="mr-1.5" />
                                                                    Approve
                                                                </Button>
                                                            )}
                                                            {(item.status === 'ACTIVE' || item.status === 'ADMIN' || item.status === 'INVITED' || item.status === 'WAITLIST') && (
                                                                <Button
                                                                    onClick={() => handleRevoke(item)}
                                                                    disabled={isSelf || isTargetAdmin}
                                                                    size="icon"
                                                                    variant="ghost"
                                                                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                                                    title="Revoke Access"
                                                                >
                                                                    <Trash2 size={16} />
                                                                </Button>
                                                            )}
                                                            {(item.status === 'ACTIVE' || item.status === 'ADMIN') && (
                                                                <>
                                                                    <Button
                                                                        onClick={() => handleUpdateTier(item.id, item.tier === 'pro' ? 'free' : 'pro')}
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        className="h-8 w-8 text-purple-500 hover:bg-purple-500/10"
                                                                        title={item.tier === 'pro' ? 'Downgrade to Free' : 'Upgrade to Pro'}
                                                                    >
                                                                        <TrendingUp size={16} />
                                                                    </Button>
                                                                    <Button
                                                                        onClick={() => openCreditModal(item)}
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        className="h-8 w-8 text-yellow-500 hover:bg-yellow-500/10"
                                                                        title="Gift Credits"
                                                                    >
                                                                        <Coins size={16} />
                                                                    </Button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </div>

                        {/* Mobile Tile View */}
                        <div className="grid grid-cols-1 gap-3 p-4 md:hidden">
                            {loading ? (
                                <div className="text-center py-8 text-muted-foreground text-sm">Loading users...</div>
                            ) : paginatedData.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground text-sm">No users found.</div>
                            ) : (
                                paginatedData.map((item) => {
                                    const isSelf = currentUser?.email === item.email;
                                    const isTargetAdmin = item.role === 'admin' || item.role === 'ADMIN';

                                    return (
                                        <div key={item.email} className="bg-card border border-border rounded-lg p-3 shadow-sm space-y-3">
                                            {/* Header: User Info & Role */}
                                            <div className="flex items-start justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground bg-primary/5 text-primary">
                                                        <User size={18} />
                                                    </div>
                                                    <div>
                                                        <div className="font-semibold text-sm">{item.full_name || 'Unknown User'}</div>
                                                        <div className="text-xs text-muted-foreground font-mono">{item.email}</div>
                                                    </div>
                                                </div>
                                                <Badge variant="outline" className={`lowercase text-[10px] h-5 ${item.role === 'admin' ? 'border-amber-400 text-amber-400' : 'border-emerald-500 text-emerald-500'}`}>
                                                    {(item.role || 'guest').toLowerCase()}
                                                </Badge>
                                            </div>

                                            <div className="h-px bg-border/50" />

                                            {/* Details Grid */}
                                            <div className="grid grid-cols-2 gap-2 text-xs">
                                                <div>
                                                    <span className="text-muted-foreground block mb-1">Status</span>
                                                    {item.status === 'ADMIN' && <div className="flex items-center gap-1.5 text-purple-500 font-medium"><ShieldAlert size={12} /> Admin</div>}
                                                    {item.status === 'ACTIVE' && <div className="flex items-center gap-1.5 text-emerald-500 font-medium"><CheckCircle size={12} /> Active</div>}
                                                    {item.status === 'WAITLIST' && <div className="flex items-center gap-1.5 text-orange-500 font-medium"><div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" /> Waitlist</div>}
                                                    {item.status === 'INVITED' && <div className="flex items-center gap-1.5 text-blue-500 font-medium"><div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Invited</div>}
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-muted-foreground block mb-1">Joined</span>
                                                    <span className="font-mono">{new Date(item.created_at || item.invited_at || Date.now()).toLocaleDateString()}</span>
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            {(item.status === 'WAITLIST' || !isTargetAdmin) && (
                                                <div className="flex items-center justify-end gap-2 pt-1">
                                                    {item.status === 'WAITLIST' && (
                                                        <Button
                                                            onClick={() => handleApprove(item.email)}
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-7 text-xs border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-600 w-full"
                                                        >
                                                            <CheckCircle size={12} className="mr-1.5" />
                                                            Approve Request
                                                        </Button>
                                                    )}
                                                    {(item.status === 'ACTIVE' || item.status === 'INVITED' || item.status === 'WAITLIST' || item.status === 'ADMIN') && !isSelf && !isTargetAdmin && (
                                                        <Button
                                                            onClick={() => handleRevoke(item)}
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-7 text-xs border-red-500/20 text-red-500 hover:bg-red-500/10 hover:text-red-600 w-full"
                                                        >
                                                            <Trash2 size={12} className="mr-1.5" />
                                                            Revoke
                                                        </Button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </CardContent>

                    {/* Pagination */}
                    <div className="p-4 border-t border-border flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                            Showing {paginatedData.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} to {Math.min(currentPage * itemsPerPage, processedData.length)} of {processedData.length} users
                        </span>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                            >
                                <ChevronLeft size={16} />
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages || totalPages === 0}
                            >
                                <ChevronRight size={16} />
                            </Button>
                        </div>
                    </div>
                </Card>
            </main>

            {/* Invite Dialog */}
            <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
                <div className="flex flex-col gap-4">
                    <DialogHeader>
                        <DialogTitle>Invite New User</DialogTitle>
                        <DialogDescription>
                            Send an invitation email to add a new user.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleAddEmail} className="flex flex-col gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Email Address</label>
                            <Input
                                type="email"
                                value={newEmail}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewEmail(e.target.value)}
                                placeholder="colleague@example.com"
                                required
                            />
                        </div>

                        <div className="flex justify-end gap-3 mt-2">
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => setIsInviteOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button type="submit">
                                Send Invitation
                            </Button>
                        </div>
                    </form>
                </div>
            </Dialog>

            {/* Credit Gift Modal */}
            <Dialog open={isCreditModalOpen} onOpenChange={setIsCreditModalOpen}>
                <div className="flex flex-col gap-4">
                    <DialogHeader>
                        <DialogTitle>Gift Credits</DialogTitle>
                        <DialogDescription>
                            Grant credits to {selectedUserForCredits?.email}.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleGiftCredits} className="flex flex-col gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Amount</label>
                            <Input
                                type="number"
                                min="1"
                                value={creditAmount}
                                onChange={(e) => setCreditAmount(Number(e.target.value))}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Reason</label>
                            <Input
                                type="text"
                                value={creditReason}
                                onChange={(e) => setCreditReason(e.target.value)}
                                placeholder="Bonus, Refund, etc."
                                required
                            />
                        </div>

                        <div className="flex justify-end gap-3 mt-2">
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => setIsCreditModalOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button type="submit">
                                Gift Credits
                            </Button>
                        </div>
                    </form>
                </div>
            </Dialog>
        </div>
    );
}
