import { useCallback, useEffect, useState } from 'react';
import { onMediaRevalidate } from './_actions';

/**
 * The SPA stand-in for a server page: fetch once on mount, then re-fetch whenever
 * an action calls `revalidateMedia()`. `loading` is true only for the first load,
 * so a background revalidation never flashes the skeleton back over live content.
 */
export function useMediaData<T>(load: () => Promise<T>): { data: T | null; loading: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  const run = useCallback(async (active: () => boolean) => {
    const next = await load();
    if (!active()) return;
    setData(next);
    setLoading(false);
    // `load` is defined inline by each page; re-running on identity change would
    // loop, and there is nothing to close over that changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let alive = true;
    const isAlive = () => alive;
    run(isAlive);
    const unsubscribe = onMediaRevalidate(() => { run(isAlive); });
    return () => { alive = false; unsubscribe(); };
  }, [run]);

  return { data, loading };
}
