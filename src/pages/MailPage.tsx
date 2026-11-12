import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Menu, Search, TriangleAlert, X } from 'lucide-react';
import { Toaster } from '../components/ui/sonner';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';
import { useMailAccess } from '../lib/mail/MailAccessContext';
import { absoluteTime, accountTitle, searchMessageIds, type InboxItem } from '../lib/mail/mailApi';
import {
  forwardBlock,
  forwardSubject,
  inFolder,
  isMailFolder,
  MAIL_FOLDERS,
  matchesThreadSearch,
  quoteForReply,
  replyRecipients,
  replySubject,
  type ComposeMode,
  type MailFolder,
} from '../lib/mail/mailThreads';
import { sanitizeEmailHtml } from '../lib/mail/mailSanitize';
import { playNotificationSound } from '../lib/notificationSound';
import { ComposeSheet, type ComposeDraft } from '../components/mail/ComposeSheet';
import { MailRail, RailDrawer } from '../components/mail/MailRail';
import { ThreadList, ThreadListSkeleton } from '../components/mail/ThreadList';
import { ThreadReader } from '../components/mail/ThreadReader';
import { useMailbox, type InboxThread } from '../components/mail/useMailbox';

/**
 * The team Inbox: the admin Mail page's mail client, limited to the mailboxes an
 * admin granted this person. Folders and mailboxes on the start side, the list
 * in the middle, the conversation at the end — one pane at a time on a phone.
 *
 * A mailbox granted without `can_send` is read-only here: no compose, reply or
 * forward. Deleting is left to admins; members can archive.
 */

const SOUND_KEY = 'hc:mail-sound';
let draftSeq = 0;

const MailPage: React.FC = () => {
  const { t } = useTranslation('mail');
  const access = useMailAccess();
  const [params, setParams] = useSearchParams();
  const folder: MailFolder = isMailFolder(params.get('folder')) ? (params.get('folder') as MailFolder) : 'inbox';
  const accountsById = useMemo(() => new Map(access.accounts.map((a) => [a.id, a])), [access.accounts]);
  const boxParam = params.get('box');
  const accountId = boxParam && accountsById.has(boxParam) ? boxParam : null;

  const [search, setSearch] = useState('');
  const [bodyMatches, setBodyMatches] = useState<Set<string>>(new Set());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<ComposeDraft | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<InboxThread | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem(SOUND_KEY) === 'on');
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;

  const update = useCallback((changes: Record<string, string | null>) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      Object.entries(changes).forEach(([key, value]) => { if (value) next.set(key, value); else next.delete(key); });
      return next;
    }, { replace: true });
  }, [setParams]);

  const openByIdRef = useRef<(id: string) => void>(() => undefined);

  const onNewMail = useCallback((messages: InboxItem[]) => {
    const first = messages[0];
    const from = first.fromName || first.fromEmail || '?';
    const text = messages.length === 1
      ? t('toast.newMail', { from, subject: first.subject || t('list.noSubject') })
      : t('toast.newMailMany', { count: messages.length });
    toast(text, { action: { label: t('toast.open'), onClick: () => openByIdRef.current(first.id) } });
    if (soundRef.current) playNotificationSound();
  }, [t]);

  const mail = useMailbox(access.accountIds, { ready: !access.loading, onNewMail });

  const scoped = useMemo(() => mail.threads.filter((th) => !accountId || th.accountIds.includes(accountId)), [mail.threads, accountId]);
  const unreadCount = useMemo(() => scoped.filter((th) => inFolder(th, 'unread')).length, [scoped]);

  const scopeKey = access.accountIds.join(',');
  useEffect(() => {
    const q = search.trim();
    if (q.length < 3) { setBodyMatches(new Set()); return undefined; }
    let active = true;
    const ids = scopeKey ? scopeKey.split(',') : [];
    const timer = setTimeout(() => {
      searchMessageIds(q, ids).then((found) => { if (active) setBodyMatches(found); }).catch(() => undefined);
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [search, scopeKey]);

  const visible = useMemo(() => scoped.filter((th) => inFolder(th, folder) && (
    matchesThreadSearch(th, search) || th.messages.some((m) => bodyMatches.has(m.id))
  )), [scoped, folder, search, bodyMatches]);

  const selected = useMemo(() => mail.threads.find((th) => th.key === selectedKey) ?? null, [mail.threads, selectedKey]);

  const { loadBodies, markThreadRead } = mail;
  const fail = useCallback((err: unknown) => toast.error(err instanceof Error && err.message ? err.message : t('errors.generic')), [t]);

  const openThread = useCallback((thread: InboxThread) => {
    setSelectedKey(thread.key);
    loadBodies(thread).catch(fail);
    if (thread.unread > 0) markThreadRead(thread).catch(() => undefined);
  }, [loadBodies, markThreadRead, fail]);

  openByIdRef.current = (id: string) => {
    const thread = mail.threads.find((th) => th.messages.some((m) => m.id === id));
    if (thread) openThread(thread);
  };

  useEffect(() => {
    if (selected) loadBodies(selected).catch(() => undefined);
  }, [selected, loadBodies]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const archive = (thread: InboxThread) => {
    const next = !thread.archived;
    mail.setThreadArchived(thread, next)
      .then(() => toast.success(next ? t('toast.archived') : t('toast.unarchived'), {
        action: { label: t('toast.undo'), onClick: () => { mail.setThreadArchived(thread, !next).catch(() => undefined); } },
      }))
      .catch(fail);
    if (next && folder !== 'archived' && folder !== 'starred' && folder !== 'sent') setSelectedKey(null);
  };

  const markUnread = (thread: InboxThread) => {
    mail.markThreadUnread(thread).catch(fail);
    setSelectedKey(null);
  };

  const remove = async () => {
    if (!confirmDelete || !access.isAdmin) return;
    setDeleting(true);
    try {
      await mail.deleteThread(confirmDelete);
      if (selectedKey === confirmDelete.key) setSelectedKey(null);
      toast.success(t('toast.deleted'));
      setConfirmDelete(null);
    } catch (err) {
      fail(err);
    } finally {
      setDeleting(false);
    }
  };

  // ── Compose ───────────────────────────────────────────────────────────────
  const ownAddresses = useMemo(() => access.accounts.map((a) => a.emailAddress), [access.accounts]);
  const canComposeHere = access.sendableAccounts.length > 0;

  const startCompose = (mode: ComposeMode, item?: InboxItem) => {
    draftSeq += 1;
    if (mode === 'new' || !item) {
      const preferred = accountId && access.canSendFrom(accountId) ? accountId : null;
      setDraft({ id: draftSeq, mode: 'new', accountId: preferred, to: '', cc: '', subject: '', initialHtml: '', threadKey: null, inReplyTo: null, sourceId: null, contactId: null });
      return;
    }
    if (!access.canSendFrom(item.accountId)) return;
    const body = mail.bodies[item.id];
    const ours = item.accountId ? accountsById.get(item.accountId) : undefined;
    const source = {
      fromName: item.direction === 'outbound' ? (ours?.label ?? null) : item.fromName,
      fromEmail: item.direction === 'outbound' ? (ours?.emailAddress ?? null) : item.fromEmail,
      toEmails: item.toEmails,
      ccEmails: body?.ccEmails ?? [],
      subject: item.subject,
      dateLabel: absoluteTime(item.emailDate, 'en-GB'),
      html: body?.bodyHtml ? sanitizeEmailHtml(body.bodyHtml) : null,
      text: body?.bodyText ?? item.preview,
    };
    if (mode === 'forward') {
      setDraft({ id: draftSeq, mode, accountId: item.accountId, to: '', cc: '', subject: forwardSubject(item.subject), initialHtml: forwardBlock(source), threadKey: null, inReplyTo: null, sourceId: item.sourceId, contactId: null });
      return;
    }
    const recipients = replyRecipients({ direction: item.direction, fromEmail: item.fromEmail, toEmails: item.toEmails, ccEmails: body?.ccEmails ?? [] }, ownAddresses, mode);
    setDraft({
      id: draftSeq, mode, accountId: item.accountId,
      to: recipients.to.join(', '), cc: recipients.cc.join(', '),
      subject: replySubject(item.subject),
      initialHtml: quoteForReply(source),
      threadKey: item.threadKey ?? item.id, inReplyTo: body?.messageId ?? item.messageId,
      sourceId: item.sourceId, contactId: item.contactId,
    });
  };

  // ── Layout ────────────────────────────────────────────────────────────────
  const rail = (
    <MailRail
      folder={folder}
      unreadCount={unreadCount}
      accounts={access.accounts}
      accountId={accountId}
      unreadPerAccount={mail.unreadPerAccount}
      canSendFrom={access.canSendFrom}
      canCompose={canComposeHere}
      soundOn={soundOn}
      onFolder={(next) => { update({ folder: next === 'inbox' ? null : next }); setSelectedKey(null); setRailOpen(false); }}
      onAccount={(next) => { update({ box: next }); setSelectedKey(null); setRailOpen(false); }}
      onCompose={() => { setRailOpen(false); startCompose('new'); }}
      onToggleSound={() => {
        const next = !soundOn;
        localStorage.setItem(SOUND_KEY, next ? 'on' : 'off');
        setSoundOn(next);
        if (next) playNotificationSound();
      }}
    />
  );

  const currentAccount = accountId ? accountsById.get(accountId) : undefined;
  const error = access.error ?? mail.error;
  const threadCanSend = selected ? access.canSendFrom(selected.latest.accountId) : false;

  if (!access.loading && access.accounts.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 p-6 text-center">
        <div className="text-[15px] font-medium text-[#0f1117]">{t('empty.noMailboxesTitle')}</div>
        <div className="max-w-sm text-[13px] text-black/50">{t('empty.noMailboxesBody')}</div>
      </div>
    );
  }

  return (
    <div className="media-scope flex h-full min-h-0 flex-col bg-white">
      <Toaster />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)] xl:grid-cols-[236px_minmax(320px,380px)_minmax(0,1fr)]">
        <aside className="hidden min-h-0 border-e border-black/[0.06] bg-[#FAFBFC] xl:block">{rail}</aside>
        <RailDrawer open={railOpen} onClose={() => setRailOpen(false)}>{rail}</RailDrawer>

        <section aria-label={t('list.label')} className={cn('min-h-0 flex-col border-black/[0.06] lg:flex lg:border-e', selected ? 'hidden' : 'flex')}>
          <header className="border-b border-black/[0.06] px-3 pb-3 pt-3 sm:px-4">
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setRailOpen(true)} aria-label={t('rail.open')} className="grid size-11 place-items-center rounded-lg text-black/55 hover:bg-black/[0.05] xl:hidden">
                <Menu className="size-[18px]" />
              </button>
              <div className="min-w-0 flex-1 px-1">
                <h1 dir="auto" className="truncate text-[17px] font-semibold text-[#0f1117] sm:text-[18px]">
                  {currentAccount ? accountTitle(currentAccount) : t(`folders.${folder}`)}
                </h1>
                <p className="truncate text-[11.5px] text-black/45">
                  {currentAccount
                    ? <>{t(`folders.${folder}`)} · <span dir="ltr">{currentAccount.emailAddress}</span></>
                    : t('list.count', { count: visible.length })}
                </p>
              </div>
              {canComposeHere && (
                <Button size="lg" className="h-11 xl:hidden" onClick={() => startCompose('new')}>{t('compose.button')}</Button>
              )}
            </div>
            <div className="relative mt-2.5">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-[15px] -translate-y-1/2 text-black/35" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('list.search')}
                aria-label={t('list.search')}
                className="h-11 w-full rounded-xl border border-transparent bg-black/[0.045] pe-10 ps-9 text-[13.5px] outline-none transition-colors placeholder:text-black/40 focus:border-[#6ea4e7] focus:bg-white focus:ring-[3px] focus:ring-[#6ea4e7]/20 lg:h-10"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} aria-label={t('list.clearSearch')} className="absolute end-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-black/40 hover:bg-black/[0.05]">
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <div className="-mx-1 mt-2 flex gap-1 overflow-x-auto px-1 xl:hidden" role="group" aria-label={t('rail.label')}>
              {MAIL_FOLDERS.map((key) => {
                const active = key === folder;
                return (
                  <button key={key} type="button" aria-pressed={active}
                    onClick={() => { update({ folder: key === 'inbox' ? null : key }); setSelectedKey(null); }}
                    className={cn('inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] transition-colors lg:h-9', active ? 'bg-[var(--accent-soft)] font-semibold text-[var(--accent-strong)]' : 'font-medium text-black/55 hover:bg-black/[0.04]')}>
                    {t(`folders.${key}`)}
                    {key === 'unread' && unreadCount > 0 && <span className="text-[11px] tabular-nums">{unreadCount}</span>}
                  </button>
                );
              })}
            </div>
          </header>

          {error && (
            <div role="alert" className="mx-3 mt-3 flex items-start gap-2 rounded-xl border border-[#d4183d]/20 bg-[#d4183d]/[0.05] p-3 sm:mx-4">
              <TriangleAlert className="mt-px size-4 shrink-0 text-[#d4183d]" />
              <span className="flex-1 text-[12.5px] text-[#b3122f]">{t('errors.load')}</span>
              <button type="button" onClick={() => { access.refresh(); void mail.reload(); }} className="h-11 rounded-lg px-2.5 text-[12.5px] font-medium text-[#b3122f] hover:bg-[#d4183d]/10 lg:h-8">{t('errors.retry')}</button>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {access.loading || mail.loading ? <ThreadListSkeleton /> : (
              <ThreadList
                threads={visible}
                selectedKey={selectedKey}
                accountsById={accountsById}
                showAccount={!accountId && access.accounts.length > 1}
                emptyTitle={search ? t('empty.noMatches') : t(`empty.${folder}.title`)}
                emptyHint={search ? t('empty.noMatchesHint') : t(`empty.${folder}.hint`)}
                onOpen={openThread}
                onStar={(thread) => { mail.toggleThreadStar(thread).catch(fail); }}
              />
            )}
          </div>
        </section>

        <section aria-label={t('reader.label')} className={cn('min-h-0 overflow-y-auto bg-white lg:block', selected ? 'block' : 'hidden')}>
          <ThreadReader
            thread={selected}
            bodies={mail.bodies}
            accountsById={accountsById}
            canSend={threadCanSend}
            canDelete={access.isAdmin}
            onBack={() => setSelectedKey(null)}
            onArchive={archive}
            onDelete={setConfirmDelete}
            onMarkUnread={markUnread}
            onStarThread={(thread) => { mail.toggleThreadStar(thread).catch(fail); }}
            onStarMessage={(item) => { mail.toggleStar(item).catch(fail); }}
            onCompose={(mode, item) => startCompose(mode, item)}
          />
        </section>
      </div>

      <ComposeSheet
        draft={draft}
        sendableAccounts={access.sendableAccounts}
        onClose={() => setDraft(null)}
        onSent={(from) => { toast.success(t('toast.sent', { from })); void mail.reload(); }}
      />

      {confirmDelete && access.isAdmin && (
        <div className="fixed inset-0 z-[600] grid place-items-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="mail-delete-title">
          <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" onClick={deleting ? undefined : () => setConfirmDelete(null)} />
          <div className="relative w-full max-w-[400px] rounded-2xl bg-white p-5 shadow-[0_20px_60px_rgb(0_0_0/0.2)]">
            <h2 id="mail-delete-title" className="text-[16px] font-semibold text-[#0f1117]">{t('delete.title')}</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-black/55">{t('delete.body', { count: confirmDelete.messages.length })}</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" size="lg" className="h-11 lg:h-10" onClick={() => setConfirmDelete(null)} disabled={deleting}>{t('delete.cancel')}</Button>
              <Button variant="destructive" size="lg" className="h-11 lg:h-10" onClick={() => void remove()} disabled={deleting}>{deleting ? t('delete.deleting') : t('delete.confirm')}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MailPage;
