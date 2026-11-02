import {
  bookingInFilter, bookingMatches, bookingTiles, extensionCsvRows, extensionMatches, extensionTiles, isActiveNow, isOpenSheet, readTab, sheetInMonth, sheetMatches, tripProgress, type BookingExtension,
} from './bookingTabs';

const TODAY = '2026-11-02';
const booking = (o = {}) => ({ status: 'confirmed', start_date: '2026-11-01', end_date: '2026-11-05', ...o });

describe('tabs', () => {
  it('falls back to Bookings', () => {
    expect(readTab('extensions')).toBe('extensions');
    expect(readTab('junk')).toBe('bookings');
    expect(readTab(null)).toBe('bookings');
  });
});

describe('bookings tab', () => {
  it('calls a confirmed booking active only between its dates', () => {
    expect(isActiveNow(booking(), TODAY)).toBe(true);
    expect(isActiveNow(booking({ start_date: '2026-11-03' }), TODAY)).toBe(false);
    expect(isActiveNow(booking({ end_date: '2026-11-01' }), TODAY)).toBe(false);
    expect(isActiveNow(booking({ status: 'completed' }), TODAY)).toBe(false);
  });

  it('counts the first and last day, and copes with timestamps', () => {
    expect(isActiveNow(booking({ start_date: TODAY, end_date: TODAY }), TODAY)).toBe(true);
    expect(isActiveNow(booking({ start_date: '2026-11-02T00:00:00+00:00', end_date: '2026-11-02T00:00:00+00:00' }), TODAY)).toBe(true);
  });

  it('counts each tile, and the filter agrees with it', () => {
    const rows = [booking(), booking({ status: 'completed' }), booking({ status: 'completed' }), booking({ start_date: '2026-11-20', end_date: '2026-11-22' }), booking({ status: 'pending' }), booking({ status: 'cancelled' })];
    const tiles = bookingTiles(rows, TODAY);
    expect(tiles).toEqual({ total: 6, confirmed: 2, activeNow: 1, pending: 1, completed: 2 });
    expect(rows.filter(row => bookingInFilter(row, 'confirmed'))).toHaveLength(tiles.confirmed);
    expect(rows.filter(row => bookingInFilter(row, 'pending'))).toHaveLength(tiles.pending);
    expect(rows.filter(row => bookingInFilter(row, 'completed'))).toHaveLength(tiles.completed);
    expect(rows.filter(row => bookingInFilter(row, 'all'))).toHaveLength(6);
  });

  it('measures how far along a trip is, and stays in range', () => {
    expect(tripProgress({ start_date: '2026-11-01', end_date: '2026-11-05' }, '2026-11-03')).toBe(0.5);
    expect(tripProgress({ start_date: '2026-11-05', end_date: '2026-11-06' }, TODAY)).toBe(0);
    expect(tripProgress({ start_date: '2026-10-01', end_date: '2026-10-02' }, TODAY)).toBe(1);
  });
});

const extension = (o: Partial<BookingExtension> = {}): BookingExtension => ({
  event_id: 1, booking_id: 1, booking_number: 'HOM-1', event_no: 1, period_start: '2026-11-02', period_end: '2026-11-12', days: 10, rental_amount: 1000, created_at: '2026-11-02T10:00:00Z', created_by_name: 'Sara',
  plate: '34GRN568', car_model: 'Corolla', customer_id: 'c', customer_name: 'Ali Kaya', booking_start: '2026-10-01', booking_end: '2026-11-12', booking_status: 'confirmed', is_legacy: false, ...o,
});

describe('extensions tab', () => {
  it('leaves undated rows out of the average, but not the value', () => {
    expect(extensionTiles([extension(), extension({ days: 20 }), extension({ days: null, period_start: null, period_end: null, rental_amount: 500.5 })])).toEqual({ count: 3, value: 2500.5, avgDays: 15, undated: 1, zero: 0 });
  });

  it('has no average with nothing dated', () => {
    expect(extensionTiles([extension({ days: null })]).avgDays).toBeNull();
    expect(extensionTiles([]).avgDays).toBeNull();
  });

  it('counts zero amounts', () => {
    expect(extensionTiles([extension({ rental_amount: 0 }), extension()]).zero).toBe(1);
  });

  it('searches the row', () => {
    expect(extensionMatches(extension(), 'ali')).toBe(true);
    expect(extensionMatches(extension(), '34 grn')).toBe(true);
    expect(extensionMatches(extension(), 'corolla')).toBe(true);
    expect(extensionMatches(extension(), 'hom-1')).toBe(true);
    expect(extensionMatches(extension(), 'zzz')).toBe(false);
  });

  it('exports an undated row as blanks', () => {
    const [head, row] = extensionCsvRows([extension({ period_start: null, period_end: null, days: null })]);
    expect(row).toHaveLength(head.length);
    expect(row[head.indexOf('Days')]).toBeNull();
  });
});

describe('replacements tab', () => {
  const sheet = { sheet_number: 'RS-1', customer_name: 'Ali Kaya', original_booking_number: 'HOM-1', original_plate: '34GRN568', replacement_plate: '34HZY380', start_date: '2026-10-28', end_date: '2026-11-02' };

  it('is open through its last day', () => {
    expect(isOpenSheet(sheet, TODAY)).toBe(true);
    expect(isOpenSheet(sheet, '2026-11-03')).toBe(false);
  });

  it('belongs to the month it started in', () => {
    expect(sheetInMonth(sheet, '2026-10')).toBe(true);
    expect(sheetInMonth(sheet, '2026-11')).toBe(false);
  });

  it('searches both plates', () => {
    expect(sheetMatches(sheet, '34 hzy')).toBe(true);
    expect(sheetMatches(sheet, 'grn')).toBe(true);
    expect(sheetMatches(sheet, 'rs-1')).toBe(true);
    expect(sheetMatches(sheet, 'zzz')).toBe(false);
  });
});

describe('search', () => {
  it('finds a booking by a spaced plate', () => {
    expect(bookingMatches({ booking_number: 'HOM-1', customer_name: 'Ali', plate_number: '34GRN568' }, '34 grn 568')).toBe(true);
  });
});
