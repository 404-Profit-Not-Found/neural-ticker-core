


# neural-ticker Core
[![Deploy to Cloud Run](https://github.com/404-Profit-Not-Found/neural-ticker-core/actions/workflows/deploy.yml/badge.svg)](https://github.com/404-Profit-Not-Found/neural-ticker-core/actions/workflows/deploy.yml)
[![Build Status](https://github.com/404-Profit-Not-Found/neural-ticker-core/actions/workflows/ci.yml/badge.svg)](https://github.com/404-Profit-Not-Found/neural-ticker-core/actions)
[![Coverage](https://img.shields.io/badge/coverage-80.9%25-brightgreen)](https://github.com/branislavlang/neural-ticker-core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![NestJS](https://img.shields.io/badge/nestjs-%5E10.0.0-red)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/typescript-%5E5.0.0-blue)](https://www.typescriptlang.org/)

**neural-ticker Core** is the authoritative backend for the AI-assisted stock research tool. It orchestrates data ingestion from financial APIs (Finnhub), generates qualitative research notes via LLMs (OpenAI, Gemini), and calculates quantitative Risk/Reward scores.

## 📚 System Architecture

The system is built as a modular NestJS application:

- **TickersModule**: Manages the universe of tracked assets (Tickers, Company Profiles).
- **MarketDataModule**: Handles Time-Series (OHLCV) and Fundamental data ingestion (PostgreSQL/Neon).
- **ResearchModule**: Orchestrates LLM-based qualitative analysis.
- **RiskRewardModule**: Generates quantitative scores (0-100) based on market data and AI insights.
- **JobsModule**: Schedules background tasks (Daily Sync, Scanners).
- **AuthModule**: Handles Google OAuth, Firebase Token Exchange, and JWT issuance.

## 🗄️ Database Architecture

The data layer utilizes **PostgreSQL** (Neon Serverless).



```mermaid
classDiagram
    direction TB
    class tickers {
        +BIGINT id
        +TEXT symbol
        +TEXT name
        +TEXT exchange
        +TEXT currency
        +TEXT country
        +DATE ipo_date
        +NUMERIC market_capitalization
        +NUMERIC share_outstanding
        +TEXT phone
        +TEXT web_url
        +TEXT logo_url
        +TEXT finnhub_industry
        +TEXT sector
        +TEXT industry
        +JSONB finnhub_raw
        +TIMESTAMPTZ created_at
        +TIMESTAMPTZ updated_at
    }

    class ticker_logos {
        +BIGINT symbol_id
        +BYTEA image_data
        +TEXT mime_type
    }

    class users {
        +UUID id
        +TEXT email
        +TEXT google_id
        +TEXT full_name
        +ENUM role
        +TEXT avatar_url
        +TEXT nickname
        +TEXT view_mode
        +TEXT theme
        +JSONB preferences
        +TIMESTAMPTZ last_login
        +TIMESTAMPTZ created_at
        +TIMESTAMPTZ updated_at
    }

    class allowed_users {
        +UUID id
        +TEXT email
        +TIMESTAMPTZ created_at
    }

    class auth_logs {
        +UUID id
        +UUID user_id
        +TEXT provider
        +TEXT ip_address
        +TIMESTAMPTZ login_at
    }

    class price_ohlcv {
        +BIGINT symbol_id
        +TIMESTAMPTZ ts
        +TEXT timeframe
        +NUMERIC open
        +NUMERIC high
        +NUMERIC low
        +NUMERIC close
        +NUMERIC volume
        +TEXT source
    }

    class fundamentals {
        +BIGINT symbol_id
        +NUMERIC market_cap
        +NUMERIC pe_ttm
        +NUMERIC eps_ttm
        +NUMERIC beta
        +TIMESTAMPTZ updated_at
    }

    class research_notes {
        +BIGINT id
        +UUID request_id
        +UUID user_id
        +TEXT[] tickers
        +TEXT question
        +TEXT title
        +ENUM provider
        +ENUM status
        +TEXT quality
        +TEXT[] models_used
        +TEXT answer_markdown
        +TEXT full_response
        +JSONB numeric_context
        +JSONB grounding_metadata
        +TEXT thinking_process
        +INTEGER tokens_in
        +INTEGER tokens_out
        +TEXT error
        +TIMESTAMPTZ created_at
        +TIMESTAMPTZ updated_at
    }

    class risk_analyses {
        +BIGINT id
        +BIGINT ticker_id
        +TEXT model_version
        +NUMERIC overall_score
        +NUMERIC financial_risk
        +NUMERIC execution_risk
        +NUMERIC dilution_risk
        +NUMERIC competitive_risk
        +NUMERIC regulatory_risk
        +INTEGER time_horizon_years
        +NUMERIC price_target_weighted
        +NUMERIC upside_percent
        +NUMERIC analyst_target_avg
        +NUMERIC analyst_target_range_low
        +NUMERIC analyst_target_range_high
        +TEXT sentiment
        +JSONB fundamentals
        +JSONB red_flags
        +JSONB metadata
        +TEXT research_note_id
        +TIMESTAMPTZ created_at
    }

    class risk_scenarios {
        +BIGINT id
        +BIGINT analysis_id
        +ENUM scenario_type
        +NUMERIC probability
        +NUMERIC price_mid
        +TEXT description
        +TEXT[] key_drivers
    }

    class risk_qualitative_factors {
        +BIGINT id
        +BIGINT analysis_id
        +ENUM factor_type
        +TEXT description
    }

    class risk_catalysts {
        +BIGINT id
        +BIGINT analysis_id
        +ENUM timeframe
        +TEXT description
    }

    class comments {
        +BIGINT id
        +TEXT ticker_symbol
        +UUID user_id
        +TEXT content
        +TIMESTAMPTZ created_at
        +TIMESTAMPTZ updated_at
    }

    class stocktwits_posts {
        +BIGINT id
        +TEXT symbol
        +TEXT username
        +TEXT body
        +INTEGER likes_count
        +INTEGER user_followers_count
        +TIMESTAMPTZ created_at
    }

    class stocktwits_watchers {
        +UUID id
        +TEXT symbol
        +INTEGER count
        +TIMESTAMPTZ timestamp
    }

    class watchlists {
        +BIGINT id
        +UUID user_id
        +TEXT name
        +TIMESTAMPTZ created_at
    }

    class watchlist_items {
        +BIGINT id
        +BIGINT watchlist_id
        +BIGINT ticker_id
        +TIMESTAMPTZ added_at
    }

    tickers "1" -- "1" ticker_logos : has logo
    tickers "1" -- "*" price_ohlcv : has history
    tickers "1" -- "1" fundamentals : has current stats
    tickers "1" -- "*" risk_analyses : has risk profile
    tickers "1" -- "*" stocktwits_posts : mentions
    tickers "1" -- "*" stocktwits_watchers : tracked in
    tickers "1" -- "*" comments : discussed in
    risk_analyses "1" -- "*" risk_scenarios : has scenarios
    risk_analyses "1" -- "*" risk_qualitative_factors : has SWOT factors
    risk_analyses "1" -- "*" risk_catalysts : has catalysts
    research_notes "1" -- "*" risk_analyses : generates
    users "1" -- "*" auth_logs : logs login
    users "1" -- "*" research_notes : requests
    users "1" -- "*" watchlists : owns
    users "1" -- "*" comments : writes
    watchlists "1" -- "*" watchlist_items : contains
    watchlist_items "*" -- "1" tickers : references
```

## 🔐 Authentication & API

The API is secured via JWT. Common flow:

1.  **Login via Google/Firebase**: Obtain a Firebase ID Token.
2.  **Exchange Token**: `POST /auth/firebase` with `{ token: "..." }` to get an App Access Token.
3.  **Use Token**: Add `Authorization: Bearer <access_token>` to requests.

Key Endpoints:
- `GET /api/v1/tickers`: List watched tickers.
- `GET /api/v1/tickers/{symbol}/snapshot`: Get latest price/fundamentals (Lazy loads from Finnhub if missing).
- `POST /api/v1/research/ask`: Submit a research query (Async, returns Ticket ID).
- `GET /api/v1/research`: List my research tickets.
- `GET /api/v1/research/{id}`: Poll for research results.
- `POST /api/v1/users/me/preferences`: Securely store API keys (e.g. Gemini).

**Swagger UI**:
Detailed API documentation enabled in development at `/api` (or `/swagger`).

## 🧠 AI Model Configuration

Multi-provider support (OpenAI, Gemini) with quality tiers. Configuration via `src/config/configuration.ts`.

> [!IMPORTANT]
> As of December 2025, only **Gemini 3** and **Gemini 2.5** series are supported. Legacy 1.5/2.0 models are deprecated.

| Tier | OpenAI | Gemini | Use Case |
| :--- | :--- | :--- | :--- |
| **Low** | `gpt-4.1-nano` | `gemini-1.5-flash` | Quick sentiment, simple extraction (Free Tier) |
| **Medium** | `gpt-4.1-mini` | `gemini-2.5-flash` | **Default**: News summaries, alerts |
| **Deep** | `gpt-5.1`| `gemini-2.0-flash-exp` | 10-K analysis, thesis generation |

### 📊 Gemini Model Benchmarks (Dec 2025)

Empirical testing (3 iterations) on financial research tasks ("Deep Dive AAPL Analysis") yielded the following performance metrics:

| Model | Success Rate | Avg Time | Output Detail (Chars) | Verdict |
| :--- | :--- | :--- | :--- | :--- |
| **gemini-2.5-flash-lite** | 100% | **8.7s** | **9,016** | **🏆 Best Value** (Fast & Detailed) |
| **gemini-2.0-flash-exp** | 100% | 18.0s | **9,195** | **Deepest Analysis** |
| **gemini-2.0-flash** | 100% | 17.3s | 7,987 | Robust Alternative |
| **gemini-2.5-flash** | 100% | 11.2s | 631 | Too Terse |
| **gemini-2.5-pro** | 100% | 17.6s | 176 | Failed / Empty |
| **gemini-1.5-*** | 0% | - | - | Deprecated / 404 |

**Recommendation**: Use **`gemini-2.5-flash-lite`** for rapid extraction and standard reports, and **`gemini-2.0-flash-exp`** for deep-dive tasks requiring maximum context.

### Deep Research Agent

For autonomous multi-minute investigations, use the **Deep Research Agent** (`deep-research-pro-preview-12-2025`):

```typescript
// Interactions API (not generateContent)
await client.interactions.create({
  agent: 'deep-research-pro-preview-12-2025',
  input: 'Deep dive into NVDA focusing on regulatory risks.',
  background: true,
  stream: true,
});
```

## 🔬 Risk Analysis Data Extraction

The `RiskRewardService` automatically extracts structured risk analysis data from unstructured research notes using a resilient two-phase approach.

### Extraction Pipeline

```
Research Note (Markdown)
         │
         ▼
┌─────────────────────────────────────┐
│    LLM Extraction (TOON Format)     │
│    - Primary: toonToJson parser     │
│    - Fallback 1: JSON.parse         │
│    - Fallback 2: Manual repair      │
└─────────────────────────────────────┘
         │ (up to 3 retries)
         ▼
┌─────────────────────────────────────┐
│     salvageFromRaw (Regex)          │  ◄── Last Resort Fallback
│     Extracts data even from         │
│     malformed LLM output            │
└─────────────────────────────────────┘
         │
         ▼
      RiskAnalysis Entity (Saved to DB)
```

### What Gets Extracted

| Category | Fields | Description |
|----------|--------|-------------|
| **Risk Scores** | `overall_score`, `financial_risk`, `execution_risk`, `dilution_risk`, `competitive_risk`, `regulatory_risk` | 0-10 scale (0=safe, 10=extreme risk) |
| **Price Scenarios** | `bull`, `base`, `bear` | Each with `probability`, `price_target_mid/low/high`, `key_drivers[]` |
| **Qualitative Factors** | `strengths`, `weaknesses`, `opportunities`, `threats` | SWOT-style analysis |
| **Catalysts** | `near_term`, `long_term` | Upcoming events that could move the stock |
| **Red Flags** | `red_flags[]` | Warning signs to monitor |

### salvageFromRaw Fallback

When the LLM produces malformed JSON (common with complex analysis), `salvageFromRaw` uses regex patterns to extract data:

```typescript
// Extracts from TOON/JSON format:
bull: { price_target_mid: 150, key_drivers: ["AI growth"] }

// Also handles text patterns:
Bull Case: $150
strengths: ["Strong pipeline", "Good management"]
```

**Patterns Supported:**
- **Numeric values:** `key: value` or `"key": value`
- **Arrays:** `key: ["item1", "item2"]`
- **Scenario prices:** `Bull Case: $X` or `bull: { price_target_mid: X }`
- **Probabilities:** `probability: 0.25` or `25%`

### Triggering Extraction

Extraction happens automatically when:
1. **New Research Created:** `POST /api/v1/research/ask` → Research completed → Risk analysis generated
2. **Manual Sync:** `POST /api/v1/research/sync/{symbol}` → Reprocesses last 5 notes

To manually reprocess all research for a ticker:
```bash
curl -X POST http://localhost:3000/api/v1/research/sync/AAPL
```

### Console Logging

Extraction results are logged for debugging:
```
[RiskRewardService] [AAPL] === EXTRACTION RESULTS ===
[RiskRewardService] [AAPL] Risk Score: overall=6
[RiskRewardService] [AAPL] Scenarios: bull=$180, base=$150, bear=$120
[RiskRewardService] [AAPL] Qualitative strengths: ["Strong ecosystem","Services growth"]
[RiskRewardService] [AAPL] Catalysts near_term: ["iPhone 16 launch","Q4 earnings"]
[RiskRewardService] [AAPL] Red flags: ["China sales decline"]
[RiskRewardService] [AAPL] === END EXTRACTION ===
```

## 💻 Frontend Integration

For detailed instructions on connecting a frontend (Web/Mobile), please refer to **[FRONTEND.md](FRONTEND.md)**.

### Quick Spec
- **Auth**: Firebase Client SDK -> Exchange for JWT.
- **Research**: Async flow (`POST /ask` -> `GET /:id`).
- **Websockets**: Not currently implemented (use polling).

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v18+)
- **Docker** & **Docker Compose**
- **Finnhub API Key**
- **OpenAI / Gemini API Keys** (Optional for AI features)

### Installation

```bash
$ npm install
```

### Environment Setup

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
2. Configure your keys:
   ```ini
   DATABASE_URL=postgres://user:pass@host:5432/neondb?sslmode=require
   FINNHUB_API_KEY=your_key
   OPENAI_API_KEY=your_key
   FIREBASE_API_KEY=your_web_api_key
   ```

### Running the App

Run the server:
```bash
# Data ingestion & API
$ npm run start:dev
```

## 🧪 Testing & Code Quality

The project maintains **>80% Code Coverage** for critical services.

```bash
# Linting (Run this before commit)
$ npm run lint

# Unit Tests
$ npm run test

# End-to-End Tests
$ npm run test:e2e

# View Coverage Report
$ npm run test:cov
```

## 📦 Deployment

Powered by **Google Cloud Run** and **GitHub Actions**.

- **Push to Main**: Triggers Build, Test, & Lint.
- **Auto-Migration**: Database migrations run automatically on startup via `migrationsRun: true`.
- **Release**: Handled via GitHub Release workflow.

## 📄 License

This project is [MIT licensed](LICENSE).

