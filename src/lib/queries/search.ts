import { supabase } from '../supabase';

/**
 * Command palette lookups. Whether someone may search a given kind of record is the
 * palette's call, made from their page access before any of these run.
 */

const LIMIT = 6;
/** Wide enough that the name check below still has something to narrow down. */
const CUSTOMER_CANDIDATES = 50;

export interface CarHit { id: number; plate: string; model: string | null }
export interface CustomerHit { id: string; name: string; phone: string | null; banned: boolean; banReason: string | null }
export interface BookingHit { id: number; number: string; customer: string | null; plate: string | null; startDate: string }

/** Case, accents and Turkish dotted/dotless i all compare equal. */
export function fold(text: string): string {
  return text
    .toLocaleLowerCase('en')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i');
}

const tokens = (term: string) => term.trim().split(/\s+/).filter(Boolean);

/** Quoted, so a comma or bracket in the search cannot break out of the `or` filter. */
export function likeValue(term: string): string {
  return `"%${term.replace(/[%_*\\"]/g, '')}%"`;
}

export async function getFleet(): Promise<CarHit[]> {
  const { data, error } = await supabase
    .from('cars')
    .select('id, plate_number, model_group:model_group_id(name)')
    .eq('is_active', true)
    .order('plate_number');
  if (error) throw error;
  type Row = { id: number; plate_number: string; model_group: { name: string } | { name: string }[] | null };
  return ((data ?? []) as unknown as Row[]).map(row => {
    const group = Array.isArray(row.model_group) ? row.model_group[0] : row.model_group;
    return { id: row.id, plate: row.plate_number, model: group?.name ?? null };
  });
}

export function matchCars(fleet: CarHit[], term: string): CarHit[] {
  const wanted = tokens(fold(term));
  return fleet
    .filter(car => {
      const haystack = fold(`${car.plate} ${car.model ?? ''}`);
      return wanted.every(word => haystack.includes(word));
    })
    .slice(0, LIMIT);
}

export async function searchCustomers(term: string): Promise<CustomerHit[]> {
  const words = tokens(term);
  if (words.length === 0) return [];

  // The database matches one word; the rest narrows down here, which is what lets
  // "ali kaya" find a first and a last name held in separate columns.
  const longest = words.reduce((a, b) => (b.length > a.length ? b : a));
  const digits = term.replace(/\D/g, '');
  const filters = [`first_name.ilike.${likeValue(longest)}`, `last_name.ilike.${likeValue(longest)}`];
  if (digits.length >= 3) filters.push(`phone.ilike.${likeValue(digits)}`);

  const { data, error } = await supabase
    .from('customers')
    .select('id, first_name, last_name, phone, is_banned, ban_reason')
    .or(filters.join(','))
    .limit(CUSTOMER_CANDIDATES);
  if (error) throw error;

  type Row = { id: string; first_name: string | null; last_name: string | null; phone: string | null; is_banned: boolean; ban_reason: string | null };
  const wanted = tokens(fold(term));
  return ((data ?? []) as Row[])
    .map(row => ({ id: row.id, name: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(), phone: row.phone, banned: row.is_banned, banReason: row.ban_reason }))
    .filter(hit => {
      if (digits.length >= 3 && (hit.phone ?? '').replace(/\D/g, '').includes(digits)) return true;
      const name = fold(hit.name);
      return wanted.every(word => name.includes(word));
    })
    .slice(0, LIMIT);
}

export async function searchBookings(term: string, customerIds: string[]): Promise<BookingHit[]> {
  const filters = [`booking_number.ilike.${likeValue(term.trim())}`];
  if (customerIds.length > 0) filters.push(`customer_id.in.(${customerIds.join(',')})`);

  const { data, error } = await supabase
    .from('bookings')
    .select('id, booking_number, start_date, cars(plate_number), customers(first_name, last_name)')
    .or(filters.join(','))
    .order('start_date', { ascending: false })
    .limit(LIMIT);
  if (error) throw error;

  type Person = { first_name: string | null; last_name: string | null };
  type Plate = { plate_number: string | null };
  type Row = { id: number; booking_number: string; start_date: string; cars: Plate | Plate[] | null; customers: Person | Person[] | null };
  return ((data ?? []) as unknown as Row[]).map(row => {
    const person = Array.isArray(row.customers) ? row.customers[0] : row.customers;
    const car = Array.isArray(row.cars) ? row.cars[0] : row.cars;
    return {
      id: row.id,
      number: row.booking_number,
      customer: person ? `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim() || null : null,
      plate: car?.plate_number ?? null,
      startDate: row.start_date,
    };
  });
}
