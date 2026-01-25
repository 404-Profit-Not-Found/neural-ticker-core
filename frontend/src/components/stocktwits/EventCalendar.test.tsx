import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import '@testing-library/jest-dom';
import { EventCalendar } from './EventCalendar';
import axios from 'axios';
import React from 'react';

// Mock axios
vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('EventCalendar', () => {
  beforeEach(() => {
    mockedAxios.get.mockClear();
  });

  it('renders nothing if no events', async () => {
    mockedAxios.get.mockResolvedValue({ data: [] });
    const { container } = render(<EventCalendar symbol="AAPL" />);
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
      expect(screen.getByText('Jan 1')).toBeInTheDocument();
      expect(screen.getByText('earnings')).toBeInTheDocument();
      expect(screen.getByText(/8/)).toBeInTheDocument(); 
      expect(screen.getByText('90%')).toBeInTheDocument();
    });
  });
});
