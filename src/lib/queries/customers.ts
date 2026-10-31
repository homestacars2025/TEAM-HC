import { supabase } from '../supabase';

/**
 * Finding a customer, and deciding whether they can be booked. The ban itself is set
 * in the Admin dashboard; the database is the final guard, through triggers on
 * `customers` and `bookings`. These calls exist so staff find out early and in words.
 */

export type CustomerMatchType = 'id_number' | 'phone' | 'name';

export interface CustomerMatch {
  id: string;
  full_name: string;
  phone: string | null;
  id_number: string | null;
  nationality: string | null;
  is_banned: boolean;
  ban_reason: string | null;
  bookings_count: number;
  /** In lira. Positive means they owe us. */
  balance: number;
  last_booking: string | null;
  match_type: CustomerMatchType;
}

export interface BanMatch {
  customer_id: string;
  full_name: string;
  ban_reason: string | null;
  matched_on: 'customer' | 'id_number' | 'phone';
}

export interface PhoneSharer {
  id: string;
  full_name: string;
  is_banned: boolean;
}

export async function findCustomers(query: string, limit = 8): Promise<CustomerMatch[]> {
  const { data, error } = await supabase.rpc('search_customers', { p_query: query, p_limit: limit });
  if (error) throw error;
  return ((data ?? []) as CustomerMatch[]).map(row => ({
    ...row,
    bookings_count: Number(row.bookings_count),
    balance: Number(row.balance),
  }));
}

/** `null` means not banned. Throws when the check itself fails: no answer is not a yes. */
export async function customerBanMatch(customerId: string | null, idNumber: string | null, phone: string | null): Promise<BanMatch | null> {
  const { data, error } = await supabase.rpc('customer_ban_match', {
    p_customer: customerId,
    p_id_number: idNumber,
    p_phone: phone,
  });
  if (error) throw error;
  return ((data ?? []) as BanMatch[])[0] ?? null;
}

/**
 * For a booking that already exists. Extending one doesn't change its customer, so the
 * database trigger never runs, and this check is the only thing that stops it.
 */
export async function banForExistingCustomer(customerId: string): Promise<BanMatch | null> {
  const { data, error } = await supabase.from('customers').select('id_number, phone').eq('id', customerId).single();
  if (error) throw error;
  const customer = data as { id_number: string | null; phone: string | null };
  return customerBanMatch(customerId, customer.id_number, customer.phone);
}

export async function customersWithPhone(phone: string, exclude: string | null): Promise<PhoneSharer[]> {
  const { data, error } = await supabase.rpc('customers_with_phone', { p_phone: phone, p_exclude: exclude });
  if (error) throw error;
  return (data ?? []) as PhoneSharer[];
}

/** `valid_id_number` in the database: short or repeated values are placeholders, not IDs. */
export function isRealIdNumber(text: string): boolean {
  const normal = text.replace(/[\s.-]/g, '').toUpperCase();
  return normal.length >= 6 && !/^(.)\1*$/.test(normal);
}

export type CustomerRefusal =
  | { kind: 'banned'; name: string; reason: string }
  | { kind: 'duplicate'; name: string; customerId: string | null };

/** The two refusals the triggers raise, or `null` for any other error. */
export function parseCustomerError(message: string | null | undefined): CustomerRefusal | null {
  if (!message) return null;
  const banned = message.match(/CUSTOMER_BANNED:\s*(.*?)\s+is banned(?:\s*\(matched on \w+\))?\.?\s*(?:Reason:\s*([\s\S]*))?$/);
  if (banned) return { kind: 'banned', name: banned[1].trim(), reason: (banned[2] ?? '').trim() };
  if (!message.includes('DUPLICATE_ID_NUMBER')) return null;
  const duplicate = message.match(/registered for\s+(.*?)\s*\(([0-9a-f-]{36})\)/i);
  return { kind: 'duplicate', name: duplicate?.[1].trim() ?? '', customerId: duplicate?.[2] ?? null };
}

export interface TypedCustomer {
  idNumber?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
}

/** What someone typed in the search box, sorted into the fields of the new customer form. */
export function classifyTyped(text: string): TypedCustomer {
  const typed = text.trim();
  if (!typed) return {};
  if (/^[+\d\s()-]+$/.test(typed)) {
    const digits = typed.replace(/\D/g, '');
    const looksLikePhone = typed.startsWith('+') || digits.startsWith('0') || (digits.length === 10 && digits.startsWith('5'));
    return looksLikePhone ? { phone: typed } : { idNumber: digits };
  }
  // Letters and digits together are a passport number. A name has no digits.
  if (/\d/.test(typed)) return { idNumber: typed.replace(/\s+/g, '') };
  const [firstName, ...rest] = typed.split(/\s+/);
  return { firstName, lastName: rest.join(' ') };
}
