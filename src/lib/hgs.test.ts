import { barcodeProblem, carParam, carParamKey, formatCount, hasBarcode, hgsCsvName, hgsCsvRows, periodBounds, presetOf, presetRange, rangeLabel, rangedRow, readRange, readSort, hgsRowMatches, hgsRows, hgsTiles, idleRows, inPeriod, monthRange, sortHgsRows, transitDate, transitMonth, transitPlace, transitTime, type HgsCar, type HgsTransit } from './hgs';

const car = (id: number, plate: string, barcode: string | null, model: string | null = 'Fiat Egea'): HgsCar => ({ id, plate, barcode, model });
const CARS = [car(1, '34ABC100', '1129193640'), car(2, '34MDJ129', null, 'Renault Taliant'), car(3, '34MSR195', '  ', 'Citroen C4 X'), car(4, '06FHN975', '1131524991', 'Toyota Corolla'), car(5, '34ZZZ900', '1131498796')];
let next = 1;
const transit = (carId: number | null, date: string, amount: number, plate = 'X', road = 'public'): HgsTransit => ({ id: next++, car_id: carId, plate_number: plate, transit_datetime: `${date}T00:00:00+00:00`, amount, road_type: road });
const TRANSITS = [
  transit(1, '2026-10-02', 59), transit(1, '2026-11-03', 40, 'X', 'private'), transit(4, '2026-11-01', 100), transit(4, '2026-11-04', 49.5),
  transit(null, '2026-11-02', 12, '34 OLD 01'), transit(99, '2026-11-02', 8, '34GONE1'),
];

test('a blank or spaces-only barcode is no tag', () => {
  expect([hasBarcode(null), hasBarcode(''), hasBarcode('  '), hasBarcode('1129193640')]).toEqual([false, false, false, true]);
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

test('a portal transit keeps its Istanbul date and time of day', () => {
  // 23:40 in Istanbul is still the 31st there, though UTC is already past 20:00.
  expect(transitDate('2026-10-31T20:40:12+00:00')).toBe('2026-10-31');
  expect(transitTime('2026-10-31T20:40:12+00:00')).toBe('23:40');
  expect(transitDate('2026-10-31T21:05:00+00:00')).toBe('2026-11-01');
  expect(transitTime('2026-10-31T21:05:00+00:00')).toBe('00:05');
});

test('the place is entry → exit, and a "*" station is unknown', () => {
  const place = (entry: string | null, exit: string | null, otoyol: string | null = 'O-7') => transitPlace({ entry_location: entry, exit_location: exit, otoyol });
  expect(place('MAHMUTBEY', 'KINALI')).toBe('MAHMUTBEY → KINALI');
  expect(place('*', 'YAVUZ SULTAN SELİM KÖPRÜSÜ')).toBe('YAVUZ SULTAN SELİM KÖPRÜSÜ');
  expect(place('MAHMUTBEY', 'MAHMUTBEY')).toBe('MAHMUTBEY');
  expect(place('MAHMUTBEY', null)).toBe('MAHMUTBEY');
  expect(place('*', null)).toBe('O-7');
  expect(place(null, ' ', null)).toBe('—');
});

describe('rows', () => {
  const november = TRANSITS.filter(t => inPeriod(t, '2026-11'));
  const rows = hgsRows(CARS, november);
  const byPlate = Object.fromEntries(rows.map(r => [r.plate, r]));

  test('every active car, idle ones and ones with no barcode too', () => {
    expect(byPlate['34ZZZ900']).toMatchObject({ transits: 0, amount: 0, last: null, share: 0, active: true });
    expect(byPlate['34MDJ129']).toMatchObject({ transits: 0, barcode: null, active: true });
    expect(byPlate['34MSR195']).toMatchObject({ transits: 0, barcode: null, active: true });
  });

  test('the banner: active cars with no transit in the period, by plate; a sold car never', () => {
    expect(idleRows(rows).map(r => r.plate)).toEqual(['34MDJ129', '34MSR195', '34ZZZ900']);
    expect(idleRows(hgsRows(CARS, TRANSITS)).map(r => r.plate)).toEqual(['34MDJ129', '34MSR195', '34ZZZ900']);
    expect(idleRows(hgsRows(CARS, TRANSITS.filter(t => inPeriod(t, '2026-10')))).map(r => r.plate)).toEqual(['06FHN975', '34MDJ129', '34MSR195', '34ZZZ900']);
    expect(byPlate['34GONE1'].active).toBe(false);
  });

  test('private roads count like public ones, and the latest transit is kept', () => {
    expect(byPlate['34ABC100']).toMatchObject({ transits: 1, amount: 40 });
    expect(byPlate['06FHN975']).toMatchObject({ transits: 2, amount: 149.5, last: '2026-11-04T00:00:00+00:00', barcode: '1131524991', model: 'Toyota Corolla' });
  });

  test('a car that left the fleet still gets its row, so the rows add up', () => {
    expect(byPlate['34GONE1']).toMatchObject({ carId: 99, transits: 1, amount: 8, model: null, barcode: null });
    expect(byPlate['34 OLD 01']).toMatchObject({ carId: null, amount: 12 });
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(209.5);
    expect(rows.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1, 10);
  });

  test('sorts: amount, transits, last, then plate', () => {
    expect(sortHgsRows(rows, 'amount').map(r => r.plate)).toEqual(['06FHN975', '34ABC100', '34 OLD 01', '34GONE1', '34MDJ129', '34MSR195', '34ZZZ900']);
    expect(sortHgsRows(rows, 'transits').map(r => r.plate)[0]).toBe('06FHN975');
    expect(sortHgsRows(rows, 'last').map(r => r.plate)).toEqual(['06FHN975', '34ABC100', '34 OLD 01', '34GONE1', '34MDJ129', '34MSR195', '34ZZZ900']);
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
    expect(hgsTiles(CARS, TRANSITS, '2026-11', '2026-11')).toEqual({ spend: 209.5, transits: 5, used: 4, carsOnHgs: 5, idle: 3, thisMonth: 209.5, lastMonth: 59, delta: (209.5 - 59) / 59 });
  });
  test('all time adds every month; this month still means the calendar month', () => {
    expect(hgsTiles(CARS, TRANSITS, 'all', '2026-11')).toMatchObject({ spend: 268.5, transits: 6, idle: 3, thisMonth: 209.5 });
  });
  test('no last month: no percentage', () => {
    expect(hgsTiles(CARS, TRANSITS, '2026-10', '2026-10')).toMatchObject({ spend: 59, used: 1, idle: 4, lastMonth: 0, delta: null });
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

describe('a range of days', () => {
  test('the address holds two real days or none, turned around if needed', () => {
    expect(readRange('2026-11-01', '2026-11-06')).toEqual({ from: '2026-11-01', to: '2026-11-06' });
    expect(readRange('2026-11-06', '2026-11-01')).toEqual({ from: '2026-11-01', to: '2026-11-06' });
    expect([readRange('2026-11-01', null), readRange('2026-02-30', '2026-03-01'), readRange('2026-11', '2026-12'), readRange('x', 'y')]).toEqual([null, null, null, null]);
  });

  test('both ends count, on the Istanbul date', () => {
    const range = { from: '2026-11-01', to: '2026-11-06' };
    // 23:30 UTC on 31 Oct is 02:30 on 1 Nov in Istanbul.
    expect(inPeriod({ transit_datetime: '2026-10-31T23:30:00+00:00' }, range)).toBe(true);
    expect(inPeriod({ transit_datetime: '2026-11-06T20:59:00+00:00' }, range)).toBe(true);
    expect(inPeriod({ transit_datetime: '2026-11-06T21:00:00+00:00' }, range)).toBe(false);
    expect(periodBounds(range)).toEqual({ from: '2026-11-01T00:00:00+03:00', to: '2026-11-07T00:00:00+03:00' });
    expect(periodBounds('2026-11')).toEqual(monthRange('2026-11'));
    expect(periodBounds('all')).toBeNull();
  });

  test('presets, and the preset a range is', () => {
    const today = '2026-11-07';
    expect(presetRange('today', today)).toEqual({ from: today, to: today });
    expect(presetRange('last7', today)).toEqual({ from: '2026-11-01', to: today });
    expect(presetRange('thisMonth', today)).toEqual({ from: '2026-11-01', to: today });
    expect(presetRange('lastMonth', today)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(presetRange('lastMonth', '2026-03-15')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(presetRange('lastMonth', '2026-01-04')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    // On the 7th, the last seven days and this month are the same days: the first one wins.
    expect(presetOf({ from: '2026-11-01', to: today }, today)).toBe('last7');
    expect(presetOf({ from: '2026-10-01', to: '2026-10-31' }, today)).toBe('lastMonth');
    expect(presetOf({ from: '2026-10-02', to: '2026-10-31' }, today)).toBeNull();
    expect(presetOf(null, today)).toBeNull();
  });

  test('the chip reads day.month, with the year when it isn\'t this one', () => {
    expect(rangeLabel({ from: '2026-11-01', to: '2026-11-06' }, '2026-11-07')).toBe('01.11 → 06.11');
    expect(rangeLabel({ from: '2025-12-20', to: '2026-01-06' }, '2026-11-07')).toBe('20.12.25 → 06.01.26');
  });

  test('a car\'s own range: its numbers, and its share of the fleet in those days', () => {
    const rows = hgsRows(CARS, TRANSITS.filter(row => inPeriod(row, '2026-11')));
    const fhn = rows.find(row => row.carId === 4)!;
    const ranged = rangedRow(fhn, CARS, TRANSITS, { from: '2026-11-01', to: '2026-11-02' });
    // On 1–2 Nov: 06FHN975 100, the plate-only 34 OLD 01 12, the gone car 8.
    expect(ranged).toMatchObject({ key: fhn.key, transits: 1, amount: 100, active: true });
    expect(ranged.share).toBeCloseTo(100 / 120);
    expect(ranged.last).toBe('2026-11-01T00:00:00+00:00');
    const quiet = rangedRow(rows.find(row => row.carId === 2)!, CARS, TRANSITS, { from: '2026-11-01', to: '2026-11-02' });
    expect(quiet).toMatchObject({ transits: 0, amount: 0, last: null, share: 0, plate: '34MDJ129' });
  });

  test('the address names a car by id, or by plate when it has none', () => {
    expect(carParam({ carId: 4, plate: '06FHN975' })).toBe('4');
    expect(carParam({ carId: null, plate: '34 OLD 01' })).toBe('34OLD01');
    expect(carParamKey('4')).toBe('car:4');
    expect(carParamKey('34OLD01')).toBe('plate:34OLD01');
    const rows = hgsRows(CARS, TRANSITS);
    expect(rows.some(row => row.key === carParamKey(carParam({ carId: null, plate: '34 OLD 01' })))).toBe(true);
  });

  test('the export: Istanbul date and time, entry, exit, road, amount, oldest first', () => {
    const csv = hgsCsvRows([
      { transit_datetime: '2026-11-05T09:12:00+00:00', entry_location: 'Çamlıca', exit_location: '*', otoyol: 'Kuzey Marmara', amount: 61.5 },
      { transit_datetime: '2026-10-31T21:40:00+00:00', entry_location: '*', exit_location: 'FSM', otoyol: null, amount: 59 },
    ], ['Date', 'Time', 'Entry', 'Exit', 'Toll', 'Amount']);
    expect(csv).toEqual([
      ['Date', 'Time', 'Entry', 'Exit', 'Toll', 'Amount'],
      ['2026-11-01', '00:40', null, 'FSM', null, 59],
      ['2026-11-05', '12:12', 'Çamlıca', null, 'Kuzey Marmara', 61.5],
    ]);
    expect(hgsCsvName('34 ABC 123', { from: '2026-11-01', to: '2026-11-06' })).toBe('hgs-34ABC123-2026-11-01_2026-11-06');
    expect(hgsCsvName('34ABC123', '2026-02')).toBe('hgs-34ABC123-2026-02-01_2026-02-28');
    expect(hgsCsvName('34ABC123', 'all')).toBe('hgs-34ABC123-all');
  });

  test('the tiles follow a range like a month', () => {
    const tiles = hgsTiles(CARS, TRANSITS, { from: '2026-11-03', to: '2026-11-04' }, '2026-11');
    expect(tiles).toMatchObject({ transits: 2, spend: 89.5, used: 2 });
  });
});
