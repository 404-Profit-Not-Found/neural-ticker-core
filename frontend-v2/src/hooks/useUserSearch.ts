import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface UserSearchResult {
    id: string;
    nickname: string;
    avatar_url: string | null;
    tier: string;
}

export function useUserSearch(query: string) {
    return useQuery({
        queryKey: ['users', 'search', query],
        queryFn: async () => {
            if (!query || query.length < 1) return [];
            const res = await api.get('/users/search', { params: { q: query } });
            return (res.data || []) as UserSearchResult[];
        },
        enabled: query.length >= 1,
        staleTime: 1000 * 30,
        placeholderData: keepPreviousData,
    });
}
