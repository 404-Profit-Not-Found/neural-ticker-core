
import { TrendingUp, TrendingDown, ArrowUpCircle, Zap } from 'lucide-react';
import { ScenarioCards } from './ScenarioCards';
import type { TickerData } from '../../types/ticker';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

import { AnalystRatingsTable } from './AnalystRatingsTable';

interface TickerOverviewProps {
    risk_analysis: TickerData['risk_analysis'];
    market_data: TickerData['market_data'];
    ratings?: TickerData['ratings'];
    profile: TickerData['profile'];
    news?: TickerData['news'];
}

export function TickerOverview({ risk_analysis, market_data, ratings, profile, news }: TickerOverviewProps) {
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
                <section className={`rounded-xl border p-4 ${
                    news.sentiment === 'BULLISH' ? 'bg-emerald-500/10 border-emerald-500/20' :
                    news.sentiment === 'BEARISH' ? 'bg-red-500/10 border-red-500/20' :
                    'bg-blue-500/10 border-blue-500/20'
                }`}>
                    <div className="flex items-start gap-3">
                         <div className={`mt-0.5 p-1.5 rounded-full ${
                            news.sentiment === 'BULLISH' ? 'bg-emerald-500/20 text-emerald-600' :
                            news.sentiment === 'BEARISH' ? 'bg-red-500/20 text-red-600' :
                            'bg-blue-500/20 text-blue-600'
                         }`}>
                            <Zap size={16} className="fill-current" />
                         </div>
                         <div className="space-y-1">
                            <h3 className={`text-sm font-bold flex items-center gap-2 ${
                                news.sentiment === 'BULLISH' ? 'text-emerald-500' :
                                news.sentiment === 'BEARISH' ? 'text-red-500' :
                                'text-blue-500'
                            }`}>
                                {news.score && (news.score >= 8) ? 'BREAKING NEWS' : 'MARKET NEWS'}
                                <span className={`text-[10px] px-1.5 py-0.5 rounded border border-current opacity-80`}>
                                    Impact: {news.score}/10
                                </span>
                                <span className="text-[10px] font-normal opacity-60 ml-auto">
                                    {timeAgo}
                                </span>
                            </h3>
                            <p className="text-sm text-foreground/90 leading-snug">
                                {news.summary}
                            </p>
                         </div>
                    </div>
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
                    <ScenarioCards scenarios={risk_analysis.scenarios} currentPrice={market_data?.price || 0} />
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

            {/* Analyst Ratings */}
            <AnalystRatingsTable ratings={ratings} />
        </div>
    );
}

