import React, { createContext, useContext, useEffect, useState } from 'react';
import i18n, { LANG_STORAGE_KEY, LANGUAGES, dirFor, isLanguage, type Language } from '../i18n';

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
}

// ─── Default context (English / LTR pass-through) ────────────────────────────

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'en',
  setLang: () => {},
  dir: 'ltr',
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(() => {
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
    setLangState(next);
    try { localStorage.setItem(LANG_STORAGE_KEY, next); } catch { /* private mode */ }
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, dir }}>
      {children}
    </LanguageContext.Provider>
  );
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useLanguage = () => useContext(LanguageContext);
