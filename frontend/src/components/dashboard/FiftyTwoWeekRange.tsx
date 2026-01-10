
import { cn } from '../../lib/api';

interface FiftyTwoWeekRangeProps {
  low: number;
  high: number;
  current: number;
  className?: string;
  showLabels?: boolean;
}

export function FiftyTwoWeekRange({ 
  low, 
  high, 
  current, 
  className,
  showLabels = true
}: FiftyTwoWeekRangeProps) {
  
  if (!low || !high || high <= low) {
    return <div className="text-xs text-muted-foreground">-</div>;
  }

  // Calculate position percentage (0 to 100)
  const range = high - low;
  const position = Math.min(100, Math.max(0, ((current - low) / range) * 100));

  return (
    <div className={cn("flex flex-col gap-1.5 w-full min-w-[140px]", className)}>
      <div className="relative h-1.5 w-full bg-secondary/30 rounded-full overflow-visible">
        {/* Track Gradient */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-red-500/20 via-yellow-500/20 to-emerald-500/20" />
        
        {/* Current Price Marker */}
        <div 
          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-primary rounded-full shadow-[0_0_10px_rgba(59,130,246,0.8)] border border-background transition-all duration-500 z-10"
          style={{ left: `${position}%`, transform: 'translate(-50%, -50%)' }}
        >
            <div className="absolute inset-0 bg-primary animate-ping opacity-20 rounded-full" />
        </div>
      </div>

      {showLabels && (
        <div className="flex justify-between items-center text-[10px] text-muted-foreground/60 font-mono leading-none">
          <span>{low.toFixed(2)}</span>
          <span className="text-foreground/80 font-bold">{((position)).toFixed(0)}%</span>
          <span>{high.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}
