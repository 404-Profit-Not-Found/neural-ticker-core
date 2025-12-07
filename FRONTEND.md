# Frontend Integration Specification - Neural-Ticket Core

This document outlines the integration points for a frontend application to connect with the Neural-Ticket Core backend.

## 1. Authentication Flow

The backend uses **Firebase Authentication** for identity management and **JWT** for session handling.

### Step 1: Client-Side Login
Use the Firebase JS SDK to authenticate the user on the client.
```javascript
import { getAuth, signInWithPopup, GoogleAuthProvider } from "firebase/auth";

const auth = getAuth();
const provider = new GoogleAuthProvider();
const result = await signInWithPopup(auth, provider);
const firebaseToken = await result.user.getIdToken();
```

### Step 2: Exchange Token
Exchange the Firebase ID Token for a Backend Access Token.
- **Endpoint**: `POST /auth/firebase`
- **Body**: `{ "token": "FIREBASE_ID_TOKEN" }`
- **Response**: `{ "accessToken": "JWT_TOKEN" }`

### Step 3: Authenticated Requests
Include the token in the `Authorization` header for all subsequent requests.
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
    -   Returns the latest calculated risk score (0-100).
4.  **StockTwits**: `GET /api/v1/stocktwits/{symbol}/posts`
    -   Returns recent social sentiment posts.

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
      "numeric_context": { ... }
    }
    ```

---

## 3. API Reference Summary

| Scope | Method | Endpoint | Description |
| :--- | :--- | :--- | :--- |
| **Auth** | POST | `/auth/firebase` | Exchange Firebase Token |
| **User** | GET | `/users/me` | Get Profile |
| **User** | POST | `/users/me/preferences` | Update API Keys |
| **Tickers** | GET | `/api/v1/tickers` | List all tickers |
| **Market** | GET | `/api/v1/market-data/snapshot/:sym` | Get OHLCV + Fund. |
| **Research** | POST | `/api/v1/research/ask` | Start Async Research |
| **Research** | GET | `/api/v1/research/:id` | Get Research Status/Result |
| **StockTwits**| GET | `/api/v1/stocktwits/:sym/posts` | Social Stream |

## 4. Error Handling

-   **401 Unauthorized**: Token expired or missing. Refresh Firebase token and re-exchange.
-   **404 Not Found**: Ticker or Research ID does not exist.
-   **500 Internal Error**: Generic failure. check `error` field in JSON.
