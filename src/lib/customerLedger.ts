import { supabase } from './supabase';
import type { Currency } from './CurrencyContext';

export type Direction = 'IN' | 'OUT';

export interface LedgerCustomer {
  first_name: string | null;
  last_name: string | null;
  is_banned: boolean | null;
  ban_reason: string | null;
}

export interface LedgerRow {
  id: string;
  booking_id: number | null;
  customer_id: string;
  car_id: number | null;
  type: string;
  description: string | null;
  amount: number;
  direction: Direction;
  exchange_rate_at_entry: number | null;
  created_at: string | null;
  customers: LedgerCustomer | LedgerCustomer[] | null;
  cars: { plate_number: string | null } | { plate_number: string | null }[] | null;
}

interface RateRow { currency: string; rate_to_try: number; }

const LEDGER_COLUMNS = 'id, booking_id, customer_id, car_id, type, description, amount, direction, exchange_rate_at_entry, created_at, customers(first_name, last_name, is_banned, ban_reason), cars(plate_number)';
const PAGE_ROWS = 1000;

/**
 * The whole ledger, newest first. The API returns at most 1000 rows however many
 * exist, so it is read page by page: a balance worked out from the first page alone
 * is simply wrong. `id` breaks ties, or a row could land on two pages or on neither.
 */
export async function getLedgerRows(): Promise<LedgerRow[]> {
  const rows: LedgerRow[] = [];
  for (;;) {
    const { data, error } = await supabase
      .from('customer_accounting_ledger')
      .select(LEDGER_COLUMNS)
      .order('created_at', { ascending: false })
      .order('id')
      .range(rows.length, rows.length + PAGE_ROWS - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as LedgerRow[];
    rows.push(...page.map(row => ({ ...row, amount: Number(row.amount) })));
    if (page.length < PAGE_ROWS) return rows;
  }
}

export function convertEntry(
  row: Pick<LedgerRow, 'amount' | 'exchange_rate_at_entry'>,
  currency: Currency,
  rates: RateRow[],
  fallbackUsdRate: number | null,
): { value: number; approx: boolean } {
  if (currency === 'TRY') return { value: row.amount, approx: false };

  if (currency === 'USD') {
    const stored = row.exchange_rate_at_entry;
    if (stored != null && stored > 0) return { value: row.amount / stored, approx: false };
    if (fallbackUsdRate != null && fallbackUsdRate > 0) return { value: row.amount / fallbackUsdRate, approx: true };
    return { value: 0, approx: true };
  }

  const rate = rates.find(r => r.currency === currency)?.rate_to_try;
  if (rate != null && rate > 0) return { value: row.amount / rate, approx: true };
  return { value: row.amount, approx: true };
}

const firstOf = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null);

export interface CustomerBalance {
  customerId: string;
  name: string;
  plate: string | null;
  balance: number;
}

/** Balances belong to a customer on one car, the way the wallets screen counts them. */
export function customerBalances(rows: LedgerRow[], currency: Currency, rates: RateRow[], fallbackUsdRate: number | null): CustomerBalance[] {
  const byPair = new Map<string, CustomerBalance>();
  for (const row of rows) {
    const plate = firstOf(row.cars)?.plate_number ?? null;
    const linked = row.car_id != null && !!plate;
    const key = `${linked ? row.car_id : 'none'}:${row.customer_id}`;
    let entry = byPair.get(key);
    if (!entry) {
      const person = firstOf(row.customers);
      entry = { customerId: row.customer_id, name: [person?.first_name, person?.last_name].filter(Boolean).join(' '), plate: linked ? plate : null, balance: 0 };
      byPair.set(key, entry);
    }
    const { value } = convertEntry(row, currency, rates, fallbackUsdRate);
    entry.balance += row.direction === 'IN' ? value : -value;
  }
  return Array.from(byPair.values());
}

export function ledgerTotals(balances: CustomerBalance[]) {
  const debtors = balances.filter(entry => entry.balance < -0.005).sort((a, b) => a.balance - b.balance);
  const credit = balances.filter(entry => entry.balance > 0.005);
  return {
    debtors,
    owed: debtors.reduce((sum, entry) => sum - entry.balance, 0),
    inCredit: credit.length,
    credit: credit.reduce((sum, entry) => sum + entry.balance, 0),
  };
}
