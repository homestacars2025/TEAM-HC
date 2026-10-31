import fs from 'fs';
import path from 'path';
import i18n from '../i18n';
import { gapLink } from '../components/goals/GoalSheet';
import {
  allGreen, firstOfMonth, formatGoalValue, redHints, ringFraction, shiftMonth,
  type GoalGap, type GoalMetric,
} from './queries/goals';

const SRC = path.join(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(SRC, file), 'utf8');

const metric = (over: Partial<GoalMetric>): GoalMetric => ({
  metric_key: 'delivery_docs', label_en: 'Delivery', label_ar: 'تسليم', kind: 'percent',
  description_en: null, description_ar: null, target: 100, numerator: 12, denominator: 33,
  value: 36.4, status: 'red', sort_order: 1, ...over,
});

const gap = (over: Partial<GoalGap>): GoalGap => ({
  metric_key: 'delivery_docs', ref_type: 'operation', ref_id: 7, ref_date: '2026-10-12', plate: '34HZY380', missing: [], ...over,
});

describe('rings', () => {
  test('a percentage fills towards its target, not towards 100', () => {
    expect(ringFraction(metric({ value: 45, target: 90 }))).toBe(0.5);
  });

  test('a count fills from the number done', () => {
    expect(ringFraction(metric({ kind: 'count', numerator: 25, value: 25, target: 50 }))).toBe(0.5);
  });

  test('never overfills, and stays empty with no data or no target', () => {
    expect(ringFraction(metric({ kind: 'count', numerator: 80, target: 50 }))).toBe(1);
    expect(ringFraction(metric({ value: null, status: 'none' }))).toBe(0);
    expect(ringFraction(metric({ target: 0 }))).toBe(0);
  });

  test('the centre shows a count, a tidy percentage, or a dash', () => {
    expect(formatGoalValue(metric({ kind: 'count', numerator: 12 }))).toBe('12');
    expect(formatGoalValue(metric({ value: 92 }))).toBe('92%');
    expect(formatGoalValue(metric({ value: 36.36 }))).toBe('36.4%');
    expect(formatGoalValue(metric({ value: null }))).toBe('—');
  });
});

describe('the celebration', () => {
  test('needs every metric green, and at least one metric', () => {
    expect(allGreen([metric({ status: 'green' }), metric({ status: 'green' })])).toBe(true);
    expect(allGreen([metric({ status: 'green' }), metric({ status: 'none' })])).toBe(false);
    expect(allGreen([metric({ status: 'green' }), metric({ status: 'progress' })])).toBe(false);
    expect(allGreen([])).toBe(false);
  });
});

describe('the red hint', () => {
  const gaps = [
    gap({ ref_id: 1, missing: ['customer_card', 'air_freshener'] }),
    gap({ ref_id: 2, missing: ['customer_card'] }),
    gap({ ref_id: 3, missing: ['customer_card', 'tutanak'] }),
    gap({ ref_id: 4, metric_key: 'pickup_docs', missing: ['km'] }),
  ];

  test('names what is missing most often, within that metric only', () => {
    expect(redHints([metric({})], gaps)).toEqual([{ metricKey: 'delivery_docs', count: 3, item: 'customer_card' }]);
  });

  test('only red metrics get one', () => {
    expect(redHints([metric({ status: 'amber' }), metric({ status: 'green' })], gaps)).toEqual([]);
  });

  test('a red metric with no list still gets a line, with no item to name', () => {
    expect(redHints([metric({})], [])).toEqual([{ metricKey: 'delivery_docs', count: 0, item: null }]);
  });

  test('reads like the brief in Arabic', () => {
    const t = i18n.getFixedT('ar', 'goals');
    expect(t('hint.delivery_docs', { count: 3, item: 'كرت العميل' })).toBe('3 تسليمات ناقصها كرت العميل');
  });
});

describe('gap links', () => {
  const open = (...pages: string[]) => (page: string) => pages.includes(page);

  test('an operation opens in its own month', () => {
    expect(gapLink(gap({ ref_id: 9 }), open('operations'))).toBe('/dashboard/operations?op=9&month=2026-10');
  });

  test('a custody entry opens on the custody page', () => {
    expect(gapLink(gap({ ref_type: 'custody', ref_id: 4 }), open('custody'))).toBe('/dashboard/custody?entry=4');
  });

  test('no link for a page the person cannot open', () => {
    expect(gapLink(gap({}), open('custody'))).toBeNull();
    expect(gapLink(gap({ ref_type: 'custody' }), open('operations'))).toBeNull();
  });
});

describe('months', () => {
  test('moves across a year boundary either way', () => {
    expect(shiftMonth('2026-01-01', -1)).toBe('2025-12-01');
    expect(shiftMonth('2025-12-01', 1)).toBe('2026-01-01');
    expect(shiftMonth('2026-10-01', -11)).toBe('2025-11-01');
    expect(firstOfMonth('2026-10-31')).toBe('2026-10-01');
  });
});

describe('both languages', () => {
  const MISSING = [
    'customer_card', 'air_freshener', 'license', 'tutanak', 'km', 'fuel', 'receipt',
    'photos.front', 'photos.rear', 'photos.left_side', 'photos.right_side', 'photos.corner_1', 'photos.corner_2',
    'photos.corner_3', 'photos.corner_4', 'photos.dashboard', 'photos.odometer', 'photos.front_seats',
    'photos.rear_seats', 'photos.trunk',
  ];
  const STATUSES = ['green', 'amber', 'red', 'progress', 'none'];

  test.each(['en', 'ar'])('%s has every missing item and status', lng => {
    const has = (key: string) => i18n.exists(`goals:${key}`, { lng, fallbackLng: [] });
    expect([...MISSING.map(k => `missing.${k}`), ...STATUSES.map(s => `status.${s}`)].filter(k => !has(k))).toEqual([]);
  });

  test('every key the goals components ask for exists', () => {
    const files = ['GoalRing', 'GoalSheet', 'GoalsPanel'].map(f => read(`components/goals/${f}.tsx`)).join('\n');
    const keys = Array.from(files.matchAll(/[^\w.]t\('([^']+)'/g)).map(m => m[1]).filter(k => !k.startsWith('hint.'));
    for (const lng of ['en', 'ar']) {
      expect(keys.filter(k => !i18n.exists(`goals:${k}`, { lng, fallbackLng: [] }))).toEqual([]);
    }
  });
});

test('performance lives on Home, not on Tasks', () => {
  expect(read('pages/HomePage.tsx')).toContain('<GoalsPanel />');
  expect(read('pages/TasksPage.tsx')).not.toMatch(/goals\/|GoalsPanel/);
  // Directly under the greeting, above the stat cards.
  const home = read('pages/HomePage.tsx');
  expect(home.indexOf('<GoalsPanel />')).toBeGreaterThan(home.indexOf('</header>'));
  expect(home.indexOf('<GoalsPanel />')).toBeLessThan(home.indexOf('<StatCard\n'));
});

test('goals are read through the RPCs only', () => {
  const source = read('lib/queries/goals.ts');
  expect(source).not.toContain('.from(');
  expect(source).not.toContain('p_profile');
});
