// Dev-only: the regular config with /api answered by the in-memory mock in
// ./mock instead of being proxied to a backend. Used by `npm run dev:mock`
// and the screenshot harness; never used for builds.
import { defineConfig } from 'vite';
import base from './vite.config.ts';
import { mockApi } from './mock/plugin.ts';

export default defineConfig({
  ...base,
  // This config exists only to run on the mock, so it is always on.
  plugins: [...(base.plugins ?? []), mockApi({ force: true })],
  server: { ...base.server, proxy: undefined },
});
