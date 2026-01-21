
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AdminConsole } from './AdminConsole';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AdminService } from '../services/adminService';
import '@testing-library/jest-dom';

// Mocks
vi.mock('../lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../services/adminService', () => ({
  AdminService: {
    getIdentities: vi.fn(),
    getTickerRequests: vi.fn(),
    addToUserlist: vi.fn(),
    approveUser: vi.fn(),
    revokeAccess: vi.fn(),
    updateTier: vi.fn(),
    updateRole: vi.fn(),
    giftCredits: vi.fn(),
    resetTutorial: vi.fn(),
    approveTickerRequest: vi.fn(),
    rejectTickerRequest: vi.fn(),
  },
}));

vi.mock('react-router-dom', async (importOriginal) => ({
    ...await importOriginal<any>(),
    useNavigate: () => vi.fn(),
}));

// Components Mocks
vi.mock('../components/layout/Header', () => ({ Header: () => <div data-testid="header">Header</div> }));
vi.mock('../components/ui/select-native', () => ({ NativeSelect: ({ children, onChange, value }: any) => <select onChange={onChange} value={value} data-testid="mobile-nav">{children}</select> }));
vi.mock('../components/ui/button', () => ({ Button: ({ children, onClick, className }: any) => <button onClick={onClick} className={className}>{children}</button> }));
vi.mock('../components/ui/input', () => ({ Input: ({ value, onChange, placeholder }: any) => <input value={value} onChange={onChange} placeholder={placeholder} /> }));
vi.mock('../components/ui/badge', () => ({ Badge: ({ children }: any) => <span>{children}</span> }));
vi.mock('../components/ui/table', () => ({ 
  Table: ({ children }: any) => <table>{children}</table>, 
  TableHeader: ({ children }: any) => <thead>{children}</thead>, 
  TableBody: ({ children }: any) => <tbody>{children}</tbody>, 
  TableRow: ({ children, onClick }: any) => <tr onClick={onClick}>{children}</tr>, 
  TableHead: ({ children, onClick }: any) => <th onClick={onClick}>{children}</th>, 
  TableCell: ({ children }: any) => <td>{children}</td> 
}));
vi.mock('../components/ui/dialog', () => ({ 
  Dialog: ({ children, open }: any) => open ? <div>{children}</div> : null, 
  DialogContent: ({ children }: any) => <div>{children}</div>, 
  DialogHeader: ({ children }: any) => <div>{children}</div>, 
  DialogTitle: ({ children }: any) => <div>{children}</div>, 
  DialogDescription: ({ children }: any) => <div>{children}</div>, 
  DialogFooter: ({ children }: any) => <div>{children}</div> 
}));
vi.mock('../components/ui/popover', () => ({ Popover: ({ children }: any) => <div>{children}</div>, PopoverTrigger: ({ children }: any) => <div>{children}</div>, PopoverContent: ({ children }: any) => <div>{children}</div> }));
vi.mock('../components/ui/user-tier-badge', () => ({ UserTierBadge: () => <div>UTB</div> }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('lucide-react', () => ({ 
  Plus: () => <span>+</span>, 
  Search: () => <span>S</span>, 
  ChevronLeft: () => <span><</span>, 
  ArrowUpDown: () => <span>⇅</span>, 
  Crown: () => <span>C</span>, 
  Sparkles: () => <span>S</span>, 
  Gift: () => <span>G</span>, 
  Ban: () => <span>B</span>, 
  CheckCircle: () => <span>✓</span>, 
  LayoutGrid: () => <span>G</span>, 
  List: () => <span>L</span> 
}));

// Individual Sub-components
vi.mock('../components/admin/TickerRequestCard', () => ({ TickerRequestCard: () => <div>TickerRequestCard</div> }));
vi.mock('../components/admin/UserAdminCard', () => ({ UserAdminCard: () => <div>UserAdminCard</div> }));
vi.mock('../components/admin/ShadowBanManager', () => ({ ShadowBanManager: () => <div>ShadowBanManager</div> }));
vi.mock('../components/admin/LogoManager', () => ({ LogoManager: () => <div>LogoManager</div> }));
vi.mock('../components/admin/TickerRequestRow', () => ({ TickerRequestRow: () => <div>TickerRequestRow</div> }));
vi.mock('../components/admin/AdminStatsBar', () => ({ AdminStatsBar: () => <div>AdminStatsBar</div> }));
vi.mock('../components/admin/UserDetailDialog', () => ({ UserDetailDialog: () => <div>UserDetailDialog</div> }));
vi.mock('../components/admin/RequestStatsBar', () => ({ RequestStatsBar: () => <div>RequestStatsBar</div> }));

describe('AdminConsole', () => {
  const mockIdentities = [
    { id: '1', email: 'user1@example.com', status: 'ACTIVE', role: 'user', created_at: '2023-01-01' },
    { id: '2', email: 'user2@example.com', status: 'WAITLIST', role: 'user', created_at: '2023-01-02' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as Mock).mockReturnValue({ user: { role: 'admin', email: 'admin@example.com' } });
    (AdminService.getIdentities as Mock).mockResolvedValue(mockIdentities);
    (AdminService.getTickerRequests as Mock).mockResolvedValue([]);
  });

  it('renders correctly and shows users', async () => {
    render(<BrowserRouter><AdminConsole /></BrowserRouter>);
    expect(screen.getAllByText(/User Management/i).length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(screen.getByText(/user1@example.com/i)).toBeInTheDocument();
    });
  });

  it('switches tabs correctly', async () => {
    render(<BrowserRouter><AdminConsole /></BrowserRouter>);
    
    // Find the tab button (Desktop nav)
    const tabs = screen.getAllByRole('button');
    const requestsTab = tabs.find(t => t.textContent?.includes('Ticker Requests'));
    fireEvent.click(requestsTab!);
    
    expect(screen.getAllByText(/Ticker Requests/i).length).toBeGreaterThan(0);
    expect(AdminService.getTickerRequests).toHaveBeenCalled();
  });

  it('handles user search', async () => {
    render(<BrowserRouter><AdminConsole /></BrowserRouter>);
    await waitFor(() => screen.getByText(/user1@example.com/i));
    
    const searchInput = screen.getByPlaceholderText(/search by email/i);
    fireEvent.change(searchInput, { target: { value: 'user2' } });
    
    expect(screen.queryByText(/user1@example.com/i)).not.toBeInTheDocument();
    expect(screen.getByText(/user2@example.com/i)).toBeInTheDocument();
  });
});
