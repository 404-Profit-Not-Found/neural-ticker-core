import { useCallback } from 'react';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { dashboardKeys } from './useDashboardData';

export const newsKeys = {
    all: ['news'] as const,
    general: ['news', 'general'] as const,
    digest: ['news', 'digest'] as const,
    /** Mutation key of the "generate digest" flow. */
    generateDigest: ['news', 'digest', 'generate'] as const,
};

// Headlines and a finished digest are slow-moving content: five minutes keeps
// navigation instant without showing an hour-old feed.
const NEWS_STALE_TIME = 1000 * 60 * 5;

export interface GeneralNewsItem {
    id: number | string;
    category?: string;
    datetime: number;
    headline: string;
    image?: string;
    image_url?: string;
    related?: string;
    source: string;
    summary?: string;
    url: string;
}

export interface NewsDigest {
    id: string;
    title?: string;
    answer_markdown?: string;
    created_at: string;
    relatedTickers?: {
        id: string;
        symbol: string;
        name: string;
        latestPrice?: { close: number; changePercent?: number; change?: number };
        riskAnalysis?: { overall_score: number; financial_risk?: number };
    }[];
    models_used?: string[];
    tokens_in?: number;
    tokens_out?: number;
}

/** General market headlines, shared by the dashboard feed and the News page. */
export function useGeneralNews<TData = GeneralNewsItem[]>(
    select?: (news: GeneralNewsItem[]) => TData,
) {
    return useQuery({
        queryKey: newsKeys.general,
        queryFn: async () => {
            const { data } = await api.get<GeneralNewsItem[]>('/news/general');
            return data;
        },
        select,
        staleTime: NEWS_STALE_TIME,
    });
}

/**
 * The user's AI digest, or `null` when they do not have one yet.
 *
 * `GET /news/digest` is rate-limited (5/min) and, when no digest exists for the
 * last 24h, generates one inside the request. So it is never retried and never
 * refetched on window focus — only when a screen showing it mounts.
 */
export function useNewsDigest() {
    return useQuery({
        queryKey: newsKeys.digest,
        queryFn: async (): Promise<NewsDigest | null> => {
            try {
                const res = await api.get('/news/digest');
                return res.data && res.data.id ? (res.data as NewsDigest) : null;
            } catch (error) {
                console.error("Failed to load digest");
                throw error;
            }
        },
        // A finished digest is slow-moving content. "No digest yet" and "still
        // being written" are not: recheck those on every visit, as before.
        staleTime: (query) => (query.state.data?.answer_markdown ? NEWS_STALE_TIME : 0),
        retry: false,
        refetchOnWindowFocus: false,
    });
}

/** `replaces`: the stale digest an automatic regeneration was started for. */
type GenerateDigestVariables = { replaces?: string } | undefined;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Ask the server for today's digest, then poll until it is written.
 * Resolves with the digest, or `null` if it is still not ready after a minute.
 */
async function generateDigest(): Promise<NewsDigest | null> {
    await api.get('/news/digest/trigger');
    // Poll for the digest to be ready
    await sleep(2000); // Start polling after 2 seconds
    for (let attempts = 0; attempts < 60; attempts++) { // Max 60 seconds
        try {
            const res = await api.get('/news/digest');
            if (res.data && res.data.id && res.data.answer_markdown) {
                return res.data as NewsDigest;
            }
        } catch {
            // Keep polling
        }
        await sleep(1000);
    }
    return null;
}

/**
 * The "generate digest" flow. It runs in the mutation cache rather than in
 * component state, so it keeps going — and `isGenerating` stays true — across
 * re-renders and across leaving and re-entering the dashboard.
 */
export function useGenerateDigest() {
    const queryClient = useQueryClient();

    const { mutate } = useMutation<NewsDigest | null, Error, GenerateDigestVariables>({
        mutationKey: newsKeys.generateDigest,
        mutationFn: () => generateDigest(),
        // Finished attempts are kept for the session: they are how
        // `wasRegenerated` knows a stale digest has already been asked about.
        gcTime: Infinity,
        onSuccess: async (digest) => {
            if (!digest) return; // Gave up waiting; whatever is cached stays.
            // A slower in-flight read must not overwrite the digest just polled.
            await queryClient.cancelQueries({ queryKey: newsKeys.digest, exact: true });
            queryClient.setQueryData<NewsDigest | null>(newsKeys.digest, digest);
            // The digest is itself a research note of the last 24 hours.
            void queryClient.invalidateQueries({ queryKey: dashboardKeys.recentResearch });
        },
        onError: () => {
            console.error("Failed to trigger digest");
        },
    });

    const isGenerating = useIsMutating({ mutationKey: newsKeys.generateDigest }) > 0;

    /** Start a generation unless one is already running. */
    const generate = useCallback(
        (variables?: GenerateDigestVariables) => {
            if (queryClient.isMutating({ mutationKey: newsKeys.generateDigest }) > 0) return;
            mutate(variables);
        },
        [queryClient, mutate],
    );

    /**
     * Whether a generation has already been started for this stale digest.
     * The server decides what "today's digest" is and may hand the same one
     * back; asking again for it would only loop.
     */
    const wasRegenerated = useCallback(
        (digestId: string) =>
            queryClient
                .getMutationCache()
                .findAll({ mutationKey: newsKeys.generateDigest })
                .some(
                    (mutation) =>
                        (mutation.state.variables as GenerateDigestVariables)?.replaces === digestId,
                ),
        [queryClient],
    );

    return { generate, isGenerating, wasRegenerated };
}
