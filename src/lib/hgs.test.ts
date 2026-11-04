import { barcodeProblem, formatCount, hasBarcode, readSort, hgsRowMatches, hgsRows, hgsTiles, inPeriod, missingHgs, monthRange, sortHgsRows, transitMonth, type HgsCar, type HgsTransit } from './hgs';

const car = (id: number, plate: string, barcode: string | null, model: string | null = 'Fiat Egea'): HgsCar => ({ id, plate, barcode, model });
const CARS = [car(1, '34ABC100', '1129193640'), car(2, '34MDJ129', null, 'Renault Taliant'), car(3, '34MSR195', '  ', 'Citroen C4 X'), car(4, '06FHN975', '1131524991', 'Toyota Corolla'), car(5, '34ZZZ900', '1131498796')];
let next = 1;
const transit = (carId: number | null, date: string, amount: number, plate = 'X', record = 'settled'): HgsTransit => ({ id: next++, car_id: carId, plate_number: plate, transit_datetime: `${date}T00:00:00+00:00`, amount, record_type: record });
const TRANSITS = [
  transit(1, '2026-10-02', 59), transit(1, '2026-11-03', 40, 'X', 'pending'), transit(4, '2026-11-01', 100), transit(4, '2026-11-04', 49.5),
  transit(null, '2026-11-02', 12, '34 OLD 01'), transit(99, '2026-11-02', 8, '34GONE1'),
];

test('a blank or spaces-only barcode is no tag', () => {
  expect([hasBarcode(null), hasBarcode(''), hasBarcode('  '), hasBarcode('1129193640')]).toEqual([false, false, false, true]);
});

test('the banner lists active cars with no tag, by plate', () => {
  expect(missingHgs(CARS).map(c => c.plate)).toEqual(['34MDJ129', '34MSR195']);
});

test('a barcode is ten digits; spaces typed in between are fine', () => {
  expect([barcodeProblem(''), barcodeProblem('  '), barcodeProblem('12345'), barcodeProblem('11291936401'), barcodeProblem('11291936AB'), barcodeProblem('1129 193 640')]).toEqual(['empty', 'empty', 'format', 'format', 'format', null]);
});

test('a transit belongs to its Istanbul month', () => {
  expect(transitMonth('2026-11-01T00:00:00+00:00')).toBe('2026-11');
  expect(transitMonth('2026-10-31T22:30:00+00:00')).toBe('2026-11');
  expect(inPeriod({ transit_datetime: '2026-10-02T00:00:00+00:00' }, '2026-11')).toBe(false);
  expect(inPeriod({ transit_datetime: '2026-10-02T00:00:00+00:00' }, 'all')).toBe(true);
});

describe('rows', () => {
  const november = TRANSITS.filter(t => inPeriod(t, '2026-11'));
  const rows = hgsRows(CARS, november);
  const byPlate = Object.fromEntries(rows.map(r => [r.plate, r]));

  test('every car on HGS, idle ones too, never one without a tag', () => {
    expect(byPlate['34ZZZ900']).toMatchObject({ transits: 0, amount: 0, last: null, share: 0 });
    expect(byPlate['34MDJ129']).toBeUndefined();
    expect(byPlate['34MSR195']).toBeUndefined();
  });

  test('pending counts like settled, and the latest date is kept', () => {
    expect(byPlate['34ABC100']).toMatchObject({ transits: 1, amount: 40, pending: 1 });
    expect(byPlate['06FHN975'].pending).toBe(0);
    expect(byPlate['06FHN975']).toMatchObject({ transits: 2, amount: 149.5, last: '2026-11-04T00:00:00+00:00', barcode: '1131524991', model: 'Toyota Corolla' });
  });

  test('a car that left the fleet still gets its row, so the rows add up', () => {
    expect(byPlate['34GONE1']).toMatchObject({ carId: 99, transits: 1, amount: 8, model: null, barcode: null });
    expect(byPlate['34 OLD 01']).toMatchObject({ carId: null, amount: 12 });
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(209.5);
    expect(rows.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1, 10);
  });

  test('sorts: amount, transits, last, then plate', () => {
    expect(sortHgsRows(rows, 'amount').map(r => r.plate)).toEqual(['06FHN975', '34ABC100', '34 OLD 01', '34GONE1', '34ZZZ900']);
    expect(sortHgsRows(rows, 'transits').map(r => r.plate)[0]).toBe('06FHN975');
    expect(sortHgsRows(rows, 'last').map(r => r.plate)).toEqual(['06FHN975', '34ABC100', '34 OLD 01', '34GONE1', '34ZZZ900']);
  });

  test('search by plate with spaces, barcode or model', () => {
    expect(rows.filter(r => hgsRowMatches(r, '06 fhn')).map(r => r.plate)).toEqual(['06FHN975']);
    expect(rows.filter(r => hgsRowMatches(r, '1131524')).map(r => r.plate)).toEqual(['06FHN975']);
    expect(rows.filter(r => hgsRowMatches(r, 'corolla')).map(r => r.plate)).toEqual(['06FHN975']);
    expect(rows.filter(r => hgsRowMatches(r, '  ')).length).toBe(rows.length);
  });
});

describe('tiles', () => {
  test('follow the month, with this month against last', () => {
    expect(hgsTiles(CARS, TRANSITS, '2026-11', '2026-11')).toEqual({ spend: 209.5, transits: 5, used: 4, carsOnHgs: 3, idle: 1, thisMonth: 209.5, lastMonth: 59, delta: (209.5 - 59) / 59 });
  });
  test('all time adds every month; this month still means the calendar month', () => {
    expect(hgsTiles(CARS, TRANSITS, 'all', '2026-11')).toMatchObject({ spend: 268.5, transits: 6, idle: 1, thisMonth: 209.5 });
  });
  test('no last month: no percentage', () => {
    expect(hgsTiles(CARS, TRANSITS, '2026-10', '2026-10')).toMatchObject({ spend: 59, used: 1, idle: 2, lastMonth: 0, delta: null });
  });
  test('money is rounded to the kuruş', () => {
    expect(hgsTiles(CARS, [transit(1, '2026-11-01', 0.1), transit(1, '2026-11-01', 0.2)], 'all', '2026-11').spend).toBe(0.3);
  });
});

test('sort comes from the address, amount when it says nothing sensible', () => {
  expect([readSort(null), readSort('transits'), readSort('last'), readSort('nonsense')]).toEqual(['amount', 'transits', 'last', 'amount']);
});

test('counts are grouped like the lira beside them', () => {
  expect([formatCount(9), formatCount(3132), formatCount(1250000)]).toEqual(['9', '3.132', '1.250.000']);
});

test('a month range is Istanbul midnight to midnight', () => {
  expect(monthRange('2026-12')).toEqual({ from: '2026-12-01T00:00:00+03:00', to: '2027-01-01T00:00:00+03:00' });
});
