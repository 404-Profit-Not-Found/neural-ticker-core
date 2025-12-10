import { ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '../../lib/api';

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
                const upside = ((scenario.price_mid - currentPrice) / currentPrice) * 100;
                const isPositive = upside > 0;

                return (
                    <div
                        key={scenario.scenario_type}
                        className={cn(
                            "p-4 rounded-xl border flex flex-col gap-3 relative overflow-hidden transition-all hover:shadow-md",
                            scenario.scenario_type === 'bull' && "bg-green-500/5 border-green-500/20",
                            scenario.scenario_type === 'bear' && "bg-red-500/5 border-red-500/20",
                            scenario.scenario_type === 'base' && "bg-blue-500/5 border-blue-500/20 ring-1 ring-blue-500/30"
                        )}
                    >
                        {/* Probability Badge */}
                        <div className="absolute top-3 right-3 text-xs font-bold px-2 py-1 rounded-full bg-background/50 backdrop-blur-sm border">
                            {(scenario.probability * 100).toFixed(0)}% Prob
                        </div>

                        <div className="flex items-center gap-2">
                            <div className={cn(
                                "w-2 h-8 rounded-full",
                                scenario.scenario_type === 'bull' && "bg-green-500",
                                scenario.scenario_type === 'bear' && "bg-red-500",
                                scenario.scenario_type === 'base' && "bg-blue-500"
                            )} />
                            <div>
                                <h3 className="uppercase tracking-wider text-xs font-bold text-muted-foreground">
                                    {scenario.scenario_type} CASE
                                </h3>
                                <div className="text-2xl font-bold flex items-center gap-2">
                                    ${scenario.price_mid.toFixed(2)}
                                    <span className={cn(
                                        "text-sm font-medium flex items-center",
                                        isPositive ? "text-green-500" : "text-red-500"
                                    )}>
                                        {isPositive ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                                        {Math.abs(upside).toFixed(1)}%
                                    </span>
                                </div>
                            </div>
                        </div>

                        <p className="text-sm text-muted-foreground line-clamp-3 min-h-[60px]">
                            {scenario.description}
                        </p>

                        <div className="mt-auto space-y-2">
                            <div className="flex justify-between text-xs text-muted-foreground border-t border-dashed border-border pt-2">
                                <span>Range</span>
                                <span>${scenario.price_low} - ${scenario.price_high}</span>
                            </div>
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <span>Exp. Cap</span>
                                <span>${(scenario.expected_market_cap / 1e9).toFixed(1)}B</span>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
