import { useEffect, useState } from 'react';
import { getMyEnvelopes } from '../lib/queries/envelopes';
import type { Envelope } from '../lib/envelopes';

/** `reload` changing reads them again: the account menu does that each time it opens. */
export function useMyEnvelopes(userId: string | null, reload: unknown = null) {
  const [envelopes, setEnvelopes] = useState<Envelope[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    setFailed(false);
    getMyEnvelopes(userId)
      .then(rows => { if (!cancelled) setEnvelopes(rows); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [userId, reload]);

  return { envelopes, failed };
}
