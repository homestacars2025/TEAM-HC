import { supabase } from '../supabase';
import { LEDGER_STAMP_COLUMNS } from '../ledgerActors';
import type { LedgerCustomer } from '../customerLedger';
import type { ReplacementRow, WalletBookingRow, WalletLineRow } from '../bookingWallet';

/** Named columns only. Who owns a car never reaches a customer's wallet. */
const LINE_COLUMNS = `id, booking_id, customer_id, car_id, type, description, amount, direction, exchange_rate_at_entry, created_at, pay_method, payment_ref, event_no, ${LEDGER_STAMP_COLUMNS}, cars(plate_number)`;
const BOOKING_COLUMNS = 'id, booking_number, customer_id, car_id, start_date, end_date, status, is_currently_active, cars(plate_number, model_group(name))';
const SHEET_COLUMNS = 'original_booking_id, original_car_id, replacement_car_id, start_date, original:cars!replacement_sheets_original_car_id_fkey(plate_number), replacement:cars!replacement_sheets_replacement_car_id_fkey(plate_number)';

type Joined<T> = T | T[] | null;
const firstOf = <T,>(value: Joined<T> | undefined): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null);

interface BookingQueryRow extends Omit<WalletBookingRow, 'plate' | 'model'> {
  cars: Joined<{ plate_number: string | null; model_group: Joined<{ name: string | null }> }>;
}

export interface CustomerWalletData {
  customer: LedgerCustomer & { id: string };
  rows: WalletLineRow[];
  bookings: WalletBookingRow[];
  replacements: ReplacementRow[];
}

interface SheetQueryRow extends Omit<ReplacementRow, 'original_plate' | 'replacement_plate'> {
  original: Joined<{ plate_number: string | null }>;
  replacement: Joined<{ plate_number: string | null }>;
}

export async function getCustomerWallet(customerId: string): Promise<CustomerWalletData> {
  const [customer, lines, bookings, sheets] = await Promise.all([
    supabase.from('customers').select('id, first_name, last_name, is_banned, ban_reason').eq('id', customerId).single(),
    supabase.from('customer_accounting_ledger').select(LINE_COLUMNS).eq('customer_id', customerId).order('created_at').order('id').limit(5000),
    supabase.from('bookings').select(BOOKING_COLUMNS).eq('customer_id', customerId).order('start_date', { ascending: false }),
    supabase.from('replacement_sheets').select(SHEET_COLUMNS).eq('customer_id', customerId).is('deleted_at', null),
  ]);
  const failure = customer.error ?? lines.error ?? bookings.error ?? sheets.error;
  if (failure) throw failure;
  return {
    customer: customer.data as CustomerWalletData['customer'],
    rows: ((lines.data ?? []) as unknown as WalletLineRow[]).map(row => ({ ...row, amount: Number(row.amount) })),
    bookings: ((bookings.data ?? []) as unknown as BookingQueryRow[]).map(({ cars, ...booking }) => {
      const car = firstOf(cars);
      return { ...booking, plate: car?.plate_number ?? null, model: firstOf(car?.model_group)?.name?.replace(/\s+/g, ' ').trim() ?? null };
    }),
    replacements: ((sheets.data ?? []) as unknown as SheetQueryRow[]).map(({ original, replacement, ...sheet }) => ({
      ...sheet, original_plate: firstOf(original)?.plate_number ?? null, replacement_plate: firstOf(replacement)?.plate_number ?? null,
    })),
  };
}

export interface TransferResult { ref: string; amount: number; from: string; to: string; from_balance_after: number }

/** `amount` signed like the balance. */
export async function transferBookingBalance(fromBooking: number, toBooking: number, amount: number, note: string): Promise<TransferResult> {
  const { data, error } = await supabase.rpc('transfer_booking_balance', {
    p_from_booking: fromBooking,
    p_to_booking: toBooking,
    p_amount: amount,
    p_note: note.trim() || null,
  });
  if (error) throw error;
  return data as TransferResult;
}
