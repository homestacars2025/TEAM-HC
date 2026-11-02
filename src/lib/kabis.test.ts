import { compareEntries, entryMatches, groupByBooking, insideIds, kabisDay } from './kabis';

let nextId = 1;
const entry = (o: Partial<Parameters<typeof insideIds>[0][number]> & { booking_number?: string | null } = {}) => ({
  id: nextId++, operation_date: '2026-11-01', created_at: '2026-11-01T09:00:00Z', booking_id: 1, booking_number: 'HOM-1', car_id: 1,
  action_type: 'delivery', status: 'checked_in', ...o,
});

describe('order', () => {
  const sorted = (rows: ReturnType<typeof entry>[]) => [...rows].sort(compareEntries).map(row => row.id);

  it('mixes check-ins and check-outs by date, which is what buried the check-outs', () => {
    const oldIn = entry({ operation_date: '2026-10-01' });
    const newOut = entry({ operation_date: '2026-11-02', action_type: 'pickup', status: 'checked_out' });
    const midIn = entry({ operation_date: '2026-10-20' });
    expect(sorted([oldIn, midIn, newOut])).toEqual([newOut.id, midIn.id, oldIn.id]);
  });

  it('puts pending first, however old', () => {
    const old = entry({ operation_date: '2026-01-01', status: 'pending' });
    const fresh = entry({ operation_date: '2026-11-02' });
    expect(sorted([fresh, old])).toEqual([old.id, fresh.id]);
  });

  it('breaks a date tie on when the row was created', () => {
    const first = entry({ created_at: '2026-11-01T08:00:00Z' });
    const second = entry({ created_at: '2026-11-01T10:00:00Z' });
    expect(sorted([first, second])).toEqual([second.id, first.id]);
  });

  it('falls back to the Istanbul day of creation', () => {
    expect(kabisDay({ operation_date: null, created_at: '2026-11-01T22:30:00Z' })).toBe('2026-11-02');
  });
});

describe('inside now', () => {
  const inside = (rows: ReturnType<typeof entry>[]) => Array.from(insideIds(rows));
  const out = (o = {}) => entry({ action_type: 'pickup', status: 'checked_out', operation_date: '2026-11-02', created_at: '2026-11-02T09:00:00Z', ...o });

  it('is a check-in with no check-out', () => {
    const open = entry();
    expect(inside([open])).toEqual([open.id]);
  });

  it('closes with a check-out on the same booking and car', () => {
    expect(inside([entry(), out()])).toEqual([]);
  });

  it('is not closed by the same car on an older booking', () => {
    const open = entry({ booking_id: 2, operation_date: '2026-11-03', created_at: '2026-11-03T09:00:00Z' });
    expect(inside([entry(), out(), open])).toEqual([open.id]);
  });

  it('only closes the car that came back when a booking used two', () => {
    const second = entry({ car_id: 2 });
    expect(inside([entry(), second, out()])).toEqual([second.id]);
  });

  it('is not closed by an earlier check-out on a re-delivery', () => {
    const again = entry({ operation_date: '2026-11-05', created_at: '2026-11-05T09:00:00Z' });
    expect(inside([entry(), out(), again])).toEqual([again.id]);
  });

  it('stays inside while the check-out is only pending', () => {
    const open = entry();
    expect(inside([open, out({ status: 'pending' })])).toEqual([open.id]);
  });

  it('never counts a pending check-in or a check-out row', () => {
    expect(inside([entry({ status: 'pending' })])).toEqual([]);
    expect(inside([out()])).toEqual([]);
  });
});

describe('group by booking', () => {
  it('holds a booking together, in the order it happened, keeping the list order between bookings', () => {
    const newest = entry({ booking_id: 2, booking_number: 'HOM-2', operation_date: '2026-11-03' });
    const out = entry({ action_type: 'pickup', status: 'checked_out', operation_date: '2026-11-02' });
    const inn = entry({ operation_date: '2026-10-01' });
    const groups = groupByBooking([newest, out, inn]);
    expect(groups.map(group => group.bookingNumber)).toEqual(['HOM-2', 'HOM-1']);
    expect(groups[1].entries.map(row => row.id)).toEqual([inn.id, out.id]);
  });

  it('leaves rows with no booking on their own', () => {
    const groups = groupByBooking([entry({ booking_id: null, booking_number: null }), entry({ booking_id: null, booking_number: null })]);
    expect(groups).toHaveLength(2);
  });
});

describe('search', () => {
  const row = { customer_name: 'Ali Kaya', customer_id_number: 'U123', booking_number: 'HOM-09-26-047', plate_number: '34GRN568' };

  it('finds a plate however it is spaced', () => {
    expect(entryMatches(row, '34 grn 568')).toBe(true);
    expect(entryMatches(row, 'grn')).toBe(true);
  });

  it('finds the other fields', () => {
    expect(entryMatches(row, 'ali')).toBe(true);
    expect(entryMatches(row, 'u123')).toBe(true);
    expect(entryMatches(row, '09-26-047')).toBe(true);
    expect(entryMatches(row, 'nobody')).toBe(false);
  });
});
