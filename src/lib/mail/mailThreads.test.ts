import {
  attachmentKind,
  cleanLocalPart,
  forwardBlock,
  forwardSubject,
  groupThreads,
  inFolder,
  mailTime,
  normalizeAttachments,
  normalizeSubject,
  quoteForReply,
  replyRecipients,
  replySubject,
  type ThreadableMessage,
} from './mailThreads';
import { sanitizeEmailHtml } from './mailSanitize';

let seq = 0;
const msg = (over: Partial<ThreadableMessage> = {}): ThreadableMessage => {
  seq += 1;
  return {
    id: `m${seq}`,
    direction: 'inbound',
    subject: 'Booking',
    fromEmail: 'ali@example.com',
    fromName: 'Ali',
    toEmails: ['info@homestacars.com'],
    emailDate: `2026-11-0${Math.min(seq, 9)}T10:00:00Z`,
    isRead: true,
    isArchived: false,
    isStarred: false,
    threadKey: null,
    messageId: null,
    inReplyTo: null,
    hasAttachments: false,
    accountId: 'info',
    sourceId: null,
    ...over,
  };
};

beforeEach(() => { seq = 0; });

describe('normalizeSubject', () => {
  it('strips any run of reply and forward prefixes', () => {
    expect(normalizeSubject('RE: Fwd: Re[2]:  Quote  for May')).toBe('quote for may');
    expect(normalizeSubject(null)).toBe('');
  });
});

describe('groupThreads', () => {
  it('groups by thread_key first, oldest message first', () => {
    const a = msg({ threadKey: 't1', emailDate: '2026-11-01T10:00:00Z' });
    const b = msg({ threadKey: 't1', direction: 'outbound', emailDate: '2026-11-02T10:00:00Z' });
    const c = msg({ threadKey: 't2', emailDate: '2026-11-03T10:00:00Z' });
    const threads = groupThreads([b, c, a]);
    expect(threads.map((t) => t.messages.map((m) => m.id))).toEqual([[c.id], [a.id, b.id]]);
    expect(threads[1].key).toBe(a.id);
  });

  it('joins a row with no thread_key to the message its In-Reply-To names', () => {
    const original = msg({ threadKey: 't1', messageId: '<abc@x>' });
    const reply = msg({ inReplyTo: '<ABC@x>', subject: 'Something else' });
    expect(groupThreads([original, reply])).toHaveLength(1);
  });

  it('keeps our reply with a keyless original, through its id or its Message-ID', () => {
    const original = msg({ messageId: '<o@x>' });
    const reply = msg({ direction: 'outbound', threadKey: original.id, inReplyTo: '<o@x>', subject: 'Re: Booking', toEmails: ['ali@example.com'] });
    const later = msg({ threadKey: 'server-key', inReplyTo: '<o@x>' });
    expect(groupThreads([original, reply, later])).toHaveLength(1);
  });

  it('joins a "Re:" to an earlier message with the same subject and the same person', () => {
    const first = msg({ subject: 'Booking', emailDate: '2026-11-01T10:00:00Z' });
    const reply = msg({ subject: 'Re: Booking', emailDate: '2026-11-02T10:00:00Z' });
    expect(groupThreads([reply, first])).toHaveLength(1);
  });

  it('keeps two people with the same subject apart', () => {
    const first = msg({ subject: 'Booking' });
    const other = msg({ subject: 'Re: Booking', fromEmail: 'sara@example.com' });
    expect(groupThreads([first, other])).toHaveLength(2);
  });

  it('never merges plain same-subject messages without a reply marker', () => {
    expect(groupThreads([msg({ subject: 'Booking' }), msg({ subject: 'Booking' })])).toHaveLength(2);
  });

  it('counts unread inbound only, and archives a thread only when every message is', () => {
    const [thread] = groupThreads([
      msg({ threadKey: 't', isRead: false }),
      msg({ threadKey: 't', direction: 'outbound', isRead: false, isArchived: true }),
    ]);
    expect(thread.unread).toBe(1);
    expect(thread.archived).toBe(false);
    expect(inFolder(thread, 'inbox')).toBe(true);
    expect(inFolder(thread, 'unread')).toBe(true);
    expect(inFolder(thread, 'archived')).toBe(false);
  });

  it('shows starred and sent wherever the thread is filed', () => {
    const [thread] = groupThreads([msg({ threadKey: 't', direction: 'outbound', isStarred: true, isArchived: true })]);
    expect(inFolder(thread, 'archived')).toBe(true);
    expect(inFolder(thread, 'starred')).toBe(true);
    expect(inFolder(thread, 'sent')).toBe(true);
    expect(inFolder(thread, 'inbox')).toBe(false);
    expect(inFolder(thread, 'received')).toBe(false);
  });
});

describe('mailTime', () => {
  const now = new Date(2026, 10, 12, 15, 0, 0);
  it('is relative today, "Yesterday", then a date', () => {
    expect(mailTime(new Date(2026, 10, 12, 14, 55).toISOString(), now)).toBe('5m ago');
    expect(mailTime(new Date(2026, 10, 12, 9, 0).toISOString(), now)).toBe('6h ago');
    expect(mailTime(new Date(2026, 10, 11, 23, 0).toISOString(), now)).toBe('Yesterday');
    expect(mailTime(new Date(2026, 8, 3, 9, 0).toISOString(), now)).toBe('3 Sept');
    expect(mailTime(new Date(2025, 8, 3, 9, 0).toISOString(), now)).toBe('3 Sept 2025');
    expect(mailTime(null, now)).toBe('—');
  });
});

describe('replies', () => {
  const own = ['info@homestacars.com', 'partners@homestacars.com'];

  it('replies to the sender, and to all without ourselves or duplicates', () => {
    const message = { direction: 'inbound' as const, fromEmail: 'ali@example.com', toEmails: ['info@homestacars.com', 'sara@example.com'], ccEmails: ['ALI@example.com', 'omar@example.com'] };
    expect(replyRecipients(message, own, 'reply')).toEqual({ to: ['ali@example.com'], cc: [] });
    expect(replyRecipients(message, own, 'replyAll')).toEqual({ to: ['ali@example.com'], cc: ['sara@example.com', 'omar@example.com'] });
  });

  it('replying to our own message writes to the people we wrote to', () => {
    const message = { direction: 'outbound' as const, fromEmail: null, toEmails: ['ali@example.com'], ccEmails: [] };
    expect(replyRecipients(message, own, 'replyAll')).toEqual({ to: ['ali@example.com'], cc: [] });
  });

  it('prefixes subjects once', () => {
    expect(replySubject('Quote')).toBe('Re: Quote');
    expect(replySubject('RE: Quote')).toBe('RE: Quote');
    expect(forwardSubject('Quote')).toBe('Fwd: Quote');
    expect(forwardSubject('Fwd: Quote')).toBe('Fwd: Quote');
  });

  it('quotes the original and escapes the attribution', () => {
    const source = { fromName: 'Ali <x>', fromEmail: 'ali@example.com', toEmails: ['info@homestacars.com'], ccEmails: [], subject: 'Hi', dateLabel: '12 Nov 2026', html: null, text: 'Line 1\nLine 2' };
    const quoted = quoteForReply(source);
    expect(quoted).toContain('On 12 Nov 2026, Ali &lt;x&gt; &lt;ali@example.com&gt; wrote:');
    expect(quoted).toContain('<blockquote');
    expect(quoted).toContain('Line 1<br>Line 2');
    expect(forwardBlock(source)).toContain('---------- Forwarded message ---------');
  });
});

describe('attachments', () => {
  it('reads both stored shapes and drops unsafe links', () => {
    expect(normalizeAttachments([
      { name: 'Profile.pdf', type: 'application/pdf' },
      { filename: 'a.png', contentType: 'image/png', size: 2048, url: 'javascript:alert(1)' },
      null,
    ])).toEqual([
      { name: 'Profile.pdf', type: 'application/pdf', size: null, url: null },
      { name: 'a.png', type: 'image/png', size: 2048, url: null },
    ]);
    expect(normalizeAttachments('nope')).toEqual([]);
    expect(attachmentKind({ name: 'Profile.pdf', type: null })).toBe('PDF');
  });
});

describe('new mailbox address', () => {
  it('cleans the local part the way create_mailbox does', () => {
    expect(cleanLocalPart('Sales Team!')).toBe('salesteam');
    expect(cleanLocalPart('ops.ist-1_a')).toBe('ops.ist-1_a');
  });
});

describe('sanitizeEmailHtml', () => {
  it('removes scripts, handlers and javascript links, and opens links in a new tab', () => {
    const clean = sanitizeEmailHtml('<p onclick="x()">Hi<script>alert(1)</script></p><a href="javascript:alert(1)">a</a><a href="https://ok.com">b</a><style>body{display:none}</style><form><input></form>');
    expect(clean).not.toMatch(/script|onclick|javascript|<style|<form|<input/i);
    expect(clean).toContain('href="https://ok.com"');
    expect(clean).toContain('target="_blank"');
    expect(clean).toContain('rel="noopener noreferrer nofollow"');
  });
});
