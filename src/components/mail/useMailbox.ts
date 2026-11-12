import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  deleteMessages,
  getBodies,
  listMailbox,
  setArchivedMany,
  setReadMany,
  setStarred,
  subscribeToMail,
  unreadByAccount,
  type EmailBody,
  type InboxItem,
} from '../../lib/mail/mailApi';
import { groupThreads, type MailThread } from '../../lib/mail/mailThreads';

export type InboxThread = MailThread<InboxItem>;

// email_messages isn't in the realtime publication yet, so the poll is what
// actually brings new mail in today. Realtime, once enabled, just makes it sooner.
const POLL_MS = 20_000;
const DEBOUNCE_MS = 350;

/**
 * Everything the Inbox reads and writes, for exactly the mailboxes in
 * `accountIds`. Realtime events from any other mailbox are ignored, so a member
 * never sees a message, a count or a toast from a mailbox they weren't given.
 *
 * New mail is noticed by comparing each load with the last, not from a realtime
 * event, so it is announced once however the load was started.
 */
export function useMailbox(accountIds: string[], options: { ready: boolean; onNewMail?: (messages: InboxItem[]) => void }) {
  const { ready, onNewMail } = options;
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [unreadPerAccount, setUnreadPerAccount] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [bodies, setBodies] = useState<Record<string, EmailBody>>({});
  const scopeKey = accountIds.slice().sort().join(',');
  const scopeRef = useRef(accountIds);
  scopeRef.current = accountIds;
  const onNewMailRef = useRef(onNewMail);
  onNewMailRef.current = onNewMail;
  const requestSeq = useRef(0);
  /** Ids already on screen for this scope; null until the first load lands. */
  const seen = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    const scope = scopeRef.current;
    try {
      const [rows, unread] = await Promise.all([
        listMailbox(scope),
        unreadByAccount(scope).catch(() => ({} as Record<string, number>)),
      ]);
      if (seq !== requestSeq.current) return;
      const previous = seen.current;
      if (previous) {
        const arrived = rows.filter((m) => m.direction === 'inbound' && !m.isRead && !previous.has(m.id));
        if (arrived.length > 0) onNewMailRef.current?.(arrived);
      }
      seen.current = new Set(rows.map((m) => m.id));
      setItems(rows);
      setUnreadPerAccount(unread);
      setError(null);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(err instanceof Error ? err.message : 'load failed');
      setItems((current) => current ?? []);
    }
  }, []);

  useEffect(() => {
    if (!ready) return undefined;
    setItems(null);
    setBodies({});
    seen.current = null;
    void load();
    return () => { requestSeq.current += 1; };
  }, [ready, scopeKey, load]);

  useEffect(() => {
    if (!ready) return undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void load(); }, DEBOUNCE_MS);
    };
    const stop = subscribeToMail((change) => {
      const accountId = change.row.account_id ?? null;
      const inScope = accountId !== null && scopeRef.current.includes(accountId);
      if (change.event !== 'DELETE' && !inScope) return;
      schedule();
    });
    const poll = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, POLL_MS);
    // Back on the tab: catch up at once rather than at the next tick.
    const onVisible = () => { if (document.visibilityState === 'visible') schedule(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      stop();
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      if (timer) clearTimeout(timer);
    };
  }, [ready, scopeKey, load]);

  const threads = useMemo(() => (items ? groupThreads(items) : []), [items]);

  const patchItems = useCallback((ids: string[], fields: Partial<InboxItem>) => {
    const set = new Set(ids);
    setItems((current) => current && current.map((m) => (set.has(m.id) ? { ...m, ...fields } : m)));
  }, []);

  /** Optimistic; the server's state is reloaded either way, and wins. */
  const optimistic = useCallback(async (ids: string[], next: Partial<InboxItem>, write: () => Promise<void>) => {
    patchItems(ids, next);
    try {
      await write();
    } finally {
      void load();
    }
  }, [patchItems, load]);

  const loadBodies = useCallback(async (thread: InboxThread) => {
    const missing = thread.messages.map((m) => m.id).filter((id) => !bodies[id]);
    if (missing.length === 0) return;
    const fetched = await getBodies(missing, scopeRef.current);
    setBodies((current) => ({ ...current, ...fetched }));
  }, [bodies]);

  const markThreadRead = useCallback((thread: InboxThread) => {
    const ids = thread.messages.filter((m) => !m.isRead).map((m) => m.id);
    if (ids.length === 0) return Promise.resolve();
    return optimistic(ids, { isRead: true }, () => setReadMany(ids, true));
  }, [optimistic]);

  /** The latest message we received goes back to unread — what the list shows in bold. */
  const markThreadUnread = useCallback((thread: InboxThread) => {
    const target = [...thread.messages].reverse().find((m) => m.direction === 'inbound') ?? thread.latest;
    return optimistic([target.id], { isRead: false }, () => setReadMany([target.id], false));
  }, [optimistic]);

  const toggleStar = useCallback((message: InboxItem) => {
    const next = !message.isStarred;
    return optimistic([message.id], { isStarred: next }, () => setStarred(message.id, next));
  }, [optimistic]);

  const toggleThreadStar = useCallback((thread: InboxThread) => {
    if (thread.starred) {
      const ids = thread.messages.filter((m) => m.isStarred).map((m) => m.id);
      return optimistic(ids, { isStarred: false }, async () => { await Promise.all(ids.map((id) => setStarred(id, false))); });
    }
    return optimistic([thread.latest.id], { isStarred: true }, () => setStarred(thread.latest.id, true));
  }, [optimistic]);

  const setThreadArchived = useCallback((thread: InboxThread, archived: boolean) => {
    const ids = thread.messages.map((m) => m.id);
    return optimistic(ids, { isArchived: archived }, () => setArchivedMany(ids, archived));
  }, [optimistic]);

  const deleteThread = useCallback(async (thread: InboxThread) => {
    const ids = thread.messages.map((m) => m.id);
    await deleteMessages(ids);
    const gone = new Set(ids);
    setItems((current) => current && current.filter((m) => !gone.has(m.id)));
    void load();
  }, [load]);

  return {
    threads,
    loading: items === null,
    error,
    unreadPerAccount,
    bodies,
    reload: load,
    loadBodies,
    markThreadRead,
    markThreadUnread,
    toggleStar,
    toggleThreadStar,
    setThreadArchived,
    deleteThread,
  };
}
