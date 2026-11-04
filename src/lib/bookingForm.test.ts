import { addDay, monthGrid, nextRange, rentalDays } from './bookingDates';
import { busyCars, carConflicts, conflictLevel, firstBusyDay, isCarBusyError, isSoftBlock, type CalendarBlock } from './queries/availability';

const block = (over: Partial<CalendarBlock>): CalendarBlock => ({
  id: 1, car_id: 7, block_type: 'booked_confirmed', booking_id: null, start_date: '2026-11-10', end_date: '2026-11-15', ...over,
});

describe('booking dates', () => {
  test('counts rental days, with a same-day rental as one', () => {
    expect(rentalDays('2026-11-10', '2026-11-15')).toBe(5);
    expect(rentalDays('2026-11-10', '2026-11-10')).toBe(1);
    expect(rentalDays('', '2026-11-10')).toBe(0);
  });

  test('crosses months and clock changes without losing a day', () => {
    expect(rentalDays('2026-10-24', '2026-10-27')).toBe(3);
    expect(addDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDay('2028-03-01', -1)).toBe('2028-02-29');
  });

  test('a month is always six weeks starting on Monday', () => {
    const grid = monthGrid(2026, 10);
    expect(grid).toHaveLength(42);
    expect(new Date(`${grid[0].iso}T12:00:00Z`).getUTCDay()).toBe(1);
    expect(grid.filter(day => day.inMonth)).toHaveLength(30);
  });

  test('the first click starts a range, the second ends it, the next starts over', () => {
    expect(nextRange('', '', '2026-11-10')).toEqual({ start: '2026-11-10', end: '' });
    expect(nextRange('2026-11-10', '', '2026-11-12')).toEqual({ start: '2026-11-10', end: '2026-11-12' });
    expect(nextRange('2026-11-10', '', '2026-11-08')).toEqual({ start: '2026-11-08', end: '' });
    expect(nextRange('2026-11-10', '2026-11-12', '2026-11-20')).toEqual({ start: '2026-11-20', end: '' });
  });
});

describe('car availability', () => {
  test('every kind of block makes a car busy, and a booking is the reason given first', () => {
    const busy = busyCars([
      block({ id: 1, block_type: 'maintenance' }),
      block({ id: 2, block_type: 'booked_pending' }),
      block({ id: 3, car_id: 8, block_type: 'selling' }),
    ]);
    expect(busy.get(7)).toBe('booked_pending');
    expect(busy.get(8)).toBe('selling');
  });

  test('a booking does not clash with itself, nor a sheet with its own block', () => {
    expect(busyCars([block({ booking_id: 5 })], { bookingId: 5 }).size).toBe(0);
    expect(busyCars([block({ id: 9, block_type: 'replacement' })], { blockId: 9 }).size).toBe(0);
    expect(busyCars([block({ booking_id: 6 })], { bookingId: 5 }).size).toBe(1);
  });

  test('editing a booking leaves out its own block and the customer\'s own replacement cars', () => {
    const blocks = [
      block({ id: 1, booking_id: 5, block_type: 'booked_confirmed' }),
      block({ id: 2, block_type: 'replacement' }),
      block({ id: 3, block_type: 'booked_confirmed', booking_id: 6 }),
    ];
    // Their own booking and their own replacement sheet: only the other customer's booking is left.
    expect(carConflicts(blocks, 7, { bookingId: 5, blockIds: [2] }).map(b => b.id)).toEqual([3]);
    expect(conflictLevel(carConflicts(blocks, 7, { bookingId: 5, blockIds: [2] }))).toBe('hard');
    expect(conflictLevel(carConflicts(blocks.slice(0, 2), 7, { bookingId: 5, blockIds: [2] }))).toBeNull();
    expect(busyCars(blocks.slice(0, 2), { bookingId: 5, blockIds: [2] }).size).toBe(0);
    // Someone else's replacement on this car still counts.
    expect(conflictLevel(carConflicts(blocks.slice(0, 2), 7, { bookingId: 5 }))).toBe('soft');
  });

  test('maintenance and replacement only warn; another booking or a sale stops the save', () => {
    expect(isSoftBlock('maintenance') && isSoftBlock('replacement')).toBe(true);
    expect(isSoftBlock('selling') || isSoftBlock('booked_pending') || isSoftBlock('booked_confirmed')).toBe(false);
    expect(conflictLevel([block({ block_type: 'maintenance' }), block({ id: 2, block_type: 'replacement' })])).toBe('soft');
    expect(conflictLevel([block({ block_type: 'maintenance' }), block({ id: 2, block_type: 'booked_pending' })])).toBe('hard');
    expect(conflictLevel([block({ block_type: 'selling' })])).toBe('hard');
    expect(conflictLevel([])).toBeNull();
  });

  test('conflicts are per car, earliest first', () => {
    const blocks = [block({ id: 1, start_date: '2026-12-05' }), block({ id: 2, start_date: '2026-12-01' }), block({ id: 3, car_id: 8 })];
    expect(carConflicts(blocks, 7).map(b => b.id)).toEqual([2, 1]);
  });

  test('finds the day an extension has to stop at', () => {
    const blocks = [block({ start_date: '2026-12-01', end_date: '2026-12-03' }), block({ id: 2, start_date: '2026-11-20', end_date: '2026-11-25' })];
    expect(firstBusyDay(blocks, '2026-11-16')).toBe('2026-11-20');
    expect(firstBusyDay([block({ start_date: '2026-11-01' })], '2026-11-16')).toBe('2026-11-16');
    expect(firstBusyDay([], '2026-11-16')).toBeNull();
  });

  test('recognises the database refusing a double booking', () => {
    expect(isCarBusyError('conflicting key value violates exclusion constraint "car_calendar_no_overlap"')).toBe(true);
    expect(isCarBusyError('duplicate key value')).toBe(false);
    expect(isCarBusyError(null)).toBe(false);
  });
});
