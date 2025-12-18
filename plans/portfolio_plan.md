# User Story: AI-Powered Portfolio Tracker

## Title
As a user, I want to track my stock positions and receive AI-driven risk analysis so that I can optimize my portfolio performance and manage risk effectively.

## Description
The goal is to create a "My Portfolio" dashboard where users can manually input their stock holdings (symbol, shares, buy price, date) and view real-time performance metrics. Beyond simple tracking, the core value proposition is an "AI Analyst" that evaluates the portfolio's composition against the user's risk appetite, offering actionable advice on what to trim, hold, or add.

## Acceptance Criteria

### 1. Portfolio Management (Crud)
- [ ] **Add Position**: User can add a stock position with:
    - Type-ahead Ticker Search.
    - Number of Shares.
    - Buy Price (Cost Basis).
    - Buy Date.
- [ ] **Edit/Delete**: User can modify share counts/price or remove a position entirely.
- [ ] **View**: User sees a table with:
    - Symbol, Shares, Avg Cost.
    - Current Price, Current Value.
    - Total Return ($ and %).

### 2. Portfolio Summary
- [ ] **Header Stats**: Dashboard displays "Total Portfolio Value" and "Total Gain/Loss" derived from live market data.
- [ ] **Real-time Data**: Current prices are fetched from the backend (MarketDataService) when the page loads.

### 3. AI Risk Analysis
- [ ] **Risk Profile Selector**: User can select a risk profile (e.g., "Conservative", "Balanced", "Aggressive").
- [ ] **Generate Insight**: Clicking "Analyze Portfolio" sends the portfolio composition to the AI.
- [ ] **AI Output**: The AI returns a structured text analysis covering:
    - **Upside/Downside Risks**: Potential volatility based on current holdings.
    - **Rebalancing Suggestions**: Specific recommendations to "Trim" overexposed positions or "Add" for diversification.
    - **Sector Exposure**: Analysis of industry concentration.

## Technical Implementation

### Backend
- **New Entity**: `PortfolioPosition` (user_id, symbol, shares, buy_price, buy_date).
- **API Endpoints**:
    - `GET /api/v1/portfolio`: List positions + summary stats.
    - `POST /api/v1/portfolio/positions`: Create.
    - `PATCH/DELETE .../positions/:id`: Update/Remove.
    - `POST /api/v1/portfolio/analyze`: Trigger LLM analysis.

### Frontend
- **Page**: `/portfolio` (New route).
- **Components**:
    - `PortfolioSummaryCards`: Total Value, Daily Change.
    - `PortfolioTable`: Carbon-styled data table.
    - `AddPositionModal`: Form with validation.
    - `PortfolioAiWidget`: Panel for displaying the generated analysis.

## Market Data & AI Integration
- **Price Data**: Reuse `MarketDataService.getQuote` or bulk fetch to value the portfolio.
- **LLM Prompt**: Construct a prompt including the user's positions, their current performance, and the selected risk profile to generate personalized advice.

---

## Future Enhancements / Ideas

1.  **Multi-Portfolio Support**: Allow users to create separate "buckets" (e.g., "Retirement", "Play Money") with different risk profiles.
2.  **Transaction History**: instead of just "Average Cost", track individual buy/sell events to calculate realized vs. unrealized gains accurately (Tax Lots).
3.  **CSV Import/Export**: Allow bulk upload of positions from broker exports.
4.  **Dividend Tracking**: Automatically estimate annual dividend income based on holdings.
5.  **Performance Charting**: Track the "Total Portfolio Value" over time and plot it against a benchmark (e.g., S&P 500).
6.  **Email Reports**: Weekly digest of portfolio performance and new AI insights delivered to the user's inbox.
