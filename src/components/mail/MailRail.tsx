import React from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, ArrowDown, Bell, BellOff, Eye, Inbox, Mail, Pencil, Send, Star, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { accountTitle, type EmailAccount } from '../../lib/mail/mailApi';
import type { MailFolder } from '../../lib/mail/mailThreads';
import { Sheet, SheetContent, SheetTitle } from '../ui/sheet';

export const FOLDER_ICONS: Record<MailFolder, LucideIcon> = {
  inbox: Inbox,
  unread: Mail,
  starred: Star,
  received: ArrowDown,
  sent: Send,
  archived: Archive,
};

const RAIL_FOLDERS: MailFolder[] = ['inbox', 'unread', 'starred', 'received', 'sent', 'archived'];

const ITEM = 'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-start text-[13.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6ea4e7]/40 lg:min-h-[38px]';

export interface MailRailProps {
  folder: MailFolder;
  unreadCount: number;
  accounts: EmailAccount[];
  accountId: string | null;
  unreadPerAccount: Record<string, number>;
  canSendFrom: (accountId: string) => boolean;
  canCompose: boolean;
  soundOn: boolean;
  onFolder: (folder: MailFolder) => void;
  onAccount: (accountId: string | null) => void;
  onCompose: () => void;
  onToggleSound: () => void;
}

export const MailRail: React.FC<MailRailProps> = ({
  folder, unreadCount, accounts, accountId, unreadPerAccount, canSendFrom, canCompose, soundOn,
  onFolder, onAccount, onCompose, onToggleSound,
}) => {
  const { t } = useTranslation('mail');
  const totalUnread = Object.values(unreadPerAccount).reduce((sum, n) => sum + n, 0);
  return (
    <nav aria-label={t('rail.label')} className="flex h-full flex-col gap-5 overflow-y-auto px-3 py-4">
      {canCompose && (
        <button
          type="button"
          onClick={onCompose}
          className="hc-btn-primary flex h-12 items-center gap-2.5 self-start rounded-2xl pe-5 ps-4 text-[14px] font-semibold shadow-[0_2px_10px_rgb(110_164_231/0.35)]"
        >
          <Pencil className="size-4" /> {t('compose.button')}
        </button>
      )}

      <ul className="flex flex-col gap-0.5">
        {RAIL_FOLDERS.map((key) => {
          const Icon = FOLDER_ICONS[key];
          const active = folder === key;
          const count = key === 'unread' || key === 'inbox' ? unreadCount : 0;
          return (
            <li key={key}>
              <button type="button" aria-current={active ? 'page' : undefined} onClick={() => onFolder(key)}
                className={cn(ITEM, active ? 'bg-[var(--accent-soft)] font-semibold text-[var(--accent-strong)]' : 'font-medium text-black/65 hover:bg-black/[0.04]')}>
                <Icon className={cn('size-[17px]', active ? 'text-[var(--accent-strong)]' : 'text-black/45')} />
                <span className="flex-1 truncate">{t(`folders.${key}`)}</span>
                {count > 0 && <span className="text-[12px] font-semibold tabular-nums">{count}</span>}
              </button>
            </li>
          );
        })}
      </ul>

      <div>
        <div className="mb-1.5 px-3 text-[11px] font-bold uppercase text-black/40">{t('rail.mailboxes')}</div>
        <ul className="flex flex-col gap-0.5">
          {accounts.length > 1 && (
            <li>
              <button type="button" aria-current={accountId === null ? 'true' : undefined} onClick={() => onAccount(null)}
                className={cn(ITEM, accountId === null ? 'bg-black/[0.05] font-semibold text-[#0f1117]' : 'font-medium text-black/65 hover:bg-black/[0.04]')}>
                <span aria-hidden="true" className="flex size-[17px] items-center justify-center -space-x-1 rtl:space-x-reverse">
                  {accounts.slice(0, 3).map((a) => <span key={a.id} className="size-2 rounded-full ring-1 ring-white" style={{ backgroundColor: a.color ?? '#9aa5b1' }} />)}
                </span>
                <span className="flex-1 truncate">{t('rail.allMailboxes')}</span>
                {totalUnread > 0 && <span className="text-[12px] font-semibold tabular-nums text-[var(--accent-strong)]">{totalUnread}</span>}
              </button>
            </li>
          )}
          {accounts.map((account) => {
            const active = accountId === account.id;
            const unread = unreadPerAccount[account.id] ?? 0;
            return (
              <li key={account.id}>
                <button type="button" aria-current={active ? 'true' : undefined} onClick={() => onAccount(account.id)} title={account.emailAddress}
                  className={cn(ITEM, active ? 'font-semibold text-[#0f1117]' : 'font-medium text-black/65 hover:bg-black/[0.04]')}
                  style={active ? { backgroundColor: `${account.color ?? '#9aa5b1'}22` } : undefined}>
                  <span aria-hidden="true" className="grid size-[17px] place-items-center"><span className="size-2.5 rounded-full" style={{ backgroundColor: account.color ?? '#9aa5b1' }} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span dir="auto" className="truncate">{accountTitle(account)}</span>
                      {!canSendFrom(account.id) && <Eye aria-label={t('reader.readOnly')} className="size-3 shrink-0 text-black/40" />}
                    </span>
                    <span dir="ltr" className="block truncate text-start text-[11px] font-normal text-black/40">{account.emailAddress}</span>
                  </span>
                  {unread > 0 && (
                    <span className="min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold tabular-nums text-white" style={{ backgroundColor: account.color ?? '#6ea4e7' }}>{unread}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-auto border-t border-black/[0.06] pt-3">
        <button type="button" onClick={onToggleSound} aria-pressed={soundOn} className={cn(ITEM, 'font-medium text-black/65 hover:bg-black/[0.04]')}>
          {soundOn ? <Bell className="size-[17px] text-[var(--accent-strong)]" /> : <BellOff className="size-[17px] text-black/45" />}
          <span className="flex-1">{soundOn ? t('rail.soundOn') : t('rail.soundOff')}</span>
        </button>
      </div>
    </nav>
  );
};

/** The rail as a drawer from the start edge, where there's no room for it beside the list. */
export const RailDrawer: React.FC<{ open: boolean; onClose: () => void; children: React.ReactNode }> = ({ open, onClose, children }) => {
  const { t } = useTranslation('mail');
  return (
    <Sheet open={open} onOpenChange={(value: boolean) => { if (!value) onClose(); }}>
      <SheetContent side="left" className="w-[min(300px,86vw)] gap-0 p-0 pt-12">
        <SheetTitle className="sr-only">{t('rail.label')}</SheetTitle>
        {children}
      </SheetContent>
    </Sheet>
  );
};
