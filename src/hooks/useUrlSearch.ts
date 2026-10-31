import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Lets the command palette open a page already filtered to what was picked. Reacts
 * to the URL rather than only reading it at mount, because the palette can be used
 * from the page it is about to filter.
 */
export function useUrlSearch(apply: (value: string) => void): void {
  const [params] = useSearchParams();
  const value = params.get('q');

  useEffect(() => {
    if (value !== null) apply(value);
  }, [value, apply]);
}
