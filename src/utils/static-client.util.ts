/**
 * Paths the web client's `index.html` fallback must never answer. Without
 * this an unknown API route returns the app shell with a 200 — to an API
 * client that looks like success with an unparseable body.
 */
export const STATIC_CLIENT_EXCLUDE = ['/api/{*path}'];
