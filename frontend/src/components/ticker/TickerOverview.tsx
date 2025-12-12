
import { TrendingUp, TrendingDown, ArrowUpCircle } from 'lucide-react';
import { ScenarioCards } from './ScenarioCards';
import type { TickerData } from '../../types/ticker';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

interface TickerOverviewProps {
    risk_analysis: TickerData['risk_analysis'];
    market_data: TickerData['market_data'];
}

export function TickerOverview({ risk_analysis, market_data }: TickerOverviewProps) {
    return (
        <div className="flex flex-col gap-6">
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="border-green-500/20 bg-green-500/5">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-xs font-bold text-green-500 uppercase tracking-wide flex items-center gap-2">
                            <ArrowUpCircle size={14} /> Growth Drivers
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="space-y-2">
                            {risk_analysis?.catalysts?.map((c, i) => (
                                <li key={i} className="text-sm text-foreground/80 flex items-start gap-2">
                                    <span className="text-green-500 mt-1.5">•</span>
                                    <span className="leading-relaxed">{c.description}</span>
                                </li>
                            ))}
                            {!risk_analysis?.catalysts?.length && <li className="text-sm text-muted-foreground italic">No specific catalysts identified.</li>}
                        </ul>
                    </CardContent>
                </Card>

                <Card className="border-red-500/20 bg-red-500/5">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-xs font-bold text-red-500 uppercase tracking-wide flex items-center gap-2">
                            <TrendingDown size={14} /> Risk Factors
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="space-y-2">
                            {risk_analysis?.red_flags?.map((f, i) => (
                                <li key={i} className="text-sm text-foreground/80 flex items-start gap-2">
                                    <span className="text-red-500 mt-1.5">•</span>
                                    <span className="leading-relaxed">{f}</span>
                                </li>
                            ))}
                            {!risk_analysis?.red_flags?.length && <li className="text-sm text-muted-foreground italic">No critical red flags identified.</li>}
                        </ul>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
