import { istanbulDate } from './istanbulTime';

export type KabisStatus = 'pending' | 'checked_in' | 'checked_out';
export type KabisAction = 'delivery' | 'pickup';

export const KABIS_FILTERS = ['pending', 'checked_in', 'checked_out', 'inside'] as const;
export type KabisFilter = typeof KABIS_FILTERS[number];

export const asStatus = (value: string): KabisStatus => (value === 'checked_in' || value === 'checked_out' ? value : 'pending');
export const asAction = (value: string): KabisAction => (value === 'pickup' ? 'pickup' : 'delivery');

export interface EnteredByProfile {
  full_name: string | null;
  avatar_url: string | null;
  gender: string | null;
  avatar_bg: string | null;
}

export interface KabisRow {
  id: number;
  created_at: string;
  operation_id: number | null;
  booking_id: number | null;
  car_id: number | null;
  customer_name: string | null;
  customer_id_number: string | null;
  booking_number: string | null;
  plate_number: string | null;
  /** numeric arrives from PostgREST as a string, so accept both. */
  km: number | string | null;
  operation_date: string | null;
  action_type: string;
  status: string;
  entered_by: string | null;
  entered_at: string | null;
  note: string | null;
  entered_by_profile: EnteredByProfile | EnteredByProfile[] | null;
}

export interface KabisEntry extends Omit<KabisRow, 'entered_by_profile'> {
  entered_by_name: string | null;
  entered_by_avatar: EnteredByProfile | null;
}

type Timed = Pick<KabisRow, 'id' | 'operation_date' | 'created_at'>;
type Linked = Timed & Pick<KabisRow, 'booking_id' | 'car_id' | 'action_type' | 'status'>;

/** The day the car moved. `created_at` only stands in for a row that has none. */
export const kabisDay = (entry: Pick<KabisRow, 'operation_date' | 'created_at'>): string =>
  entry.operation_date ?? istanbulDate(new Date(entry.created_at));

const newestFirst = (a: Timed, b: Timed): number =>
  kabisDay(b).localeCompare(kabisDay(a)) || b.created_at.localeCompare(a.created_at) || b.id - a.id;

/** Pending first, because that is the work. Status plays no other part: check-ins and check-outs mix by date. */
export function compareEntries(a: Timed & Pick<KabisRow, 'status'>, b: Timed & Pick<KabisRow, 'status'>): number {
  const pending = Number(asStatus(b.status) === 'pending') - Number(asStatus(a.status) === 'pending');
  return pending || newestFirst(a, b);
}

const tripKey = (entry: Linked) => `${entry.booking_id ?? 'none'}:${entry.car_id ?? 'none'}`;

/**
 * Deliveries still open in KABIS: checked in, with no check-out after them. A booking can
 * use two cars, and a car many bookings, so a check-out only closes its own booking and car.
 */
export function insideIds(entries: Linked[]): Set<number> {
  const checkOuts = new Map<string, Linked[]>();
  for (const entry of entries) {
    if (asStatus(entry.status) !== 'checked_out') continue;
    const key = tripKey(entry);
    checkOuts.set(key, [...(checkOuts.get(key) ?? []), entry]);
  }
  const inside = new Set<number>();
  for (const entry of entries) {
    if (asAction(entry.action_type) !== 'delivery' || asStatus(entry.status) !== 'checked_in') continue;
    const closed = (checkOuts.get(tripKey(entry)) ?? []).some(out => newestFirst(entry, out) >= 0);
    if (!closed) inside.add(entry.id);
  }
  return inside;
}

export interface BookingGroup<T> {
  key: string;
  bookingNumber: string | null;
  entries: T[];
}

/** Keeps the order of the list it is given, and reads each booking in the order it happened. */
export function groupByBooking<T extends Timed & Pick<KabisRow, 'booking_id' | 'booking_number'>>(entries: T[]): BookingGroup<T>[] {
  const groups = new Map<string, BookingGroup<T>>();
  for (const entry of entries) {
    const key = entry.booking_id === null ? `entry-${entry.id}` : `booking-${entry.booking_id}`;
    const group = groups.get(key) ?? { key, bookingNumber: entry.booking_number, entries: [] };
    group.entries.push(entry);
    groups.set(key, group);
  }
  const all = Array.from(groups.values());
  all.forEach(group => group.entries.sort((a, b) => newestFirst(b, a)));
  return all;
}

export function entryMatches(entry: Pick<KabisRow, 'customer_name' | 'customer_id_number' | 'booking_number' | 'plate_number'>, query: string): boolean {
  const text = query.trim().toLowerCase();
  if (!text) return true;
  const plateText = text.replace(/\s/g, '');
  return [entry.customer_name, entry.customer_id_number, entry.booking_number].some(value => (value ?? '').toLowerCase().includes(text))
    || (entry.plate_number ?? '').toLowerCase().includes(plateText);
}
