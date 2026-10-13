// Runs the UNMODIFIED v1 frontend (../../frontend) against the mock API —
// the reference consumer the mock is verified with.
//
//   cd frontend && npx vite --config ../frontend-v2/mock/v1.vite.config.ts --port 5180 --strictPort
//
// Same plugins/define as frontend/vite.config.ts, minus the proxy, plus
// mockApi(). Everything is resolved from frontend/ (its node_modules, its
// postcss/tailwind config), so nothing has to be installed anywhere else and
// no file under frontend/ is touched.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { PluginOption, UserConfig } from 'vite';
import { mockApi } from './plugin.ts';

const here = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(here, '../../frontend');
const requireFromFrontend = createRequire(resolve(frontendRoot, 'package.json'));
const packageJson = JSON.parse(readFileSync(resolve(frontendRoot, 'package.json'), 'utf8')) as {
  version: string;
};

export default async (): Promise<UserConfig> => {
  // Load v1's own @vitejs/plugin-react (not whichever copy sits next to this file).
  const reactPlugin = (await import(
    pathToFileURL(requireFromFrontend.resolve('@vitejs/plugin-react')).href
  )) as { default: () => PluginOption };

  return {
    root: frontendRoot,
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.version),
    },
    plugins: [
      reactPlugin.default(),
      {
        name: 'html-transform',
        transformIndexHtml(html: string): string {
          return html.replace('%APP_VERSION%', packageJson.version);
        },
      },
      // Always on here: this config exists only to run v1 on the mock.
      mockApi({ force: true }),
    ],
    // No server.proxy: every /api/* request is answered by the mock.
  };
};
