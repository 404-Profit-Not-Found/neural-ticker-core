import { Brand } from '../common/Brand';
import { cn } from '../../lib/utils';

interface SuperLoadingProps {
    /** What is happening, e.g. "Signing out". */
    text?: string;
    /** A ticker being opened: shown in place of the wordmark. */
    symbol?: string;
    className?: string;
    /** Cover the whole viewport (default: everything below the app header). */
    fullScreen?: boolean;
}

// [left %, bottom %, height %, rising] — the same eleven candles as the boot
// splash in index.html.
const CANDLES: ReadonlyArray<readonly [number, number, number, boolean]> = [
    [5, 30, 35, true],
    [13, 40, 25, false],
    [21, 45, 30, true],
    [29, 50, 15, false],
    [37, 48, 40, true],
    [45, 70, 25, true],
    [53, 55, 35, false],
    [61, 40, 20, false],
    [69, 42, 15, true],
    [77, 48, 45, true],
    [85, 75, 20, true],
];

/**
 * The loading screen: the wordmark over a candlestick chart that draws
 * itself, a status line and a progress bar, on a faint grid.
 *
 * It renders the `.boot-*` classes that index.html defines for the boot
 * splash — the styles live there, in one place, because the splash paints
 * before the app's stylesheet exists. Same markup, same rules: the hand-off
 * from HTML to React cannot be seen.
 *
 * For a page that is loading its data, prefer a skeleton shaped like the
 * page; this is for moments when there is no page yet (boot, sign-in,
 * sign-out, opening a ticker).
 */
export function SuperLoading({ text, symbol, className, fullScreen = false }: SuperLoadingProps) {
    const status = (text || (symbol ? `Loading ${symbol}` : 'Loading')).replace(/\.{3}$|…$/, '');

    return (
        <div
            role="status"
            aria-label={status}
            className={cn('boot font-sans', fullScreen ? 'boot--app' : 'boot--below-header', className)}
        >
            <div className="boot-backdrop" aria-hidden />
            <div className="boot-content">
                {symbol ? (
                    <p className="boot-brand boot-brand--symbol" aria-hidden>{symbol}</p>
                ) : (
                    <Brand className="boot-brand" suffixStyle={{ color: 'var(--boot-muted)' }} />
                )}
                <div className="boot-chart" aria-hidden>
                    {CANDLES.map(([left, bottom, height, rising], i) => (
                        <span
                            key={left}
                            className={cn('boot-candle', rising ? 'up' : 'down')}
                            style={{
                                left: `${left}%`,
                                bottom: `${bottom}%`,
                                height: `${height}%`,
                                animationDelay: `${((i + 1) * 0.1).toFixed(1)}s`,
                            }}
                        />
                    ))}
                </div>
                <p className="boot-status">{status}</p>
                <div className="boot-bar"><div /></div>
            </div>
            <span className="boot-version">v{__APP_VERSION__}</span>
        </div>
    );
}
