import { supabase } from '../supabase';
import {
  BLOCK_TYPES, bookingBarStatus, isBlockType, monthBounds, readCarStatus, sortConflicts, sortHistory,
  type Conflict, type FleetBar, type FleetCar, type HistoryEvent,
} from '../fleetCalendar';

/**
 * The Fleet Calendar's reads. `cars` holds investor details too; only the plate and
 * the model are ever selected here.
 */

type Joined<T> = T | T[] | null;
const firstOf = <T,>(value: Joined<T> | undefined): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null);

interface CarRow { id: number; plate_number: string; model_group: Joined<{ name: string | null }> }
interface BookingRow {
  id: number; booking_number: string | null; car_id: number | null; start_date: string; end_date: string; status: string | null;
  customers: Joined<{ first_name: string | null; last_name: string | null }>;
}
interface BlockRow { id: number; car_id: number; start_date: string; end_date: string; block_type: string; notes: string | null }

export interface FleetMonth {
  cars: FleetCar[];
  bars: FleetBar[];
}

/** One month: every active car, its bookings that touch the month, and its blocks. Four reads at once. */
export async function getFleetMonth(month: string): Promise<FleetMonth> {
  const { first, last } = monthBounds(month);
  const [cars, statuses, bookings, blocks] = await Promise.all([
    supabase.from('cars').select('id, plate_number, model_group(name)').eq('is_active', true),
    supabase.from('car_availability').select('id, status'),
    supabase.from('bookings')
      .select('id, booking_number, car_id, start_date, end_date, status, customers(first_name, last_name)')
      .neq('status', 'cancelled').lte('start_date', last).gte('end_date', first),
    supabase.from('car_calendar')
      .select('id, car_id, start_date, end_date, block_type, notes')
      .in('block_type', BLOCK_TYPES as unknown as string[]).lte('start_date', last).gte('end_date', first),
  ]);
  const failure = cars.error ?? statuses.error ?? bookings.error ?? blocks.error;
  if (failure) throw failure;

  const statusOf = new Map(((statuses.data ?? []) as { id: number; status: string }[]).map(row => [row.id, readCarStatus(row.status)]));
  const fleet: FleetCar[] = ((cars.data ?? []) as unknown as CarRow[]).map(row => ({
    id: row.id,
    plate: row.plate_number,
    model: firstOf(row.model_group)?.name?.replace(/\s+/g, ' ').trim() || '—',
    status: statusOf.get(row.id) ?? 'parking',
  })).sort((a, b) => a.model.localeCompare(b.model) || a.plate.localeCompare(b.plate, 'en', { numeric: true }));

  const bars: FleetBar[] = [];
  for (const row of (bookings.data ?? []) as unknown as BookingRow[]) {
    const status = bookingBarStatus(row.status);
    if (!status || row.car_id == null) continue;
    const who = firstOf(row.customers);
    bars.push({
      key: `b:${row.id}`, carId: row.car_id, status, start: row.start_date.slice(0, 10), end: row.end_date.slice(0, 10),
      bookingId: row.id, bookingNumber: row.booking_number, customer: [who?.first_name, who?.last_name].filter(Boolean).join(' ').trim() || null,
      blockId: null, blockType: null, note: null,
    });
  }
  for (const row of (blocks.data ?? []) as BlockRow[]) {
    if (!isBlockType(row.block_type)) continue;
    bars.push({
      key: `c:${row.id}`, carId: row.car_id, status: row.block_type, start: row.start_date.slice(0, 10), end: row.end_date.slice(0, 10),
      bookingId: null, bookingNumber: null, customer: null, blockId: row.id, blockType: row.block_type, note: row.notes?.trim() || null,
    });
  }
  return { cars: fleet, bars };
}

/** `calendar_conflicts`, worked out live on the server for the month. */
export async function getCalendarConflicts(month: string): Promise<Conflict[]> {
  const { data, error } = await supabase.rpc('calendar_conflicts', { p_month: `${month}-01` });
  if (error) throw error;
  return sortConflicts((data ?? []) as Conflict[]);
}

/** Everything that happened to one car, newest first. */
export async function getCarHistory(carId: number): Promise<HistoryEvent[]> {
  const { data, error } = await supabase.rpc('car_history', { p_car_id: carId });
  if (error) throw error;
  return sortHistory(Array.isArray(data) ? (data as HistoryEvent[]) : []);
}

// ─── Blocks: the same writes the calendar always made ─────────────────────────

export async function addBlock(carId: number, start: string, end: string, blockType: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('car_calendar').insert({ car_id: carId, start_date: start, end_date: end, block_type: blockType, created_by: user?.id ?? null });
  if (error) throw error;
}

export async function updateBlock(id: number, blockType: string, start: string, end: string): Promise<void> {
  const { error } = await supabase.from('car_calendar').update({ block_type: blockType, start_date: start, end_date: end }).eq('id', id);
  if (error) throw error;
}

export async function deleteBlock(id: number): Promise<void> {
  const { error } = await supabase.from('car_calendar').delete().eq('id', id);
  if (error) throw error;
}
