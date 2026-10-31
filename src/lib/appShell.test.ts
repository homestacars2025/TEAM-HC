import fs from 'fs';
import path from 'path';
import i18n from '../i18n';
import { dayPart, istanbulDate, istanbulHour } from './istanbulTime';
import { buildSchedule, countTasks } from './queries/schedule';
import { fold, likeValue, matchCars } from './queries/search';
import { custodyBalance, custodyTotals, withRunningCustody, type CustodyMovement } from './queries/custody';
import { signedAmount, walletBalance, walletTotals, withRunningBalance, type EntryType, type WalletEntry } from './queries/staffWallet';
import { readUserSettings, writeUserSettings, type UserSettings } from './userSettings';
import type { MyTask } from './types/tasks';

const SRC = path.join(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(SRC, file), 'utf8');

describe('Istanbul time', () => {
  test('the business day turns over at Istanbul midnight, not UTC', () => {
    expect(istanbulDate(new Date('2026-10-31T20:59:00Z'))).toBe('2026-10-31');
    expect(istanbulDate(new Date('2026-10-31T21:00:00Z'))).toBe('2026-11-01');
    expect(istanbulHour(new Date('2026-10-31T21:00:00Z'))).toBe(0);
  });

  test('the greeting changes at 5, 12 and 18', () => {
    expect([4, 5, 11, 12, 17, 18, 23].map(dayPart)).toEqual([
      'evening', 'morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening',
    ]);
  });
});

describe('task counts', () => {
  const now = new Date('2026-10-31T09:00:00Z');
  const task = (due_at: string | null) => ({ due_at } as MyTask);

  test('a task with no due date is today\'s and is never overdue', () => {
    expect(countTasks([task(null), task(null)], now)).toEqual({ today: 2, overdue: 0 });
  });

  test('later today counts, yesterday is overdue, tomorrow waits', () => {
    expect(countTasks([
      task('2026-10-31T18:00:00Z'),
      task('2026-10-30T18:00:00Z'),
      task('2026-11-02T09:00:00Z'),
    ], now)).toEqual({ today: 2, overdue: 1 });
  });
});

describe("today's schedule", () => {
  const today = '2026-10-31';
  const booking = (id: number, start_date: string, end_date: string) => ({
    id, start_date, end_date,
    cars: { plate_number: `34 ${id}` },
    customers: [{ first_name: 'Ali', last_name: 'Kaya' }],
  });

  test('a same-day rental is a delivery and a pickup', () => {
    const items = buildSchedule([booking(1, today, today)], [], today);
    expect(items.map(i => i.kind).sort()).toEqual(['delivery', 'pickup']);
  });

  test('only the logged operation gives a row its time, and timed rows come first', () => {
    const items = buildSchedule(
      [booking(1, today, '2026-11-02'), booking(2, '2026-10-20', today), booking(3, today, '2026-11-05')],
      [
        { booking_id: 2, type: 'PICKUP', operation_time: '14:30:00' },
        { booking_id: 3, type: 'DELIVERY', operation_time: '09:05:00' },
        { booking_id: 1, type: 'PICKUP', operation_time: '08:00:00' },
      ],
      today,
    );
    expect(items.map(i => [i.key, i.time])).toEqual([
      ['3:delivery', '09:05'],
      ['2:pickup', '14:30'],
      ['1:delivery', null],
    ]);
    expect(items[0].customer).toBe('Ali Kaya');
    expect(items[0].plate).toBe('34 3');
  });
});

describe('custody arithmetic', () => {
  const move = (id: number, transaction_date: string, direction: 'IN' | 'OUT', amount: number): CustodyMovement => ({
    id, transaction_date, direction, amount, category: null, description: null, receipt_url: null,
  });
  const rows = [
    move(1, '2026-09-30', 'IN', 1000),
    move(2, '2026-10-02', 'OUT', 250.5),
    move(3, '2026-10-03', 'IN', 100),
    move(4, '2026-10-05', 'OUT', 900),
  ];

  test('each row carries the balance straight after it, and it can go negative', () => {
    expect(withRunningCustody(rows).map(r => r.running)).toEqual([1000, 749.5, 849.5, -50.5]);
  });

  test('totals follow the period but the balance never does', () => {
    expect(custodyTotals(rows)).toEqual({ received: 1100, spent: 1150.5 });
    expect(custodyTotals(rows, '2026-10')).toEqual({ received: 100, spent: 1150.5 });
    expect(custodyBalance(rows)).toBe(-50.5);
  });
});

describe('My wallet arithmetic', () => {
  const entry = (id: number, entry_type: EntryType, amount: number, month: string): WalletEntry => ({
    id, entry_type, amount, month, note: null, receipt_url: null, created_at: '2026-10-01T09:00:00Z',
  });
  const rows = [
    entry(1, 'salary', 30000, '2026-09-01'),
    entry(2, 'payout', 30000, '2026-09-01'),
    entry(3, 'salary', 30000, '2026-10-01'),
    entry(4, 'bonus', 2000, '2026-10-01'),
    entry(5, 'advance', 5000, '2026-10-01'),
    entry(6, 'deduction', 500, '2026-10-01'),
    entry(7, 'payout', 10000, '2026-10-01'),
  ];

  test('salary and bonus add, everything else takes away', () => {
    expect((['salary', 'bonus', 'advance', 'deduction', 'payout'] as EntryType[]).map(t => signedAmount({ entry_type: t, amount: 10 })))
      .toEqual([10, 10, -10, -10, -10]);
  });

  test('the balance is what the company still owes, the same sum as the view', () => {
    expect(withRunningBalance(rows).map(r => r.running)).toEqual([30000, 0, 30000, 32000, 27000, 26500, 16500]);
    expect(walletBalance(rows)).toBe(16500);
  });

  test('earned and paid follow the pay month; an advance is not counted as paid', () => {
    expect(walletTotals(rows, '2026-10')).toEqual({ earned: 32000, paid: 10000 });
    expect(walletTotals(rows)).toEqual({ earned: 62000, paid: 40000 });
  });
});

describe('search', () => {
  test('a search cannot break out of the or filter or widen the match', () => {
    expect(likeValue('a,b(c)')).toBe('"%a,b(c)%"');
    expect(likeValue('x"%_*\\y')).toBe('"%xy%"');
  });

  test('Turkish letters and case compare equal', () => {
    expect(fold('ŞÜKRÜ GÜNEŞ')).toBe(fold('sukru gunes'));
    expect(fold('Yılmaz')).toBe(fold('YILMAZ'));
    expect(fold('İPEK')).toBe(fold('ipek'));
  });

  test('cars match on plate and model, in any order', () => {
    const fleet = [
      { id: 1, plate: '34HZY380', model: 'Toyota Corolla' },
      { id: 2, plate: '34ABC111', model: 'Renault Clio' },
    ];
    expect(matchCars(fleet, 'corolla 34h').map(c => c.id)).toEqual([1]);
    expect(matchCars(fleet, 'abc').map(c => c.id)).toEqual([2]);
    expect(matchCars(fleet, 'zzz')).toEqual([]);
  });
});

describe('settings', () => {
  const fallback: UserSettings = { lang: 'en', currency: 'TRY', notificationSound: false, startCollapsed: false };

  beforeEach(() => localStorage.clear());

  test('each person on a shared computer keeps their own', () => {
    writeUserSettings('a', { lang: 'ar', currency: 'USD', notificationSound: true, startCollapsed: true });
    expect(readUserSettings('a', fallback).lang).toBe('ar');
    expect(readUserSettings('b', fallback)).toEqual(fallback);
  });

  test('a corrupt or partly valid record falls back field by field', () => {
    localStorage.setItem('hc_settings_a', 'not json');
    expect(readUserSettings('a', fallback)).toEqual(fallback);
    localStorage.setItem('hc_settings_a', JSON.stringify({ lang: 'fr', currency: 'USD', notificationSound: 'yes' }));
    expect(readUserSettings('a', fallback)).toEqual({ ...fallback, currency: 'USD' });
  });
});

describe('the shell', () => {
  test('the sidebar holds nothing personal', () => {
    const sidebar = read('components/Sidebar.tsx');
    for (const gone of ['signOut', 'useCurrency', 'StaffAvatar', 'setLang', 'supabase']) expect(sidebar).not.toContain(gone);
    expect(sidebar).toContain("HIDDEN_GROUPS = ['account']");
  });

  test.each(['home', 'wallet', 'custody', 'profile', 'settings'])('/dashboard/%s is behind the page guard', page => {
    expect(read('App.tsx')).toMatch(new RegExp(`path="${page}" element={<RequirePage page="${page}">`));
  });

  test('custody only ever asks for the signed-in employee\'s rows', () => {
    const source = read('lib/queries/custody.ts');
    expect(source.match(/\.from\('employee_wallet/g)).toHaveLength(2);
    expect(source.match(/\.eq\('employee_id', userId\)/g)).toHaveLength(2);
    // Read-only: nothing here or on the page can write.
    expect(source + read('pages/CustodyPage.tsx')).not.toMatch(/\.(insert|update|upsert|delete)\(/);
  });

  test('My wallet names the person on every read, because RLS lets an admin see everyone', () => {
    const source = read('lib/queries/staffWallet.ts');
    expect(source.match(/\.from\('staff_/g)).toHaveLength(3);
    expect(source.match(/\.eq\('profile_id', userId\)/g)).toHaveLength(3);
    expect(source).toContain(".is('voided_at', null)");
    expect(source + read('pages/WalletPage.tsx')).not.toMatch(/\.(insert|update|upsert|delete)\(/);
  });

  test.each(['pages/WalletPage.tsx', 'pages/CustodyPage.tsx', 'components/AccountMenu.tsx', 'pages/HomePage.tsx'])(
    '%s shows lira whatever the currency selector says',
    file => {
      expect(read(file)).not.toContain('useCurrency');
      expect(read(file)).toContain('formatTRY');
    },
  );

  test('every staff picture goes through the shared avatar', () => {
    for (const file of ['components/AccountMenu.tsx', 'pages/ProfilePage.tsx']) {
      expect(read(file)).toContain('<StaffAvatar');
      expect(read(file)).not.toMatch(/src=\{[^}]*avatar_url/);
    }
  });
});

describe('every string in the shell exists in both languages', () => {
  const FILES: [string, string, string][] = [
    ['components/CommandPalette.tsx', 't', 'shell'],
    ['components/TopBar.tsx', 't', 'shell'],
    ['components/AccountMenu.tsx', 't', 'shell'],
    ['pages/HomePage.tsx', 't', 'home'],
    ['pages/WalletPage.tsx', 't', 'myWallet'],
    ['pages/CustodyPage.tsx', 't', 'custody'],
    ['pages/ProfilePage.tsx', 't', 'profile'],
    ['pages/SettingsPage.tsx', 't', 'settings'],
  ];
  const TEMPLATED: Record<string, string[]> = {
    shell: ['search.groups.pages', 'search.groups.cars', 'search.groups.bookings', 'search.groups.customers'],
    home: ['greeting.morning', 'greeting.afternoon', 'greeting.evening', 'greetingPlain.morning', 'greetingPlain.afternoon', 'greetingPlain.evening', 'schedule.delivery', 'schedule.pickup'],
    myWallet: ['period.month', 'period.all', 'type.salary', 'type.bonus', 'type.advance', 'type.deduction', 'type.payout', 'earned.month', 'earned.all', 'paid.month', 'paid.all'],
    custody: ['period.month', 'period.all'],
    profile: ['gender.male', 'gender.female'],
    settings: [],
  };

  const keysIn = (file: string) => Array.from(read(file).matchAll(/[^\w.]t\('([^']+)'/g)).map(m => m[1]);
  const present = (ns: string, key: string, lng: string) =>
    i18n.exists(`${ns}:${key}`, { lng, fallbackLng: [] }) || i18n.exists(`${ns}:${key}_other`, { lng, fallbackLng: [] });

  test.each(['en', 'ar'])('%s', lng => {
    const missing = FILES.flatMap(([file, , ns]) => [...keysIn(file), ...TEMPLATED[ns]].filter(key => !present(ns, key, lng)).map(key => `${ns}:${key}`));
    expect(missing).toEqual([]);
  });

  test('the Arabic files are actually Arabic', () => {
    const arabic = /[؀-ۿ]/;
    for (const ns of ['shell', 'home', 'myWallet', 'custody', 'profile', 'settings']) {
      const values = JSON.stringify(require(`../locales/ar/${ns}.json`));
      expect(arabic.test(values)).toBe(true);
    }
    expect(i18n.getFixedT('ar', 'home')('summary.tasks', { count: 3 })).toBe('3 مهام مستحقة');
    expect(i18n.getFixedT('ar', 'home')('greeting.morning', { name: 'سارة' })).toBe('صباح الخير، سارة 👋');
  });
});
