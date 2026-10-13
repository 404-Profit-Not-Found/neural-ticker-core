import { flexRender, type Header } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '../../lib/api';

/**
 * Column meta understood by the Tickers and Watchlist tables.
 *
 * Column priority: the tables only exist from `lg` (below that the page shows
 * rows), and they never scroll sideways — low-priority columns join as the
 * viewport grows instead:
 *   always  Asset · Price · Trend · Risk · Risk/Reward · Upside · Downside · AI rating
 *   `xl`    + 52-week range, P/E            (≥ 1280px)
 *   `wide`  + Analyst consensus             (≥ 1400px)
 */
export interface TickerColumnMeta {
    showFrom?: 'xl' | 'wide';
}

const SHOW_FROM: Record<NonNullable<TickerColumnMeta['showFrom']>, string> = {
    xl: 'hidden xl:table-cell',
    wide: 'hidden min-[1400px]:table-cell',
};

/** Responsive visibility classes for a column's header and body cells. */
// eslint-disable-next-line react-refresh/only-export-components
export function columnClass(meta: unknown): string | undefined {
    const showFrom = (meta as TickerColumnMeta | undefined)?.showFrom;
    return showFrom ? SHOW_FROM[showFrom] : undefined;
}

/**
 * Header cell. A sortable column is a real button that says so: a dim
 * up/down glyph at rest, an arrow and the "you are here" tint once sorted,
 * and `aria-sort` on the cell for assistive tech.
 */
export function SortableTh<T>({ header }: { header: Header<T, unknown> }) {
    const column = header.column;
    const sorted = column.getIsSorted();
    const canSort = column.getCanSort();
    const label = flexRender(column.columnDef.header, header.getContext());

    return (
        <th
            scope="col"
            aria-sort={canSort ? (sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none') : undefined}
            className={cn(
                'h-9 px-2.5 text-left align-middle whitespace-nowrap first:pl-5 last:pr-5',
                columnClass(column.columnDef.meta),
            )}
            style={{ width: column.columnDef.size, minWidth: column.columnDef.minSize }}
        >
            {header.isPlaceholder || !column.columnDef.header ? null : canSort ? (
                <button
                    type="button"
                    onClick={column.getToggleSortingHandler()}
                    title={sorted === 'asc' ? 'Sorted ascending — click to reverse' : sorted === 'desc' ? 'Sorted descending — click to reverse' : 'Sort by this column'}
                    className={cn(
                        'label-micro group/sort -mx-1.5 inline-flex h-7 items-center gap-1 rounded-md px-1.5 transition-colors hover:bg-muted hover:!text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        sorted && 'bg-signal/10 !text-signal hover:bg-signal/15 hover:!text-signal',
                    )}
                >
                    {label}
                    {sorted === 'asc' ? (
                        <ArrowUp className="h-3 w-3 shrink-0" aria-hidden />
                    ) : sorted === 'desc' ? (
                        <ArrowDown className="h-3 w-3 shrink-0" aria-hidden />
                    ) : (
                        <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50 transition-opacity group-hover/sort:opacity-100" aria-hidden />
                    )}
                </button>
            ) : (
                <span className="label-micro">{label}</span>
            )}
        </th>
    );
}

/** Signed percentage, one decimal, with a real minus sign. */
const signedPct = (value: number): string =>
    `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(1)}%`;

/** Upside: signed, one decimal, coloured by direction; an em dash when unknown. */
export function UpsideCell({ value }: { value: number | null | undefined }) {
    if (value === null || value === undefined || !Number.isFinite(value)) {
        return <span className="text-muted-foreground">—</span>;
    }
    return (
        <span className={cn('num text-xs font-semibold', value > 0 ? 'text-up' : value < 0 ? 'text-down' : 'text-muted-foreground')}>
            {signedPct(value)}
        </span>
    );
}

/**
 * Downside: signed, one decimal, in the "down" colour; an em dash when
 * unknown. A figure estimated from the risk score (the ticker has no bear-case
 * target) is marked "≈" and set in the neutral colour, so it never reads as
 * an analyst's number.
 */
export function DownsideCell({ value, estimated }: { value: number | null | undefined; estimated?: boolean }) {
    if (value === null || value === undefined || !Number.isFinite(value)) {
        return <span className="text-muted-foreground">—</span>;
    }
    if (estimated) {
        return (
            <span className="num text-xs font-medium text-muted-foreground" title="Estimated from the risk score — no bear-case target for this ticker">
                ≈ {signedPct(value)}
            </span>
        );
    }
    return (
        <span className={cn('num text-xs font-semibold', value < 0 ? 'text-down' : 'text-muted-foreground')}>
            {signedPct(value)}
        </span>
    );
}

/** Body cell classes shared by both tables: one tonal row, one hover tone. */
export const bodyCellClass =
    'px-2.5 py-3 align-middle whitespace-nowrap bg-card transition-colors first:rounded-l-md first:pl-5 last:rounded-r-md last:pr-5 group-hover:bg-muted group-focus-within:bg-muted';
