import { Brain, Globe, Layers, Server, Shield } from 'lucide-react';

export function AboutArchitecture() {
    return (
        <section className="space-y-8">
            <div className="flex items-center gap-4 mb-8">
                <div className="h-px flex-1 bg-border" />
                <h2 className="text-2xl font-bold text-muted-foreground uppercase tracking-widest text-sm flex items-center gap-2">
                    <Server size={16} /> System Architecture
                </h2>
                <div className="h-px flex-1 bg-border" />
            </div>

            <div className="relative p-8 md:p-12 rounded-2xl border border-white/5 bg-black/40 backdrop-blur-sm overflow-hidden">
                {/* Hub & Spoke Layout */}
                <div className="relative h-[600px] w-full flex items-center justify-center">

                    {/* Connecting Lines (SVG) with Data Flow Animation */}
                    <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
                        <defs>
                            <linearGradient id="gradient-left" x1="100%" y1="0%" x2="0%" y2="0%">
                                <stop offset="0%" stopColor="#9333ea" />
                                <stop offset="100%" stopColor="#3b82f6" />
                            </linearGradient>
                            <linearGradient id="gradient-right" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#9333ea" />
                                <stop offset="100%" stopColor="#ec4899" />
                            </linearGradient>
                            <linearGradient id="gradient-top" x1="0%" y1="100%" x2="0%" y2="0%">
                                <stop offset="0%" stopColor="#9333ea" />
                                <stop offset="100%" stopColor="#3b82f6" />
                            </linearGradient>
                            <linearGradient id="gradient-bottom" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="#9333ea" />
                                <stop offset="100%" stopColor="#22c55e" />
                            </linearGradient>
                        </defs>

                        {/* Lines */}
                        {/* Center to Left (React) */}
                        <line x1="50%" y1="50%" x2="15%" y2="50%" stroke="url(#gradient-left)" strokeWidth="2" strokeDasharray="4 4" className="opacity-30" />
                        {/* Center to Right (AI) */}
                        <line x1="50%" y1="50%" x2="85%" y2="50%" stroke="url(#gradient-right)" strokeWidth="2" strokeDasharray="4 4" className="opacity-30" />
                        {/* Center to Top (Data Sources) */}
                        <line x1="50%" y1="50%" x2="50%" y2="15%" stroke="url(#gradient-top)" strokeWidth="2" strokeDasharray="4 4" className="opacity-30" />
                        {/* Center to Bottom (Data Mesh) */}
                        <line x1="50%" y1="50%" x2="50%" y2="85%" stroke="url(#gradient-bottom)" strokeWidth="2" strokeDasharray="4 4" className="opacity-30" />
                    </svg>

                    {/* Particle Animations: Single, Fast, Ping-Pong */}

                    {/* 1. REACT (Left) <-> Center */}
                    <div className="absolute top-1/2 left-1/2 w-2 h-2 rounded-full shadow-[0_0_10px_white] bg-white animate-[ping-pong-left_1.5s_ease-in-out_infinite]" style={{ marginLeft: '-4px', marginTop: '-4px' }} />

                    {/* 2. AGENTIC AI (Right) <-> Center */}
                    <div className="absolute top-1/2 left-1/2 w-2 h-2 rounded-full shadow-[0_0_10px_white] bg-white animate-[ping-pong-right_1.5s_ease-in-out_infinite]" style={{ marginLeft: '-4px', marginTop: '-4px', animationDelay: '0.2s' }} />

                    {/* 3. DATA SOURCES (Top) <-> Center */}
                    <div className="absolute top-1/2 left-1/2 w-2 h-2 rounded-full shadow-[0_0_10px_white] bg-white animate-[ping-pong-top_1.5s_ease-in-out_infinite]" style={{ marginLeft: '-4px', marginTop: '-4px', animationDelay: '0.4s' }} />

                    {/* 4. DATA MESH (Bottom) <-> Center */}
                    <div className="absolute top-1/2 left-1/2 w-2 h-2 rounded-full shadow-[0_0_10px_white] bg-white animate-[ping-pong-bottom_1.5s_ease-in-out_infinite]" style={{ marginLeft: '-4px', marginTop: '-4px', animationDelay: '0.6s' }} />

                    <style>{`
                        /* PING PONG ANIMATIONS */
                        
                        /* Left: 15% <-> 50% */
                        @keyframes ping-pong-left {
                            0% { left: 15%; opacity: 0; }
                            10% { opacity: 1; }
                            50% { left: 50%; opacity: 1; }
                            90% { opacity: 1; }
                            100% { left: 15%; opacity: 0; }
                        }

                        /* Right: 85% <-> 50% */
                        @keyframes ping-pong-right {
                            0% { left: 85%; opacity: 0; }
                            10% { opacity: 1; }
                            50% { left: 50%; opacity: 1; }
                            90% { opacity: 1; }
                            100% { left: 85%; opacity: 0; }
                        }

                        /* Top: 15% <-> 50% */
                        @keyframes ping-pong-top {
                            0% { top: 15%; opacity: 0; }
                            10% { opacity: 1; }
                            50% { top: 50%; opacity: 1; }
                            90% { opacity: 1; }
                            100% { top: 15%; opacity: 0; }
                        }

                        /* Bottom: 85% <-> 50% */
                        @keyframes ping-pong-bottom {
                            0% { top: 85%; opacity: 0; }
                            10% { opacity: 1; }
                            50% { top: 50%; opacity: 1; }
                            90% { opacity: 1; }
                            100% { top: 85%; opacity: 0; }
                        }
                        
                        /* Mobile Responsiveness Override */
                        @media (max-width: 768px) {
                            @keyframes ping-pong-left {
                                0% { left: 5%; opacity: 0; }
                                10% { opacity: 1; }
                                50% { left: 50%; opacity: 1; }
                                90% { opacity: 1; }
                                100% { left: 5%; opacity: 0; }
                            }
                            @keyframes ping-pong-right {
                                0% { left: 95%; opacity: 0; }
                                10% { opacity: 1; }
                                50% { left: 50%; opacity: 1; }
                                90% { opacity: 1; }
                                100% { left: 95%; opacity: 0; }
                            }
                            @keyframes ping-pong-top {
                                0% { top: 5%; opacity: 0; }
                                10% { opacity: 1; }
                                50% { top: 50%; opacity: 1; }
                                90% { opacity: 1; }
                                100% { top: 5%; opacity: 0; }
                            }
                            @keyframes ping-pong-bottom {
                                0% { top: 95%; opacity: 0; }
                                10% { opacity: 1; }
                                50% { top: 50%; opacity: 1; }
                                90% { opacity: 1; }
                                100% { top: 95%; opacity: 0; }
                            }
                        }
                    `}</style>

                    {/* CENTER: NestJS Core */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-3 animate-in zoom-in duration-500">
                        <div className="h-24 w-24 rounded-2xl bg-black border border-purple-500 shadow-[0_0_50px_rgba(168,85,247,0.4)] flex items-center justify-center text-purple-400 relative z-20">
                            <Server size={48} />
                        </div>
                        <div className="font-mono text-sm font-bold text-purple-400 bg-black/80 px-3 py-1 rounded-full border border-purple-500/30 backdrop-blur-md">NESTJS CORE</div>
                        <div className="text-xs text-muted-foreground bg-background/80 px-2 py-0.5 rounded backdrop-blur-md">The Central Nervous System</div>
                    </div>

                    {/* LEFT: React/Vite */}
                    <div className="absolute top-1/2 left-[5%] md:left-[10%] -translate-y-1/2 z-10 flex flex-col items-center gap-3 animate-in slide-in-from-left duration-700 delay-100">
                        <div className="h-16 w-16 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400 hover:scale-110 transition-transform cursor-pointer">
                            <Layers size={32} />
                        </div>
                        <div className="font-mono text-xs font-bold text-blue-400">REACT / VITE</div>
                        <div className="text-[10px] text-muted-foreground text-center max-w-[120px]">Premium UI &<br />Interaction</div>
                    </div>

                    {/* RIGHT: Agentic AI */}
                    <div className="absolute top-1/2 right-[5%] md:right-[10%] -translate-y-1/2 z-10 flex flex-col items-center gap-3 animate-in slide-in-from-right duration-700 delay-100">
                        <div className="h-16 w-16 rounded-xl bg-pink-500/20 border border-pink-500/40 flex items-center justify-center text-pink-400 hover:scale-110 transition-transform cursor-pointer shadow-[0_0_20px_rgba(236,72,153,0.3)]">
                            <Brain size={32} />
                        </div>
                        <div className="font-mono text-xs font-bold text-pink-400">AGENTIC AI</div>
                        <div className="text-[10px] text-muted-foreground text-center max-w-[120px]">Reasoning &<br />Deep Research</div>
                    </div>

                    {/* TOP: Data Sources */}
                    <div className="absolute top-[5%] md:top-[10%] left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-3 animate-in slide-in-from-top duration-700 delay-200">
                        <div className="h-16 w-16 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400 hover:scale-110 transition-transform cursor-pointer">
                            <Globe size={32} />
                        </div>
                        <div className="font-mono text-xs font-bold text-blue-400">DATA SOURCES</div>
                        <div className="text-[10px] text-muted-foreground text-center">Finnhub + Yahoo Finance</div>
                    </div>

                    {/* BOTTOM: Data Mesh */}
                    <div className="absolute bottom-[5%] md:bottom-[10%] left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-3 animate-in slide-in-from-bottom duration-700 delay-200">
                        <div className="h-16 w-16 rounded-xl bg-green-500/20 border border-green-500/40 flex items-center justify-center text-green-400 hover:scale-110 transition-transform cursor-pointer">
                            <Shield size={32} />
                        </div>
                        <div className="font-mono text-xs font-bold text-green-400">DATA MESH</div>
                        <div className="text-[10px] text-muted-foreground text-center">Postgres + TimescaleDB</div>
                    </div>

                </div>
            </div>
        </section>
    );
}
