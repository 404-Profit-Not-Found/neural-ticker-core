import { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';
import { Loader2 } from 'lucide-react';

interface SuperLoadingProps {
    text?: string;
    symbol?: string;
    className?: string; // Allow overwriting styles if needed
}

export function SuperLoading({ text, symbol, className }: SuperLoadingProps) {
    const [progress, setProgress] = useState(0);
    
    // Simulate smoother progress
    useEffect(() => {
        const interval = setInterval(() => {
            setProgress(prev => {
                const increment = prev < 50 ? 2 : prev < 80 ? 1 : 0.5;
                if (prev >= 95) return 95;
                return prev + increment;
            });
        }, 50);

        return () => clearInterval(interval);
    }, []);

    const displaySymbol = symbol || "SYSTEM";
    const statusText = text || "INITIALIZING SYSTEM...";

    // Fixed positioning below the header (top-14 = 3.5rem = 56px) to match Header height
    return (
        <div className={cn("fixed left-0 right-0 bottom-0 top-14 z-40 flex flex-col items-center justify-center bg-[#09090b] text-white font-sans overflow-hidden", className)}>
            
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
                
                {/* 1. Symbol (White, Thin, Glow) */}
                <div className="text-center space-y-2">
                    <h1 className="text-[3.5rem] leading-none font-light tracking-tight text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.3)] animate-pulse-slow">
                        {displaySymbol}
                    </h1>
                </div>

                {/* 2. Candlestick Chart (CSS Reconstruction) */}
                <div className="relative h-[320px] w-[320px] my-5 border border-white/5 rounded bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[length:40px_40px]">
                     {/* Hardcoded Realistic Candles (Matches index.html) */}
                     {/* Green: Bullish start */}
                    <div className="absolute w-[12px] opacity-0 animate-[candleReveal_0.5s_forwards_0.1s] bg-emerald-500 left-[5%] bottom-[30%] height-[35%]" style={{ height: '35%' }}>
                        <div className="absolute left-[50%] -translate-x-1/2 w-[2px] bg-emerald-500 opacity-50 -z-10 bottom-0 top-[-10px] h-full" style={{ height: '140%', bottom: '-20%' }}></div>
                    </div>
                    {/* ... (Simplifying chart for React: We can iterate a data array to preserve the visual logic cleanly) ... */}
                    {CANDLE_DATA.map((c, i) => (
                        <div 
                            key={i}
                            className={cn(
                                "absolute w-[12px] opacity-0 animate-in fade-in zoom-in-95 fill-mode-forwards",
                                c.isGreen ? "bg-[#22c55e]" : "bg-[#ef4444]"
                            )}
                            style={{
                                left: c.left,
                                bottom: c.bottom,
                                height: c.height,
                                animationDelay: `${(i + 1) * 0.1}s`,
                                animationDuration: '0.5s', 
                                // Manually triggering CSS animation via style or class? 
                                // Using standard Tailwind animate-in for simplicity, or custom keyframes if needed.
                                // Let's use specific style for reveal to match index.html 'candleReveal'
                                animation: `candleReveal 0.5s forwards ${(i + 1) * 0.1}s`
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

                {/* 3. Spinner + Text */}
                <div className="relative flex flex-col items-center space-y-2">
                     {/* We remove the big circular spinner in favor of the clean text + bar from index.html, OR keep a small spinner if needed.
                         User image shows text "Initializing System..." and a progress bar.
                         User image ALSO shows a blue spinner circle in the middle of the chart?
                         Wait, looking at uploaded_image_1 again...
                         It has "DTE.DE" in big white bold text.
                         It has a Spinner *overlaying* the chart.
                         It has a blue/white progress bar.
                         
                         BUT User said: "follow exactly the same aesthetics like the primary neural ticker loader".
                         The primary loader (index.html) DOES NOT have a spinner in the middle. It has "Neural Ticker" at top, Chart in middle, Text/Bar at bottom.
                         So I should align to THAT standard.
                     */}
                     
                     <p className="text-xs font-mono font-medium text-white/60 uppercase tracking-widest mb-2">
                        {statusText}
                     </p>
                     
                     {/* Progress Bar */}
                     <div className="h-[2px] w-[200px] bg-white/10 rounded overflow-hidden">
                        <div 
                            className="h-full bg-gradient-to-r from-[#8A2BE2] to-[#00C076] animate-[progressMove_2s_infinite_linear]"
                            style={{ width: '30%' }} 
                        ></div>
                     </div>
                </div>
            </div>
            
            {/* Embedded Styles for Animations that Tailwind arbitrary values handle poorly */}
            <style>{`
                @keyframes candleReveal {
                    from { opacity: 0; transform: scaleY(0.8); }
                    to { opacity: 1; transform: scaleY(1); }
                }
                @keyframes progressMove {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(400%); }
                }
                .animate-pulse-slow {
                    animation: pulseOpacity 3s infinite ease-in-out;
                }
                @keyframes pulseOpacity {
                    0%, 100% { opacity: 1; text-shadow: 0 0 20px rgba(255,255,255,0.3); }
                    50% { opacity: 0.6; text-shadow: 0 0 10px rgba(255,255,255,0.1); }
                }
            `}</style>
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
