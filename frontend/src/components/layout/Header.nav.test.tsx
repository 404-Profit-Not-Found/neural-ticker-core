import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Header } from './Header';

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { nickname: 'Trader', email: 'trader@example.com', role: 'user' },
    logout: vi.fn(),
  }),
}));

vi.mock('../../hooks/useTicker', () => ({
  useActiveResearchCount: () => ({ data: 0 }),
}));

// Mock EventSource and scrollTo
if (typeof window !== 'undefined') {
  window.EventSource = vi.fn().mockImplementation(() => ({
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    close: vi.fn(),
  })) as unknown as typeof EventSource;
  window.scrollTo = vi.fn();
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

function renderWithRouter(initialPath = '/dashboard') {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/dashboard" element={<HeaderWrapper />} />
          <Route path="/profile" element={<div data-testid="profile-page">Profile Page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function HeaderWrapper() {
  return (
    <div>
      <Header />
      <div data-testid="dashboard-content">Dashboard Content</div>
    </div>
  );
}

describe('Header navigation', () => {
  it('navigates to profile when clicking My Profile', async () => {
    renderWithRouter();

    // open menu
    fireEvent.click(screen.getByLabelText(/user menu/i));

    // click My Profile link - wait for it to be visible
    const profileBtn = await screen.findByText(/My Profile/i);
    fireEvent.click(profileBtn);

    // If it fails, let's see why
    try {
      expect(await screen.findByTestId('profile-page')).toBeInTheDocument();
    } catch (e) {
      console.log('--- TEST FAILED ---');
      screen.debug();
      throw e;
    }
  });
});
