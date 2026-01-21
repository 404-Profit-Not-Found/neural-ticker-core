import { render, screen, fireEvent } from '@testing-library/react';
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
  },
}));

vi.mock('react-router-dom', async (importOriginal) => ({
    ...await importOriginal<any>(),
    useNavigate: () => vi.fn(),
}));

// Mock everything used in the file
vi.mock('../components/layout/Header', () => ({ Header: () => <div>Header</div> }));
vi.mock('../components/ui/select-native', () => ({ NativeSelect: ({ children }: any) => <select>{children}</select> }));
vi.mock('../components/admin/TickerRequestCard', () => ({ TickerRequestCard: () => <div>Card</div> }));
vi.mock('../components/admin/UserAdminCard', () => ({ UserAdminCard: () => <div>UserCard</div> }));
vi.mock('../components/admin/ShadowBanManager', () => ({ ShadowBanManager: () => <div>SBM</div> }));
vi.mock('../components/admin/LogoManager', () => ({ LogoManager: () => <div>LM</div> }));
vi.mock('../components/admin/TickerRequestRow', () => ({ TickerRequestRow: () => <div>Row</div> }));
vi.mock('../components/ui/button', () => ({ Button: ({ children }: any) => <button>{children}</button> }));
vi.mock('../components/ui/input', () => ({ Input: () => <input /> }));
vi.mock('../components/ui/badge', () => ({ Badge: ({ children }: any) => <span>{children}</span> }));
vi.mock('../components/ui/dialog', () => ({ Dialog: ({ children }: any) => <div>{children}</div>, DialogContent: ({ children }: any) => <div>{children}</div>, DialogHeader: ({ children }: any) => <div>{children}</div>, DialogTitle: ({ children }: any) => <div>{children}</div>, DialogDescription: ({ children }: any) => <div>{children}</div>, DialogFooter: ({ children }: any) => <div>{children}</div> }));
vi.mock('../components/ui/table', () => ({ Table: ({ children }: any) => <table>{children}</table>, TableHeader: ({ children }: any) => <thead>{children}</thead>, TableBody: ({ children }: any) => <tbody>{children}</tbody>, TableRow: ({ children }: any) => <tr>{children}</tr>, TableHead: ({ children }: any) => <th>{children}</th>, TableCell: ({ children }: any) => <td>{children}</td> }));
vi.mock('../components/ui/popover', () => ({ Popover: ({ children }: any) => <div>{children}</div>, PopoverTrigger: ({ children }: any) => <div>{children}</div>, PopoverContent: ({ children }: any) => <div>{children}</div> }));
vi.mock('../components/admin/AdminStatsBar', () => ({ AdminStatsBar: () => <div>ASB</div> }));
vi.mock('../components/admin/UserDetailDialog', () => ({ UserDetailDialog: () => <div>UDD</div> }));
vi.mock('../components/ui/user-tier-badge', () => ({ UserTierBadge: () => <div>UTB</div> }));
vi.mock('../components/admin/RequestStatsBar', () => ({ RequestStatsBar: () => <div>RSB</div> }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('AdminConsole Smoke Test', () => {
  beforeEach(() => {
    (useAuth as Mock).mockReturnValue({ user: { role: 'admin' } });
    (AdminService.getIdentities as Mock).mockResolvedValue([]);
    (AdminService.getTickerRequests as Mock).mockResolvedValue([]);
  });

  it('renders and switches tabs', async () => {
    render(<BrowserRouter><AdminConsole /></BrowserRouter>);
    expect(screen.getByText('User Management')).toBeInTheDocument();
    
    const requestsBtn = screen.getAllByText('Ticker Requests').find(el => el.tagName === 'BUTTON');
    fireEvent.click(requestsBtn!);
    expect(screen.getAllByText('Ticker Requests').length).toBeGreaterThan(0);
  });
});
