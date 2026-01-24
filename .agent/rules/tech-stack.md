---
trigger: always_on
---

# Global Tech Stack Principles
You are working on "Neural Ticker Core". You must strictly adhere to this stack:

1.  **Backend:** NestJS v11 (TypeScript). Use dependency injection for everything.
2.  **Database:** Neon Serverless Postgres. Use **TypeORM** for data access.
3.  **Frontend:** React + Vite + TailwindCSS + Tanstack.
4.  **Infrastructure:** Google Cloud Run (Dockerized).
5.  **Testing:** Jest.

**Constraints:**
- NEVER use `any` type.
- NEVER suggest AWS services (S3, Lambda); use GCP equivalents (Cloud Storage, Cloud Run).
- Always use `import { ... } from ...` (ES Modules).