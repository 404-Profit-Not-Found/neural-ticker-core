
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { AdminConsole } from './AdminConsole';
import { ConfirmProvider } from '../components/ui/confirm';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AdminService } from '../services/adminService';
import '@testing-library/jest-dom';

// Mocks
vi.mock('../lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
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

// One stable function, like the real hook: a new one per render would make
// the page reload its data on every render and overwrite local updates.
vi.mock('react-router-dom', async (importOriginal) => {
    const navigate = vi.fn();
    return {
        ...await importOriginal<typeof import('react-router-dom')>(),
        useNavigate: () => navigate,
    };
});

// Components Mocks
vi.mock('../components/layout/Header', () => ({ Header: () => <div data-testid="header">Header</div> }));
vi.mock('../components/ui/select-native', () => ({ NativeSelect: ({ children, onChange, value }: { children: React.ReactNode; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; value: string }) => <select onChange={onChange} value={value} data-testid="mobile-nav">{children}</select> }));
vi.mock('../components/ui/button', () => ({ Button: ({ children, onClick, className }: { children: React.ReactNode; onClick?: () => void; className?: string }) => <button onClick={onClick} className={className}>{children}</button> }));
vi.mock('../components/ui/input', () => ({ Input: ({ value, onChange, placeholder }: { value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder?: string }) => <input value={value} onChange={onChange} placeholder={placeholder} /> }));
vi.mock('../components/ui/badge', () => ({ Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock('../components/ui/dialog', () => ({ 
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) => open ? <div>{children}</div> : null, 
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, 
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, 
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, 
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, 
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div> 
}));
vi.mock('../components/ui/popover', () => ({ Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('../components/ui/user-tier-badge', () => ({ UserTierBadge: () => <div>UTB</div> }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// Every icon the page and its unmocked parts (admin-ui, UserTable) render.
vi.mock('lucide-react', () => ({ 
  Plus: () => <span>+</span>, 
  Search: () => <span>S</span>, 
  SearchX: () => <span>S</span>, 
  ChevronLeft: () => <span>{'<'}</span>, 
  ChevronRight: () => <span>{'>'}</span>, 
  ChevronsUpDown: () => <span>⇅</span>, 
  ArrowLeft: () => <span>{'←'}</span>, 
  ArrowRight: () => <span>{'→'}</span>, 
  ArrowUp: () => <span>↑</span>, 
  ArrowDown: () => <span>↓</span>, 
  Loader2: () => <span>…</span>, 
  Sparkles: () => <span>S</span>, 
  Gift: () => <span>G</span>, 
  Ban: () => <span>B</span>, 
  Check: () => <span>✓</span>, 
  CheckCircle: () => <span>✓</span>, 
  MoreHorizontal: () => <span>⋯</span>, 
  // Used by LoadError when a list fails to load.
  CloudOff: () => <span>x</span>, 
  // Used by the themed confirm dialog (ConfirmProvider) for destructive actions.
  AlertTriangle: () => <span>!</span>
}));

// Individual Sub-components
vi.mock('../components/admin/TickerRequestListRow', () => ({ TickerRequestListRow: () => <div>TickerRequestListRow</div> }));
vi.mock('../components/admin/ShadowBanManager', () => ({ ShadowBanManager: () => <div>ShadowBanManager</div> }));
vi.mock('../components/admin/LogoManager', () => ({ LogoManager: () => <div>LogoManager</div> }));
vi.mock('../components/admin/TickerRequestRow', () => ({ TickerRequestRow: () => <tr><td>TickerRequestRow</td></tr> }));
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
    render(<BrowserRouter><ConfirmProvider><AdminConsole /></ConfirmProvider></BrowserRouter>);
    // One fixed page title; the selected tab says which section is open.
    expect(screen.getByRole('heading', { level: 1, name: 'Admin' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Users' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => {
      expect(screen.getByText(/user1@example.com/i)).toBeInTheDocument();
    });
  });

  it('switches tabs correctly', async () => {
    render(<BrowserRouter><ConfirmProvider><AdminConsole /></ConfirmProvider></BrowserRouter>);
    
    const requestsTab = screen.getByRole('tab', { name: 'Ticker Requests' });
    fireEvent.click(requestsTab);

    expect(requestsTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Users' })).toHaveAttribute('aria-selected', 'false');
    await waitFor(() => expect(AdminService.getTickerRequests).toHaveBeenCalled());
    expect(screen.getByText('RequestStatsBar')).toBeInTheDocument();
  });

  it('handles user search', async () => {
    render(<BrowserRouter><ConfirmProvider><AdminConsole /></ConfirmProvider></BrowserRouter>);
    await waitFor(() => screen.getByText(/user1@example.com/i));
    
    const searchInput = screen.getByPlaceholderText(/search users/i);
    fireEvent.change(searchInput, { target: { value: 'user2' } });
    
    await waitFor(() => {
      expect(screen.queryByText(/user1@example.com/i)).not.toBeInTheDocument();
      expect(screen.getByText(/user2@example.com/i)).toBeInTheDocument();
    });
  });

  it('keeps banned users out of the default list but finds them by search', async () => {
    (AdminService.getIdentities as Mock).mockResolvedValue([
      ...mockIdentities,
      { id: '3', email: 'banned@example.com', status: 'BANNED', role: 'revoked', created_at: '2023-01-03' },
    ]);
    render(<BrowserRouter><ConfirmProvider><AdminConsole /></ConfirmProvider></BrowserRouter>);
    await screen.findByText(/user1@example.com/i);
    expect(screen.queryByText(/banned@example.com/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/search users/i), { target: { value: 'banned' } });

    expect(await screen.findByText(/banned@example.com/i)).toBeInTheDocument();
  });

  it('says the list failed to load, and loads it on retry', async () => {
    (AdminService.getIdentities as Mock).mockRejectedValueOnce(new Error('boom'));
    render(<BrowserRouter><ConfirmProvider><AdminConsole /></ConfirmProvider></BrowserRouter>);

    // A failure is never dressed up as an empty list.
    expect(await screen.findByText("Couldn't load users")).toBeInTheDocument();
    expect(screen.queryByText(/No users/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText(/user1@example.com/i)).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load users")).not.toBeInTheDocument();
  });

  it('shows ticker requests as a table once they have loaded', async () => {
    (AdminService.getTickerRequests as Mock).mockResolvedValue([
      { id: 'r1', symbol: 'ARM', user_id: '1', status: 'PENDING', created_at: '2023-01-01' },
    ]);
    render(<BrowserRouter><ConfirmProvider><AdminConsole /></ConfirmProvider></BrowserRouter>);

    fireEvent.click(screen.getByRole('tab', { name: 'Ticker Requests' }));

    expect(await screen.findByText('TickerRequestRow')).toBeInTheDocument();
    expect(screen.queryByText('No ticker requests yet')).not.toBeInTheDocument();
  });

  it('sorts users without a balance last, whichever way the column is sorted', async () => {
    (AdminService.getIdentities as Mock).mockResolvedValue([
      { id: '1', email: 'a@example.com', status: 'ACTIVE', role: 'user', credits_balance: 5, created_at: '2023-01-03' },
      { email: 'invited@example.com', status: 'INVITED', role: 'user', invited_at: '2023-01-02' },
      { id: '2', email: 'b@example.com', status: 'ACTIVE', role: 'user', credits_balance: 0, created_at: '2023-01-01' },
    ]);
    render(<BrowserRouter><ConfirmProvider><AdminConsole /></ConfirmProvider></BrowserRouter>);
    await screen.findByText('a@example.com');
    const emails = () => screen.getAllByRole('row').slice(1).map((row) => within(row).getByText(/@example\.com/).textContent);

    fireEvent.click(screen.getByRole('button', { name: /Credits/ }));
    expect(emails()).toEqual(['b@example.com', 'a@example.com', 'invited@example.com']);

    fireEvent.click(screen.getByRole('button', { name: /Credits/ }));
    expect(emails()).toEqual(['a@example.com', 'b@example.com', 'invited@example.com']);
  });

  it('confirms in the themed dialog before revoking access', async () => {
    (AdminService.revokeAccess as Mock).mockResolvedValue({});
    render(<BrowserRouter><ConfirmProvider><AdminConsole /></ConfirmProvider></BrowserRouter>);

    const row = (await screen.findByText(/user1@example.com/i)).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: /Ban$/ }));

    // Rendered through the mocked Dialog above; nothing is revoked until confirmed.
    expect(await screen.findByText('Revoke access for user1@example.com?')).toBeInTheDocument();
    expect(AdminService.revokeAccess).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));

    await waitFor(() => {
      expect(AdminService.revokeAccess).toHaveBeenCalledWith('user1@example.com');
    });
    expect(screen.queryByText('Revoke access for user1@example.com?')).not.toBeInTheDocument();
  });

  it('shows the new balance in the list after gifting credits', async () => {
    (AdminService.giftCredits as Mock).mockResolvedValue({ id: '1', credits_balance: 12 });
    render(<BrowserRouter><ConfirmProvider><AdminConsole /></ConfirmProvider></BrowserRouter>);

    const row = (await screen.findByText(/user1@example.com/i)).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: /Gift$/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Send credits' }));

    await waitFor(() => {
      expect(AdminService.giftCredits).toHaveBeenCalledWith('1', 1, 'Admin Gift');
    });
    expect(await screen.findByText('12')).toBeInTheDocument();
  });

  it('does not revoke access when the confirm dialog is cancelled', async () => {
    render(<BrowserRouter><ConfirmProvider><AdminConsole /></ConfirmProvider></BrowserRouter>);

    const row = (await screen.findByText(/user1@example.com/i)).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: /Ban$/ }));

    await screen.findByText('Revoke access for user1@example.com?');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByText('Revoke access for user1@example.com?')).not.toBeInTheDocument();
    });
    expect(AdminService.revokeAccess).not.toHaveBeenCalled();
  });
});
