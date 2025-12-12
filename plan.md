# Style Guide / Settings Plan

## Objectives
- Create a **Settings › Style Guide** page at `/settings/style` that acts as the source of truth for our frontend language (tokens + components).
- Showcase reusable primitives (buttons, badges/tags, inputs, tables, cards/tiles, toasts, dialogs, tabs) with canonical sizing, spacing, and interaction states.
- Document foundations (colors, typography, radii, elevation, grid) so future views stay consistent.

## Scope & Layout
- **Entry point:** Protected route `/settings/style`, linked from the user menu’s Settings option.
- **Page frame:** Reuse `Header`, dark theme background, max width container with stacked sections and anchor-friendly headings.
- **Hero:** Title + description + “Usage rules” chips, quick action to trigger a demo toast.
- **Foundations section:** Color tokens (primary/foreground/muted/accent/destructive), typography scale (heading/body/mono), spacing & radii, shadows/elevation guidance, layout grid rules.
- **Components section:** Pattern cards that render live examples plus code-friendly notes:
  - Buttons (default/secondary/outline/ghost/destructive, sizes, icon buttons)
  - Badges/Tags (status variants + rating set already present)
  - Inputs (text, select, toggle/chip buttons, checkbox style), form helper text, validation
  - Cards/Tiles (surface, split header/body, RGB accent treatment)
  - Table snippet (compact data table with sortable header pattern from `WatchlistTable`)
  - Tabs (top-aligned triggers + content)
  - Toast + Dialog preview blocks
- **Usage notes:** Bullet rules for spacing, icon sizing, hover/active states, min tap areas, and when to use each variant.

## Implementation Steps
1. **Routing & access:** Add `/settings/style` route behind `ProtectedRoute` and wire the existing Settings menu item to navigate there.
2. **UI scaffolding:** New `StyleGuidePage` under `frontend/src/pages` that pulls shared primitives (`Header`, `Button`, `Badge`, `Tabs`, `Toast` hook, `Dialog`).
3. **Showcase blocks:** Build small, data-driven cards for foundations/components (map over config arrays so new examples are easy to add).
4. **Interactions:** Hook a toast trigger and a dialog toggle to demonstrate feedback patterns without external data.
5. **Responsiveness:** Use a single-column stack on mobile, 2–3 column grids on desktop; ensure scrollable code/preview blocks stay within the container.

## Reuse & Assets
- Existing tokens from `index.css` (`--background`, `--foreground`, `--primary`, `--border`, etc.) and Tailwind config.
- Existing primitives: `Button`, `Badge`, `Tabs`, `ToastProvider`/`useToast`, `Dialog`, `Tooltip` (available for future).
- New lightweight `Card` helper (if needed) to standardize surface styling for showcase tiles (`bg-card`, `border`, `rounded-lg`, padding).

## Open Questions / Follow-ups
- Should this page remain staff-only (behind role) or visible to all authenticated users?
- Do we need light-mode previews alongside dark? (Current plan uses active theme only.)
- Should we extract the table row styles into a dedicated `DataTable` wrapper for wider reuse?
