
import { TrendingUp, TrendingDown, ArrowUpCircle } from 'lucide-react';
import { ScenarioCards } from './ScenarioCards';
import type { TickerData } from '../../types/ticker';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

import { AnalystRatingsTable } from './AnalystRatingsTable';

interface TickerOverviewProps {
    risk_analysis: TickerData['risk_analysis'];
    market_data: TickerData['market_data'];
    ratings?: TickerData['ratings'];
    profile: TickerData['profile'];
}

export function TickerOverview({ risk_analysis, market_data, ratings, profile }: TickerOverviewProps) {
    return (
        <div className="flex flex-col gap-6">
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

