import { supabase } from '../supabase';
import type { ReviewExpense } from '../expenseReview';

/** `cars` also holds who owns each car. Only the plate and the model are asked for. */
const REVIEW_COLUMNS = `
  id, employee_id, transaction_date, category, amount, description, receipt_url, created_at,
  expense_scope, car_id, review_status, reviewed_at, review_note, posted_car_tx_id, posted_company_expense_id,
  car:car_id(plate_number, model_group:model_group_id(name, image_url)),
  supplier:supplier_id(name, category)
`;

export async function getReviewExpenses(): Promise<ReviewExpense[]> {
  const { data, error } = await supabase
    .from('employee_wallets')
    .select(REVIEW_COLUMNS)
    .eq('direction', 'OUT')
    .order('transaction_date', { ascending: false })
    .order('id', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as ReviewExpense[]).map(row => ({ ...row, amount: Number(row.amount) }));
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

export interface ApprovedPosting {
  car_tx_id: number | null;
  company_expense_id: number | null;
}

export async function approveExpense(id: number): Promise<ApprovedPosting> {
  const { data, error } = await supabase.rpc('finance_approve_custody_expense', { p_id: id, p_note: null });
  if (error) throw error;
  return data as ApprovedPosting;
}

export async function rejectExpense(id: number, reason: string): Promise<void> {
  const { error } = await supabase.rpc('finance_reject_custody_expense', { p_id: id, p_reason: reason });
  if (error) throw error;
}
