import { supabase } from '../supabase';
import {
  toCashReceipt, toHeldEnvelope,
  type CashBooking, type CashBookingStatus, type CashCurrency, type CashPurpose, type CashReceipt, type HeldEnvelope,
} from '../receiveCash';

/**
 * Receive cash: reads go through RLS (staff are internal), the write through
 * `staff_receive_cash`, which checks the person, the booking and the amount itself.
 */

const BOOKING_COLUMNS = 'id, booking_number, status, start_date, end_date, created_at, customer_id, cars(plate_number, model_group:model_group_id(name)), customers(first_name, last_name)';
const LIMIT = 30;
const PLATE_LIMIT = 6;

type Joined<T> = T | T[] | null;
const one = <T,>(value: Joined<T>): T | null => (Array.isArray(value) ? value[0] ?? null : value);

interface BookingRow {
  id: number;
  booking_number: string | null;
  status: CashBookingStatus;
  start_date: string;
  end_date: string;
  created_at: string | null;
  customer_id: string;
  cars: Joined<{ plate_number: string | null; model_group: Joined<{ name: string | null }> }>;
  customers: Joined<{ first_name: string | null; last_name: string | null }>;
}

function toCashBooking(row: BookingRow): CashBooking {
  const car = one(row.cars);
  const person = one(row.customers);
  return {
    id: row.id,
    bookingNumber: row.booking_number ?? `#${row.id}`,
    status: row.status,
    startDate: row.start_date.slice(0, 10),
    endDate: row.end_date.slice(0, 10),
    plate: car?.plate_number ?? null,
    model: one(car?.model_group ?? null)?.name?.replace(/\s+/g, ' ').trim() || null,
    customerId: row.customer_id,
    customerName: `${person?.first_name ?? ''} ${person?.last_name ?? ''}`.trim(),
    createdAt: row.created_at,
  };
}

/** A customer's bookings, newest first, without the cancelled ones. */
export async function getCustomerCashBookings(customerId: string): Promise<CashBooking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(BOOKING_COLUMNS)
    .eq('customer_id', customerId)
    .neq('status', 'cancelled')
    .order('start_date', { ascending: false })
    .limit(LIMIT);
  if (error) throw error;
  return ((data ?? []) as unknown as BookingRow[]).map(toCashBooking);
}

export async function getCashBooking(bookingId: number): Promise<CashBooking | null> {
  const { data, error } = await supabase.from('bookings').select(BOOKING_COLUMNS).eq('id', bookingId).maybeSingle();
  if (error) throw error;
  return data ? toCashBooking(data as unknown as BookingRow) : null;
}

/**
 * Bookings on an active car whose plate holds `plate` (spaces already taken out), newest
 * first. Sold cars (`is_active = false`) are history and never take new cash.
 */
export async function findCashBookingsByPlate(plate: string): Promise<CashBooking[]> {
  const cars = await supabase.from('cars').select('id').eq('is_active', true).ilike('plate_number', `%${plate.replace(/[^0-9A-Z]/gi, '')}%`).limit(PLATE_LIMIT);
  if (cars.error) throw cars.error;
  const ids = ((cars.data ?? []) as { id: number }[]).map(car => car.id);
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('bookings')
    .select(BOOKING_COLUMNS)
    .in('car_id', ids)
    .neq('status', 'cancelled')
    .order('start_date', { ascending: false })
    .limit(PLATE_LIMIT);
  if (error) throw error;
  return ((data ?? []) as unknown as BookingRow[]).map(toCashBooking);
}

export async function receiveCash(input: { bookingId: number; purpose: CashPurpose; amount: number; currency: CashCurrency; note: string | null }): Promise<CashReceipt> {
  const { data, error } = await supabase.rpc('staff_receive_cash', {
    p_booking_id: input.bookingId,
    p_purpose: input.purpose,
    p_amount: input.amount,
    p_currency: input.currency,
    p_note: input.note?.trim() || null,
  });
  if (error) throw error;
  return toCashReceipt(data);
}

/** Envelopes still with staff: this person's own, or everyone's for finance. Oldest first. */
export async function getHeldEnvelopes(): Promise<HeldEnvelope[]> {
  const { data, error } = await supabase.rpc('my_held_envelopes');
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(toHeldEnvelope);
}
