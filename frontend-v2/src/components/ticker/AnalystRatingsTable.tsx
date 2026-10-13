import { useState } from 'react';
import { Panel, PanelHeader } from '../ui/panel';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';
import { formatTarget } from '../../lib/format';
import { formatDate, formatDateShort, isoDateTime } from '../../lib/datetime';

/** Shape shared by the in-app composite and the public report payload. */
export interface AnalystRatingRow {
    id: string | number;
    firm: string;
    analyst_name?: string | null;
    rating: string;
    price_target?: number | null;
    rating_date: string;
}

interface AnalystRatingsTableProps {
    ratings?: AnalystRatingRow[];
    currency?: string;
    /** Rows shown before "Show all". */
    initialCount?: number;
}

type Stance = 'buy' | 'sell' | 'hold';

function classify(rating: string): { label: string; stance: Stance } {
    const lower = rating.toLowerCase();
    if (lower.includes('strong buy')) return { label: 'Strong Buy', stance: 'buy' };
    if (lower.includes('buy') || lower.includes('outperform')) return { label: 'Buy', stance: 'buy' };
    if (lower.includes('sell') || lower.includes('underperform')) return { label: 'Sell', stance: 'sell' };
    return { label: 'Hold', stance: 'hold' };
}

// The app's own rating stamps (tonal fills, no outlines).
const STANCE_VARIANT: Record<Stance, 'buy' | 'sell' | 'hold'> = { buy: 'buy', sell: 'sell', hold: 'hold' };

// One row template for both shapes: a two-line row on phones (who · when on
// the left, target over rating on the right) and four aligned columns from
// `sm` up. Nothing is wider than the panel, so nothing is ever clipped.
const ROW = 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3.5 sm:grid-cols-[7rem_minmax(0,1fr)_6.5rem_7rem] sm:gap-x-4';

export function AnalystRatingsTable({ ratings, currency = 'USD', initialCount = 6 }: AnalystRatingsTableProps) {
    const [showAll, setShowAll] = useState(false);
    if (!ratings || ratings.length === 0) return null;

    const visible = showAll ? ratings : ratings.slice(0, initialCount);
    const hidden = ratings.length - visible.length;

    return (
        <Panel aria-label="Analyst ratings">
            <PanelHeader
                title="Analyst ratings"
                actions={<span className="num text-xs text-muted-foreground">{ratings.length}</span>}
            />

            <div className={cn(ROW, 'hidden pb-1 pt-2 sm:grid')} aria-hidden>
                <span className="label-micro">Date</span>
                <span className="label-micro">Firm</span>
                <span className="label-micro">Rating</span>
                <span className="label-micro text-right">Target</span>
            </div>

            <ul className="pb-1.5">
                {visible.map((rating) => {
                    const { label, stance } = classify(rating.rating);
                    return (
                        <li key={rating.id} className={cn(ROW, 'min-h-[3.25rem] py-2')}>
                            <time
                                dateTime={isoDateTime(rating.rating_date)}
                                className="num col-start-1 row-start-1 hidden text-xs text-muted-foreground sm:block"
                            >
                                {formatDate(rating.rating_date)}
                            </time>

                            <div className="col-start-1 row-span-2 row-start-1 min-w-0 sm:col-start-2 sm:row-span-1">
                                <div className="truncate text-sm font-semibold text-foreground">{rating.firm}</div>
                                <div className="truncate text-xs text-muted-foreground">
                                    {rating.analyst_name}
                                    <span className="sm:hidden">
                                        {rating.analyst_name ? ' · ' : ''}
                                        {formatDateShort(rating.rating_date)}
                                    </span>
                                </div>
                            </div>

                            <div className="col-start-2 row-start-2 justify-self-end sm:col-start-3 sm:row-start-1 sm:justify-self-start">
                                <Badge variant={STANCE_VARIANT[stance]} data-stance={stance}>{label}</Badge>
                            </div>

                            <div className="num col-start-2 row-start-1 justify-self-end text-sm font-semibold text-foreground sm:col-start-4">
                                <span className="sr-only">Price target </span>
                                {formatTarget(rating.price_target, currency)}
                            </div>
                        </li>
                    );
                })}
            </ul>

            {(hidden > 0 || showAll) && ratings.length > initialCount && (
                <button
                    type="button"
                    onClick={() => setShowAll((v) => !v)}
                    aria-expanded={showAll}
                    className="mx-1.5 mb-1.5 flex min-h-11 w-[calc(100%-0.75rem)] items-center justify-center rounded-md px-3.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                    {showAll ? 'Show fewer' : `Show all ${ratings.length} ratings`}
                </button>
            )}
        </Panel>
    );
}
