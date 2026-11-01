import { useEffect, useState } from 'react';
import { getPaymentAccounts } from '../lib/queries/payments';
import type { PaymentAccount } from '../lib/payments';

/** `null` while loading. A failed read leaves it empty, which only blocks non-cash methods. */
export function usePaymentAccounts(): PaymentAccount[] | null {
  const [accounts, setAccounts] = useState<PaymentAccount[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    getPaymentAccounts()
      .then(rows => { if (!cancelled) setAccounts(rows); })
      .catch(() => { if (!cancelled) setAccounts([]); });
    return () => { cancelled = true; };
  }, []);
  return accounts;
}
