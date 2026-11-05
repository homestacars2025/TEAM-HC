/**
 * The Customer wallets list: one row per customer, the sum of all their bookings, never
 * split by car. Counted the way the wallet itself counts, so a row and its wallet agree.
 */
import { round2 } from './bookingWallet';
import type { LedgerRow } from './customerLedger';

type Joined<T> = T | T[] | null | undefined;
const firstOf = <T,>(value: Joined<T>): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null);

export interface BookingLabelRow {
  id: number;
  customer_id: string | null;
  start_date: string;
  status: string | null;
  is_currently_active: boolean | null;
  cars: Joined<{ plate_number: string | null }>;
}

export interface CustomerSummary {
  customerId: string;
  name: string;
  phone: string | null;
  banned: boolean;
  banReason: string | null;
  balance: number;
  /** Every booking the wallet lists: not cancelled, or cancelled but holding lines. */
  bookings: number;
  /** Every car they've had, newest first, no cancelled bookings, no repeats. */
  plates: string[];
  onRent: boolean;
}

export function summarizeCustomers(rows: LedgerRow[], bookings: BookingLabelRow[], unknown: string): CustomerSummary[] {
  const perBooking = new Map<string, number>();
  const people = new Map<string, { row: LedgerRow; withLines: Set<number> }>();
  for (const row of rows) {
    const key = `${row.customer_id}:${row.booking_id ?? 'none'}`;
    perBooking.set(key, (perBooking.get(key) ?? 0) + (row.direction === 'IN' ? Number(row.amount) : -Number(row.amount)));
    const person = people.get(row.customer_id) ?? { row, withLines: new Set<number>() };
    if (row.booking_id != null) person.withLines.add(row.booking_id);
    people.set(row.customer_id, person);
  }
  const balances = new Map<string, number>();
  perBooking.forEach((sum, key) => {
    const customerId = key.slice(0, key.lastIndexOf(':'));
    balances.set(customerId, (balances.get(customerId) ?? 0) + round2(sum));
  });

  const counted = new Map<string, number>();
  const plates = new Map<string, string[]>();
  const onRent = new Set<string>();
  const newestFirst = [...bookings].sort((a, b) => b.start_date.localeCompare(a.start_date) || b.id - a.id);
  for (const booking of newestFirst) {
    const customerId = booking.customer_id;
    const person = customerId ? people.get(customerId) : undefined;
    if (!customerId || !person) continue;
    const cancelled = booking.status === 'cancelled';
    if (booking.is_currently_active) onRent.add(customerId);
    if (!cancelled || person.withLines.has(booking.id)) counted.set(customerId, (counted.get(customerId) ?? 0) + 1);
    const plate = firstOf(booking.cars)?.plate_number?.trim();
    const list = plates.get(customerId) ?? [];
    if (!cancelled && plate && !list.some(seen => plateKey(seen) === plateKey(plate))) list.push(plate);
    plates.set(customerId, list);
  }

  return Array.from(people.entries()).map(([customerId, { row, withLines }]) => {
    const person = firstOf(row.customers);
    return {
      customerId,
      name: [person?.first_name, person?.last_name].filter(Boolean).join(' ').trim() || unknown,
      phone: person?.phone ?? null,
      banned: person?.is_banned === true,
      banReason: person?.ban_reason ?? null,
      balance: round2(balances.get(customerId) ?? 0),
      bookings: counted.get(customerId) ?? withLines.size,
      plates: plates.get(customerId) ?? [],
      onRent: onRent.has(customerId),
    };
  });
}

/** "34 KDT-101", "34.kdt.101" and "34KDT101" are one plate. */
export const plateKey = (plate: string) => plate.replace(/[\s.\-–]/g, '').toLocaleUpperCase('tr-TR');

const digits = (text: string) => text.replace(/\D/g, '');

/** Name, phone, or any plate they've had. */
export function matchesCustomer(entry: CustomerSummary, query: string): boolean {
  const typed = query.trim();
  if (!typed) return true;
  const lower = typed.toLocaleLowerCase('tr-TR');
  if (entry.name.toLocaleLowerCase('tr-TR').includes(lower)) return true;
  const key = plateKey(typed);
  if (key && entry.plates.some(plate => plateKey(plate).includes(key))) return true;
  const number = digits(typed);
  return number.length >= 3 && !!entry.phone && digits(entry.phone).includes(number);
}
