import i18n from '../i18n';
import { renderNotifText, dirOf } from './notifications/renderI18n';
import { formatDue, formatRelativeTime } from './relative-time';
import { resolveNotificationPath } from '../components/TasksBell';

/** The real instance, so a broken namespace registration fails these tests. */
const t = i18n.t.bind(i18n);
const exists = (k: string) => i18n.exists(k);
const render = (key: string | null, vars: Record<string, unknown> | null, fallback: string | null) =>
  renderNotifText(t, exists, key, vars, fallback);

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();
const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

/** The shape the server actually sends, verified against live rows. */
const INSURANCE_VARS = { plate: '34HZY380', car_id: '47', body_i18n_key: 'reminder.missing_insurance.body' };

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

describe('notification text rendering', () => {
  test('renders the key in the active language, not the stored Arabic', async () => {
    expect(render('reminder.missing_insurance.title', INSURANCE_VARS, 'ارفع ملف التأمين — 34HZY380'))
      .toBe('Upload insurance file — 34HZY380');

    await i18n.changeLanguage('ar');
    expect(render('reminder.missing_insurance.title', INSURANCE_VARS, 'stored wording'))
      .toBe('ارفع ملف التأمين — 34HZY380');
  });

  test('interpolates every variable the templates use', () => {
    expect(render('reminder.inspection_expiring.body', { plate: '34KAS055', date: '2026-09-14' }, null))
      .toBe('Inspection for car 34KAS055 expires on 2026-09-14.');
    expect(render('reminder.open_car_issues.title', { count: 3 }, null))
      .toBe('You have 3 car issue(s) to review');
  });

  test('an unknown key falls back to the server wording, never to the raw key', () => {
    // The case that matters: a dashboard deployed before a new reminder type.
    expect(render('reminder.brand_new_type.title', { plate: 'X' }, 'ارفع شي جديد'))
      .toBe('ارفع شي جديد');
  });

  test('a missing key or missing everything degrades quietly', () => {
    expect(render(null, null, 'stored wording')).toBe('stored wording');
    expect(render(null, null, null)).toBe('');
    expect(render('reminder.nope.title', null, null)).toBe('');
  });

  test('extra vars the template ignores are harmless', () => {
    // `vars` carries car_id and body_i18n_key alongside the ones used.
    expect(render('reminder.missing_insurance.title', INSURANCE_VARS, null))
      .toBe('Upload insurance file — 34HZY380');
  });
});

describe('direction follows the language', () => {
  test('english is ltr, arabic is rtl', () => {
    expect(dirOf({ language: 'en', resolvedLanguage: 'en' })).toBe('ltr');
    expect(dirOf({ language: 'ar', resolvedLanguage: 'ar' })).toBe('rtl');
  });

  test('a region-tagged or unknown tag still resolves', () => {
    expect(dirOf({ language: 'ar-SA', resolvedLanguage: 'ar-SA' })).toBe('rtl');
    expect(dirOf({ language: 'fr', resolvedLanguage: undefined })).toBe('ltr');
  });
});

describe('relative time', () => {
  test('english reads as english', () => {
    expect(formatRelativeTime(t, minutesAgo(120), 'en')).toBe('2h ago');
    expect(formatRelativeTime(t, new Date().toISOString(), 'en')).toBe('Just now');
  });

  test('arabic keeps the dual and the broken plural', async () => {
    await i18n.changeLanguage('ar');
    expect(formatRelativeTime(t, minutesAgo(120), 'ar')).toBe('قبل ساعتين');
    expect(formatRelativeTime(t, minutesAgo(2), 'ar')).toBe('قبل دقيقتين');
    expect(formatRelativeTime(t, minutesAgo(5), 'ar')).toBe('قبل 5 دقائق');
    expect(formatRelativeTime(t, minutesAgo(25), 'ar')).toBe('قبل 25 دقيقة');
  });

  test('clock skew never prints a negative count', () => {
    expect(formatRelativeTime(t, minutesAgo(-5), 'en')).toBe('Just now');
  });

  test('junk input degrades to empty rather than "Invalid Date"', () => {
    expect(formatRelativeTime(t, 'not a date', 'en')).toBe('');
    expect(formatDue(t, 'not a date')).toEqual({ text: '', overdue: false });
  });
});

describe('due labels', () => {
  test('overdue is named and flagged', () => {
    expect(formatDue(t, daysFromNow(-2))).toEqual({ text: '2 days overdue', overdue: true });
  });

  test('today needs attention; tomorrow does not', () => {
    expect(formatDue(t, daysFromNow(0))).toEqual({ text: 'Due today', overdue: true });
    expect(formatDue(t, daysFromNow(1))).toEqual({ text: 'Due tomorrow', overdue: false });
  });

  test('arabic uses the dual for two days', async () => {
    await i18n.changeLanguage('ar');
    expect(formatDue(t, daysFromNow(-2)).text).toBe('متأخرة يومين');
  });
});

describe('notification link resolution', () => {
  test('a path this dashboard actually has is followed', () => {
    expect(resolveNotificationPath('/cars')).toBe('/dashboard/cars');
    expect(resolveNotificationPath('/dashboard/kabis')).toBe('/dashboard/kabis');
  });

  test('a path TEAM does not have lands on the tasks page, not a dead route', () => {
    expect(resolveNotificationPath('/cars/24')).toBe('/dashboard/tasks');
    expect(resolveNotificationPath('/reports/monthly')).toBe('/dashboard/tasks');
  });

  test('a missing link is not a crash', () => {
    expect(resolveNotificationPath(null)).toBe('/dashboard/tasks');
    expect(resolveNotificationPath(undefined)).toBe('/dashboard/tasks');
    expect(resolveNotificationPath('')).toBe('/dashboard/tasks');
  });
});
