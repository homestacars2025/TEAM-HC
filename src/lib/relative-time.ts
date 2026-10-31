import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

/**
 * Relative and due-date wording for notifications and tasks.
 *
 * The counted forms live in the locale files rather than here, because Arabic
 * needs five categories where English needs two — one, two (dual), few (3–10,
 * broken plural), many (11+, accusative singular) and other. i18next resolves
 * those through `Intl.PluralRules`, so the shape of the plural is a property of
 * the language file and not of this module.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** Falls back to an absolute date once the elapsed count stops being readable. */
const ABSOLUTE_AFTER_DAYS = 30;

export function formatRelativeTime(t: TFunction, iso: string, locale: string): string {
  const then = new Date(iso);
  const ms = then.getTime();
  if (Number.isNaN(ms)) return '';

  const elapsed = Date.now() - ms;
  // Clock skew between browser and server must never print a negative count.
  if (elapsed < MINUTE_MS) return t('notifications:time.now');

  const mins = Math.floor(elapsed / MINUTE_MS);
  if (mins < 60) return t('notifications:time.minutes', { count: mins });

  const hours = Math.floor(elapsed / HOUR_MS);
  if (hours < 24) return t('notifications:time.hours', { count: hours });

  const days = Math.floor(elapsed / DAY_MS);
  if (days < ABSOLUTE_AFTER_DAYS) return t('notifications:time.days', { count: days });

  return then.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * A due date phrased from the reader's side, in the largest unit that reads
 * naturally: minutes, then hours, then days. Overdue is named rather than softened
 * into an elapsed count, because it is the case that has to stand out.
 */
export function formatDue(t: TFunction, iso: string): { text: string; overdue: boolean } {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return { text: '', overdue: false };

  const diff = ms - Date.now();
  const overdue = diff < 0;
  const distance = Math.abs(diff);
  const minutes = Math.max(Math.round(distance / MINUTE_MS), 1);
  const hours = Math.round(distance / HOUR_MS);

  if (minutes < 60) return { text: t(overdue ? 'tasks:due.overdueMinutes' : 'tasks:due.inMinutes', { count: minutes }), overdue };
  if (hours < 24) return { text: t(overdue ? 'tasks:due.overdueHours' : 'tasks:due.inHours', { count: hours }), overdue };
  const days = Math.round(distance / DAY_MS);
  return { text: t(overdue ? 'tasks:due.overdue' : 'tasks:due.in', { count: days }), overdue };
}

/** Both formatters bound to the active language, for use inside components. */
export function useTimeFormat() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'en';

  return {
    relative: useCallback((iso: string) => formatRelativeTime(t, iso, locale), [t, locale]),
    due: useCallback((iso: string) => formatDue(t, iso), [t]),
  };
}
