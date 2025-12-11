// import { useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Loader2, ArrowLeft, Brain, Calendar, Share2, Printer } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Header } from '../components/layout/Header';

interface ResearchNote {
    id: string;
    created_at: string;
    status: 'completed' | 'pending' | 'failed';
    question?: string;
    content?: string;
    answer_markdown?: string; // Backend field usually mapped to content, but let's be safe
    tickers: string[];
}

export function ResearchPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const { data: note, isLoading, error } = useQuery<ResearchNote>({
        queryKey: ['research', id],
        queryFn: async () => {
            const res = await api.get(`/research/${id}`); // Assumes this endpoint exists (ResearchController typically has getById)
            // If getById isn't exposed, we might need to check how to fetch single note.
            // ResearchService has getResearchNote, need to check Controller.
            return res.data;
        },
        enabled: !!id
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

    const content = note.content || note.answer_markdown || "No content available.";

    return (
        <div className="min-h-screen bg-background flex flex-col text-foreground">
            <Header />

            <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
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
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-primary/10 rounded-lg">
                            <Brain className="w-8 h-8 text-primary" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                                <span className="uppercase font-bold tracking-wider">Research Note</span>
                                <span>•</span>
                                <span className="font-mono">{note.tickers.join(', ')}</span>
                            </div>
                            <h1 className="text-3xl font-bold tracking-tight">{note.question || "Analysis Request"}</h1>
                        </div>
                    </div>

                    <div className="flex items-center gap-6 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                            <Calendar size={14} />
                            <span>{new Date(note.created_at).toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${note.status === 'completed' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                            <span className="capitalize">{note.status}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-xs opacity-50">ID: {note.id}</span>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <article className="prose prose-lg prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-a:text-primary prose-img:rounded-lg prose-strong:text-foreground">
                    <ReactMarkdown>{content}</ReactMarkdown>
                </article>
            </main>
        </div>
    );
}
