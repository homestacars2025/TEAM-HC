import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Send } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { accountTitle, sendEmail, type EmailAccount } from '../../lib/mail/mailApi';
import type { ComposeMode } from '../../lib/mail/mailThreads';
import { htmlToText, sanitizeOutgoingHtml } from '../../lib/mail/mailSanitize';
import { RichEditor } from './RichEditor';

export interface ComposeDraft {
  /** Bumped for every new draft, so the editor starts fresh. */
  id: number;
  mode: ComposeMode;
  accountId: string | null;
  to: string;
  cc: string;
  subject: string;
  initialHtml: string;
  threadKey: string | null;
  inReplyTo: string | null;
  sourceId: string | null;
  contactId: string | null;
}

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const splitEmails = (value: string) => value.split(/[,;]/).map((s) => s.trim()).filter(Boolean);

const LABEL = 'text-[12px] font-medium text-black/55';
const FIELD = 'h-11 lg:h-10';

export const ComposeSheet: React.FC<{
  draft: ComposeDraft | null;
  /** Only the mailboxes this person may send from. */
  sendableAccounts: EmailAccount[];
  onClose: () => void;
  onSent: (from: string) => void;
}> = ({ draft, sendableAccounts, onClose, onSent }) => {
  if (!draft) return null;
  return <ComposeForm key={draft.id} draft={draft} sendableAccounts={sendableAccounts} onClose={onClose} onSent={onSent} />;
};

const ComposeForm: React.FC<{
  draft: ComposeDraft;
  sendableAccounts: EmailAccount[];
  onClose: () => void;
  onSent: (from: string) => void;
}> = ({ draft, sendableAccounts, onClose, onSent }) => {
  const { t } = useTranslation('mail');
  const [accountId, setAccountId] = useState<string | null>(
    sendableAccounts.some((a) => a.id === draft.accountId)
      ? draft.accountId
      : (sendableAccounts.find((a) => a.isDefault) ?? sendableAccounts[0])?.id ?? null,
  );
  const [to, setTo] = useState(draft.to);
  const [cc, setCc] = useState(draft.cc);
  const [showCc, setShowCc] = useState(Boolean(draft.cc));
  const [subject, setSubject] = useState(draft.subject);
  const [html, setHtml] = useState(draft.initialHtml);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const account = useMemo(() => sendableAccounts.find((a) => a.id === accountId) ?? null, [sendableAccounts, accountId]);
  // A reply stays in its conversation's mailbox, so the answer comes back to the same place.
  const locked = draft.mode === 'reply' || draft.mode === 'replyAll';

  const checkEmails = (value: string, required: boolean): string | null => {
    const list = splitEmails(value);
    if (required && list.length === 0) return t('compose.errors.noRecipient');
    const bad = list.find((email) => !EMAIL.test(email.replace(/^.*<([^>]+)>$/, '$1')));
    return bad ? t('compose.errors.badAddress', { address: bad }) : null;
  };

  const send = async () => {
    const problem = !account ? t('compose.errors.noMailbox')
      : checkEmails(to, true) ?? checkEmails(cc, false)
      ?? (!subject.trim() ? t('compose.errors.noSubject') : null)
      ?? (!htmlToText(html) ? t('compose.errors.noBody') : null);
    if (problem || !account) { setError(problem); return; }

    setSending(true);
    setError(null);
    try {
      await sendEmail({
        to: splitEmails(to).join(', '),
        cc: splitEmails(cc).join(', '),
        subject: subject.trim(),
        bodyHtml: sanitizeOutgoingHtml(html),
        threadKey: draft.threadKey,
        inReplyTo: draft.inReplyTo,
        sourceId: draft.sourceId,
        contactId: draft.contactId,
        accountId: account.id,
        accountSlug: account.slug,
      });
      onSent(account.emailAddress);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      // The Edge Function answers in English; the one refusal a member will meet gets a sentence of its own.
      setError(/admin role required/i.test(message) ? t('compose.errors.notAllowed') : t('compose.errors.sendFailed', { message }));
      setSending(false);
    }
  };

  const title = t(`compose.title.${draft.mode}`);

  return (
    <Sheet open onOpenChange={(open: boolean) => { if (!open && !sending) onClose(); }}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-[680px]">
        <SheetHeader className="border-b border-black/[0.06] px-5 py-4 pe-14">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
          {sendableAccounts.length === 0 ? (
            <p role="alert" className="rounded-lg bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-800">{t('compose.readOnly')}</p>
          ) : (
            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>{t('compose.from')}</span>
              {locked && account ? (
                <span dir="ltr" className="flex h-11 items-center gap-2 rounded-lg border border-black/[0.12] bg-black/[0.02] px-3 text-[13px] text-black/70 lg:h-10">
                  <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: account.color ?? '#9aa5b1' }} />
                  {accountTitle(account)} · {account.emailAddress}
                </span>
              ) : (
                <select
                  value={accountId ?? ''}
                  onChange={(e) => setAccountId(e.target.value || null)}
                  dir="ltr"
                  className="h-11 rounded-lg border border-black/[0.12] bg-white px-3 text-[13px] outline-none focus:border-[#6ea4e7] focus:ring-[3px] focus:ring-[#6ea4e7]/20 lg:h-10"
                >
                  {sendableAccounts.map((a) => <option key={a.id} value={a.id}>{`${accountTitle(a)} — ${a.emailAddress}`}</option>)}
                </select>
              )}
            </label>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="mail-to" className={LABEL}>{t('compose.to')}</label>
            <div className="flex gap-2">
              <Input id="mail-to" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com" className={FIELD} autoFocus={draft.mode === 'new' || draft.mode === 'forward'} />
              {!showCc && (
                <button type="button" onClick={() => setShowCc(true)} className="h-11 shrink-0 rounded-lg px-3 text-[12.5px] font-medium text-[var(--accent-strong)] hover:bg-[var(--accent-soft)] lg:h-10">{t('compose.addCc')}</button>
              )}
            </div>
          </div>
          {showCc && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="mail-cc" className={LABEL}>{t('compose.cc')}</label>
              <Input id="mail-cc" dir="ltr" value={cc} onChange={(e) => setCc(e.target.value)} className={FIELD} />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="mail-subject" className={LABEL}>{t('compose.subject')}</label>
            <Input id="mail-subject" dir="auto" value={subject} onChange={(e) => setSubject(e.target.value)} className={FIELD} />
          </div>
          <RichEditor initialHtml={draft.initialHtml} onChange={setHtml} autoFocus={locked} />
          {draft.mode === 'forward' && <p className="text-[11.5px] text-black/40">{t('compose.noForwardAttachments')}</p>}
          {error && <p role="alert" className="rounded-lg bg-[#d4183d]/[0.07] px-3 py-2 text-[12.5px] text-[#b3122f]">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-black/[0.06] px-5 py-3">
          <Button variant="outline" size="lg" className="h-11 lg:h-10" onClick={onClose} disabled={sending}>{t('compose.discard')}</Button>
          <Button size="lg" className="h-11 lg:h-10" onClick={() => void send()} disabled={sending || sendableAccounts.length === 0}>
            {sending ? <Loader2 className="animate-spin" /> : <Send className="rtl:-scale-x-100" />}
            {sending ? t('compose.sending') : t('compose.send')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
