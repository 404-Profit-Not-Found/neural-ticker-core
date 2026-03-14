import React from 'react';
import { AtSign } from 'lucide-react';

interface MentionedUser {
    id: string;
    nickname: string;
    avatar_url: string | null;
    tier: string;
}

interface MentionTextProps {
    content: string;
    mentionedUsers?: Record<string, MentionedUser>;
}

/**
 * Renders comment content with <@userId> tokens resolved
 * to highlighted @nickname with an icon using current user data.
 */
export function MentionText({ content, mentionedUsers = {} }: MentionTextProps) {
    // Split content on <@userId> tokens, keeping the tokens as separate parts
    const parts = content.split(/(<@[a-f0-9-]{36}>)/g);

    return (
        <>
            {parts.map((part, i) => {
                const match = part.match(/^<@([a-f0-9-]{36})>$/);
                if (match) {
                    const userId = match[1];
                    const user = mentionedUsers[userId];
                    const displayName = user?.nickname || 'unknown';
                    return (
                        <span
                            key={i}
                            className="inline-flex items-center gap-0.5 text-primary font-semibold cursor-default bg-primary/10 rounded px-1 py-0.5 -my-0.5"
                            title={user?.nickname}
                        >
                            <AtSign size={12} className="shrink-0" />
                            {displayName}
                        </span>
                    );
                }
                return <React.Fragment key={i}>{part}</React.Fragment>;
            })}
        </>
    );
}
