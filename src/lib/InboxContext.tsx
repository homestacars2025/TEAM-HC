import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useCurrentUser } from '../contexts/CurrentUserContext';
import { playNotificationSound } from './notificationSound';
import { getMyNotifications, getOpenTasksCount, getUnreadCount } from './queries/tasks';
import { supabase } from './supabase';
import type { MyNotification } from './types/tasks';

/**
 * The bell's and the sidebar's counts, from one place, kept current two ways.
 *
 * A realtime channel delivers anything addressed to this person the moment it is
 * written. Polling carries on beside it, more slowly while the channel is up, for a
 * reason that is easy to undo by accident: most notifications (KABIS, reminders) go
 * to a section rather than a person, and those rows have no `profile_id` and are not
 * readable by staff, so the channel can never see them.
 */

/** With no channel, the poll is all there is. */
const POLL_MS = 30_000;
/** With one, it only has to catch section notifications. */
const CONNECTED_POLL_MS = 60_000;
/** How many recent rows to look through for the one that just arrived. */
const ARRIVAL_WINDOW = 10;

interface InboxValue {
  unreadCount: number;
  openTasksCount: number;
  /**
   * Re-reads both counts now. Call after any action that changes them, so the
   * badges never lag behind a click by up to a full poll interval.
   */
  refresh: () => Promise<void>;
  /** The bell's panel. Here rather than in the bell because Home opens it too. */
  notificationsOpen: boolean;
  setNotificationsOpen: (open: boolean) => void;
  /** The latest notification delivered live, for the bell and the corner toast. */
  arrival: MyNotification | null;
  /** Goes up whenever the task list may have changed. */
  tasksVersion: number;
  bumpTasks: () => void;
  /** Moves the sidebar badge ahead of the server, for an optimistic completion. */
  adjustOpenTasks: (by: number) => void;
}

const InboxContext = createContext<InboxValue>({
  unreadCount: 0,
  openTasksCount: 0,
  refresh: async () => {},
  notificationsOpen: false,
  setNotificationsOpen: () => {},
  arrival: null,
  tasksVersion: 0,
  bumpTasks: () => {},
  adjustOpenTasks: () => {},
});

export const InboxProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [openTasksCount, setOpenTasksCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [arrival, setArrival] = useState<MyNotification | null>(null);
  const [tasksVersion, setTasksVersion] = useState(0);
  const [connected, setConnected] = useState(false);
  const { userId, settings } = useCurrentUser();

  const soundOn = useRef(false);
  soundOn.current = settings?.notificationSound ?? false;
  /** Null until the first read, so loading the page is not mistaken for a new arrival. */
  const lastUnread = useRef<number | null>(null);

  // A late response from a superseded request must not overwrite a fresher one.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    const [unread, open] = await Promise.all([getUnreadCount(), getOpenTasksCount()]);
    if (!mounted.current) return;
    if (soundOn.current && lastUnread.current !== null && unread > lastUnread.current) playNotificationSound();
    lastUnread.current = unread;
    setUnreadCount(unread);
    setOpenTasksCount(open);
  }, []);

  const bumpTasks = useCallback(() => setTasksVersion(v => v + 1), []);
  const adjustOpenTasks = useCallback((by: number) => setOpenTasksCount(n => Math.max(n + by, 0)), []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, connected ? CONNECTED_POLL_MS : POLL_MS);
    // A backgrounded tab throttles timers, so a return to the tab re-reads
    // immediately rather than showing a stale badge until the next tick.
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh, connected]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const onInsert = async (notificationId: string) => {
      const recent = await getMyNotifications(ARRIVAL_WINDOW);
      if (cancelled) return;
      const notification = recent.find(n => n.id === notificationId);
      if (notification) {
        setArrival(notification);
        if (notification.event_key?.startsWith('task.')) bumpTasks();
      }
      refresh();
    };

    const channel = supabase
      .channel(`inbox-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notification_recipients', filter: `profile_id=eq.${userId}` },
        payload => { onInsert((payload.new as { notification_id: string }).notification_id); },
      )
      .subscribe(status => {
        if (!cancelled) setConnected(status === 'SUBSCRIBED');
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId, refresh, bumpTasks]);

  const value = useMemo(() => ({
    unreadCount, openTasksCount, refresh, notificationsOpen, setNotificationsOpen, arrival, tasksVersion, bumpTasks, adjustOpenTasks,
  }), [unreadCount, openTasksCount, refresh, notificationsOpen, arrival, tasksVersion, bumpTasks, adjustOpenTasks]);

  return <InboxContext.Provider value={value}>{children}</InboxContext.Provider>;
};

export const useInbox = () => useContext(InboxContext);
