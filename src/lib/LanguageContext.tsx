import React, { createContext, useContext, useEffect, useState } from 'react';
import i18n, { LANG_STORAGE_KEY, LANGUAGES, dirFor, isLanguage, type Language } from '../i18n';
import { languageSwitcherEnabled } from './featureFlags';

// ─── Types ────────────────────────────────────────────────────────────────────

export type { Language };
export { LANGUAGES };

/** Short label for the compact toggle; the full name is used in tooltips. */
export const LANGUAGE_SHORT: Record<Language, string> = { en: 'EN', ar: 'ع' };
export const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', ar: 'العربية' };

interface LanguageContextValue {
  lang: Language;
  setLang: (l: Language) => void;
  /** Derived from `lang`; mirrors what is written onto <html dir>. */
  dir: 'ltr' | 'rtl';
  /**
   * Whether a language choice is offered at all. False while the switcher is
   * behind its flag — consumers hide the control rather than disabling it.
   */
  canSwitch: boolean;
}

// ─── Default context (English / LTR pass-through) ────────────────────────────

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'en',
  setLang: () => {},
  dir: 'ltr',
  canSwitch: false,
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  /**
   * Read once: the flag cannot change within a session (the inline script
   * captures `?ff_lang=` before mount), and re-reading it per render would let
   * the tree disagree with itself mid-update.
   */
  const [canSwitch] = useState(languageSwitcherEnabled);

  const [lang, setLangState] = useState<Language>(() => {
    // Pinned to English while the switcher is unavailable, so a stored 'ar' from
    // testing cannot leave anyone in RTL without the control to leave it.
    if (!canSwitch) return 'en';
    try {
      const stored = localStorage.getItem(LANG_STORAGE_KEY);
      return isLanguage(stored) ? stored : 'en';
    } catch {
      return 'en';
    }
  });

  const dir = dirFor(lang);

  /**
   * The single place the whole app's direction is controlled. `public/index.html`
   * is static and there is no SSR, so <html lang/dir> can only be set imperatively.
   * An inline script in that file applies the same values before React mounts, which
   * is what prevents an LTR flash for Arabic users on first paint.
   */
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    if (i18n.language !== lang) i18n.changeLanguage(lang);
  }, [lang, dir]);

  const setLang = (next: Language) => {
    if (!canSwitch) return;
    setLangState(next);
    try { localStorage.setItem(LANG_STORAGE_KEY, next); } catch { /* private mode */ }
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, dir, canSwitch }}>
      {children}
    </LanguageContext.Provider>
  );
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useLanguage = () => useContext(LanguageContext);
