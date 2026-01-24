

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
        {/* SVG Gauge */}
        <div className="relative w-48 h-28 overflow-hidden">
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
             
             {/* Score Overlay */}
             <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 text-center">
                  <div className="text-3xl font-bold tracking-tighter leading-none mb-1">{(score * 100).toFixed(0)}<span className="text-sm text-muted-foreground">%</span></div>
                  <div className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                      score >= 0.6 ? 'bg-green-500/10 border-green-500/20 text-green-500' :
                      score >= 0.4 ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-500' :
                      'bg-red-500/10 border-red-500/20 text-red-500'
                  }`}>
                      {label}
                  </div>
             </div>
        </div>
        
        {/* Full Title at Bottom */}
        <div className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 text-center">
            Market Sentiment Score
        </div>
    </div>
  );
};
