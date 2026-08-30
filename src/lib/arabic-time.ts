/**
 * Arabic relative time — "قبل ساعتين", not "قبل 2 ساعة".
 *
 * `Intl.RelativeTimeFormat('ar')` gets the dual right but not the 3–10 plural,
 * and it is inconsistent across engines for the counted noun, so the four
 * Arabic number categories are spelled out here instead: one, two (dual),
 * a few (3–10, broken plural), and many (11+, accusative singular).
 */

interface Forms {
  /** 1 */
  one: string;
  /** 2 — the dual */
  two: string;
  /** 3–10 — takes the broken plural */
  few: string;
  /** 11+ — reverts to the singular, in the accusative */
  many: string;
}

const MINUTE: Forms = { one: 'دقيقة', two: 'دقيقتين', few: 'دقائق', many: 'دقيقة' };
const HOUR: Forms = { one: 'ساعة', two: 'ساعتين', few: 'ساعات', many: 'ساعة' };
const DAY: Forms = { one: 'يوم', two: 'يومين', few: 'أيام', many: 'يوماً' };

function counted(n: number, forms: Forms): string {
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  // The category is decided by the last two digits: 103 is "few", 111 is "many".
  const tail = n % 100;
  if (tail >= 3 && tail <= 10) return `${n} ${forms.few}`;
  return `${n} ${forms.many}`;
}

/** Absolute date once "قبل ٣٤ يوماً" stops being easier to read than the date. */
function absolute(date: Date): string {
  return date.toLocaleDateString('ar', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function relativeTimeAr(iso: string): string {
  const then = new Date(iso);
  const ms = then.getTime();
  if (Number.isNaN(ms)) return '';

  const mins = Math.floor((Date.now() - ms) / 60000);
  // A clock skew between the browser and the server must not print "in the future".
  if (mins < 1) return 'الآن';
  if (mins < 60) return `قبل ${counted(mins, MINUTE)}`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `قبل ${counted(hours, HOUR)}`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `قبل ${counted(days, DAY)}`;

  return absolute(then);
}

/**
 * A due date, phrased from the reader's side: overdue is the case that has to
 * stand out, so it is named rather than softened into "قبل يومين".
 */
export function dueLabelAr(iso: string): { text: string; overdue: boolean } {
  const due = new Date(iso);
  const ms = due.getTime();
  if (Number.isNaN(ms)) return { text: '', overdue: false };

  const diffDays = Math.round((ms - Date.now()) / 86400000);
  if (diffDays < 0) return { text: `متأخرة ${counted(Math.abs(diffDays), DAY)}`, overdue: true };
  if (diffDays === 0) return { text: 'تستحق اليوم', overdue: true };
  if (diffDays === 1) return { text: 'تستحق غداً', overdue: false };
  return { text: `تستحق بعد ${counted(diffDays, DAY)}`, overdue: false };
}
