// v2 API client — talks to the NestJS backend mounted at /api/v1/*.
// Loaded before any JSX module so it can register window.API globally.

(function () {
  const DEFAULTS = {
    base: "/api/v1",
    timeout: 12000,
    credentials: "include", // send auth cookie when same origin
  };

  function timeoutSignal(ms) {
    if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) {
      return AbortSignal.timeout(ms);
    }
    const c = new AbortController();
    setTimeout(() => c.abort(), ms);
    return c.signal;
  }

  async function request(path, opts) {
    const o = Object.assign({}, opts || {});
    const url = path.startsWith("http") ? path : DEFAULTS.base + path;
    const init = {
      method: o.method || "GET",
      credentials: DEFAULTS.credentials,
      headers: Object.assign(
        { Accept: "application/json" },
        o.body && !(o.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {},
        o.headers || {},
      ),
      signal: timeoutSignal(o.timeout || DEFAULTS.timeout),
    };
    if (o.body !== undefined) {
      init.body =
        typeof o.body === "string" || o.body instanceof FormData
          ? o.body
          : JSON.stringify(o.body);
    }

    const res = await fetch(url, init);
    if (res.status === 401 || res.status === 403) {
      const err = new Error("AUTH_REQUIRED");
      err.status = res.status;
      throw err;
    }
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      try {
        err.body = await res.json();
      } catch (e) {
        /* swallow */
      }
      throw err;
    }
    // Some endpoints return empty body
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (e) {
      return text;
    }
  }

  // SSE helper for /api/v1/research/stream (text/event-stream)
  function stream(path, body, onEvent) {
    const url = DEFAULTS.base + path;
    const ctl = new AbortController();
    (async () => {
      try {
        const res = await fetch(url, {
          method: "POST",
          credentials: DEFAULTS.credentials,
          headers: {
            Accept: "text/event-stream",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body || {}),
          signal: ctl.signal,
        });
        if (!res.ok || !res.body) {
          onEvent({ type: "error", data: { status: res.status } });
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf("\n\n")) !== -1) {
            const chunk = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const lines = chunk.split("\n");
            let evt = "message";
            let data = "";
            for (const ln of lines) {
              if (ln.startsWith("event:")) evt = ln.slice(6).trim();
              else if (ln.startsWith("data:")) data += ln.slice(5).trim();
            }
            let payload = data;
            try { payload = JSON.parse(data); } catch (e) { /* leave as string */ }
            onEvent({ type: evt, data: payload });
          }
        }
        onEvent({ type: "done", data: null });
      } catch (err) {
        if (err.name !== "AbortError") {
          onEvent({ type: "error", data: { message: err.message } });
        }
      }
    })();
    return () => ctl.abort();
  }

  // Tap helper — invalidates query keys after a mutation succeeds.
  // Usage: someMutation().then(_invalidate("/portfolio")) → returns the
  // mutation result unchanged so chains keep working.
  function _invalidate(prefix) {
    return (res) => {
      try { invalidateQueries(prefix); } catch (e) { /* swallow */ }
      return res;
    };
  }

  // ── Endpoints ────────────────────────────────────────────────
  const API = {
    request,
    stream,

    // Users (under /api/v1/users)
    me: () => request("/users/me"),

    // Admin (role=admin only — /api/v1/users/...)
    adminUsers: () => request("/users"),
    adminGrantCredits: (id, amount, reason) =>
      request(`/users/${encodeURIComponent(id)}/credits`, { method: "POST", body: { amount, reason } })
        .then(_invalidate("/users")),
    adminSetRole: (id, role) =>
      request(`/users/${encodeURIComponent(id)}/role`, { method: "PATCH", body: { role } })
        .then(_invalidate("/users")),
    adminSetTier: (id, tier) =>
      request(`/users/${encodeURIComponent(id)}/tier`, { method: "PATCH", body: { tier } })
        .then(_invalidate("/users")),

    // Web Push subscriptions
    pushVapidKey: () => request("/push/vapid-key"),
    pushSubscribe: (sub) => request("/push/subscribe", { method: "POST", body: sub }),
    pushUnsubscribe: (endpoint) => request("/push/unsubscribe", { method: "POST", body: { endpoint } }),

    // Portfolio AI analyses
    portfolioAnalyses: () => request("/portfolio/analyses"),
    portfolioQuickRec: () => request("/portfolio/quick-recommendation"),
    portfolioAnalyze: (body) =>
      request("/portfolio/analyze", { method: "POST", body }),

    // Auth (auth controller is mounted at /api/auth — no /v1 here)
    loginUrl: (returnTo) =>
      "/api/auth/google" + (returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""),
    logout: () => fetch("/api/auth/logout", { method: "POST", credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .finally(() => { try { clearPersistedCache(); } catch (e) {} }),

    // Tickers
    indices: () => request("/market-data/indices"),
    tickers: (search) =>
      request(`/tickers${search ? `?search=${encodeURIComponent(search)}` : ""}`),
    ticker: (sym) => request(`/tickers/${encodeURIComponent(sym)}`),
    composite: (sym) => request(`/tickers/${encodeURIComponent(sym)}/composite`),
    snapshot: (sym) => request(`/tickers/${encodeURIComponent(sym)}/snapshot`),
    history: (sym, opts = {}) => {
      const q = new URLSearchParams();
      if (opts.interval) q.set("interval", opts.interval);
      if (opts.days) q.set("days", String(opts.days));
      if (opts.from) q.set("from", opts.from);
      if (opts.to) q.set("to", opts.to);
      const qs = q.toString();
      return request(`/tickers/${encodeURIComponent(sym)}/history${qs ? "?" + qs : ""}`);
    },
    news: (sym) => request(`/tickers/${encodeURIComponent(sym)}/news`),
    newsGeneral: () => request("/news/general"),
    newsDigest: () => request("/news/digest"),
    sectors: () => request("/tickers/sectors"),
    tickerCount: () => request("/tickers/count"),
    statsStrongBuy: () => request("/stats/strong-buy"),
    statsSell: () => request("/stats/sell"),

    // Analyzer (paginated screener — used by dashboard top-opps + analyzer screen)
    analyzer: (opts = {}) => {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(opts)) {
        if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
      }
      const qs = q.toString();
      return request(`/market-data/analyzer${qs ? "?" + qs : ""}`);
    },

    // Watchlist & portfolio (auth)
    watchlists: () => request("/watchlists"),
    watchlistCreate: (name) =>
      request("/watchlists", { method: "POST", body: { name } })
        .then(_invalidate("/watchlists")),
    watchlistRename: (id, name) =>
      request(`/watchlists/${encodeURIComponent(id)}`, { method: "PATCH", body: { name } })
        .then(_invalidate("/watchlists")),
    watchlistDelete: (id) =>
      request(`/watchlists/${encodeURIComponent(id)}`, { method: "DELETE" })
        .then(_invalidate("/watchlists")),
    watchlistAdd: (id, symbol) =>
      request(`/watchlists/${encodeURIComponent(id)}/items`, { method: "POST", body: { symbol } })
        .then(_invalidate("/watchlists")),
    watchlistRemove: (id, itemId) =>
      request(`/watchlists/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}`, { method: "DELETE" })
        .then(_invalidate("/watchlists")),
    favoritesToggle: (symbol) =>
      request("/watchlists/favorites/toggle", { method: "POST", body: { symbol } })
        .then(_invalidate("/watchlists")),

    portfolio: (displayCurrency) =>
      request(`/portfolio/positions${displayCurrency ? "?displayCurrency=" + encodeURIComponent(displayCurrency) : ""}`),
    // No-op tap helper used by mutation methods below — keeps return value intact.
    researchPublicLink: (id) =>
      request(`/research/${encodeURIComponent(id)}/public-link`, { method: "POST" }),
    portfolioCreate: (body) =>
      request("/portfolio/positions", { method: "POST", body })
        .then(_invalidate("/portfolio")),
    portfolioUpdate: (id, body) =>
      request(`/portfolio/positions/${encodeURIComponent(id)}`, { method: "PATCH", body })
        .then(_invalidate("/portfolio")),
    portfolioDelete: (id) =>
      request(`/portfolio/positions/${encodeURIComponent(id)}`, { method: "DELETE" })
        .then(_invalidate("/portfolio")),

    // Price alerts (auth)
    alerts: () => request("/price-alerts"),
    alertCreate: (body) =>
      request("/price-alerts", { method: "POST", body })
        .then(_invalidate("/price-alerts")),
    alertUpdate: (id, body) =>
      request(`/price-alerts/${encodeURIComponent(id)}`, { method: "PATCH", body })
        .then(_invalidate("/price-alerts")),
    alertDelete: (id) =>
      request(`/price-alerts/${encodeURIComponent(id)}`, { method: "DELETE" })
        .then(_invalidate("/price-alerts")),

    // Dev login shortcut (only works when NODE_ENV != production)
    devLogin: (email) =>
      fetch("/api/auth/dev/token", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      }).then((r) => (r.ok ? r.json() : null)).catch(() => null),

    // Social (per-ticker comments + watchers count)
    socialComments: (sym) => request(`/social/comments/${encodeURIComponent(sym)}`),
    socialWatchers: (sym) => request(`/social/stats/${encodeURIComponent(sym)}/watchers`),
    socialPost: (sym, body) => request(`/social/comments/${encodeURIComponent(sym)}`, { method: "POST", body }),

    // StockTwits public endpoints
    stocktwitsAnalysis: (sym) => request(`/stocktwits/${encodeURIComponent(sym)}/analysis`),
    stocktwitsWatchers: (sym) => request(`/stocktwits/${encodeURIComponent(sym)}/watchers`),
    stocktwitsVolume: (sym) => request(`/stocktwits/${encodeURIComponent(sym)}/stats/volume`),
    stocktwitsEvents: (sym) => request(`/stocktwits/${encodeURIComponent(sym)}/events`),

    // Auth profile (real path is /auth/profile — not under /v1)
    profile: () => fetch("/api/auth/profile", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),

    // Research / AI chat
    researchStream: (body, onEvent) => stream("/research/stream", body, onEvent),
    researchAsk: (body) => request("/research/ask", { method: "POST", body })
      .then(_invalidate("/research"))
      .then(_invalidate("/users")), // credits balance changed
    researchGet: (id) => request(`/research/${encodeURIComponent(id)}`),
    researchList: (opts = {}) => {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(opts)) {
        if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
      }
      const qs = q.toString();
      return request(`/research${qs ? "?" + qs : ""}`);
    },
    researchContribute: (tickers, content) =>
      request("/research/contribute", { method: "POST", body: { tickers, content } })
        .then(_invalidate("/users")),
    researchUpload: (body) =>
      request("/research/upload", { method: "POST", body }),
    researchPublic: (id, signature) =>
      request(`/report/${encodeURIComponent(id)}/${encodeURIComponent(signature)}`),
    newsSummary: (sym) =>
      request(`/research/news-summary/${encodeURIComponent(sym)}`),
  };

  // ── Query cache — TanStack-Query inspired, build-free ─────────────────
  // Global cache keyed by JSON-serialized deps. Each entry tracks:
  //   data, error, fetchedAt, subscribers (Set of forceUpdate fns), inflight Promise.
  // Features:
  //   • staleTime — re-fetch when stale on mount or window focus
  //   • cacheTime — drop unused entry after this many ms
  //   • refetchOnWindowFocus — opt-in (default true for poll>0 queries)
  //   • invalidateQueries(prefix) — mark matching entries stale and refetch active ones
  //   • mutation(fn) — runs and optionally invalidates query prefixes
  // ──────────────────────────────────────────────────────────────────────
  const _cache = new Map(); // key -> entry
  const DEFAULT_STALE_MS = 30_000;
  const DEFAULT_CACHE_MS = 5 * 60_000;

  // ── localStorage persistence (mirrors PersistQueryClientProvider) ───
  // Mirrors old frontend's `frontend/src/lib/queryClient.ts` — keep the
  // version key in sync with `buster` there when API shapes change.
  const _PERSIST_KEY = "v2_query_cache_v3";
  const _PERSIST_MAX_AGE_MS = 24 * 60 * 60_000; // 24 hours
  // Endpoints we don't want to survive page reload (user-specific volatile state)
  const _PERSIST_DENYLIST = ["/auth/", "/users/me", "/push/"];
  let _persistTimer = null;
  let _hydrating = false;

  function _shouldPersistKey(key) {
    if (!key || key.length > 2000) return false; // skip huge keys
    return !_PERSIST_DENYLIST.some((p) => key.includes(p));
  }

  function _persistNow() {
    if (_hydrating) return;
    try {
      const now = Date.now();
      // Seed with previously-persisted entries so GC'd-from-RAM keys still
      // survive up to _PERSIST_MAX_AGE_MS.
      const merged = new Map(); // key -> [data, fetchedAt]
      try {
        const raw = localStorage.getItem(_PERSIST_KEY);
        if (raw) {
          const prev = JSON.parse(raw);
          if (prev && Array.isArray(prev.entries)) {
            for (const tuple of prev.entries) {
              if (!Array.isArray(tuple) || tuple.length < 3) continue;
              const [k, d, ts] = tuple;
              if (typeof k !== "string" || typeof ts !== "number") continue;
              if (now - ts > _PERSIST_MAX_AGE_MS) continue;
              merged.set(k, [d, ts]);
            }
          }
        }
      } catch (e) { /* corrupted prev blob — ignore, start fresh */ }
      // Overlay in-memory cache (in-memory is always fresher).
      for (const [key, entry] of _cache.entries()) {
        if (entry.error) continue;
        if (entry.data === undefined) continue;
        if (!entry.fetchedAt) continue;
        if (now - entry.fetchedAt > _PERSIST_MAX_AGE_MS) continue;
        if (!_shouldPersistKey(key)) continue;
        merged.set(key, [entry.data, entry.fetchedAt]);
      }
      const out = [];
      for (const [k, [d, ts]] of merged.entries()) out.push([k, d, ts]);
      const payload = JSON.stringify({ v: 1, t: now, entries: out });
      // Guard quota — if storage full, drop persisted cache rather than crash.
      try {
        localStorage.setItem(_PERSIST_KEY, payload);
      } catch (quotaErr) {
        try { localStorage.removeItem(_PERSIST_KEY); } catch (e) {}
      }
    } catch (e) {
      /* swallow — persistence is best-effort */
    }
  }

  function _schedulePersist() {
    if (_hydrating) return;
    if (_persistTimer) return; // already scheduled within window
    _persistTimer = setTimeout(() => {
      _persistTimer = null;
      _persistNow();
    }, 500);
  }

  function _hydrate() {
    if (typeof localStorage === "undefined") return;
    _hydrating = true;
    try {
      const raw = localStorage.getItem(_PERSIST_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.entries)) return;
      const now = Date.now();
      let restored = 0, dropped = 0;
      for (const tuple of parsed.entries) {
        if (!Array.isArray(tuple) || tuple.length < 3) continue;
        const [key, data, fetchedAt] = tuple;
        if (typeof key !== "string" || typeof fetchedAt !== "number") continue;
        if (now - fetchedAt > _PERSIST_MAX_AGE_MS) { dropped++; continue; }
        const entry = {
          data, error: null,
          fetchedAt, gcAt: 0,
          subscribers: new Set(),
          inflight: null,
          loaderRef: null,
        };
        _cache.set(key, entry);
        restored++;
      }
      if (typeof console !== "undefined" && (restored || dropped)) {
        // eslint-disable-next-line no-console
        console.debug(`[v2-cache] hydrated ${restored} entries, dropped ${dropped} stale`);
      }
    } catch (e) {
      // Corrupted blob — wipe it.
      try { localStorage.removeItem(_PERSIST_KEY); } catch (err) {}
    } finally {
      _hydrating = false;
    }
  }

  function clearPersistedCache() {
    try { localStorage.removeItem(_PERSIST_KEY); } catch (e) {}
    _cache.clear();
  }

  // Hydrate immediately — before any React mount, before any useApi() call.
  _hydrate();

  // Flush pending persist on tab close so the last 500ms of writes aren't lost.
  if (typeof window !== "undefined") {
    const flush = () => {
      if (_persistTimer) {
        clearTimeout(_persistTimer);
        _persistTimer = null;
        _persistNow();
      }
    };
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
  }

  function _keyFor(deps) {
    try { return JSON.stringify(deps ?? null); }
    catch (e) { return String(deps); }
  }

  function _ensureEntry(key) {
    let e = _cache.get(key);
    if (!e) {
      e = {
        data: undefined, error: null,
        fetchedAt: 0, gcAt: 0,
        subscribers: new Set(),
        inflight: null,
        loaderRef: null,
      };
      _cache.set(key, e);
    }
    return e;
  }

  function _notify(entry) {
    for (const sub of entry.subscribers) {
      try { sub(); } catch (err) { /* swallow */ }
    }
  }

  async function _runFetch(key, loader) {
    const entry = _ensureEntry(key);
    if (entry.inflight) return entry.inflight;
    entry.loaderRef = loader;
    entry.inflight = Promise.resolve()
      .then(loader)
      .then((d) => {
        entry.data = d;
        entry.error = null;
        entry.fetchedAt = Date.now();
        entry.inflight = null;
        _notify(entry);
        _schedulePersist();
        return d;
      })
      .catch((err) => {
        entry.error = err;
        entry.inflight = null;
        _notify(entry);
        throw err;
      });
    return entry.inflight;
  }

  function invalidateQueries(predicate) {
    // predicate: (key) => boolean OR string prefix
    const check = typeof predicate === "string"
      ? (k) => k.includes(JSON.stringify(predicate)) || k.includes(predicate)
      : predicate;
    for (const [key, entry] of _cache.entries()) {
      if (!check(key)) continue;
      entry.fetchedAt = 0; // mark stale
      if (entry.subscribers.size > 0 && entry.loaderRef) {
        // re-fetch only if someone's listening
        _runFetch(key, entry.loaderRef).catch(() => {});
      }
    }
  }

  // Global "window focus" refetch — checks every active entry that's stale.
  if (typeof window !== "undefined") {
    let _lastFocusRefetch = 0;
    const onFocus = () => {
      const now = Date.now();
      if (now - _lastFocusRefetch < 1000) return; // debounce
      _lastFocusRefetch = now;
      for (const [key, entry] of _cache.entries()) {
        if (entry.subscribers.size === 0 || !entry.loaderRef) continue;
        const stale = now - entry.fetchedAt > (entry._staleMs ?? DEFAULT_STALE_MS);
        if (stale) _runFetch(key, entry.loaderRef).catch(() => {});
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") onFocus();
    });
  }

  // GC pass — drop entries that haven't been observed in cacheTime
  if (typeof window !== "undefined") {
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of _cache.entries()) {
        if (entry.subscribers.size > 0) continue;
        if (now - entry.fetchedAt > DEFAULT_CACHE_MS) {
          _cache.delete(key);
        }
      }
    }, 60_000);
  }

  // ── React hook (drop-in replacement keeping previous signature) ──────
  // Usage:
  //   const [data, { loading, error, reload }] = useApi(() => API.indices(), [])
  // Opts:
  //   { poll, staleTime, refetchOnWindowFocus }
  function useApi(loader, deps, opts) {
    const { useState, useEffect, useRef, useCallback } = React;
    const key = _keyFor(deps);
    const entry = _ensureEntry(key);
    const staleMs = opts?.staleTime ?? (opts?.poll || DEFAULT_STALE_MS);
    entry._staleMs = staleMs;

    // Always keep loader fresh so window-focus refetch uses the latest closure
    entry.loaderRef = loader;

    const [, force] = useState(0);
    const tickRef = useRef(0);
    const subscribe = useCallback(() => {
      force(++tickRef.current);
    }, []);

    // Subscribe/unsubscribe + initial fetch
    useEffect(() => {
      entry.subscribers.add(subscribe);
      const isStale = !entry.fetchedAt || Date.now() - entry.fetchedAt > staleMs;
      if (isStale && !entry.inflight) _runFetch(key, loader).catch(() => {});
      return () => { entry.subscribers.delete(subscribe); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    // Polling
    useEffect(() => {
      if (!opts?.poll) return;
      const id = setInterval(() => {
        _runFetch(key, entry.loaderRef).catch(() => {});
      }, opts.poll);
      return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, opts?.poll]);

    const reload = useCallback(() => {
      entry.fetchedAt = 0;
      return _runFetch(key, entry.loaderRef).catch(() => {});
    }, [key]);

    return [
      entry.data,
      {
        loading: entry.inflight != null || (entry.data === undefined && entry.error == null),
        error: entry.error,
        reload,
        isStale: !entry.fetchedAt || Date.now() - entry.fetchedAt > staleMs,
      },
    ];
  }

  // useIsFetching — count active inflight queries. Use in header for
  // a global "syncing" indicator while persisted cache is refreshed.
  function useIsFetching() {
    const { useState, useEffect } = React;
    const [count, setCount] = useState(0);
    useEffect(() => {
      let timerId = 0;
      let unmounted = false;
      const tick = () => {
        if (unmounted) return;
        let n = 0;
        for (const [, entry] of _cache.entries()) {
          if (entry.inflight) n++;
        }
        setCount(n);
        timerId = setTimeout(tick, 500);
      };
      tick();
      return () => {
        unmounted = true;
        clearTimeout(timerId);
      };
    }, []);
    return count;
  }

  // useMutation — for POST/PATCH/DELETE with auto-invalidation
  function useMutation(mutateFn, opts) {
    const { useState, useCallback } = React;
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [data, setData] = useState(null);

    const mutate = useCallback(async (vars) => {
      setBusy(true); setError(null);
      try {
        const res = await mutateFn(vars);
        setData(res);
        // Auto-invalidate listed prefixes
        if (opts?.invalidates) {
          for (const p of opts.invalidates) invalidateQueries(p);
        }
        opts?.onSuccess?.(res, vars);
        return res;
      } catch (err) {
        setError(err);
        opts?.onError?.(err, vars);
        throw err;
      } finally {
        setBusy(false);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { mutate, busy, error, data };
  }

  // Legacy useApi kept above; here keep the old run-based version too as a
  // fallback for any sites that pass non-serialisable deps (none today).
  function _useApiLegacy(loader, deps, opts) {
    const { useState, useEffect, useRef, useCallback } = React;
    const [data, setData] = useState(undefined);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    const epoch = useRef(0);

    const run = useCallback(() => {
      const e = ++epoch.current;
      setLoading(true);
      Promise.resolve()
        .then(loader)
        .then((d) => {
          if (epoch.current !== e) return;
          setData(d);
          setError(null);
          setLoading(false);
        })
        .catch((err) => {
          if (epoch.current !== e) return;
          setError(err);
          setLoading(false);
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps || []);

    useEffect(() => {
      run();
      if (opts && opts.poll) {
        const id = setInterval(run, opts.poll);
        return () => clearInterval(id);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [run]);

    return [data, { loading, error, reload: run }];
  }

  // ── Normalizers (backend → MOCK shape used by JSX components) ─
  function hashSeed(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (h * 31 + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h) || 1;
  }

  function formatMarketCap(n) {
    if (!n || isNaN(n)) return "—";
    const abs = Math.abs(n);
    if (abs >= 1e12) return (n / 1e12).toFixed(2) + "T";
    if (abs >= 1e9) return (n / 1e9).toFixed(2) + "B";
    if (abs >= 1e6) return (n / 1e6).toFixed(2) + "M";
    return n.toFixed(0);
  }

  function scoreToVerdict(score) {
    if (score == null) return "HOLD";
    if (score >= 9) return "NO BRAINER";
    if (score >= 7.5) return "STRONG BUY";
    if (score >= 6) return "SPECULATIVE";
    if (score >= 4) return "HOLD";
    return "SELL";
  }

  function normalizeAnalyzerItem(item) {
    if (!item || !item.ticker) return null;
    const { ticker, latestPrice, fundamentals, aiAnalysis, sparkline } = item;
    const score = aiAnalysis?.overall_score;
    const risk = aiAnalysis?.financial_risk;
    const price = latestPrice?.close ?? 0;
    const change = latestPrice?.change ?? latestPrice?.changePercent ?? 0;
    const upside =
      aiAnalysis?.base_price && price
        ? ((aiAnalysis.base_price - price) / price) * 100
        : 0;

    const sym = ticker.symbol;
    return {
      sym,
      name: ticker.name || sym,
      sector: ticker.sector || ticker.industry || "—",
      price,
      change,
      ai: scoreToVerdict(score),
      risk: risk != null ? Math.max(0, Math.min(10, Math.round(risk))) : 5,
      upside,
      mc: formatMarketCap(fundamentals?.market_cap),
      pe: fundamentals?.pe_ttm ?? fundamentals?.trailing_pe ?? null,
      seed: hashSeed(sym),
      logo:
        ticker.logo_url ||
        `/api/v1/tickers/${encodeURIComponent(sym)}/logo`,
      spark: Array.isArray(sparkline) && sparkline.length > 1
        ? sparkline
        : [price, price],
      candles: [],
      _live: true, // marker so screens know to lazy-load detail data
    };
  }

  function normalizeCompositeToCandles(composite) {
    // /tickers/:symbol/composite returns history under market_data.history,
    // and /tickers/:symbol/history returns flat array. Try both shapes.
    const arr =
      (composite && composite.history) ||
      (composite && composite.market_data && composite.market_data.history) ||
      (Array.isArray(composite) ? composite : null);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((c) => ({
        o: Number(c.open),
        h: Number(c.high),
        l: Number(c.low),
        c: Number(c.close),
      }))
      .filter((c) => isFinite(c.o) && isFinite(c.c));
  }

  // ── Hooks: live ticker list + per-symbol enrichment ───────────
  function useLiveTickers(opts) {
    const o = Object.assign({ limit: 50, sortBy: "market_cap", sortDir: "DESC" }, opts || {});
    const [data, meta] = useApi(() => API.analyzer(o), [JSON.stringify(o)]);
    let tickers = null;
    if (data && Array.isArray(data.items)) {
      tickers = data.items.map(normalizeAnalyzerItem).filter(Boolean);
    }
    return [tickers, meta];
  }

  function useTickerHistory(sym, daysOrOpts) {
    const opts = typeof daysOrOpts === "number"
      ? { days: daysOrOpts, interval: "1d" }
      : Object.assign({ days: 60, interval: "1d" }, daysOrOpts || {});
    const [data, meta] = useApi(
      () => (sym ? API.history(sym, opts) : Promise.resolve(null)),
      [sym, JSON.stringify(opts)],
    );
    const candles = data ? normalizeCompositeToCandles(data) : null;
    return [candles, meta];
  }

  function useTickerNews(sym) {
    const [data, meta] = useApi(
      () => (sym ? API.news(sym) : Promise.resolve(null)),
      [sym],
    );
    return [Array.isArray(data) ? data : null, meta];
  }

  function useTickerComposite(sym) {
    const [data, meta] = useApi(
      () => (sym ? API.composite(sym) : Promise.resolve(null)),
      [sym],
    );
    return [data && typeof data === "object" ? data : null, meta];
  }

  // Convenience: returns live tickers if available, else MOCK fallback (synchronous)
  function useTickersWithFallback(opts) {
    const [live] = useLiveTickers(opts);
    return live && live.length > 0 ? live : window.MOCK.tickers;
  }

  Object.assign(API, { normalizeAnalyzerItem, normalizeCompositeToCandles });

  window.API = API;
  window.useApi = useApi;
  window.useMutation = useMutation;
  window.invalidateQueries = invalidateQueries;
  // Expose cache for debugging in console
  window.__queryCache = _cache;
  window.__clearQueryCache = clearPersistedCache;
  window.__persistQueryCache = _persistNow;
  window.useIsFetching = useIsFetching;
  window.useLiveTickers = useLiveTickers;
  window.useTickersWithFallback = useTickersWithFallback;
  window.useTickerHistory = useTickerHistory;
  window.useTickerNews = useTickerNews;
  window.useTickerComposite = useTickerComposite;
})();
