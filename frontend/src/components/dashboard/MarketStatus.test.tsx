
import { render, screen } from '@testing-library/react';
import { MarketStatus } from './MarketStatus';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import { useMarketStatus } from '../../hooks/useMarketStatus';
import '@testing-library/jest-dom';

// Mocks
vi.mock('../../hooks/useMarketStatus', () => ({
  useMarketStatus: vi.fn(),
  getSessionLabel: vi.fn((s) => s === 'regular' ? 'Market Open' : 'Market Closed'),
  getSessionColor: vi.fn(() => 'text-emerald-500'),
}));

vi.mock('../ui/badge', () => ({
  Badge: ({ children, className }: { children: React.ReactNode; className?: string }) => <div data-test-class={className}>{children}</div>,
}));

describe('MarketStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state', () => {
    (useMarketStatus as Mock).mockReturnValue({
      data: null,
      isLoading: true,
    });
    render(<MarketStatus />);
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders market open state', () => {
    (useMarketStatus as Mock).mockReturnValue({
      data: { isOpen: true, session: 'regular' },
      isLoading: false,
    });
    render(<MarketStatus />);
    expect(screen.getByText('Market Open')).toBeInTheDocument();
  });

  it('renders market closed state', () => {
    (useMarketStatus as Mock).mockReturnValue({
      data: { isOpen: false, session: 'closed' },
      isLoading: false,
    });
    render(<MarketStatus />);
    expect(screen.getByText('Market Closed')).toBeInTheDocument();
  });

  it('returns null if no status', () => {
    (useMarketStatus as Mock).mockReturnValue({
      data: null,
      isLoading: false,
    });
    const { container } = render(<MarketStatus />);
    expect(container.firstChild).toBeNull();
  });
});
