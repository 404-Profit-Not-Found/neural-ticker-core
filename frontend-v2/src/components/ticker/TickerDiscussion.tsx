import { useRef, useState } from 'react';
import { MessageSquare, Reply, Send, ThumbsUp, Trash2, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Panel, PanelHeader } from '../ui/panel';
import { EmptyState } from '../ui/empty-state';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { UserTierBadge } from '../ui/user-tier-badge';
import { useAuth } from '../../context/AuthContext';
import { MentionTextarea, type MentionTextareaRef } from './MentionTextarea';
import { MentionText } from './MentionText';
import type { SocialComment } from '../../types/ticker';
import { cn } from '../../lib/utils';
import { formatDateTime, formatRelative, isoDateTime } from '../../lib/datetime';
import { LINK_TEXT } from '../common/styles';

interface MentionedUser {
    id: string;
    nickname: string;
    avatar_url: string | null;
    tier: string;
}

interface TickerDiscussionProps {
    comments: SocialComment[];
    /** May return a promise; the draft is kept if it rejects. */
    onPostComment: (content: string, parentId?: string) => void | Promise<unknown>;
    isPosting: boolean;
    likedCommentIds?: string[];
    onToggleLike?: (commentId: string) => void;
    onDeleteComment?: (commentId: string) => void;
    mentionedUsers?: Record<string, MentionedUser>;
}

// Threads shown before "Show all": long discussions must not bury the page,
// and a scroll box inside a scrolling page is worse on a phone.
const INITIAL_THREADS = 5;

const ACTION =
    'inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-8 lg:min-w-0';

function CommentRow({
    comment,
    isReply,
    topLevelId,
    likedIds,
    onToggleLike,
    onReply,
    onDelete,
    isAdmin,
    mentionedUsers,
}: {
    comment: SocialComment;
    isReply?: boolean;
    topLevelId?: string;
    likedIds: Set<string>;
    onToggleLike?: (commentId: string) => void;
    onReply: (parentId: string, authorName: string) => void;
    onDelete?: (commentId: string) => void;
    isAdmin?: boolean;
    mentionedUsers?: Record<string, MentionedUser>;
}) {
    const isLiked = likedIds.has(comment.id);
    const authorName = comment.user?.nickname || 'Anonymous';
    // When replying to a reply, always thread under the top-level comment
    const replyParentId = isReply && topLevelId ? topLevelId : comment.id;
    const likes = comment.like_count || 0;

    return (
        <div className={cn('flex min-w-0 gap-3', isReply && 'ml-8 sm:ml-11')}>
            <Avatar className={cn('shrink-0', isReply ? 'h-7 w-7' : 'h-8 w-8')}>
                <AvatarImage src={comment.user?.avatar_url} alt="" />
                <AvatarFallback className="bg-muted text-xs font-semibold text-muted-foreground">
                    {(comment.user?.nickname || '?').charAt(0).toUpperCase()}
                </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="min-w-0 truncate text-sm font-semibold text-foreground">{authorName}</span>
                    <UserTierBadge tier={comment.user?.tier} className="h-[22px] text-[10.5px]" />
                    {/* The server only returns a flagged comment to its author and to admins. */}
                    {comment.moderation_status === 'flagged' && (
                        <Badge variant={isAdmin ? 'destructive' : 'waitlist'}>
                            {isAdmin ? 'Flagged' : 'Hidden · under review'}
                        </Badge>
                    )}
                    <time
                        dateTime={isoDateTime(comment.created_at)}
                        title={formatDateTime(comment.created_at)}
                        className="num shrink-0 text-xs text-muted-foreground"
                    >
                        {formatRelative(comment.created_at)}
                    </time>
                </div>

                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
                    <MentionText content={comment.content} mentionedUsers={mentionedUsers} />
                </p>

                <div className="-ml-2 mt-0.5 flex flex-wrap items-center gap-x-1">
                    <button
                        type="button"
                        onClick={() => onToggleLike?.(comment.id)}
                        aria-pressed={isLiked}
                        aria-label={`${isLiked ? 'Unlike' : 'Like'} comment by ${authorName}${likes > 0 ? `, ${likes} ${likes === 1 ? 'like' : 'likes'}` : ''}`}
                        className={cn(ACTION, isLiked ? LINK_TEXT : 'text-muted-foreground hover:text-foreground')}
                    >
                        <ThumbsUp size={14} className={isLiked ? 'fill-current' : ''} aria-hidden />
                        <span className="num">{likes > 0 ? likes : 'Like'}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => onReply(replyParentId, authorName)}
                        aria-label={`Reply to ${authorName}`}
                        className={cn(ACTION, 'text-muted-foreground hover:text-foreground')}
                    >
                        <Reply size={14} aria-hidden />
                        Reply
                    </button>
                    {isAdmin && onDelete && (
                        <button
                            type="button"
                            onClick={() => onDelete(comment.id)}
                            aria-label={`Delete comment by ${authorName}`}
                            className={cn(ACTION, 'text-muted-foreground hover:text-down')}
                        >
                            <Trash2 size={14} aria-hidden />
                            Delete
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

/** Same cap the API enforces (PostCommentDto). */
const COMMENT_MAX_LENGTH = 4000;

export function TickerDiscussion({ comments, onPostComment, isPosting, likedCommentIds, onToggleLike, onDeleteComment, mentionedUsers }: TickerDiscussionProps) {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const [commentInput, setCommentInput] = useState('');
    const [replyingTo, setReplyingTo] = useState<{ id: string; name: string } | null>(null);
    const [showAll, setShowAll] = useState(false);
    const mentionRef = useRef<MentionTextareaRef>(null);

    const likedIds = new Set(likedCommentIds || []);

    // Count total comments including replies
    const totalCount = comments.reduce((sum, c) => sum + 1 + (c.replies?.length || 0), 0);

    const handleSubmit = async () => {
        if (!commentInput.trim() || isPosting) return;
        // Convert @nickname → <@userId> for storage
        const submitContent = mentionRef.current?.getSubmitValue() || commentInput;
        try {
            await onPostComment(submitContent, replyingTo?.id);
        } catch {
            // The mutation reports the reason; the draft stays so nothing is lost.
            return;
        }
        setCommentInput('');
        setReplyingTo(null);
        mentionRef.current?.clearMentions();
    };

    const handleReply = (commentId: string, authorName: string) => {
        setReplyingTo({ id: commentId, name: authorName });
        mentionRef.current?.focus();
    };

    const visible = showAll ? comments : comments.slice(0, INITIAL_THREADS);
    const hiddenThreads = comments.length - visible.length;

    return (
        <Panel aria-label="Community discussion">
            <PanelHeader
                title="Discussion"
                icon={<MessageSquare className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
                led={null}
                actions={<span className="num text-xs text-muted-foreground" aria-label={`${totalCount} comments`}>{totalCount}</span>}
            />

            {/* Composer first: writing never requires scrolling past the thread. */}
            <div className="px-3 pb-1 pt-3 sm:px-4 sm:pt-4">
                {replyingTo && (
                    <div className="mb-2 flex items-center justify-between gap-2 rounded-md bg-muted pl-3 lg:py-1 lg:pr-1">
                        <span className="min-w-0 truncate text-xs text-muted-foreground">
                            Replying to <span className="font-semibold text-foreground">@{replyingTo.name}</span>
                        </span>
                        <button
                            type="button"
                            onClick={() => setReplyingTo(null)}
                            aria-label="Cancel reply"
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-9 lg:w-9"
                        >
                            <X size={16} aria-hidden />
                        </button>
                    </div>
                )}
                <div className="flex items-end gap-2">
                    <Avatar className="hidden h-9 w-9 shrink-0 sm:flex">
                        <AvatarImage src={user?.avatar_url} alt="" />
                        <AvatarFallback className="bg-muted text-xs font-semibold text-muted-foreground">
                            {(user?.nickname || user?.email || '?').charAt(0).toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                    <MentionTextarea
                        ref={mentionRef}
                        ariaLabel={replyingTo ? `Reply to ${replyingTo.name}` : 'Add a comment'}
                        rows={1}
                        maxLength={COMMENT_MAX_LENGTH}
                        className="min-h-11 max-h-40 w-full min-w-0 flex-1 resize-none rounded-md bg-muted px-3 py-2.5 text-sm leading-snug text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [field-sizing:content]"
                        placeholder={replyingTo ? `Reply to @${replyingTo.name}…` : 'What do you think of this ticker?'}
                        value={commentInput}
                        onChange={setCommentInput}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSubmit();
                            }
                            if (e.key === 'Escape' && replyingTo) {
                                setReplyingTo(null);
                            }
                        }}
                    />
                    <Button
                        size="icon"
                        className="h-11 w-11 shrink-0"
                        onClick={handleSubmit}
                        disabled={isPosting || !commentInput.trim()}
                        aria-label={replyingTo ? 'Post reply' : 'Post comment'}
                    >
                        <Send size={16} aria-hidden />
                    </Button>
                </div>
                <p className="mt-1.5 hidden text-xs text-muted-foreground lg:block">
                    Enter to post · Shift+Enter for a new line · @ to mention
                </p>
            </div>

            {comments.length > 0 ? (
                <div className="space-y-5 p-3 sm:p-4">
                    {visible.map((comment) => (
                        <div key={comment.id} className="space-y-3">
                            <CommentRow
                                comment={comment}
                                likedIds={likedIds}
                                onToggleLike={onToggleLike}
                                onReply={handleReply}
                                onDelete={onDeleteComment}
                                isAdmin={isAdmin}
                                mentionedUsers={mentionedUsers}
                            />
                            {comment.replies && comment.replies.length > 0 && (
                                <div className="space-y-3">
                                    {comment.replies.map((reply) => (
                                        <CommentRow
                                            key={reply.id}
                                            comment={reply}
                                            isReply
                                            topLevelId={comment.id}
                                            likedIds={likedIds}
                                            onToggleLike={onToggleLike}
                                            onReply={handleReply}
                                            onDelete={onDeleteComment}
                                            isAdmin={isAdmin}
                                            mentionedUsers={mentionedUsers}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <EmptyState
                    icon={<MessageSquare className="h-5 w-5" />}
                    title="No discussion yet"
                    description="Be the first to share a view on this ticker."
                    className="py-8"
                />
            )}

            {comments.length > INITIAL_THREADS && (
                <button
                    type="button"
                    onClick={() => setShowAll((v) => !v)}
                    aria-expanded={showAll}
                    className="mx-1.5 mb-1.5 flex min-h-11 w-[calc(100%-0.75rem)] items-center justify-center rounded-md px-3.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                    {showAll ? 'Show fewer' : `Show ${hiddenThreads} more ${hiddenThreads === 1 ? 'thread' : 'threads'}`}
                </button>
            )}
        </Panel>
    );
}
