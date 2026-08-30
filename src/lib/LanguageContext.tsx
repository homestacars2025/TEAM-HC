import React, { createContext, useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
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

/**
 * Routes that render before anyone has signed in.
 *
 * The language control lives inside the dashboard, so there is nowhere to
 * change language from here — which makes honouring a stored Arabic choice a
 * trap rather than a courtesy: the page would come up right-to-left with no
 * visible way to put it back. These stay English, always.
 */
const PRE_AUTH_PATHS = new Set(['/login']);

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

  /**
   * The stored choice still stands; it is only suspended while a pre-auth route
   * is on screen, so signing in restores Arabic without the user re-picking it.
   */
  const isPreAuth = PRE_AUTH_PATHS.has(useLocation().pathname);
  const effectiveLang: Language = isPreAuth ? 'en' : lang;
  const dir = dirFor(effectiveLang);

  /**
   * The single place the whole app's direction is controlled. `public/index.html`
   * is static and there is no SSR, so <html lang/dir> can only be set imperatively.
   * An inline script in that file applies the same values before React mounts, which
   * is what prevents an LTR flash for Arabic users on first paint.
   *
   * This has to live in the provider rather than in the page that wants English:
   * a child's effect runs before its parent's, so anything the login page wrote
   * would be overwritten here a moment later.
   */
  useEffect(() => {
    document.documentElement.lang = effectiveLang;
    document.documentElement.dir = dir;
    if (i18n.language !== effectiveLang) i18n.changeLanguage(effectiveLang);
  }, [effectiveLang, dir]);

  const setLang = (next: Language) => {
    if (!canSwitch) return;
    setLangState(next);
    try { localStorage.setItem(LANG_STORAGE_KEY, next); } catch { /* private mode */ }
  };

  return (
    <LanguageContext.Provider value={{ lang: effectiveLang, setLang, dir, canSwitch }}>
      {children}
    </LanguageContext.Provider>
  );
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useLanguage = () => useContext(LanguageContext);
