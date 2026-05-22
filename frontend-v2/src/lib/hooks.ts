// Thin convenience wrappers around TanStack Query.
// They exist so the existing screen code (which used `useApi(loader, deps,
// opts)` against the old custom cache) can be migrated with the smallest
// possible diff per call-site. Long-term, screens should call `useQuery` /
// `useMutation` directly.
import { useEffect } from 'react';
import {
  useQuery,
  useMutation as useTanstackMutation,
  useIsFetching as useTanstackIsFetching,
  useQueryClient,
} from '@tanstack/react-query';
import { queryClient } from './queryClient.ts';
import type { UseApiResult, UseMutationResult } from './types.ts';

export interface UseApiOpts {
  poll?: number;
  staleTime?: number;
  enabled?: boolean;
}

export function useApi<T>(
  loader: () => Promise<T>,
  deps: ReadonlyArray<unknown>,
  opts: UseApiOpts = {},
): UseApiResult<T> {
  const queryKey = [...deps];
  const { poll, staleTime, enabled = true } = opts;

  const q = useQuery<T>({
    queryKey,
    queryFn: loader,
    staleTime: staleTime ?? (poll ?? 30_000),
    refetchInterval: poll ?? false,
    refetchOnWindowFocus: true,
    enabled,
    retry: 1,
  });

  return [
    q.data,
    {
      loading: q.isLoading || q.isPending,
      error: q.error,
      reload: () => q.refetch(),
      isStale: q.isStale,
      isFetching: q.isFetching,
    },
  ];
}

export interface UseMutationOpts<TData, TVars> {
  invalidates?: string[];
  onSuccess?: (data: TData, vars: TVars) => void;
  onError?: (err: Error, vars: TVars) => void;
}

export function useMutation<TData, TVars>(
  mutateFn: (vars: TVars) => Promise<TData>,
  opts: UseMutationOpts<TData, TVars> = {},
): UseMutationResult<TData, TVars> {
  const qc = useQueryClient();
  const m = useTanstackMutation<TData, Error, TVars>({
    mutationFn: mutateFn,
    onSuccess: (data, vars) => {
      if (Array.isArray(opts.invalidates)) {
        for (const prefix of opts.invalidates) {
          qc.invalidateQueries({
            predicate: (qq) => {
              const k = qq.queryKey;
              if (!Array.isArray(k)) return false;
              return k.some(
                (part) =>
                  typeof part === 'string' && part.includes(prefix),
              );
            },
          });
        }
      }
      opts.onSuccess?.(data, vars);
    },
    onError: opts.onError,
  });
  return {
    mutate: m.mutateAsync,
    busy: m.isPending,
    error: m.error,
    data: m.data,
    reset: m.reset,
  };
}

export function useIsFetching(): number {
  return useTanstackIsFetching();
}

export function invalidateQueries(prefix: string): void {
  queryClient.invalidateQueries({
    predicate: (qq) => {
      const k = qq.queryKey;
      if (!Array.isArray(k)) return false;
      return k.some((part) => typeof part === 'string' && part.includes(prefix));
    },
  });
}

export function useOnVisible(cb: () => void): void {
  useEffect(() => {
    const handler = (): void => {
      if (document.visibilityState === 'visible') cb();
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [cb]);
}
