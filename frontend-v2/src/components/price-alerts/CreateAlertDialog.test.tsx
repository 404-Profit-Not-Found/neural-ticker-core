import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateAlertDialog } from './CreateAlertDialog';

const mutateAsync = vi.fn();

vi.mock('../../hooks/usePriceAlerts', () => ({
    useCreatePriceAlert: () => ({ mutateAsync, isPending: false }),
}));

vi.mock('../../context/CurrencyContext', () => ({
    useCurrency: () => ({
        formatCurrency: (v: number) => `$${v.toFixed(2)}`,
        formatNative: (v: number) => `$${v.toFixed(2)}`,
    }),
}));

function renderDialog() {
    return render(<CreateAlertDialog symbol="NVDA" currentPrice={121.4} open onOpenChange={() => {}} />);
}

describe('CreateAlertDialog', () => {
    beforeEach(() => {
        mutateAsync.mockReset();
        mutateAsync.mockResolvedValue({});
    });

    it('does not create an "above" alert at the current price — it would fire at once', async () => {
        renderDialog();
        // The field starts at the current price.
        fireEvent.click(screen.getByRole('button', { name: 'Create alert' }));

        expect(await screen.findByText('NVDA is already at $121.40. Enter a higher price.')).toBeInTheDocument();
        expect(mutateAsync).not.toHaveBeenCalled();
    });

    it('does not create a "below" alert above the current price', async () => {
        renderDialog();
        fireEvent.click(screen.getByRole('radio', { name: /Price goes below/ }));
        fireEvent.change(screen.getByRole('textbox'), { target: { value: '130' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create alert' }));

        expect(await screen.findByText('NVDA is already at $121.40. Enter a lower price.')).toBeInTheDocument();
        expect(mutateAsync).not.toHaveBeenCalled();
    });

    it('creates the alert once the target is on the right side of the price', async () => {
        renderDialog();
        fireEvent.change(screen.getByRole('textbox'), { target: { value: '130' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create alert' }));

        await waitFor(() =>
            expect(mutateAsync).toHaveBeenCalledWith(
                expect.objectContaining({ symbol: 'NVDA', alert_type: 'price_above', target_value: 130 }),
            ),
        );
    });
});
