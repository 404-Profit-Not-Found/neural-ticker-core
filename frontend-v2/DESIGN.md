# NeuralTicker v2 — design language

v2 is a hybrid on purpose: **v1's information design** (real data, real logos, the
card / range / chip vocabulary people already know) with a **terminal's
discipline** (a live ticker tape, a status line, mono numerals, small uppercase
mono labels, amber "you are here"). The character comes from structure — never
from a novelty typeface or decoration. When the two pull in different
directions, legibility wins.

**No outlines, no divider lines.** Surfaces are told apart by tone and by
spacing. This is the rule most easily broken by habit, so it is stated first;
§3 has the details.

Everything below exists in code — tokens in `src/index.css` and
`tailwind.config.js`, primitives in `src/components/ui/`. Use those instead of
re-deriving styles per page.

## 1. Colour

All colours are CSS variables, switched per theme (`data-theme` on `<html>`:
`dark` default, `light`, `gray`, `rgb`). Never hard-code a hex for a surface,
border or text colour.

| Token (Tailwind class) | Meaning |
|---|---|
| `background` → `card` → `muted` → `raised` | The tone ladder: canvas → surface → inset / hover / chip → selected chip. `popover` is for things that float |
| `border`, `input` | **Retired.** They resolve to fully transparent (`--stroke: 0`), so legacy `border-border` classes draw nothing. Do not use them in new code |
| `hairline` | The one sanctioned rule colour, for the rare case a line carries meaning (e.g. under a table head inside a document). Ask first whether spacing would do |
| `foreground` / `muted-foreground` | Primary / secondary text. Do not go fainter than `muted-foreground` for anything that must be read |
| `primary` (blue) | **What you can do** — primary buttons, links. As a fill it is blue-600; as text (`text-primary`) it resolves to the lighter `--link` step so it passes AA on dark surfaces |
| `signal` (amber) | **Where you are** — active nav item, selected tab/segment, focus ring, LEDs, the brand mark |
| `up` / `down` | Market direction (theme-aware green/red). Exactly zero is neutral (`muted-foreground`), never green |
| `ai` (violet) | AI-generated things (research, digest, analysis): `text-ai`, `bg-ai/10`. One violet, from the token |
| yellow | "Hold"/caution in ratings — a rating colour, not a selection colour |

Blue and amber never swap roles. The current page and an active filter are
amber-tinted (`bg-signal/10 text-signal`); a button that performs an action is
blue, or a quiet tonal button (`outline` — a fill, despite the name — or
`ghost`).

## 2. Type

Two faces, each with one job:

- **Inter** (`font-sans`) — anything read as language: the wordmark,
  navigation, names, descriptions, body copy, button and tab labels, form
  fields.
- **JetBrains Mono** (`font-mono`, `.num`, `.label-micro`, `.panel-title`) —
  every number (prices, percentages, counts, dates in tables) and short
  uppercase data labels / panel titles / stamps. Numbers are always tabular so
  columns align and values don't jitter.

There is no display or "pixel" font. (One was tried: at UI sizes its C read as
O and B as 8 — "TICKER" became "TIOKER".) Do not add one.

Scale (px): page title 24/28 bold · section title 16 semibold (phone) ·
panel title 11.5 mono caps · body 14 · secondary 13 · caption 12 · micro label
11 mono caps. Nothing a user must read is under 11px; body text on phones is
at least 14px and form fields 16px (prevents iOS zoom).

## 3. Geometry and depth

- **Tone, not strokes.** A surface is a fill one step up the tone ladder from
  what it sits on — never an outline. No `border`, `border-t/b/l/r`,
  `divide-*`, `ring-1` outlines, `h-px` rules or dashed rules. Inside a
  surface, items are separated by spacing; if they need more, give each its
  own fill (`bg-muted/60`) rather than a line between them.
- **One surface deep.** A section is either a plain block on the canvas whose
  items are the surfaces (a list of ticker rows, a grid of cards), or one
  surface with unboxed content. Not a box of boxes.
- Selection and state are fills too: a tint (`bg-signal/10`), a lighter chip
  (`bg-raised`), a coloured fill for a badge. The only strokes left are the
  keyboard focus ring and lines that are data (chart axes, the 52-week track).
- Things that float (dialogs, popovers, menus, toasts) use `bg-popover` plus a
  deep shadow — the shadow is what separates them, not an edge.
- Corners: one radius, `--radius` (6px). Every `rounded-*` utility except
  `rounded-full` resolves to it. `rounded-full` is for avatars, logos and LEDs
  only — not for chips, buttons or inputs.
- Spacing follows the 4px grid. Page gutter 16px (phone) / 16–24px (desktop);
  gap between panels 12px (phone) / 16px (desktop); panel padding 12–16px.

## 4. Building blocks

| Need | Use |
|---|---|
| A block of content | `Panel` + `PanelHeader` (`title`, `led`, `actions`) + `PanelBody` — `ui/panel.tsx`. One tonal surface; no rule under the title |
| Page title row | `PageHeader` — `ui/page-header.tsx`. One per page, same on every page |
| One-of-many switch (ranges, view modes, categories) | `SegmentedControl` — `ui/segmented.tsx` |
| Status / rating / tag | `Badge` (a filled mono "stamp", no outline) |
| Tickers in a list on a phone | `TickerRowList` / `TickerListRow` (+ `TickerRowListSkeleton`) — `components/dashboard/TickerListRow.tsx` |
| Tickers as full cards (desktop grids) | `TickerCard` — `components/ticker/TickerCard.tsx` |
| Phone vs desktop as different trees | `useCompactLayout()` — `hooks/useMediaQuery.ts` (use `lg:` when it is only a style difference) |
| A text field / select | `Input`, `NativeSelect`, `Textarea` — filled, no outline |
| Headline figure | `StatPill` (`components/dashboard/StatPill.tsx`) |
| Nothing to show | `EmptyState` — `ui/empty-state.tsx` |
| Failed to load | `LoadError` (same file): names what failed, keeps context, offers a retry |
| Loading | `Skeleton` shaped like the content it replaces (never a lone spinner for a whole page) |
| Confirm / ask for one value | `useConfirm()` / `usePrompt()` — `ui/confirm.tsx` (never `window.confirm/alert/prompt`) |
| Feedback after an action | `toast` from `sonner` |
| Modal | `Dialog` — `ui/dialog.tsx` (focus trap, Escape, scroll lock built in) |
| Tabs | `Tabs` — `ui/tabs.tsx` (scrolls sideways on phones, arrow-key navigation) |

Panel titles are 1–3 uppercase words ("TOP OPPORTUNITIES", "PRICE ALERTS").
The LED says something true or is omitted: `up`/`down` for state, `ai` for
AI-generated content, `signal` as the neutral default, `pulse` only while data
is actually loading or streaming.

## 5. Data presentation

- Money: always through `useCurrency()` (`formatNative` in the instrument's own
  currency; the Portfolio page is the only place that converts). Never mix
  currencies inside one row.
- Percentages: sign always shown for changes (`+1.33%`, `−1.04%`), 2 decimals
  for price change, 1 for upside/downside. Use the minus sign `−`, not a hyphen.
- Direction: `text-up` / `text-down` plus an arrow or sign — never colour alone.
- Missing data: an em dash `—`, not `0`, `$0.00`, `N/A` or a guessed value.
- **Three states, never shown as one another.** Not loaded yet → a `Skeleton`
  the size of the figure. Failed with nothing cached → `—` for a figure,
  `LoadError` (says so, offers "Try again") for a list or panel. Loaded → the
  value, which may honestly be zero or an `EmptyState`. A failure must never
  look like "nothing here", and nothing is said about data ("Add a position
  to start…") before it has loaded.
- A value that is estimated rather than sourced is marked: muted colour and a
  leading `≈` with a title that says how it was estimated.
- Bands come from one place: `riskBand()` (rounded first: ≤3 low, 4–6 medium,
  ≥7 high) and `scoreBand()` (≥7 good, ≥5 fair) in `lib/ticker-metrics.ts`,
  with `RISK_TEXT` / `SCORE_TEXT` for the colours. The same number always
  gets the same bars and the same colour.
- **Nothing on screen is invented.** No placeholder metrics, simulated series
  or decorative "live" indicators. If it can't be computed, say so.
- **One derivation per figure.** Upside, downside and the AI rating come from
  `lib/ticker-metrics.ts` (`deriveVerdict`, `snapshotToTickerData`,
  `verdictProps`, `ratingStamp`). A view never recomputes them: the same
  ticker must read the same in a row, a card, a table and a filter.
- **Figures read together sit together.** Upside next to downside, risk next
  to risk/reward — never one in a box and its partner in a footer.
- Long text: company names and headlines truncate (`truncate` / `line-clamp-2`)
  inside a `min-w-0` flex/grid child. Grids always declare their tracks
  (`grid-cols-1` at minimum) so one long string can't widen the page.

## 6. Phone layout (≤ 767px)

- Navigation is the bottom tab bar; content gets `padding-bottom:
  var(--shell-bottom)` from the shell. Anything `position: fixed` at the bottom
  must sit above it: `bottom-[calc(var(--shell-bottom)+1rem)]`.
- No page-level horizontal scroll, ever. Wide content scrolls inside its own
  container (tab strips, tables with an obvious affordance) or changes shape
  (table → list of cards).
- Touch targets are at least 44×44 CSS px; adjacent targets are at least 8px
  apart. Icon-only buttons have an `aria-label`.
- **Rows, not cards.** A collection of tickers on a phone is a list of compact
  "mini card" rows (logo · symbol + rating · name · sparkline · price/change,
  then one line of upside and risk; ~72px each, a 6px gap between them, no
  rules) — `TickerRowList`. It is the default view of Tickers and Watchlist
  below `lg`; the full `TickerCard` grid is the alternative, never the default.
- **No boxes inside boxes.** See §3. Section chrome (title + one control)
  takes one line; a row of filters scrolls sideways instead of wrapping.
- **Content first.** At most one compact "hero" block above the first piece of
  real content; the first list or chart must start within the first screen.
- Dialogs fit the screen (`max-h` + internal scroll) with the primary action
  reachable without scrolling when possible.
- Use `min-h-page` for full-height pages, never `min-h-screen` (the shell
  already takes the header and tab bar).

## 7. Motion

150ms for hover/press, 200ms for enter. Nothing loops forever except the ticker
tape, a progress line while something is actually loading, and an LED that is
reporting real activity — no pulsing dots on charts. Everything respects
`prefers-reduced-motion`.

## 8. Accessibility baseline

WCAG 2.1 AA: 4.5:1 text contrast (3:1 for large text and UI glyphs), visible
`:focus-visible` on every interactive element, real `<button>`/`<a>` for
anything clickable (no bare `onClick` on a `<div>` without `role`, `tabIndex`
and keyboard handling), labelled form fields, and `aria-live` for async status.
