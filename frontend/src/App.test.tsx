import { render } from '@testing-library/react';
import { describe, it } from 'vitest';
import App from './App';

// Mock the AuthContext since App uses it
vi.mock('./context/AuthContext', () => ({
    AuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    useAuth: () => ({
        user: null,
        loading: true, // Simulate initial loading state
        loginWithGoogle: vi.fn(),
        logout: vi.fn(),
    }),
}));

describe('App Component', () => {
    it('renders without crashing', () => {
        window.scrollTo = vi.fn();
        // This is a basic "smoke test" to ensure the root component tree can mount
        // It validates that no syntax errors or immediate runtime errors prevent rendering
        render(<App />);
    });
});
