import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import '@testing-library/jest-dom';
import { EventCalendar } from './EventCalendar';
import axios from 'axios';
import React from 'react';

// Mock axios. A factory rather than an automock: the component now renders
// shared UI primitives, and those import `lib/api`, which builds an axios
// instance (create + interceptors) at module load.
vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    create: vi.fn().mockReturnThis(),
    interceptors: {
      request: { use: vi.fn(), eject: vi.fn() },
      response: { use: vi.fn(), eject: vi.fn() },
    },
  },
}));
const mockedAxios = axios as unknown as { get: ReturnType<typeof vi.fn> };

describe('EventCalendar', () => {
  beforeEach(() => {
    mockedAxios.get.mockClear();
  });

  it('renders nothing if no events', async () => {
    mockedAxios.get.mockResolvedValue({ data: [] });
    render(<EventCalendar symbol="AAPL" />);
    await waitFor(() => {
        expect(screen.getByText(/No upcoming catalysts detected/i)).toBeInTheDocument(); 
    });
  });

  it('renders events correctly', async () => {
    const mockEvents = [
      {
        id: '1',
        title: 'Earnings Call',
        event_date: '2025-01-01',
        event_type: 'earnings',
        confidence: 0.9,
        impact_score: 8,
        source: 'stocktwits'
      }
    ];
    mockedAxios.get.mockResolvedValue({ data: mockEvents });

    render(<EventCalendar symbol="AAPL" />);

    await waitFor(() => {
      expect(screen.getByText('Earnings Call')).toBeInTheDocument();
      // Dates follow the shared day-first format (lib/datetime); this
      // component used to print "Jan 1" through date-fns.
      expect(screen.getByText('1 Jan 2025')).toBeInTheDocument();
      expect(screen.getByText('earnings')).toBeInTheDocument();
      expect(screen.getByText(/8/)).toBeInTheDocument(); 
      expect(screen.getByText('90%')).toBeInTheDocument();
    });
  });

  it('labels impact and confidence so the figures read without the column heads', async () => {
    mockedAxios.get.mockResolvedValue({
      data: [{ id: '1', title: 'Investor day', event_date: '2025-03-04', event_type: 'product_launch', confidence: 0.4, impact_score: 9, source: 'stocktwits' }],
    });
    render(<EventCalendar symbol="AAPL" />);

    const row = (await screen.findByText('Investor day')).closest('li');
    expect(row).not.toBeNull();
    // On a phone there are no column heads: the row itself must say what 9/10 is.
    expect(row).toHaveTextContent('Impact 9/10');
    expect(row).toHaveTextContent('Confidence 40%');
    expect(screen.getByText('product launch')).toBeInTheDocument();
    expect(screen.getByLabelText('Low confidence')).toBeInTheDocument();
  });

  it('prints an em dash when an event has no impact score', async () => {
    mockedAxios.get.mockResolvedValue({
      data: [{ id: '1', title: 'Conference', event_date: '2025-03-04', event_type: 'conference', confidence: 0.9, impact_score: 0, source: 'stocktwits' }],
    });
    render(<EventCalendar symbol="AAPL" />);
    const row = (await screen.findByText('Conference')).closest('li');
    expect(row).toHaveTextContent('Impact —');
  });
});
