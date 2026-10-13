import React from 'react';
import {
    DollarSign,
    Zap,
    PieChart,
    Swords,
    Scale
} from 'lucide-react';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '../ui/popover';

export interface RiskLightProps {
    score: number;
    className?: string;
    sentiment?: string;
    reasoning?: string;
    breakdown?: {
        financial: number;
        execution: number;
        dilution: number;
        competitive: number;
        regulatory: number;
    };
}

function FactorDetails({ factor, safeVal, colorClass }: { factor: { icon: React.ElementType; label: string; description: string }; safeVal: number; colorClass: string }) {
    return (
        <div className="space-y-2.5">
            <p className={`flex items-center gap-2 text-sm font-semibold ${colorClass}`}>
                <factor.icon className="h-4 w-4" aria-hidden />
                {factor.label} risk
            </p>

            <div className="flex items-center justify-between rounded-md bg-muted px-2.5 py-2 text-xs">
                <span className="font-medium text-muted-foreground">Risk score</span>
                <span className={`num ml-auto font-bold ${colorClass}`}>
                    {safeVal.toFixed(1)}/10
                </span>
            </div>

            <p className="text-xs leading-relaxed text-muted-foreground">
                {factor.description}
            </p>
        </div>
    );
}

export const RiskLight: React.FC<RiskLightProps> = ({
    score,
    className = '',
    breakdown
}) => {
    // User defined ranges: 1-4 low, 5-6 medium, 7-10 high
    const getColor = (val: number) => {
        if (val >= 7) return 'text-down'; // High Risk
        if (val > 4) return 'text-yellow-700 dark:text-yellow-400'; // Med Risk (5-6)
        return 'text-up'; // Low Risk (1-4)
    };
    const getLevel = (val: number) => (val >= 7 ? 'high' : val > 4 ? 'medium' : 'low');

    // Risk Factors Configuration
    const riskFactors = [
        {
            key: 'financial',
            label: 'Financial',
            short: 'Fin',
            icon: DollarSign,
            val: breakdown?.financial ?? score,
            description: 'Balance sheet health, cash burn, and solvency.'
        },
        {
            key: 'execution',
            label: 'Execution',
            short: 'Exec',
            icon: Zap,
            val: breakdown?.execution ?? score,
            description: 'Management track record and operational efficiency.'
        },
        {
            key: 'dilution',
            label: 'Dilution',
            short: 'Dilut',
            icon: PieChart,
            val: breakdown?.dilution ?? score,
            description: 'Risk of share issuance and value erosion.'
        },
        {
            key: 'competitive',
            label: 'Competitive',
            short: 'Comp',
            icon: Swords,
            val: breakdown?.competitive ?? score,
            description: 'Market position and moat durability.'
        },
        {
            key: 'regulatory',
            label: 'Regulatory',
            short: 'Reg',
            icon: Scale,
            val: breakdown?.regulatory ?? score,
            description: 'Legal compliance and governmental risks.'
        },
    ];




    // One trigger for every input type: tap / click opens the explanation and
    // it is reachable and dismissible from the keyboard (a hover-only tooltip
    // is not). The value under each icon means the strip reads without it.
    const TRIGGER =
        'group flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded-md px-1 py-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

    return (
        <div className={`min-w-0 ${className}`}>
            <p className="label-micro mb-1.5">Risk by factor <span className="normal-case tracking-normal">· 0 low – 10 high</span></p>
            <div className="-mx-1 flex flex-row justify-between gap-1 sm:justify-start sm:gap-2">
                {riskFactors.map((factor) => {
                    const safeVal = Number(factor.val ?? 0);
                    const colorClass = getColor(safeVal);

                    return (
                        <Popover key={factor.key}>
                            <PopoverTrigger asChild>
                                <button
                                    type="button"
                                    className={TRIGGER}
                                    aria-label={`${factor.label} risk ${safeVal.toFixed(1)} out of 10, ${getLevel(safeVal)}. Show details`}
                                >
                                    <factor.icon className={`h-[18px] w-[18px] ${colorClass}`} aria-hidden />
                                    <span className="label-micro leading-none">{factor.short}</span>
                                    <span className={`num text-xs font-semibold leading-none ${colorClass}`}>{safeVal.toFixed(1)}</span>
                                </button>
                            </PopoverTrigger>
                            <PopoverContent side="bottom" align="center" collisionPadding={10} className="w-[240px] border-0 shadow-xl">
                                <FactorDetails factor={factor} safeVal={safeVal} colorClass={colorClass} />
                            </PopoverContent>
                        </Popover>
                    );
                })}
            </div>
        </div>
    );
};
