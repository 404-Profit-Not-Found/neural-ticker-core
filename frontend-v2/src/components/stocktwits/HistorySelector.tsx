import { useState } from 'react';
import { ChevronDown, History } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { cn } from '../../lib/utils';
import { TINT_DOWN, TINT_NEUTRAL, TINT_UP } from '../common/styles';
import { formatCount } from '../../lib/format';
import { formatDateTime } from '../../lib/datetime';

interface Analysis {
  id: string;
  sentiment_score: number;
  sentiment_label: string;
  posts_analyzed: number;
  tokens_used: number;
  model_used: string;
  summary: string;
  highlights: {
    topics: string[];
    top_mentions: string[];
    bullish_points: string[];
    bearish_points: string[];
  };
  analysis_start: string;
  analysis_end: string;
  created_at: string;
}

interface HistorySelectorProps {
  history: Analysis[];
  currentId?: string;
  onSelect: (analysis: Analysis | null) => void;
}

function stanceClass(label: string): string {
  const lower = (label || '').toLowerCase();
  if (lower.includes('bull')) return TINT_UP;
  if (lower.includes('bear')) return TINT_DOWN;
  return TINT_NEUTRAL;
}

/** Picks which saved analysis the tab shows. */
export const HistorySelector = ({ history, currentId, onSelect }: HistorySelectorProps) => {
  const [open, setOpen] = useState(false);
  const current = history.find(h => h.id === currentId) || history[0];

  if (!current) return null;
  const isLatest = current.id === history[0]?.id;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Analysis from ${formatDateTime(current.created_at)}${isLatest ? ' (latest)' : ''}. Choose another`}
          className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-md bg-muted px-3 text-left text-sm transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-9"
        >
          <History className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="num truncate font-medium text-foreground">{formatDateTime(current.created_at)}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{isLatest ? 'Latest' : 'Earlier'}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      {/* Opens below its trigger and scrolls inside whatever height is left,
          instead of flipping up over the page header. */}
      <PopoverContent
        side="bottom"
        align="start"
        avoidCollisions={false}
        collisionPadding={12}
        className="w-[min(22rem,calc(100vw-2rem))] border-0 p-1.5 shadow-xl"
      >
        <ul className="max-h-[min(20rem,calc(var(--radix-popover-content-available-height,24rem)-0.75rem))] space-y-0.5 overflow-y-auto overscroll-contain">
          {history.map((h) => {
            const selected = h.id === currentId;
            return (
              <li key={h.id}>
                <button
                  type="button"
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => {
                    onSelect(h);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full flex-col gap-1.5 rounded-md p-2.5 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                    selected && 'bg-signal/10',
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="num text-xs font-semibold text-foreground">{formatDateTime(h.created_at)}</span>
                    <span className={cn('label-micro inline-flex h-5 items-center rounded-sm px-1.5', stanceClass(h.sentiment_label))}>
                      {h.sentiment_label}
                    </span>
                  </span>
                  <span className="line-clamp-2 text-[13px] leading-snug text-muted-foreground">{h.summary}</span>
                  <span className="num text-xs text-muted-foreground">
                    {formatCount(h.posts_analyzed)} posts{h.id === history[0]?.id ? ' · latest' : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
};
