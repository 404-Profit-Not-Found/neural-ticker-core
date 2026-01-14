import { cn } from '../../lib/utils';

interface SuperLoadingProps {
    text?: string;
    symbol?: string;
    className?: string; // Allow overwriting styles if needed
    fullScreen?: boolean;
}

export function SuperLoading({ text, symbol, className, fullScreen = false }: SuperLoadingProps) {
    const displayTitle = symbol || "Neural Ticker";
    const statusText = text || "Loading...";

    // Determine positioning: Full screen (top-0 z-50) or below header (top-14 z-40)
    const positionClass = fullScreen ? "fixed inset-0 z-50" : "fixed left-0 right-0 bottom-0 top-14 z-40";

    return (
        <div
            className={cn(positionClass, "flex flex-col items-center justify-center text-foreground font-sans overflow-hidden", className)}
            style={{ backgroundColor: 'var(--boot-bg)' }}
        >

            {/* --- BACKGROUND (Matches index.html exactly) --- */}
            <div className="absolute inset-0 z-0 pointer-events-none select-none">
                {/* Grid - Universal Gray for Light/Dark visibility */}
                <div
                    className="absolute inset-0"
                    style={{
                        backgroundImage: `
                            linear-gradient(var(--boot-grid, rgba(128, 128, 128, 0.05)) 1px, transparent 1px), 
                            linear-gradient(90deg, var(--boot-grid, rgba(128, 128, 128, 0.05)) 1px, transparent 1px)
                        `,
                        backgroundSize: '28px 28px',
                        backgroundPosition: 'center top'
                    }}
                ></div>

                {/* Blobs - Desaturated & Low Opacity */}
                <div
                    className="absolute inset-0"
                    style={{
                        backgroundImage: `
                            radial-gradient(circle at 15% 20%, var(--boot-blob, rgba(148, 163, 184, 0.08)), transparent 35%),
                            radial-gradient(circle at 80% 0%, var(--boot-blob-2, rgba(148, 163, 184, 0.06)), transparent 30%)
                        `,
                        backgroundRepeat: 'no-repeat',
                        backgroundSize: '100% 100%'
                    }}
                ></div>
            </div>



            {/* --- CONTENT --- */}
            <div className="relative z-10 flex flex-col items-center w-full max-w-sm p-5">

                {/* 1. Title (Theme Aware, Thin, Glow) */}
                <div className="text-center mb-[30px]">
                    <h1
                        className="text-[3.5rem] leading-none font-light tracking-tight animate-pulse-slow transition-colors duration-300"
                        style={{
                            color: 'var(--boot-text)',
                            textShadow: 'var(--boot-shadow)'
                        }}
                    >
                        {displayTitle}
                    </h1>
                </div>

                {/* 2. Candlestick Chart (CSS Reconstruction) */}
                <div className="chart-wrapper relative h-[320px] w-[320px] my-[20px] rounded">
                    {CANDLE_DATA.map((c, i) => (
                        <div
                            key={i}
                            className={cn(
                                "candle absolute w-[12px] opacity-0 fill-mode-forwards",
                                c.isGreen ? "bg-[#22c55e]" : "bg-[#ef4444]"
                            )}
                            style={{
                                left: c.left,
                                bottom: c.bottom,
                                height: c.height,
                                animation: `candleLoop 4s infinite ${(i + 1) * 0.1}s`
                            }}
                        >
                            {/* Wick */}
                            <div
                                className={cn(
                                    "absolute left-1/2 -translate-x-1/2 w-[2px] opacity-50 -z-10",
                                    c.isGreen ? "bg-[#22c55e]" : "bg-[#ef4444]"
                                )}
                                style={{
                                    top: '-15px',
                                    bottom: '-15px'
                                }}
                            />
                        </div>
                    ))}
                </div>

                {/* Text */}
                <div className="relative flex flex-col items-center space-y-3 w-full max-w-[200px]">
                    <p
                        className="text-xs font-mono font-medium uppercase tracking-widest text-center"
                        style={{ color: 'var(--boot-text)' }}
                    >
                        {statusText}
                    </p>

                    {/* Progress Bar */}
                    <div className="h-[2px] w-full bg-muted/20 rounded overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-[#8A2BE2] to-[#00C076]"
                            style={{
                                width: '30%',
                                backgroundSize: '200% 100%',
                                animation: 'superProgressMove 2s infinite linear'
                            }}
                        ></div>
                    </div>
                </div>
            </div>

            {/* Version Number (Bottom Left) - Moved outside relative container to fix positioning */}
            <div className="absolute bottom-8 left-8 text-left z-50">
                <span className="text-xs font-mono opacity-40" style={{ color: 'var(--boot-text)' }}>v{__APP_VERSION__}</span>
            </div>

            {/* Embedded styles for animations are now in src/index.css to avoid JIT/inline issues */}
        </div>
    );
}

// Data mirroring index.html hardcoded values
const CANDLE_DATA = [
    { left: '5%', bottom: '30%', height: '35%', isGreen: true },
    { left: '13%', bottom: '40%', height: '25%', isGreen: false },
    { left: '21%', bottom: '45%', height: '30%', isGreen: true },
    { left: '29%', bottom: '50%', height: '15%', isGreen: false },
    { left: '37%', bottom: '48%', height: '40%', isGreen: true },
    { left: '45%', bottom: '70%', height: '25%', isGreen: true },
    { left: '53%', bottom: '55%', height: '35%', isGreen: false },
    { left: '61%', bottom: '40%', height: '20%', isGreen: false },
    { left: '69%', bottom: '42%', height: '15%', isGreen: true },
    { left: '77%', bottom: '48%', height: '45%', isGreen: true },
    { left: '85%', bottom: '75%', height: '20%', isGreen: true },
];
