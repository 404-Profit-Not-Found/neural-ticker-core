import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import { api } from '../lib/api';
import { useAuth } from './AuthContext';
import i18n, { SUPPORTED_LANGUAGES, type AppLanguage } from '../i18n';

interface LanguageContextType {
  /** Active UI language. Drives i18next + persists to the user's preferences. */
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => Promise<void>;
  supportedLanguages: readonly AppLanguage[];
}

const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined,
);

// Coerce any stored/server value down to a supported code, defaulting to 'en'
// so nothing breaks if an unknown language ever sneaks through.
const normalize = (val?: string | null): AppLanguage =>
  (SUPPORTED_LANGUAGES as readonly string[]).includes(val ?? '')
    ? (val as AppLanguage)
    : 'en';

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [language, setLanguageState] = useState<AppLanguage>(() =>
    normalize(localStorage.getItem('language') || i18n.resolvedLanguage),
  );

  // Keep i18next in sync with local state.
  useEffect(() => {
    if (i18n.resolvedLanguage !== language) {
      void i18n.changeLanguage(language);
    }
  }, [language]);

  // Hydrate from the user's saved preference on login (cross-device).
  useEffect(() => {
    const pref = user?.preferences?.language;
    if (typeof pref === 'string') {
      const next = normalize(pref);
      setLanguageState(next);
      localStorage.setItem('language', next);
    }
  }, [user?.preferences?.language]);

  const setLanguage = useCallback(
    async (lang: AppLanguage) => {
      const next = normalize(lang);
      setLanguageState(next);
      localStorage.setItem('language', next);
      void i18n.changeLanguage(next);

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
