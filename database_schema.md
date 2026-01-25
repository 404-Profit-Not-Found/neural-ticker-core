# Database Schema Analysis

This document outlines the complete database structure for the Neural-Ticker application, incorporating all 26 TypeORM entities found in the codebase.

## Overview

The database extends the core domains with detailed financial data, risk analysis components, and administrative tracking.

### Domains
1.  **Users & Auth**: Users, Auth Logs, Allowed Users, Credit Transactions, Notifications.
2.  **Market Data**: Tickers, Logos, Price History (OHLCV), Fundamentals, Company News, Analyst Ratings.
3.  **Portfolio**: Portfolio Positions, Portfolio Analysis.
4.  **Research & Risk**: Research Notes (LLM), Risk Analysis (Scenarios, Factors, Catalysts), Risk/Reward Scores.
5.  **Social**: Comments, StockTwits Posts, StockTwits Watchers (Trackers).
6.  **Admin/Jobs**: Ticker Requests, Request Queue.
7.  **Lists**: Watchlists, Watchlist Items.

## Mermaid Class Diagram

```mermaid
classDiagram
    %% --- User & Auth Domain ---
    class User {
        +UUID id
        +String email
        +String role
        +String tier
        +JSONB preferences
        +credits_balance
        +has_onboarded
    }

    class AuthLog {
        +UUID id
        +String userId
        +String provider
        +Timestamp loginAt
        +String ipAddress
    }

    class AllowedUser {
        +UUID id
        +String email
        +String added_by
    }

    class CreditTransaction {
        +Int id
        +UUID user_id
        +Int amount
        +String reason
        +JSONB metadata
    }

    class Notification {
        +UUID id
        +UUID user_id
        +String type
        +Boolean read
        +JSONB data
    }

    %% --- Market Data Domain ---
    class Ticker {
        +BigInt id
        +String symbol
        +String name
        +String sector
        +String industry
        +news_summary
        +news_sentiment
    }

    class TickerLogo {
        +BigInt symbol_id
        +Bytea image_data
        +String mime_type
    }

    class PriceOhlcv {
        +BigInt symbol_id
        +Timestamp ts
        +String timeframe
        +Decimal open
        +Decimal high
        +Decimal low
        +Decimal close
        +Decimal volume
    }

    class Fundamentals {
        +BigInt symbol_id
        +Decimal market_cap
        +Decimal pe_ttm
        +Decimal eps_ttm
        +Decimal revenue_ttm
        +Decimal gross_margin
        +Decimal debt_to_equity
        +Decimal free_cash_flow_ttm
        +JSONB yahoo_metadata
    }

    class CompanyNews {
        +BigInt id
        +BigInt symbol_id
        +Timestamp datetime
        +String headline
        +String source
        +String url
        +String summary
    }

    class AnalystRating {
        +UUID id
        +BigInt symbol_id
        +String firm
        +String analyst_name
        +String rating
        +Decimal price_target
    }

    %% --- Portfolio Domain ---
    class PortfolioPosition {
        +UUID id
        +UUID user_id
        +String symbol
        +Decimal shares
        +Decimal buy_price
        +Date buy_date
    }

    class PortfolioAnalysis {
        +UUID id
        +UUID userId
        +String model
        +Text prompt
        +Text response
    }

    %% --- Watchlist Domain ---
    class Watchlist {
        +BigInt id
        +String name
        +UUID user_id
    }

    class WatchlistItem {
        +BigInt id
        +BigInt watchlist_id
        +BigInt ticker_id
    }

    %% --- Research & Risk Domain ---
    class ResearchNote {
        +BigInt id
        +UUID request_id
        +String[] tickers
        +LlmProvider provider
        +String full_response
        +ResearchStatus status
    }

    class RiskAnalysis {
        +BigInt id
        +BigInt ticker_id
        +String model_version
        +Decimal overall_score
        +Decimal financial_risk
        +JSONB red_flags
    }
    
    class RiskRewardScore {
        +BigInt id
        +BigInt symbol_id
        +Timestamp as_of
        +Integer risk_reward_score
        +Text rationale_markdown
    }

    class RiskScenario {
        +BigInt id
        +BigInt analysis_id
        +ScenarioType scenario_type
        +Decimal probability
        +Decimal price_target
    }

    class RiskQualitativeFactor {
        +BigInt id
        +BigInt analysis_id
        +FactorType factor_type
        +Text description
    }

    class RiskCatalyst {
        +BigInt id
        +BigInt analysis_id
        +Timeframe timeframe
        +Text description
    }

    %% --- Social Domain ---
    class Comment {
        +BigInt id
        +String ticker_symbol
        +Text content
        +UUID user_id
    }

    class StockTwitsPost {
        +BigInt id
        +String symbol
        +String username
        +Text body
        +Int likes_count
    }

    class StockTwitsWatcher {
        +UUID id
        +String symbol
        +Int count
        +Timestamp timestamp
    }

    %% --- Admin/Jobs Domain ---
    class TickerRequest {
        +UUID id
        +String symbol
        +String status
        +UUID user_id
    }

    class RequestQueue {
        +UUID id
        +RequestType type
        +JSONB payload
        +RequestStatus status
        +Int attempts
        +Timestamp next_attempt
    }

    %% --- Relationships ---
    
    %% User Relations
    User "1" -- "0..*" Notification : receives
    User "1" -- "0..*" AuthLog : logs
    User "1" -- "0..*" CreditTransaction : performs
    User "1" -- "0..*" Watchlist : owns
    User "1" -- "0..*" PortfolioPosition : holds
    User "1" -- "0..*" PortfolioAnalysis : requests
    User "1" -- "0..*" ResearchNote : requests
    User "1" -- "0..*" Comment : writes
    User "1" -- "0..*" TickerRequest : requests

    %% Watchlist Relations
    Watchlist "1" -- "0..*" WatchlistItem : contains
    WatchlistItem "0..*" -- "1" Ticker : references

    %% Ticker/Market Data Relations
    Ticker "1" -- "0..1" TickerLogo : has
    Ticker "1" -- "0..1" Fundamentals : has
    Ticker "1" -- "0..*" PriceOhlcv : has_history
    Ticker "1" -- "0..*" CompanyNews : mentions
    Ticker "1" -- "0..*" AnalystRating : rated_by
    Ticker "1" -- "0..*" RiskAnalysis : analyzed_by
    Ticker "1" -- "0..*" RiskRewardScore : scored_by

    %% Risk Analysis Internals
    RiskAnalysis "1" -- "0..*" RiskScenario : contains
    RiskAnalysis "1" -- "0..*" RiskQualitativeFactor : contains
    RiskAnalysis "1" -- "0..*" RiskCatalyst : contains

    %% Cross-Domain Links
    PortfolioPosition "0..*" -- "1" Ticker : implied_link_by_symbol
    Comment "0..*" -- "1" Ticker : implied_link_by_symbol
    StockTwitsPost "0..*" -- "1" Ticker : implied_link_by_symbol
```

## Entity Details

### Market Data Deep Dive
-   **Fundamentals**: Stores key financial ratios and data points (`pe_ttm`, `market_cap`, `revenue_ttm`, etc.) separate from the main Ticker table to keep the Ticker table lightweight for listings.
-   **CompanyNews**: Stores news items linked to a ticker, sourced from external providers (e.g., Finnhub).
-   **AnalystRating**: Tracks historical buy/sell ratings and price targets from major firms.

### Risk Analysis Granularity
-   The Risk module is highly structured. [RiskAnalysis](file:///c:/Users/brani/Documents/GitHub/neural-ticker-core/src/modules/risk-reward/entities/risk-analysis.entity.ts#17-198) allows for versioned models.
-   It breaks down into sub-tables ([RiskScenario](file:///c:/Users/brani/Documents/GitHub/neural-ticker-core/src/modules/risk-reward/entities/risk-scenario.entity.ts#17-64), [RiskQualitativeFactor](file:///c:/Users/brani/Documents/GitHub/neural-ticker-core/src/modules/risk-reward/entities/risk-qualitative-factor.entity.ts#18-41), [RiskCatalyst](file:///c:/Users/brani/Documents/GitHub/neural-ticker-core/src/modules/risk-reward/entities/risk-catalyst.entity.ts#16-39)) to enable detailed frontend displays of "Bear/Bull Cases", "SWOT Analysis", and "Upcoming Catalysts".

### Social & Community
-   **Comment**: Internal user comments on tickers.
-   **StockTwitsPost** & **StockTwitsWatcher**: Mirrors external social sentiment data for analysis.

### Admin & Operations
-   **AllowedUser**: For controlling access (e.g., private beta/waitlist).
-   **RequestQueue**: A generic table for handling background jobs, primarily used for `ADD_TICKER` requests that require long-running data ingestion.
