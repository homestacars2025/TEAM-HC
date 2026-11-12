import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useCurrentUser } from '../../contexts/CurrentUserContext';
import type { AppPage } from '../../contexts/PageAccessContext';
import {
  listAccounts,
  myMailboxGrants,
  subscribeToMail,
  unreadByAccount,
  type EmailAccount,
  type MailboxGrant,
} from './mailApi';

/**
 * Which mailboxes the signed-in person may open in the team Inbox.
 *
 * An admin sees every active mailbox. Anyone else sees the ones an admin granted
 * them in `email_account_access`, and sends only from those marked `can_send`.
 * This decides the nav item, the route and every query on the page, so the three
 * can't disagree.
 */

const BADGE_POLL_MS = 30_000;

/**
 * The Inbox's nav entry. Not a row in `app_pages` — whether it shows depends on
 * mailbox grants, not on page access — so the sidebar adds it itself.
 */
export const MAIL_PAGE: AppPage = {
  key: 'mail',
  label_en: 'Inbox',
  label_ar: 'البريد',
  route: '/dashboard/mail',
  group_key: 'main',
  sort_order: 1000,
};

interface MailAccessValue {
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
  /** Mailboxes this person may read, in the admin's order. */
  accounts: EmailAccount[];
  accountIds: string[];
  /** Mailboxes this person may send from. */
  sendableAccounts: EmailAccount[];
  canSendFrom: (accountId: string | null) => boolean;
  /** Unread received mail across their mailboxes, for the nav badge. */
  unreadTotal: number;
  refresh: () => void;
}

const MailAccessContext = createContext<MailAccessValue>({
  loading: false,
  error: null,
  isAdmin: false,
  accounts: [],
  accountIds: [],
  sendableAccounts: [],
  canSendFrom: () => false,
  unreadTotal: 0,
  refresh: () => {},
});

export const MailAccessProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userId, profile, ready } = useCurrentUser();
  const isAdmin = profile?.role === 'admin';
  const [allAccounts, setAllAccounts] = useState<EmailAccount[]>([]);
  const [grants, setGrants] = useState<MailboxGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!ready) return undefined;
    if (!userId) { setLoading(false); return undefined; }
    let active = true;
    setLoading(true);
    Promise.all([listAccounts(), isAdmin ? Promise.resolve([]) : myMailboxGrants(userId)])
      .then(([accountRows, grantRows]) => {
        if (!active) return;
        setAllAccounts(accountRows);
        setGrants(grantRows);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'mail access failed');
        setAllAccounts([]);
        setGrants([]);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [ready, userId, isAdmin, attempt]);

  const accounts = useMemo(() => {
    if (isAdmin) return allAccounts;
    const granted = new Set(grants.map((g) => g.accountId));
    return allAccounts.filter((a) => granted.has(a.id));
  }, [allAccounts, grants, isAdmin]);

  const accountIds = useMemo(() => accounts.map((a) => a.id), [accounts]);
  const idsKey = accountIds.join(',');

  const canSendFrom = useCallback((accountId: string | null) => {
    if (!accountId || !accountIds.includes(accountId)) return false;
    return isAdmin || grants.some((g) => g.accountId === accountId && g.canSend);
  }, [accountIds, grants, isAdmin]);

  const sendableAccounts = useMemo(() => accounts.filter((a) => canSendFrom(a.id)), [accounts, canSendFrom]);

  // The nav badge stays live without the page open.
  useEffect(() => {
    const ids = idsKey ? idsKey.split(',') : [];
    if (ids.length === 0) { setUnreadTotal(0); return undefined; }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = () => {
      unreadByAccount(ids)
        .then((map) => { if (active) setUnreadTotal(Object.values(map).reduce((sum, n) => sum + n, 0)); })
        .catch(() => { /* a badge that's briefly stale is fine */ });
    };
    load();
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(load, 400);
    };
    const stop = subscribeToMail((change) => {
      if (change.event !== 'DELETE' && !ids.includes(change.row.account_id ?? '')) return;
      schedule();
    });
    // email_messages isn't in the realtime publication yet: the poll is what keeps the badge current.
    const poll = setInterval(() => { if (document.visibilityState === 'visible') load(); }, BADGE_POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') schedule(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      active = false;
      stop();
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      if (timer) clearTimeout(timer);
    };
  }, [idsKey]);

  const value = useMemo<MailAccessValue>(() => ({
    loading: loading || !ready,
    error,
    isAdmin,
    accounts,
    accountIds,
    sendableAccounts,
    canSendFrom,
    unreadTotal,
    refresh: () => setAttempt((n) => n + 1),
  }), [loading, ready, error, isAdmin, accounts, accountIds, sendableAccounts, canSendFrom, unreadTotal]);

  return <MailAccessContext.Provider value={value}>{children}</MailAccessContext.Provider>;
};

export const useMailAccess = () => useContext(MailAccessContext);

/** The nav item and the route both read this: an admin, or anyone with a mailbox. */
export function useHasMail(): boolean {
  const { accounts, isAdmin, loading } = useMailAccess();
  return !loading && (isAdmin || accounts.length > 0);
}
