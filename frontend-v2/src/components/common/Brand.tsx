import type { CSSProperties } from 'react';
import { cn } from '../../lib/utils';

interface BrandProps {
    /** Sizes the lockup: the mark is drawn in em, so it follows the font size. */
    className?: string;
    /** Extra classes for ".com" (it is muted by default). */
    suffixClassName?: string;
    suffixStyle?: CSSProperties;
}

/**
 * The wordmark. The mark IS the first letter — "[N]euralTicker.com" — never a
 * logo followed by the whole name, which reads as "N NeuralTicker". Assistive
 * technology gets the plain name.
 *
 * The boot splash in index.html draws the same lockup in plain HTML/CSS; keep
 * the two in step (mark height, gap, nudge).
 */
export function Brand({ className, suffixClassName, suffixStyle }: BrandProps) {
    return (
        <span className={cn('inline-flex items-baseline whitespace-nowrap font-bold leading-none tracking-tight', className)}>
            <span className="sr-only">NeuralTicker.com</span>
            {/* Cap height of the typeface, plus a hair of overshoot for the rounded ends. */}
            <img
                src={`${import.meta.env.BASE_URL}favicon.svg`}
                alt=""
                aria-hidden
                className="mr-[0.05em] h-[0.76em] w-auto shrink-0 translate-y-[0.02em]"
            />
            <span aria-hidden>
                euralTicker
                <span className={cn('text-muted-foreground', suffixClassName)} style={suffixStyle}>.com</span>
            </span>
        </span>
    );
}
