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
/** Mark all writes one read row per notification; their events become one re-read. */
const REALTIME_REFRESH_MS = 300;

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
  /** Moves the bell badge ahead of the server, for an optimistic read. `null` takes it to 0. */
  adjustUnread: (by: number | null) => void;
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
  adjustUnread: () => {},
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

  /** Goes up with every read and every optimistic change, so an answer that was overtaken is dropped. */
  const unreadVersion = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++unreadVersion.current;
    const [unread, open] = await Promise.all([getUnreadCount(), getOpenTasksCount()]);
    if (!mounted.current) return;
    setOpenTasksCount(open);
    // A click made while this was in flight knows better than this answer.
    if (version !== unreadVersion.current) return;
    if (soundOn.current && lastUnread.current !== null && unread > lastUnread.current) playNotificationSound();
    lastUnread.current = unread;
    setUnreadCount(unread);
  }, []);

  const refreshTimer = useRef(0);
  const refreshSoon = useCallback(() => {
    window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => { refresh(); }, REALTIME_REFRESH_MS);
  }, [refresh]);
  useEffect(() => () => window.clearTimeout(refreshTimer.current), []);

  const bumpTasks = useCallback(() => setTasksVersion(v => v + 1), []);
  const adjustOpenTasks = useCallback((by: number) => setOpenTasksCount(n => Math.max(n + by, 0)), []);
  const adjustUnread = useCallback((by: number | null) => {
    unreadVersion.current += 1;
    const next = by === null ? 0 : Math.max((lastUnread.current ?? 0) + by, 0);
    lastUnread.current = next;
    setUnreadCount(next);
  }, []);

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
      refreshSoon();
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

    // The badge only: any new notification (row-level security shows this person
    // only theirs, sections included) and any read, from this tab or another
    // device. Its own channel, so neither table can take the one above offline.
    // Both stay silent until the tables are in the supabase_realtime publication;
    // the poll and the re-read after every click cover that.
    const counts = supabase
      .channel(`inbox-counts-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications_v2' }, () => refreshSoon())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notification_reads', filter: `profile_id=eq.${userId}` }, () => refreshSoon())
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      supabase.removeChannel(counts);
    };
  }, [userId, refreshSoon, bumpTasks]);

  const value = useMemo(() => ({
    unreadCount, openTasksCount, refresh, notificationsOpen, setNotificationsOpen, arrival, tasksVersion, bumpTasks, adjustOpenTasks, adjustUnread,
  }), [unreadCount, openTasksCount, refresh, notificationsOpen, arrival, tasksVersion, bumpTasks, adjustOpenTasks, adjustUnread]);

  return <InboxContext.Provider value={value}>{children}</InboxContext.Provider>;
};

export const useInbox = () => useContext(InboxContext);
