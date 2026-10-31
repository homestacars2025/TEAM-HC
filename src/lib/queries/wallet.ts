import { supabase } from '../supabase';

/**
 * The signed-in employee's custody. Read-only: entries are recorded on the
 * Accounting page. Every query is scoped to `employee_id`, because `employee_wallets`
 * has no row-level security and this filter is all that keeps a wallet private.
 */

export interface WalletMovement {
  id: number;
  transaction_date: string;
  direction: 'IN' | 'OUT';
  category: string | null;
  amount: number;
  description: string | null;
  receipt_url: string | null;
}

export interface WalletMovementWithBalance extends WalletMovement {
  /** The balance straight after this movement. */
  running: number;
}

export interface WalletTotals {
  received: number;
  spent: number;
}

/** Oldest first, the order a running balance has to be worked out in. */
export async function getMyWalletMovements(userId: string): Promise<WalletMovement[]> {
  const { data, error } = await supabase
    .from('employee_wallets')
    .select('id, transaction_date, direction, category, amount, description, receipt_url')
    .eq('employee_id', userId)
    .order('transaction_date')
    .order('created_at')
    .order('id');
  if (error) throw error;
  return ((data ?? []) as WalletMovement[]).map(row => ({ ...row, amount: Number(row.amount) }));
}

export async function getMyWalletBalance(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('employee_wallet_balances')
    .select('balance')
    .eq('employee_id', userId)
    .maybeSingle();
  if (error) throw error;
  return Number(data?.balance ?? 0);
}

export function withRunningBalance(rows: WalletMovement[]): WalletMovementWithBalance[] {
  let running = 0;
  return rows.map(row => {
    running += row.direction === 'IN' ? row.amount : -row.amount;
    return { ...row, running };
  });
}

/** `month` is `YYYY-MM`; leave it out for all time. */
export function walletTotals(rows: WalletMovement[], month?: string): WalletTotals {
  const totals: WalletTotals = { received: 0, spent: 0 };
  for (const row of rows) {
    if (month && !row.transaction_date.startsWith(month)) continue;
    if (row.direction === 'IN') totals.received += row.amount;
    else totals.spent += row.amount;
  }
  return totals;
}

export function walletBalance(rows: WalletMovement[]): number {
  const { received, spent } = walletTotals(rows);
  return received - spent;
}
