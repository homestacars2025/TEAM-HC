import fs from 'fs';
import path from 'path';
import i18n from '../i18n';

/**
 * Arabic has six plural categories where English has two, and i18next falls
 * through to `fallbackLng` when the one it needs is absent — so a missing
 * `_many` does not throw or show the key, it quietly renders English. That is
 * how "50 سيارة" shipped as "50 cars" in the calendar's frozen-column header.
 *
 * This asserts the shape rather than the wording: every base key that exists in
 * a plural form must cover all six categories in Arabic.
 */

const AR_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;
const SUFFIX = /^(.*)_(zero|one|two|few|many|other)$/;

function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = `${prefix}${k}`;
    if (v && typeof v === 'object') Object.assign(out, flatten(v as Record<string, unknown>, `${key}.`));
    else out[key] = String(v);
  }
  return out;
}

const arDir = path.join(__dirname, '..', 'locales', 'ar');
const files = fs.readdirSync(arDir).filter(f => f.endsWith('.json'));

describe.each(files)('ar/%s', (file) => {
  const keys = flatten(JSON.parse(fs.readFileSync(path.join(arDir, file), 'utf8')));

  test('every plural key covers all six Arabic categories', () => {
    const bases = new Map<string, Set<string>>();
    for (const key of Object.keys(keys)) {
      const m = SUFFIX.exec(key);
      if (!m) continue;
      if (!bases.has(m[1])) bases.set(m[1], new Set());
      bases.get(m[1])!.add(m[2]);
    }
    const incomplete = [...bases.entries()]
      .map(([base, cats]) => [base, AR_CATEGORIES.filter(c => !cats.has(c))] as const)
      .filter(([, missing]) => missing.length > 0)
      .map(([base, missing]) => `${base} missing ${missing.join(',')}`);

    expect(incomplete).toEqual([]);
  });
});

test('a large count resolves in Arabic rather than falling back to English', async () => {
  await i18n.changeLanguage('ar');
  // 50 is the "many" category — the one the calendar header actually hit.
  expect(i18n.t('calendar:carCount', { count: 50 })).toBe('50 سيارة');
  expect(i18n.t('calendar:carCount', { count: 3 })).toBe('3 سيارات');
  expect(i18n.t('calendar:carCount', { count: 2 })).toBe('سيارتان');
  await i18n.changeLanguage('en');
  expect(i18n.t('calendar:carCount', { count: 50 })).toBe('50 cars');
  expect(i18n.t('calendar:carCount', { count: 1 })).toBe('1 car');
});
