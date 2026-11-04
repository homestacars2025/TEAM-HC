import { supabase } from '../supabase';
import { istanbulDate } from '../istanbulTime';
import type { ExpenseCar, ExpenseScope } from '../custodyExpense';
import type { ReviewStatus } from '../expenseReview';
import type { SupplierOption } from '../suppliers';

/**
 * The signed-in employee's custody: company money they hold, not money they earned.
 * Money in is recorded on the Accounting page; staff log their own expenses through
 * two RPCs. Every read is scoped to `employee_id`, because `employee_wallets` has no
 * row-level security and this filter is all that keeps it private.
 */

const RECEIPT_BUCKET = 'employee_wallets';

export interface CustodyMovement {
  id: number;
  transaction_date: string;
  direction: 'IN' | 'OUT';
  category: string | null;
  amount: number;
  description: string | null;
  receipt_url: string | null;
  created_at: string | null;
  created_by: string | null;
  expense_scope: ExpenseScope | null;
  car_id: number | null;
  supplier_id: number | null;
  posted_car_tx_id: number | null;
  posted_company_expense_id: number | null;
  review_status: ReviewStatus;
  reviewed_at: string | null;
  review_note: string | null;
  /** Kept for the row even once the car has left the fleet. */
  car: { plate_number: string } | null;
  supplier: Pick<SupplierOption, 'name' | 'category'> | null;
}

export interface CustodyMovementWithBalance extends CustodyMovement {
  /** The balance straight after this movement. */
  running: number;
}

export interface CustodyTotals {
  received: number;
  spent: number;
}

/** Oldest first, the order a running balance has to be worked out in. */
export async function getMyCustodyMovements(userId: string): Promise<CustodyMovement[]> {
  const { data, error } = await supabase
    .from('employee_wallets')
    .select('id, transaction_date, direction, category, amount, description, receipt_url, created_at, created_by, expense_scope, car_id, supplier_id, posted_car_tx_id, posted_company_expense_id, review_status, reviewed_at, review_note, car:car_id(plate_number), supplier:supplier_id(name, category)')
    .eq('employee_id', userId)
    .order('transaction_date')
    .order('created_at')
    .order('id');
  if (error) throw error;
  return ((data ?? []) as unknown as CustodyMovement[]).map(row => ({ ...row, amount: Number(row.amount) }));
}

/** Only what the picker shows. `cars` also holds investor details, which stay out. */
export async function getActiveCars(): Promise<ExpenseCar[]> {
  const { data, error } = await supabase
    .from('cars')
    .select('id, plate_number, model_group:model_group_id(name)')
    .eq('is_active', true);
  if (error) throw error;
  type Row = { id: number; plate_number: string; model_group: { name: string } | { name: string }[] | null };
  return ((data ?? []) as unknown as Row[]).map(row => {
    const group = Array.isArray(row.model_group) ? row.model_group[0] : row.model_group;
    return { id: row.id, plate_number: row.plate_number, model: group?.name ?? null };
  });
}

export function receiptPath(userId: string, file: Pick<File, 'name' | 'type'>, id: string = crypto.randomUUID(), today = istanbulDate()): string {
  const fromType = file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1]?.replace('jpeg', 'jpg');
  const fromName = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : undefined;
  return `${userId}/${today.slice(0, 7)}/${id}.${fromType || fromName || 'jpg'}`;
}

/**
 * `{user}/{yyyy-mm}/{uuid}.{ext}`, the only folder the storage policy lets them write.
 * A plain request rather than the Supabase client, which reports no upload progress.
 */
export async function uploadCustodyReceipt(userId: string, file: File, onProgress: (percent: number) => void): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');

  const path = receiptPath(userId, file);
  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `${process.env.REACT_APP_SUPABASE_URL}/storage/v1/object/${RECEIPT_BUCKET}/${path}`);
    request.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
    request.setRequestHeader('apikey', process.env.REACT_APP_SUPABASE_ANON_KEY as string);
    request.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    request.upload.onprogress = event => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => (request.status >= 200 && request.status < 300 ? resolve() : reject(new Error(`Upload failed: ${request.status}`)));
    request.onerror = () => reject(new Error('Upload failed'));
    request.send(file);
  });
  return supabase.storage.from(RECEIPT_BUCKET).getPublicUrl(path).data.publicUrl;
}

export interface NewCustodyExpense {
  amount: number;
  category: string;
  /** Optional: `null` when they wrote nothing. */
  description: string | null;
  date: string;
  scope: ExpenseScope;
  carId: number | null;
  receiptUrl: string;
  supplierId: number | null;
}

export async function addCustodyExpense(expense: NewCustodyExpense): Promise<number> {
  const { data, error } = await supabase.rpc('staff_add_custody_expense', {
    p_amount: expense.amount,
    p_category: expense.category,
    p_description: expense.description,
    p_date: expense.date,
    p_scope: expense.scope,
    p_car_id: expense.scope === 'car' ? expense.carId : null,
    p_receipt_url: expense.receiptUrl,
    p_supplier_id: expense.supplierId,
  });
  if (error) throw error;
  return Number(data);
}

export interface CustodyExpenseChanges extends Omit<NewCustodyExpense, 'receiptUrl'> {
  /** `null` keeps the receipt already on it. */
  receiptUrl: string | null;
}

/** Their own, while pending or rejected. Saving sends it back for review and drops finance's signatures. */
export async function updateCustodyExpense(id: number, expense: CustodyExpenseChanges): Promise<void> {
  const { error } = await supabase.rpc('staff_update_custody_expense', {
    p_id: id,
    p_amount: expense.amount,
    p_category: expense.category,
    p_description: expense.description,
    p_date: expense.date,
    p_scope: expense.scope,
    p_car_id: expense.scope === 'car' ? expense.carId : null,
    p_receipt_url: expense.receiptUrl,
    p_supplier_id: expense.supplierId,
  });
  if (error) throw error;
}

export async function deleteCustodyExpense(id: number): Promise<void> {
  const { error } = await supabase.rpc('staff_delete_custody_expense', { p_id: id });
  if (error) throw error;
}

export async function getMyCustodyBalance(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('employee_wallet_balances')
    .select('balance')
    .eq('employee_id', userId)
    .maybeSingle();
  if (error) throw error;
  return Number(data?.balance ?? 0);
}

export function withRunningCustody(rows: CustodyMovement[]): CustodyMovementWithBalance[] {
  let running = 0;
  return rows.map(row => {
    running += row.direction === 'IN' ? row.amount : -row.amount;
    return { ...row, running };
  });
}

/** `month` is `YYYY-MM`; leave it out for all time. */
export function custodyTotals(rows: CustodyMovement[], month?: string): CustodyTotals {
  const totals: CustodyTotals = { received: 0, spent: 0 };
  for (const row of rows) {
    if (month && !row.transaction_date.startsWith(month)) continue;
    if (row.direction === 'IN') totals.received += row.amount;
    else totals.spent += row.amount;
  }
  return totals;
}

export function custodyBalance(rows: CustodyMovement[]): number {
  const { received, spent } = custodyTotals(rows);
  return received - spent;
}
