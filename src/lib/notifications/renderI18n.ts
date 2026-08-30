import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { i18n as I18nInstance, TFunction } from 'i18next';
import { dirFor, isLanguage } from '../../i18n';

/**
 * Notification and task text is translated at render time, never stored.
 *
 * The server sends a key plus variables — `reminder.missing_insurance.title`
 * with `{ plate: '34HZY380' }` — and the row's own `title`/`body` survive only
 * as a fallback for a key this build does not know yet. That keeps a dashboard
 * deployed before a new reminder type from showing an empty card, and it means
 * adding a language never requires touching the database.
 */

/** The namespace the server's keys are resolved against. */
export const NOTIF_NS = 'notifications';

/**
 * Resolves one key, or falls back.
 *
 * Kept free of React so it can be unit-tested and called from either component;
 * `useNotifText` below is the binding most callers actually want.
 *
 * `exists` is checked before `t` because i18next returns the key itself when a
 * lookup misses — printing `reminder.foo.title` at a user would be worse than
 * printing the server's own wording.
 */
export function renderNotifText(
  t: TFunction,
  exists: (key: string) => boolean,
  key: string | null | undefined,
  vars: Record<string, unknown> | null | undefined,
  fallback: string | null | undefined,
): string {
  if (key) {
    const full = `${NOTIF_NS}:${key}`;
    if (exists(full)) return t(full, { ...(vars ?? {}) }) as string;
  }
  return fallback ?? '';
}

/** `(key, vars, fallback) => string`, re-created when the language changes. */
export function useNotifText() {
  const { t, i18n } = useTranslation(NOTIF_NS);
  return useCallback(
    (key: string | null | undefined, vars: Record<string, unknown> | null | undefined, fallback: string | null | undefined) =>
      renderNotifText(t, (k) => i18n.exists(k), key, vars, fallback),
    [t, i18n],
  );
}

/**
 * The active language's direction.
 *
 * The detector can hand back a region-tagged tag (`ar-SA`), and `resolvedLanguage`
 * is what actually selected the resource bundle, so both are narrowed to the
 * base language before asking for a direction.
 */
export function dirOf(i18n: Pick<I18nInstance, 'language' | 'resolvedLanguage'>): 'ltr' | 'rtl' {
  const raw = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  const base = raw.split('-')[0];
  return isLanguage(base) ? dirFor(base) : 'ltr';
}

/** Direction for a component that must follow the UI language, not a constant. */
export function useUiDir(): 'ltr' | 'rtl' {
  const { i18n } = useTranslation();
  return dirOf(i18n);
}
