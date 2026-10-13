import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpCircle, Bot, ChevronRight, TrendingDown, Zap } from 'lucide-react';

import { ScenarioCards } from './ScenarioCards';
import { AnalystRatingsTable, type AnalystRatingRow } from './AnalystRatingsTable';
import { TickerNews } from './TickerNews';
import type { TickerData, NewsItem } from '../../types/ticker';
import { Panel, PanelHeader, PanelBody } from '../ui/panel';
import { Badge } from '../ui/badge';
import { EmptyState } from '../ui/empty-state';
import { buttonVariants } from '../ui/button';
import { cn } from '../../lib/utils';
import { shortExchange } from '../../lib/format';
import { formatRelative, toDate } from '../../lib/datetime';
import { LINK_TEXT } from '../common/styles';

/** The news headline block of the composite (in-app) or the public payload. */
interface OverviewNews {
    sentiment?: string;
    score?: number;
    summary?: string;
    updated_at?: string;
    research_id?: string;
}

interface TickerOverviewProps {
    risk_analysis?: TickerData['risk_analysis'] | null;
    market_data: { price: number };
    ratings?: AnalystRatingRow[];
    profile: TickerData['profile'];
    news?: OverviewNews | null;
    newsList?: NewsItem[];
    fundamentals?: TickerData['fundamentals'];
    /**
     * `public` is the shared read-only report: no in-app links, no ticker
     * news list, no "run research" call to action.
     */
    variant?: 'app' | 'public';
}

// A headline is "breaking" for a few trading days (covers a weekend).
const FRESH_DAYS = 5;

function isFresh(dateStr?: string): boolean {
    const date = toDate(dateStr);
    if (!date) return false;
    return Date.now() - date.getTime() <= FRESH_DAYS * 24 * 60 * 60 * 1000;
}

export function TickerOverview({ risk_analysis, market_data, ratings, profile, news, newsList, variant = 'app' }: TickerOverviewProps) {
    const isPublic = variant === 'public';
    const symbol = profile?.symbol;
    const showHeadline = !!news && (news.score || 0) >= 5 && !!news.summary && isFresh(news.updated_at);

    return (
        <div className="flex flex-col gap-3 sm:gap-4">
            {showHeadline && news && (
                <HeadlineBanner
                    news={news}
                    to={!isPublic && news.research_id && symbol
                        ? `/ticker/${encodeURIComponent(symbol)}/research/${encodeURIComponent(news.research_id)}`
                        : undefined}
                />
            )}

            {risk_analysis ? (
                <>
                    {risk_analysis.scenarios && risk_analysis.scenarios.length > 0 && (
                        <Panel aria-label="Price scenarios">
                            <PanelHeader title="Price scenarios" led="ai" />
                            <ScenarioCards
                                scenarios={risk_analysis.scenarios}
                                currentPrice={market_data?.price || 0}
                                currency={profile?.currency}
                            />
                        </Panel>
                    )}

                    <Panel aria-label="Investment thesis">
                        <PanelHeader title="Thesis" led="ai" />
                        <div className="grid grid-cols-1 gap-y-5 px-3.5 pb-4 pt-1 sm:px-4 md:grid-cols-2 md:gap-x-8">
                            <ThesisList
                                tone="down"
                                title="Risk factors"
                                icon={<TrendingDown size={14} aria-hidden />}
                                items={risk_analysis.red_flags ?? []}
                                empty="None flagged in the latest analysis."
                            />
                            <ThesisList
                                tone="up"
                                title="Growth drivers"
                                icon={<ArrowUpCircle size={14} aria-hidden />}
                                items={(risk_analysis.catalysts ?? []).map((c) => c.description)}
                                empty="None identified in the latest analysis."
                            />
                        </div>
                    </Panel>
                </>
            ) : (
                // No analysis is not the same as "no risks": say so, and offer
                // the one action that fixes it.
                <Panel aria-label="AI analysis">
                    <PanelHeader title="AI analysis" led="off" />
                    <EmptyState
                        icon={<Bot className="h-5 w-5" />}
                        title="No AI analysis yet"
                        description={
                            isPublic
                                ? 'Price scenarios, risk factors and growth drivers appear here once this ticker has been researched.'
                                : `Price scenarios, risk factors and growth drivers appear here after the first research run on ${symbol ?? 'this ticker'}.`
                        }
                        action={
                            !isPublic && symbol ? (
                                <Link
                                    to={`/ticker/${encodeURIComponent(symbol)}/research`}
                                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-11 gap-2 lg:h-9')}
                                >
                                    <Bot size={16} aria-hidden /> Run research
                                </Link>
                            ) : undefined
                        }
                    />
                </Panel>
            )}

            <AnalystRatingsTable ratings={ratings} currency={profile?.currency} />

            {!isPublic && newsList !== undefined && (
                <Panel aria-label="Latest news">
                    <PanelHeader title="Latest news" led="info" />
                    <TickerNews news={newsList} />
                </Panel>
            )}

            {profile?.description && <AboutPanel profile={profile} />}
        </div>
    );
}

function ThesisList({ tone, title, icon, items, empty }: {
    tone: 'up' | 'down';
    title: string;
    icon: React.ReactNode;
    items: string[];
    empty: string;
}) {
    const color = tone === 'up' ? 'text-up' : 'text-down';
    const dot = tone === 'up' ? 'bg-up' : 'bg-down';
    return (
        <section className="min-w-0">
            {/* Utilities come after `.label-micro` in the cascade, so the tone wins. */}
            <h3 className={cn('label-micro flex items-center gap-1.5', color)}>
                {icon} {title}
            </h3>
            {items.length > 0 ? (
                <ul className="mt-2.5 space-y-2">
                    {items.map((item, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm leading-snug text-foreground/90">
                            <span aria-hidden className={cn('mt-[0.45rem] h-1.5 w-1.5 shrink-0', dot)} />
                            <span className="min-w-0 break-words">{item}</span>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="mt-2.5 text-sm text-muted-foreground">{empty}</p>
            )}
        </section>
    );
}

function HeadlineBanner({ news, to }: { news: OverviewNews; to?: string }) {
    const sentiment = (news.sentiment || '').toUpperCase();
    const tone = sentiment === 'BULLISH' ? 'up' : sentiment === 'BEARISH' ? 'down' : 'info';
    const text = tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-blue-700 dark:text-blue-300';
    const tint = tone === 'up' ? 'bg-up/10 hover:bg-up/15' : tone === 'down' ? 'bg-down/10 hover:bg-down/15' : 'bg-blue-500/10 hover:bg-blue-500/15';
    const stamp = tone === 'up' ? 'buy' : tone === 'down' ? 'sell' : 'invited';

    const body = (
        <>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                    <h2 className={cn('label-micro flex items-center gap-1.5', text)}>
                        <Zap size={13} className="fill-current" aria-hidden />
                        {(news.score || 0) >= 8 ? 'Breaking news' : 'Market update'}
                    </h2>
                    <Badge variant={stamp}>Impact {news.score}/10</Badge>
                    <span className="num ml-auto text-xs text-muted-foreground">{formatRelative(news.updated_at)}</span>
                </div>
                <p className="mt-2 text-sm font-medium leading-relaxed text-foreground sm:text-[15px]">{news.summary}</p>
            </div>
            {to && <ChevronRight className="h-5 w-5 shrink-0 self-center text-muted-foreground" aria-hidden />}
        </>
    );

    // One surface tinted with the news' direction; no rail, no outline.
    const shell = cn('flex gap-2 overflow-hidden rounded-md py-3 pl-3.5 pr-3.5 transition-colors sm:px-4', tint);

    return to ? (
        <Link
            to={to}
            aria-label={`${(news.score || 0) >= 8 ? 'Breaking news' : 'Market update'}: ${news.summary}. Open the research note.`}
            className={cn(shell, 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}
        >
            {body}
        </Link>
    ) : (
        <section className={shell} aria-label="Market update">{body}</section>
    );
}

function AboutPanel({ profile }: { profile: TickerData['profile'] }) {
    const [expanded, setExpanded] = useState(false);
    const description = profile.description ?? '';
    // Roughly four lines on a phone; shorter texts never show the toggle.
    const isLong = description.length > 260;

    let host: string | null = null;
    if (profile.web_url) {
        try {
            host = new URL(profile.web_url).hostname.replace(/^www\./, '');
        } catch {
            host = profile.web_url.replace(/^https?:\/\//, '').split('/')[0] || null;
        }
    }
    const exchange = shortExchange(profile.exchange);

    return (
        <Panel aria-label={`About ${profile.symbol}`}>
            <PanelHeader title={`About ${profile.symbol}`} led={null} />
            <PanelBody>
                <p className={cn('text-sm leading-relaxed text-foreground/90', isLong && !expanded && 'line-clamp-4 sm:line-clamp-none')}>
                    {description}
                </p>
                {isLong && (
                    <button
                        type="button"
                        onClick={() => setExpanded((v) => !v)}
                        aria-expanded={expanded}
                        className={cn('-ml-1 mt-1 inline-flex min-h-11 items-center rounded-md px-1 text-sm font-medium sm:hidden', LINK_TEXT)}
                    >
                        {expanded ? 'Show less' : 'Read more'}
                    </button>
                )}
                <dl className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                    {profile.industry && (
                        <div className="flex min-w-0 items-baseline gap-2">
                            <dt className="label-micro">Industry</dt>
                            <dd className="truncate text-foreground/90">{profile.industry}</dd>
                        </div>
                    )}
                    {exchange && (
                        <div className="flex items-baseline gap-2">
                            <dt className="label-micro">Exchange</dt>
                            <dd className="text-foreground/90" title={profile.exchange}>{exchange}</dd>
                        </div>
                    )}
                    {host && profile.web_url && (
                        <div className="flex min-w-0 items-baseline gap-2">
                            <dt className="label-micro">Website</dt>
                            <dd className="min-w-0">
                                <a
                                    href={profile.web_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={cn('inline-flex min-h-11 max-w-full items-center truncate font-medium underline-offset-2 hover:underline lg:min-h-0', LINK_TEXT)}
                                >
                                    {host}
                                </a>
                            </dd>
                        </div>
                    )}
                </dl>
            </PanelBody>
        </Panel>
    );
}
