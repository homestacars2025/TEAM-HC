import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';

const mockAuth = {
  getSession: jest.fn(),
  refreshSession: jest.fn(),
  signOut: jest.fn(),
  onAuthStateChange: jest.fn(),
};
let mockHook: ((input: RequestInfo | URL, init: RequestInit) => Promise<RequestInit>) | null = null;

jest.mock('./supabase', () => ({
  supabase: { get auth() { return mockAuth; } },
  supabaseAnonKey: 'anon-key',
  setBeforeWrite: (hook: typeof mockHook) => { mockHook = hook; },
}));

// eslint-disable-next-line import/first
import { ensureFreshSession, getSessionStatus, installSessionKeeper, isRefreshTokenDead, needsRefresh, resetSessionKeeperForTests, sessionRestored, signOutOnPurpose, signedOutOnPurpose, RETRY_EVERY_MS, RETRY_FOR_MS } from './sessionKeeper';
// eslint-disable-next-line import/first
import { isWriteRequest } from './isWriteRequest';

const MIN = 60 * 1000;
const session = (minutesLeft: number, token = 'old-token', refresh = 'r1') => ({ access_token: token, refresh_token: refresh, expires_at: Math.floor((Date.now() + minutesLeft * MIN) / 1000), user: { id: 'u1', email: 'sara@test.co' } });
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
let authListener: (event: string, s: unknown) => void = () => {};

beforeAll(() => {
  mockAuth.onAuthStateChange.mockImplementation((cb: typeof authListener) => { authListener = cb; return { data: { subscription: { unsubscribe() {} } } }; });
  installSessionKeeper();
});

beforeEach(() => {
  jest.useRealTimers();
  resetSessionKeeperForTests();
  mockAuth.getSession.mockReset();
  mockAuth.refreshSession.mockReset();
  mockAuth.signOut.mockReset();
  localStorage.clear();
});

describe('sessionKeeper', () => {
  test('refreshes only inside the last 10 minutes', () => {
    expect(needsRefresh(session(30))).toBe(false);
    expect(needsRefresh(session(9))).toBe(true);
    expect(needsRefresh(session(-5))).toBe(true);
  });

  test('only a refused refresh token counts as the end of the session', () => {
    expect(isRefreshTokenDead(new AuthApiError('Invalid Refresh Token: Refresh Token Not Found', 400, 'refresh_token_not_found'))).toBe(true);
    expect(isRefreshTokenDead(new AuthApiError('User is banned', 403, 'user_banned'))).toBe(true);
    expect(isRefreshTokenDead(new AuthRetryableFetchError('Failed to fetch', 0))).toBe(false);
    expect(isRefreshTokenDead(new AuthApiError('Internal error', 500, undefined))).toBe(false);
    expect(isRefreshTokenDead(new TypeError('Load failed'))).toBe(false);
  });

  test('a token with time left is left alone', async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: session(40) } });
    await ensureFreshSession();
    expect(mockAuth.refreshSession).not.toHaveBeenCalled();
    expect(getSessionStatus()).toBe('ok');
  });

  test('an expired token (a tab back from the background) is refreshed, without signing out', async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: session(-30) } });
    mockAuth.refreshSession.mockResolvedValue({ data: { session: session(60, 'new-token') }, error: null });
    await ensureFreshSession();
    expect(mockAuth.refreshSession).toHaveBeenCalledTimes(1);
    expect(getSessionStatus()).toBe('ok');
    expect(mockAuth.signOut).not.toHaveBeenCalled();
  });

  test('coming back to the tab checks the token', async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: session(5) } });
    mockAuth.refreshSession.mockResolvedValue({ data: { session: session(60, 'new-token') }, error: null });
    for (const fire of [() => document.dispatchEvent(new Event('visibilitychange')), () => window.dispatchEvent(new Event('focus')), () => window.dispatchEvent(new Event('pageshow')), () => window.dispatchEvent(new Event('online'))]) {
      mockAuth.refreshSession.mockClear();
      fire();
      await flush();
      expect(mockAuth.refreshSession).toHaveBeenCalledTimes(1);
    }
  });

  test('a network failure retries every 10 seconds for 5 minutes, and never signs out', async () => {
    jest.useFakeTimers();
    mockAuth.getSession.mockResolvedValue({ data: { session: session(-1) } });
    mockAuth.refreshSession.mockResolvedValue({ data: { session: null }, error: new AuthRetryableFetchError('Failed to fetch', 0) });
    await ensureFreshSession();
    expect(getSessionStatus()).toBe('reconnecting');
    for (let i = 0; i < 3; i++) { jest.advanceTimersByTime(RETRY_EVERY_MS); await flush(); }
    expect(mockAuth.refreshSession).toHaveBeenCalledTimes(4);
    for (let i = 0; i < RETRY_FOR_MS / RETRY_EVERY_MS + 5; i++) { jest.advanceTimersByTime(RETRY_EVERY_MS); await flush(); }
    const calls = mockAuth.refreshSession.mock.calls.length;
    expect(calls).toBeLessThanOrEqual(RETRY_FOR_MS / RETRY_EVERY_MS + 1);
    jest.advanceTimersByTime(RETRY_EVERY_MS * 3); await flush();
    expect(mockAuth.refreshSession.mock.calls.length).toBe(calls); // stopped
    expect(getSessionStatus()).toBe('reconnecting');
    expect(mockAuth.signOut).not.toHaveBeenCalled();
    // The network comes back.
    mockAuth.refreshSession.mockResolvedValue({ data: { session: session(60, 'new-token') }, error: null });
    window.dispatchEvent(new Event('online'));
    await flush();
    expect(getSessionStatus()).toBe('ok');
  });

  test('a refused refresh token asks for the password, and still never signs out', async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: session(-1) } });
    mockAuth.refreshSession.mockResolvedValue({ data: { session: null }, error: new AuthApiError('Invalid Refresh Token: Already Used', 400, 'refresh_token_already_used') });
    await ensureFreshSession();
    expect(getSessionStatus()).toBe('expired');
    expect(mockAuth.signOut).not.toHaveBeenCalled();
    // The same refused token read back from storage is no sign-in.
    authListener('TOKEN_REFRESHED', session(-1));
    expect(getSessionStatus()).toBe('expired');
    authListener('SIGNED_IN', session(60, 'new-token', 'r2'));
    expect(getSessionStatus()).toBe('ok');
  });

  test('Supabase dropping the session is not a sign-out; pressing Sign out is', async () => {
    authListener('SIGNED_OUT', null);
    expect(getSessionStatus()).toBe('expired');
    sessionRestored();
    expect(signedOutOnPurpose()).toBe(false);
    mockAuth.signOut.mockResolvedValue({ error: null });
    await signOutOnPurpose();
    expect(mockAuth.signOut).toHaveBeenCalledTimes(1);
    expect(signedOutOnPurpose()).toBe(true);
    authListener('SIGNED_OUT', null);
    expect(getSessionStatus()).toBe('ok');
    expect(signedOutOnPurpose(Date.now() + 2 * MIN)).toBe(false);
  });

  test('every write goes out with a fresh token', async () => {
    mockAuth.getSession.mockResolvedValueOnce({ data: { session: session(2) } }).mockResolvedValue({ data: { session: session(60, 'new-token') } });
    mockAuth.refreshSession.mockResolvedValue({ data: { session: session(60, 'new-token') }, error: null });
    const init = await mockHook!('https://x.supabase.co/rest/v1/bookings', { method: 'POST', headers: { Authorization: 'Bearer old-token' } });
    expect(mockAuth.refreshSession).toHaveBeenCalledTimes(1);
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer new-token');
  });

  test('a write made after the session was refused waits for the sign-in, then goes out', async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: session(-1) } });
    mockAuth.refreshSession.mockResolvedValue({ data: { session: null }, error: new AuthApiError('Invalid Refresh Token', 400, 'refresh_token_not_found') });
    let sent: RequestInit | null = null;
    const write = mockHook!('https://x.supabase.co/rest/v1/rpc/staff_update_custody_expense', { method: 'POST', headers: { Authorization: 'Bearer old-token' } }).then(init => { sent = init; });
    await flush(); await flush();
    expect(getSessionStatus()).toBe('expired');
    expect(sent).toBeNull();
    mockAuth.getSession.mockResolvedValue({ data: { session: session(60, 'after-login', 'r9') } });
    sessionRestored();
    await write;
    expect(new Headers(sent!.headers).get('Authorization')).toBe('Bearer after-login');
  });

  test('with the refresh token refused but the access token still good, writes go on', async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: session(4) } });
    mockAuth.refreshSession.mockResolvedValue({ data: { session: null }, error: new AuthApiError('Invalid Refresh Token', 400, 'refresh_token_not_found') });
    const init = await mockHook!('https://x.supabase.co/rest/v1/rpc/my_allowed_pages', { method: 'POST', headers: { Authorization: 'Bearer old-token' } });
    expect(getSessionStatus()).toBe('expired');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer old-token');
  });

  test('reads and sign-in calls are not held up', () => {
    expect(isWriteRequest('https://x.supabase.co/rest/v1/bookings?select=*', { method: 'GET' })).toBe(false);
    expect(isWriteRequest('https://x.supabase.co/rest/v1/bookings', { method: 'PATCH' })).toBe(true);
    expect(isWriteRequest('https://x.supabase.co/storage/v1/object/receipts/a.jpg', { method: 'POST' })).toBe(true);
    expect(isWriteRequest('https://x.supabase.co/auth/v1/token?grant_type=refresh_token', { method: 'POST' })).toBe(false);
  });

  test('nothing signs anyone out on a timer, and Sign out goes through one helper', () => {
    const root = join(__dirname, '..');
    const files: string[] = [];
    const walk = (dir: string) => readdirSync(dir).forEach(name => { const p = join(dir, name); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) files.push(p); });
    walk(root);
    const offenders = files.filter(f => !f.endsWith('sessionKeeper.ts') && /auth\.signOut\(/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
    expect(files.some(f => /useInactivityTimeout/.test(readFileSync(f, 'utf8')))).toBe(false);
  });
});
