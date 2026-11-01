import { useCallback, useEffect, useState } from 'react';
import { getPaymentAccounts } from '../lib/queries/payments';
import type { PaymentAccount } from '../lib/payments';

export interface PaymentAccountsState {
  /** `null` while loading. */
  rows: PaymentAccount[] | null;
  failed: boolean;
  retry: () => void;
}

/** Without these no payment can be saved, so a failed read has to be retryable. */
export function usePaymentAccounts(): PaymentAccountsState {
  const [rows, setRows] = useState<PaymentAccount[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getPaymentAccounts()
      .then(data => { if (!cancelled) { setRows(data); setFailed(false); } })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [attempt]);

  const retry = useCallback(() => {
    setFailed(false);
    setAttempt(current => current + 1);
  }, []);

  return { rows, failed, retry };
}
