// About page — what is v2, architecture, who built it.
import { InfoPage } from './_info-page.tsx';

export function AboutPage() {
  return (
    <InfoPage
      title="About Neural//Ticker v2"
      sections={[
        {
          h: 'WHAT IS THIS',
          p: `NEURAL//TICKER is an AI-driven stock research terminal. The v2 frontend is an
experimental pixel-art reimagining of the main product — built as a Vite +
TypeScript + TanStack Query v5 single-page React app, served from /v2/
alongside the main app.

Same backend, same database, same auth. Different vibe.`,
        },
        {
          h: 'ARCHITECTURE',
          p: `• Backend: NestJS · TypeORM · PostgreSQL · Yahoo Finance + Finnhub adapters
• AI: Gemini · GPT · Claude ensemble for research / portfolio analysis
• Real-time: marquee polls /market-data/indices every 30s, AI chat streams via SSE
• Frontend v2: Vite + React 19 + TanStack Query v5 + IndexedDB persist client
• Strict TypeScript matching the main frontend (frontend/tsconfig.app.json)`,
        },
        {
          h: 'WHO BUILT IT',
          p: `Branislav Lang (branislavlang@gmail.com). 15y IBM app support → first own
product. FinOps + e2e ops learning vehicle.

Source: github.com/branislavlang/neural-ticket-core`,
        },
        {
          h: 'TECH STACK',
          p: `Backend: NestJS 11 · TypeORM · TimescaleDB · Passport JWT · web-push
Frontend (main): React 19 + Vite · TypeScript · Tailwind · Radix UI
Frontend v2 (this): React 19 + Vite · TypeScript · pixel terminal CSS
Auth: Google OAuth2 · dev JWT token (non-prod)
Data: Yahoo Finance 2 · Finnhub · OpenAI · Gemini · Anthropic`,
        },
      ]}
    />
  );
}
