import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { getOpenTasksCount, getUnreadCount } from './queries/tasks';

/**
 * The two badge counts — the bell's unread count and the sidebar's open-task
 * count — polled from one place.
 *
 * The bell and the sidebar are siblings under `Layout` and both want the same
 * numbers on the same cadence. Letting each own a timer would double the
 * request rate and let the two badges disagree for up to 30 seconds, so a
 * single provider owns the interval and both read from it.
 */

const POLL_MS = 30_000;

interface InboxValue {
  unreadCount: number;
  openTasksCount: number;
  /**
   * Re-reads both counts now. Call after any action that changes them, so the
   * badges never lag behind a click by up to a full poll interval.
   */
  refresh: () => Promise<void>;
}

const InboxContext = createContext<InboxValue>({
  unreadCount: 0,
  openTasksCount: 0,
  refresh: async () => {},
});

export const InboxProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [openTasksCount, setOpenTasksCount] = useState(0);

  // A late response from a superseded request must not overwrite a fresher one.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    const [unread, open] = await Promise.all([getUnreadCount(), getOpenTasksCount()]);
    if (!mounted.current) return;
    setUnreadCount(unread);
    setOpenTasksCount(open);
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, POLL_MS);
    // A backgrounded tab throttles timers, so a return to the tab re-reads
    // immediately rather than showing a stale badge until the next tick.
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  return (
    <InboxContext.Provider value={{ unreadCount, openTasksCount, refresh }}>
      {children}
    </InboxContext.Provider>
  );
};

export const useInbox = () => useContext(InboxContext);
