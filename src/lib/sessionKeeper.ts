import { isAuthApiError, isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { setBeforeWrite, supabase, supabaseAnonKey } from './supabase';

/**
 * Keeps the person signed in. Nobody is signed out except by pressing Sign out
 * (or by an admin disabling the account, which makes the refresh token invalid).
 *
 * - The token is refreshed when it has under 10 minutes left: whenever the tab
 *   comes back (iOS pauses timers in the background, so the library's own ticker
 *   can sleep through the expiry), and before every write.
 * - A refresh that fails on the network is retried quietly every 10 seconds for
 *   5 minutes, with a "Reconnecting…" banner. The page and its forms stay as they are.
 * - Only a refresh token Supabase rejects asks for the password again, in a dialog
 *   over the page. A write waiting on it goes out once the person is back in.
 */

export type SessionStatus = 'ok' | 'reconnecting' | 'expired';

export const REFRESH_WITHIN_MS = 10 * 60 * 1000;
export const RETRY_EVERY_MS = 10 * 1000;
export const RETRY_FOR_MS = 5 * 60 * 1000;

let status: SessionStatus = 'ok';
const listeners = new Set<() => void>();
/** The refresh token Supabase refused, so a later event carrying it isn't taken for a new sign-in. */
let deadRefreshToken: string | null = null;
/** Who was signed in, to fill in the dialog and to tell a different account apart. */
let lastEmail: string | null = null;
let lastUserId: string | null = null;
export const getLastEmail = () => lastEmail;
export const getLastUserId = () => lastUserId;

/**
 * Someone was signed in on this device when the page loaded. Read before Supabase
 * looks at the session, because a refused refresh token makes it delete the entry.
 */
let hadStoredSession = false;
export const hadSessionAtBoot = () => hadStoredSession;

function readStoredUser() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !/^sb-.+-auth-token$/.test(key)) continue;
      const user = JSON.parse(localStorage.getItem(key) ?? 'null')?.user;
      if (!user?.id) continue;
      hadStoredSession = true;
      lastUserId = user.id;
      lastEmail = user.email ?? null;
    }
  } catch { /* unreadable storage: nobody to remember */ }
}

function setStatus(next: SessionStatus) {
  if (next === status) return;
  status = next;
  listeners.forEach(listener => listener());
}

export const getSessionStatus = (): SessionStatus => status;
export function subscribeSessionStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export const needsRefresh = (session: Pick<Session, 'expires_at'>, now = Date.now()): boolean =>
  !!session.expires_at && session.expires_at * 1000 - now < REFRESH_WITHIN_MS;

const isExpired = (session: Pick<Session, 'expires_at'>, now = Date.now()): boolean =>
  !!session.expires_at && session.expires_at * 1000 <= now;

/** Supabase turned the refresh token down: revoked, used up, or the account disabled. Anything else may pass. */
export function isRefreshTokenDead(error: unknown): boolean {
  if (isAuthRetryableFetchError(error)) return false;
  if (!isAuthApiError(error)) return (error as { name?: string } | null)?.name === 'AuthSessionMissingError';
  // Too many requests or a timeout says nothing about the token.
  return error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429;
}

/** The library retries a failing network for up to 30s before answering; the banner doesn't wait that long. */
export const BANNER_AFTER_MS = 2500;

let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryingSince: number | null = null;

function stopRetrying() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  retryingSince = null;
}

function retrySoon() {
  retryingSince ??= Date.now();
  if (retryTimer || Date.now() - retryingSince >= RETRY_FOR_MS) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void ensureFreshSession();
  }, RETRY_EVERY_MS);
}

async function check(): Promise<void> {
  const slow = setTimeout(() => { if (status === 'ok') setStatus('reconnecting'); }, BANNER_AFTER_MS);
  try {
    await checkNow();
  } finally {
    clearTimeout(slow);
  }
}

async function checkNow(): Promise<void> {
  // An expired token that can't be refreshed for now (offline, a phone waking up)
  // comes back as no session plus the network error, not as a sign-out.
  const { data: { session }, error: loadError } = await supabase.auth.getSession();
  if (!session && loadError && !isRefreshTokenDead(loadError)) {
    setStatus('reconnecting');
    retrySoon();
    return;
  }
  // Signed out on purpose, or never signed in: the route guard takes it from here.
  if (!session) return;
  lastEmail = session.user?.email ?? lastEmail;
  lastUserId = session.user?.id ?? lastUserId;
  if (!needsRefresh(session)) {
    stopRetrying();
    if (status === 'reconnecting') setStatus('ok');
    return;
  }
  const { data, error } = await supabase.auth.refreshSession();
  if (!error && data.session) {
    stopRetrying();
    setStatus('ok');
    return;
  }
  if (isRefreshTokenDead(error)) {
    stopRetrying();
    deadRefreshToken = session.refresh_token;
    setStatus('expired');
    return;
  }
  setStatus('reconnecting');
  retrySoon();
}

let inflight: Promise<void> | null = null;

/** Refreshes the token if it has under 10 minutes left. Never throws, never signs out. */
export function ensureFreshSession(): Promise<void> {
  inflight ??= check().catch(() => { setStatus('reconnecting'); retrySoon(); }).finally(() => { inflight = null; });
  return inflight;
}

/** Resolves once the person has signed in again from the dialog. */
function backInSession(): Promise<void> {
  if (status !== 'expired') return Promise.resolve();
  return new Promise(resolve => {
    const off = subscribeSessionStatus(() => {
      if (status === 'expired') return;
      off();
      resolve();
    });
  });
}

/** Called when the dialog's sign-in succeeds. */
export function sessionRestored() {
  stopRetrying();
  deadRefreshToken = null;
  setStatus('ok');
}

const SIGNED_OUT_KEY = 'hc_signed_out_at';

/** The Sign out button, the only way out. Other tabs see the mark and follow to the login page. */
export async function signOutOnPurpose(): Promise<void> {
  try { localStorage.setItem(SIGNED_OUT_KEY, String(Date.now())); } catch { /* private mode: this tab still signs out */ }
  stopRetrying();
  await supabase.auth.signOut();
}

/** A sign-out in the last minute was someone pressing Sign out, here or in another tab. */
export function signedOutOnPurpose(now = Date.now()): boolean {
  try {
    const at = Number(localStorage.getItem(SIGNED_OUT_KEY));
    return !!at && now - at < 60 * 1000;
  } catch {
    return false;
  }
}

async function beforeWrite(_input: RequestInfo | URL, init: RequestInit): Promise<RequestInit> {
  await ensureFreshSession();
  // A refused refresh token leaves the access token working until it expires, and
  // until then nothing has to wait. After that the write waits for the sign-in.
  let { data: { session } } = await supabase.auth.getSession();
  if (status === 'expired' && (!session || isExpired(session))) {
    await backInSession();
    ({ data: { session } } = await supabase.auth.getSession());
  }
  if (!session) return init;
  const headers = new Headers(init.headers);
  // The client stamped the token it had before the refresh; send the current one.
  // A request sent with only the public key stays that way.
  if (headers.get('Authorization') !== `Bearer ${supabaseAnonKey}`) headers.set('Authorization', `Bearer ${session.access_token}`);
  return { ...init, headers };
}

let installed = false;

export function installSessionKeeper() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  readStoredUser();
  setBeforeWrite(beforeWrite);
  const wake = () => { if (document.visibilityState !== 'hidden') void ensureFreshSession(); };
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('focus', wake);
  window.addEventListener('pageshow', wake);
  window.addEventListener('online', () => {
    // Back online starts a fresh 5 minutes of retries.
    stopRetrying();
    void ensureFreshSession();
  });
  void ensureFreshSession();
  // Only reads the event: awaiting the client in here would deadlock it.
  supabase.auth.onAuthStateChange((event, session) => {
    if (session?.user) {
      lastEmail = session.user.email ?? lastEmail;
      lastUserId = session.user.id;
    }
    if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
      try { localStorage.removeItem(SIGNED_OUT_KEY); } catch { /* nothing to clear */ }
      // The same refused token coming back from storage isn't a sign-in.
      if (status === 'expired' && session.refresh_token === deadRefreshToken) return;
      stopRetrying();
      deadRefreshToken = null;
      setStatus('ok');
    }
    // Supabase dropped the session itself: its refresh token was refused.
    if (event === 'SIGNED_OUT' && !signedOutOnPurpose()) {
      stopRetrying();
      setStatus('expired');
    }
  });
}

/** For tests. */
export function resetSessionKeeperForTests() {
  stopRetrying();
  status = 'ok';
  inflight = null;
  deadRefreshToken = null;
  hadStoredSession = false;
}
