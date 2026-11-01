import fs from 'fs';
import path from 'path';
import i18n from '../../i18n';
import { isUnpaidFinesReminder, unpaidFinesWords } from './fines';

const reminder = (vars: Record<string, unknown>) => ({ event_key: 'fines.unpaid.reminder', vars });
const words = (language: string, vars: Record<string, unknown>) => unpaidFinesWords(
  reminder(vars),
  i18n.getFixedT(language, 'notifications') as unknown as (key: string, options: Record<string, unknown>) => string,
  language === 'ar' ? 'ar-u-nu-latn' : 'en-GB',
);
const plain = (text?: string) => text?.replace(/[⁦⁩]/g, '');

describe('unpaid fines reminder', () => {
  const vars = { count: 5, total: 48738, unassigned: 2, oldest: '2026-07-05' };

  test('reads as the one Arabic line', () => {
    expect(plain(words('ar', vars)?.title)).toBe('5 مخالفات غير مدفوعة — ₺48.738 · 2 غير مربوطة بعميل');
    expect(words('ar', vars)?.body).toContain('2026');
  });

  test('reads in English', () => {
    expect(plain(words('en', vars)?.title)).toBe('5 unpaid fines — ₺48.738 · 2 not linked to a customer');
    expect(words('en', vars)?.body).toBe('Oldest from 5 Jul 2026');
  });

  test('nothing about customers when every fine has one', () => {
    expect(plain(words('ar', { ...vars, unassigned: 0 })?.title)).toBe('5 مخالفات غير مدفوعة — ₺48.738');
  });

  test('Arabic counts agree with their noun', () => {
    expect(plain(words('ar', { ...vars, count: 1, unassigned: 0 })?.title)).toBe('مخالفة واحدة غير مدفوعة — ₺48.738');
    expect(plain(words('ar', { ...vars, count: 2, unassigned: 0 })?.title)).toBe('مخالفتان غير مدفوعتين — ₺48.738');
    expect(plain(words('ar', { ...vars, count: 12, unassigned: 0 })?.title)).toBe('12 مخالفة غير مدفوعة — ₺48.738');
  });

  test('no date, no second line', () => {
    expect(words('en', { ...vars, oldest: null })?.body).toBe('');
  });

  test('figures missing: the stored sentence is used instead', () => {
    expect(words('ar', { unassigned: 1 })).toBeNull();
    expect(unpaidFinesWords({ event_key: 'task.assigned', vars }, () => '', 'en-GB')).toBeNull();
    expect(isUnpaidFinesReminder({ event_key: 'task.assigned', vars: null })).toBe(false);
  });
});

describe('status and fine renders', () => {
  const dir = path.join(process.cwd(), 'public/illustrations');
  const files = ['total', 'working', 'parking', 'maintenance', 'selling', 'replacement']
    .flatMap(name => [`status/${name}`, `status/${name}@2x`])
    .concat('alerts/fine', 'alerts/fine@2x');

  test.each(files)('%s has real transparency', file => {
    const bytes = fs.readFileSync(path.join(dir, `${file}.webp`));
    expect(bytes.toString('latin1', 12, 16)).toBe('VP8X');
    expect(bytes[20] & 0x10).toBeTruthy();
  });
});
