import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

const CLEARED = 'all';

/**
 * Stat tiles double as a page's filters. The choice lives in the address (`?filter=unpaid`),
 * so a refresh or the back button keeps it. Pressing the active tile clears it.
 */
export function useTileFilter<T extends string>(allowed: readonly T[]): [T | typeof CLEARED, (next: T | typeof CLEARED) => void] {
  const [params, setParams] = useSearchParams();
  const stored = params.get('filter');
  const active = allowed.includes(stored as T) ? stored as T : CLEARED;

  const toggle = useCallback((next: T | typeof CLEARED) => {
    setParams(current => {
      const params = new URLSearchParams(current);
      if (next === CLEARED || next === params.get('filter')) params.delete('filter');
      else params.set('filter', next);
      return params;
    }, { replace: true });
  }, [setParams]);

  return [active, toggle];
}
