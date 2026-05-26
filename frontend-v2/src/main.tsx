// Entry point — wraps the App in StrictMode + a TanStack Query persistent
// cache provider. Mirrors `frontend/src/main.tsx` so behaviour aligns.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient, persistOptions } from './lib/queryClient.ts';
import './styles.css';
import App from './App.tsx';

const container = document.getElementById('app');
if (!container) {
  throw new Error('Missing #app mount node');
}

createRoot(container).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
    >
      <App />
      <ReactQueryDevtools initialIsOpen={false} />
    </PersistQueryClientProvider>
  </StrictMode>,
);

// Register service worker for PWA offline support (path is /v2/sw.js when
// served behind the NestJS ServeStatic mount).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/v2/sw.js').catch(() => {
      /* swallow */
    });
  });
}
