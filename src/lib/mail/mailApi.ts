import type { RealtimeChannel } from '@supabase/supabase-js';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { normalizeAttachments, type MailAttachment } from './mailThreads';

/**
 * The team Inbox's reads and writes. The same tables and the same Edge Function
 * as the admin Mail page, always narrowed to the mailboxes the caller was given
 * in `email_account_access` (or every mailbox, for an admin).
 *
 * Those tables have row-level security off, so the narrowing here is what keeps
 * a member to their own mailboxes on screen. It is not, by itself, a security
 * boundary — that has to be RLS on the server.
 */

export type EmailDirection = 'inbound' | 'outbound';
export type EmailSendStatus = 'draft' | 'pending_approval' | 'queued' | 'sent' | 'failed' | 'received';

export interface EmailAccount {
  id: string;
  slug: string | null;
  emailAddress: string;
  label: string | null;
  color: string | null;
  isDefault: boolean;
  sortOrder: number;
}

/** "Partners", "Info" — the one word that fits on a badge. */
export function shortAccountName(account: Pick<EmailAccount, 'slug' | 'emailAddress'>): string {
  const tail = (account.slug ?? '').split('-').pop() ?? '';
  const word = tail || account.emailAddress.split('@')[0];
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : '—';
}

/** "Homesta Cars — Partnerships" → "Partnerships". */
export function accountTitle(account: Pick<EmailAccount, 'label' | 'slug' | 'emailAddress'>): string {
  return account.label?.split(/\s[—-]\s/).pop()?.trim() || shortAccountName(account);
}

export interface InboxItem {
  id: string;
  direction: EmailDirection;
  sendStatus: EmailSendStatus;
  subject: string | null;
  fromEmail: string | null;
  fromName: string | null;
  toEmails: string[];
  emailDate: string | null;
  isRead: boolean;
  isArchived: boolean;
  isStarred: boolean;
  threadKey: string | null;
  sourceId: string | null;
  sourceName: string | null;
  contactId: string | null;
  preview: string | null;
  accountId: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  hasAttachments: boolean;
}

export interface EmailBody {
  id: string;
  bodyHtml: string | null;
  bodyText: string | null;
  ccEmails: string[];
  messageId: string | null;
  attachments: MailAttachment[];
}

export interface MailboxGrant {
  accountId: string;
  canSend: boolean;
}

const VIEW_COLUMNS =
  'id, direction, send_status, subject, from_email, from_name, to_emails, email_date, ' +
  'is_read, is_archived, is_starred, thread_key, source_id, source_name, contact_id, preview, account_id';

const MAILBOX_LIMIT = 500;

const strArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

// ── Mailboxes and who may use them ───────────────────────────────────────────

export async function listAccounts(): Promise<EmailAccount[]> {
  const { data, error } = await supabase
    .from('email_accounts')
    .select('id, slug, email_address, label, color, is_default, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  fail(error);
  return ((data ?? []) as Array<Record<string, unknown>>).map((raw) => ({
    id: String(raw.id),
    slug: (raw.slug as string) ?? null,
    emailAddress: String(raw.email_address ?? ''),
    label: (raw.label as string) ?? null,
    color: (raw.color as string) ?? null,
    isDefault: raw.is_default === true,
    sortOrder: typeof raw.sort_order === 'number' ? raw.sort_order : 0,
  }));
}

/** The caller's own rows. RLS on email_account_access allows nothing else for a member. */
export async function myMailboxGrants(userId: string): Promise<MailboxGrant[]> {
  const { data, error } = await supabase
    .from('email_account_access')
    .select('account_id, can_send')
    .eq('profile_id', userId);
  fail(error);
  return ((data ?? []) as Array<{ account_id: string; can_send: boolean }>).map((row) => ({
    accountId: row.account_id,
    canSend: row.can_send === true,
  }));
}

/** Unread received mail per mailbox, keyed by account id. */
export async function unreadByAccount(accountIds: string[]): Promise<Record<string, number>> {
  if (accountIds.length === 0) return {};
  const { data, error } = await supabase
    .from('email_unread_counts')
    .select('account_id, unread')
    .in('account_id', accountIds);
  fail(error);
  const out: Record<string, number> = {};
  ((data ?? []) as Array<{ account_id: string; unread: number | string | null }>).forEach((row) => {
    out[String(row.account_id)] = Number(row.unread ?? 0);
  });
  return out;
}

// ── Reads ────────────────────────────────────────────────────────────────────

function mapItem(raw: Record<string, unknown>): InboxItem {
  return {
    id: String(raw.id),
    direction: (raw.direction as EmailDirection) ?? 'inbound',
    sendStatus: (raw.send_status as EmailSendStatus) ?? 'received',
    subject: (raw.subject as string) ?? null,
    fromEmail: (raw.from_email as string) ?? null,
    fromName: (raw.from_name as string) ?? null,
    toEmails: strArray(raw.to_emails),
    emailDate: (raw.email_date as string) ?? null,
    isRead: raw.is_read === true,
    isArchived: raw.is_archived === true,
    isStarred: raw.is_starred === true,
    threadKey: (raw.thread_key as string) ?? null,
    sourceId: (raw.source_id as string) ?? null,
    sourceName: (raw.source_name as string) ?? null,
    contactId: (raw.contact_id as string) ?? null,
    preview: (raw.preview as string) ?? null,
    accountId: (raw.account_id as string) ?? null,
    messageId: null,
    inReplyTo: null,
    hasAttachments: false,
  };
}

/** Everything in these mailboxes, for the client to thread and filter. Never wider. */
export async function listMailbox(accountIds: string[]): Promise<InboxItem[]> {
  if (accountIds.length === 0) return [];
  const [rows, extra] = await Promise.all([
    supabase.from('inbox_view').select(VIEW_COLUMNS).in('account_id', accountIds)
      .order('email_date', { ascending: false, nullsFirst: false }).limit(MAILBOX_LIMIT),
    supabase.from('email_messages').select('id, message_id, in_reply_to, has_attachments, attachments').in('account_id', accountIds)
      .order('email_date', { ascending: false, nullsFirst: false }).limit(MAILBOX_LIMIT),
  ]);
  fail(rows.error);
  fail(extra.error);
  const byId = new Map<string, Record<string, unknown>>();
  ((extra.data ?? []) as Array<Record<string, unknown>>).forEach((raw) => byId.set(String(raw.id), raw));
  return ((rows.data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => {
    const item = mapItem(r);
    const raw = byId.get(item.id);
    if (!raw) return item;
    return {
      ...item,
      messageId: (raw.message_id as string) ?? null,
      inReplyTo: (raw.in_reply_to as string) ?? null,
      hasAttachments: raw.has_attachments === true || normalizeAttachments(raw.attachments).length > 0,
    };
  });
}

/** Bodies for a whole conversation, in one request, only from these mailboxes. */
export async function getBodies(ids: string[], accountIds: string[]): Promise<Record<string, EmailBody>> {
  if (ids.length === 0 || accountIds.length === 0) return {};
  const { data, error } = await supabase
    .from('email_messages')
    .select('id, body_html, body_text, cc_emails, message_id, attachments')
    .in('id', ids)
    .in('account_id', accountIds);
  fail(error);
  const out: Record<string, EmailBody> = {};
  ((data ?? []) as Array<Record<string, unknown>>).forEach((raw) => {
    out[String(raw.id)] = {
      id: String(raw.id),
      bodyHtml: (raw.body_html as string) ?? null,
      bodyText: (raw.body_text as string) ?? null,
      ccEmails: strArray(raw.cc_emails),
      messageId: (raw.message_id as string) ?? null,
      attachments: normalizeAttachments(raw.attachments),
    };
  });
  return out;
}

/** Ids whose full text matches — the list carries only the first 160 characters. */
export async function searchMessageIds(query: string, accountIds: string[]): Promise<Set<string>> {
  const term = query.trim().replace(/[%_,()*\\]/g, ' ').replace(/\s+/g, ' ').trim();
  if (term.length < 3 || accountIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from('email_messages')
    .select('id')
    .in('account_id', accountIds)
    .ilike('body_text', `%${term}%`)
    .limit(MAILBOX_LIMIT);
  fail(error);
  return new Set(((data ?? []) as Array<{ id: string }>).map((row) => String(row.id)));
}

// ── Writes ───────────────────────────────────────────────────────────────────

async function patchMany(ids: string[], fields: Record<string, unknown>): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from('email_messages').update(fields).in('id', ids);
  fail(error);
}

export const setReadMany = (ids: string[], value: boolean) => patchMany(ids, { is_read: value });
export const setArchivedMany = (ids: string[], value: boolean) => patchMany(ids, { is_archived: value });
export const setStarred = (id: string, value: boolean) => patchMany([id], { is_starred: value });

/** Admin only in this app; the page never offers it to a member. */
export async function deleteMessages(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from('email_messages').delete().in('id', ids);
  fail(error);
}

// ── Sending ──────────────────────────────────────────────────────────────────

export interface SendInput {
  to: string;
  cc: string;
  subject: string;
  bodyHtml: string;
  threadKey: string | null;
  inReplyTo: string | null;
  sourceId: string | null;
  contactId: string | null;
  accountId: string;
  accountSlug: string | null;
}

/**
 * Writes the outbound row, then asks the `send-email` Edge Function to send it.
 * The row is kept, marked failed, if the hand-off doesn't go through — a failed
 * message can be seen and retried, a lost one can't.
 */
export async function sendEmail(input: SendInput): Promise<string> {
  const toList = input.to.split(',').map((s) => s.trim()).filter(Boolean);
  const ccList = input.cc.split(',').map((s) => s.trim()).filter(Boolean);

  const { data, error } = await supabase
    .from('email_messages')
    .insert({
      direction: 'outbound',
      send_status: 'draft',
      to_emails: toList,
      cc_emails: ccList.length ? ccList : null,
      subject: input.subject,
      body_html: input.bodyHtml,
      thread_key: input.threadKey,
      in_reply_to: input.inReplyTo,
      source_id: input.sourceId,
      contact_id: input.contactId,
      account_id: input.accountId,
      email_date: new Date().toISOString(),
      is_read: true,
    })
    .select('id')
    .single();
  fail(error);
  const rowId = String((data as { id: string }).id);

  const { error: fnError } = await supabase.functions.invoke('send-email', {
    body: {
      to: toList.join(','),
      cc: ccList.join(','),
      subject: input.subject,
      body_html: input.bodyHtml,
      message_row_id: rowId,
      account_slug: input.accountSlug ?? undefined,
    },
  });

  if (fnError) {
    let message = fnError instanceof Error && fnError.message ? fnError.message : 'send failed';
    if (fnError instanceof FunctionsHttpError) {
      try {
        const body = await fnError.context.json();
        if (body && typeof body.error === 'string') message = body.error;
      } catch { /* keep the generic message */ }
    }
    await supabase.from('email_messages').update({ send_status: 'failed', error_note: message }).eq('id', rowId);
    throw new Error(message);
  }
  return rowId;
}

// ── Realtime ─────────────────────────────────────────────────────────────────

export interface MailChange {
  event: 'INSERT' | 'UPDATE' | 'DELETE';
  row: {
    id?: string;
    account_id?: string | null;
    direction?: EmailDirection;
    from_name?: string | null;
    from_email?: string | null;
    subject?: string | null;
  };
}

let channelSeq = 0;

export function subscribeToMail(onChange: (change: MailChange) => void): () => void {
  channelSeq += 1;
  const channel: RealtimeChannel = supabase
    .channel(`team-mail-${channelSeq}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'email_messages' }, (payload: { eventType: string; new: unknown }) => onChange({
      event: payload.eventType as MailChange['event'],
      row: (payload.new ?? {}) as MailChange['row'],
    }))
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

/** "12 Nov 2026, 14:05" in the reader's language. */
export function absoluteTime(iso: string | null, locale: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
}
