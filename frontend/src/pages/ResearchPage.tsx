// import { useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import {
    ArrowLeft,
    Share2,
    AlertTriangle,
    Loader2,
    Lightbulb,
    Quote,
    Link as LinkIcon,
    Brain,
    FileText,
    Database,
    Printer,
    Calendar
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Header } from '../components/layout/Header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { InlineAlert } from '../components/ui/inline-alert';

interface ResearchNote {
    id: string;
    request_id: string; // Add this
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
    tokens_in?: number; // Add this
    tokens_out?: number; // Add this
    numeric_context?: Record<string, any>; // Add this
}

export function ResearchPage() {
    const { id } = useParams<{ id: string }>();
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

    if (isLoading) {
        return (
            <div className="min-h-screen bg-background flex flex-col text-foreground font-sans">
                <Header />
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <div className="text-muted-foreground animate-pulse">Loading Research Data...</div>
                </div>
            </div>
        );
    }

    if (error || !note) {
        return (
            <div className="min-h-screen bg-background flex flex-col text-foreground font-sans">
                <Header />
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                    <h2 className="text-xl font-bold">Research Note Not Found</h2>
                    <Button onClick={() => navigate(-1)}>Go Back</Button>
                </div>
            </div>
        );
    }

    const title = note.title || note.question || "Analysis Request";
    const content = note.answer_markdown;
    const hasThinking = !!note.thinking_process;
    const isProcessing = note.status === 'pending' || note.status === 'processing';
    const isFailed = note.status === 'failed';

    // Extract sources if available (Gemini grounding)
    const sources = note.grounding_metadata?.groundingChunks?.map((chunk: { web?: { title?: string; uri?: string } }, i: number) => ({
        index: i + 1,
        title: chunk.web?.title || `Source ${i + 1} `,
        url: chunk.web?.uri
    })).filter((s: { url?: string }) => s.url);

    return (
        <div className="min-h-screen bg-background flex flex-col text-foreground font-sans selection:bg-primary/20">
            <Header />

            <main className="flex-1 container mx-auto px-4 py-8 max-w-5xl">
                {/* Toolbar */}
                <div className="flex items-center justify-between mb-8">
                    <Button variant="ghost" className="gap-2 pl-0 hover:bg-transparent hover:text-primary" onClick={() => navigate(-1)}>
                        <ArrowLeft size={16} /> Back
                    </Button>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="gap-2" onClick={() => window.print()}>
                            <Printer size={14} /> Print
                        </Button>
                        <Button variant="outline" size="sm" className="gap-2">
                            <Share2 size={14} /> Share
                        </Button>
                    </div>
                </div>

                {/* Header Section */}
                <Card className="mb-8 border-border bg-card">
                    <CardContent className="p-6">
                        <div className="flex items-start gap-4 mb-4">
                            <div className="p-3 bg-primary/10 rounded-xl mt-1">
                                <Brain className="w-8 h-8 text-primary" />
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                                    <span className="uppercase font-bold tracking-wider text-xs bg-muted px-2 py-0.5 rounded">Research Note</span>
                                    <span className="text-muted-foreground/50">•</span>
                                    <span className="font-mono font-medium text-foreground">{note.tickers.join(', ')}</span>
                                </div>
                                <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-3 leading-tight text-foreground">{title}</h1>
                                {note.title && note.question && note.title !== note.question && (
                                    <p className="text-muted-foreground text-sm italic">Query: "{note.question}"</p>
                                )}
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground ml-0 md:ml-16 border-t border-border pt-4 mt-4">
                            <div className="flex items-center gap-2">
                                <Calendar size={14} />
                                <span>{new Date(note.created_at).toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                {isProcessing ? (
                                    <Loader2 className="w-3 h-3 animate-spin text-primary" />
                                ) : (
                                    <div className={`w - 2.5 h - 2.5 rounded - full ${note.status === 'completed' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500'} `} />
                                )}
                                <span className="capitalize font-medium text-foreground">{note.status}</span>
                            </div>
                            {note.models_used && note.models_used.length > 0 && (
                                <div className="flex items-center gap-2 bg-muted/50 px-2 py-1 rounded text-xs">
                                    <Brain size={12} />
                                    <span>{note.models_used.join(', ')}</span>
                                </div>
                            )}
                            <span className="font-mono text-xs opacity-30 ml-auto hidden sm:inline-block">ID: {note.id.split('-')[0]}...</span>
                        </div>
                    </CardContent>
                </Card>

                {isFailed && (
                    <InlineAlert variant="error" className="mb-8">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="ml-2 font-semibold">Analysis Failed:</span>
                        <span className="ml-2">{note.error || "An unknown error occurred during generation."}</span>
                    </InlineAlert>
                )}

                {isProcessing && (
                    <Card className="mb-8 border-primary/20">
                        <CardContent className="flex flex-col items-center justify-center py-12">
                            <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
                            <h3 className="text-lg font-semibold mb-2">Generating Research...</h3>
                            <p className="text-muted-foreground text-center max-w-md">
                                The AI engines are analyzing market data, news, and financials. This usually takes 10-20 seconds.
                            </p>
                        </CardContent>
                    </Card>
                )}

                {/* Tabs Layout */}
                {!isProcessing && !isFailed && (
                    <Tabs defaultValue="report" className="w-full">
                        <TabsList className="mb-8 w-full justify-start border-b border-border rounded-none h-auto p-0 bg-transparent gap-6">
                            <TabsTrigger
                                value="report"
                                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0 py-3 font-semibold"
                            >
                                Analysis Report
                            </TabsTrigger>
                            {hasThinking && (
                                <TabsTrigger
                                    value="thinking"
                                    className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0 py-3"
                                >
                                    <Lightbulb size={14} className="text-yellow-500" />
                                    Thinking Process
                                </TabsTrigger>
                            )}
                            {sources && sources.length > 0 && (
                                <TabsTrigger
                                    value="sources"
                                    className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0 py-3"
                                >
                                    <Quote size={14} />
                                    Sources ({sources.length})
                                </TabsTrigger>
                            )}
                            <TabsTrigger
                                value="raw"
                                className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0 py-3"
                            >
                                <FileText size={14} />
                                Raw Data
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="report" className="mt-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <Card className="border border-border bg-card">
                                <CardContent className="p-6 md:p-8">
                                    {content ? (
                                        <article className="prose prose-sm md:prose-base dark:prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-a:text-primary prose-img:rounded-lg prose-strong:text-foreground prose-blockquote:border-l-primary/50 prose-blockquote:bg-muted/20 prose-blockquote:py-1 prose-blockquote:px-4 prose-hr:border-border">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                                        </article>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                            <AlertTriangle className="w-10 h-10 mb-4 opacity-20" />
                                            <p>No content generated.</p>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {hasThinking && (
                            <TabsContent value="thinking" className="mt-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <Card className="bg-muted/10 border-primary/20">
                                    <CardHeader>
                                        <CardTitle className="text-lg flex items-center gap-2">
                                            <Lightbulb className="text-yellow-500" size={20} />
                                            Wait Process (CoT)
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground">
                                            <ReactMarkdown>{note.thinking_process}</ReactMarkdown>
                                        </div>
                                    </CardContent>
                                </Card>
                            </TabsContent>
                        )}

                        {sources && sources.length > 0 && (
                            <TabsContent value="sources" className="mt-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="grid gap-4 md:grid-cols-2">
                                    {sources.map((source, i) => (
                                        <Card key={i} className="hover:border-primary/50 transition-colors group">
                                            <CardContent className="p-4 flex items-start gap-3">
                                                <div className="p-2 bg-muted/50 rounded border border-border group-hover:border-primary/50 text-xs font-bold w-8 h-8 flex items-center justify-center shrink-0 transition-colors">
                                                    {source.index}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-medium truncate group-hover:text-primary transition-colors">{source.title}</h4>
                                                    <a
                                                        href={source.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="flex items-center gap-1 text-xs text-muted-foreground mt-1 hover:underline"
                                                    >
                                                        <LinkIcon size={10} />
                                                        <span className="truncate">{source.url}</span>
                                                    </a>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            </TabsContent>
                        )}

                        <TabsContent value="raw" className="mt-0 animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
                            {/* Raw Markdown Section */}
                            <Card className="border border-border bg-card">
                                <CardHeader>
                                    <CardTitle className="text-lg flex items-center gap-2">
                                        <FileText className="text-primary" size={20} />
                                        Raw Markdown Response
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="relative">
                                        <pre className="w-full h-[400px] p-4 rounded-md bg-muted/50 border border-border overflow-auto text-xs font-mono whitespace-pre-wrap">
                                            {note?.answer_markdown || "No markdown content available."}
                                        </pre>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Metadata Section */}
                            <Card className="border border-border bg-card">
                                <CardHeader>
                                    <CardTitle className="text-lg flex items-center gap-2">
                                        <Database className="text-muted-foreground" size={20} />
                                        Metadata & Context
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <pre className="w-full p-4 rounded-md bg-muted/50 border border-border overflow-auto text-xs font-mono">
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
