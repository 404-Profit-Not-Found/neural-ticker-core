

interface SentimentGaugeProps {
  score: number; // 0 to 1
  label: string;
}

export const SentimentGauge = ({ score, label }: SentimentGaugeProps) => {
  // SVG Config
  // Score mapping: 0 -> full left (red), 1 -> full right (green)
  // Need to map score (0-1) to rotation.
  
  const needleRotation = -90 + (score * 180); // -90 (left) to 90 (right)

  return (
    <div className="relative flex flex-col items-center justify-center p-4">
        {/* Score Top Center */}
        <div className="flex flex-col items-center mb-2">
            <span className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Score</span>
            <div className="text-3xl font-bold tracking-tighter leading-none">
                {(score * 100).toFixed(0)}<span className="text-sm text-muted-foreground">%</span>
            </div>
        </div>

        {/* SVG Gauge */}
        <div className="w-48 h-28 mt-2">
             <svg className="w-full h-full" viewBox="0 0 200 110">
                {/* Track Background */}
                 <defs>
                    <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#ef4444" />
                        <stop offset="50%" stopColor="#eab308" />
                        <stop offset="100%" stopColor="#22c55e" />
                    </linearGradient>
                </defs>
                <path
                    d="M 20 100 A 80 80 0 0 1 180 100"
                    fill="none"
                    stroke="url(#gaugeGradient)"
                    strokeWidth="16"
                    strokeLinecap="round"
                />

                {/* Needle */}
                <g transform={`translate(100, 100) rotate(${needleRotation})`}>
                    {/* Pivot */}
                    <circle cx="0" cy="0" r="4" fill="#64748b" />
                    {/* Needle Shape */}
                    <path d="M -2 0 L 2 0 L 0 -75 Z" fill="#64748b" />
                </g>
             </svg>
        </div>

        {/* Label Below */}
        <div className={`mt-[-10px] px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider border ${
            score >= 0.6 ? 'bg-green-500/10 border-green-500/20 text-green-500' :
            score >= 0.4 ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-500' :
            'bg-red-500/10 border-red-500/20 text-red-500'
        }`}>
            {label}
        </div>
    </div>
  );
};
