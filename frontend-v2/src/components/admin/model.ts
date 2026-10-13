// Shapes and small pure helpers shared by the admin console's parts.

/** A row of `GET /admin/identities`: a registered user or an invited address. */
export interface AdminUser {
    id?: string;
    email: string;
    nickname?: string;
    avatar_url?: string;
    tier: 'free' | 'pro' | 'whale';
    role: string;
    status: 'ACTIVE' | 'BANNED' | 'WAITLIST' | 'INVITED' | 'ADMIN';
    created_at?: string;
    invited_at?: string;
    last_login?: string;
    credits_balance?: number;
}

export interface ExtendedTickerRequest {
    id: string;
    symbol: string;
    user_id: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    created_at: string;
    user?: {
        id: string;
        email: string;
        nickname?: string;
        avatar_url?: string;
        tier?: 'free' | 'pro' | 'whale';
    };
}

/** A row of the admin ticker search. */
export interface AdminTicker {
    id: string;
    symbol: string;
    name: string;
    exchange: string;
    is_hidden?: boolean;
    logo_url?: string | null;
}

export type SortDirection = 'asc' | 'desc';

/** What a user is called in a list: the nickname, or the address before the @. */
export function userName(user: Pick<AdminUser, 'email' | 'nickname'>): string {
    return user.nickname || user.email?.split('@')[0] || '—';
}

export function isAdminUser(user: Pick<AdminUser, 'role' | 'status'>): boolean {
    return user.role === 'admin' || user.status === 'ADMIN';
}

/** Two letters for an avatar without a picture. */
export function userInitials(email?: string, nickname?: string): string {
    if (nickname) {
        const parts = nickname.trim().split(/\s+/);
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return nickname.slice(0, 2).toUpperCase();
    }
    return email ? email.slice(0, 2).toUpperCase() : '??';
}
