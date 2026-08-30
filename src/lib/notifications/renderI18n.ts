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

/** The subset of the i18next instance this module needs. */
export type I18nLike = Pick<I18nInstance, 'exists' | 'getResource' | 'language' | 'resolvedLanguage'>;

const PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g;

/**
 * Whether every `{{placeholder}}` in the template has a value to fill it.
 *
 * i18next leaves an unfilled placeholder in the output verbatim, so a template
 * the server has not sent all the variables for renders as
 * `{{customer}} — Check-in — {{plate}}`. That is worse than the stored wording
 * it would replace, so a template that cannot be filled counts as a miss.
 *
 * This is what lets a key be added ahead of the data: the moment the server
 * starts sending the missing variables, the translation takes over on its own.
 */
function canFill(template: unknown, vars: Record<string, unknown> | null | undefined): boolean {
  // Plurals resolve to an object of forms; leave those to `t`.
  if (typeof template !== 'string') return true;
  for (const match of template.matchAll(PLACEHOLDER)) {
    const name = match[1];
    // `count` is supplied by i18next's own plural handling, not by `vars`.
    if (name === 'count') continue;
    if (vars?.[name] == null) return false;
  }
  return true;
}

/**
 * Resolves one key, or falls back.
 *
 * Kept free of React so it can be unit-tested and called from either component;
 * `useNotifText` below is the binding most callers actually want.
 *
 * The key is checked twice before it is used: `exists`, because i18next returns
 * the key itself when a lookup misses, and `canFill`, because it returns raw
 * placeholders when a variable is missing. Either way the stored wording wins —
 * the server's own sentence always beats a broken-looking translation.
 */
export function renderNotifText(
  t: TFunction,
  i18n: I18nLike,
  key: string | null | undefined,
  vars: Record<string, unknown> | null | undefined,
  fallback: string | null | undefined,
): string {
  if (key) {
    const full = `${NOTIF_NS}:${key}`;
    const lng = i18n.resolvedLanguage ?? i18n.language ?? 'en';
    if (i18n.exists(full) && canFill(i18n.getResource(lng, NOTIF_NS, key), vars)) {
      return t(full, { ...(vars ?? {}) }) as string;
    }
  }
  return fallback ?? '';
}

/** `(key, vars, fallback) => string`, re-created when the language changes. */
export function useNotifText() {
  const { t, i18n } = useTranslation(NOTIF_NS);
  return useCallback(
    (key: string | null | undefined, vars: Record<string, unknown> | null | undefined, fallback: string | null | undefined) =>
      renderNotifText(t, i18n, key, vars, fallback),
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
