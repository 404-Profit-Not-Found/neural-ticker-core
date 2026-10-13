import { useEffect, useRef, useState, type HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

interface ScrollXProps extends HTMLAttributes<HTMLDivElement> {
  /** Names the scrollable region for assistive tech, e.g. "Analyst ratings". */
  label: string;
  /** Surface behind the content, so the edge fade blends into it. */
  surface?: 'card' | 'background' | 'muted';
  /** Classes for the scrolling element itself (padding, snap…). */
  innerClassName?: string;
}

const FADE: Record<NonNullable<ScrollXProps['surface']>, string> = {
  card: 'from-card',
  background: 'from-background',
  muted: 'from-muted',
};

/**
 * Horizontal scroll container for content that cannot shrink (data tables,
 * markdown tables). The page never scrolls sideways (DESIGN.md §6): the wide
 * thing scrolls inside this box, and a fade on the edge that still has content
 * tells the user there is more.
 */
export function ScrollX({ label, surface = 'card', className, innerClassName, children, ...props }: ScrollXProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      const left = el.scrollLeft > 1;
      const right = max > 1 && el.scrollLeft < max - 1;
      setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
    };

    // The observer reports once on observe(), which is the initial measure.
    const observer = new ResizeObserver(update);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    el.addEventListener('scroll', update, { passive: true });

    return () => {
      observer.disconnect();
      el.removeEventListener('scroll', update);
    };
  }, []);

  const scrollable = edges.left || edges.right;

  return (
    <div className={cn('relative min-w-0 max-w-full', className)} {...props}>
      <div
        ref={ref}
        role="region"
        aria-label={label}
        // A scrollable region must be reachable by keyboard to be scrolled.
        tabIndex={scrollable ? 0 : undefined}
        className={cn(
          'overflow-x-auto overscroll-x-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          innerClassName,
        )}
      >
        {children}
      </div>
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r to-transparent transition-opacity duration-150',
          FADE[surface],
          edges.left ? 'opacity-100' : 'opacity-0',
        )}
      />
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l to-transparent transition-opacity duration-150',
          FADE[surface],
          edges.right ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  );
}
