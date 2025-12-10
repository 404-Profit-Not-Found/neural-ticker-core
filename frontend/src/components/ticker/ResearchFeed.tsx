
import { useState } from 'react';
import { Brain, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Button } from '../ui/button';

interface ResearchItem {
    id: string;
    created_at: string;
    status: 'completed' | 'pending' | 'failed';
    question?: string;
    content?: string;
}

interface ResearchFeedProps {
    research: ResearchItem[];
    onTrigger: () => void;
    isAnalyzing: boolean;
}

export function ResearchFeed({ research, onTrigger, isAnalyzing }: ResearchFeedProps) {
    const [expandedIds, setExpandedIds] = useState<string[]>([]);

    const toggleExpand = (id: string) => {
        setExpandedIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    return (
        <div className="bg-card border border-border rounded-lg shadow-sm flex flex-col overflow-hidden">
            <div className="p-4 border-b border-border bg-muted/10 flex items-center justify-between">
                <h3 className="font-bold text-sm flex items-center gap-2">
                    <Brain className="w-4 h-4 text-primary" /> AI Research History
                </h3>
                <Button
                    size="sm"
                    variant="default"
                    className="h-7 text-xs gap-2"
                    onClick={onTrigger}
                    disabled={isAnalyzing}
                >
                    {isAnalyzing ? <RefreshCw className="animate-spin w-3 h-3" /> : <Brain size={12} />}
                    {isAnalyzing ? "Analyzing..." : "New Analysis"}
                </Button>
            </div>

            <div className="divide-y divide-border/50 max-h-[500px] overflow-y-auto">
                {research && research.length > 0 ? (
                    research.map((item) => (
                        <div key={item.id} className="bg-background">
                            <div
                                className="p-4 cursor-pointer hover:bg-muted/5 transition-colors flex items-center justify-between"
                                onClick={() => toggleExpand(item.id)}
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`w-2 h-2 rounded-full ${item.status === 'completed' ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />
                                    <div>
                                        <div className="text-xs font-bold uppercase text-muted-foreground">
                                            {new Date(item.created_at).toLocaleDateString()} • {new Date(item.created_at).toLocaleTimeString()}
                                        </div>
                                        <div className="text-sm font-medium">
                                            {item.question || "Smart analysis"}
                                        </div>
                                    </div>
                                </div>
                                <Button size="icon" variant="ghost" className="h-6 w-6">
                                    {expandedIds.includes(item.id) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </Button>
                            </div>

                            {expandedIds.includes(item.id) && (
                                <div className="px-6 pb-6 pt-2 bg-muted/5 border-t border-border/30">
                                    {item.status === 'completed' ? (
                                        <div className="prose prose-sm prose-invert max-w-none prose-p:text-muted-foreground prose-strong:text-foreground">
                                            <ReactMarkdown>{item.content}</ReactMarkdown>
                                        </div>
                                    ) : (
                                        <div className="text-sm text-yellow-500 font-medium py-2">
                                            Analysis in progress...
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))
                ) : (
                    <div className="p-8 text-center text-muted-foreground">
                        <p className="text-sm mb-4">No research history available.</p>

                    </div>
                )}
            </div>
        </div>
    );
}
