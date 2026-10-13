# NeuralTicker frontend v2

The second-generation web client for NeuralTicker. It has every feature of
`frontend/` (v1) on a new shell — a persistent header, a live ticker tape, a
status line, a command palette (⌘K), a bottom tab bar on phones — with a
stroke-free visual language and route-level code splitting.

It is the **default web client**: the NestJS backend serves it at `/` (see
`src/app.module.ts` in the repo root). The previous client (`frontend/`) is
still built into the image and can be switched back on without a rebuild by
setting `FRONTEND_LEGACY=true`. Old `/v2/...` links redirect to the same page
at the root.

- Design language and component rules: [DESIGN.md](DESIGN.md). Read it before
  adding UI — in particular: no outlines or divider lines, one derivation per
  figure, rows instead of cards on phones.
- Stack: React 19, TypeScript, Vite, Tailwind 3, React Router 7, TanStack
  Query 5 (cache persisted to IndexedDB), Vitest + Testing Library.

## Run it

```bash
npm install
```

Against the real backend (expects the API on `http://localhost:8082`; Vite
proxies `/api`):

```bash
npm run dev
```

Without a backend — an in-memory mock of the API with seeded data, on
`http://localhost:5274/`:

```bash
npm run dev:mock
```

The mock is a Vite plugin in `mock/` and is never part of a build. It starts
signed out; open any URL with `?mock_user=user` (or `admin`, `none`) to set
the session. Scenarios (`?mock_scenario=empty`, `latency:800`, …) and the test
controls under `/api/__mock/*` are documented at the top of
[mock/plugin.ts](mock/plugin.ts).

## Check it

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm test
```

```bash
npm run build
```

`npm run build` type-checks and writes `dist/`. The Docker image builds it in
its own stage and the backend serves `frontend-v2/dist` at `/` (hashed assets
cached for a year, everything else `no-cache`). CI runs lint, tests and
the build in the `frontend-v2` job.

## Layout

| Path | What lives there |
|---|---|
| `src/app/` | Lazy routes and prefetching, theme, command-palette store |
| `src/components/layout/` | The shell: header, ticker tape, status bar, tab bar, command palette, shortcuts |
| `src/components/ui/` | Primitives (panel, dialog, tabs, segmented control, badge, inputs, empty state, skeleton, confirm) |
| `src/components/<feature>/` | Feature components (dashboard, analyzer, ticker, portfolio, …) |
| `src/pages/` | One file per route |
| `src/hooks/` | Data hooks (TanStack Query) and `useMediaQuery` |
| `src/lib/` | Pure logic: `ticker-metrics` (upside / downside / rating), `portfolio-history`, `base` (the app's base path), `queryClient` |
| `mock/` | Dev-only mock API |
| `public/` | Service worker, web manifest, icons |

## Things that are easy to get wrong

- **Base path.** The app is served at `/` but does not assume it (`VITE_BASE`
  can move it). Build links with router `<Link>` or the helpers in
  `src/lib/base.ts` rather than hard-coding `/…` URLs.
- **API prefix.** Backend routes are `/api/v1/...` (global prefix `api` plus
  the controller's `v1/...`); the axios instance in `src/lib/api.ts` already
  carries it.
- **First paint.** The entry chunk holds the shell only. Anything added to
  `src/components/layout/` ships to every visitor before they see a pixel —
  load menus, dialogs and heavy libraries on demand.
- **One derivation per figure.** Upside, downside and the AI rating come from
  `src/lib/ticker-metrics.ts`; a view must not recompute them.
