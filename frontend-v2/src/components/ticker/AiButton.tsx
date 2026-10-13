import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Bot, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';

interface AiButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    /** Show the working spinner instead of the icon. */
    busy?: boolean;
}

/**
 * The one "run AI" button (research, social analysis). Violet is the colour
 * of AI-generated things (DESIGN.md §1); it is a flat fill — no gradient, no
 * glow — and the same size and wording wherever the action appears.
 */
export const AiButton = forwardRef<HTMLButtonElement, AiButtonProps>(
    ({ busy, className, children, type = 'button', ...props }, ref) => (
        <button
            ref={ref}
            type={type}
            className={cn(
                'inline-flex h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-violet-600 px-4 text-sm font-semibold text-white transition-colors duration-150 hover:bg-violet-500 active:translate-y-px',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                'disabled:pointer-events-none disabled:opacity-50 lg:h-9',
                className,
            )}
            {...props}
        >
            {busy ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden /> : <Bot className="h-4 w-4" aria-hidden />}
            {children}
        </button>
    ),
);
AiButton.displayName = 'AiButton';
