/**
 * NeuralTicker service worker (scope: the app base — the origin root).
 *
 * 1. Speed: content-hashed build assets are served cache-first, and the app
 *    shell (index.html, plus the brand mark it renders) is kept as an offline
 *    fallback.
 * 2. Web push: shows notifications and routes clicks back into the app.
 *
 * It never touches /api requests — data is always live and cookie-scoped —
 * and never caches anything outside its own scope.
 */
const VERSION = 'nt-v2-3';
const ASSET_CACHE = `${VERSION}-assets`;
const SHELL_CACHE = `${VERSION}-shell`;

// '/' in production; derived so the worker also works under a sub-path.
const SCOPE_PATH = new URL(self.registration.scope).pathname;
const SHELL_URL = SCOPE_PATH; // index.html
const ASSETS_PREFIX = `${SCOPE_PATH}assets/`;
// The wordmark's "N" is this file (Brand.tsx), not a hashed asset. Without a
// cached copy, a shell served offline — or while the server restarts — renders
// "euralTicker.com" with a zero-width broken image.
const BRAND_MARK_URL = `${SCOPE_PATH}favicon.svg`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        cache.addAll([
          new Request(SHELL_URL, { cache: 'reload' }),
          new Request(BRAND_MARK_URL, { cache: 'reload' }),
        ]),
      )
      .catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            // Older versions of this worker, plus the cache of the retired
            // pixel-terminal build ("neural-ticker-v2-*"), whose cache-first
            // worker would otherwise keep serving its stale app shell.
            .filter(
              (k) =>
                (k.startsWith('nt-v2-') && !k.startsWith(VERSION)) ||
                k.startsWith('neural-ticker-v2'),
            )
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isHtml(response) {
  return (response.headers.get('content-type') || '').includes('text/html');
}

// Hashed assets never change: serve from cache, fill on first use.
async function assetFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  // The SPA fallback answers unknown paths with index.html (200). Caching that
  // under a .js/.css URL would poison the cache after a deploy — skip it.
  if (response.ok && !isHtml(response)) {
    cache.put(request, response.clone()).catch(() => undefined);
  }
  return response;
}

// Navigations: network first so a deploy is picked up immediately; fall back
// to the cached shell only when the network is unreachable.
async function shellNetworkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok && isHtml(response)) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(SHELL_URL, response.clone()).catch(() => undefined);
    }
    return response;
  } catch (err) {
    const cached = await caches.match(SHELL_URL);
    if (cached) return cached;
    throw err;
  }
}

// Files the shell itself renders: network first so a deploy is picked up,
// the cached copy when the server is unreachable.
async function shellFileNetworkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok && !isHtml(response)) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone()).catch(() => undefined);
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(SCOPE_PATH)) return;
  // The API is never ours to answer — data, sign-in redirects, the API docs.
  // At the origin root the scope covers /api/, so this is explicit.
  if (url.pathname.startsWith('/api/')) return;

  if (url.pathname.startsWith(ASSETS_PREFIX)) {
    event.respondWith(assetFirst(request));
    return;
  }
  if (url.pathname === BRAND_MARK_URL) {
    event.respondWith(shellFileNetworkFirst(request));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(shellNetworkFirst(request));
  }
});

// ── Web push ────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'NeuralTicker', body: event.data.text() };
  }

  const data = payload.data || {};
  const options = {
    body: payload.body || '',
    icon: payload.icon || `${SCOPE_PATH}favicon.svg`,
    badge: `${SCOPE_PATH}favicon.svg`,
    data,
    vibrate: [100, 50, 100],
    tag: data.alertType
      ? `price-alert-${data.symbol}`
      : data.symbol
        ? `research-${data.symbol}`
        : 'notification',
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || 'NeuralTicker', options),
  );
});

// The backend sends root-relative app routes (e.g. "/ticker/NVDA"). Resolve
// them inside this app's scope, and refuse anything that is not a same-origin
// path so a crafted payload cannot send the user to another site.
function resolveTarget(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) {
    return SCOPE_PATH;
  }
  if (raw.startsWith(SCOPE_PATH)) return raw;
  return SCOPE_PATH + raw.replace(/^\/+/, '');
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = resolveTarget(event.notification.data && event.notification.data.url);

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          const path = new URL(client.url).pathname;
          if (path.startsWith(SCOPE_PATH) && 'focus' in client) {
            client.focus();
            if ('navigate' in client) return client.navigate(target);
            return undefined;
          }
        }
        return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
      }),
  );
});
