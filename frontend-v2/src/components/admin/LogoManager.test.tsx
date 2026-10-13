import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import { LogoManager } from './LogoManager';
import { AdminService } from '../../services/adminService';

vi.mock('../../services/adminService', () => ({
    AdminService: {
        searchTickersAdmin: vi.fn(),
        updateTickerLogo: vi.fn(),
    },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const MISSING = [
    { id: 't1', symbol: '7203.T', name: 'Toyota Motor Corp', exchange: 'TSE', logo_url: null },
    { id: 't2', symbol: 'MULN', name: 'Mullen Automotive Inc', exchange: 'NASDAQ', logo_url: null },
];

describe('LogoManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (AdminService.searchTickersAdmin as Mock).mockResolvedValue(MISSING);
        (AdminService.updateTickerLogo as Mock).mockResolvedValue({});
    });

    it('lists the tickers without a logo when the filter chip is switched on', async () => {
        render(<LogoManager />);
        expect(screen.getByText('Find a ticker to set its logo')).toBeInTheDocument();

        const chip = screen.getByRole('button', { name: 'Missing logos' });
        expect(chip).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(chip);

        expect(await screen.findByText('7203.T')).toBeInTheDocument();
        expect(AdminService.searchTickersAdmin).toHaveBeenCalledWith('', true);
        expect(chip).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getAllByText('No logo')).toHaveLength(2);
    });

    it('searches on Enter', async () => {
        render(<LogoManager />);

        const field = screen.getByRole('searchbox', { name: 'Search tickers' });
        fireEvent.change(field, { target: { value: 'toy' } });
        fireEvent.submit(field.closest('form')!);

        await waitFor(() => expect(AdminService.searchTickersAdmin).toHaveBeenCalledWith('toy', false));
    });

    it('saves a logo URL from the sheet and drops the ticker from the missing list', async () => {
        render(<LogoManager />);
        fireEvent.click(screen.getByRole('button', { name: 'Missing logos' }));

        fireEvent.click(await screen.findByRole('button', { name: /7203\.T.*add logo/i }));
        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByText('Logo for 7203.T')).toBeInTheDocument();
        // Nothing to save yet.
        expect(within(dialog).getByRole('button', { name: 'Save logo' })).toBeDisabled();

        fireEvent.change(within(dialog).getByLabelText('Image URL'), { target: { value: 'https://example.com/toyota.png' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Save logo' }));

        await waitFor(() => {
            expect(AdminService.updateTickerLogo).toHaveBeenCalledWith('7203.T', 'https://example.com/toyota.png');
        });
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(screen.queryByText('7203.T')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /MULN.*add logo/i })).toBeInTheDocument();
    });

    it('keeps the sheet open when saving fails', async () => {
        (AdminService.updateTickerLogo as Mock).mockRejectedValue(new Error('boom'));
        render(<LogoManager />);
        fireEvent.click(screen.getByRole('button', { name: 'Missing logos' }));

        fireEvent.click(await screen.findByRole('button', { name: /MULN.*add logo/i }));
        const dialog = screen.getByRole('dialog');
        fireEvent.change(within(dialog).getByLabelText('Image URL'), { target: { value: 'https://example.com/m.png' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Save logo' }));

        await waitFor(() => expect(AdminService.updateTickerLogo).toHaveBeenCalled());
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /MULN.*add logo/i })).toBeInTheDocument();
    });

    it('says a failed search failed instead of "no tickers match"', async () => {
        (AdminService.searchTickersAdmin as Mock).mockRejectedValueOnce(new Error('boom'));
        render(<LogoManager />);
        fireEvent.click(screen.getByRole('button', { name: 'Missing logos' }));

        expect(await screen.findByText("Couldn't load tickers")).toBeInTheDocument();
        expect(screen.queryByText(/No tickers match|Every ticker has a logo/)).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(await screen.findByText('7203.T')).toBeInTheDocument();
    });
});

describe('LogoManager — overlapping searches', () => {
    it('shows the answer to the latest search, even when an earlier one answers last', async () => {
        let answerFirst: (rows: unknown[]) => void = () => {};
        (AdminService.searchTickersAdmin as Mock)
            .mockReset()
            .mockImplementationOnce(() => new Promise((resolve) => { answerFirst = resolve; }))
            .mockResolvedValueOnce([{ id: 'a', symbol: 'AAPL', name: 'Apple Inc', exchange: 'NASDAQ', logo_url: '/logo' }]);
        render(<LogoManager />);

        // First search is still running when Enter starts the second one.
        fireEvent.click(screen.getByRole('button', { name: 'Missing logos' }));
        const field = screen.getByRole('searchbox', { name: 'Search tickers' });
        fireEvent.change(field, { target: { value: 'aapl' } });
        fireEvent.submit(field.closest('form')!);
        expect(await screen.findByText('AAPL')).toBeInTheDocument();

        answerFirst(MISSING);
        await waitFor(() => expect(AdminService.searchTickersAdmin).toHaveBeenCalledTimes(2));
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(screen.queryByText('7203.T')).not.toBeInTheDocument();
        expect(screen.getByText('AAPL')).toBeInTheDocument();
    });
});

describe('LogoManager — placeholders', () => {
    it('does not ask the server for a logo it knows is missing', async () => {
        (AdminService.searchTickersAdmin as Mock).mockReset().mockResolvedValue([
            MISSING[0],
            { id: 'a', symbol: 'AAPL', name: 'Apple Inc', exchange: 'NASDAQ', logo_url: 'https://cdn.example.com/aapl.png' },
        ]);
        const { container } = render(<LogoManager />);
        fireEvent.click(screen.getByRole('button', { name: 'Missing logos' }));
        await screen.findByText('7203.T');

        const sources = Array.from(container.querySelectorAll('img')).map((img) => img.getAttribute('src'));
        expect(sources).toEqual(['/api/v1/tickers/AAPL/logo']);
    });
});
