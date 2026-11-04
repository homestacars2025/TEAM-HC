import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enCommon from './locales/en/common.json';
import enSidebar from './locales/en/sidebar.json';
import enNotifications from './locales/en/notifications.json';
import enTasks from './locales/en/tasks.json';
import enCars from './locales/en/cars.json';
import enCarIssues from './locales/en/carIssues.json';
import enBookings from './locales/en/bookings.json';
import enOperations from './locales/en/operations.json';
import enCalendar from './locales/en/calendar.json';
import enFines from './locales/en/fines.json';
import enKgm from './locales/en/kgm.json';
import enTracking from './locales/en/tracking.json';
import enFinance from './locales/en/finance.json';
import enModelGroups from './locales/en/modelGroups.json';
import enWallets from './locales/en/wallets.json';
import enKabis from './locales/en/kabis.json';
import enHgs from './locales/en/hgs.json';
import enMedia from './locales/en/media.json';
import enAccounting from './locales/en/accounting.json';
import enShell from './locales/en/shell.json';
import enHome from './locales/en/home.json';
import enMyWallet from './locales/en/myWallet.json';
import enCustody from './locales/en/custody.json';
import enGoals from './locales/en/goals.json';
import enProfile from './locales/en/profile.json';
import enSettings from './locales/en/settings.json';
import arCommon from './locales/ar/common.json';
import arSidebar from './locales/ar/sidebar.json';
import arNotifications from './locales/ar/notifications.json';
import arTasks from './locales/ar/tasks.json';
import arCars from './locales/ar/cars.json';
import arCarIssues from './locales/ar/carIssues.json';
import arBookings from './locales/ar/bookings.json';
import arOperations from './locales/ar/operations.json';
import arCalendar from './locales/ar/calendar.json';
import arFines from './locales/ar/fines.json';
import arKgm from './locales/ar/kgm.json';
import arTracking from './locales/ar/tracking.json';
import arFinance from './locales/ar/finance.json';
import arModelGroups from './locales/ar/modelGroups.json';
import arWallets from './locales/ar/wallets.json';
import arKabis from './locales/ar/kabis.json';
import arHgs from './locales/ar/hgs.json';
import arMedia from './locales/ar/media.json';
import arAccounting from './locales/ar/accounting.json';
import arShell from './locales/ar/shell.json';
import arHome from './locales/ar/home.json';
import arMyWallet from './locales/ar/myWallet.json';
import arCustody from './locales/ar/custody.json';
import arGoals from './locales/ar/goals.json';
import arProfile from './locales/ar/profile.json';
import arSettings from './locales/ar/settings.json';

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
  en: { common: enCommon, sidebar: enSidebar, notifications: enNotifications, tasks: enTasks, cars: enCars, carIssues: enCarIssues, bookings: enBookings, operations: enOperations, calendar: enCalendar, fines: enFines, kgm: enKgm, tracking: enTracking, finance: enFinance, modelGroups: enModelGroups, wallets: enWallets, kabis: enKabis, hgs: enHgs, media: enMedia, accounting: enAccounting, shell: enShell, home: enHome, myWallet: enMyWallet, custody: enCustody, goals: enGoals, profile: enProfile, settings: enSettings },
  ar: { common: arCommon, sidebar: arSidebar, notifications: arNotifications, tasks: arTasks, cars: arCars, carIssues: arCarIssues, bookings: arBookings, operations: arOperations, calendar: arCalendar, fines: arFines, kgm: arKgm, tracking: arTracking, finance: arFinance, modelGroups: arModelGroups, wallets: arWallets, kabis: arKabis, hgs: arHgs, media: arMedia, accounting: arAccounting, shell: arShell, home: arHome, myWallet: arMyWallet, custody: arCustody, goals: arGoals, profile: arProfile, settings: arSettings },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: [...LANGUAGES],
    ns: ['common', 'sidebar', 'notifications', 'tasks', 'cars', 'carIssues', 'bookings', 'operations', 'calendar', 'fines', 'kgm', 'tracking', 'finance', 'modelGroups', 'wallets', 'kabis', 'hgs', 'media', 'accounting', 'shell', 'home', 'myWallet', 'custody', 'goals', 'profile', 'settings'],
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
