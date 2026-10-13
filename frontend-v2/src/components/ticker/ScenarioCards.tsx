import { ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
    EM_DASH,
    directionClass,
    directionOf,
    formatAbsPercent,
    formatCompactCurrency,
    formatPrice,
    toNumber,
} from '../../lib/format';

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
    currency?: string;
}

const ORDER: Record<ScenarioType, number> = { bear: 0, base: 1, bull: 2 };

// Each case is a tile with a faint tint of its own colour and a matching
// label — the colour says which case it is, no rail or outline needed.
const TINT: Record<ScenarioType, string> = {
    bear: 'bg-down/[0.07]',
    base: 'bg-blue-500/[0.07]',
    bull: 'bg-up/[0.07]',
};
const LABEL: Record<ScenarioType, string> = {
    bear: 'text-down',
    base: 'text-blue-700 dark:text-blue-300',
    bull: 'text-up',
};

/**
 * Bear / base / bull price scenarios as three tinted tiles (stacked on phones
 * and tablets) — no rails, no rules. The thesis is never truncated: it is the
 * reason the number exists.
 */
export function ScenarioCards({ scenarios, currentPrice, currency = 'USD' }: ScenarioCardsProps) {
    const sorted = [...scenarios].sort(
        (a, b) => (ORDER[a.scenario_type] ?? 9) - (ORDER[b.scenario_type] ?? 9),
    );

    return (
        <div className="grid grid-cols-1 gap-2 px-2 pb-2 pt-1 lg:grid-cols-3 lg:gap-2.5 lg:px-2.5 lg:pb-2.5">
            {sorted.map((scenario) => {
                const target = toNumber(scenario.price_mid);
                const change =
                    target !== null && currentPrice > 0
                        ? ((target - currentPrice) / currentPrice) * 100
                        : null;
                const direction = directionOf(change, 1);
                const probability = toNumber(scenario.probability);
                const low = toNumber(scenario.price_low);
                const high = toNumber(scenario.price_high);
                const cap = toNumber(scenario.expected_market_cap);
                const hasRange = low !== null && high !== null && high > low;

                return (
                    <section
                        key={scenario.scenario_type}
                        className={cn('min-w-0 rounded-md p-3.5', TINT[scenario.scenario_type])}
                        aria-label={`${scenario.scenario_type} case`}
                    >

                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <h3 className={cn('label-micro', LABEL[scenario.scenario_type])}>{scenario.scenario_type} case</h3>
                                <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                    <span className="num text-lg font-bold leading-none text-foreground">
                                        {formatPrice(target, currency)}
                                    </span>
                                    <span className={cn('num inline-flex items-center gap-0.5 text-sm font-semibold', directionClass(direction))}>
                                        {direction === 'up' && <ArrowUp size={13} aria-hidden />}
                                        {direction === 'down' && <ArrowDown size={13} aria-hidden />}
                                        <span className="sr-only">
                                            {direction === 'up' ? 'up' : direction === 'down' ? 'down' : 'unchanged'}
                                        </span>
                                        {change === null ? EM_DASH : formatAbsPercent(change, 1)}
                                    </span>
                                </div>
                            </div>
                            <div className="shrink-0 text-right">
                                <span className="label-micro">Probability</span>
                                <div className="num mt-1.5 text-sm font-semibold leading-none text-foreground">
                                    {probability === null ? EM_DASH : `${(probability * 100).toFixed(0)}%`}
                                </div>
                            </div>
                        </div>

                        {scenario.description && (
                            <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                                {scenario.description}
                            </p>
                        )}

                        {(hasRange || (cap !== null && cap > 0)) && (
                            <dl className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                                {hasRange && (
                                    <div className="flex items-baseline gap-1.5 whitespace-nowrap">
                                        <dt>Range</dt>
                                        <dd className="num text-foreground/90">
                                            {formatPrice(low, currency)} – {formatPrice(high, currency)}
                                        </dd>
                                    </div>
                                )}
                                {cap !== null && cap > 0 && (
                                    <div className="flex items-baseline gap-1.5 whitespace-nowrap">
                                        <dt>Implied cap</dt>
                                        <dd className="num text-foreground/90">{formatCompactCurrency(cap, currency, 1)}</dd>
                                    </div>
                                )}
                            </dl>
                        )}
                    </section>
                );
            })}
        </div>
    );
}
