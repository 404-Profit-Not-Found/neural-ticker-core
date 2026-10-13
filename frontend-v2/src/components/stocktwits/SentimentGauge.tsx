import { useId } from 'react';
import { cn } from '../../lib/utils';
import { TINT_DOWN, TINT_NEUTRAL, TINT_UP } from '../common/styles';

interface SentimentGaugeProps {
  score: number; // 0 to 1
  label: string;
}

type Stance = 'bullish' | 'bearish' | 'neutral';

function stanceOf(label: string, score: number): Stance {
  const lower = (label || '').toLowerCase();
  if (lower.includes('bull')) return 'bullish';
  if (lower.includes('bear')) return 'bearish';
  if (lower.includes('neutral') || lower.includes('mixed')) return 'neutral';
  // No usable label: fall back to the score bands.
  return score >= 0.6 ? 'bullish' : score <= 0.4 ? 'bearish' : 'neutral';
}

// The stamp takes its colour from the *label* it prints. It used to be
// coloured by score thresholds, so a "Bullish" label with a low score came
// out red.
const STANCE_CLASS: Record<Stance, string> = {
  bullish: TINT_UP,
  bearish: TINT_DOWN,
  neutral: TINT_NEUTRAL,
};

export const SentimentGauge = ({ score, label }: SentimentGaugeProps) => {
  const gradientId = useId();
  const value = Math.min(1, Math.max(0, Number(score) || 0));
  // 0 → full left (bearish), 1 → full right (bullish)
  const needleRotation = -90 + value * 180;
  const stance = stanceOf(label, value);

  return (
    <div className="flex flex-col items-center">
      <div className="h-[84px] w-40">
        <svg className="h-full w-full" viewBox="0 0 200 105" role="img" aria-label={`Sentiment score ${(value * 100).toFixed(0)} out of 100, ${label}`}>
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgb(var(--down))" />
              <stop offset="50%" stopColor="#eab308" />
              <stop offset="100%" stopColor="rgb(var(--up))" />
            </linearGradient>
          </defs>
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke={`url(#${gradientId})`} strokeWidth="14" strokeLinecap="round" />
          <g transform={`translate(100, 100) rotate(${needleRotation})`}>
            <circle cx="0" cy="0" r="5" fill="rgb(var(--foreground))" />
            <path d="M -2.5 0 L 2.5 0 L 0 -70 Z" fill="rgb(var(--foreground))" />
          </g>
        </svg>
      </div>

      <div className="mt-2 flex items-center gap-2.5">
        <div className="num text-3xl font-bold leading-none tracking-tight text-foreground">
          {(value * 100).toFixed(0)}<span className="text-sm font-medium text-muted-foreground">/100</span>
        </div>
        <span className={cn('label-micro inline-flex h-[22px] items-center rounded-sm px-1.5', STANCE_CLASS[stance])}>
          {label}
        </span>
      </div>
    </div>
  );
};
