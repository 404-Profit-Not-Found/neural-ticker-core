import { Brain, ChevronRight, Trash2, Upload, Pencil, Check, X, RefreshCw, Bot } from 'lucide-react';
import { Button } from '../ui/button';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { UploadResearchDialog } from './UploadResearchDialog';
import { RunAnalysisDialog } from './RunAnalysisDialog'; // Import the new dialog
import { Badge } from '../ui/badge';
import { ModelBadge } from '../ui/model-badge';
import { useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useUpdateResearchTitle } from '../../hooks/useTicker';
import type { ResearchItem } from '../../types/ticker';
type ModelTier = 'low' | 'medium' | 'high' | 'deep';

const AVERAGE_RESEARCH_DURATION_LABEL = '0:45';

const formatTimestamp = (value?: string) => {
    return value ? new Date(value).toLocaleString() : 'Unknown time';
};



interface ResearchFeedProps {
    research: ResearchItem[];
    onTrigger: (options: { provider: 'gemini' | 'openai' | 'ensemble'; quality: ModelTier; question?: string; modelKey: string }) => void;
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
            <CardHeader className="py-3 px-3 md:py-4 md:px-4 border-b border-border bg-muted/10">
                <div className="flex items-center justify-between gap-2">
                    <CardTitle className="font-bold text-sm flex items-center gap-2 shrink-0">
                        <Brain className="w-4 h-4 text-primary" />
                        <span className="hidden xs:inline">AI Research History</span>
                        <span className="xs:hidden">History</span>
                    </CardTitle>
                    <div className="flex flex-col gap-2 items-end">
                        <div className="flex gap-1.5 md:gap-2">
                            <UploadResearchDialog
                                defaultTicker={defaultTicker}
                                trigger={
                                    <Button variant="outline" className="h-9 w-9 p-0 md:w-auto md:px-4 text-sm gap-2 border-dashed border-muted-foreground/30 hover:bg-muted">
                                        <Upload size={16} /> <span className="hidden md:inline">Upload</span>
                                    </Button>
                                }
                            />
                            {(() => {
                                const hasCredits = (user?.credits_balance ?? 0) > 0;
                                const isLocked = !hasCredits;

                                const ResearchButton = (
                                    <div className="relative group/research-btn">
                                        <Button
                                            size="sm"
                                            className={`gap-2 px-4 text-sm h-9 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white shadow-lg shadow-purple-500/25 border-0 transition-all duration-300 hover:scale-[1.02] ${isLocked ? 'opacity-50 cursor-not-allowed grayscale' : ''
                                                }`}
                                            disabled={isAnalyzing || isLocked}
                                            // Prevent click propagation if locked, just in case
                                            onClick={(e) => isLocked && e.stopPropagation()}
                                        >
                                            <Bot size={16} />
                                            <span className="font-semibold">Research</span>
                                        </Button>
                                        {isLocked && (
                                            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded shadow-lg border hidden group-hover/research-btn:block whitespace-nowrap z-50">
                                                Insufficient Credits
                                            </div>
                                        )}
                                    </div>
                                );

                                if (isLocked) {
                                    return ResearchButton;
                                }

                                return (
                                    <RunAnalysisDialog
                                        onTrigger={onTrigger}
                                        isAnalyzing={isAnalyzing}
                                        defaultTicker={defaultTicker}
                                        trigger={ResearchButton}
                                    />
                                );
                            })()}

                        </div>
                        {isAnalyzing && (
                            <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                <span>Research in progress · Avg time ~{AVERAGE_RESEARCH_DURATION_LABEL}</span>
                            </div>
                        )}
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
                            const completionTimestamp = item.updated_at || item.created_at;
                            const tokensTotal = (item.tokens_in ?? 0) + (item.tokens_out ?? 0);
                            const hasTokens = tokensTotal > 0;
                            const completionLabel = formatTimestamp(completionTimestamp);

                            const isPending = item.status === 'processing' || item.status === 'pending';
                            return (
                                <div key={item.id} className="bg-background hover:bg-muted/50 transition-colors">
                                    <div
                                        className={`p-3 md:p-4 flex items-center justify-between group ${isPending ? 'cursor-default opacity-80' : 'cursor-pointer'}`}
                                        onClick={() => !isPending && navigate(`/ticker/${item.tickers[0] || defaultTicker || 'unknown'}/research/${item.id}`)}
                                    >
                                        <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0">
                                            <div className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full shrink-0 ${item.status === 'completed' ? 'bg-green-500' : item.status === 'failed' ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'}`} />
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
                                                    <div className="flex items-center gap-2 group/title mb-0.5 md:mb-1">
                                                        <div className="text-sm font-medium line-clamp-1 group-hover:text-primary transition-colors leading-tight">
                                                            {item.title || item.question || "Smart analysis"}
                                                        </div>
                                                        {canEdit && (
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                className="h-4 w-4 md:h-5 md:w-5 opacity-0 group-hover/title:opacity-100 text-muted-foreground hover:text-primary transition-opacity"
                                                                onClick={(e) => startEditing(item, e)}
                                                            >
                                                                <Pencil size={10} />
                                                            </Button>
                                                        )}
                                                    </div>
                                                )}

                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                    <span className="text-[10px] md:text-xs font-bold uppercase text-muted-foreground whitespace-nowrap">{completionLabel}</span>
                                                    <span className="text-muted-foreground text-[10px] md:text-xs hidden md:inline">•</span>

                                                    <div className="flex items-center gap-1.5 min-w-0 max-w-[120px] md:max-w-[200px]">
                                                        <span className="text-[10px] md:text-xs text-muted-foreground hidden md:inline">By</span>

                                                        <div className="w-3.5 h-3.5 md:w-4 md:h-4 rounded-full bg-muted border border-border flex items-center justify-center shrink-0 overflow-hidden">
                                                            {item.user?.avatar_url ? (
                                                                <img src={item.user.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                                                            ) : (
                                                                <span className="text-[8px] md:text-[9px] font-bold text-muted-foreground">
                                                                    {(item.user?.nickname || item.user?.email || '?').charAt(0).toUpperCase()}
                                                                </span>
                                                            )}
                                                        </div>

                                                        <span className="font-semibold text-foreground text-[10px] md:text-xs truncate">{authorName}</span>
                                                    </div>

                                                    {item.provider === 'manual' && (
                                                        <>
                                                            <span className="text-muted-foreground text-[10px] md:text-xs">•</span>
                                                            <Badge variant="outline" className="px-1.5 py-0 h-4 text-[10px] font-medium bg-white/5 text-white/90 border-white/20 whitespace-nowrap">
                                                                Manual
                                                            </Badge>
                                                        </>
                                                    )}

                                                    {(item.provider && item.provider !== 'manual') && (
                                                        <>
                                                            <span className="text-muted-foreground text-[10px] md:text-xs hidden md:inline">•</span>
                                                            <ModelBadge
                                                                model={item.models_used && item.models_used.length > 0 ? item.models_used[0] : item.provider}
                                                                rarity={item.rarity}
                                                            />
                                                        </>
                                                    )}
                                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                                                        {hasTokens && (
                                                            <span className="rounded-full bg-muted/30 px-2 py-0.5 text-[10px]">
                                                                {tokensTotal.toLocaleString()} tokens used
                                                            </span>
                                                        )}
                                                    </div>
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
                                            {!editingId && !isPending && (
                                                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground group-hover:text-foreground hidden md:inline-flex">
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
