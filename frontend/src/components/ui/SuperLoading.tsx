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
        <div className={cn(positionClass, "flex flex-col items-center justify-center bg-[#09090b] text-white font-sans overflow-hidden", className)}>
            
            {/* --- BACKGROUND (Matches index.html exactly) --- */}
            <div className="absolute inset-0 z-0 pointer-events-none select-none">
                 {/* Grid */}
                 <div 
                    className="absolute inset-0" 
                    style={{
                        backgroundImage: `
                            linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px), 
                            linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)
                        `,
                        backgroundSize: '28px 28px',
                        backgroundPosition: 'center top'
                    }}
                ></div>
                
                {/* Blobs */}
                <div 
                    className="absolute inset-0"
                    style={{
                        backgroundImage: `
                            radial-gradient(circle at 15% 20%, rgba(37, 99, 235, 0.15), transparent 35%),
                            radial-gradient(circle at 80% 0%, rgba(168, 85, 247, 0.12), transparent 30%)
                        `,
                        backgroundRepeat: 'no-repeat',
                        backgroundSize: '100% 100%'
                    }}
                ></div>
            </div>

            {/* --- CONTENT --- */}
            <div className="relative z-10 flex flex-col items-center w-full max-w-sm p-5 space-y-6">
                
                {/* 1. Title (White, Thin, Glow) */}
                <div className="text-center space-y-2">
                    <h1 className="text-[3.5rem] leading-none font-light tracking-tight text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.3)] animate-pulse-slow">
                        {displayTitle}
                    </h1>
                </div>

                {/* 2. Candlestick Chart (CSS Reconstruction) */}
                <div className="chart-wrapper relative h-[320px] w-[320px] my-5 rounded">
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

                {/* 3. Text + Progress Bar */}
                <div className="relative flex flex-col items-center space-y-3 w-full max-w-[200px]">
                     {/* Text */}
                     <p className="text-xs font-mono font-medium text-white/60 uppercase tracking-widest text-center">
                        {statusText}
                     </p>
                     
                     {/* Progress Bar */}
                     <div className="h-[2px] w-full bg-white/10 rounded overflow-hidden">
                        <div 
                            className="h-full bg-gradient-to-r from-[#8A2BE2] to-[#00C076] animate-progress-bar"
                            style={{ width: '30%' }} 
                        ></div>
                     </div>
                </div>
            </div>

            {/* Version Number (Bottom Left) - Moved outside relative container to fix positioning */}
            <div className="absolute bottom-8 left-8 text-left z-50">
                <span className="text-xs font-mono text-white/20">v{__APP_VERSION__}</span>
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
