import * as React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Display dates for the Media section.
 *
 * date-fns still owns every *calculation* here — `startOfWeek`, `eachDayOfInterval`,
 * and the `yyyy-MM-dd` keys that bucket posts and become droppable ids. Those must
 * stay Latin and Gregorian whatever the reader's language is, so they are left
 * alone. Only the strings a person reads come through this module.
 *
 * `ar-u-nu-latn` is the same treatment agreed for every other page: Arabic month
 * and weekday names, Gregorian calendar, Western digits.
 */

export const dateLocaleFor = (lng: string | undefined): string =>
  (lng?.startsWith('ar') ? 'ar-u-nu-latn' : 'en-GB');

const fmt = (locale: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(locale, options);

/** Monday-first, matching the grid — and the ISO week numbers the database computes. */
const WEEK_ANCHOR = [
  Date.UTC(2024, 0, 1), Date.UTC(2024, 0, 2), Date.UTC(2024, 0, 3), Date.UTC(2024, 0, 4),
  Date.UTC(2024, 0, 5), Date.UTC(2024, 0, 6), Date.UTC(2024, 0, 7),
].map((ms) => new Date(ms));

export interface MediaDates {
  /** "March 2026" */
  monthYear: (date: Date) => string;
  /** "March" — the empty state names the month on its own. */
  month: (date: Date) => string;
  /** "4 Mar" — the drag confirmation toast. */
  dayMonth: (date: Date) => string;
  /** "4 March 2026" */
  full: (date: Date) => string;
  /** "Wednesday, 4 March 2026" */
  fullWithWeekday: (date: Date) => string;
  /** "Wednesday" — the List view's own Day column. */
  weekday: (date: Date) => string;
  /** Seven short names, Monday first, for the month grid header. */
  weekdaysShort: string[];
  /** The same seven at their narrowest, for the phone-width header. */
  weekdaysNarrow: string[];
}

export function makeMediaDates(locale: string): MediaDates {
  const monthYear = fmt(locale, { month: 'long', year: 'numeric' });
  const month = fmt(locale, { month: 'long' });
  const dayMonth = fmt(locale, { day: 'numeric', month: 'short' });
  const full = fmt(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  const fullWithWeekday = fmt(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const weekday = fmt(locale, { weekday: 'long' });
  const short = fmt(locale, { weekday: 'short', timeZone: 'UTC' });
  const narrow = fmt(locale, { weekday: 'narrow', timeZone: 'UTC' });

  return {
    monthYear: (d) => monthYear.format(d),
    month: (d) => month.format(d),
    dayMonth: (d) => dayMonth.format(d),
    full: (d) => full.format(d),
    fullWithWeekday: (d) => fullWithWeekday.format(d),
    weekday: (d) => weekday.format(d),
    weekdaysShort: WEEK_ANCHOR.map((d) => short.format(d)),
    weekdaysNarrow: WEEK_ANCHOR.map((d) => narrow.format(d)),
  };
}

/** Rebuilt only when the language changes — `Intl.DateTimeFormat` is not cheap. */
export function useMediaDates(): MediaDates {
  const { i18n } = useTranslation();
  const locale = dateLocaleFor(i18n.resolvedLanguage);
  return React.useMemo(() => makeMediaDates(locale), [locale]);
}
