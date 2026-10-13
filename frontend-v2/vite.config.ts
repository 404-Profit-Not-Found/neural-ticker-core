import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import packageJson from './package.json';

// The two libraries every page needs get stable vendor chunks, so app-code
// deploys don't invalidate them in the browser cache. Everything else is left
// to Rollup's automatic chunking on purpose: assigning a library to a manual
// chunk also drags in all of its dependencies, and page-only libraries such
// as recharts share small helpers (clsx, use-sync-external-store) with the
// shell — pinning them would make the entry chunk import the whole library.
const VENDOR_CHUNKS: Array<[name: string, test: RegExp]> = [
  ['vendor-react', /node_modules\/(react|react-dom|scheduler|react-router|react-router-dom)\//],
  ['vendor-query', /node_modules\/(@tanstack\/(react-query|query-core|react-query-persist-client|query-persist-client-core)|idb-keyval)\//],
];

// The app is served by NestJS at the origin root (see src/app.module.ts).
// VITE_BASE can move it under a sub-path (the code is base-path aware — see
// src/lib/base.ts); it must then be served from that same path. In dev, /api
// is proxied to a backend on :8082 (override with VITE_API_TARGET). To develop
// with no backend at all use `npm run dev:mock`,
// which layers the in-memory mock API on top of this config (see
// vite.mock.config.ts) — the mock is never part of this file or of a build.
const plugins: PluginOption[] = [
  react(),
  {
    name: 'html-transform',
    transformIndexHtml(html) {
      return html.replace('%APP_VERSION%', packageJson.version);
    },
  },
];

export default defineConfig({
  base: process.env.VITE_BASE || '/',
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  plugins,
  resolve: {
    // The repo root also installs react (hoisted for other tooling); without
    // dedupe Vite can resolve a second copy and hooks break.
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 5273,
    strictPort: false,
    proxy: {
      '/api': { target: process.env.VITE_API_TARGET || 'http://localhost:8082', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Shared modules used by several pages (single icons, tiny helpers)
        // would otherwise each become their own ~0.2 kB request; fold them
        // into a neighbouring chunk instead.
        experimentalMinChunkSize: 6 * 1024,
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          for (const [name, test] of VENDOR_CHUNKS) {
            if (test.test(id)) return name;
          }
          return undefined;
        },
      },
    },
  },
});
