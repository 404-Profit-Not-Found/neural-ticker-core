import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Login } from './Login';
import { BrowserRouter } from 'react-router-dom';

// Mock the AuthContext
vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({
        loginWithGoogle: vi.fn(),
    }),
}));

describe('Login Page', () => {
    it('renders the minimalist login interface', () => {
        render(
            <BrowserRouter>
                <Login />
            </BrowserRouter>
        );

        // Check for the main title
        expect(screen.getByText('Neural Ticker')).toBeInTheDocument();

        // Check for the Google Sign in button text
        expect(screen.getByText('Sign in with Google')).toBeInTheDocument();
    });

    it('does not render removed elements', () => {
        render(
            <BrowserRouter>
                <Login />
            </BrowserRouter>
        );

        // Ensure old slogans and footer text are gone
        expect(screen.queryByText('Institutional Market Intelligence')).not.toBeInTheDocument();
        expect(screen.queryByText('Protected by Neural Gatekeeper')).not.toBeInTheDocument();
    });
});
