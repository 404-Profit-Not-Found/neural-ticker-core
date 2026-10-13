// The app is served at the origin root, but nothing in it assumes that: the
// base path comes from the build (`base` in vite.config.ts). React Router
// handles the prefix for in-app links via `basename`; everything that touches
// the raw URL — full-page redirects, pathname checks, shareable links, the
// service worker — goes through these helpers instead of hardcoding `/`.

/** Base path without a trailing slash: `` at the root, `/app` under a sub-path. */
export const BASE: string = import.meta.env.BASE_URL.replace(/\/+$/, '');

/** Absolute URL path for an app route: `appPath('/portfolio')` → `/portfolio` (plus the base, if any). */
export function appPath(route: string = '/'): string {
  const rel = route.startsWith('/') ? route : `/${route}`;
  return `${BASE}${rel}`;
}

/** Current pathname relative to the app base, always starting with `/`. */
export function appPathname(): string {
  const p = window.location.pathname;
  if (BASE && (p === BASE || p.startsWith(`${BASE}/`))) {
    return p.slice(BASE.length) || '/';
  }
  return p;
}

/** Fully-qualified shareable URL for an app route. */
export function appUrl(route: string): string {
  return `${window.location.origin}${appPath(route)}`;
}

/**
 * Start the Google sign-in round-trip. The backend callback returns to
 * `/oauth-callback` at the origin root, where this app is served.
 */
export function startGoogleLogin(intent?: 'waitlist'): void {
  window.location.href = `/api/auth/google${intent ? `?intent=${intent}` : ''}`;
}
