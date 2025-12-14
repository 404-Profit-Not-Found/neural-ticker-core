import React from 'react';
import {
    Activity,
    DollarSign,
    Zap,
    PieChart,
    Swords,
    Scale
} from 'lucide-react';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '../ui/tooltip';
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

export const RiskLight: React.FC<RiskLightProps> = ({
    score,
    className = '',
    reasoning,
    breakdown
}) => {
    // User defined ranges: 1-4 Green, 5-6 Yellow, 7-10 Red
    const getColor = (val: number) => {
        if (val >= 7) return 'text-red-500'; // High Risk
        if (val > 4) return 'text-yellow-500'; // Med Risk (5-6)
        return 'text-green-500'; // Low Risk (1-4)
    };

    // Risk Factors Configuration
    const riskFactors = [
        {
            key: 'financial',
            label: 'Financial',
            icon: DollarSign,
            val: breakdown?.financial ?? score,
            description: 'Balance sheet health, cash burn, and solvency.'
        },
        {
            key: 'execution',
            label: 'Execution',
            icon: Zap,
            val: breakdown?.execution ?? score,
            description: 'Management track record and operational efficiency.'
        },
        {
            key: 'dilution',
            label: 'Dilution',
            icon: PieChart,
            val: breakdown?.dilution ?? score,
            description: 'Risk of share issuance and value erosion.'
        },
        {
            key: 'competitive',
            label: 'Competitive',
            icon: Swords,
            val: breakdown?.competitive ?? score,
            description: 'Market position and moat durability.'
        },
        {
            key: 'regulatory',
            label: 'Regulatory',
            icon: Scale,
            val: breakdown?.regulatory ?? score,
            description: 'Legal compliance and governmental risks.'
        },
    ];

    const overallScore = Number(score) || 0;
    const overallColor = getColor(overallScore);

    // --- REUSABLE CONTENT COMPONENTS ---
    // Defined outside the map simply for clarity, but using closures for props

    const OverallContentNode = () => (
        <div className="space-y-3">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className={`font-bold text-sm ${overallColor}`}>Overall Risk</p>
                    <p className="text-[10px] text-muted-foreground">Composite Assessment</p>
                </div>
            </div>

            <div className={`flex items-center gap-2 p-2 rounded bg-muted/30`}>
                <Activity className={`w-4 h-4 ${overallColor}`} />
                <span className="text-xs font-medium">Score:</span>
                <span className={`font-mono font-bold ml-auto ${overallColor}`}>
                    {overallScore.toFixed(1)}/10
                </span>
            </div>

            <p className="text-xs text-foreground/80 leading-relaxed border-t pt-2 mt-2">
                {reasoning || "Aggregated risk score based on all analyzed factors."}
            </p>
        </div>
    );

    const FactorContentNode = ({ factor, safeVal, colorClass }: any) => (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <p className={`font-bold text-sm flex items-center gap-2 ${colorClass}`}>
                    <factor.icon className="w-4 h-4" />
                    {factor.label} Risk
                </p>
            </div>

            <div className="flex items-center justify-between text-xs bg-muted/30 p-2 rounded">
                <span className="text-muted-foreground font-medium">Impact Score</span>
                <span className={`font-mono font-bold ml-auto ${colorClass}`}>
                    {safeVal.toFixed(1)}/10
                </span>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
                {factor.description}
            </p>
        </div>
    );

    return (
        <TooltipProvider delayDuration={0}>
            <div className={`flex flex-row items-center gap-6 ${className}`}>

                {/* --- OVERALL INDICATOR --- */}
                {/* Mobile: Popover */}
                <div className="md:hidden">
                    <Popover>
                        <PopoverTrigger asChild>
                            <button type="button" className="group flex flex-col items-center justify-center p-1.5 rounded-md transition-colors active:bg-muted/50 focus:outline-none">
                                <Activity className={`w-5 h-5 mb-0.5 ${overallColor}`} />
                                <span className={`text-sm font-bold font-mono ${overallColor}`}>
                                    {overallScore.toFixed(1)}
                                </span>
                            </button>
                        </PopoverTrigger>
                        <PopoverContent side="bottom" align="center" collisionPadding={10} className="w-[280px]">
                            <OverallContentNode />
                        </PopoverContent>
                    </Popover>
                </div>
                {/* Desktop: Tooltip */}
                <div className="hidden md:block">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button type="button" className="group flex flex-col items-center justify-center p-1.5 rounded-md transition-colors hover:bg-muted/50 cursor-help focus:outline-none">
                                <Activity className={`w-5 h-5 mb-0.5 ${overallColor}`} />
                                <span className={`text-sm font-bold font-mono ${overallColor}`}>
                                    {overallScore.toFixed(1)}
                                </span>
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" align="center" collisionPadding={10} className="max-w-[300px] p-4">
                            <OverallContentNode />
                        </TooltipContent>
                    </Tooltip>
                </div>


                {/* Vertical Divider */}
                <div className="h-6 w-px bg-border/20" />


                {/* --- INDIVIDUAL FACTORS --- */}
                <div className="flex flex-row gap-5">
                    {riskFactors.map((factor) => {
                        const safeVal = Number(factor.val ?? 0);
                        const colorClass = getColor(safeVal);

                        return (
                            <React.Fragment key={factor.key}>
                                {/* Mobile: Popover */}
                                <div className="md:hidden">
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <button type="button" className="group flex flex-col items-center gap-1.5 transition-transform active:scale-95 focus:outline-none">
                                                <factor.icon className={`w-5 h-5 ${colorClass}`} />
                                                <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                                                    {factor.label.slice(0, 3)}
                                                </span>
                                            </button>
                                        </PopoverTrigger>
                                        <PopoverContent side="bottom" align="center" collisionPadding={10} className="w-[240px]">
                                            <FactorContentNode factor={factor} safeVal={safeVal} colorClass={colorClass} />
                                        </PopoverContent>
                                    </Popover>
                                </div>

                                {/* Desktop: Tooltip */}
                                <div className="hidden md:block">
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <button type="button" className="group flex flex-col items-center gap-1.5 cursor-help transition-transform hover:scale-110 focus:outline-none rounded-md p-0.5">
                                                <factor.icon className={`w-5 h-5 ${colorClass}`} />
                                                <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                                                    {factor.label.slice(0, 3)}
                                                </span>
                                            </button>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom" align="center" collisionPadding={10} className="p-3 w-[220px]">
                                            <FactorContentNode factor={factor} safeVal={safeVal} colorClass={colorClass} />
                                        </TooltipContent>
                                    </Tooltip>
                                </div>
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>
        </TooltipProvider>
    );
};
