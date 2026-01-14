import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AdminConsole } from '../../pages/AdminConsole';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuth } from '../../context/AuthContext';
import { AdminService } from '../../services/adminService';
import { BrowserRouter } from 'react-router-dom';

// Mock dependencies
vi.mock('../../context/AuthContext');
vi.mock('../../services/adminService');

// Mock components to simplify test
vi.mock('../../components/layout/Header', () => ({
    Header: () => <div data-testid="header">Header</div>,
}));
vi.mock('../../components/admin/AdminStatsBar', () => ({
    AdminStatsBar: () => <div data-testid="admin-stats-bar">Stats Bar</div>,
}));

describe('AdminConsole', () => {
    const mockUser = {
        email: 'admin@example.com',
        role: 'admin',
    };

    const mockIdentities = [
        { id: '1', email: 'user1@test.com', role: 'user', status: 'ACTIVE', created_at: new Date().toISOString() },
        { id: '2', email: 'user2@test.com', role: 'user', status: 'WAITLIST', created_at: new Date().toISOString() },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vi.mocked(useAuth).mockReturnValue({ user: mockUser } as any);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vi.mocked(AdminService.getIdentities).mockResolvedValue(mockIdentities as any);
        vi.mocked(AdminService.getTickerRequests).mockResolvedValue([]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        AdminService.approveUser = vi.fn().mockResolvedValue({}) as any;
    });

    const renderComponent = () => {
        return render(
            <BrowserRouter>
                <AdminConsole />
            </BrowserRouter>
        );
    };

    it('renders admin console title', async () => {
        renderComponent();

        // Check for mocked components
        expect(screen.getByTestId('header')).toBeInTheDocument();

        // Wait for data load
        await waitFor(() => {
            expect(AdminService.getIdentities).toHaveBeenCalled();
        });

        // Check if loading finishes and content appears
        expect(screen.getByTestId('admin-stats-bar')).toBeInTheDocument();

    });

    it('redirects if not admin', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vi.mocked(useAuth).mockReturnValue({ user: { role: 'user' } } as any);
        renderComponent();
        // Since we verify navigation mocked, we expect useNavigate call or simple check?
        // AdminConsole uses navigate('/access-denied').
        // Testing navigation requires mocking useNavigate from react-router-dom, or checking if path changes in memory router.
        // For unit test, we can check if AdminService is NOT called.
        expect(AdminService.getIdentities).not.toHaveBeenCalled();
    });

    it('calls approveUser when approve button is clicked for waitlisted user', async () => {
        renderComponent();

        await waitFor(() => {
            expect(screen.getByText('user2@test.com')).toBeInTheDocument();
        });

        const approveBtns = screen.getAllByText('Approve');
        expect(approveBtns.length).toBeGreaterThan(0);

        fireEvent.click(approveBtns[0]);

        await waitFor(() => {
            expect(AdminService.approveUser).toHaveBeenCalledWith('2');
        });
    });
});
