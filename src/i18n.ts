import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enCommon from './locales/en/common.json';
import enSidebar from './locales/en/sidebar.json';
import enNotifications from './locales/en/notifications.json';
import enTasks from './locales/en/tasks.json';
import enCars from './locales/en/cars.json';
import arCommon from './locales/ar/common.json';
import arSidebar from './locales/ar/sidebar.json';
import arNotifications from './locales/ar/notifications.json';
import arTasks from './locales/ar/tasks.json';
import arCars from './locales/ar/cars.json';

export const LANGUAGES = ['en', 'ar'] as const;
export type Language = (typeof LANGUAGES)[number];

/** Shared with LanguageProvider and the pre-hydration script in public/index.html. */
export const LANG_STORAGE_KEY = 'hc_lang';

export function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'ar';
}

export function dirFor(lang: Language): 'ltr' | 'rtl' {
  return lang === 'ar' ? 'rtl' : 'ltr';
}

/**
 * Namespaces are per page so each page can be migrated on its own.
 * `common` and `sidebar` cover the shared chrome; page namespaces get added as
 * those pages are translated.
 */
const resources = {
  en: { common: enCommon, sidebar: enSidebar, notifications: enNotifications, tasks: enTasks, cars: enCars },
  ar: { common: arCommon, sidebar: arSidebar, notifications: arNotifications, tasks: arTasks, cars: arCars },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: [...LANGUAGES],
    ns: ['common', 'sidebar', 'notifications', 'tasks', 'cars'],
    defaultNS: 'common',
    detection: {
      order: ['localStorage'],
      lookupLocalStorage: LANG_STORAGE_KEY,
      caches: ['localStorage'],
    },
    interpolation: {
      // React escapes for us.
      escapeValue: false,
    },
    react: {
      // Translations are bundled, so there is nothing to suspend on.
      useSuspense: false,
    },
  });

export default i18n;
