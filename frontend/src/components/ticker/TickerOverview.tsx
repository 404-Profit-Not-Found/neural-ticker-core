
import { TrendingUp, TrendingDown, ArrowUpCircle, Zap } from 'lucide-react';


import { ScenarioCards } from './ScenarioCards';
import type { TickerData, NewsItem } from '../../types/ticker';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';


import { AnalystRatingsTable } from './AnalystRatingsTable';
import { TickerNews } from './TickerNews';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "../ui/accordion";

interface TickerOverviewProps {
    risk_analysis: TickerData['risk_analysis'];
    market_data: TickerData['market_data'];
    ratings?: TickerData['ratings'];
    profile: TickerData['profile'];
    news?: TickerData['news'];
    newsList?: NewsItem[];
    fundamentals?: TickerData['fundamentals'];
}

export function TickerOverview({ risk_analysis, market_data, ratings, profile, news, newsList }: TickerOverviewProps) {
    // Helper to check freshness and format time
    const getNewsStatus = (dateStr?: string) => {
        if (!dateStr) return { isFresh: false, timeAgo: '' };
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        // "Few trading days" ~ 4-5 days to account for weekends
        if (diffDays > 5) return { isFresh: false, timeAgo: '' };

        const diffHours = diffMs / (1000 * 60 * 60);
        if (diffHours < 1) return { isFresh: true, timeAgo: 'Just now' };
        if (diffHours < 24) return { isFresh: true, timeAgo: `${Math.floor(diffHours)}h ago` };
        return { isFresh: true, timeAgo: `${Math.floor(diffDays)}d ago` };
    };

    const { isFresh, timeAgo } = getNewsStatus(news?.updated_at);


    return (
        <div className="flex flex-col gap-6">
            {/* Breaking News Alert */}
            {news && (news.score || 0) >= 5 && isFresh && (
                <section className="relative">
                    {/* Interaction Wrapper */}
                    {news.research_id ? (
                        <a
                            href={`/ticker/${profile.symbol}/research/${news.research_id}`}
                            className="block group relative rounded-xl border p-0.5 overflow-hidden transition-all hover:scale-[1.005] hover:shadow-lg cursor-pointer"
                        >
                            <NewsCardContent news={news} timeAgo={timeAgo} />
                        </a>
                    ) : (
                        <div className="relative rounded-xl border p-0.5 overflow-hidden">
                            <NewsCardContent news={news} timeAgo={timeAgo} />
                        </div>
                    )}
                </section>
            )}



            {/* About Section */}
            {profile?.description && (
                <section className="space-y-3">
                    <h3 className="text-sm font-bold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
                        About {profile.symbol}
                    </h3>
                    <div className="bg-muted/10 border border-border/40 rounded-xl p-4">
                        <p className="text-sm text-foreground/80 leading-relaxed">
                            {profile.description}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-4 text-[10px]">
                            {profile.web_url && (
                                <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground/60 uppercase font-bold tracking-widest">Website</span>
                                    <a
                                        href={profile.web_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary hover:underline font-medium"
                                    >
                                        {(() => {
                                            try { return new URL(profile.web_url).hostname; }
                                            catch { return profile.web_url.replace(/^https?:\/\//, '').split('/')[0]; }
                                        })()}
                                    </a>
                                </div>
                            )}
                            {profile.exchange && (
                                <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground/60 uppercase font-bold tracking-widest">Exchange</span>
                                    <span className="font-medium text-foreground">{profile.exchange}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </section>
            )}

            {/* Scenarios - The Core View */}
            {risk_analysis?.scenarios && (
                <section>
                    <h3 className="text-sm font-bold mb-4 flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
                        <TrendingUp size={14} /> Price Scenarios & Thesis
                    </h3>
                    <ScenarioCards scenarios={risk_analysis.scenarios} currentPrice={market_data?.price || 0} currency={profile?.currency} />
                </section>
            )}

            {/* Catalysts Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Card className="border-red-500/20 bg-red-500/5">
                    <CardHeader className="pb-2 pt-3 px-3">
                        <CardTitle className="text-xs font-bold text-red-500 uppercase tracking-wide flex items-center gap-2">
                            <TrendingDown size={12} /> Risk Factors
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-3 pb-3 pt-0">
                        <ul className="space-y-1.5">
                            {risk_analysis?.red_flags?.map((f, i) => (
                                <li key={i} className="text-sm text-foreground/80 flex items-start gap-2 leading-snug">
                                    <span className="text-red-500 mt-0.5">•</span>
                                    <span>{f}</span>
                                </li>
                            ))}
                            {!risk_analysis?.red_flags?.length && <li className="text-sm text-muted-foreground italic">No critical red flags identified.</li>}
                        </ul>
                    </CardContent>
                </Card>

                <Card className="border-green-500/20 bg-green-500/5">
                    <CardHeader className="pb-2 pt-3 px-3">
                        <CardTitle className="text-xs font-bold text-green-500 uppercase tracking-wide flex items-center gap-2">
                            <ArrowUpCircle size={12} /> Growth Drivers
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-3 pb-3 pt-0">
                        <ul className="space-y-1.5">
                            {risk_analysis?.catalysts?.map((c, i) => (
                                <li key={i} className="text-sm text-foreground/80 flex items-start gap-2 leading-snug">
                                    <span className="text-green-500 mt-0.5">•</span>
                                    <span>{c.description}</span>
                                </li>
                            ))}
                            {!risk_analysis?.catalysts?.length && <li className="text-sm text-muted-foreground italic">No specific catalysts identified.</li>}
                        </ul>
                    </CardContent>
                </Card>
            </div>

            {/* Latest News (Collapsible) */}
            {news && (
                <section>
                    <Accordion type="single" collapsible className="w-full bg-muted/10 border border-border/40 rounded-xl px-4">
                        <AccordionItem value="news" className="border-b-0">
                            <AccordionTrigger className="hover:no-underline py-4">
                                <span className="text-sm font-bold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
                                    <Zap size={14} /> Latest News
                                </span>
                            </AccordionTrigger>
                            <AccordionContent className="pb-4 pt-2">
                                <TickerNews news={newsList || []} /> 
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </section>
            )}

            {/* Analyst Ratings */}
            <AnalystRatingsTable ratings={ratings} currency={profile?.currency} />
        </div>
    );
}

function NewsCardContent({ news, timeAgo }: { news: NonNullable<TickerData['news']>, timeAgo: string }) {
    const borderColor = news.sentiment === 'BULLISH' ? 'border-emerald-500/30' : news.sentiment === 'BEARISH' ? 'border-red-500/30' : 'border-blue-500/30';


    // Improved Background Logic for Contrast safety
    // Using bg-card (white/dark-gray) with a tinted overlay instead of pure 950/10
    const bgTint = news.sentiment === 'BULLISH' ? 'bg-emerald-100/50 dark:bg-emerald-950/10' :
        news.sentiment === 'BEARISH' ? 'bg-red-100/50 dark:bg-red-950/10' :
            'bg-blue-100/50 dark:bg-blue-950/10';

    const textColor = news.sentiment === 'BULLISH' ? 'text-emerald-700 dark:text-emerald-400' :
        news.sentiment === 'BEARISH' ? 'text-red-700 dark:text-red-400' :
            'text-blue-700 dark:text-blue-400';

    const iconBg = news.sentiment === 'BULLISH' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-500' :
        news.sentiment === 'BEARISH' ? 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-500' :
            'bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-500';

    const badgeStyle = news.sentiment === 'BULLISH' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400' :
        news.sentiment === 'BEARISH' ? 'bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-400' :
            'bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-400';

    return (
        <div className={`relative rounded-[10px] w-full h-full border ${borderColor}`}>
            {/* Background with Theme Support */}
            <div className={`absolute inset-0 ${bgTint}`} />

            {/* Scanline/Grid Effect - Reduced intensity */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.02)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none" />

            <div className="relative flex items-start gap-4 z-10 p-4">
                {/* Icon Box */}
                <div className={`shrink-0 p-2 rounded-lg border shadow-[0_0_15px_-3px_rgba(0,0,0,0.1)] dark:shadow-[0_0_15px_-3px_var(--shadow-color)] ${iconBg} ${news.sentiment === 'BULLISH' ? '[--shadow-color:theme(colors.emerald.500)]' :
                    news.sentiment === 'BEARISH' ? '[--shadow-color:theme(colors.red.500)]' :
                        '[--shadow-color:theme(colors.blue.500)]'
                    }`}>
                    <Zap size={20} className="fill-current animate-pulse" />
                </div>

                <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h3 className={`text-sm font-bold tracking-wide uppercase flex items-center gap-2 ${textColor}`}>
                            {news.score && (news.score >= 8) ? 'Breaking News' : 'Market Update'}
                        </h3>

                        <div className="flex items-center gap-2 ml-auto">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border shadow-sm ${badgeStyle}`}>
                                IMPACT {news.score}/10
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono">
                                {timeAgo}
                            </span>
                        </div>
                    </div>

                    <p className="text-sm md:text-base text-foreground font-medium leading-relaxed">
                        {news.summary}
                    </p>
                </div>
            </div>
        </div>
    );
}

// Re-export specific sub-components if needed externally, but here just TickerOverview


