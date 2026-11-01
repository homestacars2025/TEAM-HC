import fs from 'fs';
import path from 'path';
import { checkCar, summarise } from './carCompliance';

const TODAY = '2026-11-01';
const car = (id: number, plate: string, insuranceExpiry: string | null, inspectionExpiry: string | null) =>
  checkCar({ id, plate, model: 'Any', insuranceExpiry, inspectionExpiry }, TODAY);

describe('car compliance', () => {
  test('a car with two good dates has no issues', () => {
    expect(car(1, 'A', '2027-01-01', '2027-01-01')).toMatchObject({ issues: [], severity: null });
  });

  test('the expiry day itself is still valid, the next day is not', () => {
    expect(car(1, 'A', TODAY, TODAY).severity).toBeNull();
    expect(car(1, 'A', '2026-10-31', TODAY).issues).toEqual([{ field: 'insurance', kind: 'expired', daysAgo: 1 }]);
  });

  test('counts days across a month end', () => {
    expect(car(1, 'A', '2026-10-20', TODAY).issues[0].daysAgo).toBe(12);
  });

  test('no date is an issue, not a pass', () => {
    expect(car(1, 'A', '2027-01-01', null)).toMatchObject({
      severity: 'missing',
      issues: [{ field: 'inspection', kind: 'missing', daysAgo: 0 }],
    });
  });

  test('a car with no registration row has both dates missing', () => {
    expect(car(1, 'A', null, null).issues.map(issue => issue.field)).toEqual(['insurance', 'inspection']);
  });

  test('expired outranks missing on the same car, and it keeps both issues', () => {
    const both = car(1, 'A', '2026-01-01', null);
    expect(both.severity).toBe('expired');
    expect(both.issues).toHaveLength(2);
  });

  test('each car lands in one group: longest overdue first, then by plate', () => {
    const summary = summarise([
      car(1, 'Z', null, '2027-01-01'),
      car(2, 'B', '2026-10-20', TODAY),
      car(3, 'A', null, null),
      car(4, 'C', '2026-06-01', null),
      car(5, 'D', '2027-01-01', '2027-01-01'),
    ]);
    expect(summary.expired.map(c => c.plate)).toEqual(['C', 'B']);
    expect(summary.missing.map(c => c.plate)).toEqual(['A', 'Z']);
    expect(summary).toMatchObject({ count: 4, severity: 'expired' });
  });

  test('all clear', () => {
    expect(summarise([car(1, 'A', TODAY, TODAY)])).toMatchObject({ count: 0, severity: null });
  });

  test('only amber when nothing has expired', () => {
    expect(summarise([car(1, 'A', null, TODAY)]).severity).toBe('missing');
  });

  test('both triangles have both sizes, with real transparency', () => {
    for (const name of ['triangle-amber', 'triangle-red', 'triangle-amber@2x', 'triangle-red@2x']) {
      const bytes = fs.readFileSync(path.join(process.cwd(), 'public/illustrations/alerts', `${name}.webp`));
      expect(bytes.toString('latin1', 12, 16)).toBe('VP8X');
      expect(bytes[20] & 0x10).toBeTruthy();
    }
  });
});
