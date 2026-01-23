
import { render, screen } from '@testing-library/react';
import { MarketStatusBar } from './MarketStatusBar';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import { useAllMarketsStatus } from '../../hooks/useMarketStatus';
import '@testing-library/jest-dom';

// Mocks
vi.mock('../../hooks/useMarketStatus', () => ({
  useAllMarketsStatus: vi.fn(),
  getSessionLabel: vi.fn((s) => s === 'regular' ? 'Market Open' : 'Market Closed'),
  getSessionColor: vi.fn(() => 'text-emerald-500'),
}));

vi.mock('../ui/badge', () => ({
  Badge: ({ children, className }: { children: React.ReactNode; className?: string }) => <div data-test-class={className}>{children}</div>,
}));

describe('MarketStatusBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state', () => {
    (useAllMarketsStatus as Mock).mockReturnValue({
      data: null,
      isLoading: true,
    });
    render(<MarketStatusBar />);
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders US, EU, and Asia market statuses', () => {
    (useAllMarketsStatus as Mock).mockReturnValue({
      data: {
        us: { isOpen: true, session: 'regular' },
        eu: { isOpen: false, session: 'closed' },
        asia: { isOpen: true, session: 'regular' },
      },
      isLoading: false,
    });
    
    render(<MarketStatusBar />);
    
    // Check for text labels
    expect(screen.getByText('US:')).toBeInTheDocument();
    
    expect(screen.getByText('EU:')).toBeInTheDocument();
    
    expect(screen.getByText('Asia:')).toBeInTheDocument();
  });

  it('returns null if no data', () => {
    (useAllMarketsStatus as Mock).mockReturnValue({
      data: null,
      isLoading: false,
    });
    const { container } = render(<MarketStatusBar />);
    expect(container.firstChild).toBeNull();
  });
});
