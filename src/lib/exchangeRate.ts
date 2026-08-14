import { supabase } from './supabase';

/**
 * Reads the current USD → TRY rate from `exchange_rates`.
 *
 * Every writer of `customer_accounting_ledger` stamps the result on
 * `exchange_rate_at_entry` so historical rows can be valued in USD at the rate
 * that applied when they were created, rather than at today's rate.
 *
 * @returns the positive rate, or `null` when it cannot be read — callers must
 *          decide whether to block (manual entry) or skip the stamp (automation).
 */
export async function fetchCurrentUsdRate(): Promise<number | null> {
  const { data } = await supabase
    .from('exchange_rates')
    .select('rate_to_try')
    .eq('currency', 'USD')
    .maybeSingle();
  const rate = data?.rate_to_try != null ? Number(data.rate_to_try) : null;
  return rate != null && isFinite(rate) && rate > 0 ? rate : null;
}
