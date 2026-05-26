// Offline-first service worker for Neural Ticker v2 (pixel terminal experimental UI)
// Scope: /v2/
const CACHE = "neural-ticker-v2-001";
const ASSETS = [
  "./",
  "index.html",
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
  // Don't intercept /api/* requests — let them hit the network directly so cookies
  // and live data work without stale cache.
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/")) return;
  e.respondWith(
    caches.match(req).then(cached =>
      cached || fetch(req).then(res => {
        if (res.ok && url.origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => cached)
    )
  );
});

// ── Web Push handling (price alerts, research-done, etc.) ──
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); }
  catch (e) { payload = { title: "NEURAL//TICKER", body: event.data.text() }; }

  const data = payload.data || {};
  const tag = data.alertType
    ? `price-alert-${data.symbol || ""}`
    : data.symbol
      ? `research-${data.symbol}`
      : "notification";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/v2/icon-192.png",
    badge: "/v2/favicon.png",
    data,
    vibrate: [100, 50, 100],
    tag,
    renotify: true,
  };
  event.waitUntil(
    self.registration.showNotification(payload.title || "NEURAL//TICKER", options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Prefer ticker detail if symbol is provided
  const sym = event.notification.data?.symbol;
  const target = sym ? `/v2/?sym=${encodeURIComponent(sym)}` : "/v2/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      // Focus existing v2 tab if any
      for (const c of list) {
        if (c.url.includes("/v2/") && "focus" in c) {
          c.focus();
          if ("navigate" in c) c.navigate(target);
          return;
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
    })
  );
});
