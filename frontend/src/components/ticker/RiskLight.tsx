
import { ShieldCheck, Info } from 'lucide-react';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "../ui/tooltip";

interface RiskLightProps {
    score: number;
    reasoning?: string;
}

export function RiskLight({ score, reasoning }: RiskLightProps) {
    const getColor = (s: number) => {
        if (s >= 7) return 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]';
        if (s >= 4) return 'bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]';
        return 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]';
    };

    const getLabel = (s: number) => {
        if (s >= 7) return 'High Risk';
        if (s >= 4) return 'Med Risk';
        return 'Low Risk';
    };

    return (
        <div className="flex items-center gap-3 bg-muted/30 px-3 py-2 rounded-lg border border-border/50">
            <div className="flex flex-col items-start mr-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Risk Level</span>
                <div className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full ${getColor(score)} animate-pulse`} />
                    <span className="text-sm font-bold font-mono">{score}/10</span>
                </div>
            </div>

            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <div className="cursor-help flex items-center gap-1 bg-background border border-border px-2 py-1 rounded text-xs hover:bg-muted transition-colors">
                            <span className="font-semibold">{getLabel(score)}</span>
                            <Info size={10} className="text-muted-foreground" />
                        </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[300px] p-4 text-xs leading-relaxed border-border bg-card shadow-xl">
                        <div className="font-bold mb-2 flex items-center gap-2">
                            <ShieldCheck size={14} className="text-primary" /> Risk Assessment
                        </div>
                        {reasoning || "Analysis pending..."}
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        </div>
    );
}
