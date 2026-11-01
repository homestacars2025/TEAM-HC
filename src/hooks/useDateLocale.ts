import { useTranslation } from 'react-i18next';

/** Western digits in Arabic: plates and references here are all Latin. */
export function useDateLocale(): string {
  const { i18n } = useTranslation();
  return i18n.resolvedLanguage?.startsWith('ar') ? 'ar-u-nu-latn' : 'en-GB';
}

export function formatDay(date: string | null | undefined, locale: string): string {
  if (!date) return '—';
  const day = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(day.getTime())) return date;
  return day.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
