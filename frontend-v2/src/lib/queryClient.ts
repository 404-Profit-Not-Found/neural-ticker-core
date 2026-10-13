import { QueryClient, notifyManager } from '@tanstack/react-query';
import type { PersistQueryClientOptions, PersistedClient } from '@tanstack/react-query-persist-client';
import { get, set, del } from 'idb-keyval';

export const createIDBPersister = (key: string = 'NT_V2_QUERY_CACHE') => {
  return {
    persistClient: async (client: PersistedClient) => {
      try {
        // DataCloneError workaround: forced serialization to strip non-serializable 
        // objects (like Axios functions/classes) before IndexedDB 'put' call.
        const safeClient = JSON.parse(JSON.stringify(client));
        await set(key, safeClient);
      } catch (e) {
        console.error('Failed to persist query client:', e);
      }
    },
    restoreClient: async () => {
      return await get(key);
    },
    removeClient: async () => {
      await del(key);
    },
  };
};

// Deliver query results to React in a microtask instead of the default
// `setTimeout(0)`. Browsers clamp timers in background tabs (to a second, and
// to a minute after a few minutes hidden), so with the default a page opened
// in a background tab sits on its skeletons long after its data has arrived.
// A microtask is not throttled, and it also saves a task hop in the foreground.
// React batches the resulting updates either way.
notifyManager.setScheduler(queueMicrotask);

// 2. Configure the QueryClient
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30 seconds fresh
      gcTime: 1000 * 60 * 60 * 24, // 24 hours garbage collection
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

export const persister = createIDBPersister();

// ── Cache ownership ──────────────────────────────────────────
// The persisted cache holds one user's portfolio, watchlists and research.
// It must never be shown to a different account on the same browser (shared
// machine, or a session that expired and was replaced by another login), so
// the cache is tagged with its owner and dropped whenever the owner changes.
const OWNER_KEY = 'nt_v2_cache_owner';

function readOwner(): string | null {
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}

function writeOwner(userId: string | null): void {
  try {
    if (userId) localStorage.setItem(OWNER_KEY, userId);
    else localStorage.removeItem(OWNER_KEY);
  } catch {
    /* storage unavailable: the in-memory clear below still applies */
  }
}

// Resolved once the persisted cache has been hydrated (or failed to). Claims
// wait for it so a purge can never be undone by a late hydrate.
let markRestored: () => void = () => undefined;
const restored = new Promise<void>((resolve) => {
  markRestored = resolve;
  // Never let a stuck IndexedDB block sign-in.
  setTimeout(resolve, 3000);
});
export const onCacheRestored = (): void => markRestored();

/**
 * Bind the query cache to `userId` (or to nobody when signed out). If it was
 * holding another account's data, that data is wiped — from memory and from
 * IndexedDB — before the caller renders anything.
 */
export async function claimCacheFor(userId: string | null): Promise<void> {
  await restored;
  if (readOwner() === userId) return;
  queryClient.clear();
  try {
    await persister.removeClient();
  } catch (e) {
    console.error('Failed to clear persisted cache:', e);
  }
  writeOwner(userId);
}

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister,
  maxAge: 1000 * 60 * 60 * 24, // 24 hours
  buster: 'v2-1', // Increment this to bust cache on major updates
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => {
      // Only persist successful queries. 
      // Errors (like Axios errors) often contain non-serializable objects (like functions)
      // which trigger 'DataCloneError' when attempting to store in IndexedDB.
      return query.state.status === 'success';
    },
    // Do not persist mutations (active/pending actions)
    shouldDehydrateMutation: () => false,
  },
};
