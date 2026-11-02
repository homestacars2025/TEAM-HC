import { supabase } from '../supabase';
import type { BookingExtension } from '../bookingTabs';

/** The month rule lives in the function: period start, or the entry date for an older row with none. */
export async function getBookingExtensions(month: string): Promise<BookingExtension[]> {
  const { data, error } = await supabase.rpc('list_booking_extensions', { p_month: `${month}-01` });
  if (error) throw error;
  return ((data ?? []) as BookingExtension[]).map(row => ({ ...row, rental_amount: Number(row.rental_amount) || 0 }));
}
