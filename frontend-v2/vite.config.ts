import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// v2 is served by NestJS at /v2/, so the asset base must be /v2/ at build
// time so emitted asset paths resolve correctly when bundle is loaded under
// that prefix. In dev (vite dev) we still proxy /api → backend on :8082 so
// the dev server can hit live data.
export default defineConfig({
  base: '/v2/',
  plugins: [react()],
  server: {
    port: 5273,
    strictPort: false,
    proxy: {
      '/api': { target: 'http://localhost:8082', changeOrigin: true },
      '/auth': { target: 'http://localhost:8082', changeOrigin: true },
      '/report': { target: 'http://localhost:8082', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    // Keep filenames stable enough that aggressive HTTP caches don't strand
    // users on a half-loaded bundle after deploys.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          tanstack: [
            '@tanstack/react-query',
            '@tanstack/react-query-persist-client',
          ],
        },
      },
    },
  },
});
