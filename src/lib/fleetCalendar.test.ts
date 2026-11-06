import {
  barSpan, bookingBarStatus, daysBetween, eventTime, flaggedBookings, historySummary, inHistoryFilter, laneBars, monthBounds,
  parseStamp, readCarStatus, rentalDays, rowMatches, sortConflicts, sortHistory, statusCounts,
  type Conflict, type FleetBar, type FleetCar, type HistoryEvent,
} from './fleetCalendar';

const bar = (key: string, start: string, end: string, o: Partial<FleetBar> = {}): FleetBar => ({
  key, carId: 1, status: 'booked', start, end, bookingId: null, bookingNumber: null, customer: null, blockId: null, blockType: null, note: null, ...o,
});
const car = (id: number, status: FleetCar['status'], plate = `34ABC${id}`, model = 'Fiat Egea'): FleetCar => ({ id, plate, model, status });
const conflict = (o: Partial<Conflict>): Conflict => ({
  kind: 'missing_delivery', severity: 'medium', car_id: 1, plate: '34ABC1', booking_id: null, booking_number: null, other_ref: null, date_from: null, date_to: null, message: null, ...o,
});

test('months and days', () => {
  expect(monthBounds('2026-02')).toEqual({ first: '2026-02-01', last: '2026-02-28', days: 28 });
  expect(monthBounds('2026-11').days).toBe(30);
  expect(daysBetween('2026-10-30', '2026-11-02')).toBe(3);
  expect(rentalDays('2026-11-05', '2026-11-05')).toBe(1);
  expect(rentalDays('2026-11-01', '2026-11-04')).toBe(3);
});

test('a bar runs noon to noon, and is square where the month cuts it', () => {
  expect(barSpan(bar('a', '2026-11-03', '2026-11-06'), '2026-11')).toEqual({ from: 2.5, to: 5.5, clippedStart: false, clippedEnd: false });
  expect(barSpan(bar('b', '2026-10-20', '2026-11-02'), '2026-11')).toEqual({ from: 0, to: 1.5, clippedStart: true, clippedEnd: false });
  expect(barSpan(bar('c', '2026-11-28', '2026-12-04'), '2026-11')).toEqual({ from: 27.5, to: 30, clippedStart: false, clippedEnd: true });
  expect(barSpan(bar('d', '2026-11-10', '2026-11-10'), '2026-11')).toEqual({ from: 9.1, to: 9.9, clippedStart: false, clippedEnd: false });
  expect(barSpan(bar('e', '2026-09-01', '2026-10-31'), '2026-11')).toBeNull();
});

test('a return and the next pickup on the same day share a lane; an overlap gets its own', () => {
  const lanes = laneBars([bar('a', '2026-11-01', '2026-11-05'), bar('b', '2026-11-05', '2026-11-09'), bar('c', '2026-11-04', '2026-11-06')]);
  expect(Object.fromEntries(lanes.map(({ bar: b, lane }) => [b.key, lane]))).toEqual({ a: 0, b: 0, c: 1 });
  // A one-day bar on a changeover day can't sit under the noon ends.
  const day = laneBars([bar('a', '2026-11-01', '2026-11-05'), bar('x', '2026-11-05', '2026-11-05')]);
  expect(day.find(e => e.bar.key === 'x')?.lane).toBe(1);
});

test('statuses: a booking by its status, a car by car_availability', () => {
  expect(['confirmed', 'pending', 'completed', 'cancelled', null].map(bookingBarStatus)).toEqual(['booked', 'pending', 'completed', null, null]);
  expect(readCarStatus('pending')).toBe('pending');
  expect(readCarStatus('weird')).toBe('parking');
  expect(statusCounts([car(1, 'working'), car(2, 'working'), car(3, 'pending'), car(4, 'maintenance')]))
    .toEqual({ all: 4, working: 2, pending: 1, parking: 0, maintenance: 1, selling: 0, replacement: 0 });
});

test('search finds a plate with spaces, a model, or a customer in the month', () => {
  const c = car(1, 'working', '34HZY380', 'Toyota Corolla');
  const bars = [bar('a', '2026-11-01', '2026-11-03', { customer: 'Ahmet Yılmaz', bookingNumber: 'HOM-11-26-013' })];
  expect(['34 hzy', 'corolla', 'yılmaz', 'hom-11-26', ''].map(q => rowMatches(c, bars, q))).toEqual([true, true, true, true, true]);
  expect(rowMatches(c, bars, 'egea')).toBe(false);
});

test('conflicts: high first; a double booking outlines both bookings', () => {
  const rows = [
    conflict({ kind: 'not_closed', severity: 'low', plate: '34A1' }),
    conflict({ kind: 'double_booking', severity: 'high', plate: '34B2', booking_id: 10, other_ref: 'HOM-2' }),
    conflict({ kind: 'missing_pickup', severity: 'medium', plate: '34A1', booking_id: 11 }),
  ];
  expect(sortConflicts(rows).map(r => r.severity)).toEqual(['high', 'medium', 'low']);
  const bars = [bar('b:10', '2026-11-01', '2026-11-05', { bookingId: 10, bookingNumber: 'HOM-1' }), bar('b:20', '2026-11-03', '2026-11-06', { bookingId: 20, bookingNumber: 'HOM-2' })];
  expect([...flaggedBookings(rows, bars)].sort()).toEqual([10, 20]);
});

describe('car history', () => {
  const events: HistoryEvent[] = [
    { kind: 'booking', at: '2026-09-16', end: '2026-11-16', status: 'confirmed', title: 'HOM-09-26-022' },
    { kind: 'operation', at: '2026-11-05 12:37:26.168693+00', title: 'DELIVERY', km: 44467 },
    { kind: 'operation', at: '2026-09-08 08:19:35.51661+00', title: 'PICKUP', km: 42979 },
    { kind: 'booking', at: '2025-12-28', end: '2026-01-03', status: 'completed', title: 'HOM-12-25-001' },
    { kind: 'booking', at: '2026-03-01', end: '2026-03-05', status: 'cancelled', title: 'HOM-03-26-001' },
    { kind: 'fine', at: '2026-10-02', amount: 994 },
    { kind: 'issue', at: '2026-10-10', status: 'open' },
    { kind: 'car_change', at: '2026-10-11 09:00:00+00', from_car: '34A', to_car: '34B' },
  ];

  it('parses Postgres stamps, microseconds and a bare +00 included', () => {
    expect(parseStamp('2026-11-05 12:37:26.168693+00')?.toISOString()).toBe('2026-11-05T12:37:26.168Z');
    expect(parseStamp('2026-09-08')?.toISOString()).toBe('2026-09-07T21:00:00.000Z');
    expect(parseStamp('nonsense')).toBeNull();
    expect(eventTime(null)).toBe(0);
  });

  it('sorts newest first whatever the shape', () => {
    expect(sortHistory(events).map(e => e.at.slice(0, 10))).toEqual(['2026-11-05', '2026-10-11', '2026-10-10', '2026-10-02', '2026-09-16', '2026-09-08', '2026-03-01', '2025-12-28']);
  });

  it('filters by group', () => {
    expect(events.filter(e => inHistoryFilter(e, 'bookings')).map(e => e.kind)).toEqual(['booking', 'booking', 'booking', 'car_change']);
    expect(events.filter(e => inHistoryFilter(e, 'operations')).length).toBe(2);
    expect(events.filter(e => inHistoryFilter(e, 'fines')).length).toBe(1);
    expect(events.filter(e => inHistoryFilter(e, 'all')).length).toBe(events.length);
  });

  it('sums up: bookings not cancelled, days rented this year, latest km', () => {
    // 16 Sept → 16 Nov is 61 days, and the booking from last year adds 1 → 3 Jan.
    expect(historySummary(events, 2026)).toEqual({ bookings: 2, daysThisYear: 61 + 2, km: 44467 });
  });
});
