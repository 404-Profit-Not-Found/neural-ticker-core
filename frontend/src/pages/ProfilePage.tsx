
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Header } from '../components/layout/Header';
import { api } from '../lib/api';
import { Settings, User, Save, Shield, Eye } from 'lucide-react';

export function ProfilePage() {
    const { user, refreshSession } = useAuth();
    const [nickname, setNickname] = useState('');
    const [viewMode, setViewMode] = useState('PRO');
    const [theme, setTheme] = useState('g100');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (user) {
            setNickname(user.nickname || '');
            setViewMode(user.view_mode || 'PRO');
            setTheme(user.theme || 'g100');
        }
    }, [user]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.patch('/users/me', {
                nickname,
                view_mode: viewMode,
                theme
            });
            await refreshSession(); // Refresh to get updated user data
        } catch (error) {
            console.error('Failed to update profile', error);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#09090b] text-[#fafafa] font-sans selection:bg-blue-500/30">
            <Header />

            <main className="max-w-4xl mx-auto p-6 space-y-8 animate-in fade-in duration-500">
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-16 h-16 rounded-full bg-[#18181b] flex items-center justify-center border border-[#27272a] overflow-hidden">
                        {user?.avatar ? (
                            <img src={user.avatar} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                            <User size={32} className="text-[#a1a1aa]" />
                        )}
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-[#a1a1aa]">
                           {nickname || user?.name || 'Trader'}
                        </h1>
                        <p className="text-[#a1a1aa]">{user?.email}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Public Profile Settings */}
                    <div className="bg-[#121214] border border-[#27272a] rounded-lg p-6 space-y-6">
                        <div className="flex items-center gap-2 mb-4">
                            <User className="text-blue-500" size={20} />
                            <h2 className="text-lg font-semibold">Identity</h2>
                        </div>
                        
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-[#a1a1aa]">Nickname</label>
                            <input
                                type="text"
                                value={nickname}
                                onChange={(e) => setNickname(e.target.value)}
                                className="w-full bg-[#09090b] border border-[#27272a] rounded-md px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
                                placeholder="Enter your nickname"
                            />
                            <p className="text-xs text-[#52525b]">Visible to other traders in rankings.</p>
                        </div>
                    </div>

                    {/* App Preferences */}
                    <div className="bg-[#121214] border border-[#27272a] rounded-lg p-6 space-y-6">
                        <div className="flex items-center gap-2 mb-4">
                            <Settings className="text-purple-500" size={20} />
                            <h2 className="text-lg font-semibold">Preferences</h2>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-[#a1a1aa]">View Mode</label>
                                <div className="grid grid-cols-2 gap-2 bg-[#09090b] p-1 rounded-md border border-[#27272a]">
                                    <button
                                        onClick={() => setViewMode('KISS')}
                                        className={`flex items-center justify-center gap-2 px-4 py-2 rounded-sm text-sm font-medium transition-all ${
                                            viewMode === 'KISS' 
                                                ? 'bg-[#27272a] text-white shadow-sm' 
                                                : 'text-[#52525b] hover:text-[#a1a1aa]'
                                        }`}
                                    >
                                        <Shield size={14} />
                                        KISS
                                    </button>
                                    <button
                                        onClick={() => setViewMode('PRO')}
                                        className={`flex items-center justify-center gap-2 px-4 py-2 rounded-sm text-sm font-medium transition-all ${
                                            viewMode === 'PRO' 
                                                ? 'bg-[#27272a] text-white shadow-sm' 
                                                : 'text-[#52525b] hover:text-[#a1a1aa]'
                                        }`}
                                    >
                                        <Eye size={14} />
                                        PRO
                                    </button>
                                </div>
                                <p className="text-xs text-[#52525b]">
                                    {viewMode === 'KISS' ? 'Keep It Super Simple: Simplified interface for clear signals.' : 'Professional: Full data density and advanced charts.'}
                                </p>
                            </div>

                             <div className="space-y-2">
                                <label className="text-sm font-medium text-[#a1a1aa]">Theme</label>
                                <select 
                                    value={theme}
                                    onChange={(e) => setTheme(e.target.value)}
                                    className="w-full bg-[#09090b] border border-[#27272a] rounded-md px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none appearance-none"
                                >
                                    <option value="g100">Carbon Gray 100 (Default)</option>
                                    <option value="g90">Carbon Gray 90</option>
                                    <option value="g10">Carbon Gray 10</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end pt-4">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 bg-white text-black px-6 py-2 rounded-md font-medium hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {saving ? (
                            <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"/>
                        ) : (
                            <Save size={18} />
                        )}
                        {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </main>
        </div>
    );
}

