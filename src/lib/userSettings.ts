import type { Language } from '../i18n';
import { isLanguage } from '../i18n';
import { CURRENCIES, type Currency } from './CurrencyContext';

export interface UserSettings {
  lang: Language;
  currency: Currency;
  notificationSound: boolean;
  startCollapsed: boolean;
}

/**
 * Read before anyone is known to be signed in, so the sidebar paints at the right
 * width first time. The per-user value below is what decides; this only mirrors it.
 */
export const SIDEBAR_COLLAPSED_KEY = 'sidebar_collapsed';

const storageKey = (userId: string) => `hc_settings_${userId}`;

export function readBootCollapsed(): boolean {
  try { return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'; }
  catch { return false; }
}

/** Anything missing or malformed takes its value from `fallback`. */
export function readUserSettings(userId: string, fallback: UserSettings): UserSettings {
  try {
    const stored: Partial<UserSettings> = JSON.parse(localStorage.getItem(storageKey(userId)) ?? '{}') ?? {};
    return {
      lang: isLanguage(stored.lang) ? stored.lang : fallback.lang,
      currency: CURRENCIES.includes(stored.currency as Currency) ? stored.currency as Currency : fallback.currency,
      notificationSound: typeof stored.notificationSound === 'boolean' ? stored.notificationSound : fallback.notificationSound,
      startCollapsed: typeof stored.startCollapsed === 'boolean' ? stored.startCollapsed : fallback.startCollapsed,
    };
  } catch {
    return fallback;
  }
}

export function writeUserSettings(userId: string, settings: UserSettings): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(settings));
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(settings.startCollapsed));
  } catch { /* private mode */ }
}
