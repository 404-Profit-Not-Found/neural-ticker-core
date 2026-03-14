import { useState, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Popover, PopoverAnchor, PopoverContent } from '../ui/popover';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';
import { UserTierBadge } from '../ui/user-tier-badge';
import { useUserSearch, type UserSearchResult } from '../../hooks/useUserSearch';

interface MentionTextareaProps {
    value: string;
    onChange: (value: string) => void;
    onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    placeholder?: string;
    className?: string;
}

export interface MentionTextareaRef {
    /** Convert display text (@nickname) → storage text (<@userId>) for submission */
    getSubmitValue: () => string;
    /** Clear the mention tracking map */
    clearMentions: () => void;
}

export const MentionTextarea = forwardRef<MentionTextareaRef, MentionTextareaProps>(
    ({ value, onChange, onKeyDown, placeholder, className }, ref) => {
        const textareaRef = useRef<HTMLTextAreaElement>(null);
        const [mentionQuery, setMentionQuery] = useState('');
        const [mentionActive, setMentionActive] = useState(false);
        const [mentionStartIndex, setMentionStartIndex] = useState(0);
        const [selectedIndex, setSelectedIndex] = useState(0);

        // Track nickname → userId mappings for mentions selected in this session
        const mentionMapRef = useRef<Map<string, string>>(new Map());

        const { data: users = [] } = useUserSearch(mentionActive ? mentionQuery : '');

        // Expose getSubmitValue to parent via ref
        useImperativeHandle(ref, () => ({
            getSubmitValue: () => {
                let result = value;
                // Replace @nickname with <@userId> for all tracked mentions
                // Process longer nicknames first to avoid partial replacements
                const entries = [...mentionMapRef.current.entries()].sort(
                    (a, b) => b[0].length - a[0].length,
                );
                for (const [nickname, userId] of entries) {
                    result = result.replace(
                        new RegExp(`@${escapeRegex(nickname)}(?!\\w)`, 'g'),
                        `<@${userId}>`,
                    );
                }
                return result;
            },
            clearMentions: () => {
                mentionMapRef.current.clear();
            },
        }));

        const detectMention = useCallback(
            (text: string, cursorPos: number) => {
                const textBeforeCursor = text.slice(0, cursorPos);
                const atIndex = textBeforeCursor.lastIndexOf('@');

                if (atIndex === -1) {
                    setMentionActive(false);
                    return;
                }

                const textAfterAt = textBeforeCursor.slice(atIndex + 1);

                // Only activate if text after @ is word characters and @ is at start or after whitespace
                if (/^\w*$/.test(textAfterAt) && (atIndex === 0 || /\s/.test(text[atIndex - 1]))) {
                    setMentionQuery(textAfterAt);
                    setMentionStartIndex(atIndex);
                    setMentionActive(true);
                    setSelectedIndex(0);
                } else {
                    setMentionActive(false);
                }
            },
            [],
        );

        const insertMention = useCallback(
            (user: UserSearchResult) => {
                const before = value.slice(0, mentionStartIndex);
                const cursorPos = textareaRef.current?.selectionStart || 0;
                const after = value.slice(cursorPos);
                const newValue = `${before}@${user.nickname} ${after}`;
                onChange(newValue);
                setMentionActive(false);

                // Track the mapping for submit conversion
                mentionMapRef.current.set(user.nickname, user.id);

                // Restore cursor position after React re-render
                requestAnimationFrame(() => {
                    const newCursorPos = mentionStartIndex + user.nickname.length + 2; // @ + nickname + space
                    textareaRef.current?.setSelectionRange(newCursorPos, newCursorPos);
                    textareaRef.current?.focus();
                });
            },
            [value, mentionStartIndex, onChange],
        );

        const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            onChange(e.target.value);
            detectMention(e.target.value, e.target.selectionStart || 0);
        };

        const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (mentionActive && users.length > 0) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSelectedIndex((prev) => Math.min(prev + 1, users.length - 1));
                    return;
                }
                if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSelectedIndex((prev) => Math.max(prev - 1, 0));
                    return;
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    e.stopPropagation();
                    insertMention(users[selectedIndex]);
                    return;
                }
                if (e.key === 'Escape') {
                    e.preventDefault();
                    setMentionActive(false);
                    return;
                }
            }
            // Delegate to parent when popover is not active
            onKeyDown?.(e);
        };

        const isOpen = mentionActive && users.length > 0;

        return (
            <Popover open={isOpen}>
                <PopoverAnchor asChild>
                    <textarea
                        ref={textareaRef}
                        className={className}
                        placeholder={placeholder}
                        value={value}
                        onChange={handleChange}
                        onKeyDown={handleKeyDown}
                    />
                </PopoverAnchor>
                <PopoverContent
                    align="start"
                    side="top"
                    sideOffset={4}
                    className="w-64 p-1 max-h-48"
                    onOpenAutoFocus={(e) => e.preventDefault()}
                >
                    <div className="max-h-44 overflow-y-auto">
                        {users.map((user, index) => (
                            <button
                                key={user.id}
                                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors ${
                                    index === selectedIndex
                                        ? 'bg-accent text-accent-foreground'
                                        : 'hover:bg-muted'
                                }`}
                                onMouseDown={(e) => {
                                    e.preventDefault(); // Prevent textarea blur
                                    insertMention(user);
                                }}
                                onMouseEnter={() => setSelectedIndex(index)}
                            >
                                <Avatar className="w-6 h-6">
                                    <AvatarImage src={user.avatar_url || undefined} />
                                    <AvatarFallback className="text-[10px]">
                                        {user.nickname?.charAt(0).toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                <span className="font-medium truncate">{user.nickname}</span>
                                <UserTierBadge tier={user.tier} />
                            </button>
                        ))}
                    </div>
                </PopoverContent>
            </Popover>
        );
    },
);

MentionTextarea.displayName = 'MentionTextarea';

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
