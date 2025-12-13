import { useEffect, useState, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Bell, Settings, User as UserIcon, Shield, Palette, Menu, X } from 'lucide-react';

export function Header() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === '/dashboard' && (location.pathname === '/' || location.pathname === '/dashboard')) return true;
    return location.pathname === path;
  };

  const linkClass = (path: string) =>
    `text-sm font-medium h-14 flex items-center px-1 transition-colors ${isActive(path)
      ? 'text-foreground border-b-2 border-primary'
      : 'text-muted-foreground hover:text-foreground border-b-2 border-transparent'
    }`;

  const mobileLinkClass = (path: string) =>
    `block px-4 py-3 text-base font-medium transition-colors rounded-md ${isActive(path)
      ? 'bg-primary/10 text-primary'
      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
    }`;

  const closeMenus = useCallback(() => {
    setProfileMenuOpen(false);
    setMobileMenuOpen(false);
  }, []);

  useEffect(() => {
    closeMenus();
  }, [location, location.pathname, closeMenus]);

  const goTo = (path: string) => {
    closeMenus();
    navigate(path);
  };

  return (
    <header className="h-14 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="container max-w-[80rem] mx-auto h-full flex items-center justify-between px-4">
        
        {/* Left: Mobile Menu Toggle & Logo */}
        <div className="flex items-center gap-4">
          <button 
            className="md:hidden text-muted-foreground hover:text-foreground"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          
          <Link to="/dashboard" className="text-lg font-bold text-foreground tracking-tight hover:opacity-80 transition-opacity">
            NeuralTicker.com
          </Link>
        </div>

        {/* Center: Desktop Nav */}
        <nav className="hidden md:flex items-center gap-8">
          <Link to="/watchlist" className={linkClass('/watchlist')}>
            Watchlist
          </Link>
          <Link to="/analyzer" className={linkClass('/analyzer')}>
            Tickers
          </Link>
        </nav>

        {/* Right: alerts + profile */}
        <div className="flex items-center gap-4">
          <button className="text-muted-foreground hover:text-foreground transition-colors relative">
            <Bell size={20} />
            <span className="absolute top-0 right-0 w-2 h-2 bg-destructive rounded-full" />
          </button>

          <div className="relative">
            <button
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setProfileMenuOpen((open) => !open)}
              aria-expanded={profileMenuOpen}
              aria-haspopup="menu"
              type="button"
              aria-label="User menu"
            >
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt="Profile"
                  className="w-8 h-8 rounded-full border border-border"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center border border-border">
                  <UserIcon size={16} />
                </div>
              )}
            </button>

            {/* Profile Dropdown */}
            <div
              className={`absolute right-0 top-full mt-2 w-64 bg-card border border-border rounded-lg shadow-xl transition-all duration-200 z-50 ${profileMenuOpen ? 'opacity-100 visible translate-y-0' : 'opacity-0 invisible -translate-y-1 pointer-events-none'
                }`}
            >
              <div className="p-4 border-b border-border">
                <p className="font-semibold text-foreground">
                  {user?.nickname || 'Trader'}
                </p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>

              <div className="p-2">
                <button
                  type="button"
                  onClick={() => goTo('/profile')}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors"
                >
                  <UserIcon size={16} />
                  Your Profile
                </button>
                {user && user.role === 'admin' && (
                  <button
                    type="button"
                    onClick={() => goTo('/admin')}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-purple-500 hover:text-purple-400 hover:bg-muted/50 rounded-md transition-colors"
                  >
                    <Shield size={16} />
                    Admin Console
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => goTo('/settings/style')}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors"
                >
                  <Settings size={16} />
                  Settings
                </button>
                <button
                  type="button"
                  onClick={() => goTo('/settings/style')}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors"
                >
                  <Palette size={16} />
                  Style Guide
                </button>
              </div>

              <div className="p-2 border-t border-border">
                <button
                  onClick={() => logout()}
                  className="w-full text-left px-3 py-2 text-xs text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-14 left-0 w-full bg-background border-b border-border shadow-2xl p-4 flex flex-col gap-2 animate-in slide-in-from-top-2">
          <Link to="/watchlist" className={mobileLinkClass('/watchlist')}>
            Watchlist
          </Link>
          <Link to="/analyzer" className={mobileLinkClass('/analyzer')}>
            Tickers
          </Link>
          <div className="h-px bg-border my-2" />
           <button
             type="button"
            onClick={() => goTo('/profile')}
            className="w-full flex items-center gap-3 px-4 py-3 text-base text-left text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
          >
            <UserIcon size={18} />
            Your Profile
          </button>
        </div>
      )}
    </header >
  );
}
