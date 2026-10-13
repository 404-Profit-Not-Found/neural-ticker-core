// Theme application, shared by the session-driven controller and by anything
// that switches theme interactively (profile page, command palette).
// The inline script in index.html applies the cached theme before first
// paint; this module keeps the document in sync afterwards.

export const THEMES = ['dark', 'light', 'gray', 'rgb'] as const;
export type AppTheme = (typeof THEMES)[number];

export const THEME_STORAGE_KEY = 'theme-preference';

/** Coerce any stored/server value to a supported theme. */
export function normalizeTheme(value?: string | null): AppTheme {
  // Legacy values such as "g100" predate the current theme set.
  return (THEMES as readonly string[]).includes(value ?? '')
    ? (value as AppTheme)
    : 'dark';
}

export function cachedTheme(): AppTheme {
  try {
    return normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'dark';
  }
}

// Variables consumed by the boot splash (index.html) and SuperLoading, so the
// loader matches the theme. Keep in step with the inline script in index.html.
const BOOT_VARS: Record<AppTheme, Record<string, string>> = {
  dark: { '--boot-bg': '#08080a', '--boot-text': '#f4f4f5', '--boot-muted': '#a1a1aa', '--boot-accent': '#a78bfa' },
  rgb: { '--boot-bg': '#08080a', '--boot-text': '#f4f4f5', '--boot-muted': '#a1a1aa', '--boot-accent': '#a78bfa' },
  light: { '--boot-bg': '#f0f1f4', '--boot-text': '#09090b', '--boot-muted': '#5f5f69', '--boot-accent': '#6d28d9' },
  gray: { '--boot-bg': '#e4e4e7', '--boot-text': '#18181b', '--boot-muted': '#52525b', '--boot-accent': '#6d28d9' },
};

const META_THEME_COLOR: Record<AppTheme, string> = {
  dark: '#08080a',
  rgb: '#08080a',
  light: '#f0f1f4',
  gray: '#e4e4e7',
};

/** Apply a theme to the document and remember it for the next boot. */
export function applyTheme(value?: string | null): AppTheme {
  const theme = normalizeTheme(value);
  const root = document.documentElement;

  root.setAttribute('data-theme', theme);
  root.classList.remove('theme-light', 'theme-dark', 'theme-rgb', 'theme-gray');
  root.classList.add(`theme-${theme}`);
  // Tailwind's `dark:` variants follow the two dark-based themes.
  root.classList.toggle('dark', theme === 'dark' || theme === 'rgb');

  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', META_THEME_COLOR[theme]);

  for (const [name, val] of Object.entries(BOOT_VARS[theme])) {
    root.style.setProperty(name, val);
  }

  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* storage unavailable: theme still applies for this session */
  }
  return theme;
}
