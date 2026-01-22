import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { Header } from './Header';
import { api } from '../../lib/api';
// Ensure jest-dom matchers (though often setup globally, explicit import helps if config is partial)
import '@testing-library/jest-dom';

// Mocks
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { nickname: 'TestUser', email: 'test@example.com', role: 'user' },
    logout: vi.fn(),
  }),
}));

vi.mock('../../hooks/useTicker', () => ({
  useActiveResearchCount: () => ({ data: 0 }),
}));

vi.mock('../../lib/api');

// Mock EventSource
if (typeof window !== 'undefined') {
  window.EventSource = vi.fn().mockImplementation(() => ({
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    close: vi.fn(),
  })) as unknown as typeof EventSource;
  window.scrollTo = vi.fn();
}

const mockNotifications = [
  {
    id: '1',
    title: 'Test Notification',
    message: 'This is a test notification',
    read: false,
    created_at: new Date().toISOString(),
    type: 'info',
    data: null,
  },
];

describe('Header Notifications', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    vi.clearAllMocks();
  });

  const renderHeader = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Header />
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('fetches notifications using useQuery and displays them', async () => {
    // Setup API mock
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/notifications/count') return Promise.resolve({ data: { count: 1 } });
      if (url === '/notifications') return Promise.resolve({ data: mockNotifications });
      return Promise.resolve({ data: {} });
    });

    renderHeader();

    // Wait for the unread count badge to appear (confirms count query ran)
    // using findByText because it incorporates waitFor
    await screen.findByText('1');

    // Find the notifications button by its accessible name
    const bellBtn = screen.getByRole('button', { name: /notifications/i });
    
    // Click to open menu
    fireEvent.click(bellBtn);

    // Expect query to have been called (eagerly or on click depending on implementation, 
    // but in our impl it's enabled=isAuthenticated so typically eager)
    expect(api.get).toHaveBeenCalledWith('/notifications');

    // Check if notification details are displayed
    await screen.findByText('Test Notification');
    await screen.findByText('This is a test notification');
  });
});
