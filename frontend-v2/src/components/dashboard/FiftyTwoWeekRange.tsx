import { cn } from '../../lib/api';
import { EM_DASH, formatPrice } from '../../lib/format';

interface FiftyTwoWeekRangeProps {
  low: number;
  high: number;
  current: number;
  className?: string;
  showLabels?: boolean;
  /** Print "52W" beside the position. Off where a column head already says it. */
  caption?: boolean;
}

export function FiftyTwoWeekRange({
  low,
  high,
  current,
  className,
  showLabels = true,
  caption = true,
  currency = 'USD'
}: FiftyTwoWeekRangeProps & { currency?: string }) {
  if (!low || !high || high <= low) {
    return <div className="num text-xs text-muted-foreground">{EM_DASH}</div>;
  }

  // Calculate position percentage (0 to 100)
  const range = high - low;
  const position = Math.min(100, Math.max(0, ((current - low) / range) * 100));

  // Native-only render — no conversion. Show the currency the stock trades in.
  // Real prices (two decimals, four below 1) rather than a rounded "$0.1".
  const format = (val: number) => formatPrice(val, currency, { compact: true });

  return (
    <div className={cn("flex flex-col gap-1.5 w-full min-w-[140px]", className)}>
      <div
        className="relative h-1.5 w-full bg-secondary/40 overflow-visible"
        role="img"
        aria-label={`Price is at ${position.toFixed(0)}% of its 52-week range, ${format(low)} to ${format(high)}`}
      >
        {/* Track: low (red) → high (green) */}
        <div className="absolute inset-0 bg-gradient-to-r from-down/40 via-yellow-500/30 to-up/40" />

        {/* Current price: a crisp marker, no perpetual animation */}
        <div
          className="absolute top-1/2 z-10 h-3 w-1 bg-signal transition-[left] duration-500"
          // Clamped so the marker never hangs off either end of the track.
          style={{ left: `clamp(2px, ${position}%, calc(100% - 2px))`, transform: 'translate(-50%, -50%)' }}
        />
      </div>

      {showLabels && (
        <div className="num flex items-center justify-between text-[11px] leading-none text-muted-foreground">
          <span>{format(low)}</span>
          <span className="text-foreground/90">
            {caption && <span className="font-sans text-muted-foreground">52W </span>}
            <span className="font-semibold">{position.toFixed(0)}%</span>
          </span>
          <span>{format(high)}</span>
        </div>
      )}
    </div>
  );
}
