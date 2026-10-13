// Class strings shared by the ticker / research / news pages.

/**
 * Blue for *text*: links, mentions, "liked" counters.
 *
 * `primary` (blue-600) is the fill colour of buttons. As text on the dark
 * canvas it only reaches 3.4–3.9:1; blue-400 reaches about 7:1. Light themes
 * keep `primary`, which is 5.2:1 on white. (A `--link` token in index.css
 * would be the proper home for this.)
 */
export const LINK_TEXT = 'text-primary dark:text-blue-400';

/** Phone-sized hit area for small inline controls; compact again from `lg`. */
export const TOUCH_TARGET = 'min-h-11 min-w-11 lg:min-h-8 lg:min-w-8';

/** The one keyboard focus treatment for custom buttons and links. */
export const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

/**
 * Direction as a tonal fill (chips, stamps). On their own tint the plain
 * `up` / `down` colours only reach about 4.3:1 in the dark themes, so the
 * text steps up one shade there.
 */
export const TINT_UP = 'bg-up/15 text-up dark:text-emerald-400';
export const TINT_DOWN = 'bg-down/15 text-down dark:text-rose-400';
export const TINT_NEUTRAL = 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400';
