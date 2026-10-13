
import { render, screen, fireEvent } from '@testing-library/react';
import { UserDetailDialog } from './UserDetailDialog';
import { describe, it, expect, vi } from 'vitest';
import type { AdminUser } from './UserAdminCard';

describe('UserDetailDialog', () => {
    const mockUser: AdminUser = {
        id: '123',
        email: 'test@example.com',
        role: 'user',
        tier: 'free',
        status: 'ACTIVE',
        created_at: '2024-01-01T00:00:00Z',
        last_login: '2024-01-02T00:00:00Z',
        nickname: 'Test User'
    };

    const defaultProps = {
        open: true,
        onOpenChange: vi.fn(),
        onUpdateTier: vi.fn(),
        onUpdateRole: vi.fn(),
        onRevoke: vi.fn(),
        onUnban: vi.fn(),
        onApprove: vi.fn(),
        onGiftCredits: vi.fn(),
        onResetTutorial: vi.fn(),
        user: mockUser
    };

    it('renders Promote to Admin button for non-admin user', () => {
        render(<UserDetailDialog {...defaultProps} />);

        const promoteButton = screen.getByText('Promote to Admin');
        expect(promoteButton).toBeInTheDocument();

        fireEvent.click(promoteButton);
        expect(defaultProps.onUpdateRole).toHaveBeenCalledWith('123', 'admin');
    });

    it('renders Remove Admin Role button for admin user', () => {
        const adminUser = { ...mockUser, role: 'admin' };
        render(<UserDetailDialog {...defaultProps} user={adminUser} />);

        const removeButton = screen.getByText('Remove Admin Role');
        expect(removeButton).toBeInTheDocument();

        fireEvent.click(removeButton);
        expect(defaultProps.onUpdateRole).toHaveBeenCalledWith('123', 'user');
    });

    it('does not render Promote button if user is already admin', () => {
        const adminUser = { ...mockUser, role: 'admin' };
        render(<UserDetailDialog {...defaultProps} user={adminUser} />);

        const promoteButton = screen.queryByText('Promote to Admin');
        expect(promoteButton).not.toBeInTheDocument();
    });
});
