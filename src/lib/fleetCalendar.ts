/**
 * The Fleet Calendar, worked out here so it can be tested. Admin follows the same rules:
 *
 * - A row is an active car. Its chip is its status today (`car_availability`).
 * - A booking bar comes from `bookings` (not `car_calendar`, which forgets completed
 *   ones), coloured by the booking's status. Maintenance, selling and replacement bars
 *   come from `car_calendar`.
 * - A bar starts in the middle of its first day and ends in the middle of its last, so a
 *   return and the next pickup on the same day meet without overlapping.
 * - Colours live in `styles/statusTokens.css` and nowhere else.
 */

export const CAR_STATUSES = ['working', 'pending', 'parking', 'maintenance', 'selling', 'replacement'] as const;
export type CarStatus = typeof CAR_STATUSES[number];

/** What a bar can be. Each is a colour token, `hc-st-<name>`. */
export type BarStatus = 'booked' | 'pending' | 'completed' | 'maintenance' | 'selling' | 'replacement';
/** The legend: every bar colour, then a free day. */
export const LEGEND: readonly (BarStatus | 'parking')[] = ['booked', 'pending', 'completed', 'maintenance', 'selling', 'replacement', 'parking'];

/** A car status in the bar palette. */
export const carStatusTone = (status: CarStatus): BarStatus | 'parking' =>
  status === 'working' ? 'booked' : status;

export const readCarStatus = (value: string | null | undefined): CarStatus =>
  (CAR_STATUSES as readonly string[]).includes(value ?? '') ? value as CarStatus : 'parking';

export interface FleetCar {
  id: number;
  plate: string;
  model: string;
  status: CarStatus;
}

export interface FleetBar {
  /** `b:<booking id>` or `c:<car_calendar id>`. */
  key: string;
  carId: number;
  status: BarStatus;
  /** `YYYY-MM-DD`, both ends included. */
  start: string;
  end: string;
  bookingId: number | null;
  bookingNumber: string | null;
  customer: string | null;
  /** A maintenance, selling or replacement block, which can be edited here. */
  blockId: number | null;
  blockType: 'maintenance' | 'selling' | 'replacement' | null;
  note: string | null;
}

export const bookingBarStatus = (status: string | null | undefined): BarStatus | null => {
  switch (status) {
    case 'confirmed': return 'booked';
    case 'pending': return 'pending';
    case 'completed': return 'completed';
    default: return null;
  }
};

export const BLOCK_TYPES = ['maintenance', 'selling', 'replacement'] as const;
export type BlockType = typeof BLOCK_TYPES[number];
export const isBlockType = (value: string | null | undefined): value is BlockType => (BLOCK_TYPES as readonly string[]).includes(value ?? '');

// ─── Dates ────────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM` → its first and last day. */
export function monthBounds(month: string): { first: string; last: string; days: number } {
  const [y, m] = month.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { first: `${month}-01`, last: `${month}-${pad(days)}`, days };
}

const dayNumber = (date: string) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / 86_400_000;

/** Whole days from one date to another. */
export const daysBetween = (from: string, to: string) => Math.round(dayNumber(to) - dayNumber(from));

/** A rental's length as the business counts it: nights, at least one. */
export const rentalDays = (start: string, end: string) => Math.max(daysBetween(start, end), 1);

export const isWeekend = (date: string) => {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
};

export interface BarSpan {
  /** In days from the start of the month, fractional. */
  from: number;
  to: number;
  /** The bar runs on from the month before, or into the next one: that end is square. */
  clippedStart: boolean;
  clippedEnd: boolean;
}

/** Where a bar sits in a month's columns, or null when it isn't in the month. */
export function barSpan(bar: Pick<FleetBar, 'start' | 'end'>, month: string): BarSpan | null {
  const { first, last, days } = monthBounds(month);
  if (bar.end < first || bar.start > last) return null;
  const startDay = daysBetween(first, bar.start);
  const endDay = daysBetween(first, bar.end);
  // A one-day bar still needs to be seen: it takes most of its day.
  const [from, to] = startDay === endDay ? [startDay + 0.1, startDay + 0.9] : [startDay + 0.5, endDay + 0.5];
  return { from: Math.max(from, 0), to: Math.min(to, days), clippedStart: from < 0, clippedEnd: to > days };
}

/** Bars that overlap go on separate lanes, so neither hides the other. */
export function laneBars<T extends Pick<FleetBar, 'start' | 'end' | 'key'>>(bars: readonly T[]): { bar: T; lane: number }[] {
  // The same extents `barSpan` draws: touching at noon on a changeover day is fine.
  const extent = (bar: T): [number, number] => {
    const start = dayNumber(bar.start);
    const end = dayNumber(bar.end);
    return start === end ? [start + 0.1, start + 0.9] : [start + 0.5, end + 0.5];
  };
  const sorted = [...bars].sort((a, b) => extent(a)[0] - extent(b)[0] || extent(a)[1] - extent(b)[1] || a.key.localeCompare(b.key));
  const lanesEnd: number[] = [];
  return sorted.map(bar => {
    const [from, to] = extent(bar);
    let lane = lanesEnd.findIndex(end => end <= from);
    if (lane === -1) { lane = lanesEnd.length; lanesEnd.push(to); } else lanesEnd[lane] = to;
    return { bar, lane };
  });
}

// ─── Rows ─────────────────────────────────────────────────────────────────────

const squash = (text: string | null | undefined) => (text ?? '').toLocaleLowerCase('tr-TR').replace(/[\s.\-–]/g, '');

/** Plate (spaces optional), model, or the customer of any bar in the month. */
export function rowMatches(car: FleetCar, bars: readonly FleetBar[], query: string): boolean {
  const needle = squash(query);
  if (!needle) return true;
  return squash(car.plate).includes(needle) || squash(car.model).includes(needle)
    || bars.some(bar => squash(bar.customer).includes(needle) || squash(bar.bookingNumber).includes(needle));
}

export type StatusFilter = CarStatus | 'all';

export function statusCounts(cars: readonly FleetCar[]): Record<StatusFilter, number> {
  const counts = { all: cars.length } as Record<StatusFilter, number>;
  for (const status of CAR_STATUSES) counts[status] = 0;
  for (const car of cars) counts[car.status] += 1;
  return counts;
}

// ─── Conflicts ────────────────────────────────────────────────────────────────

export const CONFLICT_KINDS = ['double_booking', 'blocked_period', 'missing_delivery', 'missing_pickup', 'not_closed'] as const;
export type ConflictKind = typeof CONFLICT_KINDS[number];
export type Severity = 'high' | 'medium' | 'low';

export interface Conflict {
  kind: ConflictKind;
  severity: Severity;
  car_id: number | null;
  plate: string | null;
  booking_id: number | null;
  booking_number: string | null;
  other_ref: string | null;
  date_from: string | null;
  date_to: string | null;
  message: string | null;
}

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

/** High first, then by car and date, so a car's problems sit together. */
export const sortConflicts = (rows: readonly Conflict[]) =>
  [...rows].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    || (a.plate ?? '').localeCompare(b.plate ?? '', 'en', { numeric: true })
    || (a.date_from ?? '').localeCompare(b.date_from ?? ''));

/**
 * The bookings caught in a high-severity conflict, for the red outline. A double
 * booking names its other booking by number in `other_ref`.
 */
export function flaggedBookings(conflicts: readonly Conflict[], bars: readonly FleetBar[]): Set<number> {
  const byNumber = new Map(bars.filter(bar => bar.bookingNumber && bar.bookingId != null).map(bar => [bar.bookingNumber as string, bar.bookingId as number]));
  const flagged = new Set<number>();
  for (const conflict of conflicts) {
    if (conflict.severity !== 'high') continue;
    if (conflict.booking_id != null) flagged.add(conflict.booking_id);
    if (conflict.kind === 'double_booking' && conflict.other_ref) {
      const other = byNumber.get(conflict.other_ref);
      if (other != null) flagged.add(other);
    }
  }
  return flagged;
}

// ─── Car history ──────────────────────────────────────────────────────────────

export type HistoryKind = 'booking' | 'extension' | 'operation' | 'maintenance' | 'selling' | 'replacement' | 'issue' | 'fine' | 'car_change';

export interface HistoryEvent {
  kind: HistoryKind;
  at: string;
  end?: string | null;
  title?: string | null;
  status?: string | null;
  customer?: string | null;
  customer_id?: string | null;
  amount?: number | string | null;
  km?: number | null;
  fuel?: number | null;
  note?: string | null;
  by?: string | null;
  booking_id?: number | null;
  from_car?: string | null;
  to_car?: string | null;
  ref_id?: number | string | null;
}

export const HISTORY_FILTERS = ['all', 'bookings', 'operations', 'issues', 'fines'] as const;
export type HistoryFilter = typeof HISTORY_FILTERS[number];

const FILTER_KINDS: Record<Exclude<HistoryFilter, 'all'>, readonly HistoryKind[]> = {
  bookings: ['booking', 'extension', 'car_change', 'replacement'],
  operations: ['operation', 'maintenance', 'selling'],
  issues: ['issue'],
  fines: ['fine'],
};

export const inHistoryFilter = (event: HistoryEvent, filter: HistoryFilter) =>
  filter === 'all' || FILTER_KINDS[filter].includes(event.kind);

/**
 * Postgres writes `2026-11-05 12:37:26.168693+00` and `2026-09-08`. Neither parses as
 * is (a bare `+00`, six decimals Safari refuses), so both are put in ISO form first. A
 * date alone is midnight in Istanbul.
 */
export function parseStamp(at: string | null | undefined): Date | null {
  if (!at) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(at)
    ? `${at}T00:00:00+03:00`
    : at.trim().replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1').replace(/([+-]\d{2})$/, '$1:00');
  const time = new Date(iso);
  return Number.isNaN(time.getTime()) ? null : time;
}

export const eventTime = (at: string | null | undefined): number => parseStamp(at)?.getTime() ?? 0;

/** Newest first, whatever shape each date came in. */
export const sortHistory = (events: readonly HistoryEvent[]) => [...events].sort((a, b) => eventTime(b.at) - eventTime(a.at));

export interface HistorySummary {
  bookings: number;
  daysThisYear: number;
  km: number | null;
}

export function historySummary(events: readonly HistoryEvent[], year: number): HistorySummary {
  const bookings = events.filter(event => event.kind === 'booking' && event.status !== 'cancelled');
  const first = `${year}-01-01`;
  const last = `${year}-12-31`;
  let days = 0;
  for (const booking of bookings) {
    const start = booking.at.slice(0, 10);
    const end = (booking.end ?? booking.at).slice(0, 10);
    if (end < first || start > last) continue;
    const from = start < first ? first : start;
    const to = end > last ? last : end;
    days += Math.max(daysBetween(from, to), from === to ? 1 : 0);
  }
  const withKm = sortHistory(events.filter(event => event.kind === 'operation' && typeof event.km === 'number' && event.km > 0));
  return { bookings: bookings.length, daysThisYear: days, km: withKm[0]?.km ?? null };
}

// ─── Utilization ──────────────────────────────────────────────────────────────

/** `car_utilization`: of the month's days, how many the car was out. `rate` is 0–100. */
export interface Utilization {
  carId: number;
  days: number;
  rented: number;
  rate: number;
}

export type UtilTone = 'high' | 'mid' | 'low';
export const utilTone = (rate: number): UtilTone => (rate >= 80 ? 'high' : rate >= 50 ? 'mid' : 'low');

/** The whole active fleet, pooled: every rented day over every day, not an average of rates. */
export function fleetUtilization(rows: readonly Pick<Utilization, 'days' | 'rented'>[]): number | null {
  const days = rows.reduce((sum, row) => sum + row.days, 0);
  return days > 0 ? Math.round((100 * rows.reduce((sum, row) => sum + row.rented, 0)) / days) : null;
}

export const UTIL_SORTS = ['model', 'util_desc', 'util_asc'] as const;
export type UtilSort = typeof UTIL_SORTS[number];
export const readUtilSort = (value: string | null): UtilSort => (UTIL_SORTS.includes(value as UtilSort) ? value as UtilSort : 'model');

/**
 * `model` keeps the order the cars came in. By utilization, a tie goes by plate, and a
 * car with no figure goes last either way. Admin sorts the same.
 */
export function sortByUtilization<T extends { id: number; plate: string }>(cars: readonly T[], sort: UtilSort, utilization: ReadonlyMap<number, Pick<Utilization, 'rate'>> | null): T[] {
  if (sort === 'model' || !utilization) return [...cars];
  const sign = sort === 'util_desc' ? -1 : 1;
  const byPlate = (a: T, b: T) => a.plate.localeCompare(b.plate, 'en', { numeric: true });
  return cars
    .map(car => ({ car, rate: utilization.get(car.id)?.rate ?? null }))
    .sort((a, b) => {
      if (a.rate === null || b.rate === null) return a.rate === b.rate ? byPlate(a.car, b.car) : a.rate === null ? 1 : -1;
      return sign * (a.rate - b.rate) || byPlate(a.car, b.car);
    })
    .map(entry => entry.car);
}
