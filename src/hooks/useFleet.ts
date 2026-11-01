import { useCallback, useEffect, useRef, useState } from 'react';
import { getFleet, type Fleet } from '../lib/queries/tracking';
import type { TrackedCar } from '../lib/tracking';

const REFRESH_MS = 60_000;

const EMPTY: Fleet = { cars: [], models: new Map() };

/**
 * The live fleet, refreshed every minute while the tab is on screen. `car_tracking`
 * is not published for realtime. A refresh that fails keeps the last good figures:
 * only a first load with nothing to show is an error.
 */
export function useFleet() {
  const [fleet, setFleet] = useState<Fleet>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const latest = useRef(0);
  const loaded = useRef(false);

  const load = useCallback(async () => {
    const request = ++latest.current;
    try {
      const next = await getFleet();
      if (request !== latest.current) return;
      loaded.current = true;
      setFleet(next);
      setFailed(false);
    } catch {
      if (request === latest.current && !loaded.current) setFailed(true);
    }
    if (request === latest.current) {
      setNow(Date.now());
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => { if (!document.hidden) void load(); };
    const timer = setInterval(refresh, REFRESH_MS);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      latest.current += 1;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [load]);

  const retry = useCallback(() => {
    setLoading(true);
    setFailed(false);
    void load();
  }, [load]);

  /** A saved edit, which a refresh already on its way must not overwrite. */
  const patchCar = useCallback((id: number, patch: Partial<TrackedCar>) => {
    latest.current += 1;
    setFleet(current => ({ ...current, cars: current.cars.map(car => (car.id === id ? { ...car, ...patch } : car)) }));
  }, []);

  return { cars: fleet.cars, models: fleet.models, loading, failed, now, retry, patchCar };
}
