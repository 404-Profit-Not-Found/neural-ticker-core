// Tiny offline-first service worker for Neural Ticker PWA
const CACHE = "neural-ticker-v3";
const ASSETS = [
  "Neural%20Ticker.html",
  "Design%20System.html",
  "styles.css",
  "manifest.webmanifest",
  "favicon.png",
  "icon-192.png",
  "icon-512.png",
  "src/data.js",
  "src/components.jsx",
  "src/skeletons.jsx",
  "src/dashboard.jsx",
  "src/ticker-detail.jsx",
  "src/analyzer.jsx",
  "src/chrome.jsx",
  "src/design-system.jsx",
  "src/app.jsx",
  "src/tweaks-panel.jsx"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  e.respondWith(
    caches.match(req).then(cached =>
      cached || fetch(req).then(res => {
        // Cache successful same-origin responses
        if (res.ok && new URL(req.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => cached)
    )
  );
});
