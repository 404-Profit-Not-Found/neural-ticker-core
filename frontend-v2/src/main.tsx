import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { queryClient, persistOptions, onCacheRestored } from './lib/queryClient'
import { appPath } from './lib/base'
// Self-hosted fonts: the production CSP only allows same-origin styles, and a
// bundled variable font is one cached file instead of a third-party round trip.
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './index.css'
import App from './App.tsx'

// Devtools are a dev-only chunk — never part of the production bundle — and
// opt-in even in dev (their floating button covers the mobile tab bar):
// enable with `localStorage.nt_devtools = '1'`.
const devtoolsEnabled = (() => {
  if (!import.meta.env.DEV) return false
  try {
    return localStorage.getItem('nt_devtools') === '1'
  } catch {
    return false
  }
})()

const Devtools = devtoolsEnabled
  ? lazy(() =>
      import('@tanstack/react-query-devtools').then((m) => ({
        default: m.ReactQueryDevtools,
      })),
    )
  : null

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
      onSuccess={onCacheRestored}
      onError={onCacheRestored}
    >
      <App />
      {Devtools && (
        <Suspense fallback={null}>
          <Devtools initialIsOpen={false} />
        </Suspense>
      )}
    </PersistQueryClientProvider>
  </StrictMode>,
)

// Service worker: caches the app shell + hashed assets for instant repeat
// visits and handles web push. Production only — in dev it would fight HMR.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(appPath('/sw.js')).catch(() => {
      /* non-fatal: the app works without it */
    })
  })
}
