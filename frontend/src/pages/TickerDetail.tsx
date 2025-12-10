import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { Loader2, ArrowUpRight, TrendingUp, TrendingDown, Clock, ShieldCheck, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import { Header } from '../components/layout/Header';
import { RiskRadar } from '../components/ticker/RiskRadar';
import { ScenarioCards } from '../components/ticker/ScenarioCards';
import { FinancialHealth } from '../components/ticker/FinancialHealth';

export function TickerDetail() {
    const { symbol } = useParams();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (symbol) loadData();
    }, [symbol]);

    const loadData = async () => {
        setLoading(true);
        try {
            const res = await api.get(`/tickers/${symbol}/composite`);
            setData(res.data);
        } catch (err) {
            console.error(err);
            setError('Failed to load ticker data');
        } finally {
            setLoading(false);
        }
    };

    if (loading) return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
            <Loader2 className="animate-spin w-8 h-8 text-primary" />
        </div>
    );

    if (error || !data) return (
        <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-4">
            <div className="text-destructive font-bold text-xl">{error || 'Ticker not found'}</div>
            <button onClick={() => window.history.back()} className="text-blue-500 underline">Go Back</button>
        </div>
    );

    const { profile, market_data, risk_analysis, research, fundamentals } = data;
    const isPriceUp = market_data.change_percent >= 0;

    return (
        <div className="min-h-screen bg-background text-foreground">
            <Header />

            <main className="container mx-auto px-4 py-8 max-w-[100rem]">
                {/* --- Hero Section --- */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                    <div className="lg:col-span-2 flex items-start gap-6">
                        {profile.logo_url && (
                            <img src={profile.logo_url} alt={profile.symbol} className="w-20 h-20 rounded-2xl object-contain bg-white p-2 shadow-lg" />
                        )}
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <h1 className="text-4xl font-bold tracking-tight">{profile.symbol}</h1>
                                <span className="bg-muted text-muted-foreground px-2 py-1 rounded text-xs font-bold">{profile.exchange}</span>
                            </div>
                            <h2 className="text-xl text-muted-foreground mb-4">{profile.name}</h2>

                            <div className="flex items-baseline gap-4">
                                <span className="text-5xl font-mono font-medium tracking-tighter">
                                    ${market_data.price.toFixed(2)}
                                </span>
                                <span className={`text-xl font-medium flex items-center ${isPriceUp ? 'text-green-500' : 'text-red-500'}`}>
                                    {isPriceUp ? <TrendingUp size={20} className="mr-1" /> : <TrendingDown size={20} className="mr-1" />}
                                    {Math.abs(market_data.change_percent).toFixed(2)}%
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Quick Stats / Risk Score */}
                    <div className="flex flex-col gap-4 justify-center">
                        {risk_analysis ? (
                            <div className="bg-card border border-border p-6 rounded-2xl shadow-sm flex items-center justify-between relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-10 -mt-10" />
                                <div>
                                    <div className="text-muted-foreground text-sm font-bold uppercase mb-1">Risk Score</div>
                                    <div className="text-4xl font-bold tabular-nums">
                                        {risk_analysis.overall_score}/10
                                    </div>
                                </div>
                                <div className="h-16 w-16 rounded-full border-4 border-primary/20 flex items-center justify-center border-t-primary">
                                    <ShieldCheck size={32} className="text-primary" />
                                </div>
                            </div>
                        ) : (
                            <div className="bg-muted/20 border border-dashed border-border p-6 rounded-2xl flex items-center justify-center text-muted-foreground">
                                No Analysis Available
                            </div>
                        )}
                    </div>
                </div>

                {/* --- Main Grid --- */}
                <div className="grid grid-cols-12 gap-6">

                    {/* LEFT COLUMN (8 cols) */}
                    <div className="col-span-12 lg:col-span-8 flex flex-col gap-6">

                        {/* Scenarios - Top Priority */}
                        {risk_analysis?.scenarios && (
                            <section>
                                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                                    <ArrowUpRight size={20} /> Price Scenarios
                                </h3>
                                <ScenarioCards scenarios={risk_analysis.scenarios} currentPrice={market_data.price} />
                            </section>
                        )}

                        {/* Research Deep Dive */}
                        {research && (
                            <section className="bg-card border border-border rounded-xl p-8 shadow-sm">
                                <div className="flex items-center justify-between mb-6 border-b border-border pb-4">
                                    <h3 className="text-xl font-bold">Analyst Deep Dive</h3>
                                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                        <Clock size={16} /> Updated {new Date(research.updated_at).toLocaleDateString()}
                                    </div>
                                </div>
                                <div className="prose prose-invert max-w-none prose-headings:text-foreground prose-p:text-muted-foreground prose-a:text-primary">
                                    <ReactMarkdown>
                                        {research.content}
                                    </ReactMarkdown>
                                </div>
                            </section>
                        )}
                    </div>

                    {/* RIGHT COLUMN (4 cols) - Sticky Sidebar style */}
                    <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">

                        {/* 1. Risk Radar */}
                        {risk_analysis && (
                            <section className="bg-card border border-border rounded-xl p-4 shadow-sm">
                                <h3 className="text-sm font-bold uppercase text-muted-foreground mb-4 text-center">Risk Dimensions</h3>
                                <RiskRadar dimensions={risk_analysis.dimensions} />
                            </section>
                        )}

                        {/* 2. Financial Health */}
                        <section>
                            <h3 className="text-sm font-bold uppercase text-muted-foreground mb-2">Financial Health</h3>
                            <FinancialHealth fundamentals={fundamentals} />
                        </section>

                        {/* 3. Catalysts & Red Flags */}
                        {risk_analysis && (
                            <>
                                <section className="bg-green-500/5 border border-green-500/20 rounded-xl p-4">
                                    <h3 className="text-green-500 font-bold mb-3 flex items-center gap-2">
                                        <TrendingUp size={18} /> Bullish Catalysts
                                    </h3>
                                    <ul className="space-y-2">
                                        {risk_analysis.catalysts?.map((c: any, i: number) => (
                                            <li key={i} className="text-sm text-foreground/90 flex items-start gap-2">
                                                <span className="text-green-500 mt-1">•</span>
                                                {c.description}
                                            </li>
                                        ))}
                                    </ul>
                                </section>

                                <section className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
                                    <h3 className="text-red-500 font-bold mb-3 flex items-center gap-2">
                                        <AlertTriangle size={18} /> Red Flags
                                    </h3>
                                    <ul className="space-y-2">
                                        {risk_analysis.red_flags?.map((f: string, i: number) => (
                                            <li key={i} className="text-sm text-foreground/90 flex items-start gap-2">
                                                <span className="text-red-500 mt-1">•</span>
                                                {f}
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            </>
                        )}

                    </div>
                </div>

            </main>
        </div>
    );
}
