import { dueLabelAr, relativeTimeAr } from './arabic-time';
import { resolveNotificationPath } from '../components/TasksBell';

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();
const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

describe('Arabic relative time', () => {
  test('uses the dual form, not a counted "2"', () => {
    expect(relativeTimeAr(minutesAgo(120))).toBe('قبل ساعتين');
    expect(relativeTimeAr(minutesAgo(2))).toBe('قبل دقيقتين');
    expect(relativeTimeAr(minutesAgo(60 * 24 * 2))).toBe('قبل يومين');
  });

  test('uses the broken plural for 3–10 and the singular past it', () => {
    expect(relativeTimeAr(minutesAgo(5))).toBe('قبل 5 دقائق');
    expect(relativeTimeAr(minutesAgo(60 * 5))).toBe('قبل 5 ساعات');
    expect(relativeTimeAr(minutesAgo(25))).toBe('قبل 25 دقيقة');
  });

  test('a fresh or slightly future timestamp never reads as negative', () => {
    expect(relativeTimeAr(new Date().toISOString())).toBe('الآن');
    // Clock skew between browser and server must not print "قبل -1 دقيقة".
    expect(relativeTimeAr(minutesAgo(-5))).toBe('الآن');
  });

  test('junk input degrades to empty rather than "Invalid Date"', () => {
    expect(relativeTimeAr('not a date')).toBe('');
  });
});

describe('due labels', () => {
  test('overdue is named, not softened', () => {
    const past = dueLabelAr(daysFromNow(-2));
    expect(past.overdue).toBe(true);
    expect(past.text).toBe('متأخرة يومين');
  });

  test('today counts as needing attention; tomorrow does not', () => {
    expect(dueLabelAr(daysFromNow(0))).toEqual({ text: 'تستحق اليوم', overdue: true });
    expect(dueLabelAr(daysFromNow(1))).toEqual({ text: 'تستحق غداً', overdue: false });
  });
});

describe('notification link resolution', () => {
  test('a path this dashboard actually has is followed', () => {
    expect(resolveNotificationPath('/cars')).toBe('/dashboard/cars');
    expect(resolveNotificationPath('/dashboard/kabis')).toBe('/dashboard/kabis');
  });

  test('a path TEAM does not have lands on the tasks page, not a dead route', () => {
    // The real case: links are written product-wide as /cars/{id}, and TEAM has
    // no per-car page — navigating there would bounce to the login redirect.
    expect(resolveNotificationPath('/cars/24')).toBe('/dashboard/tasks');
    expect(resolveNotificationPath('/reports/monthly')).toBe('/dashboard/tasks');
  });

  test('a missing link is not a crash', () => {
    expect(resolveNotificationPath(null)).toBe('/dashboard/tasks');
    expect(resolveNotificationPath(undefined)).toBe('/dashboard/tasks');
    expect(resolveNotificationPath('')).toBe('/dashboard/tasks');
  });
});
