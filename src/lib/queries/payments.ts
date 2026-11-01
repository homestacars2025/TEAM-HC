import { supabase } from '../supabase';
import type { PaymentAccount, PaymentDraft, PaymentType } from '../payments';
import { parseAmount } from '../custodyExpense';

/** Where a payment can land. Safes take cash through an envelope, never directly. */
export async function getPaymentAccounts(): Promise<PaymentAccount[]> {
  const { data, error } = await supabase.from('cash_accounts').select('id, name, kind').eq('is_active', true).in('kind', ['bank', 'pos', 'gateway']).order('sort_order');
  if (error) throw error;
  return (data ?? []) as PaymentAccount[];
}

export interface RecordedPayment {
  ledger_id: string;
  amount_try: number;
  envelope_ref: string | null;
  movement_ref: string;
}

/** The only way a payment or deposit reaches the ledger: it also makes the envelope and the movement. */
export async function recordPayment(bookingId: number, type: PaymentType, draft: PaymentDraft, note: string | null): Promise<RecordedPayment> {
  const { data, error } = await supabase.rpc('record_customer_payment', {
    p_booking_id: bookingId,
    p_type: type,
    p_amount: parseAmount(draft.amount),
    p_currency: draft.currency,
    p_method: draft.method,
    p_account_id: draft.method === 'cash' ? null : draft.accountId,
    p_note: note,
  });
  if (error) throw error;
  return data as RecordedPayment;
}
