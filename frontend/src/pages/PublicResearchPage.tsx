import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { MinimalHeader } from '../components/layout/MinimalHeader';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
// Use parallel public components
import { PublicVerdictBadge } from '../components/public/PublicVerdictBadge';
import { PublicTickerOverview } from '../components/public/PublicTickerOverview';
import { Loader2, AlertTriangle, TrendingUp } from 'lucide-react';
import { TickerLogo } from '../components/dashboard/TickerLogo';
import { PriceChart } from '../components/ticker/PriceChart';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import type { ResearchItem, TickerData, NewsItem, AnalystRating } from '../types/ticker';

interface PublicReportData {
    note: ResearchItem;
    profile: TickerData['profile'];
    risk_analysis: TickerData['risk_analysis'];
    market_context: Omit<TickerData['market_data'], 'history'> & {
        price: number;
        change_percent: number;
        history?: { date: string; price: number }[]
    };
    news: NewsItem | null;
    ratings: AnalystRating[];
    fundamentals?: {
        pe_ratio?: number;
    };
}

// --- CHART COMPONENT ---
// Simple area chart for price history
const ChartView = ({ market_context }: { market_context: PublicReportData['market_context'] }) => {
    if (!market_context?.history?.length) return null;

    // Map history to CandlePoint format needed by PriceChart
    // h is { date: string; price: number }
    const chartData = market_context.history.map((h) => ({
        ts: h.date,
        open: h.price,
        high: h.price,
        low: h.price,
        close: h.price,
        volume: 0,
    }));

    return (
        <div className="h-[250px] w-full mt-6 bg-muted/5 rounded-xl border border-border/40 p-1 relative overflow-hidden group">
            <PriceChart data={chartData} className="h-full" />
        </div>
    );
};

export function PublicResearchPage() {
    const { signature, researchId } = useParams<{ signature: string; researchId: string }>();

    // Scroll to top on mount
    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    const { data, isLoading, isError } = useQuery<PublicReportData>({
        queryKey: ['public-research', researchId, signature],
        queryFn: async () => {
            const res = await api.get(`/public/report/${researchId}/${signature}`);
            return res.data;
        },
        // Don't retry if 403 (Invalid Signature)
        retry: (failureCount: number, error: unknown) => {
            const axiosError = error as { response?: { status?: number } };
            if (axiosError.response?.status === 403) return false;
            return failureCount < 1; // Faster fail for UX
        },
        staleTime: 1000 * 60 * 5, // Cache for 5 mins
    });

    // Determine if we should show the full Access Denied state
    // We only show it if the query is finished (not loading) and we have no data
    const showAccessDenied = !isLoading && !data && isError;

    if (isLoading && !data) {
        return (
            <div className="min-h-screen bg-background flex flex-col">
                <MinimalHeader />
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-muted-foreground animate-pulse">Loading secure report...</p>
                </div>
            </div>
        );
    }

    if (showAccessDenied || !data) {
        return (
            <div className="min-h-screen bg-background flex flex-col">
                <MinimalHeader />
                <div className="flex-1 flex flex-col items-center justify-center p-4 text-center max-w-md mx-auto">
                    <div className="h-16 w-16 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
                        <AlertTriangle className="h-8 w-8 text-red-500" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight mb-2">Access Denied</h1>
                    <p className="text-muted-foreground mb-6">
                        This link is invalid, expired, or has been tampered with.
                        Please request a new secure link from the sender.
                    </p>
                    <a href="/" className="text-primary hover:underline font-medium">Return Home</a>
                </div>
            </div>
        );
    }

    const { note, profile, risk_analysis, market_context, news, ratings, fundamentals } = data;

    return (
        <div className="min-h-screen bg-background text-foreground flex flex-col">
            <MinimalHeader />

            <div className="container max-w-5xl mx-auto px-4 py-8 md:py-12 space-y-10">

                {/* --- HERO SECTION --- */}
                <header className="space-y-6">
                    <div className="relative">
                        
                        <div className="relative z-10">
                            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                                <div className="flex items-start gap-5">
                                    {/* Logo */}
                                    <div className="h-16 w-16 md:h-20 md:w-20 shrink-0">
                                        <TickerLogo
                                            url={profile.logo_url}
                                            symbol={profile.symbol}
                                            className="w-full h-full object-contain p-1"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <div className="flex items-center gap-3 flex-wrap">
                                            <h1 className="text-3xl md:text-4xl font-black tracking-tighter uppercase font-mono">
                                                {profile.symbol}
                                            </h1>
                                            {risk_analysis && (
                                                <PublicVerdictBadge
                                                    risk={risk_analysis.financial_risk}
                                                    upside={risk_analysis.upside_percent || 0}
                                                    overallScore={risk_analysis?.overall_score}
                                                    downside={risk_analysis?.scenarios?.find((s) => s.scenario_type === 'bear')?.price_mid ? ((risk_analysis.scenarios.find((s) => s.scenario_type === 'bear')!.price_mid - (market_context?.price || 0)) / (market_context?.price || 1)) * 100 : undefined}
                                                    consensus={ratings?.[0]?.rating} // Rough consensus proxy
                                                    pe={fundamentals?.pe_ratio}
                                                />
                                            )}
                                        </div>
                                        <h2 className="text-lg font-medium text-muted-foreground">{profile.name}</h2>

                                        <div className="flex items-center gap-4 pt-2">
                                            <div className="flex flex-col">
                                                <span className="text-2xl font-bold tracking-tight">
                                                    ${market_context?.price?.toFixed(2) || '0.00'}
                                                </span>
                                                <span className={`text-sm font-medium flex items-center ${market_context?.change_percent >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                                    {market_context?.change_percent > 0 ? '+' : ''}{market_context?.change_percent?.toFixed(2) || '0.00'}%
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="text-right hidden md:block">
                                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider mb-2">
                                        Last AI Analysis
                                    </div>
                                    <p className="text-sm text-muted-foreground font-mono">
                                        {new Date(note.created_at).toLocaleDateString()}
                                    </p>
                                </div>
                            </div>

                            {/* Chart */}
                            <ChartView market_context={market_context} />
                        </div>
                    </div>
                </header>

                {/* --- MAIN CONTENT GRID --- */}
                {/* --- MAIN CONTENT TABS --- */}
                <Tabs defaultValue="overview" className="w-full">
                    <TabsList className="mb-8 w-full md:w-auto grid grid-cols-2 md:inline-flex">
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="analysis">Analysis</TabsTrigger>
                    </TabsList>

                    {/* OVERVIEW TAB */}
                    <TabsContent value="overview" className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <div className="w-full">
                            <PublicTickerOverview
                                profile={profile}
                                risk_analysis={risk_analysis}
                                market_data={market_context}
                                news={news}
                                ratings={ratings}
                            />
                        </div>
                    </TabsContent>

                    {/* ANALYSIS TAB */}
                    <TabsContent value="analysis" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <div className="flex items-center gap-3 pb-2 border-b border-border/50">
                            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                <TrendingUp size={18} />
                            </div>
                            <h2 className="text-xl font-bold tracking-tight">Investment Thesis</h2>
                        </div>

                        <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-img:rounded-xl">
                            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{note.content || ''}</ReactMarkdown>
                        </div>
                    </TabsContent>
                </Tabs>

                {/* --- FOOTER --- */}
                <footer className="pt-12 text-center text-sm text-muted-foreground/60 pb-8">
                    <p>Generated by NeuralTicker AI • Not Financial Advice</p>
                </footer>
            </div>
        </div>
    );
}
