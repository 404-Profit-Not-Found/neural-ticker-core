import { useEffect, useState, useMemo } from 'react';
import { AdminService } from '../services/adminService';
import { useAuth } from '../context/AuthContext';
import { Trash2, Plus, ShieldAlert, CheckCircle, Search, ChevronLeft, ChevronRight, ArrowUpDown, Shield } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { useNavigate } from 'react-router-dom';

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
            (document.getElementById('invite-dialog') as HTMLDialogElement)?.close();
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
        <div className="min-h-screen bg-background text-foreground transition-colors duration-300">
            <Header />

            <main className="container mx-auto px-4 py-8 max-w-7xl">
                {error && (
                    <div className="mb-6 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive flex items-center gap-2">
                        <ShieldAlert size={20} />
                        {error}
                    </div>
                )}

                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                    <div className="flex items-center gap-4">
                        <Shield className="w-10 h-10 text-blue-600 dark:text-blue-400" />
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">Access Management</h1>
                            <p className="text-muted-foreground mt-1">Manage users, invites, and waitlist applications</p>
                        </div>
                    </div>

                    <button
                        onClick={() => (document.getElementById('invite-dialog') as HTMLDialogElement)?.showModal()}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg flex items-center gap-2 transition-colors font-medium shadow-sm"
                    >
                        <Plus size={18} />
                        Invite User
                    </button>
                </div>

                {/* --- Filters & Search --- */}
                <div className="bg-card border border-border rounded-lg p-4 mb-6 flex flex-col md:flex-row gap-4 shadow-sm">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Search by email or name..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-background border border-input text-foreground text-sm rounded-lg block w-full pl-10 p-2.5 focus:ring-primary focus:border-primary placeholder:text-muted-foreground"
                        />
                    </div>
                    <div className="flex gap-2">
                        {(['ALL', 'ACTIVE', 'WAITLIST', 'INVITED'] as const).map(status => (
                            <button
                                key={status}
                                onClick={() => setStatusFilter(status)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${statusFilter === status
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
                                    }`}
                            >
                                {status.charAt(0) + status.slice(1).toLowerCase()}
                            </button>
                        ))}
                    </div>
                </div>

                {/* --- Table --- */}
                <div className="bg-card border border-border rounded-lg overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-border bg-muted/40">
                                    {[
                                        { label: 'User', key: 'email' },
                                        { label: 'Role', key: 'role' },
                                        { label: 'Status', key: 'status' },
                                        { label: 'Timestamp', key: 'created_at' },
                                        { label: 'Actions', key: 'actions' }
                                    ].map((head) => (
                                        <th
                                            key={head.key}
                                            onClick={() => head.key !== 'actions' && handleSort(head.key)}
                                            className={`p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider ${head.key !== 'actions' ? 'cursor-pointer hover:text-foreground' : ''}`}
                                        >
                                            <div className="flex items-center gap-1">
                                                {head.label}
                                                {head.key !== 'actions' && <ArrowUpDown className="w-3 h-3 opacity-50" />}
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {loading ? (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-muted-foreground animate-pulse">Loading identities...</td>
                                    </tr>
                                ) : paginatedData.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-muted-foreground">
                                            No users found matching your filters.
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedData.map((item) => {
                                        const isSelf = currentUser?.email === item.email;
                                        const isTargetAdmin = item.role === 'admin' || item.role === 'ADMIN';

                                        return (
                                            <tr key={item.email} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                                                <td className="p-4">
                                                    {item.full_name && <div className="font-medium text-foreground">{item.full_name}</div>}
                                                    <div className="text-xs text-muted-foreground font-mono">{item.email}</div>
                                                </td>
                                                <td className="p-4">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${item.role === 'admin' ? 'bg-purple-500/10 text-purple-500 border-purple-500/20' :
                                                        item.role === 'user' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                                                            'bg-zinc-500/10 text-zinc-500 border-zinc-500/20'
                                                        }`}>
                                                        {item.role || 'GUEST'}
                                                    </span>
                                                </td>
                                                <td className="p-4">
                                                    {item.status === 'ADMIN' && <span className="text-purple-500 flex items-center gap-1.5 text-xs font-medium"><ShieldAlert size={14} /> Admin</span>}
                                                    {item.status === 'ACTIVE' && <span className="text-emerald-500 flex items-center gap-1.5 text-xs font-medium"><CheckCircle size={14} /> Active</span>}
                                                    {item.status === 'WAITLIST' && <span className="text-orange-500 flex items-center gap-1.5 text-xs font-medium"><div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" /> Waitlist</span>}
                                                    {item.status === 'INVITED' && <span className="text-blue-500 flex items-center gap-1.5 text-xs font-medium"><div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Invited</span>}
                                                </td>
                                                <td className="p-4 text-xs text-muted-foreground font-mono whitespace-nowrap">
                                                    {new Date(item.created_at || item.invited_at || Date.now()).toLocaleString()}
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex items-center gap-2 justify-end">
                                                        {item.status === 'WAITLIST' && (
                                                            <button
                                                                onClick={() => handleApprove(item.email)}
                                                                className="flex items-center gap-1 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-3 py-1.5 rounded-md hover:bg-emerald-500/20 transition-colors text-xs font-medium mr-auto"
                                                                title="Approve & Whitelist"
                                                            >
                                                                <CheckCircle size={14} />
                                                                Approve
                                                            </button>
                                                        )}
                                                        {(item.status === 'ACTIVE' || item.status === 'ADMIN' || item.status === 'INVITED' || item.status === 'WAITLIST') && (
                                                            <button
                                                                onClick={() => handleRevoke(item)}
                                                                disabled={isSelf || isTargetAdmin}
                                                                title={isSelf ? "Cannot revoke self" : isTargetAdmin ? "Cannot revoke other admins" : item.status === 'WAITLIST' ? "Reject Application" : "Revoke Access"}
                                                                className={`p-2 rounded-md transition-colors ${isSelf || isTargetAdmin
                                                                    ? 'text-muted-foreground/30 cursor-not-allowed'
                                                                    : 'text-muted-foreground hover:text-destructive hover:bg-destructive/10'
                                                                    }`}
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* --- Pagination Controls --- */}
                    <div className="p-4 border-t border-border bg-card flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                            Showing {paginatedData.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} to {Math.min(currentPage * itemsPerPage, processedData.length)} of {processedData.length} users
                        </span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="p-1 rounded hover:bg-muted disabled:opacity-50 disabled:hover:bg-transparent text-muted-foreground"
                            >
                                <ChevronLeft size={16} />
                            </button>
                            <span className="text-xs text-muted-foreground flex items-center">Page {currentPage} of {totalPages || 1}</span>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages || totalPages === 0}
                                className="p-1 rounded hover:bg-muted disabled:opacity-50 disabled:hover:bg-transparent text-muted-foreground"
                            >
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            </main>

            {/* Invite Modal */}
            <dialog id="invite-dialog" className="bg-popover text-popover-foreground p-8 rounded-lg border border-border backdrop:bg-background/80 shadow-2xl w-full max-w-lg">
                <h3 className="text-xl font-bold mb-6">Invite New User</h3>
                <form onSubmit={handleAddEmail} method="dialog">
                    <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="Enter email address"
                        className="bg-background border border-input text-foreground text-sm rounded-lg block w-full p-2.5 mb-4 focus:ring-primary focus:border-primary placeholder:text-muted-foreground"
                        required
                    />
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => (document.getElementById('invite-dialog') as HTMLDialogElement)?.close()}
                            className="text-muted-foreground hover:text-foreground px-4 py-2 text-sm"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium"
                        >
                            Send Invite
                        </button>
                    </div>
                </form>
            </dialog>
        </div>
    );
}
