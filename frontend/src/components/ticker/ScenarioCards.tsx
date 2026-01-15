import { ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '../../lib/api';
import { Card, CardContent } from '../ui/card';

type ScenarioType = 'bull' | 'base' | 'bear';

interface Scenario {
    scenario_type: ScenarioType;
    probability: number;
    description: string;
    price_mid: number;
    price_low: number;
    price_high: number;
    expected_market_cap: number;
    key_drivers: string[];
}

interface ScenarioCardsProps {
    scenarios: Scenario[];
    currentPrice: number;
}

export function ScenarioCards({ scenarios, currentPrice }: ScenarioCardsProps) {
    // Sort logic to ensure layout order: Bear -> Base -> Bull
    const sortedScenarios = [...scenarios].sort((a, b) => {
        const order = { bear: 0, base: 1, bull: 2 };
        return order[a.scenario_type] - order[b.scenario_type];
    });

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {sortedScenarios.map((scenario) => {
                const targetPrice = Number(scenario.price_mid) || 0;
                const upside = currentPrice > 0
                    ? ((targetPrice - currentPrice) / currentPrice) * 100
                    : 0;
                const isPositive = upside > 0;

                return (
                    <Card
                        key={scenario.scenario_type}
                        className={cn(
                            "relative overflow-hidden transition-all hover:shadow-md flex flex-col",
                            scenario.scenario_type === 'bull' && "bg-green-500/5 border-green-500/20",
                            scenario.scenario_type === 'bear' && "bg-red-500/5 border-red-500/20",
                            scenario.scenario_type === 'base' && "bg-blue-500/5 border-blue-500/20 ring-1 ring-blue-500/30"
                        )}
                    >
                        {/* Grid Pattern Overlay */}
                        <div
                            className="absolute inset-0 opacity-[0.03] pointer-events-none"
                            style={{
                                backgroundImage: 'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)',
                                backgroundSize: '20px 20px',
                                color: 'var(--foreground)'
                            }}
                        />

                        {/* Probability Badge */}
                        <div className="absolute top-2 right-2 text-xs font-bold px-2 py-1 rounded-full bg-background/50 backdrop-blur-sm border z-10 shadow-sm">
                            {(!isNaN(Number(scenario.probability)))
                                ? `${(Number(scenario.probability) * 100).toFixed(0)}% Prob`
                                : '0% Prob'}
                        </div>

                        <CardContent className="p-3 flex flex-col gap-2 flex-1">
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-2">
                                    <div className={cn(
                                        "w-1.5 h-8 rounded-full",
                                        scenario.scenario_type === 'bull' && "bg-green-500",
                                        scenario.scenario_type === 'bear' && "bg-red-500",
                                        scenario.scenario_type === 'base' && "bg-blue-500"
                                    )} />
                                    <div>
                                        <h3 className="uppercase tracking-wider text-xs font-bold text-muted-foreground leading-none">
                                            {scenario.scenario_type} CASE
                                        </h3>
                                        <div className="text-lg font-bold flex items-center gap-1.5 leading-tight mt-0.5">
                                            ${targetPrice.toFixed(2)}
                                            <span className={cn(
                                                "text-sm font-medium flex items-center",
                                                isPositive ? "text-green-500" : "text-red-500"
                                            )}>
                                                {isPositive ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                                                {(!isNaN(upside)) ? Math.abs(upside).toFixed(1) : '0.0'}%
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                                {scenario.description}
                            </p>

                            <div className="mt-auto pt-2 border-t border-dashed border-border flex items-center justify-between text-xs text-muted-foreground font-medium">
                                <div className="flex gap-2">
                                    <span className="opacity-70">Range:</span>
                                    <span>${Number(scenario.price_low || 0)} - ${Number(scenario.price_high || 0)}</span>
                                </div>
                                <div className="flex gap-2">
                                    <span className="opacity-70">Cap:</span>
                                    <span>${(Number(scenario.expected_market_cap || 0) / 1e9).toFixed(1)}B</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}
