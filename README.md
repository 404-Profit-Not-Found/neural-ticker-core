<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

# Neural-Ticket Core

[![Build Status](https://github.com/branislavlang/neural-ticket-core/actions/workflows/ci.yml/badge.svg)](https://github.com/branislavlang/neural-ticket-core/actions)
[![Coverage](https://img.shields.io/badge/coverage-80.9%25-brightgreen)](https://github.com/branislavlang/neural-ticket-core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![NestJS](https://img.shields.io/badge/nestjs-%5E10.0.0-red)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/typescript-%5E5.0.0-blue)](https://www.typescriptlang.org/)

**Neural-Ticket Core** is the authoritative backend for the AI-assisted stock research tool. It orchestrates data ingestion from financial APIs (Finnhub), generates qualitative research notes via LLMs (OpenAI, Gemini), and calculates quantitative Risk/Reward scores.

## 📚 System Architecture

The system is built as a modular NestJS application:

- **SymbolsModule**: Manages the universe of tracked assets (Tickers, Company Profiles).
- **MarketDataModule**: Handles Time-Series (OHLCV) and Fundamental data ingestion (TimescaleDB).
- **ResearchModule**: Orchestrates LLM-based qualitative analysis.
- **RiskRewardModule**: Generates quantitative scores (0-100) based on market data and AI insights.
- **JobsModule**: Schedules background tasks (Daily Sync, Scanners).

## 🗄️ Database Architecture

The data layer utilizes **PostgreSQL** extended with **TimescaleDB** for efficient time-series storage.

```mermaid
classDiagram
    direction TB

    class symbols {
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
        +TIMESTAMPTZ updated_at
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
        +TEXT[] tickers
        +TEXT question
        +ENUM provider
        +TEXT[] models_used
        +TEXT answer_markdown
    }

    class risk_reward_scores {
        +BIGINT id
        +BIGINT symbol_id
        +TIMESTAMPTZ as_of
        +INTEGER risk_reward_score
        +INTEGER risk_score
        +INTEGER reward_score
        +ENUM confidence_level
        +TEXT provider
        +bigint research_note_id
    }

    symbols "1" -- "*" price_ohlcv : has history
    symbols "1" -- "1" fundamentals : has current stats
    symbols "1" -- "*" risk_reward_scores : has scores
    research_notes "1" -- "*" risk_reward_scores : generated during
```

## 🧠 AI Model Configuration

Multi-provider support (OpenAI, Gemini) with quality tiers configurable via `models.yml` or environment variables.

| Tier | OpenAI | Gemini |
| :--- | :--- | :--- |
| **Low** | `gpt-4.1-nano` | `gemini-2.5-flash-lite` |
| **Medium** | `gpt-4.1-mini` | `gemini-2.5-flash` |
| **High** | `gpt-5-mini` | `gemini-3-pro` |
| **Deep** | `gpt-5.1` | - |

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
   DATABASE_URL=postgres://user:pass@localhost:5432/neural_db
   FINNHUB_API_KEY=your_key
   OPENAI_API_KEY=your_key
   ```

### Running the App

Start the database services:
```bash
$ docker-compose up -d
```

Run the server:
```bash
# Data ingestion & API
$ npm run start:dev
```

## 🧪 Testing

The project maintains **>80% Code Coverage** for critical services.

```bash
# Unit Tests
$ npm run test

# Setup E2E Sandbox
$ npm run test:e2e

# View Coverage Report
$ npm run test:cov
```

## 📦 Deployment

Powered by **Google Cloud Run** and **GitHub Actions**.

- **Push to Main**: Triggers Build & Test.
- **Release**: TBD

## 📄 License

This project is [MIT licensed](LICENSE).
