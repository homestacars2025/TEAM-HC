import { supabase } from '../supabase';

/**
 * Which cars are free for a set of dates. `car_calendar` holds bookings and also
 * maintenance, replacement and selling blocks, and each of those takes a car off the
 * road, but the database's no-overlap rule only covers bookings. So the form has to
 * count all of them itself.
 */

export type BlockType = 'booked_confirmed' | 'booked_pending' | 'maintenance' | 'replacement' | 'selling';

export interface CalendarBlock {
  id: number;
  car_id: number;
  block_type: BlockType;
  booking_id: number | null;
  start_date: string;
  end_date: string;
}

/** Both ends included, the way the database's own overlap rule counts them. */
export async function getBlocks(start: string, end: string, carId?: number): Promise<CalendarBlock[]> {
  let query = supabase
    .from('car_calendar')
    .select('id, car_id, block_type, booking_id, start_date, end_date')
    .lte('start_date', end)
    .gte('end_date', start);
  if (carId != null) query = query.eq('car_id', carId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as CalendarBlock[];
}

export interface BlockExclusions {
  /** The booking being edited or extended, which can't conflict with itself. */
  bookingId?: number | null;
  /** The calendar block of a replacement sheet being edited. */
  blockId?: number | null;
}

/** One reason per car. A booking outranks anything else, as the likelier thing to ask about. */
export function busyCars(blocks: readonly CalendarBlock[], exclude: BlockExclusions = {}): Map<number, BlockType> {
  const busy = new Map<number, BlockType>();
  for (const block of blocks) {
    if (exclude.bookingId != null && block.booking_id === exclude.bookingId) continue;
    if (exclude.blockId != null && block.id === exclude.blockId) continue;
    const held = busy.get(block.car_id);
    if (!held || block.block_type.startsWith('booked')) busy.set(block.car_id, block.block_type);
  }
  return busy;
}

/** The first day after `from` this car stops being free, or `null` if it never does. */
export function firstBusyDay(blocks: readonly CalendarBlock[], from: string, exclude: BlockExclusions = {}): string | null {
  const days = blocks
    .filter(block => !(exclude.bookingId != null && block.booking_id === exclude.bookingId))
    .filter(block => !(exclude.blockId != null && block.id === exclude.blockId))
    .map(block => (block.start_date > from ? block.start_date : from));
  return days.length > 0 ? days.sort()[0] : null;
}

/** The database refusing a double booking, however the message is worded around it. */
export const isCarBusyError = (message: string | null | undefined): boolean =>
  /car_calendar_no_overlap|exclusion constraint/i.test(message ?? '');

const RECENT_KEY = 'hc_recent_cars';
const RECENT_LIMIT = 3;

export function recentCarIds(): number[] {
  try {
    const stored = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(stored) ? stored.filter((id): id is number => typeof id === 'number') : [];
  } catch {
    return [];
  }
}

export function rememberCar(id: number): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...recentCarIds().filter(other => other !== id)].slice(0, RECENT_LIMIT)));
  } catch { /* private mode: only a shortcut */ }
}
