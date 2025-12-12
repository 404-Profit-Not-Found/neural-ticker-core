


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
        +TEXT finnhub_industry
        +TEXT sector
        +JSONB finnhub_raw
        +TIMESTAMPTZ updated_at
    }

    class users {
        +UUID id
        +TEXT email
        +TEXT google_id
        +TEXT full_name
        +ENUM role
        +JSONB preferences
        +TEXT avatar_url
        +TIMESTAMPTZ last_login
    }

    class auth_logs {
        +UUID id
        +UUID user_id
        +TEXT provider
        +TIMESTAMPTZ login_at
        +TEXT ip_address
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
        +TIMESTAMPTZ created_at
        +NUMERIC overall_score
        +NUMERIC financial_risk
        +NUMERIC execution_risk
        +NUMERIC competitive_risk
        +NUMERIC regulatory_risk
        +NUMERIC upside_percent
        +NUMERIC price_target_weighted
        +JSONB red_flags
        +TEXT research_note_id
        +NUMERIC analyst_target_avg
        +TEXT sentiment
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

    tickers "1" -- "*" price_ohlcv : has history
    tickers "1" -- "1" fundamentals : has current stats
    tickers "1" -- "*" risk_analyses : has risk profile
    risk_analyses "1" -- "*" risk_scenarios : has scenarios
    tickers "1" -- "*" stocktwits_posts : mentions
    tickers "1" -- "*" stocktwits_watchers : tracked in
    research_notes "1" -- "*" risk_analyses : generates
    users "1" -- "*" auth_logs : logs login
    users "1" -- "*" research_notes : requests
    users "1" -- "*" watchlists : owns
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

Multi-provider support (OpenAI, Gemini) with quality tiers configurable via `models.yml` or environment variables.

| Tier | OpenAI | Gemini | Notes |
| :--- | :--- | :--- | :--- |
| **Low** | `gpt-4.1-nano` | `gemini-3-flash-preview` | Cost-efficient for simple tasks |
| **Medium** | `gpt-4.1-mini` | `gemini-3-flash-preview` | **Default: Gemini 3 with Google Search** |
| **High** | `gpt-5-mini` | `gemini-3-flash-preview` | Enhanced reasoning capabilities |
| **Deep** | `gpt-5.1`| `gemini-3-pro-preview` | Maximum depth with extended thinking |

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

