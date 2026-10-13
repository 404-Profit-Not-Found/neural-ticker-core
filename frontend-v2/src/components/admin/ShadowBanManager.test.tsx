import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import { ShadowBanManager } from './ShadowBanManager';
import { ConfirmProvider } from '../ui/confirm';
import { AdminService } from '../../services/adminService';

vi.mock('../../services/adminService', () => ({
    AdminService: {
        getHiddenTickers: vi.fn(),
        searchTickersAdmin: vi.fn(),
        setTickerHidden: vi.fn(),
    },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const DJT = { id: 'h1', symbol: 'DJT', name: 'Trump Media & Technology Group', exchange: 'NASDAQ', is_hidden: true };
const AAPL = { id: 't1', symbol: 'AAPL', name: 'Apple Inc', exchange: 'NASDAQ', is_hidden: false };

const renderManager = () => render(<ConfirmProvider><ShadowBanManager /></ConfirmProvider>);

describe('ShadowBanManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (AdminService.getHiddenTickers as Mock).mockResolvedValue([DJT]);
        (AdminService.searchTickersAdmin as Mock).mockResolvedValue([AAPL]);
        (AdminService.setTickerHidden as Mock).mockResolvedValue({});
    });

    it('lists the hidden tickers and unhides one without asking', async () => {
        renderManager();

        fireEvent.click(await screen.findByRole('button', { name: 'Unhide DJT' }));

        await waitFor(() => expect(AdminService.setTickerHidden).toHaveBeenCalledWith('DJT', false));
    });

    it('asks before hiding a ticker found by search', async () => {
        renderManager();

        const field = screen.getByRole('searchbox');
        fireEvent.change(field, { target: { value: 'aa' } });
        fireEvent.submit(field.closest('form')!);

        fireEvent.click(await screen.findByRole('button', { name: 'Hide AAPL' }));
        expect(await screen.findByText('Hide AAPL from suggestions?')).toBeInTheDocument();
        expect(AdminService.setTickerHidden).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'Hide ticker' }));

        await waitFor(() => expect(AdminService.setTickerHidden).toHaveBeenCalledWith('AAPL', true));
    });

    it('says the hidden list failed to load instead of "no tickers are hidden"', async () => {
        (AdminService.getHiddenTickers as Mock).mockRejectedValueOnce(new Error('boom'));
        renderManager();

        expect(await screen.findByText("Couldn't load hidden tickers")).toBeInTheDocument();
        expect(screen.queryByText('No tickers are hidden')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(await screen.findByRole('button', { name: 'Unhide DJT' })).toBeInTheDocument();
    });

    it('reports an empty search only after it has run', async () => {
        (AdminService.searchTickersAdmin as Mock).mockResolvedValue([]);
        renderManager();

        const field = screen.getByRole('searchbox');
        fireEvent.change(field, { target: { value: 'zzz' } });
        expect(screen.queryByText(/No tickers match/)).not.toBeInTheDocument();

        fireEvent.submit(field.closest('form')!);
        expect(await screen.findByText('No tickers match “zzz”')).toBeInTheDocument();
    });
});
