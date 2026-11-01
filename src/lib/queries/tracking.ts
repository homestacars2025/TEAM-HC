import { supabase } from '../supabase';
import { isFleetCar, type DailyKmRow, type TrackedCar } from '../tracking';

const TRACKING_COLUMNS = 'id, car_id, plate_number, current_km, km_at_midnight, daily_km, next_oil_change, ignition, speed, last_signal_at';
const DAILY_COLUMNS = 'car_id, day, plate_number, start_km, end_km, km, last_signal_at';

interface TrackingRow {
  id: number;
  car_id: number | null;
  plate_number: string | null;
  current_km: number | null;
  km_at_midnight: number | null;
  daily_km: number | null;
  next_oil_change: number | null;
  ignition: string | null;
  speed: number | null;
  last_signal_at: string | null;
}

interface CarRow {
  id: number;
  plate_number: string;
  model_group: { name: string } | null;
}

export interface Fleet {
  cars: TrackedCar[];
  /** Every car's model by id, for a past day's rows. */
  models: Map<number, string>;
}

export async function getFleet(): Promise<Fleet> {
  const [tracking, cars] = await Promise.all([
    supabase.from('car_tracking').select(TRACKING_COLUMNS).order('last_signal_at', { ascending: false, nullsFirst: false }),
    supabase.from('cars').select('id, plate_number, model_group:model_group_id(name)'),
  ]);
  if (tracking.error) throw tracking.error;
  if (cars.error) throw cars.error;

  const carRows = (cars.data ?? []) as unknown as CarRow[];
  const byId = new Map(carRows.map(car => [car.id, car]));
  const models = new Map(carRows.flatMap(car => (car.model_group ? [[car.id, car.model_group.name] as const] : [])));

  const seen = new Set<number>();
  const fleet: TrackedCar[] = [];
  for (const row of (tracking.data ?? []) as TrackingRow[]) {
    if (!isFleetCar(row)) continue;
    if (row.car_id !== null) {
      if (seen.has(row.car_id)) continue;
      seen.add(row.car_id);
    }
    fleet.push({
      id: row.id,
      car_id: row.car_id,
      plate: row.plate_number ?? (row.car_id !== null ? byId.get(row.car_id)?.plate_number : null) ?? '—',
      model: row.car_id !== null ? models.get(row.car_id) ?? null : null,
      current_km: row.current_km,
      start_km: row.km_at_midnight ?? row.current_km,
      today_km: row.daily_km ?? 0,
      next_oil_change: row.next_oil_change,
      ignition: row.ignition === 'ON',
      speed: row.speed ?? 0,
      last_signal_at: row.last_signal_at,
    });
  }
  return { cars: fleet, models };
}

/** Every car's days in the range, or one car's. */
export async function getDailyKm(from: string, to: string, carId?: number): Promise<DailyKmRow[]> {
  let query = supabase.from('car_daily_km').select(DAILY_COLUMNS).gte('day', from).lte('day', to);
  if (carId !== undefined) query = query.eq('car_id', carId);
  const { data, error } = await query.order('day');
  if (error) throw error;
  return (data ?? []) as DailyKmRow[];
}

/** `.select()` so a write that reached no row is a failure, not a quiet nothing. */
export async function saveNextOilChange(id: number, value: number | null): Promise<void> {
  const { error } = await supabase.from('car_tracking').update({ next_oil_change: value }).eq('id', id).select('id').single();
  if (error) throw error;
}
