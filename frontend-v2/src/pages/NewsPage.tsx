import { useMemo, useState } from 'react';
import { ExternalLink, Newspaper } from 'lucide-react';
import { Panel } from '../components/ui/panel';
import { PageHeader } from '../components/ui/page-header';
import { SegmentedControl } from '../components/ui/segmented';
import { EmptyState } from '../components/ui/empty-state';
import { Skeleton } from '../components/ui/skeleton';
import { useGeneralNews, type GeneralNewsItem } from '../hooks/useNews';
import { formatDateTime, formatRelative, isoDateTime } from '../lib/datetime';

const ALL = 'all';
const MAX_RELATED = 4;

function relatedSymbols(item: GeneralNewsItem): string[] {
    return (item.related || '')
        .split(',')
        .map((symbol) => symbol.trim())
        .filter(Boolean);
}

/** A fixed-size slot, so headlines line up whether or not a story has art. */
function Thumbnail({ item }: { item: GeneralNewsItem }) {
    const [failed, setFailed] = useState(false);
    const src = item.image || item.image_url;
    return (
        <div className="flex h-14 w-[4.5rem] shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted sm:h-20 sm:w-28" aria-hidden>
            {src && !failed ? (
                <img
                    src={src}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                    onError={() => setFailed(true)}
                />
            ) : (
                <span className="text-lg font-semibold text-muted-foreground">{(item.source || '?').charAt(0).toUpperCase()}</span>
            )}
        </div>
    );
}

export function NewsPage() {
    // Same cache entry as the dashboard's news column.
    const { data: news, isLoading, isError, refetch } = useGeneralNews();
    const [category, setCategory] = useState<string>(ALL);

    const categories = useMemo(() => {
        const seen = new Set<string>();
        for (const item of news ?? []) {
            if (item.category) seen.add(item.category);
        }
        return [...seen];
    }, [news]);

    const visible = useMemo(
        () => (news ?? []).filter((item) => category === ALL || item.category === category),
        [news, category],
    );

    return (
        <div className="min-h-page bg-background font-sans text-foreground">
            <main className="container mx-auto max-w-[80rem] space-y-4 px-4 py-4 sm:space-y-5 sm:py-6 animate-in fade-in duration-300">
                <PageHeader
                    title="Market news"
                    icon={<Newspaper className="h-6 w-6" />}
                    description="Headlines from the wires, newest first."
                />

                {/* Only worth a control when the feed really has more than one desk.
                    The strip scrolls inside itself; the page never does. */}
                {categories.length > 1 && (
                    <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        <SegmentedControl
                            label="News category"
                            className="w-max [&>button]:min-h-11 lg:[&>button]:min-h-8"
                            value={category}
                            onChange={setCategory}
                            options={[
                                { value: ALL, label: 'All' },
                                ...categories.map((c) => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) })),
                            ]}
                        />
                    </div>
                )}

                <Panel aria-label="News" aria-busy={isLoading || undefined}>
                    {isLoading ? (
                        <div className="grid grid-cols-1 gap-x-6 p-1.5 lg:grid-cols-2">
                            {Array.from({ length: 8 }, (_, i) => (
                                <div key={i} className="flex gap-3 px-2 py-2.5 sm:gap-4">
                                    <Skeleton className="h-14 w-[4.5rem] shrink-0 sm:h-20 sm:w-28" />
                                    <div className="min-w-0 flex-1 space-y-2 py-1">
                                        <Skeleton className="h-3 w-1/3" />
                                        <Skeleton className="h-4 w-11/12" />
                                        <Skeleton className="h-4 w-2/3" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : isError ? (
                        <EmptyState
                            role="alert"
                            icon={<Newspaper className="h-5 w-5" />}
                            title="Couldn’t load the news"
                            description="Check your connection and try again."
                            action={
                                <button
                                    type="button"
                                    onClick={() => refetch()}
                                    className="inline-flex h-11 items-center rounded-md bg-muted px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-9"
                                >
                                    Try again
                                </button>
                            }
                        />
                    ) : visible.length === 0 ? (
                        <EmptyState
                            icon={<Newspaper className="h-5 w-5" />}
                            title="No news right now"
                            description="New headlines appear here as they are published."
                        />
                    ) : (
                        <ul className="grid grid-cols-1 gap-x-6 p-1.5 lg:grid-cols-2">
                            {visible.map((item) => {
                                const related = relatedSymbols(item);
                                return (
                                    <li
                                        key={item.id}
                                        className="group relative flex min-w-0 gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-muted focus-within:bg-muted sm:gap-4"
                                    >
                                        <Thumbnail item={item} />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                                                <span className="label-micro truncate text-foreground/80">{item.source}</span>
                                                <span aria-hidden>·</span>
                                                <time dateTime={isoDateTime(item.datetime)} title={formatDateTime(item.datetime)} className="num shrink-0">
                                                    {formatRelative(item.datetime)}
                                                </time>
                                            </div>
                                            <h2 className="mt-1 text-[15px] font-semibold leading-snug text-foreground">
                                                {/* The headline link covers the whole row. */}
                                                <a
                                                    href={item.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="line-clamp-3 after:absolute after:inset-0 after:rounded-md focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring sm:line-clamp-2"
                                                >
                                                    {item.headline}
                                                    <span className="sr-only"> (opens in a new tab)</span>
                                                </a>
                                            </h2>
                                            {item.summary && (
                                                // A phone row is headline-first; the summary joins from `sm`.
                                                <p className="mt-1 hidden text-[13px] leading-relaxed text-muted-foreground sm:line-clamp-2">{item.summary}</p>
                                            )}
                                            {related.length > 0 && (
                                                // Plain text on purpose: the feed can name symbols the
                                                // app does not track, and opening an unknown ticker page
                                                // asks the backend to create it and queue research.
                                                <p className="num mt-1.5 truncate text-xs font-semibold text-foreground/80">
                                                    <span className="sr-only">Related tickers: </span>
                                                    {related.slice(0, MAX_RELATED).join(' · ')}
                                                    {related.length > MAX_RELATED && (
                                                        <span className="font-normal text-muted-foreground"> +{related.length - MAX_RELATED}</span>
                                                    )}
                                                </p>
                                            )}
                                        </div>
                                        <ExternalLink className="mt-0.5 hidden h-4 w-4 shrink-0 text-muted-foreground/70 transition-colors group-hover:text-foreground sm:block" aria-hidden />
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </Panel>
            </main>
        </div>
    );
}
