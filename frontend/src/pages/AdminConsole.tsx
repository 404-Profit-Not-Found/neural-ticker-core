import { useEffect, useState, useMemo } from 'react';
import { AdminService } from '../services/adminService';
import { useAuth } from '../context/AuthContext';
import { Trash2, Plus, ShieldAlert, CheckCircle, Search, ChevronLeft, ChevronRight, ArrowUpDown, Shield, User } from 'lucide-react';
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

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
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
    };

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
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                    {[
                                        { label: 'User', key: 'email' },
                                        { label: 'Role', key: 'role' },
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
                                                    <Badge variant={item.role === 'admin' ? 'default' : 'secondary'} className="uppercase text-[10px]">
                                                        {item.role || 'GUEST'}
                                                    </Badge>
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
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
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
        </div>
    );
}
