import { Brain, RefreshCw, ChevronRight, Trash2, Upload, Pencil, Check, X } from 'lucide-react';
import { Button } from '../ui/button';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { UploadResearchDialog } from './UploadResearchDialog';
import { Badge } from '../ui/badge';
import { useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useUpdateResearchTitle } from '../../hooks/useTicker';
import type { ResearchItem } from '../../types/ticker';

interface ResearchFeedProps {
    research: ResearchItem[];
    onTrigger: () => void;
    isAnalyzing: boolean;
    onDelete?: (id: string) => void;
    defaultTicker?: string;
}

export function ResearchFeed({ research, onTrigger, isAnalyzing, onDelete, defaultTicker }: ResearchFeedProps) {
    const navigate = useNavigate();
    const { user } = useAuth();
    const updateTitleMutation = useUpdateResearchTitle();

    // Local state for editing
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');

    const startEditing = (item: ResearchItem, e: MouseEvent) => {
        e.stopPropagation();
        setEditingId(item.id);
        setEditValue(item.title || item.question || '');
    };

    const cancelEditing = (e?: MouseEvent | KeyboardEvent) => {
        e?.stopPropagation();
        setEditingId(null);
        setEditValue('');
    };

    const saveTitle = (id: string, e?: MouseEvent | KeyboardEvent) => {
        e?.stopPropagation();
        if (editValue.trim()) {
            updateTitleMutation.mutate({ id, title: editValue });
        }
        setEditingId(null);
    };

    return (
        <Card className="h-full flex flex-col overflow-hidden">
            <CardHeader className="py-4 border-b border-border bg-muted/10">
                <div className="flex items-center justify-between">
                    <CardTitle className="font-bold text-sm flex items-center gap-2">
                        <Brain className="w-4 h-4 text-primary" /> AI Research History
                    </CardTitle>
                    <div className="flex gap-2">
                        <UploadResearchDialog
                            defaultTicker={defaultTicker}
                            trigger={
                                <Button size="sm" variant="outline" className="h-7 text-xs gap-2">
                                    <Upload size={12} /> Upload
                                </Button>
                            }
                        />
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
                </div>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-y-auto">
                <div className="divide-y divide-border/50">
                    {research && research.length > 0 ? (
                        research.map((item) => {
                            // Permission check: Admin or Author
                            const isOwner = user?.id === item.user_id;
                            const isAdmin = user?.role?.toLowerCase() === 'admin';
                            const canEdit = isAdmin || isOwner;

                            // Author Display Name
                            const authorName = item.user?.nickname || item.user?.email?.split('@')[0] || 'AI';

                            return (
                                <div key={item.id} className="bg-background hover:bg-muted/50 transition-colors">
                                    <div
                                        className="p-4 cursor-pointer flex items-center justify-between group"
                                        onClick={() => navigate(`/research/${item.id}`)}
                                    >
                                        <div className="flex items-center gap-4 flex-1 min-w-0">
                                            <div className={`w-2 h-2 rounded-full shrink-0 ${item.status === 'completed' ? 'bg-green-500' : item.status === 'failed' ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'}`} />
                                            <div className="flex-1 min-w-0">
                                                {editingId === item.id ? (
                                                    <div className="flex items-center gap-2 mb-1" onClick={e => e.stopPropagation()}>
                                                        <input
                                                            autoFocus
                                                            className="flex-1 bg-background border border-primary rounded px-2 py-1 text-sm focus:outline-none"
                                                            value={editValue}
                                                            onChange={(e) => setEditValue(e.target.value)}
                                                            onClick={e => e.stopPropagation()}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') saveTitle(item.id, e);
                                                                if (e.key === 'Escape') cancelEditing(e);
                                                            }}
                                                        />
                                                        <Button size="icon" variant="ghost" className="h-6 w-6 text-green-500 hover:text-green-600 hover:bg-green-500/10" onClick={(e) => saveTitle(item.id, e)}>
                                                            <Check size={14} />
                                                        </Button>
                                                        <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500 hover:text-red-600 hover:bg-red-500/10" onClick={cancelEditing}>
                                                            <X size={14} />
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2 group/title mb-1">
                                                        <div className="text-sm font-medium line-clamp-1 group-hover:text-primary transition-colors">
                                                            {item.title || item.question || "Smart analysis"}
                                                        </div>
                                                        {canEdit && (
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                className="h-5 w-5 opacity-0 group-hover/title:opacity-100 text-muted-foreground hover:text-primary transition-opacity"
                                                                onClick={(e) => startEditing(item, e)}
                                                            >
                                                                <Pencil size={10} />
                                                            </Button>
                                                        )}
                                                    </div>
                                                )}

                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-bold uppercase text-muted-foreground">{new Date(item.created_at).toLocaleDateString()}</span>
                                                    <span className="text-muted-foreground text-xs">•</span>

                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-xs text-muted-foreground">By</span>

                                                        <div className="w-4 h-4 rounded-full bg-muted border border-border flex items-center justify-center shrink-0 overflow-hidden">
                                                            {item.user?.avatar_url ? (
                                                                <img src={item.user.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                                                            ) : (
                                                                <span className="text-[9px] font-bold text-muted-foreground">
                                                                    {(item.user?.nickname || item.user?.email || '?').charAt(0).toUpperCase()}
                                                                </span>
                                                            )}
                                                        </div>

                                                        <span className="font-semibold text-foreground text-xs">{authorName}</span>
                                                    </div>

                                                    {item.provider === 'manual' && (
                                                        <>
                                                            <span className="text-muted-foreground text-xs">•</span>
                                                            <Badge variant="secondary" className="px-1.5 py-0 h-4 text-[10px] font-medium bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border-blue-500/20">
                                                                Manual Upload
                                                            </Badge>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 ml-4">
                                            {onDelete && (
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onDelete(item.id);
                                                    }}
                                                >
                                                    <Trash2 size={14} />
                                                </Button>
                                            )}
                                            {!editingId && (
                                                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground group-hover:text-foreground">
                                                    <ChevronRight size={16} />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className="p-8 text-center text-muted-foreground flex flex-col items-center justify-center h-40">
                            <Brain className="w-8 h-8 opacity-20 mb-3" />
                            <p className="text-sm">No research history available.</p>
                            <p className="text-xs text-muted-foreground/70 mt-1">Start a new analysis to generate insights.</p>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
