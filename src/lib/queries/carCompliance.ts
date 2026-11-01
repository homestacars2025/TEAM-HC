import { checkCar, type CarCompliance } from '../carCompliance';
import { istanbulDate } from '../istanbulTime';
import { supabase } from '../supabase';

interface CarRow {
  id: number;
  plate_number: string;
  model_group: { name: string } | { name: string }[] | null;
}

interface RegistrationRow {
  car_id: number;
  insurance_expiry: string | null;
  inspection_expiry: string | null;
}

/** Every active car, including the ones with no registration row at all. */
export async function getCarCompliance(): Promise<CarCompliance[]> {
  const [cars, registrations] = await Promise.all([
    supabase.from('cars').select('id, plate_number, model_group(name)').eq('is_active', true),
    supabase.from('cars_registration').select('car_id, insurance_expiry, inspection_expiry'),
  ]);
  if (cars.error) throw cars.error;
  if (registrations.error) throw registrations.error;

  const byCar = new Map(((registrations.data ?? []) as RegistrationRow[]).map(row => [row.car_id, row]));
  const today = istanbulDate();
  return ((cars.data ?? []) as unknown as CarRow[]).map(car => {
    const group = Array.isArray(car.model_group) ? car.model_group[0] : car.model_group;
    const registration = byCar.get(car.id);
    return checkCar({
      id: car.id,
      plate: car.plate_number,
      model: group?.name?.replace(/\s+/g, ' ').trim() ?? '—',
      insuranceExpiry: registration?.insurance_expiry ?? null,
      inspectionExpiry: registration?.inspection_expiry ?? null,
    }, today);
  });
}

export interface CarDatesChange {
  insurance_expiry?: string;
  inspection_expiry?: string;
}

/**
 * Some cars have no registration row yet, so this creates it or changes it. Only the dates
 * in `change` are sent, which leaves the rest of an existing row alone.
 */
export async function saveCarDates(carId: number, change: CarDatesChange): Promise<void> {
  const { error } = await supabase.from('cars_registration').upsert({ car_id: carId, ...change }, { onConflict: 'car_id' });
  if (error) throw error;
}
