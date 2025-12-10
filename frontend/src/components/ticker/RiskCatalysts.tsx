
import { AlertTriangle, TrendingUp, CheckCircle2 } from 'lucide-react';

interface RiskCatalystsProps {
    catalysts: { description: string }[];
    redFlags: string[];
}

export function RiskCatalysts({ catalysts, redFlags }: RiskCatalystsProps) {
    if ((!catalysts?.length) && (!redFlags?.length)) return null;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
            {/* Catalysts */}
            <div className="bg-gradient-to-br from-green-500/5 to-transparent border border-green-500/20 rounded-lg p-4 flex flex-col h-full">
                <h3 className="text-xs font-bold text-green-500 mb-3 flex items-center gap-2 uppercase tracking-wide">
                    <TrendingUp size={14} /> Positive Catalysts
                </h3>
                {catalysts?.length > 0 ? (
                    <ul className="space-y-2 flex-1">
                        {catalysts.map((c, i) => (
                            <li key={i} className="text-xs text-foreground/90 flex items-start gap-2">
                                <CheckCircle2 size={12} className="text-green-500 shrink-0 mt-0.5" />
                                <span className="leading-snug">{c.description}</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="text-xs text-muted-foreground italic">No major catalysts detected.</div>
                )}
            </div>

            {/* Red Flags */}
            <div className="bg-gradient-to-br from-red-500/5 to-transparent border border-red-500/20 rounded-lg p-4 flex flex-col h-full">
                <h3 className="text-xs font-bold text-red-500 mb-3 flex items-center gap-2 uppercase tracking-wide">
                    <AlertTriangle size={14} /> Critical Risks
                </h3>
                {redFlags?.length > 0 ? (
                    <ul className="space-y-2 flex-1">
                        {redFlags.map((f, i) => (
                            <li key={i} className="text-xs text-foreground/90 flex items-start gap-2">
                                <span className="text-red-500 font-bold shrink-0 leading-none mt-0.5">!</span>
                                <span className="leading-snug">{f}</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="text-xs text-muted-foreground italic">No critical red flags detected.</div>
                )}
            </div>
        </div>
    );
}
