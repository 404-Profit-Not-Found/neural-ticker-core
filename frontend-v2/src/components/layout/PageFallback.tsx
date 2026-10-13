import { Skeleton } from '../ui/skeleton';
import { cn } from '../../lib/utils';

/**
 * Shown while a route chunk is loading. Deliberately generic and quiet: the
 * shell (header, tab bar) stays painted, so this only has to hold the page's
 * footprint for the few frames a prefetched chunk needs to resolve.
 */
export function PageFallback({ fullScreen = false }: { fullScreen?: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading page"
      className={cn(
        'container max-w-[90rem] mx-auto px-4 py-6 md:py-8',
        fullScreen && 'min-h-dvh',
      )}
    >
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}
