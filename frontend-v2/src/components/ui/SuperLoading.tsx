import { Brand } from '../common/Brand';
import { cn } from '../../lib/utils';

interface SuperLoadingProps {
    /** What is happening, e.g. "Signing out". */
    text?: string;
    /** A ticker the screen is loading; shown in the status line. */
    symbol?: string;
    className?: string;
    /** Cover the whole viewport (default: everything below the app header). */
    fullScreen?: boolean;
}

/**
 * Full-screen loader. It draws exactly what the boot splash in `index.html`
 * draws — the mark, "NeuralTicker.com", one thin progress line — so the
 * hand-off from HTML to React is invisible. For a page that is loading its
 * data, prefer a skeleton shaped like the page; this is for moments when
 * there is no page yet (boot, sign-in, sign-out).
 */
export function SuperLoading({ text, symbol, className, fullScreen = false }: SuperLoadingProps) {
    const status = (text || (symbol ? `Loading ${symbol}` : 'Loading')).replace(/\.{3}$|…$/, '');

    return (
        <div
            role="status"
            aria-label={status}
            className={cn(
                fullScreen ? 'fixed inset-0 z-50' : 'fixed inset-x-0 bottom-0 top-14 z-40',
                'flex flex-col items-center justify-center gap-7 font-sans',
                className,
            )}
            style={{ backgroundColor: 'var(--boot-bg)', color: 'var(--boot-text)' }}
        >
            <Brand className="text-[28px] tracking-[-0.02em]" suffixStyle={{ color: 'var(--boot-muted)' }} />
            <div className="h-0.5 w-[168px] overflow-hidden rounded-[2px] bg-[rgb(128_128_128/0.22)]">
                <div
                    className="h-full w-[30%] motion-safe:animate-progress-bar motion-reduce:w-full motion-reduce:opacity-50"
                    style={{ backgroundColor: 'var(--boot-accent)' }}
                />
            </div>
            <p className="label-micro !text-[11px]" style={{ color: 'var(--boot-muted)' }}>
                {status}
            </p>
            <span className="num absolute bottom-6 left-6 text-[11px] font-medium" style={{ color: 'var(--boot-muted)' }}>
                v{__APP_VERSION__}
            </span>
        </div>
    );
}
