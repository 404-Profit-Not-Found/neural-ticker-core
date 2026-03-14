import { useState, useRef } from 'react';
import { Send, MessageSquare, ThumbsUp, Reply, MoreHorizontal, X, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { ScrollArea } from '../ui/scroll-area';
import { UserTierBadge } from '../ui/user-tier-badge';
import { useAuth } from '../../context/AuthContext';
import { MentionTextarea, type MentionTextareaRef } from './MentionTextarea';
import { MentionText } from './MentionText';
import type { SocialComment } from '../../types/ticker';

interface MentionedUser {
    id: string;
    nickname: string;
    avatar_url: string | null;
    tier: string;
}

interface TickerDiscussionProps {
    comments: SocialComment[];
    onPostComment: (content: string, parentId?: string) => void;
    isPosting: boolean;
    likedCommentIds?: string[];
    onToggleLike?: (commentId: string) => void;
    onDeleteComment?: (commentId: string) => void;
    mentionedUsers?: Record<string, MentionedUser>;
}

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
    const authorName = comment.user?.nickname || comment.user?.email?.split('@')[0] || 'Anonymous';
    // When replying to a reply, always thread under the top-level comment
    const replyParentId = isReply && topLevelId ? topLevelId : comment.id;

    return (
        <div className={`flex gap-3 group ${isReply ? 'ml-10 pl-4 border-l-2 border-border/30' : ''}`}>
            <Avatar className={`${isReply ? 'w-8 h-8' : 'w-10 h-10'} border border-border shrink-0`}>
                <AvatarImage src={comment.user?.avatar_url} alt={comment.user?.nickname} />
                <AvatarFallback className="text-xs font-bold text-muted-foreground bg-muted">
                    {(comment.user?.nickname || comment.user?.email || '?').charAt(0).toUpperCase()}
                </AvatarFallback>
            </Avatar>

            <div className="flex-1 space-y-1 min-w-0">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className={`font-semibold ${isReply ? 'text-xs' : 'text-sm'} text-foreground`}>
                            {authorName}
                        </span>
                        <UserTierBadge tier={comment.user?.tier} />
                        {isAdmin && comment.moderation_status === 'flagged' && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                                Flagged
                            </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">•</span>
                        <span className="text-xs text-muted-foreground">
                            {new Date(comment.created_at).toLocaleDateString()}
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        {isAdmin && onDelete && (
                            <button
                                onClick={() => onDelete(comment.id)}
                                title="Delete comment"
                                className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all rounded"
                            >
                                <Trash2 size={13} />
                            </button>
                        )}
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreHorizontal size={14} />
                        </Button>
                    </div>
                </div>

                <p className={`${isReply ? 'text-xs' : 'text-sm'} text-foreground/90 leading-relaxed whitespace-pre-wrap`}>
                    <MentionText content={comment.content} mentionedUsers={mentionedUsers} />
                </p>

                <div className="flex items-center gap-4 pt-1">
                    <button
                        onClick={() => onToggleLike?.(comment.id)}
                        className={`flex items-center gap-1.5 text-xs transition-colors ${
                            isLiked
                                ? 'text-primary font-medium'
                                : 'text-muted-foreground hover:text-primary'
                        }`}
                    >
                        <ThumbsUp size={12} className={isLiked ? 'fill-current' : ''} />
                        <span>{(comment.like_count || 0) > 0 ? comment.like_count : 'Like'}</span>
                    </button>
                    <button
                        onClick={() => onReply(replyParentId, authorName)}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                    >
                        <Reply size={12} />
                        <span>Reply</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

export function TickerDiscussion({ comments, onPostComment, isPosting, likedCommentIds, onToggleLike, onDeleteComment, mentionedUsers }: TickerDiscussionProps) {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const [commentInput, setCommentInput] = useState('');
    const [replyingTo, setReplyingTo] = useState<{ id: string; name: string } | null>(null);
    const mentionRef = useRef<MentionTextareaRef>(null);

    const likedIds = new Set(likedCommentIds || []);

    // Count total comments including replies
    const totalCount = comments.reduce((sum, c) => sum + 1 + (c.replies?.length || 0), 0);

    const handleSubmit = () => {
        if (commentInput.trim()) {
            // Convert @nickname → <@userId> for storage
            const submitContent = mentionRef.current?.getSubmitValue() || commentInput;
            onPostComment(submitContent, replyingTo?.id);
            setCommentInput('');
            setReplyingTo(null);
            mentionRef.current?.clearMentions();
        }
    };

    const handleReply = (commentId: string, authorName: string) => {
        setReplyingTo({ id: commentId, name: authorName });
    };

    return (
        <Card className="flex flex-col h-[600px] border-border/50 shadow-lg bg-transparent">
            <CardHeader className="py-4 border-b border-border/50 bg-transparent flex flex-row items-center justify-between space-y-0">
                <CardTitle className="font-bold flex items-center gap-2 text-base">
                    <MessageSquare className="w-4 h-4 text-primary" />
                    Community Discussion
                    <span className="text-xs font-normal text-muted-foreground ml-2 px-2 py-0.5 rounded-full bg-muted border border-border">
                        {totalCount}
                    </span>
                </CardTitle>
            </CardHeader>

            <CardContent className="p-0 flex flex-col flex-1 overflow-hidden relative">
                <ScrollArea className="flex-1 p-4">
                    <div className="space-y-6">
                        {comments.length > 0 ? (
                            comments.map((comment) => (
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
                                    {/* Replies */}
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
                            ))
                        ) : (
                            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground/50 space-y-4">
                                <div className="p-4 rounded-full bg-muted/30">
                                    <MessageSquare className="w-8 h-8 opacity-50" />
                                </div>
                                <div>
                                    <p className="font-medium">No discussion yet</p>
                                    <p className="text-xs">Be the first to share your thoughts!</p>
                                </div>
                            </div>
                        )}
                    </div>
                </ScrollArea>

                <div className="p-4 bg-transparent border-t border-border/50">
                    {/* Reply indicator */}
                    {replyingTo && (
                        <div className="flex items-center justify-between mb-2 px-2 py-1.5 rounded-md bg-primary/5 border border-primary/20">
                            <span className="text-xs text-primary">
                                Replying to <span className="font-semibold">@{replyingTo.name}</span>
                            </span>
                            <button
                                onClick={() => setReplyingTo(null)}
                                className="text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    )}
                    <div className="flex gap-3 items-start">
                        <Avatar className="w-8 h-8 shrink-0">
                            <AvatarImage src={user?.avatar_url} />
                            <AvatarFallback className="text-xs bg-muted">
                                {user?.email?.charAt(0).toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 flex gap-2">
                            <MentionTextarea
                                ref={mentionRef}
                                className="flex-1 min-h-[40px] max-h-[120px] w-full resize-none bg-muted/30 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground scrollbar-hide"
                                placeholder={replyingTo ? `Reply to @${replyingTo.name}...` : 'What are your thoughts on this ticker?'}
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
                                className="shrink-0 h-10 w-10 rounded-md"
                                onClick={handleSubmit}
                                disabled={isPosting || !commentInput.trim()}
                            >
                                <Send size={16} />
                            </Button>
                        </div>
                    </div>
                    <div className="flex justify-end mt-1">
                        <span className="text-[10px] text-muted-foreground">
                            Press Enter to post{replyingTo ? ' reply' : ''} • Esc to cancel • Type @ to mention
                        </span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
