import { useMemo, useState } from 'react';
import { ExternalLink, Newspaper } from 'lucide-react';
import type { NewsItem } from '../../types/ticker';
import { EmptyState } from '../ui/empty-state';
import { formatRelative, isoDateTime } from '../../lib/datetime';

interface TickerNewsProps {
    news: NewsItem[];
    /** Headlines shown before "Show more". */
    initialCount?: number;
    /** Hard cap on the list. */
    max?: number;
}

/**
 * Headlines for one ticker as a plain grouped list: one tappable row per
 * story, separated by spacing only — no per-row boxes, no rules.
 */
export function TickerNews({ news, initialCount = 4, max = 10 }: TickerNewsProps) {
    const [expanded, setExpanded] = useState(false);

    const sorted = useMemo(() => {
        if (!news) return [];
        // Newest first
        return [...news].sort((a, b) => Number(b.datetime) - Number(a.datetime)).slice(0, max);
    }, [news, max]);

    if (sorted.length === 0) {
        return (
            <EmptyState
                icon={<Newspaper className="h-5 w-5" />}
                title="No recent news"
                description="Headlines mentioning this ticker will appear here."
                className="py-8"
            />
        );
    }

    const visible = expanded ? sorted : sorted.slice(0, initialCount);

    return (
        <>
            <ul className="px-1.5 pb-1.5">
                {visible.map((item) => (
                    <li key={item.id}>
                        <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex min-h-14 items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        >
                            <div className="min-w-0 flex-1">
                                <div className="line-clamp-2 text-sm font-medium leading-snug text-foreground sm:line-clamp-1">
                                    {item.headline}
                                </div>
                                <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                                    <span className="label-micro truncate">{item.source}</span>
                                    <span aria-hidden>·</span>
                                    <time dateTime={isoDateTime(item.datetime)} className="num shrink-0">
                                        {formatRelative(item.datetime)}
                                    </time>
                                </div>
                            </div>
                            <ExternalLink
                                className="h-4 w-4 shrink-0 text-muted-foreground/70 transition-colors group-hover:text-foreground"
                                aria-hidden
                            />
                            <span className="sr-only">(opens in a new tab)</span>
                        </a>
                    </li>
                ))}
            </ul>
            {sorted.length > initialCount && (
                <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    aria-expanded={expanded}
                    className="mx-1.5 mb-1.5 flex min-h-11 w-[calc(100%-0.75rem)] items-center justify-center rounded-md px-3.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                    {expanded ? 'Show fewer' : `Show ${sorted.length - initialCount} more`}
                </button>
            )}
        </>
    );
}
