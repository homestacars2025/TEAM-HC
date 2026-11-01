import { supabase } from '../supabase';
import type { MatchTarget, PostedCar, ReviewExpense } from '../expenseReview';
import type { StaffAvatarProfile } from '../staffAvatar';

/** `cars` also holds who owns each car. Only the plate is asked for. */
const MOVEMENT_COLUMNS = `
  id, employee_id, transaction_date, direction, category, amount, description, receipt_url, created_at,
  expense_scope, car_id, review_status, reviewed_at, review_note, posted_car_tx_id, posted_company_expense_id,
  car:car_id(plate_number), supplier:supplier_id(name, category)
`;

export async function getCustodyMovements(): Promise<ReviewExpense[]> {
  const { data, error } = await supabase
    .from('employee_wallets')
    .select(MOVEMENT_COLUMNS)
    .order('transaction_date', { ascending: false })
    .order('id', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as ReviewExpense[]).map(row => ({ ...row, amount: Number(row.amount) }));
}

/** Through the staff view, which has no investor or commission in it. */
export async function getPostedCars(ids: number[]): Promise<Map<number, PostedCar>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from('team_car_transactions').select('id, car_id, plate_number').in('id', ids);
  if (error) throw error;
  return new Map(((data ?? []) as PostedCar[]).map(row => [row.id, row]));
}

export async function getPendingReviewCount(): Promise<number> {
  const { count, error } = await supabase
    .from('employee_wallets')
    .select('id', { count: 'exact', head: true })
    .eq('direction', 'OUT')
    .eq('review_status', 'pending');
  if (error) throw error;
  return count ?? 0;
}

export async function getWalletBalances(): Promise<Map<string, number>> {
  const { data, error } = await supabase.from('employee_wallet_balances').select('employee_id, balance');
  if (error) throw error;
  return new Map(((data ?? []) as { employee_id: string; balance: number }[]).map(row => [row.employee_id, Number(row.balance)]));
}

export interface FinanceSigner extends StaffAvatarProfile {
  profile_id: string;
  full_name: string | null;
  role: string;
}

/** Admins first, then finance staff, the order of the columns. */
export async function getFinanceSigners(): Promise<FinanceSigner[]> {
  const { data, error } = await supabase.rpc('finance_signers');
  if (error) throw error;
  return (data ?? []) as FinanceSigner[];
}

/** Expense id → who signed it → when. */
export type Signatures = Map<number, Map<string, string>>;

export async function getSignatures(): Promise<Signatures> {
  const { data, error } = await supabase.from('custody_expense_signatures').select('expense_id, profile_id, signed_at');
  if (error) throw error;
  const signatures: Signatures = new Map();
  for (const row of (data ?? []) as { expense_id: number; profile_id: string; signed_at: string }[]) {
    if (!signatures.has(row.expense_id)) signatures.set(row.expense_id, new Map());
    signatures.get(row.expense_id)?.set(row.profile_id, row.signed_at);
  }
  return signatures;
}

export async function signExpense(id: number, sign: boolean): Promise<void> {
  const { error } = await supabase.rpc('finance_sign_custody_expense', { p_id: id, p_sign: sign });
  if (error) throw error;
}

export interface ExpenseMatch {
  /** `null` lets the server choose from the expense itself, for bulk confirmation. */
  target: MatchTarget | null;
  carId: number | null;
  category: string | null;
  note: string | null;
}

export interface MatchResult {
  target: MatchTarget;
  car_tx_id: number | null;
  company_expense_id: number | null;
}

/** The five-argument approval, which also signs. The older two-argument one does not. */
export async function matchExpense(id: number, match: ExpenseMatch): Promise<MatchResult> {
  const { data, error } = await supabase.rpc('finance_approve_custody_expense', {
    p_id: id, p_note: match.note, p_target: match.target, p_car_id: match.carId, p_category: match.category,
  });
  if (error) throw error;
  return data as MatchResult;
}

export async function rejectExpense(id: number, reason: string): Promise<void> {
  const { error } = await supabase.rpc('finance_reject_custody_expense', { p_id: id, p_reason: reason });
  if (error) throw error;
}

export async function deleteWalletEntry(id: number): Promise<void> {
  const { error } = await supabase.from('employee_wallets').delete().eq('id', id);
  if (error) throw error;
}
