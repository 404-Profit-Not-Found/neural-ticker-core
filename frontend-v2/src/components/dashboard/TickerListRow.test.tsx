import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { TickerRowList } from './TickerListRow';
import type { TickerData } from './WatchlistTableView';

vi.mock('../../context/CurrencyContext', () => ({
    useCurrency: () => ({
        formatNative: (value: number, currency = 'USD') =>
            currency === 'USD' ? `$${value.toFixed(2)}` : `${currency} ${value.toFixed(2)}`,
    }),
}));
vi.mock('./TickerLogo', () => ({ TickerLogo: () => <span data-testid="logo" /> }));
vi.mock('../../app/routes', () => ({ preloadRoute: vi.fn() }));

const item = (over: Partial<TickerData>): TickerData =>
    ({
        symbol: 'MU',
        company: 'Micron Technology Inc',
        price: 104.3,
        change: 1.44,
        currency: 'USD',
        aiRating: 'Strong Buy',
        potentialUpside: 28.7,
        riskScore: 5,
        sparkline: [1, 2, 3],
        ...over,
    }) as TickerData;

function renderRows(items: TickerData[]) {
    return render(
        <MemoryRouter>
            <TickerRowList items={items} />
        </MemoryRouter>,
    );
}

/** The class list of each line of a row: what decides where things sit. */
function shape(row: HTMLElement) {
    const link = within(row).getByRole('link');
    const lines = [...link.querySelectorAll(':scope > span > span')].map((line) =>
        [...line.children].map((cell) => cell.className).join(' | '),
    );
    return lines.join(' || ');
}

describe('TickerListRow', () => {
    it('lays every ticker out the same way, whatever its symbol or currency', () => {
        renderRows([
            item({}),
            // A long symbol and a price with a currency code used to move the
            // rating to another line and push the sparkline sideways.
            item({ symbol: 'VOLV-B.ST', company: 'Volvo AB', price: 281.4, currency: 'SEK' }),
        ]);
        const [first, second] = screen.getAllByRole('listitem');

        const normalise = (s: string) => s.replace(/text-\[1[35]px\]/g, 'text-size');
        expect(normalise(shape(second))).toBe(normalise(shape(first)));
    });

    it('puts the rating in its own slot at the start of the third line', () => {
        renderRows([item({})]);
        const stamp = screen.getByText('Strong Buy');
        expect(stamp.parentElement?.className).toContain('w-[5.5rem]');
        // Not on the symbol's line.
        expect(screen.getByText('MU').parentElement).not.toContainElement(stamp);
    });

    it('sets a long price smaller instead of widening the column', () => {
        renderRows([item({ symbol: 'VOLV-B.ST', price: 1281.4, currency: 'SEK' })]);
        const price = screen.getByText('SEK 1281.40');
        expect(price.className).toContain('text-[13px]');
        expect(price.parentElement?.className).toContain('w-[5.75rem]');
    });

    it('says so when a ticker has not been analysed', () => {
        renderRows([item({ aiRating: '-', potentialUpside: undefined, riskScore: undefined } as Partial<TickerData>)]);
        expect(screen.getByText('Not analysed yet')).toBeInTheDocument();
    });
});
