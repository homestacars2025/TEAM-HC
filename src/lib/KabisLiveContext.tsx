import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePageAccess } from '../contexts/PageAccessContext';
import { getKabisArrivals, getLatestKabisId, type KabisArrival } from './queries/kabis';
import { supabase } from './supabase';

/**
 * New KABIS entries, for anyone who can open the page. The check keeps running beside the
 * channel on purpose: Realtime answers SUBSCRIBED even for a table outside its publication
 * and then delivers nothing, so a connected channel proves nothing here.
 */
const CHECK_MS = 15_000;
const SHOW_MS = 8000;
const MAX_VISIBLE = 3;

interface KabisLiveValue {
  /** Goes up whenever a new entry appears. */
  version: number;
  arrivals: KabisArrival[];
  dismiss: (id: number) => void;
}

const KabisLiveContext = createContext<KabisLiveValue>({ version: 0, arrivals: [], dismiss: () => {} });

export const KabisLiveProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const canOpen = usePageAccess().allowedPages.has('kabis');
  const [version, setVersion] = useState(0);
  const [arrivals, setArrivals] = useState<KabisArrival[]>([]);
  const lastSeen = useRef<number | null>(null);
  const timers = useRef(new Set<number>());

  const dismiss = useCallback((id: number) => setArrivals(list => list.filter(item => item.id !== id)), []);

  const announce = useCallback((rows: KabisArrival[]) => {
    const fresh = rows.filter(row => lastSeen.current !== null && row.id > lastSeen.current);
    if (fresh.length === 0) return;
    lastSeen.current = Math.max(...fresh.map(row => row.id));
    setVersion(current => current + 1);
    setArrivals(list => [...fresh.reverse(), ...list].slice(0, MAX_VISIBLE));
    fresh.forEach(row => timers.current.add(window.setTimeout(() => dismiss(row.id), SHOW_MS)));
  }, [dismiss]);

  useEffect(() => {
    if (!canOpen) return undefined;
    let cancelled = false;

    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        if (lastSeen.current === null) {
          const latest = await getLatestKabisId();
          if (!cancelled) lastSeen.current = latest;
          return;
        }
        const rows = await getKabisArrivals(lastSeen.current);
        if (!cancelled) announce(rows);
      } catch {
        // Nothing to show for a missed check. The next one catches up.
      }
    };

    const channel = supabase
      .channel('kabis-entries')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'kabis_entries' }, payload => announce([payload.new as KabisArrival]))
      .subscribe();

    void check();
    const interval = window.setInterval(() => void check(), CHECK_MS);
    const onVisible = () => void check();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [canOpen, announce]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(timer => window.clearTimeout(timer));
  }, []);

  const value = useMemo(() => ({ version, arrivals, dismiss }), [version, arrivals, dismiss]);
  return <KabisLiveContext.Provider value={value}>{children}</KabisLiveContext.Provider>;
};

export const useKabisLive = () => useContext(KabisLiveContext);
