import { useState } from 'react';
import { Send, MessageSquare, ThumbsUp, Reply, MoreHorizontal } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { ScrollArea } from '../ui/scroll-area';
import { Badge } from '../ui/badge';
import { UserTierBadge } from '../ui/user-tier-badge';
import { useAuth } from '../../context/AuthContext';
import type { SocialComment } from '../../types/ticker';

interface TickerDiscussionProps {
    comments: SocialComment[];
    onPostComment: (content: string) => void;
    isPosting: boolean;
}

export function TickerDiscussion({ comments, onPostComment, isPosting }: TickerDiscussionProps) {
    const { user } = useAuth();
    const [commentInput, setCommentInput] = useState('');

    const handleSubmit = () => {
        if (commentInput.trim()) {
            onPostComment(commentInput);
            setCommentInput('');
        }
    };

    return (
        <Card className="flex flex-col h-[600px] border-border/50 shadow-lg bg-transparent">
            <CardHeader className="py-4 border-b border-border/50 bg-transparent flex flex-row items-center justify-between space-y-0">
                <CardTitle className="font-bold flex items-center gap-2 text-base">
                    <MessageSquare className="w-4 h-4 text-primary" />
                    Community Discussion
                    <span className="text-xs font-normal text-muted-foreground ml-2 px-2 py-0.5 rounded-full bg-muted border border-border">
                        {comments.length}
                    </span>
                </CardTitle>
            </CardHeader>

            <CardContent className="p-0 flex flex-col flex-1 overflow-hidden relative">
                <ScrollArea className="flex-1 p-4">
                    <div className="space-y-6">
                        {comments.length > 0 ? (
                            comments.map((comment) => (
                                <div key={comment.id} className="flex gap-3 group">
                                    <Avatar className="w-10 h-10 border border-border">
                                        <AvatarImage src={comment.user?.avatar_url} alt={comment.user?.nickname} />
                                        <AvatarFallback className="text-xs font-bold text-muted-foreground bg-muted">
                                            {(comment.user?.nickname || comment.user?.email || '?').charAt(0).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>

                                    <div className="flex-1 space-y-1">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-sm text-foreground">
                                                    {comment.user?.nickname || comment.user?.email?.split('@')[0] || 'Anonymous'}
                                                </span>
                                                <UserTierBadge tier={comment.user?.tier} />
                                                <span className="text-xs text-muted-foreground">•</span>
                                                <span className="text-xs text-muted-foreground">
                                                    {new Date(comment.created_at).toLocaleDateString()}
                                                </span>
                                            </div>
                                            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                                                <MoreHorizontal size={14} />
                                            </Button>
                                        </div>

                                        <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
                                            {comment.content}
                                        </p>

                                        <div className="flex items-center gap-4 pt-2">
                                            <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                                                <ThumbsUp size={12} />
                                                <span>Like</span>
                                            </button>
                                            <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                                                <Reply size={12} />
                                                <span>Reply</span>
                                            </button>
                                        </div>
                                    </div>
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
                    <div className="flex gap-3 items-start">
                        <Avatar className="w-8 h-8 shrink-0">
                            <AvatarImage src={user?.avatar_url} />
                            <AvatarFallback className="text-xs bg-muted">
                                {user?.email?.charAt(0).toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 flex gap-2">
                            <textarea
                                className="flex-1 min-h-[40px] max-h-[120px] w-full resize-none bg-muted/30 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground scrollbar-hide"
                                placeholder="What are your thoughts on this ticker?"
                                value={commentInput}
                                onChange={(e) => setCommentInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSubmit();
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
                            Press Enter to post
                        </span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
