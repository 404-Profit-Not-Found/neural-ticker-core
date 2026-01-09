import { useEffect, useState, useCallback, useMemo } from 'react';
import { LogoManager } from '../components/admin/LogoManager';
import { AdminService } from '../services/adminService';
import { useAuth } from '../context/AuthContext';
import { Trash2, Plus, CheckCircle, Search, ChevronLeft, ArrowUpDown, Shield, User, Coins, TrendingUp, EyeOff, Users, Image as ImageIcon } from 'lucide-react';
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

type SortConfig = {
    key: string;
    direction: 'asc' | 'desc';
};

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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
             // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const aVal = a[sortConfig.key];
             // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const bVal = b[sortConfig.key];

            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [identities, searchTerm, statusFilter, sortConfig]);

    // Pagination
    const totalPages = Math.ceil(processedData.length / itemsPerPage);
    const paginatedData = processedData.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const renderSortIcon = (key: string) => {
        if (sortConfig.key !== key) return <ArrowUpDown size={14} className="ml-1 text-muted-foreground" />;
        return sortConfig.direction === 'asc' ? (
            <ChevronLeft size={14} className="ml-1 rotate-90" />
        ) : (
            <ChevronLeft size={14} className="ml-1 -rotate-90" />
        );
    };

    return (
        <div className="flex flex-col min-h-screen bg-background">
            <Header />
            <main className="flex-1 container mx-auto p-4 md:p-8 pt-24">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">
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
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="text-xl flex items-center gap-2">
                                <Shield className="text-primary" size={20} />
                                User Management
                            </CardTitle>
                             <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
                                <DialogTrigger asChild>
                                    <Button>
                                        <Plus size={16} className="mr-2" />
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
                                <div className="relative w-full md:w-64">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search email..."
                                        className="pl-9"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </div>
                                <div className="flex gap-2">
                                    {(['ALL', 'ACTIVE', 'WAITLIST', 'INVITED'] as const).map((status) => (
                                        <Button
                                            key={status}
                                            variant={statusFilter === status ? 'default' : 'outline'}
                                            size="sm"
                                            onClick={() => setStatusFilter(status)}
                                        >
                                            {status}
                                        </Button>
                                    ))}
                                </div>
                            </div>

                            {/* Table */}
                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[200px] cursor-pointer" onClick={() => handleSort('email')}>
                                                <div className="flex items-center">Email {renderSortIcon('email')}</div>
                                            </TableHead>
                                            <TableHead className="cursor-pointer" onClick={() => handleSort('status')}>
                                                <div className="flex items-center">Status {renderSortIcon('status')}</div>
                                            </TableHead>
                                            <TableHead className="cursor-pointer" onClick={() => handleSort('tier')}>
                                                <div className="flex items-center">Tier {renderSortIcon('tier')}</div>
                                            </TableHead>
                                            <TableHead className="cursor-pointer" onClick={() => handleSort('created_at')}>
                                                <div className="flex items-center">Joined {renderSortIcon('created_at')}</div>
                                            </TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {loading ? (
                                            <TableRow>
                                                <TableCell colSpan={5} className="h-24 text-center">
                                                    Loading...
                                                </TableCell>
                                            </TableRow>
                                        ) : paginatedData.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={5} className="h-24 text-center">
                                                    No users found.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            paginatedData.map((item) => (
                                                <TableRow key={item.id}>
                                                    <TableCell className="font-medium">
                                                        <div className="flex flex-col">
                                                            <span>{item.email}</span>
                                                            {item.nickname && (
                                                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                                    <User size={10} /> {item.nickname}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant={
                                                            item.status === 'ACTIVE' ? 'default' :
                                                            item.status === 'INVITED' ? 'secondary' : 'outline'
                                                        }>
                                                            {item.status}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2">
                                                            <Badge variant="outline" className="capitalize">
                                                                {item.tier}
                                                            </Badge>
                                                            {currentUser?.role === 'admin' && (
                                                                <div className="flex gap-1">
                                                                    <Button 
                                                                        variant="ghost" 
                                                                        size="icon" 
                                                                        className="h-6 w-6"
                                                                        onClick={() => handleUpdateTier(item.id, 'free')}
                                                                        title="Set Free"
                                                                    >
                                                                        <span className="text-xs">F</span>
                                                                    </Button>
                                                                    <Button 
                                                                        variant="ghost" 
                                                                        size="icon" 
                                                                        className="h-6 w-6"
                                                                        onClick={() => handleUpdateTier(item.id, 'pro')}
                                                                        title="Set Pro"
                                                                    >
                                                                        <TrendingUp size={12} className="text-green-500" />
                                                                    </Button>
                                                                    <Button 
                                                                        variant="ghost" 
                                                                        size="icon" 
                                                                        className="h-6 w-6"
                                                                        onClick={() => handleUpdateTier(item.id, 'whale')}
                                                                        title="Set Whale"
                                                                    >
                                                                        <Coins size={12} className="text-amber-500" />
                                                                    </Button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        {new Date(item.created_at).toLocaleDateString()}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex justify-end gap-2">
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => openCreditModal(item)}
                                                                title="Gift Credits"
                                                            >
                                                                <Coins size={16} />
                                                            </Button>

                                                            {item.status === 'WAITLIST' && (
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="h-8"
                                                                    onClick={() => handleApprove(item.email)}
                                                                >
                                                                    <CheckCircle size={14} className="mr-1" />
                                                                    Approve
                                                                </Button>
                                                            )}
                                                            {item.status === 'ACTIVE' && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                                    onClick={() => handleRevoke(item.email)}
                                                                >
                                                                    <Trash2 size={16} />
                                                                </Button>
                                                            )}
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
                                <div className="flex justify-center mt-4 gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={currentPage === 1}
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    >
                                        Previous
                                    </Button>
                                    <span className="flex items-center text-sm text-muted-foreground px-2">
                                        Page {currentPage} of {totalPages}
                                    </span>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={currentPage === totalPages}
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    >
                                        Next
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}
            </main>

            <Dialog open={isCreditModalOpen} onOpenChange={setIsCreditModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Gift Credits</DialogTitle>
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
                        <Button onClick={handleGiftCredits}>Send Gift</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
