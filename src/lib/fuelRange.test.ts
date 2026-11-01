import fs from 'fs';
import path from 'path';
import en from '../locales/en/common.json';
import ar from '../locales/ar/common.json';
import { formatFuelRange, fuelRangeProblem } from './fuelRange';
import { fmtFuel } from './printContract';

const read = (file: string) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(path.join(__dirname, '..', dir), { withFileTypes: true }).flatMap(entry => {
    const file = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(file);
    return /\.tsx?$/.test(entry.name) && !entry.name.includes('.test.') ? [file] : [];
  });
}

describe('fuel range', () => {
  test('optional unless a form requires it, and capped either way', () => {
    expect(fuelRangeProblem('')).toBeNull();
    expect(fuelRangeProblem('', true)).toBe('required');
    expect(fuelRangeProblem('  ', true)).toBe('required');
    expect(fuelRangeProblem('2001')).toBe('max');
  });

  test('0 is a real reading, and 2000 km is the limit', () => {
    expect(fuelRangeProblem('0', true)).toBeNull();
    expect(fuelRangeProblem('2000', true)).toBeNull();
  });

  test('one format, with thousands separators', () => {
    expect(formatFuelRange(280)).toBe('280 km');
    expect(formatFuelRange('280', 'كم')).toBe('280 كم');
    expect(formatFuelRange(1200)).toBe('1,200 km');
    expect(formatFuelRange(0)).toBe('0 km');
    expect(formatFuelRange(null)).toBe('—');
    expect(formatFuelRange('')).toBe('—');
  });

  test('contracts and replacement sheets print the same way', () => {
    expect(fmtFuel('280')).toBe('280 km');
    expect(fmtFuel('1200')).toBe('1,200 km');
    expect(fmtFuel(null)).toBe('—');
  });

  test('the words are as agreed, in both languages', () => {
    expect(en.fuelRange).toMatchObject({ label: 'Fuel range (km)', placeholder: 'e.g. 280', unit: 'km' });
    expect(ar.fuelRange).toMatchObject({ label: 'مدى الوقود (كم)', placeholder: 'مثلاً 280', unit: 'كم' });
  });

  test('one input, used by every form that records fuel', () => {
    expect(read('pages/BookingsPage.tsx').match(/<FuelRangeInput/g)).toHaveLength(2);
    expect(read('pages/OperationsPage.tsx').match(/<FuelRangeInput/g)).toHaveLength(1);
  });

  test('required on Operations only', () => {
    expect(read('pages/OperationsPage.tsx')).toContain('fuelRangeProblem(form.fuel_level, true)');
    expect(read('pages/BookingsPage.tsx')).not.toMatch(/fuelRangeProblem\([^)]*true\)/);
  });

  test('nothing treats fuel as a percentage or a fraction', () => {
    for (const file of [...sourceFiles('pages'), ...sourceFiles('components'), ...sourceFiles('lib')]) {
      const lines = read(file).split('\n').filter(line => /fuel/i.test(line));
      expect(lines.filter(line => /%|percent|slider|[¼½¾]|\b[13]\/[24]\b/i.test(line))).toEqual([]);
    }
  });
});
