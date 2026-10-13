import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import { api } from '../lib/api';
import { useAuth } from './AuthContext';
import {
  SUPPORTED_LANGUAGES,
  normalizeLanguage as normalize,
  syncI18nLanguage,
  type AppLanguage,
} from '../i18n/languages';

interface LanguageContextType {
  /** Active UI language. Drives i18next + persists to the user's preferences. */
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => Promise<void>;
  supportedLanguages: readonly AppLanguage[];
}

const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined,
);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [language, setLanguageState] = useState<AppLanguage>(() =>
    // Same precedence the i18next detector uses: saved choice, then browser.
    normalize(localStorage.getItem('language') || navigator.language),
  );

  // Keep i18next + localStorage in sync with the active language.
  useEffect(() => {
    syncI18nLanguage(language);
    localStorage.setItem('language', language);
  }, [language]);

  // Hydrate from the user's saved preference when it loads or changes (login,
  // cross-device). Done during render via React's "adjust state when a prop
  // changes" pattern rather than in an effect, so it doesn't trigger a
  // setState-in-effect render cascade; the effect above persists the result.
  const [syncedPref, setSyncedPref] = useState<string | null | undefined>(
    undefined,
  );
  if (user?.preferences?.language !== syncedPref) {
    setSyncedPref(user?.preferences?.language);
    const pref = user?.preferences?.language;
    if (typeof pref === 'string') {
      setLanguageState(normalize(pref));
    }
  }

  const setLanguage = useCallback(
    async (lang: AppLanguage) => {
      const next = normalize(lang);
      setLanguageState(next);
      localStorage.setItem('language', next);
      syncI18nLanguage(next);

      // Persist to user preferences if logged in.
      if (user) {
        try {
          await api.post('/users/me/preferences', { language: next });
        } catch (error) {
          console.warn('Failed to save language preference:', error);
        }
      }
    },
    [user],
  );

  return (
    <LanguageContext.Provider
      value={{ language, setLanguage, supportedLanguages: SUPPORTED_LANGUAGES }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context)
    throw new Error('useLanguage must be used within a LanguageProvider');
  return context;
};
