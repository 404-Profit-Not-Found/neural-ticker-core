/// <reference types="vitest" />
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WatchlistTable } from './WatchlistTable';
import { ToastProvider } from '../ui/toast';
import { api } from '../../lib/api';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom',
  );
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

const renderWithProviders = () =>
  render(
    <ToastProvider>
      <WatchlistTable />
    </ToastProvider>,
  );

const originalGet = api.get;
const originalDelete = api.delete;
const originalPost = api.post;

let mockGet: ReturnType<typeof vi.fn>;
let mockDelete: ReturnType<typeof vi.fn>;
let mockPost: ReturnType<typeof vi.fn>;

describe('WatchlistTable', () => {
  beforeEach(() => {
    mockGet = vi.fn().mockResolvedValue({
      data: [{ id: 'list-1', name: 'My List', items: [] }],
    } as any);
    mockDelete = vi.fn().mockResolvedValue({ data: { success: true } } as any);
    mockPost = vi.fn().mockResolvedValue({ data: [] } as any);

    (api as any).get = mockGet;
    (api as any).delete = mockDelete;
    (api as any).post = mockPost;
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    (api as any).get = originalGet;
    (api as any).delete = originalDelete;
    (api as any).post = originalPost;
    vi.restoreAllMocks();
    cleanup();
  });

  it('renders delete watchlist button when a list is active', async () => {
    renderWithProviders();

    expect(
      await screen.findByRole('button', { name: /delete watchlist/i }),
    ).toBeInTheDocument();
  });

  it('deletes the active watchlist when trash icon is clicked and confirmed', async () => {
    renderWithProviders();

    const deleteButton = await screen.findByRole('button', {
      name: /delete watchlist/i,
    });

    const user = userEvent.setup();
    await user.click(deleteButton);

    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith('/watchlists/list-1'),
    );
    expect(window.confirm).toHaveBeenCalled();
  });
});
