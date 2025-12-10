import { useEffect, useState } from 'react';
import { AdminService, type User, type AllowedUser } from '../services/adminService';
import { Trash2, Plus, ShieldAlert, CheckCircle, XCircle } from 'lucide-react';
import { Header } from '../components/layout/Header';

export function AdminConsole() {
    const [activeTab, setActiveTab] = useState<'users' | 'userlist'>('userlist');
    const [users, setUsers] = useState<User[]>([]);
    const [userlist, setUserlist] = useState<AllowedUser[]>([]);
    const [newEmail, setNewEmail] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            if (activeTab === 'users') {
                const data = await AdminService.getUsers();
                setUsers(data);
            } else {
                const data = await AdminService.getUserlist();
                setUserlist(data);
            }
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to load data');
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
        } catch (err: any) {
            alert(err.response?.data?.message || 'Failed to add email');
        }
    };

    const handleRevoke = async (email: string) => {
        if (!globalThis.confirm('Are you sure you want to revoke access for ' + email + '?')) return;
        try {
            await AdminService.revokeAccess(email);
            await loadData();
        } catch (err: any) {
            alert(err.response?.data?.message || 'Failed to revoke access');
        }
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return 'Never';
        return new Date(dateString).toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZoneName: 'short'
        });
    };

    return (
        <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30">
            <Header />
            <main className="max-w-[100rem] mx-auto p-6 space-y-8 animate-in fade-in duration-500">
                <header className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold flex items-center gap-3">
                            <ShieldAlert className="text-red-500" size={32} />
                            Admin Console
                        </h1>
                        <p className="text-[#a1a1aa] mt-2">Manage user access and platform security.</p>
                    </div>
                    <div className="bg-[#18181b] p-2 rounded-lg border border-[#27272a] flex gap-2">
                        <button
                            onClick={() => setActiveTab('userlist')}
                            className={'px-4 py-2 rounded-md text-sm font-medium transition-colors ' + (activeTab === 'userlist' ? 'bg-blue-600 text-white' : 'text-[#a1a1aa] hover:text-white')}
                        >
                            Access Userlist
                        </button>
                        <button
                            onClick={() => setActiveTab('users')}
                            className={'px-4 py-2 rounded-md text-sm font-medium transition-colors ' + (activeTab === 'users' ? 'bg-blue-600 text-white' : 'text-[#a1a1aa] hover:text-white')}
                        >
                            Registered Users
                        </button>
                    </div>
                </header>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-lg flex items-center gap-2">
                        <XCircle size={20} />
                        {error}
                    </div>
                )}

                {loading ? (
                    <div className="text-center py-12 text-[#a1a1aa]">Loading data...</div>
                ) : (
                    <div className="bg-[#18181b] border border-[#27272a] rounded-xl overflow-hidden">
                        {activeTab === 'userlist' ? (
                            <div className="p-6 space-y-6">
                                <form onSubmit={handleAddEmail} className="flex gap-4 items-end">
                                    <div className="flex-1">
                                        <label className="block text-sm font-medium text-[#a1a1aa] mb-2">Add Email to Userlist</label>
                                        <input
                                            type="email"
                                            value={newEmail}
                                            onChange={(e) => setNewEmail(e.target.value)}
                                            placeholder="user@example.com"
                                            className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500"
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        className="bg-green-600 hover:bg-green-700 text-white px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors"
                                    >
                                        <Plus size={18} />
                                        Add User
                                    </button>
                                </form>

                                <div className="border-t border-[#27272a] pt-6">
                                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                        <CheckCircle size={20} className="text-green-500" />
                                        Allowed Users ({userlist.length})
                                    </h3>
                                    <div className="space-y-2">
                                        {userlist.map((item) => (
                                            <div key={item.id} className="flex items-center justify-between p-4 bg-[#09090b] rounded-lg border border-[#27272a]">
                                                <div>
                                                    <p className="font-medium text-white">{item.email}</p>
                                                    <p className="text-xs text-[#52525b]">Added by {item.added_by} on {formatDate(item.created_at)}</p>
                                                </div>
                                                <button
                                                    onClick={() => handleRevoke(item.email)}
                                                    className="text-[#a1a1aa] hover:text-red-500 transition-colors p-2 hover:bg-red-500/10 rounded-md"
                                                    title="Revoke Access"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <table className="w-full text-left">
                                <thead className="bg-[#09090b] border-b border-[#27272a]">
                                    <tr>
                                        <th className="p-4 text-sm font-medium text-[#a1a1aa]">User</th>
                                        <th className="p-4 text-sm font-medium text-[#a1a1aa]">Role</th>
                                        <th className="p-4 text-sm font-medium text-[#a1a1aa]">Joined</th>
                                        <th className="p-4 text-sm font-medium text-[#a1a1aa]">Last Login</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#27272a]">
                                    {users.map((u) => (
                                        <tr key={u.id} className="hover:bg-[#27272a]/30 transition-colors">
                                            <td className="p-4">
                                                <div className="font-medium text-white">{u.full_name || 'Unknown'}</div>
                                                <div className="text-xs text-[#a1a1aa]">{u.email}</div>
                                            </td>
                                            <td className="p-4">
                                                <span className={'text-xs px-2 py-1 rounded-full border ' + (u.role === 'admin' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20')}>
                                                    {u.role.toUpperCase()}
                                                </span>
                                            </td>
                                            <td className="p-4 text-sm text-[#a1a1aa]">
                                                {formatDate(u.created_at)}
                                            </td>
                                            <td className="p-4 text-sm text-[#a1a1aa]">
                                                {formatDate(u.last_login)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
