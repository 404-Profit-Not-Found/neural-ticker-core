# Neural-Ticker MCP Server — User Guide

Neural-Ticker exposes its platform as a **Model Context Protocol (MCP)** server, so
LLM clients (Claude Desktop, Claude Code, Cursor, the MCP Inspector, etc.) can call
the platform's capabilities as **tools** — market data, risk scoring, AI research,
and your portfolio / watchlists / price alerts.

The server runs **in-process** inside the Neural-Ticker API (no separate process to
start) and is reachable at a single endpoint.

---

## 1. Endpoint & transport

| | |
|---|---|
| **Method** | `POST` |
| **Path** | `/api/mcp` |
| **Local dev** | `http://localhost:<port>/api/mcp` — `<port>` is whatever your app logs at startup (commonly `3000` or `8080`) |
| **Deployed (production)** | `https://neuralticker.com/api/mcp` |
| **Protocol** | JSON-RPC 2.0 over **Streamable HTTP** |
| **Mode** | **Stateless** (no session affinity — works behind Cloud Run / load balancers) |

**Required headers on every call:**

```
Content-Type: application/json
Accept: application/json, text/event-stream
```

> The `Accept` header **must** include `text/event-stream` — it is part of the MCP
> Streamable HTTP spec. In stateless JSON mode you still get a normal JSON body back.

---

## 2. Authentication (soft-auth / bearer passthrough)

The endpoint uses **soft authentication** — it never rejects the connection:

- **Anonymous** calls work for all **public** tools (market data, risk, currency).
- **User-scoped** tools (research, portfolio, watchlists, alerts) require a valid
  **app JWT** sent as a Bearer token:

  ```
  Authorization: Bearer <YOUR_APP_JWT>
  ```

- If you call a user-scoped tool **without** a valid token, the tool returns a normal
  tool result with `isError: true` and the message
  *"Authentication required: call this tool with an `Authorization: Bearer <token>`
  header…"* — the connection itself is **not** dropped.

### Getting a token

Use the **same JWT the web app uses**. After logging in to Neural-Ticker:

- It is returned as `access_token` by the login endpoint, **and**
- stored in the `authentication` cookie.

Grab it from your browser: **DevTools → Application → Cookies → `authentication`**
(or copy the `access_token` from the login network response). The token encodes your
user id (`sub`) and is validated on every call (a revoked account loses access
immediately, even with an unexpired token).

> Treat the token like a password. Prefer passing it via an environment variable in
> client configs rather than hard-coding it.

### Access levels

The endpoint enforces **two** levels — there is **no** per-role (admin vs user) tool split:

| Caller | Tools | Data scope |
|---|---|---|
| Anonymous | 11 public (market, risk, currency) | — |
| Authenticated (`user` **or** `admin`) | + 15 user-scoped | **your own data only** — every call is scoped to your user id; you can never read or modify another user's portfolio, watchlist, alerts or research |

Admins and regular users share the **same tool set**, and `tools/list` returns the
same catalog for everyone. An `admin` differs in only two ways: they are **exempt
from research credit charges**, and they may read **any** user's ticket via
`get_research`. There are no admin-only tools.

---

## 3. Connecting a client

### Claude Code (native HTTP transport)

```bash
# Anonymous (public tools only)
claude mcp add --transport http neural-ticker https://neuralticker.com/api/mcp

# Authenticated (adds your user-scoped tools)
claude mcp add --transport http neural-ticker https://neuralticker.com/api/mcp \
  --header "Authorization: Bearer <YOUR_APP_JWT>"
```

### Claude Desktop (via the `mcp-remote` bridge)

Claude Desktop speaks stdio, so bridge it to the HTTP endpoint with `mcp-remote`.
Edit `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "neural-ticker": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote",
        "https://neuralticker.com/api/mcp",
        "--header", "Authorization: Bearer ${NT_JWT}"
      ],
      "env": { "NT_JWT": "<YOUR_APP_JWT>" }
    }
  }
}
```

For anonymous access, drop the `--header` arg and the `env` block.

### Cursor

In `~/.cursor/mcp.json` (or the project `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "neural-ticker": {
      "url": "https://neuralticker.com/api/mcp",
      "headers": { "Authorization": "Bearer <YOUR_APP_JWT>" }
    }
  }
}
```

### MCP Inspector (for poking around)

```bash
npx @modelcontextprotocol/inspector
```

Then: **Transport** → *Streamable HTTP* → **URL** `http://localhost:<port>/api/mcp`
→ (optional) add an `Authorization: Bearer …` header → **Connect** → **List Tools**.

### Raw curl

```bash
# List all tools (anonymous)
curl -sN http://localhost:8080/api/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# Call a public tool
curl -sN http://localhost:8080/api/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call",
       "params":{"name":"get_ticker_snapshot","arguments":{"symbol":"AAPL"}}}'

# Call a user-scoped tool (with token)
curl -sN http://localhost:8080/api/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Authorization: Bearer <YOUR_APP_JWT>' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call",
       "params":{"name":"get_portfolio","arguments":{}}}'
```

---

## 4. Tool catalog (26 tools)

`🔓` = anonymous (no token) · `🔐` = requires `Authorization: Bearer`
Symbols are **auto-uppercased** (`aapl` → `AAPL`).

### Market data — 🔓 public

| Tool | Arguments | Description |
|---|---|---|
| `get_ticker_snapshot` | `symbol` | Full snapshot: price, day change, profile, fundamentals, metrics. |
| `get_ticker_snapshots` | `symbols[]` (max 100) | Snapshots for many symbols at once. |
| `get_ticker_history` | `symbol`, `interval` (`1m\|5m\|15m\|1h\|1d\|1wk\|1mo`, default `1d`), `from`, `to` (YYYY-MM-DD) | Historical OHLCV candles. Intraday intervals limited to recent ranges. |
| `get_quote` | `symbol` | Lightweight real-time quote (current price + day OHLC). |
| `search_tickers` | `query?`, `includeExternal?` (default `false`) | Search by symbol or company name. |
| `get_company_news` | `symbol`, `from?`, `to?` | Recent company-specific news headlines. |
| `get_general_news` | — | Market-wide financial news. |
| `get_market_status` | — | Open/closed status of major exchanges. |

### Risk / reward — 🔓 public

| Tool | Arguments | Description |
|---|---|---|
| `get_risk_score` | `symbol` | Latest risk/reward analysis (overall score, scenarios, catalysts). |
| `get_risk_score_history` | `symbol` | Up to 10 past analyses, newest first. |

### Currency — 🔓 public

| Tool | Arguments | Description |
|---|---|---|
| `convert_currency` | `amount`, `from` (3-letter), `to` (3-letter) | Convert using the latest FX rate. Returns `rate` + `converted`. |

### Research (AI) — 🔐 auth

| Tool | Arguments | Description |
|---|---|---|
| `create_research` | `tickers[]` (1–10), `question`, `provider?` (`gemini\|openai\|ensemble`, default `gemini`), `quality?` (`low\|medium\|high\|deep`, default `deep`) | Starts an **async** AI research ticket. **Costs credits** (admins exempt). Returns `{ ticket_id, status }` immediately — poll `get_research`. |
| `get_research` | `ticket_id` | Fetch a ticket; returns `answer_markdown` when completed. Owner/admin only. |
| `list_research` | `status?` (`all\|pending\|processing\|completed\|failed`), `page?`, `limit?` (max 50), `ticker?` | List your tickets (or the community feed when `ticker` is set). |
| `get_news_summary` | `symbol` | AI-generated summary of recent news for a symbol. |

### Portfolio / watchlists / alerts — 🔐 auth

| Tool | Arguments | Description |
|---|---|---|
| `get_portfolio` | `displayCurrency?` (`USD\|EUR\|GBP\|CHF\|JPY\|CAD\|AUD`) | Your positions with current values. |
| `add_portfolio_position` | `symbol`, `shares` (≥0.01), `buy_price` (≥0.01), `buy_date` (YYYY-MM-DD), `currency?` | Add a position. |
| `remove_portfolio_position` | `id` | Remove a position by id. |
| `analyze_portfolio` | `riskAppetite`, `horizon?` (default `medium-term`), `goal?` (default `growth`), `model?` (default `gemini`) | AI analysis of your portfolio (markdown). **Costs credits** (deducted by the service). |
| `get_portfolio_recommendation` | — | Quick, lightweight recommendation. |
| `get_watchlists` | — | Your watchlists, each with its ticker items. |
| `create_watchlist` | `name` | Create a watchlist (idempotent on name). |
| `add_to_watchlist` | `watchlistId`, `symbol` | Add a ticker to a watchlist. |
| `get_price_alerts` | — | Your price alerts. |
| `create_price_alert` | `symbol`, `alert_type` (`price_above\|price_below\|percent_change_up\|percent_change_down`), `target_value` (≥0), `cooldown_minutes?` (int ≥1) | Create a price alert. |
| `delete_price_alert` | `id` | Delete a price alert by id. |

---

## 5. Output format

Every tool returns a standard MCP result:

```json
{
  "result": {
    "content": [{ "type": "text", "text": "<payload>" }],
    "isError": false
  }
}
```

- `text` is a **JSON string** for data tools (parse it), or **markdown** for
  `analyze_portfolio`.
- On a handled error (auth, bad input, not found, rate unavailable, insufficient
  credits), `isError` is `true` and `text` holds the message.

**Example — `convert_currency` `{amount:100, from:"USD", to:"EUR"}`:**

```json
{ "amount": 100, "from": "USD", "to": "EUR", "rate": 0.8719, "converted": 87.19 }
```

**Example — `create_research`:**

```json
{ "ticket_id": "513", "status": "pending" }
```

Then poll:

```json
{"jsonrpc":"2.0","id":9,"method":"tools/call",
 "params":{"name":"get_research","arguments":{"ticket_id":"513"}}}
```

---

## 6. Credits, limits & gotchas

- **Credits:** `create_research` charges credits up-front (admins exempt; it fails
  closed — no charge, no ticket). `analyze_portfolio` is charged by the service when
  it runs. All other tools are free.
- **Rate limit:** the API applies a global limit of **300 requests / minute / IP**;
  it also covers `/api/mcp`. A chatty client can exhaust it.
- **Async research:** `create_research` returns immediately with a `ticket_id`;
  the answer is produced in the background. Don't block — poll `get_research`.
- **Batch over loops:** prefer `get_ticker_snapshots` (≤100) to many single
  `get_ticker_snapshot` calls.
- **Live data:** market-data tools hit live providers (Finnhub / Yahoo), so latency
  and provider rate limits apply.

---

## 7. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `isError: Authentication required …` | The tool is user-scoped — add `Authorization: Bearer <token>`. |
| Bad/garbage token still rejected | Soft-auth validates the token; an invalid one is treated as anonymous. Re-grab a fresh token. |
| `Unknown tool: …` (JSON-RPC `-32601`) | Tool name typo — check `tools/list`. |
| Empty / 406 / parse errors | Ensure `Accept: application/json, text/event-stream` is set. |
| `Exchange rate unavailable …` | The requested currency pair isn't supported. |
| `No risk analysis available for X` | No computed risk score exists yet for that symbol. |
| Connection refused locally | Use the port the app prints at startup (e.g. `:3000` or `:8080`). |

---

## 8. Quick reference

```jsonc
// JSON-RPC envelope for any tool call
{
  "jsonrpc": "2.0",
  "id": 1,                         // any unique id
  "method": "tools/call",
  "params": {
    "name": "get_ticker_snapshot", // a tool from the catalog above
    "arguments": { "symbol": "AAPL" }
  }
}
```

- List tools: `method: "tools/list"`, `params: {}`
- Public tools work with no headers beyond the two required ones.
- Add `Authorization: Bearer <token>` to unlock the 🔐 tools.
