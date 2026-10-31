import fs from 'fs';
import path from 'path';
import i18n from '../i18n';
import { ringColor, ringShapes } from '../components/goals/ActivityRings';
import { gapLink } from '../components/goals/GoalSheet';
import {
  allGreen, firstOfMonth, formatGoalProgress, formatGoalValue, gapHints, performanceScore, ringFraction, ringLaps, scoreTone, shiftMonth,
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

describe('the second lap', () => {
  test('work beyond the target keeps going, as in 61 of 50', () => {
    expect(ringLaps(metric({ kind: 'count', numerator: 61, target: 50 }))).toBeCloseTo(1.22);
  });

  test('a percentage over its target laps too', () => {
    expect(ringLaps(metric({ value: 100, target: 80 }))).toBe(1.25);
  });

  test('stops at two laps, and is zero with nothing to measure', () => {
    expect(ringLaps(metric({ kind: 'count', numerator: 500, target: 50 }))).toBe(2);
    expect(ringLaps(metric({ value: null, status: 'none' }))).toBe(0);
    expect(ringLaps(metric({ target: 0 }))).toBe(0);
  });
});

describe('the overall score', () => {
  test('averages the ratios, each capped at 100%', () => {
    expect(performanceScore([
      metric({ kind: 'count', numerator: 61, target: 50, status: 'green' }),
      metric({ value: 50, target: 100, status: 'red' }),
    ])).toBe(75);
  });

  test('a metric with no data sits out instead of counting as zero', () => {
    expect(performanceScore([
      metric({ value: 80, target: 100, status: 'red' }),
      metric({ value: null, status: 'none' }),
    ])).toBe(80);
  });

  test('nothing measurable means no score, not 0%', () => {
    expect(performanceScore([metric({ value: null, status: 'none' })])).toBeNull();
    expect(performanceScore([])).toBeNull();
  });
});

describe('the score pill', () => {
  test('green at 100, amber from 80, red below', () => {
    expect([100, 99, 80, 79, 0].map(scoreTone)).toEqual(['green', 'amber', 'amber', 'red', 'red']);
  });
});

describe('ring geometry', () => {
  test('four rings leave a 22% hole with 3px between them', () => {
    const rings = ringShapes(240, 4);
    const inner = rings[3];
    expect(((inner.radius - inner.stroke / 2) * 2) / 240).toBeCloseTo(0.22);
    expect(rings[0].radius - rings[1].radius - rings[0].stroke).toBeCloseTo(3);
    expect(rings[0].radius + rings[0].stroke / 2).toBeCloseTo(120);
  });

  test('strokes stop growing at 11% with fewer rings, so the hole opens up instead', () => {
    expect(ringShapes(240, 2)[0].stroke).toBeCloseTo(26.4);
    expect(ringShapes(240, 1)[0].stroke).toBeCloseTo(26.4);
  });

  test('the legend dots use the ring start colours', () => {
    expect(['operations_count', 'delivery_docs', 'pickup_docs', 'custody_receipts'].map(ringColor))
      .toEqual(['#FA114F', '#78E40F', '#00C7E6', '#FF9500']);
  });
});

describe('legend values', () => {
  test('a count reads against its target, a percentage against its total', () => {
    expect(formatGoalProgress(metric({ kind: 'count', numerator: 61, target: 50 }))).toBe('61 / 50');
    expect(formatGoalProgress(metric({ numerator: 4, denominator: 16, value: 25 }))).toBe('4 / 16 (25%)');
    expect(formatGoalProgress(metric({ value: null, status: 'none' }))).toBe('—');
  });
});

describe('the hint line', () => {
  const gaps = [
    gap({ ref_id: 1, missing: ['customer_card', 'air_freshener'] }),
    gap({ ref_id: 2, missing: ['customer_card'] }),
    gap({ ref_id: 3, missing: ['customer_card', 'tutanak'] }),
    gap({ ref_id: 4, metric_key: 'custody_receipts', ref_type: 'custody', missing: ['receipt'] }),
  ];
  const delivery = metric({});
  const custody = metric({ metric_key: 'custody_receipts', status: 'amber' });

  test('names what is missing most often, per metric, whatever its status', () => {
    expect(gapHints([delivery, custody], gaps)).toEqual([
      { metricKey: 'delivery_docs', count: 3, item: 'customer_card' },
      { metricKey: 'custody_receipts', count: 1, item: 'receipt' },
    ]);
  });

  test('says nothing when nothing is missing', () => {
    expect(gapHints([delivery, custody], [])).toEqual([]);
  });

  test('reads like the brief in Arabic', () => {
    const t = i18n.getFixedT('ar', 'goals');
    expect(t('hint.delivery_docs', { count: 12, item: 'كرت العميل' })).toBe('12 تسليماً ناقصها كرت العميل');
    expect(t('hint.custody_receipts', { count: 1 })).toBe('مصروف بلا إيصال');
    expect(t('score')).toBe('أدائي');
    expect(t('statusShort.progress')).toBe('جارٍ');
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
    const files = ['GoalRing', 'GoalSheet', 'GoalsPanel', 'ActivityRings'].map(f => read(`components/goals/${f}.tsx`)).join('\n');
    const keys = Array.from(files.matchAll(/[^\w.]t\('([^']+)'/g)).map(m => m[1]).filter(k => !k.startsWith('hint.'));
    for (const lng of ['en', 'ar']) {
      expect(keys.filter(k => !i18n.exists(`goals:${k}`, { lng, fallbackLng: [] }))).toEqual([]);
    }
  });
});

test('performance lives on Home, beside the cards, not on Tasks', () => {
  const home = read('pages/HomePage.tsx');
  expect(home).toContain('<GoalsPanel onPresence={setShowsPerformance} />');
  expect(read('pages/TasksPage.tsx')).not.toMatch(/goals\/|GoalsPanel/);
  // First in the card grid, then the two cards it sits beside.
  expect(home.indexOf('<GoalsPanel')).toBeLessThan(home.indexOf('<StatCard\n'));
  expect(home.indexOf("title={t('cards.custody.title')}")).toBeLessThan(home.indexOf("title={t('cards.operations.title')}"));
});

test('goals are read through the RPCs only', () => {
  const source = read('lib/queries/goals.ts');
  expect(source).not.toMatch(/\.from\('/);
  expect(source).not.toContain('p_profile');
});
