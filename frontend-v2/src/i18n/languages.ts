// Dependency-free language constants, so the shell can know the active
// language without pulling the i18next runtime into the entry bundle.

// Supported UI languages. Must mirror the backend whitelist
// (UsersService.SUPPORTED_LANGUAGES) so the client never persists a code the
// API would reject.
export const SUPPORTED_LANGUAGES = ['en', 'sk'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** Coerce any stored/server/browser value to a supported code ('en' default). */
export function normalizeLanguage(val?: string | null): AppLanguage {
  const short = (val ?? '').toLowerCase().split('-')[0];
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(short)
    ? (short as AppLanguage)
    : 'en';
}

type I18n = typeof import('./index').default;
let instance: Promise<I18n> | null = null;

/**
 * Load the i18next runtime + catalogs on demand. Pages that render translated
 * strings import `./index` directly (it initialises synchronously from
 * bundled JSON); this is for code that only needs to *notify* i18next.
 */
export function loadI18n(): Promise<I18n> {
  instance ??= import('./index').then((m) => m.default);
  return instance;
}

/** Called by ./index when it initialises, however it was loaded. */
export function registerI18n(i18n: I18n): void {
  instance = Promise.resolve(i18n);
}

/** Tell i18next about a language change — only if it is already loaded. */
export function syncI18nLanguage(lang: AppLanguage): void {
  void instance?.then((i18n) => {
    if (i18n.resolvedLanguage !== lang) void i18n.changeLanguage(lang);
  });
}
