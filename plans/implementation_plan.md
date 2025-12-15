# AI Company Profile Generation

Generate short company descriptions for stock tickers using `gemini-2.5-flash-lite` + Google Search grounding.

## Proposed Changes

### Backend - Database

#### [MODIFY] [ticker.entity.ts](file:///Users/branislavlang/Documents/GitHub/neural-ticket-core/src/modules/tickers/entities/ticker.entity.ts)
Add a new column to store the AI-generated description:
```typescript
@Column({ type: 'text', nullable: true })
ai_description: string;

@Column({ type: 'timestamptz', nullable: true })
ai_description_updated_at: Date;
```

---

### Backend - Service

#### [MODIFY] [tickers.service.ts](file:///Users/branislavlang/Documents/GitHub/neural-ticket-core/src/modules/tickers/tickers.service.ts)
Add a new method `generateDescription(symbol: string)`:
1. Check if `ai_description` exists and is recent (< 7 days old) → return cached.
2. Call `GeminiProvider.generate()` with:
   - Model: `extraction` tier (`gemini-2.5-flash-lite`)
   - Google Search enabled
   - Prompt: *"Provide a 2-3 sentence description of {COMPANY_NAME} ({SYMBOL}). Focus on: what they do, their industry, and key products/services."*
3. Save result to `ai_description` and update timestamp.
4. Return the description.

---

### Backend - API

#### [MODIFY] [ticker-detail.controller.ts](file:///Users/branislavlang/Documents/GitHub/neural-ticket-core/src/modules/tickers/ticker-detail.controller.ts)
Update `/composite` endpoint response to include:
```typescript
profile: {
  // ... existing fields ...
  description: ticker.ai_description,
}
```

---

### Frontend - Types

#### [MODIFY] [ticker.ts](file:///Users/branislavlang/Documents/GitHub/neural-ticket-core/frontend/src/types/ticker.ts)
Add `description?: string` to the `profile` interface.

---

### Frontend - UI

#### [MODIFY] [TickerDetail.tsx](file:///Users/branislavlang/Documents/GitHub/neural-ticket-core/frontend/src/pages/TickerDetail.tsx)
Display the description below the company name/industry in the header:
```tsx
{profile?.description && (
  <p className="text-xs text-muted-foreground/80 mt-1 line-clamp-2">
    {profile.description}
  </p>
)}
```

---

## Verification Plan

### Automated Tests
1. Unit test for `generateDescription()` in `tickers.service.spec.ts`.
2. Verify `/composite` endpoint returns `description` field.

### Manual Verification
1. Visit a ticker page (e.g., `/ticker/GEVO`).
2. Confirm the AI description appears under the company name.
3. Check DB for `ai_description` column populated.
