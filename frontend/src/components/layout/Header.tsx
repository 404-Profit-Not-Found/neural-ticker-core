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

            {/* Right: Actions */}
            <div className="flex items-center gap-4">
                <button className="text-[#a1a1aa] hover:text-white transition-colors">
                    <Bell size={20} />
                </button>
                <button className="text-[#a1a1aa] hover:text-white transition-colors">
                    <Settings size={20} />
                </button>
                <button className="text-[#a1a1aa] hover:text-white transition-colors">
                    {user?.avatar ? (
                        <img src={user.avatar} alt="Profile" className="w-8 h-8 rounded-full border border-[#27272a]" />
                    ) : (
                        <div className="w-8 h-8 rounded-full bg-[#18181b] flex items-center justify-center border border-[#27272a]">
                            <UserIcon size={16} />
                        </div>
                    )}
                </button>
            </div>
        </header>
    );
}
