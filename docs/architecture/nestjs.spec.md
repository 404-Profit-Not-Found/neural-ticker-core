# neural-ticker: an AI-Assisted Stock Research Backend – NestJS Implementation Spec

> Version: 0.1 

---

## 0. Overview & Responsibilities

You are a senior NestJS backend engineer.

Your task is to implement a production-grade backend service that:

- Connects to:
  - **Finnhub** REST API for market data and fundamentals.
  - **OpenAI API** using the official JavaScript/TypeScript SDK (`openai`).
  - **Google Gemini API** using the official Google Gen AI JavaScript SDK (`@google/genai`).
- Persists data in **PostgreSQL 17.7** with **TimescaleDB 2.23.1** enabled for time‑series storage.
- Exposes a clean, versioned **HTTP JSON API** for:
  - A CLI / TUI stock research frontend.
  - Potential future web or mobile client apps.

Key non‑functional goals:

- Clean modular architecture (NestJS modules & providers).
- Strong typing (TypeScript) and DTO validation.
- Deterministic enrichment of AI answers from stored data (minimize hallucinations).
- Rate‑limit safety, resilience, observability, and testability.

---

## 1. System Goals & Core Use Cases

### 1.1 Goals

1. Provide structured, queryable stock data (prices, fundamentals, metrics) collected from Finnhub and persisted into PostgreSQL/Timescale.
2. Provide AI-generated research narratives and comparisons for one or more tickers using OpenAI and Gemini, **strictly grounded** in stored numeric data.
3. Provide a unified API that can:
   - Fetch current and historical data.
   - Trigger AI analyses and store the results.
   - Retrieve previously stored research notes and **risk–reward scores**.

### 1.2 Core Use Cases

- **UC1 – Ticker Snapshot**
  - Input: `symbol` (e.g. `AAPL`), optional flags: `include_fundamentals`, `include_ai_summary`.
  - Output: last price, basic fundamentals, key metrics, optional AI commentary.
- **UC2 – Historical Chart Data**
  - Input: `symbol`, interval (`1m`, `5m`, `1h`, `1d`), time range.
  - Output: OHLCV time‑series from Timescale.
- **UC3 – AI Research Note**
  - Input: list of tickers + research question (e.g. “Compare long‑term risk/reward of LLY vs NVO”).
  - Processing:
    - Fetch required data from DB only (LLM has **no internet**).
    - Build structured numeric context.
    - Call OpenAI and/or Gemini to generate the note.
    - Persist note and metadata (models used, timestamps, numeric context).
  - Output: markdown answer + metadata.
- **UC4 – Multi‑Model Cross‑Check**
  - Input: tickers + research question + requested provider (`openai`, `gemini`).
  - Output: combined answer + per‑model answers and disagreements.
- **UC5 – Risk–Reward Scanner (Cron Job)**
  - Periodically scan tickers and maintain a 0–100 **risk–reward score**:
    - 0 = max risk, no reward; 100 = high reward, minimal risk.
  - Persist scores and expose via API.

---

## 2. Tech Stack & Dependencies

### 2.1 Runtime

- **Node.js**: ≥ 22.x (LTS).
- **NestJS**: ≥ 11.x.
- **TypeScript**: ≥ 5.x.

### 2.2 NestJS & Infrastructure Libraries

- `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`
- `@nestjs/config` – environment‑based config.
- `@nestjs/typeorm`, `typeorm`, `pg` – DB access.
- `@nestjs/axios`, `axios` – HTTP clients (Finnhub, external services).
- `@nestjs/schedule`, `cron` – cron jobs for data sync and risk‑reward scanner.
- Optional for heavy background processing:
  - `@nestjs/bullmq`, `bullmq`, `ioredis`.

### 2.3 AI & External APIs

- **OpenAI**:
  - NPM: `openai` (official JS/TS SDK).
  - Used via server‑side only.
- **Google Gemini**:
  - NPM: `@google/genai` (Google Gen AI SDK for JS/TS).
- **Finnhub**:
  - Plain REST via `HttpModule` / `axios`.

### 2.4 Testing & Tooling

- **Tests**:
  - `jest`, `@nestjs/testing`, `supertest` for HTTP e2e.
- **Lint/format**:
  - `eslint`, `prettier`.
- **Migrations**:
  - `typeorm` CLI migrations (SQL or TS).
- **Containerization** (later):
  - Dockerfile + docker‑compose for Postgres/Timescale.

---

## 3. High‑Level Architecture

### 3.1 Module Structure

Use feature‑oriented NestJS modules:

```text
src/
  main.ts
  app.module.ts

  config/
    configuration.ts
    validation.ts

  database/
    database.module.ts
    database.providers.ts
    migrations/

  common/
    dto/
    filters/
    interceptors/
    guards/
    logging/

  modules/
    health/
      health.module.ts
      health.controller.ts

    symbols/
      symbols.module.ts
      symbols.controller.ts
      symbols.service.ts
      symbols.repository.ts
      entities/symbol.entity.ts

    market-data/
      market-data.module.ts
      market-data.controller.ts
      market-data.service.ts
      entities/price-ohlcv.entity.ts
      entities/fundamentals.entity.ts

    research/
      research.module.ts
      research.controller.ts
      research.service.ts
      entities/research-note.entity.ts

    risk-reward/
      risk-reward.module.ts
      risk-reward.controller.ts
      risk-reward.service.ts
      entities/risk-reward-score.entity.ts

    finnhub/
      finnhub.module.ts
      finnhub.service.ts
      finnhub.client.ts

    llm/
      llm.module.ts
      llm.service.ts          // orchestrator
      providers/openai.provider.ts
      providers/gemini.provider.ts
      llm.types.ts

    jobs/
      jobs.module.ts
      jobs.service.ts         // cron jobs
```

### 3.2 Responsibility Overview

- **AppModule**: root composition of all feature modules.
- **ConfigModule**: environment configuration, validation.
- **DatabaseModule**: TypeORM connection & repository registration.
- **FinnhubModule**: REST client for Finnhub endpoints.
- **LlmModule**: OpenAI/Gemini clients + orchestrator; model tier resolution.
- **SymbolsModule**: symbol CRUD & Finnhub profile ingestion.
- **MarketDataModule**: OHLCV + fundamentals ingest and queries.
- **ResearchModule**: creation and retrieval of AI research notes.
- **RiskRewardModule**: risk–reward score calculation and API access.
- **JobsModule**: scheduled tasks (Finnhub sync, risk–reward scanner).
- **HealthModule**: `/health` endpoint (DB & external checks).

---

## 4. Configuration & Environment

Use `@nestjs/config` with a `configuration.ts` that maps env vars into typed config objects.

### 4.1 Environment Variables

**Core**

- `APP_ENV` – `local` | `dev` | `prod`
- `APP_PORT` – default `3000`

**Database**

- `DATABASE_URL` – full Postgres URL (Timescale enabled)  
  Example: `postgres://user:pass@host:5432/stockdb?sslmode=require`

**Finnhub**

- `FINNHUB_API_KEY`
- `FINNHUB_BASE_URL` – default `https://finnhub.io/api/v1`

**OpenAI**

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL` (optional; default official)
- Tiered models (example mapping; can be per‑environment):
  - `OPENAI_MODEL_LOW`    – e.g. `gpt-4.1-nano`
  - `OPENAI_MODEL_MEDIUM` – e.g. `gpt-4.1-mini`
  - `OPENAI_MODEL_HIGH`   – e.g. `gpt-5-mini`

**Gemini**

- `GEMINI_API_KEY`
- Tiered models:
  - `GEMINI_MODEL_LOW`    – e.g. `gemini-2.5-flash-lite`
  - `GEMINI_MODEL_MEDIUM` – e.g. `gemini-2.5-flash`
  - `GEMINI_MODEL_HIGH`   – e.g. `gemini-3-pro`

**Risk–Reward Job**

- `RRSCORE_ENABLED` – `true`/`false` (default: `true`)
- `RRSCORE_CRON_EXPRESSION` – cron string, e.g. `"0 * * * *"` (every hour)
- `RRSCORE_MAX_AGE_HOURS` – e.g. `168` (7 days)
- `RRSCORE_BATCH_SIZE` – e.g. `50`
- `RRSCORE_PROVIDER` – `openai` | `gemini` 

**HTTP & Logging**

- `HTTP_READ_TIMEOUT_SEC`, `HTTP_WRITE_TIMEOUT_SEC`
- `LOG_LEVEL` – `debug` | `info` | `warn` | `error`

### 4.2 Config Validation

- Use either `Joi` or `class-validator` with a `validate(config)` function to:
  - Enforce required env vars for given `APP_ENV`.
  - Enforce numeric ranges (e.g. `0 < RRSCORE_BATCH_SIZE <= 500`).

---

## 5. Database & Data Model (PostgreSQL + Timescale)

Use **TypeORM** entities that map directly to the following SQL tables. Migrations should create exactly these structures.

### 5.1 `symbols` Table

```sql
CREATE TABLE symbols (
  id                     BIGSERIAL PRIMARY KEY,

  -- Core identification
  symbol                 TEXT NOT NULL UNIQUE,
  name                   TEXT NOT NULL,

  -- Listings & market info
  exchange               TEXT NOT NULL,
  currency               TEXT NOT NULL,
  country                TEXT NOT NULL,
  ipo_date               DATE,

  -- Size & capital structure
  market_capitalization  NUMERIC(24,4),
  share_outstanding      NUMERIC(24,8),

  -- Contact & links
  phone                  TEXT,
  web_url                TEXT,
  logo_url               TEXT,

  -- Classification
  finnhub_industry       TEXT,
  sector                 TEXT,
  industry               TEXT,

  -- Raw source payload
  finnhub_raw            JSONB,

  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 5.2 `price_ohlcv` Hypertable (Timescale)

```sql
CREATE TABLE price_ohlcv (
  symbol_id   BIGINT NOT NULL REFERENCES symbols(id),
  ts          TIMESTAMPTZ NOT NULL,
  timeframe   TEXT NOT NULL,            -- '1m', '5m', '1d', etc.
  open        NUMERIC(18,6) NOT NULL,
  high        NUMERIC(18,6) NOT NULL,
  low         NUMERIC(18,6) NOT NULL,
  close       NUMERIC(18,6) NOT NULL,
  volume      NUMERIC(20,4),
  source      TEXT NOT NULL,            -- 'finnhub'
  inserted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(symbol_id, timeframe, ts)
);
-- Convert to hypertable on 'ts' partitioned by symbol_id using TimescaleDB.
```

Configure Timescale policies:

- Hypertable on `ts`.
- Compression after N days for high‑frequency data.
- Retention (e.g. 1–2 years for intraday, longer for daily).

### 5.3 `fundamentals` Table

```sql
CREATE TABLE fundamentals (
  symbol_id        BIGINT PRIMARY KEY REFERENCES symbols(id),
  market_cap       NUMERIC(24,4),
  pe_ttm           NUMERIC(18,4),
  eps_ttm          NUMERIC(18,4),
  dividend_yield   NUMERIC(10,4),
  beta             NUMERIC(10,4),
  debt_to_equity   NUMERIC(10,4),
  updated_at       TIMESTAMPTZ NOT NULL
);
```

### 5.4 `research_notes` Table

```sql
CREATE TYPE llm_provider AS ENUM ('openai', 'gemini', 'ensemble');

CREATE TABLE research_notes (
  id              BIGSERIAL PRIMARY KEY,
  request_id      UUID NOT NULL,
  tickers         TEXT[] NOT NULL,
  question        TEXT NOT NULL,
  provider        llm_provider NOT NULL,
  models_used     TEXT[] NOT NULL,
  answer_markdown TEXT NOT NULL,
  numeric_context JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 5.5 `risk_reward_scores` Table

```sql
CREATE TYPE risk_confidence_level AS ENUM ('low', 'medium', 'high');

CREATE TABLE risk_reward_scores (
  id                  BIGSERIAL PRIMARY KEY,
  symbol_id           BIGINT NOT NULL REFERENCES symbols(id),
  as_of               TIMESTAMPTZ NOT NULL,
  risk_reward_score   INTEGER NOT NULL CHECK (risk_reward_score >= 0 AND risk_reward_score <= 100),
  risk_score          INTEGER CHECK (risk_score >= 0 AND risk_score <= 100),
  reward_score        INTEGER CHECK (reward_score >= 0 AND reward_score <= 100),
  confidence_level    risk_confidence_level NOT NULL DEFAULT 'medium',
  provider            TEXT NOT NULL,
  models_used         TEXT[] NOT NULL,
  research_note_id    BIGINT,
  rationale_markdown  TEXT NOT NULL,
  numeric_context     JSONB NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rrscores_symbol_asof ON risk_reward_scores(symbol_id, as_of DESC);
CREATE INDEX idx_rrscores_asof ON risk_reward_scores(as_of DESC);
```

Entity mappings:

- Create corresponding TypeORM entities in each feature module.
- Use `@UpdateDateColumn()` for `updated_at` fields where applicable.

---

## 6. External Integrations

### 6.1 FinnhubModule & FinnhubService

**FinnhubModule**

- Imports: `HttpModule` with base URL & timeout from config.
- Provides: `FinnhubService`.

**FinnhubService Responsibilities**

- Methods (examples):
  - `getQuote(symbol: string)`
  - `getCandles(symbol: string, resolution: string, from: Date, to: Date)`
  - `getCompanyProfile(symbol: string)`
  - `getMetrics(symbol: string)`
- Implementation details:
  - Use `HttpService` (Axios) with `X-Finnhub-Token` header.
  - Map responses into internal DTOs (no raw Finnhub types outside integration layer).
  - Handle HTTP 429/5xx with retry/backoff.
  - Optionally expose rate limit info via custom headers / metrics.

### 6.2 LlmModule & LlmService

**LlmModule**

- Provides:
  - `OpenAiProvider` – wrapper around official `openai` SDK.
  - `GeminiProvider` – wrapper around `@google/genai`.
  - `LlmService` – orchestrator implementing a unified interface.

**Unified interface**

```ts
export type QualityTier = 'low' | 'medium' | 'high';

export interface ResearchPrompt {
  question: string;
  tickers: string[];
  numericContext: unknown; // structured data (later encoded as JSON or TOON)
  style?: string;
  maxTokens?: number;
  quality?: QualityTier;   // 'low' | 'medium' | 'high'
  provider?: 'openai' | 'gemini' | 'ensemble';
}

export interface ResearchResult {
  provider: 'openai' | 'gemini' | 'ensemble';
  models: string[];
  answerMarkdown: string;
  citations?: string[];
  tokensIn?: number;
  tokensOut?: number;
}
```

**OpenAI Provider**

- Use the official `openai` SDK with Node:

  - Initialize `OpenAI` client with `OPENAI_API_KEY`.
  - Use the **Responses** or **Chat** API for analysis.
  - Model selection based on `quality` → `OPENAI_MODEL_LOW/MEDIUM/HIGH`.

- System message guidelines:
  - LLM must rely **only** on provided numeric context for numbers.
  - If data is missing or insufficient, state that explicitly.

**Gemini Provider**

- Use `@google/genai`:

  - Initialize `GoogleGenerativeAI` with `GEMINI_API_KEY`.
  - Get model by ID based on `quality` tier.
  - Use `generateContent` or streaming variant.

- Constraints:
  - Same semantics as OpenAI provider.
  - Use same `ResearchPrompt` structure.

**LlmService (Orchestrator)**

- Delegates based on `provider`:
  - `openai`: call OpenAiProvider only.
  - `gemini`: call GeminiProvider only.
  - `ensemble`: call both and:
    - Either return both answers side‑by‑side.
    - Or create a short meta-summary via a second LLM call (future).

---

## 7. Domain Services

### 7.1 SymbolsService

Responsibilities:

- Resolve `symbol` to `symbol_id`.
- On cache miss:
  - Call `FinnhubService.getCompanyProfile`.
  - Upsert `symbols` row (and initial `fundamentals`).
- Provide methods:
  - `ensureSymbol(symbol: string): Promise<SymbolEntity>`
  - `getSymbol(symbol: string)` for controllers and other services.

### 7.2 MarketDataService

Responsibilities:

- `getSnapshot(symbol: string)`:
  - Ensure symbol exists.
  - Fetch latest OHLCV candle from `price_ohlcv`.
  - Join with `fundamentals`.
  - Optionally fall back to Finnhub if DB data is stale.
- `getHistory(symbol: string, interval: string, from: Date, to: Date)`:
  - Query Timescale for OHLCV rows.
- `ingestDailyCandles()`:
  - For each active symbol, fetch last day’s candles and insert into `price_ohlcv`.
- `ingestFundamentals()`:
  - Refresh `fundamentals` for tracked symbols from Finnhub metrics.

### 7.3 ResearchService

Responsibilities:

- `createResearchQuestion(tickers: string[], question: string, provider: 'openai' | 'gemini' | 'ensemble', quality: QualityTier)`:
  - Ensure symbols exist.
  - Gather data:
    - Recent OHLCV (e.g. 6–12 months daily).
    - Fundamentals & derived metrics (returns, volatility, basic valuations).
  - Build **numeric context object** (plain JS object).
  - Call `LlmService.generateResearch(prompt)`.
  - Persist to `research_notes`:
    - Request ID.
    - Tick‑ers, question, provider, modelsUsed.
    - `answer_markdown`, `numeric_context`.
  - Return `ResearchResult` + `research_note.id`.

- `getResearchNote(id: number)`:
  - DB fetch from `research_notes`.

Rules:

- All numeric calculations are done in services (TypeScript), **not** by the LLM.
- LLM may only **describe** or explain metrics.

### 7.4 RiskRewardService

Responsibilities:

- `getSymbolsNeedingUpdate(maxAgeHours: number, limit: number)`:
  - Query symbols and their latest `risk_reward_scores`.
  - Select those with no score or stale scores (`as_of` older than `maxAge`).
- `evaluateSymbol(symbol: string, provider: 'openai' | 'gemini' | 'ensemble', quality: QualityTier)`:
  - Gather:
    - Price history (returns, drawdown, volatility).
    - Key fundamentals (market cap, P/E, leverage, profitability).
  - Build numeric context object.
  - Build a **structured output prompt** demanding JSON:

    ```jsonc
    {
      "risk_reward_score": 0,
      "risk_score": 0,
      "reward_score": 0,
      "confidence": "low | medium | high",
      "summary": "2-4 sentence summary",
      "key_drivers": ["Driver 1", "Driver 2"]
    }
    ```

  - Call `LlmService` and parse JSON.
  - Validate values (all scores 0–100; confidence in allowed set).
  - Persist to `risk_reward_scores`.
- `getLatestScore(symbol: string)`:
  - Fetch latest score per symbol.
- `getScoreHistory(symbol: string)`:
  - Fetch time‑series of scores.

---

## 8. HTTP API Design

All endpoints are under `/api/v1`. Responses use a standard envelope:

```json
{
  "status": "ok",
  "data": { ... },
  "error": null,
  "meta": {
    "requestId": "uuid",
    "durationMs": 12
  }
}
```

Errors:

```json
{
  "status": "error",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "symbol is required",
    "details": {}
  }
}
```

### 8.1 Health

- `GET /api/v1/health`
  - Returns:
    - DB connection status.
    - Optional: Finnhub/OpenAI/Gemini connectivity checks.

### 8.2 Symbol & Market Data

- `GET /api/v1/symbols/:symbol/snapshot`
  - Query params:
    - `includeFundamentals` (boolean, default `true`)
    - `includeAiSummary` (boolean, default `false`)
  - Returns:
    - Symbol metadata.
    - Latest OHLCV snapshot.
    - Fundamentals.
    - Optional latest AI summary (short text or snippet from last research note).

- `GET /api/v1/symbols/:symbol/history`
  - Query params:
    - `interval`: `1m` | `5m` | `1h` | `1d`
    - `from`, `to`: ISO8601 or unix timestamps.
  - Returns:
    - Array of OHLCV rows.

### 8.3 Research

- `POST /api/v1/research/ask`
  - Body:

    ```json
    {
      "tickers": ["LLY", "NVO"],
      "question": "Compare long-term growth and risk profile.",
      "provider": "ensemble",
      "quality": "high",
      "style": "professional",
      "maxTokens": 1200
    }
    ```

  - Behavior:
    - Validates input via DTO + class‑validator.
    - Calls `ResearchService.createResearchQuestion`.
    - Returns:

      ```json
      {
        "status": "ok",
        "data": {
          "researchId": 123,
          "provider": "ensemble",
          "models": ["gpt-5-mini", "gemini-3-pro"],
          "answerMarkdown": "## Overview ...",
          "numericContext": { /* optional echo */ }
        }
      }
      ```

- `GET /api/v1/research/:id`
  - Returns full stored research note.

### 8.4 Risk–Reward API

- `GET /api/v1/symbols/:symbol/risk-reward`
  - Query params:
    - `history` (boolean, default `false`)
  - Returns:

    ```json
    {
      "status": "ok",
      "data": {
        "latest": {
          "score": 72,
          "riskScore": 40,
          "rewardScore": 80,
          "confidence": "medium",
          "asOf": "2025-12-05T10:15:00Z",
          "summary": "Attractive upside driven by ...",
          "keyDrivers": ["Driver A", "Driver B"]
        },
        "history": [
          { "asOf": "...", "score": 65 }
        ]
      }
    }
    ```

No public write APIs for risk–reward scores; they are created exclusively via scheduled jobs or internal triggers.

---

## 9. Scheduled Jobs (Cron)

Use `@nestjs/schedule`:

- Import `ScheduleModule.forRoot()` in `AppModule`.
- Define jobs in `JobsModule`’s service.

### 9.1 JobsService

Example cron jobs:

- `@Cron('0 2 * * *')` – `syncDailyCandles()`:
  - For each active symbol, fetch previous day candles from Finnhub.
  - Insert into `price_ohlcv`.

- `@Cron('30 2 * * 1')` – `syncFundamentals()`:
  - Weekly refresh of fundamentals via Finnhub metrics.

- `@Cron(process.env.RRSCORE_CRON_EXPRESSION || '0 * * * *')` – `runRiskRewardScanner()`:
  - Uses `RiskRewardService.getSymbolsNeedingUpdate(...)`.
  - Evaluates symbols in batches with limited concurrency.
  - Logs processed symbols, success/fail counts, and duration.

Concurrency considerations:

- Use small worker pools for risk–reward evaluation (e.g. 3–5 concurrent LLM calls).
- For heavy loads or many symbols, optionally offload evaluation tasks to a BullMQ queue.

---

## 10. Model Tiering (low / medium / high)

Implement a simple mapping in config:

```ts
export interface ModelTierConfig {
  openai: {
    low: string;    // e.g. 'gpt-4.1-nano'
    medium: string; // e.g. 'gpt-4.1-mini'
    high: string;   // e.g. 'gpt-5-mini'
  };
  gemini: {
    low: string;    // e.g. 'gemini-2.5-flash-lite'
    medium: string; // e.g. 'gemini-2.5-flash'
    high: string;   // e.g. 'gemini-3-pro'
  };
}
```

- `LlmService` reads this config and resolves `quality` (`low` | `medium` | `high`) to a concrete `model` string per provider.
- Optionally support a per‑call **effort knob**:
  - OpenAI: `reasoning_effort` for GPT‑5 models.
  - Gemini: `thinking` related options for 2.5/3.x models.
- For typical tasks:
  - Use `low` for bulk jobs and cron‑driven scanning.
  - Use `medium` for interactive TUI requests.
  - Use `high` only for deep research on demand.

---

## 11. Observability & Error Handling

### 11.1 Logging

- Use Nest’s built‑in logger or a custom `LoggerService`.
- Log:
  - Request ID, duration, and path (via interceptor).
  - External API calls (Finnhub/LLM) with endpoint and latency.
- Avoid logging sensitive data (API keys, full prompts).

### 11.2 Metrics (optional)

- Expose Prometheus‑style metrics endpoint (future).
- Track:
  - `finnhub_requests_total{endpoint,status}`
  - `llm_requests_total{provider,model,status}`
  - `http_request_duration_seconds{path,method,status}`

### 11.3 Error Handling

- Use global exception filter to map exceptions to uniform JSON error envelope.
- Wrap external call errors with contextual information (symbol, provider, endpoint).
- Degrade gracefully:
  - If Finnhub is down, serve last known DB data where possible.
  - If LLMs are unavailable, return structured errors but keep service healthy.

---

## 12. Security & Hardening

- All secrets via env vars; never commit keys.
- If exposed beyond localhost:
  - Add API key or JWT authentication middleware.
  - Enforce HTTPS (TLS termination at gateway or reverse proxy).
- Input validation on all controllers using class‑validator DTOs.
- Consider basic per‑client rate limiting at API gateway level.

---

## 13. Testing & Developer Experience

### 13.1 Testing

- **Unit tests**:
  - Domain services (SymbolsService, MarketDataService, ResearchService, RiskRewardService).
  - LLM providers with mocked SDKs.
- **Integration/E2E**:
  - Nest e2e tests with in‑container Postgres/Timescale (or local instance).
  - Use test config and migrations.
- No live Finnhub or LLM calls in automated tests; use fixtures/mocks.

### 13.2 Developer Experience

- NPM scripts:
  - `"start:dev"` – Nest dev mode.
  - `"test"` – unit tests.
  - `"test:e2e"` – e2e tests.
  - `"lint"` – ESLint.
  - `"migration:generate"` / `"migration:run"`.
- Provide `docs/README.md` describing:
  - How to set env vars.
  - How to run DB locally with docker‑compose.
  - How to seed sample symbols and test queries.

---

## 14. Out of Scope (Initial Version)

Not required for the MVP but keep in mind for future evolution:

- User accounts, personalized watchlists, and preferences.
- Portfolio tracking and P&L analytics.
- Strategy backtesting and trade simulation.
- Websocket/live streaming quotes.
- Advanced agentic workflows (multi‑step reasoning with tools).

---

This specification should be treated as the authoritative blueprint for the NestJS backend implementation of the AI‑assisted stock research tool. 
