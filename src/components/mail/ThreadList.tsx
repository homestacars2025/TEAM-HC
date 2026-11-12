import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Paperclip, SearchX, Star } from 'lucide-react';
import { cn } from '../../lib/utils';
import { shortAccountName, type EmailAccount } from '../../lib/mail/mailApi';
import { mailTime } from '../../lib/mail/mailThreads';
import { useDateLocale } from '../../hooks/useDateLocale';
import type { InboxThread } from './useMailbox';

/** Localised "5m ago" / "Yesterday" / "12 Nov". */
export function useMailTime(): (iso: string | null) => string {
  const { t } = useTranslation('mail');
  const locale = useDateLocale();
  return useCallback((iso: string | null) => mailTime(iso, new Date(), {
    now: t('time.now'),
    minutesAgo: (n) => t('time.minutesAgo', { count: n }),
    hoursAgo: (n) => t('time.hoursAgo', { count: n }),
    yesterday: t('time.yesterday'),
    locale,
  }), [t, locale]);
}

const firstName = (value: string) => value.split(/[\s@]/)[0] || value;

/** Who the conversation is with, Gmail style: "Ali, me". */
export function threadPeople(thread: InboxThread, me: string, toPrefix: (to: string) => string): string {
  if (!thread.hasInbound) {
    const to = thread.latest.toEmails[0];
    return to ? toPrefix(to) : me;
  }
  const names: string[] = [];
  thread.messages.forEach((m) => {
    const name = m.direction === 'inbound' ? (m.fromName?.trim() || m.fromEmail || '?') : me;
    if (!names.includes(name)) names.push(name);
  });
  return names.length > 2 ? names.map(firstName).join(', ') : names.join(', ');
}

const AccountChip: React.FC<{ account: EmailAccount | undefined }> = ({ account }) => {
  if (!account) return null;
  return (
    <span dir="ltr" className="inline-flex h-[18px] max-w-[110px] items-center gap-1 rounded-full bg-black/[0.035] px-1.5 text-[10.5px] font-medium text-black/55" title={account.emailAddress}>
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: account.color ?? '#9aa5b1' }} />
      <span className="truncate">{shortAccountName(account)}</span>
    </span>
  );
};

export const ThreadListSkeleton: React.FC = () => (
  <ul aria-busy="true" className="divide-y divide-black/[0.05]">
    {Array.from({ length: 8 }, (_, i) => (
      <li key={i} className="flex gap-3 px-4 py-3.5">
        <span className="mt-1.5 size-2 rounded-full bg-black/[0.06]" />
        <span className="flex-1 space-y-2">
          <span className="flex justify-between gap-3"><span className="h-3 w-1/3 animate-pulse rounded bg-black/[0.07]" /><span className="h-3 w-10 animate-pulse rounded bg-black/[0.05]" /></span>
          <span className="block h-3 w-3/4 animate-pulse rounded bg-black/[0.06]" />
          <span className="block h-3 w-5/6 animate-pulse rounded bg-black/[0.04]" />
        </span>
      </li>
    ))}
  </ul>
);

export const ThreadList: React.FC<{
  threads: InboxThread[];
  selectedKey: string | null;
  accountsById: Map<string, EmailAccount>;
  showAccount: boolean;
  emptyTitle: string;
  emptyHint: string;
  onOpen: (thread: InboxThread) => void;
  onStar: (thread: InboxThread) => void;
}> = ({ threads, selectedKey, accountsById, showAccount, emptyTitle, emptyHint, onOpen, onStar }) => {
  const { t } = useTranslation('mail');
  const time = useMailTime();

  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
        <div className="grid size-12 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-strong)]">
          <SearchX className="size-5" strokeWidth={1.7} />
        </div>
        <div className="mt-1 text-[14px] font-medium text-black/70">{emptyTitle}</div>
        <div className="max-w-[260px] text-[12.5px] leading-relaxed text-black/45">{emptyHint}</div>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-black/[0.05]">
      {threads.map((thread) => {
        const unread = thread.unread > 0;
        const latest = thread.latest;
        const outbound = latest.direction === 'outbound';
        const Arrow = outbound ? ArrowUp : ArrowDown;
        const account = latest.accountId ? accountsById.get(latest.accountId) : undefined;
        const active = thread.key === selectedKey;
        return (
          <li key={thread.key} className="group relative">
            <button
              type="button"
              onClick={() => onOpen(thread)}
              aria-current={active ? 'true' : undefined}
              className={cn(
                'flex w-full gap-3 py-3 pe-4 ps-11 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#6ea4e7]/40',
                active ? 'bg-[var(--accent-soft)]' : unread ? 'bg-white hover:bg-black/[0.025]' : 'bg-[#FBFBFC] hover:bg-black/[0.025]',
              )}
            >
              <span aria-hidden="true" className={cn('absolute start-[18px] top-[19px] size-2 rounded-full', unread ? 'bg-[#6ea4e7]' : 'bg-transparent')} />
              {unread && <span className="sr-only">{t('list.unread')}</span>}
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span dir="auto" className={cn('min-w-0 flex-1 truncate text-[13.5px]', unread ? 'font-semibold text-black/90' : 'font-medium text-black/65')}>
                    {threadPeople(thread, t('list.me'), (to) => t('list.to', { to }))}
                    {thread.messages.length > 1 && <span className="ms-1 text-[12px] font-normal text-black/40">{thread.messages.length}</span>}
                  </span>
                  <span className={cn('shrink-0 text-[11.5px] tabular-nums', unread ? 'font-semibold text-[var(--accent-strong)]' : 'text-black/40')}>
                    {time(latest.emailDate)}
                  </span>
                </span>
                <span dir="auto" className={cn('mt-0.5 block truncate text-[13px]', unread ? 'font-medium text-black/85' : 'text-black/65')}>
                  {thread.subject || t('list.noSubject')}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5">
                  <Arrow aria-hidden="true" className={cn('size-3 shrink-0', outbound ? 'text-emerald-600' : 'text-[#d4183d]')} strokeWidth={2.6} />
                  <span className="sr-only">{outbound ? t('direction.sent') : t('direction.received')}</span>
                  <span dir="auto" className="min-w-0 flex-1 truncate text-[12.5px] text-black/45">{latest.preview?.replace(/\s+/g, ' ').trim() || '—'}</span>
                  {thread.hasAttachments && <Paperclip aria-label={t('list.attachments')} className="size-3.5 shrink-0 text-black/40" />}
                  {showAccount && <AccountChip account={account} />}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => onStar(thread)}
              aria-label={thread.starred ? t('actions.unstar') : t('actions.star')}
              aria-pressed={thread.starred}
              className={cn(
                'absolute start-1 top-[34px] grid size-9 place-items-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6ea4e7]/40',
                thread.starred ? 'text-amber-500' : 'text-black/20 hover:text-black/50 group-hover:text-black/35',
              )}
            >
              <Star className={cn('size-4', thread.starred && 'fill-amber-500')} strokeWidth={thread.starred ? 2.2 : 1.8} />
            </button>
          </li>
        );
      })}
    </ul>
  );
};
