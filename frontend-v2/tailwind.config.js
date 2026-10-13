/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Self-hosted variable fonts (imported in src/main.tsx). The system
      // stacks behind them keep text readable while the font file loads.
      fontFamily: {
        sans: [
          '"Inter Variable"',
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
        mono: [
          '"JetBrains Mono Variable"',
          '"JetBrains Mono"',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Consolas',
          'monospace',
        ],
      },
      // Height available to a page inside the app shell (viewport minus the
      // sticky header and, on phones, the bottom tab bar). See index.css.
      minHeight: { page: 'var(--page-min-h)' },
      colors: {
        background: 'rgb(var(--background) / <alpha-value>)',
        foreground: 'rgb(var(--foreground) / <alpha-value>)',
        card: 'rgb(var(--card) / <alpha-value>)',
        'card-foreground': 'rgb(var(--card-foreground) / <alpha-value>)',
        popover: 'rgb(var(--popover) / <alpha-value>)',
        'popover-foreground': 'rgb(var(--popover-foreground) / <alpha-value>)',
        primary: {
          DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
          foreground: 'rgb(var(--primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'rgb(var(--secondary) / <alpha-value>)',
          foreground: 'rgb(var(--secondary-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'rgb(var(--muted) / <alpha-value>)',
          foreground: 'rgb(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          foreground: 'rgb(var(--accent-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'rgb(var(--destructive) / <alpha-value>)',
          foreground: 'rgb(var(--destructive-foreground) / <alpha-value>)',
        },
        // "Where you are": active navigation, selected toggles, focus, LEDs.
        // (Blue `primary` stays "what you can do": buttons and links.)
        signal: {
          DEFAULT: 'rgb(var(--signal) / <alpha-value>)',
          foreground: 'rgb(var(--signal-foreground) / <alpha-value>)',
        },
        // Market direction, theme-aware so they keep contrast on light themes.
        // AI-generated things (research, digest, analysis).
        ai: 'rgb(var(--ai) / <alpha-value>)',
        up: 'rgb(var(--up) / <alpha-value>)',
        down: 'rgb(var(--down) / <alpha-value>)',
        // Surfaces are separated by tone, not by strokes (DESIGN.md §3).
        // `border` / `input` therefore draw nothing: `--stroke` is 0, so every
        // legacy `border-border`, `divide-border` or `bg-border` rule keeps
        // its pixel of layout but is invisible. Do not reach for them in new
        // code; where a rule is really needed (a table head) use `hairline`.
        border: 'rgb(var(--border) / calc(<alpha-value> * var(--stroke)))',
        input: 'rgb(var(--input) / calc(<alpha-value> * var(--stroke)))',
        hairline: 'rgb(var(--hairline) / <alpha-value>)',
        // One step above `muted`: the selected chip in a segmented control,
        // hover on an already-raised surface.
        raised: 'rgb(var(--raised) / <alpha-value>)',
        ring: 'rgb(var(--ring) / <alpha-value>)',
      },
      // `text-primary` is a link/accent text colour, and blue-600 on a dark
      // surface is only 3.7:1. Text therefore uses the lighter `--link` step;
      // `bg-primary` (buttons, white label on top) keeps blue-600.
      textColor: {
        primary: { DEFAULT: 'rgb(var(--link) / <alpha-value>)' },
      },
      // One corner for every surface. `rounded-full` is untouched (avatars,
      // logos, LEDs).
      borderRadius: {
        '3xl': 'var(--radius)',
        '2xl': 'var(--radius)',
        xl: 'var(--radius)',
        lg: 'var(--radius)',
        md: 'var(--radius)',
        DEFAULT: 'var(--radius)',
        sm: 'var(--radius)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    require("tailwindcss-animate"),
  ],
};
