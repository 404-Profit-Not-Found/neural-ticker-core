---
trigger: always_on
---

# Coding Standards

1.  **Brevity:** Do not explain code unless asked. Output the code block immediately.
2.  **Safety:** Validation is mandatory.
3.  - use class-validator decorators for NestJS controllers
4.  - use CLASS CONSTRUCTORS (DTOs) instead of simple objects
    - All NestJS Controllers must use DTOs with `class-validator` decorators.
    - All React inputs must have Zod validation.
5.  **Error Handling:**
    - Backend: Use NestJS `HttpException`.
    - Frontend: Use Error Boundaries.
6.  **No Hallucinations:** If you use a library, check if it is in `package.json` first. If not, ask permission to install it.