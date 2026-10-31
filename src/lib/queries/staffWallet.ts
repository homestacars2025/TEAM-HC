import { supabase } from '../supabase';

/**
 * The signed-in person's pay: what the company owes them. Not custody, which is
 * company money they hold. Entries are written from Admin; here they are only read.
 *
 * RLS already hides other people's rows from staff, but it lets an admin read every
 * row, so each query names the person. Without that an admin's "My wallet" would add
 * up the whole team's salaries.
 */

export const ENTRY_TYPES = ['salary', 'bonus', 'advance', 'deduction', 'payout'] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

export interface WalletEntry {
  id: number;
  entry_type: EntryType;
  /** Always positive; the type decides the sign. */
  amount: number;
  /** First day of the pay month. */
  month: string;
  note: string | null;
  receipt_url: string | null;
  created_at: string;
}

export interface WalletEntryWithBalance extends WalletEntry {
  /** The balance straight after this entry. */
  running: number;
}

export interface WalletTotals {
  earned: number;
  paid: number;
}

const isEarning = (type: EntryType) => type === 'salary' || type === 'bonus';

/** Salary and bonus add to what is owed; everything else takes away from it. */
export const signedAmount = (entry: Pick<WalletEntry, 'entry_type' | 'amount'>): number =>
  isEarning(entry.entry_type) ? entry.amount : -entry.amount;

/** Oldest first, the order a running balance has to be worked out in. */
export async function getMyWalletEntries(userId: string): Promise<WalletEntry[]> {
  const { data, error } = await supabase
    .from('staff_wallet_entries')
    .select('id, entry_type, amount, month, note, receipt_url, created_at')
    .eq('profile_id', userId)
    .is('voided_at', null)
    .order('created_at')
    .order('id');
  if (error) throw error;
  return ((data ?? []) as WalletEntry[]).map(row => ({ ...row, amount: Number(row.amount) }));
}

export async function getMyWalletBalance(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('staff_wallet_balances')
    .select('balance')
    .eq('profile_id', userId)
    .maybeSingle();
  if (error) throw error;
  return Number(data?.balance ?? 0);
}

/** `null` when no active salary is set. */
export async function getMyMonthlySalary(userId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('staff_salary_settings')
    .select('monthly_salary, is_active')
    .eq('profile_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.is_active ? Number(data.monthly_salary) : null;
}

export function withRunningBalance(rows: WalletEntry[]): WalletEntryWithBalance[] {
  let running = 0;
  return rows.map(row => {
    running += signedAmount(row);
    return { ...row, running };
  });
}

/**
 * `month` is `YYYY-MM`; leave it out for all time. "Paid" means payouts only, the same
 * as `total_paid` in the view: an advance lowers the balance but is counted separately.
 */
export function walletTotals(rows: WalletEntry[], month?: string): WalletTotals {
  const totals: WalletTotals = { earned: 0, paid: 0 };
  for (const row of rows) {
    if (month && !row.month.startsWith(month)) continue;
    if (isEarning(row.entry_type)) totals.earned += row.amount;
    else if (row.entry_type === 'payout') totals.paid += row.amount;
  }
  return totals;
}

export const walletBalance = (rows: WalletEntry[]): number =>
  rows.reduce((sum, row) => sum + signedAmount(row), 0);
