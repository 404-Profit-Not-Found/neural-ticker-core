import { QueryClient } from '@tanstack/react-query';
import type { PersistQueryClientOptions, PersistedClient } from '@tanstack/react-query-persist-client';
import { get, set, del } from 'idb-keyval';

// 1. Create a custom persister using idb-keyval
export const createIDBPersister = (key: string = 'REACT_QUERY_OFFLINE_CACHE') => {
  return {
    persistClient: async (client: PersistedClient) => {
      await set(key, client);
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

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister: createIDBPersister(),
  maxAge: 1000 * 60 * 60 * 24, // 24 hours
  buster: 'v1', // Increment this to bust cache on major updates
};
