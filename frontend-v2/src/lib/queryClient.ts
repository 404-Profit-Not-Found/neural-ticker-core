// TanStack Query client + IndexedDB persistence — mirrors the configuration
// of the original frontend in `frontend/src/lib/queryClient.ts`. Keeping the
// settings aligned means cache lifetime, focus refetch behaviour and bust
// semantics are predictable across both apps.
//
// Notes:
// - `buster` is a version string; bump it whenever the API shape changes in
//   a way that would make stale persisted blobs misleading.
// - `dehydrateOptions.shouldDehydrateQuery` only persists *successful*
//   queries so error objects (which often contain non-serialisable cycles)
//   never reach IndexedDB.
import { QueryClient } from '@tanstack/react-query';
import type {
  PersistQueryClientOptions,
  PersistedClient,
  Persister,
} from '@tanstack/react-query-persist-client';
import { get, set, del } from 'idb-keyval';

const IDB_KEY = 'v2_react_query_offline_cache';

export const createIDBPersister = (key: string = IDB_KEY): Persister => ({
  persistClient: async (client: PersistedClient) => {
    try {
      // DataCloneError workaround: structured-clone-safe round-trip strips
      // non-serialisable bits (Axios functions, class instances, etc.).
      const safeClient = JSON.parse(JSON.stringify(client)) as PersistedClient;
      await set(key, safeClient);
    } catch (e) {
      // Best-effort persistence: never let a quota/serialise error crash.
      console.warn('[v2] failed to persist query client:', e);
    }
  },
  restoreClient: async () => (await get(key)) as PersistedClient | undefined,
  removeClient: async () => del(key),
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30s fresh — show cached, refetch on focus
      gcTime: 1000 * 60 * 60 * 24, // 24h before unused entries get GC'd
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

export const persister = createIDBPersister();

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister,
  maxAge: 1000 * 60 * 60 * 24, // 24h — must be <= queries.gcTime
  buster: 'v2-1', // bump when API contract changes
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => query.state.status === 'success',
    shouldDehydrateMutation: () => false,
  },
};

// Convenience: clear all caches on sign-out so a different user signing in
// from the same browser doesn't see the previous user's data.
export async function clearAllCaches(): Promise<void> {
  try {
    await persister.removeClient();
  } catch {
    /* ignore */
  }
  queryClient.clear();
}
