import { useEffect, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Bell, User as UserIcon, Shield, Menu, X } from 'lucide-react';
import { api } from '../../lib/api';
import { GlobalSearch } from './GlobalSearch';

interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  data: Record<string, unknown> | null;
  created_at: string;
}


// React Query for smart polling
function useUnreadNotifications(isAuthenticated: boolean) {
  const { data: unreadCount, refetch } = useQuery({
    queryKey: ['notifications', 'count'],
    queryFn: async () => {
      const { data } = await api.get('/notifications/count');
      return data.count || 0;
    },
    enabled: isAuthenticated,
    refetchInterval: 120000, // Poll every 2 minutes
    staleTime: 60000, // Consider fresh for 60s
    refetchOnWindowFocus: false, // Disable focus refetching to reduce noise
    refetchOnMount: false, // Don't refetch on component remount if data is fresh
  });

  return { unreadCount: unreadCount || 0, check: refetch };
}

export function Header() {
  const { user, logout } = useAuth();
  // const isAuthenticated = !!user; // Unused
  const location = useLocation();
  const navigate = useNavigate();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [notificationsMenuOpen, setNotificationsMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const { unreadCount, check: refreshNotifications } = useUnreadNotifications(!!user);

  const fetchNotifications = useCallback(async () => {
    try {
      const { data } = await api.get<Notification[]>('/notifications');
      setNotifications(data);
    } catch (e) {
      console.error('Failed to fetch notifications list', e);
    }
  }, []);

  const closeMenus = useCallback(() => {
    setProfileMenuOpen(false);
    setMobileMenuOpen(false);
    setNotificationsMenuOpen(false);
  }, []);

  // Close menus on route change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setProfileMenuOpen(false);
    setMobileMenuOpen(false);
    setNotificationsMenuOpen(false);
  }, [location.pathname]);

  const toggleNotifications = async () => {
    if (!notificationsMenuOpen) {
      // Opening
      await fetchNotifications();
      setNotificationsMenuOpen(true);
      setProfileMenuOpen(false);
    } else {
      setNotificationsMenuOpen(false);
    }
  };

  const handleNotificationClick = async (n: Notification) => {
    try {
      // 1. Mark as read
      if (!n.read) {
        await api.patch(`/notifications/${n.id}/read`);
        refreshNotifications(); // Update badge immediately
      }

      // 2. Navigation logic based on type
      if (n.type === 'research_complete' && n.data?.ticker) {
        navigate(`/ticker/${n.data.ticker}`);
      } else if (n.data?.ticker) {
        navigate(`/ticker/${n.data.ticker}`);
      }

      // 3. Close menu
      setNotificationsMenuOpen(false);
    } catch (e) {
      console.error('Failed to handle notification click', e);
    }
  };

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



  const goTo = (path: string) => {
    closeMenus();
    navigate(path);
  };

  return (
    <header className="rgb-border-b h-14 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
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

        {/* Search Bar - Push to right or center */}
        <div className="hidden md:block ml-auto mr-4 w-64 lg:w-80">
          <GlobalSearch />
        </div>

        {/* Right: alerts + profile */}
        <div className="flex items-center gap-4">

          {/* Notifications Trigger */}
          <div className="relative">
            <button
              className={`text-muted-foreground hover:text-foreground transition-colors relative ${notificationsMenuOpen ? 'text-foreground' : ''}`}
              onClick={toggleNotifications}
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-red-600 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-background">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Notifications Dropdown */}
            <div
              className={`absolute right-0 top-full mt-3 w-80 bg-card border border-border rounded-lg shadow-xl transition-all duration-200 z-50 overflow-hidden ${notificationsMenuOpen ? 'opacity-100 visible translate-y-0' : 'opacity-0 invisible -translate-y-1 pointer-events-none'
                }`}
            >
              <div className="p-3 border-b border-border flex justify-between items-center bg-muted/30">
                <h3 className="font-semibold text-sm">Notifications</h3>
                <button
                  onClick={async () => {
                    await api.patch('/notifications/read-all');
                    await fetchNotifications(); // Re-fetch to get updated read status
                    refreshNotifications(); // Update badge immediately
                  }}
                  className="text-xs text-primary hover:underline"
                >
                  Mark all read
                </button>
              </div>

              <div className="max-h-[300px] overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">
                    No notifications yet
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => handleNotificationClick(n)}
                      className={`p-3 border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer transition-colors ${!n.read ? 'bg-primary/5' : ''}`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <p className={`text-sm ${!n.read ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                          {n.title}
                        </p>
                        {!n.read && <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {n.message}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-2 opacity-70">
                        {new Date(n.created_at).toLocaleString()}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="relative">
            <button
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => {
                setProfileMenuOpen((open) => !open);
                setNotificationsMenuOpen(false);
              }}
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
