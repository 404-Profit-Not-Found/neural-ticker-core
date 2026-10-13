# Local development

The real backend and the built frontend on your machine, against a local
PostgreSQL filled with demo data. No external API keys are needed.

Prerequisites: Node 22, `npm install` in the repo root, PostgreSQL 15+ on
`localhost:5432` where your OS user can create databases.

## 1. Database and `.env`

```bash
createdb -h localhost neural_ticker_local
```

`.env` lives in the repo root and is git-ignored. The secrets are random and
local-only; provider keys are simply absent.

```bash
cat > .env <<EOF
NODE_ENV=development
APP_ENV=local
APP_PORT=8082
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=$(id -un)
DB_PASSWORD=
DB_DATABASE=neural_ticker_local
DB_SSL=false
JWT_SECRET=$(openssl rand -hex 32)
RESEARCH_SHARE_SECRET=$(openssl rand -hex 32)
CRON_SECRET=$(openssl rand -hex 24)
ENABLE_DEV_LOGIN=true
BACKGROUND_JOBS=off
MARKET_DATA_STALE_PRICE_MINUTES=5256000
MARKET_DATA_STALE_FUNDAMENTALS_HOURS=87600
EOF
```

The last three lines keep the demo data as seeded: no in-process cron jobs,
and no live refresh of price and fundamentals when a ticker page is opened.

## 2. Start the backend

Its migrations build the schema on the first start and update it on later ones.

```bash
env -u DATABASE_URL npm run start
```

A `DATABASE_URL` exported in your shell overrides `.env`; without
`env -u DATABASE_URL` the backend would connect to — and migrate — that database.

The app is at <http://localhost:8082> (built `frontend-v2/dist` at `/`, API
under `/api`, Swagger at `/api/docs`).

## 3. Seed the demo data

```bash
npm run seed:local
```

Loads the frontend mock's data set (`frontend-v2/mock`) into the real tables
and prints the row count per table. It only ever runs against the database
`neural_ticker_local` on localhost and ignores `DATABASE_URL`. Run it after the
backend has started once, so the schema is current.

## 4. Sign in

There is no Google login locally. Open the app and run this in the browser
console; `dev@test.com` is the demo user, `admin@test.com` an admin.

```js
fetch('/api/auth/dev/token', { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'dev@test.com' }) }).then(() => location.assign('/'))
```

## Frontends

- Built app: `npm run build` in `frontend-v2/`, then reload.
- Hot reload: `npm run dev` in `frontend-v2/` (port 5273) proxies `/api` to
  `localhost:8082`; sign in the same way on that origin.
- Previous client: `npm run build` in `frontend/` writes `./client`; start the
  backend with `FRONTEND_LEGACY=true` to serve it instead.

## Reset

```bash
npm run seed:local
```

Every run empties all application tables and reloads them, including anything
you created in the app. The seeded news digest is served for 24 hours and
company news for 7 days; a re-seed refreshes both. To rebuild from nothing,
stop the backend, `dropdb -h localhost neural_ticker_local`, and repeat from step 1.

## Without keys

- Anything that needs an LLM (research, digest generation, portfolio and
  StockTwits analysis) fails with "Gemini API Key not configured".
- Yahoo and the FX services need no key, so the index tape, market status, FX
  rates, the general news feed and ticker search are live. So are the 1D / 1W /
  1M chart ranges: they show real prices and store them, which changes that
  ticker's price in the lists until the next seed.
- With `BACKGROUND_JOBS=off`, orders placed while the market is closed stay
  queued. Fill them by hand:

```bash
curl -X POST localhost:8082/api/v1/jobs/fill-pending-orders \
  -H "x-cron-secret: $(grep '^CRON_SECRET=' .env | cut -d= -f2)"
```
