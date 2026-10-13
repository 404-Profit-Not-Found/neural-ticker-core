import { failureReason } from '../../lib/research-failure';
import { useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { Brain, Check, ChevronRight, Pencil, RefreshCw, Trash2, Upload, X } from 'lucide-react';
import { Panel, PanelHeader } from '../ui/panel';
import { Led } from '../ui/panel';
import { Badge } from '../ui/badge';
import { EmptyState } from '../ui/empty-state';
import { ModelBadge } from '../ui/model-badge';
import { UploadResearchDialog } from './UploadResearchDialog';
import { RunAnalysisDialog } from './RunAnalysisDialog';
import { AiButton } from './AiButton';
import { useAuth } from '../../context/AuthContext';
import { useUpdateResearchTitle } from '../../hooks/useTicker';
import type { ResearchItem } from '../../types/ticker';
import { cn } from '../../lib/utils';
import { formatCount } from '../../lib/format';
import { formatDateTime, formatRelative, isoDateTime } from '../../lib/datetime';

type ModelTier = 'low' | 'medium' | 'high' | 'deep';

const AVERAGE_RESEARCH_DURATION_LABEL = '0:45';

interface ResearchFeedProps {
    research: ResearchItem[];
    onTrigger: (options: { provider: 'gemini' | 'openai' | 'ensemble'; quality: ModelTier; question?: string; modelKey: string }) => void;
    isAnalyzing: boolean;
    onDelete?: (id: string) => void;
    defaultTicker?: string;
}

const ICON_BUTTON =
    'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-9 lg:w-9';

export function ResearchFeed({ research, onTrigger, isAnalyzing, onDelete, defaultTicker }: ResearchFeedProps) {
    const { user } = useAuth();
    const updateTitleMutation = useUpdateResearchTitle();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');

    const startEditing = (item: ResearchItem) => {
        setEditingId(item.id);
        setEditValue(item.title || item.question || '');
    };

    const cancelEditing = () => {
        setEditingId(null);
        setEditValue('');
    };

    const saveTitle = (id: string) => {
        if (editValue.trim()) {
            updateTitleMutation.mutate({ id, title: editValue });
        }
        setEditingId(null);
    };

    const onEditKeyDown = (id: string) => (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') saveTitle(id);
        if (e.key === 'Escape') cancelEditing();
    };

    const hasCredits = (user?.credits_balance ?? 0) > 0;
    const isAdmin = user?.role?.toLowerCase() === 'admin';

    return (
        <Panel aria-label="AI research">
            <PanelHeader
                title="AI research"
                led="ai"
                pulse={isAnalyzing}
                className="max-lg:py-2"
                actions={
                    <>
                        <UploadResearchDialog
                            defaultTicker={defaultTicker}
                            trigger={
                                <button
                                    type="button"
                                    aria-label="Upload research note"
                                    // Icon-only on phones; icon and label from `sm`.
                                    className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-sm:w-11 sm:px-3 lg:h-9"
                                >
                                    <Upload size={16} aria-hidden />
                                    <span className="hidden sm:inline" aria-hidden>Upload</span>
                                </button>
                            }
                        />
                        {hasCredits ? (
                            <RunAnalysisDialog
                                onTrigger={onTrigger}
                                isAnalyzing={isAnalyzing}
                                defaultTicker={defaultTicker}
                                trigger={<AiButton disabled={isAnalyzing} busy={isAnalyzing}>Research</AiButton>}
                            />
                        ) : (
                            <AiButton disabled aria-describedby="research-no-credits">Research</AiButton>
                        )}
                    </>
                }
            />

            {isAnalyzing && (
                <p className="flex items-center gap-2 px-3.5 pt-3 text-xs text-muted-foreground sm:px-4" role="status">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    <span>Research in progress · Avg time ~{AVERAGE_RESEARCH_DURATION_LABEL}</span>
                </p>
            )}
            {!hasCredits && (
                <p id="research-no-credits" className="px-3.5 pt-3 text-xs text-muted-foreground sm:px-4">
                    You have no credits left, so new research is paused until they reset. You can still upload a note.
                </p>
            )}

            {research && research.length > 0 ? (
                <ul className="px-1.5 py-1.5">
                    {research.map((item) => {
                        const isOwner = user?.id === item.user_id;
                        const canEdit = isAdmin || isOwner;
                        const authorName = item.user?.nickname || 'AI';
                        const stamp = item.updated_at || item.created_at;
                        const tokens = (item.tokens_in ?? 0) + (item.tokens_out ?? 0);
                        const isPending = item.status === 'processing' || item.status === 'pending';
                        const isFailed = item.status === 'failed';
                        const title = item.title || item.question || 'Untitled research';
                        const href = `/ticker/${encodeURIComponent(item.tickers[0] || defaultTicker || 'unknown')}/research/${encodeURIComponent(item.id)}`;
                        const isEditing = editingId === item.id;
                        const model = item.provider === 'manual'
                            ? 'manual'
                            : item.models_used && item.models_used.length > 0 ? item.models_used[0] : item.provider;

                        return (
                            <li
                                key={item.id}
                                className="group relative flex min-h-16 items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted focus-within:bg-muted"
                            >
                                <Led
                                    tone={isFailed ? 'down' : isPending ? 'signal' : 'up'}
                                    pulse={isPending}
                                    label={isFailed ? 'Failed' : isPending ? 'In progress' : 'Completed'}
                                    className="ml-1"
                                />

                                <div className="min-w-0 flex-1">
                                    {isEditing ? (
                                        <div className="relative z-10 flex items-center gap-1.5">
                                            <input
                                                autoFocus
                                                aria-label="Research title"
                                                className="h-11 min-w-0 flex-1 rounded-md bg-background px-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-9"
                                                value={editValue}
                                                onChange={(e) => setEditValue(e.target.value)}
                                                onKeyDown={onEditKeyDown(item.id)}
                                            />
                                            <button type="button" className={cn(ICON_BUTTON, 'text-up hover:text-up')} onClick={() => saveTitle(item.id)} aria-label="Save title">
                                                <Check size={16} aria-hidden />
                                            </button>
                                            <button type="button" className={ICON_BUTTON} onClick={cancelEditing} aria-label="Cancel editing">
                                                <X size={16} aria-hidden />
                                            </button>
                                        </div>
                                    ) : isPending ? (
                                        <span className="line-clamp-2 text-sm font-medium leading-snug text-foreground sm:line-clamp-1">{title}</span>
                                    ) : (
                                        // The link covers the whole row; the row's buttons sit above it.
                                        <Link
                                            to={href}
                                            className="line-clamp-2 text-sm font-medium leading-snug text-foreground after:absolute after:inset-0 after:rounded-md focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring sm:line-clamp-1"
                                        >
                                            {title}
                                        </Link>
                                    )}

                                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                        {isFailed && <Badge variant="sell">Failed</Badge>}
                                        {isFailed && failureReason(item.error) && (
                                            <span className="text-down">{failureReason(item.error)}</span>
                                        )}
                                        {isPending && <Badge variant="outline" className="bg-signal/15 text-signal">Running</Badge>}
                                        <time dateTime={isoDateTime(stamp)} title={formatDateTime(stamp)} className="num whitespace-nowrap">
                                            {formatRelative(stamp)}
                                        </time>
                                        <span className="max-w-[10rem] truncate font-medium text-foreground/90 max-sm:hidden">{authorName}</span>
                                        {model && !isPending && !isFailed && (
                                            <ModelBadge model={model} rarity={item.provider === 'manual' ? undefined : item.rarity} />
                                        )}
                                        {tokens > 0 && (
                                            <span className="num hidden whitespace-nowrap sm:inline">{formatCount(tokens)} tokens</span>
                                        )}
                                    </div>
                                </div>

                                <div className="relative z-10 flex shrink-0 items-center">
                                    {canEdit && !isEditing && !isPending && (
                                        <button
                                            type="button"
                                            className={cn(ICON_BUTTON, 'lg:opacity-0 lg:focus-visible:opacity-100 lg:group-hover:opacity-100')}
                                            onClick={() => startEditing(item)}
                                            aria-label={`Rename "${title}"`}
                                        >
                                            <Pencil size={15} aria-hidden />
                                        </button>
                                    )}
                                    {onDelete && !isEditing && (
                                        <button
                                            type="button"
                                            className={cn(ICON_BUTTON, 'hover:text-down')}
                                            onClick={() => onDelete(item.id)}
                                            aria-label={`Delete "${title}"`}
                                        >
                                            <Trash2 size={15} aria-hidden />
                                        </button>
                                    )}
                                    {!isEditing && !isPending && (
                                        <ChevronRight className="pointer-events-none hidden h-4 w-4 text-muted-foreground sm:block" aria-hidden />
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            ) : (
                <EmptyState
                    icon={<Brain className="h-5 w-5" />}
                    title="No research yet"
                    description={
                        hasCredits
                            ? 'Run the first analysis to get price scenarios, risks and a full written note.'
                            : 'Research notes for this ticker will appear here.'
                    }
                />
            )}
        </Panel>
    );
}
