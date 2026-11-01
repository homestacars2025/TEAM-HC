import { supabase } from '../supabase';
import type { AccountBalance, CashAccount, Envelope, Movement } from '../envelopes';

const ENVELOPE_COLUMNS = `
  id, ref, amount, currency, holder_profile_id, status, current_account_id, booking_id, counted_amount, difference,
  difference_note, created_at, handed_at, admin_received_at,
  customer:customer_id(first_name, last_name), car:car_id(plate_number)
`;

const normalise = (rows: unknown): Envelope[] => ((rows ?? []) as Envelope[]).map(row => ({ ...row, amount: Number(row.amount) }));

/** Newest first. Row-level security limits this to their own, and the filter says so too. */
export async function getMyEnvelopes(userId: string): Promise<Envelope[]> {
  const { data, error } = await supabase.from('money_envelopes').select(ENVELOPE_COLUMNS).eq('holder_profile_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return normalise(data);
}

export async function getEnvelopes(): Promise<Envelope[]> {
  const { data, error } = await supabase.from('money_envelopes').select(ENVELOPE_COLUMNS).order('created_at', { ascending: false });
  if (error) throw error;
  return normalise(data);
}

export async function getMovements(): Promise<Movement[]> {
  const { data, error } = await supabase
    .from('money_movements')
    .select('id, ref, kind, status, from_account_id, to_account_id, amount, currency, amount_try, expected_at, note, reverses_id, created_by, created_at')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1000);
  if (error) throw error;
  return ((data ?? []) as Movement[]).map(row => ({ ...row, amount: Number(row.amount), amount_try: row.amount_try === null ? null : Number(row.amount_try) }));
}

export async function getCashAccounts(): Promise<CashAccount[]> {
  const { data, error } = await supabase.from('cash_accounts').select('id, code, name, kind, is_final, settlement_days, settles_to_account_id').eq('is_active', true).order('sort_order');
  if (error) throw error;
  return (data ?? []) as CashAccount[];
}

export async function getAccountBalances(): Promise<AccountBalance[]> {
  const { data, error } = await supabase.from('cash_account_balances').select('account_id, currency, balance');
  if (error) throw error;
  return ((data ?? []) as AccountBalance[]).map(row => ({ ...row, balance: Number(row.balance) }));
}

export async function receiveEnvelope(ref: string, counted: number, accountId: number, note: string | null): Promise<void> {
  const { error } = await supabase.rpc('finance_receive_envelope', { p_ref: ref, p_counted: counted, p_to_account_id: accountId, p_note: note });
  if (error) throw error;
}

export async function adminReceiveEnvelopes(ids: number[]): Promise<number> {
  const { data, error } = await supabase.rpc('admin_receive_envelopes', { p_ids: ids });
  if (error) throw error;
  return Number(data);
}

export async function transferMoney(from: number, to: number, amount: number, currency: string, note: string | null): Promise<string> {
  const { data, error } = await supabase.rpc('finance_transfer', { p_from: from, p_to: to, p_amount: amount, p_currency: currency, p_note: note });
  if (error) throw error;
  return data as string;
}

export async function completeMovement(id: number): Promise<void> {
  const { error } = await supabase.rpc('finance_complete_movement', { p_id: id });
  if (error) throw error;
}

export async function reverseMovement(id: number, reason: string): Promise<string> {
  const { data, error } = await supabase.rpc('admin_reverse_movement', { p_id: id, p_reason: reason });
  if (error) throw error;
  return data as string;
}
