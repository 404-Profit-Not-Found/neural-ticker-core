# Frontend E2E + visual regression (Playwright)

Runs the real React app against an **in-memory mock backend**: no NestJS,
no database, no network. Only the Vite dev server is started (by Playwright).

```bash
npm run e2e              # run + compare screenshots with the committed baselines
npm run e2e:report       # open the HTML report (expected / actual / diff slider)
npm run e2e:update       # accept the current UI as the new baseline
npm run e2e:compare      # diff your working tree against main (or: -- <ref>)
npm run e2e:typecheck
```

`e2e:compare` checks out the base ref into a temporary worktree, captures its
screenshots with *this* suite, then runs your tree against them. The report
lands in `playwright-report-vs-<ref>/`. Tests that fail on the base only
because a feature doesn't exist there yet show up as missing baselines.

## How it stays deterministic

| Source of noise           | Handled by                                                  |
| ------------------------- | ----------------------------------------------------------- |
| API data                  | `mocks/backend.ts` — stateful mock, fixtures in `mocks/data.ts` |
| "today", buy dates        | `page.clock.setFixedTime(NOW)` (2026-09-24)                 |
| Recharts JS animations    | `snap()` waits until SVG geometry is stable for 1 s         |
| CSS animations, caret     | `toHaveScreenshot({ animations: 'disabled', caret: 'hide' })` |
| Query devtools, fonts/CDN | `screenshot.css` hides devtools; third-party hosts aborted  |

Tolerance is `maxDiffPixels: 10` — deliberately strict (a whole new button is
<0.3% of a dark page). Baselines are per platform (`-darwin.png`), so CI on
Linux needs its own set (`npm run e2e:update` in the CI image).

## Mock backend rules

- Mirrors `PortfolioService`: buys are funded from cash in the ticker's
  currency and rejected with the backend's exact insufficient-cash message.
- **Any `/api` call without a handler fails the test** (`unmocked`), so a new
  endpoint can't slip in unnoticed — add a handler in `mocks/backend.ts`.
- Uncaught page errors fail the test.
- Every test attaches `api-calls.json` (method, path, body) to the report.
- Per-test state: `test.use({ seed: { cash: [...], positions: [...] } })`,
  inspect with `backend.cashOf('USD')`, `backend.callsTo('POST', path)`.
