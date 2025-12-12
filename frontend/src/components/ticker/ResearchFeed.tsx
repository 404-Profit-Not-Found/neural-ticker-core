import { Brain, RefreshCw, ChevronRight } from 'lucide-react';
import { Button } from '../ui/button';
import { useNavigate } from 'react-router-dom';

interface ResearchItem {
    id: string;
    created_at: string;
    status: 'completed' | 'pending' | 'failed';
    question?: string;
    title?: string;
    content?: string;
}

interface ResearchFeedProps {
    research: ResearchItem[];
    onTrigger: () => void;
    isAnalyzing: boolean;
}

export function ResearchFeed({ research, onTrigger, isAnalyzing }: ResearchFeedProps) {
    const navigate = useNavigate();

    return (
        <div className="bg-card border border-border rounded-lg shadow-sm flex flex-col overflow-hidden h-full">
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

            <div className="divide-y divide-border/50 overflow-y-auto flex-1">
                {research && research.length > 0 ? (
                    research.map((item) => (
                        <div key={item.id} className="bg-background hover:bg-muted/50 transition-colors">
                            <div
                                className="p-4 cursor-pointer flex items-center justify-between group"
                                onClick={() => navigate(`/research/${item.id}`)}
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`w-2 h-2 rounded-full ${item.status === 'completed' ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />
                                    <div className="flex-1">
                                        <div className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2">
                                            <span>{new Date(item.created_at).toLocaleDateString()}</span>
                                            <span>•</span>
                                            <span>{new Date(item.created_at).toLocaleTimeString()}</span>
                                        </div>
                                        <div className="text-sm font-medium line-clamp-1 group-hover:text-primary transition-colors">
                                            {item.title || item.question || "Smart analysis"}
                                        </div>
                                    </div>
                                </div>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground group-hover:text-foreground">
                                    <ChevronRight size={16} />
                                </Button>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="p-8 text-center text-muted-foreground flex flex-col items-center justify-center h-40">
                        <Brain className="w-8 h-8 opacity-20 mb-3" />
                        <p className="text-sm">No research history available.</p>
                        <p className="text-xs text-muted-foreground/70 mt-1">Start a new analysis to generate insights.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
