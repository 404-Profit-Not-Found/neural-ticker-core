import { cn } from '../../lib/api';

export interface PriceRangeSliderProps {
  high: number;
  low: number;
  median: number;
  value: number;
  onChange: (price: number) => void;
  className?: string;
  currency: string;
}

export function PriceRangeSlider({
  high,
  low,
  median,
  value,
  onChange,
  className,
  currency,
}: PriceRangeSliderProps) {
  const range = high - low;
  const medianPercentage = range === 0 ? 50 : ((median - low) / range) * 100;

  const formatPrice = (val: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(val);
  }

  return (
    <div className={cn("space-y-4 py-2", className)}>
      <div className="flex justify-between items-end mb-1">
        <div className="space-y-0.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Price Selection</span>
          <div className="text-xl font-mono font-bold">
            {formatPrice(value)}
          </div>
        </div>
      </div>

      <div className="relative h-6 flex items-center">
        {/* Track Background */}
        <div className="absolute w-full h-1.5 bg-muted rounded-full" />
        
        {/* Active Range Highlight */}
        <div 
          className="absolute h-1.5 bg-primary/20 rounded-full"
          style={{ 
            left: '0%', 
            right: '0%' 
          }}
        />

        {/* Median Marker */}
        <div 
          className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-muted-foreground/40 z-10"
          style={{ left: `${medianPercentage}%` }}
        >
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground whitespace-nowrap font-medium">
            MEDIAN
          </div>
        </div>

        {/* The Actual Slider Input */}
        <input
          type="range"
          min={low}
          max={high}
          step={0.01}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute w-full h-1.5 appearance-none bg-transparent cursor-pointer z-20 accent-primary"
          style={{
            WebkitAppearance: 'none',
          }}
        />
      </div>

      <div className="flex justify-between text-[10px] font-mono text-muted-foreground pt-1">
        <span>{formatPrice(low)}</span>
        <span>{formatPrice(high)}</span>
      </div>
    </div>
  );
}
