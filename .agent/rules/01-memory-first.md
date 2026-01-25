---
trigger: always_on
priority: CRITICAL
---

# Memory First Protocol

**Goal**: Eliminate "amnesia" by forcing the agent to consult persistent memory before acting.

## 1. Before Starting ANY Task
**You MUST call `memory_search`** with queries relevant to the user request.
- Check for existing architectural patterns.
- Check for prior decisions (e.g., "auth implementation", "branding guidelines").
- Check for known issues or constraints.
*Do not proceed to Planning/Execution without this context.*

## 2. After Making Decisions
**You MUST call `memory_write`** to record:
- Architectural decisions (e.g., "Selected Redis for caching").
- New patterns established.
- User preferences discovered.

## 3. Dealing with "I don't know"
If you are unsure about a project convention, **CHECK MEMORY FIRST**. Do not guess.

> **Rule:** If you didn't check memory, you are working blind.
