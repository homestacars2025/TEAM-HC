import { supabase } from '../supabase';

export interface CarBooking {
  id: number;
  booking_number: string | null;
  /** customers.id is a uuid. */
  customer_id: string | null;
  customer_name: string | null;
  customer_banned: boolean;
  start_date: string;
  end_date: string;
}

type Joined = { first_name: string; last_name: string; is_banned?: boolean | null };

/** Every booking of a car, newest first, with no status filter. */
export async function getCarBookings(carId: number): Promise<CarBooking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('id, booking_number, customer_id, start_date, end_date, customers(first_name, last_name, is_banned)')
    .eq('car_id', carId)
    .order('start_date', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as Array<Omit<CarBooking, 'customer_name' | 'customer_banned'> & { customers: Joined | Joined[] | null }>)
    .map(({ customers, ...booking }) => {
      const customer = Array.isArray(customers) ? customers[0] : customers;
      return {
        ...booking,
        customer_name: customer ? `${customer.first_name} ${customer.last_name}`.trim() : null,
        customer_banned: customer?.is_banned === true,
      };
    });
}

/** Whoever had the car on a day. Bookings store dates only, so a handover day can give two. */
export const bookingsOnDay = (bookings: readonly CarBooking[], day: string): CarBooking[] =>
  bookings.filter(booking => booking.start_date <= day && booking.end_date >= day);
