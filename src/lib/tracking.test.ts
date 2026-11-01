import { toCsv } from './csv';
import en from '../locales/en/tracking.json';
import ar from '../locales/ar/tracking.json';
import {
  addDays, dayStats, daysEnding, endOfDay, hasNoSignal, inLiveFilter, isFleetCar, isValidDay, liveStats, matchesSearch,
  oilStatus, relativeSignal, signalTone, sortCars, todayEntry, trackingOutage, type DayEntry, type TrackedCar,
} from './tracking';

const NOW = Date.parse('2026-11-01T12:00:00Z');
const ago = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();

const car = (o: Partial<TrackedCar> = {}): TrackedCar => ({
  id: 1, car_id: 1, plate: '34ABC123', model: 'Corolla', current_km: 10000, start_km: 9900, today_km: 100,
  next_oil_change: 15000, ignition: false, speed: 0, last_signal_at: ago(1), ...o,
});
const entry = (o: Partial<DayEntry> = {}): DayEntry => ({ car_id: 1, plate: '34ABC123', model: 'Corolla', start_km: 0, end_km: 100, km: 100, last_signal_at: ago(1), ...o });

describe('who counts as a car', () => {
  it('keeps every linked row and any unlinked row with a real plate', () => {
    expect(isFleetCar({ car_id: 5, plate_number: '860141076022806' })).toBe(true);
    expect(isFleetCar({ car_id: null, plate_number: '34MGM921' })).toBe(true);
    expect(isFleetCar({ car_id: null, plate_number: 'SÖK-34FDL046' })).toBe(true);
  });

  it('drops a device number with no car behind it', () => {
    expect(isFleetCar({ car_id: null, plate_number: '860141076022806' })).toBe(false);
  });
});

describe('days', () => {
  it('crosses a month', () => {
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });

  it('lists a window oldest first, ending on the day', () => {
    expect(daysEnding('2026-11-02', 3)).toEqual(['2026-10-31', '2026-11-01', '2026-11-02']);
  });

  it('ends a day at Istanbul midnight', () => {
    expect(new Date(endOfDay('2026-11-01')).toISOString()).toBe('2026-11-01T21:00:00.000Z');
  });

  it.each([['2026-11-01', true], ['2026-02-30', false], ['1-1-2026', false], ['', false], [null, false]])('%s valid: %s', (value, valid) => {
    expect(isValidDay(value)).toBe(valid);
  });
});

describe('signal', () => {
  it('turns amber after 6 hours and red after 24', () => {
    expect(signalTone(ago(6), NOW)).toBe('ok');
    expect(signalTone(ago(6.1), NOW)).toBe('amber');
    expect(signalTone(ago(24), NOW)).toBe('amber');
    expect(signalTone(ago(24.1), NOW)).toBe('red');
  });

  it('treats a car that never reported as silent', () => {
    expect(hasNoSignal(null, NOW)).toBe(true);
    expect(signalTone(null, NOW)).toBe('red');
  });

  it('counts a past day against the end of that day, not against today', () => {
    const lastHeard = '2026-10-20T20:00:00Z';
    expect(hasNoSignal(lastHeard, endOfDay('2026-10-20'))).toBe(false);
    expect(hasNoSignal(lastHeard, NOW)).toBe(true);
  });

  it('reads as time ago, and nothing under a minute', () => {
    expect(relativeSignal(ago(0.5), NOW, 'en-GB')).toBe('30 minutes ago');
    expect(relativeSignal(ago(3), NOW, 'en-GB')).toBe('3 hours ago');
    expect(relativeSignal(ago(72), NOW, 'en-GB')).toBe('3 days ago');
    expect(relativeSignal(ago(0.001), NOW, 'en-GB')).toBeNull();
  });
});

describe('oil', () => {
  const left = (remaining: number) => oilStatus({ current_km: 10000, next_oil_change: 10000 + remaining });

  it('is green above 1000, amber at 1000 and below, red from zero', () => {
    expect(left(1001)?.tone).toBe('green');
    expect(left(1000)?.tone).toBe('amber');
    expect(left(1)?.tone).toBe('amber');
    expect(left(0)?.tone).toBe('red');
    expect(left(-18)?.tone).toBe('red');
  });

  it('fills against the oil interval and never overflows', () => {
    expect(left(2500)?.fill).toBe(0.25);
    expect(left(10172)?.fill).toBe(1);
    expect(left(-18)?.fill).toBe(1);
  });

  it('says nothing without both numbers', () => {
    expect(oilStatus({ current_km: 10, next_oil_change: null })).toBeNull();
    expect(oilStatus({ current_km: null, next_oil_change: 10 })).toBeNull();
  });
});

describe('daily report', () => {
  it('counts each group with its distance', () => {
    const stats = dayStats([
      entry({ km: 600 }), entry({ km: 100 }), entry({ km: 0 }), entry({ km: 0, last_signal_at: ago(30) }),
    ], NOW);
    expect(stats.all).toEqual({ count: 4, km: 700 });
    expect(stats.moved).toEqual({ count: 2, km: 700 });
    expect(stats.idle.count).toBe(2);
    expect(stats.noSignal.count).toBe(1);
    expect(stats.over500).toEqual({ count: 1, km: 600 });
  });

  it('leaves exactly 500 km out of the over 500 group', () => {
    expect(dayStats([entry({ km: 500 })], NOW).over500.count).toBe(0);
  });

  it('builds today from the live row', () => {
    expect(todayEntry(car({ start_km: 900, current_km: 1000, today_km: 100 }))).toMatchObject({ start_km: 900, end_km: 1000, km: 100 });
  });
});

describe('live fleet', () => {
  it('does not call a silent car moving or running', () => {
    const stuck = car({ speed: 35, ignition: true, last_signal_at: ago(30) });
    expect(inLiveFilter(stuck, 'moving', NOW)).toBe(false);
    expect(inLiveFilter(stuck, 'ignition', NOW)).toBe(false);
    expect(inLiveFilter(car({ speed: 35, ignition: true }), 'moving', NOW)).toBe(true);
    expect(inLiveFilter(car({ speed: 35, ignition: true }), 'ignition', NOW)).toBe(true);
  });

  it('counts an overdue car as due as well', () => {
    const stats = liveStats([
      car({ next_oil_change: 10500 }), car({ next_oil_change: 9000 }), car({ next_oil_change: null }), car(),
    ], NOW);
    expect(stats).toMatchObject({ all: 4, oilDue: 2, oilOverdue: 1 });
  });

  it('searches plate and model', () => {
    expect(matchesSearch(car(), 'abc')).toBe(true);
    expect(matchesSearch(car(), 'corol')).toBe(true);
    expect(matchesSearch(car({ model: 'Renault Clio' }), 'CLIO')).toBe(true);
    expect(matchesSearch(car({ model: null }), 'corol')).toBe(false);
  });

  it('keeps blanks last in both directions', () => {
    const cars = [car({ id: 1, next_oil_change: null }), car({ id: 2, next_oil_change: 12000 }), car({ id: 3, next_oil_change: 11000 })];
    expect(sortCars(cars, 'remaining', 'asc').map(x => x.id)).toEqual([3, 2, 1]);
    expect(sortCars(cars, 'remaining', 'desc').map(x => x.id)).toEqual([2, 3, 1]);
  });
});

describe('tracking outage', () => {
  it('needs more than half the fleet silent', () => {
    const silent = car({ last_signal_at: ago(30) });
    expect(trackingOutage([silent, car()], NOW)).toBeNull();
    expect(trackingOutage([silent, silent, car()], NOW)).not.toBeNull();
  });

  it('names the newest signal in the fleet', () => {
    expect(trackingOutage([car({ last_signal_at: ago(30) }), car({ last_signal_at: ago(40) })], NOW)?.lastSignal).toBe(ago(30));
  });

  it('copes with a fleet that never reported, and an empty one', () => {
    expect(trackingOutage([car({ last_signal_at: null })], NOW)).toEqual({ lastSignal: null });
    expect(trackingOutage([], NOW)).toBeNull();
  });
});

describe('csv', () => {
  it('starts with a byte order mark so Excel reads Arabic', () => {
    expect(toCsv([['اليوم']]).charCodeAt(0)).toBe(0xFEFF);
  });

  it('quotes what needs it and keeps numbers plain', () => {
    expect(toCsv([['a,b', 'say "hi"', 12, null]]).slice(1)).toBe('"a,b","say ""hi""",12,\r\n');
  });

  it('never lets a cell run as a formula', () => {
    expect(toCsv([['=1+1', '-2']]).slice(1)).toBe("'=1+1,'-2\r\n");
    expect(toCsv([[-5]]).slice(1)).toBe('-5\r\n');
  });
});

describe('words', () => {
  const keys = (o: object, prefix = ''): string[] => Object.entries(o).flatMap(([key, value]) => (typeof value === 'object' ? keys(value, `${prefix}${key}.`) : [`${prefix}${key}`]));
  const base = (key: string) => key.replace(/_(zero|one|two|few|many|other)$/, '');

  it('has every word in both languages', () => {
    expect(new Set(keys(ar).map(base))).toEqual(new Set(keys(en).map(base)));
  });
});
