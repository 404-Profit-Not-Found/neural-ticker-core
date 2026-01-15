import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import {
    ArrowLeft,
    AlertTriangle,
    Loader2,

    Quote,
    Link as LinkIcon,
    FileText,
    Database,
    Printer,
    Calendar,
    Clock,
    TrendingUp,
    TrendingDown
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { Header } from '../components/layout/Header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { InlineAlert } from '../components/ui/inline-alert';
import { SharePopover } from '../components/common/SharePopover';
import { VerdictBadge } from '../components/ticker/VerdictBadge';
import { ModelBadge } from '../components/ui/model-badge';
import { calculateLiveUpside, calculateLiveDownside, getBasePriceFromScenarios } from '../lib/rating-utils';
import { TickerLogo } from '../components/dashboard/TickerLogo';
import { useTickerDetails } from '../hooks/useTicker';

interface ResearchNote {
    id: string;
    request_id: string;
    created_at: string;
    status: 'completed' | 'pending' | 'failed' | 'processing';
    question?: string;
    title?: string;
    answer_markdown?: string;
    thinking_process?: string;
    grounding_metadata?: {
        webSearchQueries?: string[];
        searchEntryPoint?: unknown;
        groundingChunks?: Array<{ web?: { title?: string; uri?: string };[key: string]: unknown }>;
        groundingSupports?: unknown[];
        [key: string]: unknown;
    };
    tickers: string[];
    models_used?: string[];
    error?: string;
    tokens_in?: number;
    tokens_out?: number;
    numeric_context?: Record<string, unknown>;
    rarity?: string;
}



export function ResearchPage() {
    // Route: /ticker/:symbol/research/:id
    const { id } = useParams<{ id: string; symbol: string }>();
    const navigate = useNavigate();

    const { data: note, isLoading, error } = useQuery<ResearchNote>({
        queryKey: ['research', id],
        queryFn: async () => {
            const res = await api.get(`/research/${id}`);
            return res.data as ResearchNote;
        },
        enabled: !!id,
        refetchInterval: (data: unknown) => {
            const d = data as ResearchNote | undefined;
            if (!d) return 2000;
            return (d.status === 'pending' || d.status === 'processing') ? 2000 : false;
        }
    });

    const primaryTicker = note?.tickers?.[0];
    const { data: tickerData } = useTickerDetails(primaryTicker);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-background flex flex-col text-foreground font-sans">
                <Header />
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <div className="text-muted-foreground animate-pulse text-sm">Loading Research...</div>
                </div>
            </div>
        );
    }

    if (error || !note) {
        return (
            <div className="min-h-screen bg-background flex flex-col text-foreground font-sans">
                <Header />
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                    <AlertTriangle className="w-12 h-12 text-destructive opacity-50" />
                    <h2 className="text-xl font-bold">Research Note Not Found</h2>
                    <Button variant="outline" onClick={() => navigate(-1)}>Go Back</Button>
                </div>
            </div>
        );
    }

    const profile = tickerData?.profile;
    const marketData = tickerData?.market_data;
    const isPriceUp = (marketData?.change_percent ?? 0) >= 0;

    const title = note.title || note.question || "Analysis Request";
    const content = note.answer_markdown;

    const isProcessing = note.status === 'pending' || note.status === 'processing';
    const isFailed = note.status === 'failed';

    // Extract sources if available (Gemini grounding)
    const sources = note.grounding_metadata?.groundingChunks?.map((chunk: { web?: { title?: string; uri?: string } }, i: number) => ({
        index: i + 1,
        title: chunk.web?.title || `Source ${i + 1} `,
        url: chunk.web?.uri
    })).filter((s: { url?: string }) => s.url);

    return (
        <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20">
            <Header />

            <main className="container mx-auto px-4 py-6 max-w-[80rem] space-y-6">

                {/* --- HERO HEADER (matching TickerDetail style exactly) --- */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-border pb-6">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full hover:bg-muted h-8 w-8">
                            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
                        </Button>

                        {/* Stock Logo */}
                        <TickerLogo url={profile?.logo_url} symbol={primaryTicker || ''} className="w-12 h-12" />

                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-2xl font-bold tracking-tight">{primaryTicker}</h1>
                                {profile?.exchange && (
                                    <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                                        {profile.exchange}
                                    </span>
                                )}
                            </div>
                            <div className="text-sm text-muted-foreground font-medium">{profile?.name || 'Loading...'}</div>
                        </div>

                        <div className="h-8 w-px bg-border mx-2 hidden md:block" />

                        {/* Price Display */}
                        {marketData && (
                            <div className="hidden md:block">
                                <div className="flex items-baseline gap-2">
                                    <span className="text-2xl font-mono font-semibold tracking-tight">
                                        ${marketData.price?.toFixed(2)}
                                    </span>
                                    <span className={`flex items-center text-sm font-medium ${isPriceUp ? 'text-green-500' : 'text-red-500'}`}>
                                        {isPriceUp ? <TrendingUp size={14} className="mr-1" /> : <TrendingDown size={14} className="mr-1" />}
                                        {Math.abs(marketData.change_percent || 0).toFixed(2)}%
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Status/Verdict Badge */}
                        {isProcessing ? (
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold border uppercase tracking-wide bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>Processing</span>
                            </div>
                        ) : isFailed ? (
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold border uppercase tracking-wide bg-red-500/10 text-red-500 border-red-500/20">
                                <AlertTriangle className="w-3 h-3" />
                                <span>Failed</span>
                            </div>
                        ) : note.rarity && tickerData?.risk_analysis ? (() => {
                            const { market_data, risk_analysis, fundamentals } = tickerData;
                            const liveUpside = calculateLiveUpside(
                                market_data.price,
                                getBasePriceFromScenarios(risk_analysis.scenarios),
                                risk_analysis.upside_percent
                            );
                            const liveDownside = calculateLiveDownside(
                                market_data.price,
                                risk_analysis.scenarios.find((s: { scenario_type: string; price_mid: number | string }) => s.scenario_type.toLowerCase() === 'bear')?.price_mid,
                                risk_analysis.financial_risk
                            );

                            return (
                                <VerdictBadge
                                    risk={risk_analysis.financial_risk}
                                    upside={liveUpside}
                                    downside={liveDownside}
                                    consensus={fundamentals?.consensus_rating}
                                    overallScore={risk_analysis.overall_score}
                                    pe={fundamentals?.pe_ratio}
                                    newsSentiment={tickerData.news?.sentiment}
                                    newsImpact={tickerData.news?.score}
                                />
                            );
                        })() : null}

                        <div className="h-4 w-px bg-border mx-1 hidden md:block" />

                        <Button variant="outline" size="sm" className="gap-2 h-7 text-[10px] px-2" onClick={() => window.print()}>
                            <Printer size={10} /> <span className="hidden md:inline">Print</span>
                        </Button>
                        <SharePopover researchId={id!} title={note.title || 'Research Report'} />
                    </div>
                </div>

                {/* --- RESEARCH TITLE (prominent section below header) --- */}
                <div className="space-y-1">
                    <h2 className="text-lg md:text-xl font-bold tracking-tight leading-tight">{title}</h2>
                    <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                        <div className="flex items-center gap-1.5">
                            <Calendar size={10} />
                            <span>{new Date(note.created_at).toLocaleString()}</span>
                        </div>
                        {note.tokens_in && note.tokens_out && (
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1.5">
                                    <Clock size={10} />
                                    <span className={note.rarity === 'Legendary' ? 'text-yellow-500' : ''}>{note.tokens_in + note.tokens_out} tokens</span>
                                </div>
                                <div className="h-3 w-px bg-border opacity-50" />
                                <ModelBadge
                                    model={note.models_used?.[0] || 'AI'}
                                    rarity={note.rarity}
                                    className="h-4 scale-90 origin-left"
                                />
                            </div>
                        )}



                        <span className="font-mono opacity-30 ml-auto">ID: {note.id}</span>
                    </div>
                </div>

                {/* Error State */}
                {isFailed && (
                    <InlineAlert variant="error">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="ml-2 font-semibold">Analysis Failed:</span>
                        <span className="ml-2">{note.error || "An unknown error occurred."}</span>
                    </InlineAlert>
                )}

                {/* Processing State */}
                {isProcessing && (
                    <Card className="border-primary/20 bg-primary/5">
                        <CardContent className="flex flex-col items-center justify-center py-12">
                            <div className="relative mb-4">
                                <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
                                <Loader2 className="w-8 h-8 animate-spin text-primary relative z-10" />
                            </div>
                            <h3 className="text-base font-semibold mb-1">Generating Research...</h3>
                            <p className="text-muted-foreground text-center max-w-sm text-xs">
                                AI is analyzing market data, news, and financials. (~20s)
                            </p>
                        </CardContent>
                    </Card>
                )}

                {/* Tabs Layout */}
                {!isProcessing && !isFailed && (
                    <Tabs defaultValue="report" className="w-full">
                        <TabsList className="mb-4 h-9">
                            <TabsTrigger value="report" className="gap-2 text-xs">
                                <FileText size={12} />
                                Analysis Report
                            </TabsTrigger>
                            {sources && sources.length > 0 && (
                                <TabsTrigger value="sources" className="gap-2 text-xs">
                                    <Quote size={12} />
                                    Sources ({sources.length})
                                </TabsTrigger>
                            )}
                            <TabsTrigger value="raw" className="gap-2 text-xs">
                                <Database size={12} />
                                Raw Data
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="report" className="mt-0 animate-in fade-in duration-200">
                            <Card className="border-border">
                                <CardContent className="p-4 md:p-6">
                                    {content ? (
                                        <article className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-a:text-primary prose-img:rounded-lg prose-strong:text-foreground prose-blockquote:border-l-primary/50 prose-blockquote:bg-muted/20 prose-blockquote:py-1 prose-blockquote:px-4 prose-hr:border-border prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-pre:bg-muted prose-pre:border prose-pre:border-border">
                                            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{content}</ReactMarkdown>
                                        </article>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                            <AlertTriangle className="w-8 h-8 mb-3 opacity-20" />
                                            <p className="text-sm">No content generated.</p>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {sources && sources.length > 0 && (
                            <TabsContent value="sources" className="mt-0 animate-in fade-in duration-200">
                                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                                    {sources.map((source, i) => (
                                        <a
                                            key={i}
                                            href={source.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block"
                                        >
                                            <Card className="h-full hover:border-primary/50 hover:bg-muted/30 transition-all group cursor-pointer">
                                                <CardContent className="p-4 flex items-start gap-3">
                                                    <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center text-xs font-bold group-hover:bg-primary/20 transition-colors shrink-0">
                                                        {source.index}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="font-medium text-sm line-clamp-2 group-hover:text-primary transition-colors">
                                                            {source.title}
                                                        </h4>
                                                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-1">
                                                            <LinkIcon size={8} />
                                                            <span className="truncate">{source.url ? new URL(source.url).hostname : ''}</span>
                                                        </div>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        </a>
                                    ))}
                                </div>
                            </TabsContent>
                        )}

                        <TabsContent value="raw" className="mt-0 animate-in fade-in duration-200 space-y-4">
                            <Card>
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-sm flex items-center gap-2">
                                        <FileText className="text-primary" size={16} />
                                        Raw Markdown
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <pre className="w-full max-h-[400px] p-4 rounded-lg bg-muted/50 border border-border overflow-auto text-xs font-mono whitespace-pre-wrap">
                                        {note?.answer_markdown || "No markdown content."}
                                    </pre>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-sm flex items-center gap-2">
                                        <Database className="text-muted-foreground" size={16} />
                                        Metadata
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <pre className="w-full max-h-[300px] p-4 rounded-lg bg-muted/50 border border-border overflow-auto text-xs font-mono">
                                        {JSON.stringify({
                                            id: note.id,
                                            request_id: note.request_id,
                                            models_used: note.models_used,
                                            tokens_in: note.tokens_in,
                                            tokens_out: note.tokens_out,
                                            created_at: note.created_at,
                                            grounding_metadata: note.grounding_metadata,
                                            numeric_context: note.numeric_context
                                        }, null, 2)}
                                    </pre>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                )}
            </main>
        </div>
    );
}
