/**
 * Conversations, replies and forwards — the pure half of the mail client.
 *
 * Nothing here touches the network, so every rule below is pinned by a test.
 */

export interface ThreadableMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  subject: string | null;
  fromEmail: string | null;
  fromName: string | null;
  toEmails: string[];
  emailDate: string | null;
  isRead: boolean;
  isArchived: boolean;
  isStarred: boolean;
  threadKey: string | null;
  /** RFC Message-ID and In-Reply-To. Only used where `threadKey` is missing. */
  messageId: string | null;
  inReplyTo: string | null;
  hasAttachments: boolean;
  accountId: string | null;
  sourceId: string | null;
}

export interface MailThread<T extends ThreadableMessage = ThreadableMessage> {
  /** Stable for the life of the conversation: the id of its oldest message. */
  key: string;
  /** Oldest first — reading order. */
  messages: T[];
  latest: T;
  subject: string;
  unread: number;
  starred: boolean;
  /** Archived only when every message is. A new reply brings the thread back. */
  archived: boolean;
  hasAttachments: boolean;
  hasInbound: boolean;
  hasOutbound: boolean;
  accountIds: string[];
  sourceIds: string[];
}

const PREFIX = /^\s*((re|fwd?|aw|wg|tr|rv|sv|antw)(\[\d+\])?\s*:\s*)+/i;

/** "RE: Fwd: Re[2]: Quote" → "quote". Used to match a reply to its conversation. */
export function normalizeSubject(subject: string | null | undefined): string {
  return (subject ?? '').replace(PREFIX, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function isReplySubject(subject: string | null | undefined): boolean {
  return /^\s*re(\[\d+\])?\s*:/i.test(subject ?? '');
}

const time = (iso: string | null) => {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
};

const lower = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

/** The other side of a message: who sent it to us, or who we sent it to. */
export function counterpartyEmails(message: Pick<ThreadableMessage, 'direction' | 'fromEmail' | 'toEmails'>): string[] {
  return message.direction === 'inbound'
    ? [lower(message.fromEmail)].filter(Boolean)
    : message.toEmails.map(lower).filter(Boolean);
}

/**
 * Groups messages into conversations.
 *
 * `thread_key` decides first. Rows without one join the conversation their
 * In-Reply-To points at, and failing that a "Re:" joins an earlier message with
 * the same subject and the same person on the other side. A bare subject match is
 * never enough: two different customers both writing "Booking" stay apart.
 */
export function groupThreads<T extends ThreadableMessage>(messages: T[]): Array<MailThread<T>> {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root) as string;
    let node = id;
    while (node !== root) { const next = parent.get(node) as string; parent.set(node, root); node = next; }
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  messages.forEach((m) => parent.set(m.id, m.id));

  const byThreadKey = new Map<string, string>();
  const byMessageId = new Map<string, string>();
  messages.forEach((m) => {
    if (m.threadKey) {
      const seen = byThreadKey.get(m.threadKey);
      if (seen) union(m.id, seen); else byThreadKey.set(m.threadKey, m.id);
    }
    const mid = lower(m.messageId);
    if (mid && !byMessageId.has(mid)) byMessageId.set(mid, m.id);
  });

  const ids = new Set(messages.map((m) => m.id));
  messages.forEach((m) => {
    const target = byMessageId.get(lower(m.inReplyTo));
    if (target) union(m.id, target);
    // A reply we sent to a message that had no thread_key carries that message's id as its key.
    if (m.threadKey && ids.has(m.threadKey)) union(m.id, m.threadKey);
  });

  // "Re:" fallback, oldest first so a reply attaches to what came before it.
  const ordered = [...messages].sort((a, b) => time(a.emailDate) - time(b.emailDate));
  ordered.forEach((m, index) => {
    if (m.threadKey || !isReplySubject(m.subject)) return;
    if (m.inReplyTo && byMessageId.has(lower(m.inReplyTo))) return;
    const subject = normalizeSubject(m.subject);
    if (!subject) return;
    const people = new Set(counterpartyEmails(m));
    for (let i = index - 1; i >= 0; i -= 1) {
      const earlier = ordered[i];
      if (normalizeSubject(earlier.subject) !== subject) continue;
      if (earlier.accountId && m.accountId && earlier.accountId !== m.accountId) continue;
      if (counterpartyEmails(earlier).some((email) => people.has(email))) { union(m.id, earlier.id); break; }
    }
  });

  const groups = new Map<string, T[]>();
  messages.forEach((m) => {
    const root = find(m.id);
    const list = groups.get(root);
    if (list) list.push(m); else groups.set(root, [m]);
  });

  const threads: Array<MailThread<T>> = [];
  groups.forEach((list) => {
    const sorted = [...list].sort((a, b) => time(a.emailDate) - time(b.emailDate));
    const latest = sorted[sorted.length - 1];
    const first = sorted[0];
    threads.push({
      key: first.id,
      messages: sorted,
      latest,
      subject: first.subject?.trim() || latest.subject?.trim() || '',
      unread: sorted.filter((m) => !m.isRead && m.direction === 'inbound').length,
      starred: sorted.some((m) => m.isStarred),
      archived: sorted.every((m) => m.isArchived),
      hasAttachments: sorted.some((m) => m.hasAttachments),
      hasInbound: sorted.some((m) => m.direction === 'inbound'),
      hasOutbound: sorted.some((m) => m.direction === 'outbound'),
      accountIds: Array.from(new Set(sorted.map((m) => m.accountId).filter((id): id is string => Boolean(id)))),
      sourceIds: Array.from(new Set(sorted.map((m) => m.sourceId).filter((id): id is string => Boolean(id)))),
    });
  });

  return threads.sort((a, b) => time(b.latest.emailDate) - time(a.latest.emailDate));
}

// ── Folders ──────────────────────────────────────────────────────────────────

export type MailFolder = 'inbox' | 'unread' | 'starred' | 'received' | 'sent' | 'archived';

export const MAIL_FOLDERS: readonly MailFolder[] = ['inbox', 'unread', 'starred', 'received', 'sent', 'archived'];

export function isMailFolder(value: string | null): value is MailFolder {
  return MAIL_FOLDERS.includes(value as MailFolder);
}

/** Starred and Sent show a thread wherever it is filed, as Gmail does. The rest hide what's archived. */
export function inFolder(thread: MailThread, folder: MailFolder): boolean {
  switch (folder) {
    case 'inbox': return !thread.archived;
    case 'unread': return !thread.archived && thread.unread > 0;
    case 'starred': return thread.starred;
    case 'received': return !thread.archived && thread.hasInbound;
    case 'sent': return thread.hasOutbound;
    case 'archived': return thread.archived;
    default: return false;
  }
}

export interface ThreadSearchText {
  subject: string | null;
  fromName: string | null;
  fromEmail: string | null;
  toEmails: string[];
  preview: string | null;
  sourceName: string | null;
}

export function matchesThreadSearch(thread: MailThread<ThreadableMessage & ThreadSearchText>, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return thread.messages.some((m) => [m.subject, m.fromName, m.fromEmail, m.preview, m.sourceName, ...m.toEmails]
    .some((value) => (value ?? '').toLowerCase().includes(q)));
}

// ── Time ─────────────────────────────────────────────────────────────────────

export interface MailTimeLabels {
  now: string;
  minutesAgo: (n: number) => string;
  hoursAgo: (n: number) => string;
  yesterday: string;
  /** BCP 47 locale for the date, e.g. `en-GB` or `ar`. */
  locale: string;
}

const ENGLISH_TIME: MailTimeLabels = {
  now: 'now',
  minutesAgo: (n) => `${n}m ago`,
  hoursAgo: (n) => `${n}h ago`,
  yesterday: 'Yesterday',
  locale: 'en-GB',
};

/** "now", "5m ago", "3h ago" today; "Yesterday"; "12 Sep" this year; "12 Sep 2025" before. */
export function mailTime(iso: string | null, now: Date = new Date(), labels: MailTimeLabels = ENGLISH_TIME): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (d.getTime() >= startOfToday) {
    if (diffMin < 1) return labels.now;
    if (diffMin < 60) return labels.minutesAgo(diffMin);
    return labels.hoursAgo(Math.floor(diffMin / 60));
  }
  if (d.getTime() >= startOfToday - 86_400_000) return labels.yesterday;
  const sameYear = d.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(labels.locale, sameYear
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

// ── Replies and forwards ─────────────────────────────────────────────────────

export type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward';

export function replySubject(subject: string | null): string {
  const s = (subject ?? '').trim();
  if (!s) return 'Re:';
  return isReplySubject(s) ? s : `Re: ${s}`;
}

export function forwardSubject(subject: string | null): string {
  const s = (subject ?? '').trim();
  return /^\s*fwd?\s*:/i.test(s) ? s : `Fwd: ${s}`.trim();
}

const uniqueEmails = (list: string[], exclude: Set<string>) => {
  const seen = new Set<string>();
  return list.filter((email) => {
    const key = lower(email);
    if (!key || exclude.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * Who a reply goes to. Our own mailboxes are never on it: replying to all on a
 * message we sent would otherwise write to ourselves.
 */
export function replyRecipients(
  message: Pick<ThreadableMessage, 'direction' | 'fromEmail' | 'toEmails'> & { ccEmails: string[] },
  ownAddresses: string[],
  mode: 'reply' | 'replyAll',
): { to: string[]; cc: string[] } {
  const own = new Set(ownAddresses.map(lower));
  const primary = message.direction === 'inbound' ? [message.fromEmail ?? ''] : message.toEmails;
  const to = uniqueEmails(primary, own);
  if (mode === 'reply') return { to, cc: [] };
  const others = message.direction === 'inbound' ? message.toEmails : [];
  const already = new Set([...own, ...to.map(lower)]);
  return { to, cc: uniqueEmails([...others, ...message.ccEmails], already) };
}

export const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** Plain text as HTML paragraphs, escaped. */
export function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export interface QuotedSource {
  fromName: string | null;
  fromEmail: string | null;
  toEmails: string[];
  ccEmails: string[];
  subject: string | null;
  dateLabel: string;
  /** Already sanitised HTML, or null to fall back on the text. */
  html: string | null;
  text: string | null;
}

const who = (name: string | null, email: string | null) => {
  if (name && email) return `${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;`;
  return escapeHtml(name || email || 'Unknown');
};

const bodyOf = (source: QuotedSource) => source.html ?? textToHtml(source.text ?? '');

/** Gmail's shape: an attribution line, then the original in a blockquote. */
export function quoteForReply(source: QuotedSource): string {
  return '<p><br></p><div class="hc-quote">'
    + `<p>On ${escapeHtml(source.dateLabel)}, ${who(source.fromName, source.fromEmail)} wrote:</p>`
    + `<blockquote style="margin:0 0 0 .8ex;border-left:2px solid #ccc;padding-left:1ex">${bodyOf(source)}</blockquote>`
    + '</div>';
}

export function forwardBlock(source: QuotedSource): string {
  const lines = [
    '---------- Forwarded message ---------',
    `From: ${who(source.fromName, source.fromEmail)}`,
    `Date: ${escapeHtml(source.dateLabel)}`,
    `Subject: ${escapeHtml(source.subject ?? '')}`,
    `To: ${escapeHtml(source.toEmails.join(', '))}`,
    ...(source.ccEmails.length ? [`Cc: ${escapeHtml(source.ccEmails.join(', '))}`] : []),
  ];
  return `<p><br></p><div class="hc-forward"><p>${lines.join('<br>')}</p><br>${bodyOf(source)}</div>`;
}

// ── Attachments ──────────────────────────────────────────────────────────────

export interface MailAttachment {
  name: string;
  type: string | null;
  size: number | null;
  url: string | null;
}

/** Inbound rows store `{ name, type }`; older ones `{ filename, contentType, size, url }`. Both read the same. */
export function normalizeAttachments(raw: unknown): MailAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item, index) => {
      const name = item.name ?? item.filename ?? item.fileName;
      const type = item.type ?? item.contentType ?? item.content_type ?? item.mimeType;
      const size = Number(item.size ?? item.length);
      const url = item.url ?? item.href;
      return {
        name: typeof name === 'string' && name.trim() ? name.trim() : `Attachment ${index + 1}`,
        type: typeof type === 'string' && type ? type : null,
        size: Number.isFinite(size) && size > 0 ? size : null,
        url: typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null,
      };
    });
}

export function formatBytes(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "PDF", "PNG", "DOCX" — from the MIME type, else the extension. */
export function attachmentKind(attachment: Pick<MailAttachment, 'name' | 'type'>): string {
  const ext = attachment.name.includes('.') ? attachment.name.split('.').pop() ?? '' : '';
  if (ext && ext.length <= 5) return ext.toUpperCase();
  const sub = (attachment.type ?? '').split('/')[1] ?? '';
  return sub ? sub.replace(/^x-|^vnd\..*$/, '').toUpperCase().slice(0, 5) || 'FILE' : 'FILE';
}

// ── New mailbox ──────────────────────────────────────────────────────────────

export const MAIL_DOMAIN = 'homestacars.com';

/** Same cleaning as create_mailbox: lower case, letters, digits, dot, dash, underscore. */
export function cleanLocalPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]/g, '');
}
