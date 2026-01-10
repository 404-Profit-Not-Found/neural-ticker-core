# 🖼️ Neural-Ticker Frontend

The visualization and interactive layer for the **Neural-Ticker** ecosystem. Built with a focus on high-density financial data, real-time feedback, and premium aesthetics.

## 🚀 Highlights

- **Intelligent Dashboards**: Real-time ticker tracking with integrated sparklines and AI sentiment indicators.
- **Deep Research Interface**: View-mode toggle (KISS vs. Deep) for researchers to switch between simplified outcomes and raw analytical depth.
- **Interactive Charting**: Custom wrappers for TradingView Lightweight Charts, synchronized with the platform's color palette.
- **Admin Command Center**: Real-time user management, tier switching, and identity verification.

## 🛠️ Tech Stack

- **Framework**: [React 19](https://react.dev/) + [Vite](https://vitejs.dev/)
- **State Management**: [TanStack Query (v5)](https://tanstack.com/query) with IndexedDB persistence.
- **UI Components**: [shadcn/ui](https://ui.shadcn.com/) (Radix UI primitives).
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) + [class-variance-authority](https://cva.style/).
- **Icons**: [Lucide React](https://lucide.dev/).
- **Charts**: [Lightweight Charts (TradingView)](https://www.tradingview.com/lightweight-charts/).

## 🏛️ Design System

Neural-Ticker utilizes a custom **Dark Mode** design system built on top of **shadcn/ui** primitives. 

- **Typography**: Inter (System Default).
- **Color Palette**: Custom HSL tokens defined in `src/index.css` for semantic consistency (success, warning, destructive, and rating-specific gradients).
- **Glassmorphism**: Subtle backdrop blurs and semi-transparent borders for a modern, professional feel.

## 📂 Architecture

- `src/components/`: Unified component library.
  - `ui/`: Design system primitives (Buttons, Badges, Cards).
  - `layout/`: Global Shell, Navigation, and Search.
  - `dashboard/`: Ticker-specific feature components.
- `src/hooks/`: Reusable logic (Auth, API calls, Media Queries).
- `src/services/`: API integration layer using Axios.
- `src/context/`: Global state (Auth, Theme).
- `src/lib/`: Complex business logic (Rating algorithms, Date formatting).

## 🧪 Development

### Running the App
```bash
npm install
npm run dev
```

### Testing
We use **Vitest** for unit logic and **Testing Library** for component verification.
```bash
npm run test        # Run all tests
npm run test:unit   # Focused logic testing
```

---
*Part of the Neural-Ticker Core ecosystem.*
