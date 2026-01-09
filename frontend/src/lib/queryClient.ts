import { QueryClient } from '@tanstack/react-query';
import type { PersistQueryClientOptions, PersistedClient } from '@tanstack/react-query-persist-client';
import { get, set, del } from 'idb-keyval';

export const createIDBPersister = (key: string = 'REACT_QUERY_OFFLINE_CACHE') => {
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

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister,
  maxAge: 1000 * 60 * 60 * 24, // 24 hours
  buster: 'v3', // Increment this to bust cache on major updates
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
