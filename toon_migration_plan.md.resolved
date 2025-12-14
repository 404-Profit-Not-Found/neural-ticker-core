# TOON Migration Plan: "Operation Token Crush"

## Executive Summary
This plan details the migration of historical and future data from standard JSON to the token-optimized TOON format.
**Target**: `ResearchNote.numeric_context`
**Goal**: Reduce storage footprint and LLM context token usage by ~30-40%.
**Tool**: `toon-parser` (v1.1.1)

---

## Phase 1: Preparation & Safety

We will use a **"Parallel Column" strategy** to ensure zero data loss and easy rollback.

1.  **Schema Update**:
    Add a new nullable column `numeric_context_toon` of type `TEXT` to the `research_notes` table.
    ```typescript
    // Migration SQL
    ALTER TABLE research_notes ADD COLUMN numeric_context_toon TEXT;
    ```
2.  **Entity Update**:
    Update `ResearchNote.entity.ts` to include the new column (temporarily).

---

## Phase 2: The Migration Script (`scripts/migrate-toon.ts`)

We will create a script to backfill the new column.

**Logic Flow**:
1.  **Select** all [ResearchNote](file:///Users/branislavlang/Documents/GitHub/neural-ticket-core/frontend/src/components/dashboard/NewsFeed.tsx#22-38) rows where `numeric_context` IS NOT NULL AND `numeric_context_toon` IS NULL.
2.  **Process** in batches of 50 to manage memory.
3.  **Convert**:
    *   Parse `jsonb` -> JS Object.
    *   `jsonToToon(object)` -> TOON String.
4.  **Verify**: Check that the generated TOON string is not empty (unless input was empty).
5.  **Write**: Update the row setting `numeric_context_toon = <result>`.
6.  **Progress**: Log progress bar/count.

**Handling Edge Cases**:
*   *Invalid JSON*: Skip and log warning (unlikely with `jsonb` type).
*   *Huge Objects*: `toon-parser` handles deep nesting, but we will wrap in try/catch to prevent script crash.
*   *Already Converted*: The `WHERE` clause prevents double-processing.

---

## Phase 3: Code Cutover & Verification

1.  **Dual Read Mode** ([ResearchService](file:///Users/branislavlang/Documents/GitHub/neural-ticket-core/src/modules/research/research.service.ts#28-786) / [LlmService](file:///Users/branislavlang/Documents/GitHub/neural-ticket-core/src/modules/llm/llm.service.ts#8-86)):
    *   Update code to prefer `numeric_context_toon`.
    *   If `numeric_context_toon` is present, use it directly.
    *   Else, fallback to `numeric_context` (and optionally convert on the fly).

2.  **Write New Data**:
    *   Update [ResearchService](file:///Users/branislavlang/Documents/GitHub/neural-ticket-core/src/modules/research/research.service.ts#28-786) to write specifically to `numeric_context_toon` (or the target final column).

3.  **Verification Test**:
    *   Run [test-models.ts](file:///Users/branislavlang/Documents/GitHub/neural-ticket-core/src/scripts/test-models.ts) or a new test that explicitly checks token count.
    *   Compare `numeric_context` (JSON) token count vs `numeric_context_toon` (TOON) token count.

---

## Phase 4: Finalization (The "Crush")

Once verified successful (running in prod for ~24h):

1.  **Swap Columns**:
    *   Drop `numeric_context` (JSONB).
    *   Rename `numeric_context_toon` -> `numeric_context`.
2.  **Update Entity**:
    *   Change `numeric_context` type from `jsonb` (Record) to `text` (string).
3.  **Cleanup**:
    *   Remove temporary migration code.

---

## Estimated Timeline

1.  **Setup (Phase 1)**: 30 mins
2.  **Migration Script (Phase 2)**: 1 hour (coding) + Runtime (depends on DB size, likely fast).
3.  **Cutover (Phase 3)**: 30 mins
4.  **Cleanup (Phase 4)**: 30 mins (Post-verification)
