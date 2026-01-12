import { render, screen, fireEvent } from '@testing-library/react';
import { UserAdminCard, type AdminUser } from '../../../components/admin/UserAdminCard';
import { describe, it, expect, vi } from 'vitest';

describe('UserAdminCard', () => {
    const mockUser: AdminUser = {
        id: '123',
        email: 'test@example.com',
        tier: 'pro',
        role: 'user',
        status: 'ACTIVE',
        created_at: new Date().toISOString(),
        nickname: 'Test User'
    };

    it('renders user details correctly', () => {
        render(<UserAdminCard user={mockUser} onClick={vi.fn()} />);
        expect(screen.getByText('Test User')).toBeInTheDocument();
        expect(screen.getByText('test@example.com')).toBeInTheDocument();
        expect(screen.getByText('PRO')).toBeInTheDocument();
        expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    });

    it('calls onClick when clicked with user object', () => {
        const onClick = vi.fn();
        render(<UserAdminCard user={mockUser} onClick={onClick} />);

        // The card itself is a button
        fireEvent.click(screen.getByRole('button'));
        expect(onClick).toHaveBeenCalledTimes(1);
        expect(onClick).toHaveBeenCalledWith(mockUser);
    });
});
