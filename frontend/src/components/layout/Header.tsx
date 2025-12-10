import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
    Bell,
    Settings,
    User as UserIcon
} from 'lucide-react';


export function Header() {
    const { user } = useAuth();

    return (
        <header className="h-14 border-b border-[#27272a] bg-[#09090b] flex items-center justify-between px-6 sticky top-0 z-50">
            {/* Left: Logo */}
            <div className="flex items-center gap-8">
                <span className="text-lg font-bold text-white tracking-tight">
                    neural-ticker.com
                </span>

                {/* Center: Navigation */}
                <nav className="flex items-center gap-6">
                    <Link
                        to="/"
                        className="text-sm font-medium text-white border-b-2 border-blue-500 h-14 flex items-center px-1"
                    >
                        Dashboard
                    </Link>
                    <Link
                        to="/portfolio"
                        className="text-sm font-medium text-[#a1a1aa] hover:text-white transition-colors"
                    >
                        My Portfolio
                    </Link>
                    <Link
                        to="/watchlist"
                        className="text-sm font-medium text-[#a1a1aa] hover:text-white transition-colors"
                    >
                        My Watchlist
                    </Link>
                    <Link
                        to="/analyzer"
                        className="text-sm font-medium text-[#a1a1aa] hover:text-white transition-colors"
                    >
                        Stock Analyzer
                    </Link>
                </nav>
            </div>

        <div className="flex items-center gap-4">
            <button className="text-[#a1a1aa] hover:text-white transition-colors relative">
                <Bell size={20} />
                <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>

            {/* Profile Dropdown */}
            <div className="relative group">
                <button className="flex items-center gap-2 text-[#a1a1aa] hover:text-white transition-colors">
                    {user?.avatar ? (
                        <img src={user.avatar} alt="Profile" className="w-8 h-8 rounded-full border border-[#27272a]" />
                    ) : (
                        <div className="w-8 h-8 rounded-full bg-[#18181b] flex items-center justify-center border border-[#27272a]">
                            <UserIcon size={16} />
                        </div>
                    )}
                </button>

                {/* Dropdown Menu */}
                <div className="absolute right-0 top-full mt-2 w-64 bg-[#18181b] border border-[#27272a] rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                    <div className="p-4 border-b border-[#27272a]">
                        <p className="font-semibold text-white">{user?.nickname || 'Trader'}</p>
                        <p className="text-xs text-[#a1a1aa]">{user?.email}</p>
                    </div>

                    <div className="p-2">
                        <Link to="/profile" className="flex items-center gap-3 px-3 py-2 text-sm text-[#a1a1aa] hover:text-white hover:bg-[#27272a] rounded-md transition-colors">
                            <UserIcon size={16} />
                            Your Profile
                        </Link>
                        <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-[#a1a1aa] hover:text-white hover:bg-[#27272a] rounded-md transition-colors">
                            <Settings size={16} />
                            Settings
                        </button>
                    </div>

                    <div className="p-2 border-t border-[#27272a]">
                        <button className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-[#27272a] rounded-md transition-colors">
                            Sign Out
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </header>
    );
}
