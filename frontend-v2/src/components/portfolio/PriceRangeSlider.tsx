import { useId, useState } from 'react';
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

/**
 * Pick the execution price inside a day's low–high range.
 *
 * The slider is for a quick pick; the field beside the figure is for an exact
 * price, which a 0.01 step on a phone-width track cannot hit. A price outside
 * the range is not silently pinned to the end of the track — it is said so.
 */
export function PriceRangeSlider({
  high,
  low,
  median,
  value,
  onChange,
  className,
  currency,
}: PriceRangeSliderProps) {
  const fieldId = useId();
  const range = high - low;
  const medianPercentage = range === 0 ? 50 : ((median - low) / range) * 100;
  const outOfRange = range > 0 && (value < low - 0.005 || value > high + 0.005);

  const formatPrice = (val: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(val);
  }

  // The field holds free text only while typing; otherwise it shows the value.
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const parsed = parseFloat(draft.replace(',', '.'));
    setDraft(null);
    if (Number.isFinite(parsed) && parsed > 0) onChange(Math.round(parsed * 100) / 100);
  };

  return (
    <div className={cn("space-y-3 py-2", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <span className="label-micro">Price Selection</span>
          <div className="num text-xl font-bold">
            {formatPrice(value)}
          </div>
        </div>
        <div className="shrink-0">
          <label htmlFor={fieldId} className="label-micro mb-1 block text-right">Exact price</label>
          <input
            id={fieldId}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={draft ?? (Number.isFinite(value) ? value.toFixed(2) : '')}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              }
            }}
            className="num h-9 w-28 rounded-md bg-muted px-3 text-right text-sm text-foreground hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      {/* 44px tall so the thumb can be grabbed on a phone; the track itself stays thin. */}
      <div className="relative isolate flex h-11 items-center">
        {/* Track */}
        <div className="absolute h-1.5 w-full rounded-full bg-raised" />

        {/* Median Marker */}
        <div
          className="absolute top-1/2 z-10 h-4 w-0.5 -translate-y-1/2 bg-muted-foreground/60"
          style={{ left: `${medianPercentage}%` }}
        >
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium text-muted-foreground">
            MEDIAN
          </div>
        </div>

        {/* The Actual Slider Input */}
        <input
          type="range"
          aria-label="Price"
          min={low}
          max={high}
          step={0.01}
          value={value}
          onChange={(e) => {
            setDraft(null);
            onChange(parseFloat(e.target.value));
          }}
          className={cn(
            "absolute z-20 h-11 w-full cursor-pointer appearance-none bg-transparent focus-visible:outline-none",
            "[&::-webkit-slider-runnable-track]:h-11 [&::-webkit-slider-runnable-track]:bg-transparent",
            "[&::-webkit-slider-thumb]:mt-[11px] [&::-webkit-slider-thumb]:h-[22px] [&::-webkit-slider-thumb]:w-[22px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-md",
            "[&::-moz-range-thumb]:h-[22px] [&::-moz-range-thumb]:w-[22px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary",
            "focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-ring",
          )}
          style={{
            WebkitAppearance: 'none',
          }}
        />
      </div>

      <div className="num flex justify-between text-[11px] text-muted-foreground">
        <span>{formatPrice(low)}</span>
        <span>{formatPrice(high)}</span>
      </div>
      {outOfRange && (
        <p className="text-xs text-muted-foreground">
          {formatPrice(value)} is outside this day&apos;s range, so the slider cannot show it.
        </p>
      )}
    </div>
  );
}
