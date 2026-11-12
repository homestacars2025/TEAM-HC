import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  Eye,
  FileText,
  Forward,
  Mail,
  Reply,
  ReplyAll,
  Star,
  Trash2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { absoluteTime, accountTitle, shortAccountName, type EmailAccount, type EmailBody, type InboxItem } from '../../lib/mail/mailApi';
import { attachmentKind, formatBytes, type ComposeMode } from '../../lib/mail/mailThreads';
import { useDateLocale } from '../../hooks/useDateLocale';
import { MailBody } from './MailBody';
import { useMailTime } from './ThreadList';
import type { InboxThread } from './useMailbox';

const ICON_BUTTON = 'grid size-11 shrink-0 place-items-center rounded-lg text-black/55 transition-colors hover:bg-black/[0.05] hover:text-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6ea4e7]/40 lg:size-9';
const PILL = 'inline-flex h-11 items-center gap-2 rounded-full border border-black/[0.12] px-4 text-[13px] font-medium text-black/75 transition-colors hover:bg-black/[0.03] lg:h-10';

const initials = (value: string) => {
  const parts = value.replace(/[<>"]/g, '').trim().split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
};

const Avatar: React.FC<{ item: InboxItem; account: EmailAccount | undefined }> = ({ item, account }) => {
  const outbound = item.direction === 'outbound';
  const label = outbound ? (account ? shortAccountName(account) : '?') : (item.fromName || item.fromEmail || '?');
  return (
    <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full text-[12px] font-semibold text-white" style={{ backgroundColor: outbound ? (account?.color ?? '#6ea4e7') : '#8b95a1' }}>
      {initials(label)}
    </span>
  );
};

const Attachments: React.FC<{ body: EmailBody }> = ({ body }) => {
  const { t } = useTranslation('mail');
  if (body.attachments.length === 0) return null;
  return (
    <div className="mt-3 border-t border-black/[0.05] pt-3">
      <div className="mb-2 text-[11.5px] font-medium text-black/45">{t('reader.attachments', { count: body.attachments.length })}</div>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {body.attachments.map((attachment, index) => {
          const card = (
            <>
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent-strong)]"><FileText className="size-[17px]" /></span>
              <span className="min-w-0 flex-1">
                <span dir="auto" className="block truncate text-[12.5px] font-medium text-black/80" title={attachment.name}>{attachment.name}</span>
                <span dir="ltr" className="block text-start text-[11px] text-black/45">{[attachmentKind(attachment), formatBytes(attachment.size)].filter(Boolean).join(' · ')}</span>
              </span>
            </>
          );
          return (
            <li key={`${attachment.name}-${index}`}>
              {attachment.url ? (
                <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="flex min-h-[56px] items-center gap-2.5 rounded-xl border border-black/[0.08] bg-white p-2 transition-colors hover:border-[#6ea4e7]/40">{card}</a>
              ) : (
                <div className="flex min-h-[56px] items-center gap-2.5 rounded-xl border border-black/[0.08] bg-white p-2" title={t('reader.attachmentNotStored')}>{card}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

const MessageCard: React.FC<{
  item: InboxItem;
  body: EmailBody | undefined;
  account: EmailAccount | undefined;
  expanded: boolean;
  canSend: boolean;
  onToggle: () => void;
  onCompose: (mode: Exclude<ComposeMode, 'new'>, item: InboxItem) => void;
  onStar: (item: InboxItem) => void;
}> = ({ item, body, account, expanded, canSend, onToggle, onCompose, onStar }) => {
  const { t } = useTranslation('mail');
  const time = useMailTime();
  const locale = useDateLocale();
  const outbound = item.direction === 'outbound';
  const fromLabel = outbound ? (account ? accountTitle(account) : t('list.me')) : (item.fromName || item.fromEmail || '?');
  const fromEmail = outbound ? account?.emailAddress : item.fromEmail;
  const Arrow = outbound ? ArrowUp : ArrowDown;

  if (!expanded) {
    return (
      <li>
        <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-black/[0.02] sm:px-6">
          <Avatar item={item} account={account} />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
              <span dir="auto" className={cn('truncate text-[13px]', item.isRead ? 'font-medium text-black/70' : 'font-semibold text-black/90')}>{fromLabel}</span>
              <span className="ms-auto shrink-0 text-[11.5px] tabular-nums text-black/40">{time(item.emailDate)}</span>
            </span>
            <span dir="auto" className="block truncate text-[12.5px] text-black/45">{item.preview?.replace(/\s+/g, ' ').trim() || '—'}</span>
          </span>
        </button>
      </li>
    );
  }

  return (
    <li className="px-4 py-4 sm:px-6">
      <div className="flex items-start gap-3">
        <Avatar item={item} account={account} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
            <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-start" aria-label={t('reader.collapse')}>
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                <span dir="auto" className="truncate text-[14px] font-semibold text-black/90">{fromLabel}</span>
                {fromEmail && <span dir="ltr" className="truncate text-[12px] text-black/45">&lt;{fromEmail}&gt;</span>}
              </span>
            </button>
            <span className="flex shrink-0 items-center gap-1">
              <span className="me-1 text-[11.5px] tabular-nums text-black/45">{absoluteTime(item.emailDate, locale)}</span>
              <button type="button" onClick={() => onStar(item)} aria-label={item.isStarred ? t('actions.unstar') : t('actions.star')} aria-pressed={item.isStarred} className={cn(ICON_BUTTON, item.isStarred && 'text-amber-500 hover:text-amber-600')}>
                <Star className={cn('size-4', item.isStarred && 'fill-amber-500')} strokeWidth={item.isStarred ? 2.2 : 1.8} />
              </button>
              {canSend && (
                <button type="button" onClick={() => onCompose('reply', item)} aria-label={t('actions.reply')} className={ICON_BUTTON}><Reply className="size-4 rtl:-scale-x-100" /></button>
              )}
            </span>
          </div>

          <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-[12px]">
            <dt className="text-black/40">{t('reader.to')}</dt>
            <dd dir="ltr" className="truncate text-start text-black/65">{item.toEmails.join(', ') || '—'}</dd>
            {body && body.ccEmails.length > 0 && (
              <>
                <dt className="text-black/40">{t('reader.cc')}</dt>
                <dd dir="ltr" className="truncate text-start text-black/65">{body.ccEmails.join(', ')}</dd>
              </>
            )}
          </dl>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className={cn('inline-flex h-5 items-center gap-1 rounded-full px-2 text-[10.5px] font-medium', outbound ? 'bg-emerald-500/10 text-emerald-700' : 'bg-[#d4183d]/[0.07] text-[#b3122f]')}>
              <Arrow className="size-[11px]" strokeWidth={2.6} />
              {outbound ? t('direction.sent') : t('direction.received')}
            </span>
            {outbound && item.sendStatus !== 'sent' && (
              <span className={cn('inline-flex h-5 items-center rounded-full border px-2 text-[10.5px] font-medium', item.sendStatus === 'failed' ? 'border-red-500/25 bg-red-500/10 text-red-700' : 'border-black/10 bg-black/[0.04] text-black/55')}>
                {t(`status.${item.sendStatus}`)}
              </span>
            )}
            {item.sourceName && <span dir="auto" className="inline-flex h-5 items-center rounded-full bg-black/[0.04] px-2 text-[10.5px] font-medium text-black/55">{item.sourceName}</span>}
          </div>
        </div>
      </div>

      <div className="mt-3 sm:ps-12">
        {body ? (
          <>
            <MailBody html={body.bodyHtml} text={body.bodyText} />
            <Attachments body={body} />
          </>
        ) : (
          <div className="space-y-2 py-2" aria-busy="true">
            <div className="h-3 w-11/12 animate-pulse rounded bg-black/[0.06]" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-black/[0.05]" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-black/[0.04]" />
          </div>
        )}
      </div>
    </li>
  );
};

export interface ThreadReaderProps {
  thread: InboxThread | null;
  bodies: Record<string, EmailBody>;
  accountsById: Map<string, EmailAccount>;
  canSend: boolean;
  canDelete: boolean;
  onBack: () => void;
  onArchive: (thread: InboxThread) => void;
  onDelete: (thread: InboxThread) => void;
  onMarkUnread: (thread: InboxThread) => void;
  onStarThread: (thread: InboxThread) => void;
  onStarMessage: (item: InboxItem) => void;
  onCompose: (mode: Exclude<ComposeMode, 'new'>, item: InboxItem) => void;
}

export const ThreadReader: React.FC<ThreadReaderProps> = ({
  thread, bodies, accountsById, canSend, canDelete,
  onBack, onArchive, onDelete, onMarkUnread, onStarThread, onStarMessage, onCompose,
}) => {
  const { t } = useTranslation('mail');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const threadKey = thread?.key ?? null;
  const messageCount = thread?.messages.length ?? 0;

  // The latest message and anything unread start open, the rest folded.
  useEffect(() => {
    if (!thread) return;
    setExpanded(new Set([thread.latest.id, ...thread.messages.filter((m) => !m.isRead).map((m) => m.id)]));
    // Only when the conversation or its length changes, not on every star or read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadKey, messageCount]);

  if (!thread) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="grid size-14 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-strong)]"><Mail className="size-6" strokeWidth={1.6} /></div>
        <div className="text-[14px] font-medium text-black/60">{t('reader.pick')}</div>
        <div className="max-w-[280px] text-[12.5px] text-black/40">{t('reader.pickHint')}</div>
      </div>
    );
  }

  const account = thread.latest.accountId ? accountsById.get(thread.latest.accountId) : undefined;
  const last = thread.latest;
  const toggle = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 flex items-center gap-1 border-b border-black/[0.06] bg-white/95 px-2 py-1.5 backdrop-blur sm:px-3">
        <button type="button" onClick={onBack} aria-label={t('reader.back')} className={cn(ICON_BUTTON, 'lg:hidden')}><ChevronLeft className="size-[18px] rtl:-scale-x-100" /></button>
        <button type="button" onClick={() => onArchive(thread)} aria-label={thread.archived ? t('actions.unarchive') : t('actions.archive')} title={thread.archived ? t('actions.unarchive') : t('actions.archive')} className={ICON_BUTTON}>
          {thread.archived ? <ArchiveRestore className="size-[17px]" /> : <Archive className="size-[17px]" />}
        </button>
        {canDelete && (
          <button type="button" onClick={() => onDelete(thread)} aria-label={t('actions.delete')} title={t('actions.delete')} className={cn(ICON_BUTTON, 'hover:bg-[#d4183d]/[0.07] hover:text-[#d4183d]')}><Trash2 className="size-[17px]" /></button>
        )}
        <button type="button" onClick={() => onMarkUnread(thread)} aria-label={t('actions.markUnread')} title={t('actions.markUnread')} className={ICON_BUTTON}><Mail className="size-[17px]" /></button>
        <button type="button" onClick={() => onStarThread(thread)} aria-label={thread.starred ? t('actions.unstar') : t('actions.star')} aria-pressed={thread.starred} className={cn(ICON_BUTTON, thread.starred && 'text-amber-500 hover:text-amber-600')}>
          <Star className={cn('size-[17px]', thread.starred && 'fill-amber-500')} strokeWidth={thread.starred ? 2.2 : 1.8} />
        </button>
        {canSend ? (
          <div className="ms-auto flex items-center gap-1">
            <button type="button" onClick={() => onCompose('reply', last)} aria-label={t('actions.reply')} title={t('actions.reply')} className={ICON_BUTTON}><Reply className="size-[17px] rtl:-scale-x-100" /></button>
            <button type="button" onClick={() => onCompose('replyAll', last)} aria-label={t('actions.replyAll')} title={t('actions.replyAll')} className={ICON_BUTTON}><ReplyAll className="size-[17px] rtl:-scale-x-100" /></button>
            <button type="button" onClick={() => onCompose('forward', last)} aria-label={t('actions.forward')} title={t('actions.forward')} className={ICON_BUTTON}><Forward className="size-[17px] rtl:-scale-x-100" /></button>
          </div>
        ) : (
          <span className="ms-auto inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] px-2.5 py-1 text-[11px] font-medium text-black/55">
            <Eye className="size-3.5" /> {t('reader.readOnly')}
          </span>
        )}
      </div>

      <div className="px-4 pb-2 pt-5 sm:px-6">
        <h2 dir="auto" className="text-[18px] font-semibold leading-snug text-[#0f1117] sm:text-[20px]">{thread.subject || t('list.noSubject')}</h2>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-black/45">
          {account && (
            <span dir="ltr" className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.035] px-2 py-0.5 font-medium text-black/60">
              <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: account.color ?? '#9aa5b1' }} />
              {account.emailAddress}
            </span>
          )}
          <span>{t('reader.messages', { count: thread.messages.length })}</span>
        </div>
      </div>

      <ol className="divide-y divide-black/[0.06] border-y border-black/[0.06]">
        {thread.messages.map((item) => (
          <MessageCard
            key={item.id}
            item={item}
            body={bodies[item.id]}
            account={item.accountId ? accountsById.get(item.accountId) : undefined}
            expanded={expanded.has(item.id)}
            canSend={canSend}
            onToggle={() => toggle(item.id)}
            onCompose={onCompose}
            onStar={onStarMessage}
          />
        ))}
      </ol>

      {canSend && (
        <div className="flex flex-wrap gap-2 px-4 py-5 sm:px-6 sm:ps-[72px]">
          <button type="button" onClick={() => onCompose('reply', last)} className={PILL}><Reply className="size-4 rtl:-scale-x-100" /> {t('actions.reply')}</button>
          <button type="button" onClick={() => onCompose('replyAll', last)} className={PILL}><ReplyAll className="size-4 rtl:-scale-x-100" /> {t('actions.replyAll')}</button>
          <button type="button" onClick={() => onCompose('forward', last)} className={PILL}><Forward className="size-4 rtl:-scale-x-100" /> {t('actions.forward')}</button>
        </div>
      )}
    </div>
  );
};
