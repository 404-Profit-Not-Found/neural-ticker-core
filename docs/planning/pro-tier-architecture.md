# Architecture Plan: Pro Tier & Credit System

## 1. Goal Description
Implement a tiered access system ("Free" vs "Pro") and a credit-based usage economy to monetize and control LLM resource usage. Admins can grant "Pro" status. Research actions consume credits based on model tier. Users can earn credits by contributing manual research.

## 2. Core Concepts

### User Tiers
*   **Free**: Default for new signups. Access to `Low` and `Medium` models. Monthly allowance: 10 credits.
*   **Pro**: Granted by Admin. Access to `Low`, `Medium`, and `Deep` (Pro) models. Monthly allowance: 50 credits.
*   **Admin**: Inherits all "Pro" privileges implicitly.

### Credit Economy
*   **Expenditure**:
    *   `Low` / `Medium` Model Research: **-1 Credit**
    *   `Deep` (Pro) Model Research: **-5 Credits**
*   **Earnings**:
    *   Manual Research Upload: **+1 to +5 Credits** (Algorithmic quality assessment).
    *   Monthly Reset: Credits reset to tier cap (10 or 50) on the 1st of the month (or billing cycle).

## 3. Database Schema Changes

We need to update the `users` table and potentially add a `credit_ledger` for auditability.

```sql
ALTER TABLE "users" 
ADD COLUMN "tier" TEXT DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'admin')),
ADD COLUMN "credits_balance" INTEGER DEFAULT 10,
ADD COLUMN "credits_reset_at" TIMESTAMP WITH TIME ZONE;

-- Optional: For tracking history of earnings/spendings
CREATE TABLE "credit_transactions" (
  "id" BIGSERIAL PRIMARY KEY,
  "user_id" UUID REFERENCES "users"("id"),
  "amount" INTEGER NOT NULL, -- negative for spend, positive for earn
  "reason" TEXT NOT NULL, -- 'research_spend', 'manual_contribution', 'monthly_reset'
  "metadata" JSONB, -- store 'research_note_id', 'quality_score' etc.
  "created_at" TIMESTAMPTZ DEFAULT NOW()
);
```

## 4. Module Updates

### 4.1. UsersModule & Auth
*   **Entity Update**: Add `tier` and `credits_balance`.
*   **Admin Controller**: Add endpoint `POST /api/v1/admin/users/:id/tier` to promote/demote users. (Guard: Admin only).
*   **Cron Job**: `CreditResetJob` runs monthly to reset balances based on tier.

### 4.2. ResearchModule (The Spender)
*   **Guard/Interceptor**: Implement a `CreditGuard` that checks balance before allowing a research request.
*   **Service Logic**: 
    1.  Determine cost based on requested model (`deep` = 5, others = 1).
    2.  Check `user.tier` vs requested model (Free users strictly blocked from `deep`).
    3.  Check `user.credits_balance >= cost`.
    4.  Deduct credits atomically (Use transaction).
    5.  Proceed with LLM call.

### 4.3. Universal Quality Scoring (The Judge)
*   **Concept**: Every research note (whether AI-generated or manually uploaded) is "Graded" by a fast, cheap model.
*   **Mechanism**:
    1.  **Trigger**: After any research note is saved to DB.
    2.  **Judge Model**: `gemini-2.5-flash-lite` (Flash-Light).
    3.  **Rubric**:
        *   Checks for *Critical Sections* (Risk/Reward, TTM Metrics).
        *   Checks for *Hallucinations* (Basic fact-checking against current price/context).
        *   Checks for *Depth* (Token count & unique insight density).
    4.  **Output**: Assigns a **Rarity Tier** (Gray to Gold) to the [ResearchNote](file:///c:/Users/brani/Documents/GitHub/neural-ticker-core/src/modules/research/research.service.ts#414-418) entity.

### 4.4. ContributionModule (The Earner)
*   **Endpoint**: `POST /api/v1/research/contribute`
    *   Accepts manual research note.
    *   Triggers the **Universal Quality Scoring** above.
    *   **Reward**: If the assigned Rarity is White(1) or higher, credit the user's balance accordingly.
    
### 4.5. Manual Upload UI
*   **Prompt Copy Feature**:
    *   Display a read-only text box with the official "Research Prompt".
    *   "Copy to Clipboard" button so users can paste it into ChatGPT/Claude.
    *   *Benchmark*: Users can see if their external LLM can beat our Pro model's "Gold" rating.

## 5. API Contract

### User Profile
`GET /api/v1/users/me` response adds:
```json
{
  "id": "...",
  "tier": "pro",
  "credits": {
    "balance": 45,
    "limit": 50,
    "reset_date": "2026-01-01T00:00:00Z"
  }
}
```

### Admin Management
`POST /api/v1/admin/grant-pro`
```json
{ "userId": "uuid-...", "action": "grant" } // or "revoke"
```

## 6. Implementation Steps

1.  **Database Migration**: Add columns to `users` and create `credit_transactions`.
2.  **Backend Logic**:
    *   Update `User` entity.
    *   Implement `CreditService` (handle deductions/additions/resets).
    *   Update [ResearchService](file:///c:/Users/brani/Documents/GitHub/neural-ticker-core/src/modules/research/research.service.ts#28-832) to consume credits.
    *   Create `AdminController` for tier management.
3.  **Frontend Updates**:
    *   Show "Pro" badge.
    *   Display Credit Balance in header/profile.
    *   Model Selector: Disable "Deep" option for Free users with "Upgrade to Pro" tooltip.
    *   Show "Cost: X Credits" on the research button.

## 7. Security & Anti-Abuse
*   **Race Conditions**: Credit deduction must be DB atomic (`UPDATE users SET credits_balance = credits_balance - 5 WHERE id = ? AND credits_balance >= 5`).
*   **Spamming Uploads**: Rate limit `contribute` endpoint (e.g., 1 per hour) to prevent script-farming credits.

