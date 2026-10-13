import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enCommon from '../locales/en/common.json';
import enProfile from '../locales/en/profile.json';
import skCommon from '../locales/sk/common.json';
import skProfile from '../locales/sk/profile.json';

import { SUPPORTED_LANGUAGES, registerI18n } from './languages';

export { SUPPORTED_LANGUAGES, type AppLanguage } from './languages';

// Bundled (synchronous) resources — no HTTP backend. Catalogs are committed
// JSON, so there is zero runtime cost and no loading flash.
void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: enCommon, profile: enProfile },
      sk: { common: skCommon, profile: skProfile },
    },
    fallbackLng: 'en',
    supportedLngs: [...SUPPORTED_LANGUAGES],
    // Map e.g. "sk-SK" (navigator) → "sk".
    load: 'languageOnly',
    defaultNS: 'common',
    ns: ['common', 'profile'],
    interpolation: { escapeValue: false },
    returnNull: false,
    detection: {
      // The actual writer is LanguageContext (it also syncs to the DB), so the
      // detector only READS localStorage for the initial language and never
      // caches back.
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'language',
      caches: [],
    },
  });

registerI18n(i18n);

export default i18n;
