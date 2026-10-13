import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';

interface IndexQuote {
  name: string;
  symbol: string;
  val: number;
  ch: number;
}

const formatValue = (val: number): string =>
  val.toLocaleString('en-US', {
    minimumFractionDigits: val < 10 ? 4 : 2,
    maximumFractionDigits: val < 10 ? 4 : 2,
  });

/**
 * Live strip of reference markets (indices, rates, gold, BTC, EUR/USD) from
 * GET /market-data/indices. Slides continuously, pauses on hover/focus, and
 * becomes a plain swipeable row when the user prefers reduced motion.
 * Shows no numbers until real quotes exist; while they load it only holds
 * its own height.
 */
export function TickerTape({ className }: { className?: string }) {
  const { data, isPending } = useQuery({
    queryKey: ['market-indices'],
    queryFn: async (): Promise<IndexQuote[]> => {
      const res = await api.get<IndexQuote[]>('/market-data/indices');
      return Array.isArray(res.data) ? res.data : [];
    },
    // The backend caches quotes for 30s; polling faster buys nothing.
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });

  // A failed upstream quote comes back as 0 — leave it out rather than show it.
  const quotes = (data ?? []).filter((q) => q && Number(q.val) > 0);

  // Hold the band's place while the first quotes load, so the page below does
  // not jump when they arrive. Still no placeholder numbers.
  if (isPending) {
    return (
      <div aria-hidden className={cn('flex h-8 items-center gap-10 overflow-hidden bg-card/70 px-5', className)}>
        {Array.from({ length: 8 }).map((_, i) => (
          <span key={i} className="h-3 w-28 shrink-0 rounded-sm bg-muted" />
        ))}
      </div>
    );
  }
  if (quotes.length === 0) return null;

  const strip = (hidden: boolean) => (
    <ul
      className="flex shrink-0 items-center"
      aria-hidden={hidden || undefined}
    >
      {quotes.map((q) => {
        const ch = Number(q.ch) || 0;
        const flat = Math.abs(ch) < 0.005;
        return (
          <li
            key={q.symbol}
            className="flex h-8 shrink-0 items-center gap-2 px-5"
          >
            <span className="label-micro">{q.name}</span>
            <span className="num text-xs font-medium text-foreground">{formatValue(Number(q.val))}</span>
            <span
              className={cn(
                'num text-xs font-semibold',
                flat ? 'text-muted-foreground' : ch > 0 ? 'text-up' : 'text-down',
              )}
            >
              <span aria-hidden>{flat ? '■' : ch > 0 ? '▲' : '▼'} </span>
              <span className="sr-only">{flat ? 'unchanged' : ch > 0 ? 'up' : 'down'} </span>
              {Math.abs(ch).toFixed(2)}%
            </span>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div
      role="region"
      aria-label="Market indices"
      className={cn(
        'group relative bg-card/70',
        // Reduced motion: no animation, the row scrolls by hand instead.
        'overflow-hidden motion-reduce:overflow-x-auto motion-reduce:[scrollbar-width:none] motion-reduce:[&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      <div
        className="flex w-max motion-safe:animate-[tape-scroll_70s_linear_infinite] motion-safe:group-hover:[animation-play-state:paused] motion-safe:group-focus-within:[animation-play-state:paused]"
      >
        {strip(false)}
        {/* Second copy makes the loop seamless; hidden from assistive tech. */}
        <div className="flex motion-reduce:hidden">{strip(true)}</div>
      </div>
    </div>
  );
}
