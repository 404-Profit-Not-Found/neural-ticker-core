import { render, screen, fireEvent } from '@testing-library/react';
import { UserListRow } from '../../../components/admin/UserListRow';
import type { AdminUser } from '../../../components/admin/model';
import { describe, it, expect, vi } from 'vitest';

describe('UserListRow', () => {
    const mockUser: AdminUser = {
        id: '123',
        email: 'test@example.com',
        tier: 'pro',
        role: 'user',
        status: 'ACTIVE',
        created_at: new Date().toISOString(),
        nickname: 'Test User',
        credits_balance: 1200,
    };

    it('renders user details correctly', () => {
        render(<UserListRow user={mockUser} onOpen={vi.fn()} />);
        expect(screen.getByText('Test User')).toBeInTheDocument();
        expect(screen.getByText('test@example.com')).toBeInTheDocument();
        expect(screen.getByText('PRO')).toBeInTheDocument();
        expect(screen.getByText('ACTIVE')).toBeInTheDocument();
        expect(screen.getByText('1,200')).toBeInTheDocument();
    });

    it('opens the user when the row is pressed', () => {
        const onOpen = vi.fn();
        render(<UserListRow user={mockUser} onOpen={onOpen} />);

        // The row itself is a button
        fireEvent.click(screen.getByRole('button'));
        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(onOpen).toHaveBeenCalledWith(mockUser);
    });

    it('prints no balance for an invited address that has none', () => {
        render(<UserListRow user={{ email: 'new@example.com', tier: 'free', role: 'user', status: 'INVITED' }} onOpen={vi.fn()} />);
        expect(screen.getByText('INVITED')).toBeInTheDocument();
        expect(screen.queryByText(/credits/)).not.toBeInTheDocument();
    });
});
