import axios from 'axios';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Style utility
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// API Client (V1)
export const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  timeout: 15000,
});

// Generic Client (for Auth, etc.)
export const httpClient = axios.create({
  baseURL: '/',
  withCredentials: true,
  timeout: 15000,
});

// Pages that are intentionally viewable without a session — a 401 here is
// expected and must NOT bounce the visitor to login.
const PUBLIC_PATH_PREFIXES = [
  '/report/',
  '/privacy',
  '/terms',
  '/about',
  '/oauth-callback',
];

const isPublicPath = () =>
  PUBLIC_PATH_PREFIXES.some((p) => window.location.pathname.startsWith(p));

// Add strict interceptors for error handling
const addInterceptors = (instance: typeof api) => {
  instance.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        const url: string = error.config?.url || '';
        // The session probe handles its own 401 (expected when logged out).
        const isSessionProbe = url.includes('/auth/profile');
        const onLanding = window.location.pathname === '/';
        if (!isSessionProbe && !isPublicPath() && !onLanding) {
          // Session expired mid-use: bounce to landing/login. The full-page
          // navigation also clears in-memory app state, preventing stale data
          // from one user leaking into the next.
          console.warn('Session expired — redirecting to login');
          window.location.href = '/';
        }
      }
      return Promise.reject(error);
    },
  );
};

addInterceptors(api);
addInterceptors(httpClient);
