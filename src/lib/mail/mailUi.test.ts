import fs from 'fs';
import path from 'path';
import i18n from '../../i18n';

const SRC = path.join(__dirname, '..', '..');
const read = (file: string) => fs.readFileSync(path.join(SRC, file), 'utf8');

const MAIL_FILES = [
  'pages/MailPage.tsx',
  ...fs.readdirSync(path.join(SRC, 'components/mail')).filter((f) => f.endsWith('.tsx')).map((f) => `components/mail/${f}`),
];

/** Keys built from a value at run time, listed out so every one is checked. */
const FOLDERS = ['inbox', 'unread', 'starred', 'received', 'sent', 'archived'];
const TEMPLATED = [
  ...FOLDERS.map((f) => `folders.${f}`),
  ...FOLDERS.flatMap((f) => [`empty.${f}.title`, `empty.${f}.hint`]),
  ...['new', 'reply', 'replyAll', 'forward'].map((m) => `compose.title.${m}`),
  ...['draft', 'pending_approval', 'queued', 'sent', 'failed', 'received'].map((s) => `status.${s}`),
];

describe('every Inbox string exists in both languages', () => {
  const keys = Array.from(new Set([
    ...MAIL_FILES.flatMap((file) => Array.from(read(file).matchAll(/[^\w.]t\('([^']+)'/g)).map((m) => m[1])),
    ...TEMPLATED,
  ]));
  const present = (key: string, lng: string) =>
    i18n.exists(`mail:${key}`, { lng, fallbackLng: [] }) || i18n.exists(`mail:${key}_other`, { lng, fallbackLng: [] });

  test('the files use some keys', () => expect(keys.length).toBeGreaterThan(60));
  test.each(['en', 'ar'])('%s', (lng) => {
    expect(keys.filter((key) => !present(key, lng))).toEqual([]);
  });

  test('the Arabic file is Arabic, with every plural form', () => {
    expect(/[؀-ۿ]/.test(JSON.stringify(require('../../locales/ar/mail.json')))).toBe(true);
    const ar = i18n.getFixedT('ar', 'mail');
    expect(ar('reader.messages', { count: 2 })).toBe('رسالتان');
    expect(ar('reader.messages', { count: 5 })).toBe('5 رسائل');
    expect(i18n.getFixedT('ar', 'sidebar')('nav.mail')).toBe('البريد');
  });
});

describe('the Inbox stays inside its mailboxes', () => {
  test('the route is behind the mailbox guard, not app_pages', () => {
    expect(read('App.tsx')).toContain('path="mail" element={<RequireMail><Suspense fallback={<MediaChunkFallback />}><MailPage /></Suspense></RequireMail>}');
  });

  test('every read names the mailboxes it may touch', () => {
    const api = read('lib/mail/mailApi.ts');
    for (const fn of ['listMailbox', 'getBodies', 'searchMessageIds', 'unreadByAccount']) {
      const body = api.slice(api.indexOf(`export async function ${fn}`));
      const end = body.indexOf('\nexport ', 10);
      expect(body.slice(0, end)).toContain(".in('account_id', accountIds)");
    }
    // No unscoped read of the mailbox list.
    expect(api).not.toMatch(/from\('inbox_view'\)\.select\([^)]*\)\s*\.order/);
  });

  test('only an admin is offered delete, and only can_send mailboxes are offered to write from', () => {
    const page = read('pages/MailPage.tsx');
    expect(page).toContain('canDelete={access.isAdmin}');
    expect(page).toContain('sendableAccounts={access.sendableAccounts}');
    expect(page).toContain('canSend={threadCanSend}');
    expect(page).not.toMatch(/createMailbox|email_account_access|NewMailbox/);
  });

  test('the sidebar still holds nothing personal', () => {
    expect(read('components/Sidebar.tsx')).not.toContain('supabase');
  });
});
