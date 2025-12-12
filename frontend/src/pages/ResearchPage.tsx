// import { useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Loader2, ArrowLeft, Brain, Calendar, Share2, Printer, Lightbulb, Link as LinkIcon, Quote } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Header } from '../components/layout/Header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'; // Assuming these exist or using primitive UI
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

interface ResearchNote {
    id: string;
    created_at: string;
    status: 'completed' | 'pending' | 'failed';
    question?: string;
    title?: string;
    answer_markdown?: string;
    thinking_process?: string;
    grounding_metadata?: {
        webSearchQueries?: string[];
        searchEntryPoint?: any;
        groundingChunks?: any[];
        groundingSupports?: any[];
        [key: string]: any;
    };
    tickers: string[];
    models_used?: string[];
}

export function ResearchPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const { data: note, isLoading, error } = useQuery<ResearchNote>({
        queryKey: ['research', id],
        queryFn: async () => {
            const res = await api.get(`/research/${id}`);
            return res.data;
        },
        enabled: !!id,
        refetchInterval: (data: any) => {
            if (!data) return 2000;
            return (data.status === 'pending' || data.status === 'processing') ? 2000 : false;
        }
    });

    if (isLoading) {
        return (
            <div className="min-h-screen bg-background flex flex-col">
                <Header />
                <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            </div>
        );
    }

    if (error || !note) {
        return (
            <div className="min-h-screen bg-background flex flex-col">
                <Header />
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                    <h2 className="text-xl font-bold">Research Note Not Found</h2>
                    <Button onClick={() => navigate(-1)}>Go Back</Button>
                </div>
            </div>
        );
    }

    const title = note.title || note.question || "Analysis Request";
    const content = note.answer_markdown || "No content available yet.";
    const hasThinking = !!note.thinking_process;

    // Extract sources if available (Gemini grounding)
    const sources = note.grounding_metadata?.groundingChunks?.map((chunk, i) => ({
        index: i + 1,
        title: chunk.web?.title || `Source ${i + 1}`,
        url: chunk.web?.uri
    })).filter(s => s.url);

    return (
        <div className="min-h-screen bg-background flex flex-col text-foreground">
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
                <div className="border-b border-border pb-6 mb-8">
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
                            <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3 leading-tight">{title}</h1>
                            {note.title && note.question && note.title !== note.question && (
                                <p className="text-muted-foreground text-sm italic">Query: "{note.question}"</p>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground ml-16">
                        <div className="flex items-center gap-2">
                            <Calendar size={14} />
                            <span>{new Date(note.created_at).toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className={`w-2.5 h-2.5 rounded-full ${note.status === 'completed' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-yellow-500 animate-pulse'}`} />
                            <span className="capitalize font-medium text-foreground">{note.status}</span>
                        </div>
                        {note.models_used && note.models_used.length > 0 && (
                            <div className="flex items-center gap-2 bg-muted/50 px-2 py-1 rounded text-xs">
                                <Brain size={12} />
                                <span>{note.models_used.join(', ')}</span>
                            </div>
                        )}
                        <span className="font-mono text-xs opacity-30 ml-auto">ID: {note.id.split('-')[0]}...</span>
                    </div>
                </div>

                {/* Tabs Layout */}
                <Tabs defaultValue="report" className="w-full">
                    <TabsList className="mb-8">
                        <TabsTrigger value="report">Analysis Report</TabsTrigger>
                        {hasThinking && (
                            <TabsTrigger value="thinking" className="gap-2">
                                <Lightbulb size={14} className="text-yellow-500" />
                                Thinking Process
                            </TabsTrigger>
                        )}
                        {sources && sources.length > 0 && (
                            <TabsTrigger value="sources" className="gap-2">
                                <Quote size={14} />
                                Sources ({sources.length})
                            </TabsTrigger>
                        )}
                    </TabsList>

                    <TabsContent value="report" className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <Card className="border-none shadow-none bg-background">
                            <CardContent className="p-0">
                                <article className="prose prose-lg prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-a:text-primary prose-img:rounded-lg prose-strong:text-foreground prose-blockquote:border-l-primary/50 prose-blockquote:bg-muted/20 prose-blockquote:py-1">
                                    <ReactMarkdown>{content}</ReactMarkdown>
                                </article>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {hasThinking && (
                        <TabsContent value="thinking" className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <Card className="bg-muted/10 border-primary/20">
                                <CardHeader>
                                    <CardTitle className="text-lg flex items-center gap-2">
                                        <Lightbulb className="text-yellow-500" size={20} />
                                        Wait Process
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="prose prose-sm prose-invert max-w-none text-muted-foreground">
                                        <ReactMarkdown>{note.thinking_process}</ReactMarkdown>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    )}

                    {sources && sources.length > 0 && (
                        <TabsContent value="sources" className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="grid gap-4 md:grid-cols-2">
                                {sources.map((source, i) => (
                                    <a
                                        key={i}
                                        href={source.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-start gap-3 p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/30 transition-all group"
                                    >
                                        <div className="p-2 bg-background rounded border border-border group-hover:border-primary/50 text-xs font-bold w-8 h-8 flex items-center justify-center shrink-0">
                                            {source.index}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-medium truncate group-hover:text-primary">{source.title}</h4>
                                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                                                <LinkIcon size={10} />
                                                <span className="truncate">{source.url}</span>
                                            </div>
                                        </div>
                                    </a>
                                ))}
                            </div>
                        </TabsContent>
                    )}
                </Tabs>
            </main>
        </div>
    );
}
