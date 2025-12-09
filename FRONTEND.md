# Frontend Integration Specification - neural-ticker Core

This document outlines the integration points for a frontend application to connect with the neural-ticker Core backend.

## 0. Local Development Setup

To run locally against `localhost:3000`:
- **Auth Redirect**: The backend redirects Google Login to `FRONTEND_URL` (default: `http://localhost:4200`) + `/oauth-callback`.
- **Cookies**: An `HttpOnly` cookie named `authentication` is set automatically.
- **Dev Token**: For testing without OAuth, use `POST /auth/dev/token`.

## 1. Authentication Flow

The backend uses **Firebase Authentication** (optional) and **Google OAuth** (primary) with **JWT** session cookies.

### A. Google OAuth (Recommend for Web)
1.  **Redirect User**: Open `http://localhost:3000/auth/google`.
2.  **Callback**: User is redirected to `http://localhost:4200/oauth-callback?token=XYZ`.
3.  **Session**: An `authentication` cookie is also set (HttpOnly).
4.  **Usage**:
    -   Extract `token` from URL for API calls (`Authorization: Bearer <token>`).
    -   OR rely on the cookie for subsequent requests (ensure `withCredentials: true`).

### B. Firebase Auth (Legacy/Mobile)
Use the Firebase JS SDK to authenticate.

### C. Developer Auth (Testing)
Quickly get a token for testing.
- **Endpoint**: `POST /auth/dev/token`
- **Body**: `{ "email": "dev@test.com" }`
- **Response**: `{ "access_token": "..." }`

### Authenticated Requests
Include the token in the header if not using cookies:
- **Header**: `Authorization: Bearer <JWT_TOKEN>`

---

## 2. Core Workflows

### A. Dashboard & Market Data
Display watched tickers and their latest data.

1.  **List Tickers**: `GET /api/v1/tickers`
    -   Returns list of tracked symbols.
2.  **Get Details**: `GET /api/v1/market-data/snapshot/{symbol}`
    -   Returns price, volume, and fundamental data.
3.  **Risk/Reward**: `GET /api/v1/risk-reward/{symbol}`
    -   Returns the latest **RiskAnalysis** (Overall Score, Scenarios, SWOT, Catalysts).
    -   *Note*: This score is strictly derived from "Deep Research". If no deep research has been run, this may be null.
4.  **StockTwits**: `GET /api/v1/stocktwits/{symbol}/posts`
    -   Returns recent social sentiment posts.

### A.2 Watchlists (User Specific)
Allow users to group tickers.

1.  **List Watchlists**: `GET /api/v1/watchlists`
    -   Returns: `[{ id: "1", name: "Tech", items: [...] }]`
2.  **Create Watchlist**: `POST /api/v1/watchlists`
    -   Body: `{ "name": "My List" }`
3.  **Add Ticker**: `POST /api/v1/watchlists/{id}/items`
    -   Body: `{ "symbol": "AAPL" }`
4.  **Remove Ticker**: `DELETE /api/v1/watchlists/{id}/items/{tickerId}`

### B. Deep Research (Async)
The research module is **asynchronous** to support long-running "Deep Thinking" models (Gemini 3 Pro).

#### 1. Configure API Key (Optional)
Allow users to use their own Gemini API Key for higher limits.
-   **Endpoint**: `POST /users/me/preferences`
-   **Body**: `{ "gemini_api_key": "sk-..." }`

#### 2. Submit Question
-   **Endpoint**: `POST /api/v1/research/ask`
-   **Body**:
    ```json
    {
      "tickers": ["AAPL", "MSFT"],
      "question": "Compare AI strategies",
      "provider": "gemini",
      "quality": "deep"
    }
    ```
-   **Response**: `201 Created`
    ```json
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "pending"
    }
    ```

#### 3. Poll for Results
Poll every 3-5 seconds until status is `completed`.
-   **Endpoint**: `GET /api/v1/research/{id}`
-   **Response (Pending)**: `{ "status": "processing" }`
-   **Response (Done)**:
    ```json
    {
      "status": "completed",
      "answer_markdown": "## Analysis\n\nApple's AI strategy...",
      "numeric_context": {
         "AAPL": {
           "price": 150.00,
           "risk_reward": {
             "overall_score": 8.0,
             "financial_risk": 7.5,
             "execution_risk": 5.0,
             "upside": 150.00,
             "reward_target": 185.00,
             "scenarios": [
                { "type": "bull", "target": 220.00 },
                { "type": "base", "target": 185.00 },
                { "type": "bear", "target": 110.00 }
             ]
           }
         }
      }
    }
    ```

---

## 3. API Reference Summary

| Scope | Method | Endpoint | Description |
| :--- | :--- | :--- | :--- |
| **Auth** | GET | `/auth/google` | Google OAuth Login |
| **Auth** | POST | `/auth/dev/token` | Get Dev Token (No OAuth) |
| **Auth** | GET | `/auth/profile` | Get My Profile |
| **Auth** | POST | `/auth/firebase` | Exchange Firebase Token |
| **User** | GET | `/users` | List All Users (Admin) |
| **User** | GET | `/users/logins` | Audit Logs (Admin) |
| **User** | POST | `/users/me/preferences` | Update API Keys |
| **Tickers** | GET | `/api/v1/tickers` | List all tickers |
| **Tickers** | POST | `/api/v1/tickers/:symbol` | Ensure/Create Ticker |
| **Tickers** | GET | `/api/v1/tickers/:symbol` | Get Profile |
| **Market** | GET | `/api/v1/tickers/:sym/snapshot` | Get Price + Fundamentals |
| **Market** | GET | `/api/v1/tickers/:sym/history` | Get Candles `?days=30` |
| **Research** | POST | `/api/v1/research/ask` | Start Async Research |
| **Research** | GET | `/api/v1/research` | List Tickets `?status=` |
| **Research** | GET | `/api/v1/research/:id` | Get Research Details |
| **Risk** | GET | `/api/v1/tickers/:sym/risk-reward` | Get Score `?history=false` |
| **StockTwits**| GET | `/api/v1/stocktwits/:sym/posts` | Social Stream `?page=1` |
| **StockTwits**| GET | `/api/v1/stocktwits/:sym/watchers`| Watcher Count History |
| **StockTwits**| POST | `/api/v1/stocktwits/:sym/sync` | Trigger Manual Sync |
| **Watchlist** | GET | `/api/v1/watchlists` | List My Watchlists |
| **Watchlist** | POST | `/api/v1/watchlists` | Create New List |
| **Watchlist** | POST | `/api/v1/watchlists/:id/items` | Add Ticker to List |
| **Watchlist** | DEL | `/api/v1/watchlists/:id/items/:tid`| Remove Ticker |

## 4. Error Handling

-   **401 Unauthorized**: Token expired or missing. Refresh Firebase token and re-exchange.
-   **404 Not Found**: Ticker or Research ID does not exist.
-   **500 Internal Error**: Generic failure. check `error` field in JSON.

## 5. Data Models (DTOs)

Use these TypeScript interfaces for frontend integration.

### Research
```typescript
export interface ResearchNote {
  id: string; // BigInt -> String
  request_id: string; // UUID
  tickers: string[];
  question: string;
  provider: 'openai' | 'gemini' | 'ensemble';
  quality: 'low' | 'medium' | 'high' | 'deep';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  answer_markdown: string;
  numeric_context: {
    [symbol: string]: {
      price: number;
      risk_reward: {
        overall_score: number;
        scenarios: RiskScenario[]
      };
    };
  };
  created_at: string; // ISO Date
}

export interface AskResearchDto {
  tickers: string[];
  question: string;
  provider?: 'openai' | 'gemini' | 'ensemble'; // default: ensemble
  quality?: 'low' | 'medium' | 'high' | 'deep'; // default: medium
  style?: string; // Optional tone
  maxTokens?: number;
  apiKey?: string; // Optional Gemini API Key
}
```

### Risk & Market
```typescript
export interface RiskAnalysis {
  id: string;
  ticker_id: string;
  overall_score: number;
  financial_risk: number;
  execution_risk: number;
  dilution_risk: number;
  price_target_weighted: number;
  upside_percent: number;
  scenarios: RiskScenario[];
  qualitative_factors: RiskQualitativeFactor[];
  catalysts: RiskCatalyst[];
  fundamentals: {
    cash_on_hand: number;
    runway_years: number;
    revenue_ttm: number;
    gross_margin: number;
    debt: number;
  };
  red_flags: string[];
}

export interface RiskScenario {
  scenario_type: 'bull' | 'bear' | 'base';
  price_target: number;
  probability_percentage: number; // 0-100
  rating: string; // "Buy", "Hold"
  description: string;
  time_horizon_months: number;
}

export interface TickerEntity {
  id: string;
  symbol: string;
  name: string;
  exchange: string;
  market_capitalization?: number;
  sector?: string;
  industry?: string;
  logo_url?: string;
  web_url?: string;
}

export interface MarketSnapshot {
  ticker: TickerEntity;
  latestPrice: {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    ts: string; // ISO
  };
  fundamentals: {
    market_cap: number;
    pe_ratio: number;
    beta: number;
  };
}
```

### Watchlist & Social
```typescript
export interface Watchlist {
  id: string;
  name: string;
  user_id: string;
  items: WatchlistItem[];
}

export interface WatchlistItem {
  id: string;
  ticker: TickerEntity;
  added_at: string;
}

export interface StockTwitsPost {
  id: number;
  symbol: string;
  username: string;
  body: string;
  likes_count: number;
  created_at: string;
}
```
