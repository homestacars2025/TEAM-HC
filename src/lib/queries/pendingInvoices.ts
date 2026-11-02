import { supabase } from '../supabase';
import type { InvoiceLine, PendingInvoice } from '../pendingInvoices';

const MONEY = ['rental_total', 'extras_total', 'invoice_total', 'net_amount', 'vat_amount', 'paid_total'] as const;

/** numeric can arrive as text. */
function normalize(row: PendingInvoice): PendingInvoice {
  const money = Object.fromEntries(MONEY.map(key => [key, Number(row[key]) || 0]));
  const lines = ((row.lines ?? []) as InvoiceLine[]).map(line => ({ ...line, amount: Number(line.amount) || 0 }));
  return { ...row, ...money, lines };
}

/** Every month at once: it is quick, moving between months is then instant, and an empty month can say what the others hold. */
export async function getPendingInvoices(): Promise<PendingInvoice[]> {
  const { data, error } = await supabase.rpc('finance_pending_invoices', { p_month: null });
  if (error) throw error;
  return ((data ?? []) as PendingInvoice[]).map(normalize);
}

export async function markInvoices(bookingIds: number[], issued: boolean): Promise<void> {
  const { error } = await supabase.rpc('finance_mark_invoice_issued', { p_booking_ids: bookingIds, p_issued: issued });
  if (error) throw error;
}
