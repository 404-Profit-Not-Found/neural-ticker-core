
import { Brain, Cpu, Globe, Layers, LineChart, Server, Shield, Sparkles, User, Zap } from 'lucide-react';
import { Card } from '../components/ui/card';

export function AboutPage() {
    return (
        <div className="min-h-screen bg-background pb-20">
            {/* Hero Section */}
            <div className="relative overflow-hidden border-b border-border bg-muted/20">
                <div className="absolute top-6 left-6 z-20">
                    <a href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm font-medium">
                        <div className="h-8 w-8 rounded-full bg-background border border-border flex items-center justify-center">
                            <span className="text-lg">←</span>
                        </div>
                        Back to App
                    </a>
                </div>
                <div className="absolute inset-0 bg-grid-white/[0.02] bg-[length:50px_50px]" />
                <div className="absolute inset-0 flex items-center justify-center opacity-30">
                    <div className="h-[500px] w-[500px] bg-purple-500/20 blur-[100px] rounded-full" />
                </div>

                <div className="container max-w-5xl mx-auto px-4 py-24 relative z-10 text-center">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-bold uppercase tracking-wider mb-6 animate-in fade-in slide-in-from-bottom-3 duration-700">
                        <Sparkles size={12} />
                        Simplifying Market Research
                    </div>
                    <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground mb-6 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
                        Built for the <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500">Autonomous Investor</span>
                    </h1>
                    <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed animate-in fade-in slide-in-from-bottom-5 duration-700 delay-200">
                        NeuralTicker isn't just another dashboard. It's an Agentic AI system designed to replace the noise of fragmented platforms with high-conviction intelligence.
                    </p>
                </div>
            </div>

            <div className="container max-w-5xl mx-auto px-4 py-16 space-y-24">

                {/* Origin Story */}
                <section className="grid md:grid-cols-2 gap-12 items-center animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">
                    <div className="space-y-6">
                        <h2 className="text-3xl font-bold flex items-center gap-3">
                            <User className="text-purple-500" />
                            The Origin Story
                        </h2>
                        <div className="prose prose-invert text-muted-foreground">
                            <p>
                                Hi, I'm <strong>Branislav Lang</strong>. Like many of you, I don't just buy ETFs—I hunt for individual stocks with asymmetric upside.
                            </p>
                            <p>
                                But my research process was broken. I found myself jumping between <strong>eToro</strong> for execution, <strong>Yahoo Finance</strong> for data, <strong>StockTwits</strong> for sentiment, and <strong>ChatGPT</strong> for synthesis. It was inefficient, noisy, and prone to "paralysis by analysis."
                            </p>
                            <p>
                                I built NeuralTicker to solve my own problem. I wanted an AI that didn't just summarize news, but actually <em>did the research for me</em>—uncovering the hidden gems that manual analysis often misses.
                            </p>
                        </div>
                    </div>
                    <div className="relative group">
                        <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl blur-xl opacity-20 group-hover:opacity-30 transition-opacity" />
                        <Card className="relative p-8 bg-card/50 backdrop-blur border-border/50 overflow-hidden">
                            <div className="absolute top-0 right-0 p-4 opacity-10">
                                <Brain size={120} />
                            </div>
                            <h3 className="text-lg font-semibold mb-4 text-foreground">The Old Way vs. NeuralTicker</h3>
                            <ul className="space-y-4">
                                <li className="flex items-start gap-3 text-sm text-muted-foreground">
                                    <div className="min-w-[24px] h-6 flex items-center justify-center rounded bg-red-500/10 text-red-500">✕</div>
                                    <span>Opening 10+ tabs (News, Earnings, Social)</span>
                                </li>
                                <li className="flex items-start gap-3 text-sm text-muted-foreground">
                                    <div className="min-w-[24px] h-6 flex items-center justify-center rounded bg-red-500/10 text-red-500">✕</div>
                                    <span>Generic "Buy/Sell" ratings without context</span>
                                </li>
                                <li className="flex items-start gap-3 text-sm text-foreground font-medium">
                                    <div className="min-w-[24px] h-6 flex items-center justify-center rounded bg-green-500/10 text-green-500">✓</div>
                                    <span>One unified "Research Note" generated by Agents</span>
                                </li>
                                <li className="flex items-start gap-3 text-sm text-foreground font-medium">
                                    <div className="min-w-[24px] h-6 flex items-center justify-center rounded bg-green-500/10 text-green-500">✓</div>
                                    <span>AI Advisor that tells you what to cut & what to add</span>
                                </li>
                            </ul>
                        </Card>
                    </div>
                </section>

                {/* The Solution / Core Value */}
                <section className="space-y-12">
                    <div className="text-center max-w-3xl mx-auto space-y-4">
                        <h2 className="text-3xl font-bold">Unfair Advantage</h2>
                        <p className="text-muted-foreground text-lg">
                            Most tools give you data. NeuralTicker gives you <span className="text-foreground font-semibold">decisions</span>.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-6">
                        <Card className="p-6 bg-card hover:bg-muted/50 transition-colors border-border/50">
                            <div className="h-12 w-12 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500 mb-4">
                                <Brain size={24} />
                            </div>
                            <h3 className="text-lg font-semibold mb-2">Agentic Research</h3>
                            <p className="text-sm text-muted-foreground">
                                Our AI agents autonomously browse the web, extract unstructured data from news, and create daily news digests. They scrutinize 10-K filings and analyze sentiment to produce institutional-grade reports.
                            </p>
                        </Card>

                        <Card className="p-6 bg-card hover:bg-muted/50 transition-colors border-border/50">
                            <div className="h-12 w-12 rounded-lg bg-green-500/10 flex items-center justify-center text-green-500 mb-4">
                                <LineChart size={24} />
                            </div>
                            <h3 className="text-lg font-semibold mb-2">Unified Portfolio</h3>
                            <p className="text-sm text-muted-foreground">
                                Sync positions from multiple brokers manually or via CSV. Our AI Advisor actively monitors your portfolio, giving you precise advice on what to add and what to cut to maximize returns.
                            </p>
                        </Card>

                        <Card className="p-6 bg-card hover:bg-muted/50 transition-colors border-border/50">
                            <div className="h-12 w-12 rounded-lg bg-[#FF6C33]/10 flex items-center justify-center text-[#FF6C33] mb-4">
                                <Zap size={24} />
                            </div>
                            <h3 className="text-lg font-semibold mb-2">High-Conviction Filters</h3>
                            <p className="text-sm text-muted-foreground">
                                Don't scroll through thousands of stocks. Our "No Brainer" and "Strong Buy" filters surface only the assets with the highest probability of alpha.
                            </p>
                        </Card>
                    </div>
                </section>

                {/* Architecture Visualization */}
                <section className="space-y-8">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="h-px flex-1 bg-border" />
                        <h2 className="text-2xl font-bold text-muted-foreground uppercase tracking-widest text-sm flex items-center gap-2">
                            <Cpu size={16} /> System Architecture
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

                                {/* Data Flow Particles are now handled via CSS for better control */}
                            </svg>

                            {/* CSS-based Moving Particles for Responsiveness */}

                            {/* 1. REACT (Left) <-> Center (Ping-Pong Cycle) */}\
                            {/* Single particle: Cycles Blue -> Purple */}\
                            <div className="absolute top-1/2 left-1/2 w-2 h-2 rounded-full shadow-[0_0_10px_currentColor] animate-[cycle-left_2s_ease-in-out_infinite]" style={{ marginLeft: '-4px', marginTop: '-4px' }} />\
                            \
                            {/* 2. AGENTIC AI (Right) <-> Center (Ping-Pong Cycle) */}\
                            {/* Single particle: Cycles Pink -> Purple */}\
                            <div className="absolute top-1/2 left-1/2 w-2 h-2 rounded-full shadow-[0_0_10px_currentColor] animate-[cycle-right_2s_ease-in-out_infinite]" style={{ marginLeft: '-4px', marginTop: '-4px', animationDelay: '0.33s' }} />\
                            \
                            {/* 3. DATA SOURCES (Top) -> Center (Ingestion Only - Unidirectional) */}\
                            {/* Inbound stream: Blue */}\
                            <div className="absolute top-1/2 left-1/2 w-2 h-2 bg-blue-400 rounded-full shadow-[0_0_10px_#60a5fa] animate-[fly-top-reverse_1.5s_linear_infinite]" style={{ marginLeft: '-4px', marginTop: '-4px' }} />\
                            \
                            {/* 4. DATA MESH (Bottom) <-> Center (Ping-Pong Cycle) */}\
                            {/* Single particle: Cycles Green -> Purple */}\
                            <div className="absolute top-1/2 left-1/2 w-2 h-2 rounded-full shadow-[0_0_10px_currentColor] animate-[cycle-bottom_2s_ease-in-out_infinite]" style={{ marginLeft: '-4px', marginTop: '-4px', animationDelay: '0.66s' }} />

                            <style>{`
                                /* CYCLICAL ANIMATIONS (Center -> Target -> Center) */
                                
                                /* Left Cycle (React) */
                                @keyframes cycle-left {
                                    0% { transform: translate(0, 0); background-color: #3b82f6; opacity: 0; }
                                    5% { opacity: 1; }
                                    45% { transform: translate(-350px, 0); background-color: #3b82f6; } /* At Target */
                                    50% { transform: translate(-350px, 0); background-color: #a855f7; } /* Switch Color */
                                    55% { transform: translate(-350px, 0); background-color: #a855f7; }
                                    95% { opacity: 1; }
                                    100% { transform: translate(0, 0); background-color: #a855f7; opacity: 0; } 
                                }

                                /* Right Cycle (AI) */
                                @keyframes cycle-right {
                                    0% { transform: translate(0, 0); background-color: #ec4899; opacity: 0; }
                                    5% { opacity: 1; }
                                    45% { transform: translate(350px, 0); background-color: #ec4899; }
                                    50% { transform: translate(350px, 0); background-color: #a855f7; }
                                    55% { transform: translate(350px, 0); background-color: #a855f7; }
                                    95% { opacity: 1; }
                                    100% { transform: translate(0, 0); background-color: #a855f7; opacity: 0; } 
                                }

                                /* Bottom Cycle (Data Mesh) */
                                @keyframes cycle-bottom {
                                    0% { transform: translate(0, 0); background-color: #22c55e; opacity: 0; }
                                    5% { opacity: 1; }
                                    45% { transform: translate(0, 200px); background-color: #22c55e; }
                                    50% { transform: translate(0, 200px); background-color: #a855f7; }
                                    55% { transform: translate(0, 200px); background-color: #a855f7; }
                                    95% { opacity: 1; }
                                    100% { transform: translate(0, 0); background-color: #a855f7; opacity: 0; } 
                                }

                                /* Top Ingestion (Unidirectional) */
                                @keyframes fly-top-reverse {
                                    0% { transform: translate(0, -200px); opacity: 0; }
                                    10% { opacity: 1; }
                                    90% { opacity: 1; }
                                    100% { transform: translate(0, 0); opacity: 0; } 
                                }
                                
                                /* Mobile Responsiveness */
                                @media (max-width: 768px) {
                                     @keyframes cycle-left {
                                        0% { transform: translate(0, 0); background-color: #3b82f6; opacity: 0; }
                                        5% { opacity: 1; }
                                        45% { transform: translate(-35vw, 0); background-color: #3b82f6; }
                                        50% { transform: translate(-35vw, 0); background-color: #a855f7; }
                                        55% { transform: translate(-35vw, 0); background-color: #a855f7; }
                                        95% { opacity: 1; }
                                        100% { transform: translate(0, 0); background-color: #a855f7; opacity: 0; } 
                                     }

                                     @keyframes cycle-right {
                                        0% { transform: translate(0, 0); background-color: #ec4899; opacity: 0; }
                                        5% { opacity: 1; }
                                        45% { transform: translate(35vw, 0); background-color: #ec4899; }
                                        50% { transform: translate(35vw, 0); background-color: #a855f7; }
                                        55% { transform: translate(35vw, 0); background-color: #a855f7; }
                                        95% { opacity: 1; }
                                        100% { transform: translate(0, 0); background-color: #a855f7; opacity: 0; } 
                                     }
                                }
                            `}</style>

                            {/* CENTER: NestJS Core */}
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-3 animate-in zoom-in duration-500">
                                <div className="h-24 w-24 rounded-2xl bg-black border border-purple-500 shadow-[0_0_50px_rgba(168,85,247,0.4)] flex items-center justify-center text-purple-400 relative z-20">
                                    <Server size={48} />
                                    {/* Hide any potential bleed-throughs with absolute solid bg */}
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

            </div>
        </div>
    );
}
