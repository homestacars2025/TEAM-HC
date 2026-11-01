import { supabase } from '../supabase';
import type { CashAccount, Supplier, SupplierBalance, SupplierCategory, SupplierCurrency, SupplierOption, SupplierTx } from '../suppliers';

const SUPPLIER_COLUMNS = 'id, name, category, contact_person, phone, whatsapp, address, district, tax_number, iban, bank_name, notes, is_active';
const LEDGER_COLUMNS = `
  id, supplier_id, kind, tx_date, amount, currency, car_id, description, receipt_url, paid_from_account_id,
  custody_expense_id, voided_at, void_reason, created_at,
  car:car_id(plate_number), account:paid_from_account_id(name)
`;

export async function getSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase.from('suppliers').select(SUPPLIER_COLUMNS).order('name');
  if (error) throw error;
  return (data ?? []) as Supplier[];
}

/** For the picker in Add expense, which everyone sees. */
export async function getSupplierOptions(): Promise<SupplierOption[]> {
  const { data, error } = await supabase.from('suppliers').select('id, name, category').eq('is_active', true).order('name');
  if (error) throw error;
  return (data ?? []) as SupplierOption[];
}

export async function getSupplierBalances(): Promise<SupplierBalance[]> {
  const { data, error } = await supabase.from('supplier_balances').select('supplier_id, currency, total_bills, total_paid, balance, last_tx');
  if (error) throw error;
  return ((data ?? []) as SupplierBalance[]).map(row => ({
    ...row,
    total_bills: Number(row.total_bills),
    total_paid: Number(row.total_paid),
    balance: Number(row.balance),
  }));
}

export async function getSupplier(id: number): Promise<Supplier | null> {
  const { data, error } = await supabase.from('suppliers').select(SUPPLIER_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data as Supplier | null;
}

export type SupplierDraft = Omit<Supplier, 'id'>;

export async function addSupplier(draft: SupplierDraft, userId: string | null): Promise<Supplier> {
  const { data, error } = await supabase.from('suppliers').insert({ ...draft, created_by: userId }).select(SUPPLIER_COLUMNS).single();
  if (error) throw error;
  return data as Supplier;
}

/** The two fields the Add expense form asks for. The rest is filled in on the Suppliers page. */
export async function addSupplierQuick(name: string, category: SupplierCategory, userId: string | null): Promise<SupplierOption> {
  const { data, error } = await supabase.from('suppliers').insert({ name, category, created_by: userId }).select('id, name, category').single();
  if (error) throw error;
  return data as SupplierOption;
}

export async function updateSupplier(id: number, draft: SupplierDraft): Promise<Supplier> {
  const { data, error } = await supabase.from('suppliers').update(draft).eq('id', id).select(SUPPLIER_COLUMNS).single();
  if (error) throw error;
  return data as Supplier;
}

/** Oldest first, the order a running balance has to be worked out in. */
export async function getSupplierLedger(supplierId: number): Promise<SupplierTx[]> {
  const { data, error } = await supabase
    .from('supplier_transactions')
    .select(LEDGER_COLUMNS)
    .eq('supplier_id', supplierId)
    .order('tx_date')
    .order('id');
  if (error) throw error;
  return ((data ?? []) as unknown as SupplierTx[]).map(row => ({ ...row, amount: Number(row.amount) }));
}

export interface NewSupplierTx {
  supplier_id: number;
  kind: SupplierTx['kind'];
  tx_date: string;
  amount: number;
  currency: SupplierCurrency;
  car_id: number | null;
  description: string | null;
  receipt_url: string | null;
  paid_from_account_id: number | null;
}

export async function addSupplierTx(tx: NewSupplierTx, userId: string | null): Promise<void> {
  const { error } = await supabase.from('supplier_transactions').insert({ ...tx, created_by: userId });
  if (error) throw error;
}

export async function voidSupplierTx(id: number, reason: string): Promise<void> {
  const { error } = await supabase.from('supplier_transactions').update({ voided_at: new Date().toISOString(), void_reason: reason }).eq('id', id).select('id').single();
  if (error) throw error;
}

export async function getCashAccounts(): Promise<CashAccount[]> {
  const { data, error } = await supabase.from('cash_accounts').select('id, name, currencies').eq('is_active', true).order('sort_order');
  if (error) throw error;
  return (data ?? []) as CashAccount[];
}
