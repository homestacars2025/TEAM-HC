import { useCallback, useEffect, useMemo, useState } from 'react';
import { summarise, type CarCompliance } from '../lib/carCompliance';
import { getCarCompliance } from '../lib/queries/carCompliance';

export function useCarCompliance(enabled = true) {
  const [cars, setCars] = useState<CarCompliance[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setFailed(false);
    getCarCompliance()
      .then(rows => { if (!cancelled) setCars(rows); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [enabled, attempt]);

  const refresh = useCallback(() => setAttempt(n => n + 1), []);
  const summary = useMemo(() => summarise(cars ?? []), [cars]);
  const byId = useMemo(() => new Map((cars ?? []).map(car => [car.id, car])), [cars]);

  return { cars, failed, settled: cars !== null || failed, summary, byId, refresh };
}
