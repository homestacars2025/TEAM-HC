import { supabase } from '../supabase';

/** IN − OUT across everything on file, the same sum `extend_booking` reports as the new balance. */
export async function customerBalance(customerId: number | string): Promise<number> {
  const { data, error } = await supabase
    .from('customer_accounting_ledger')
    .select('amount, direction')
    .eq('customer_id', customerId);
  if (error) throw error;
  return ((data ?? []) as { amount: number; direction: string }[])
    .reduce((sum, row) => sum + (row.direction === 'IN' ? Number(row.amount) : -Number(row.amount)), 0);
}

/**
 * `extend_booking` writes its own ledger descriptions and takes none, so the original
 * amount and rate are added to the row it just made. Only the wording changes, never a
 * figure, and nothing reads this text, so a failure costs the note and nothing else.
 */
export async function appendLedgerNote(bookingId: number, prefix: string, note: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('customer_accounting_ledger')
    .select('id, description')
    .eq('booking_id', bookingId)
    .like('description', `${prefix} (%`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return false;
  const row = data as { id: string; description: string };
  const { error: updateError } = await supabase
    .from('customer_accounting_ledger')
    .update({ description: `${row.description}${note}` })
    .eq('id', row.id);
  return !updateError;
}
