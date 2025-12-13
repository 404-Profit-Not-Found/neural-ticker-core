# Neural Ticker Style Guide

## 1. Component Patterns

### 1.1 Feeds & Lists (Research/News)

The application uses a unified design for displaying lists of items (News, Research, Logs).

**Visual Specs:**
- **Container**: `Card` with `overflow-hidden`.
- **Header**: `bg-muted/10`, `border-b`, `font-bold text-sm`.
- **Items**:
  - `bg-background`
  - `hover:bg-muted/50` (Interactive Hover)
  - `border-b border-border/50` (Subtle dividers)
- **Status Indicators**:
  - **Success/Completed**: `bg-green-500` (Dot)
  - **Processing**: `bg-yellow-500 animate-pulse`
  - **Failed**: `bg-red-500`
- **Badges**:
  - Source/Model: `text-[10px] uppercase font-bold tracking-wider`
  - Style: `bg-muted text-muted-foreground` or `bg-primary/10 text-primary`

**Reference Implementations:**
- `ResearchFeed.tsx`
- `TickerNews.tsx`

### 1.2 Examples

**Research Feed (Deep Analysis):**
![Research Feed](file:///Users/branislavlang/.gemini/antigravity/brain/fce28c1a-b20f-4bed-aa46-64d80d37dee0/uploaded_image_0_1765575076430.png)

**News Feed (External Data):**
![News Feed](file:///Users/branislavlang/.gemini/antigravity/brain/fce28c1a-b20f-4bed-aa46-64d80d37dee0/uploaded_image_1_1765575076430.png)
