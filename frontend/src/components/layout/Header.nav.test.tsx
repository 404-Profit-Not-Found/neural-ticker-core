import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Header } from './Header';

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { nickname: 'Trader', email: 'trader@example.com', role: 'user' },
    logout: vi.fn(),
  }),
}));

function renderWithRouter(initialPath = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/dashboard" element={<HeaderWrapper />} />
        <Route path="/settings/style" element={<div data-testid="style-page">Style Guide Page</div>} />
      </Routes>
    </MemoryRouter>
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
  it('navigates to style guide when clicking Settings', async () => {
    renderWithRouter();
    const user = userEvent.setup();

    // open menu
    await user.click(screen.getByLabelText(/user menu/i));
    // click Settings link
    await user.click(screen.getByRole('button', { name: /settings/i }));

    expect(screen.getByTestId('style-page')).toBeInTheDocument();
  });
});
