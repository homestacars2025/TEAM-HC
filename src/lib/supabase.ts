import { createClient } from '@supabase/supabase-js';
import { isWriteRequest } from './isWriteRequest';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL!;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY!;

type BeforeWrite = (input: RequestInfo | URL, init: RequestInit) => Promise<RequestInit>;

/** Set by `sessionKeeper`, which needs this client and so can't be imported here. */
let beforeWrite: BeforeWrite | null = null;
export const setBeforeWrite = (hook: BeforeWrite | null) => { beforeWrite = hook; };

const isRefreshCall = (input: RequestInfo | URL) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return url.includes('/auth/v1/token') && url.includes('grant_type=refresh_token');
};

export const sessionFetch: typeof fetch = async (input, init = {}) => {
  if (beforeWrite && isWriteRequest(input, init)) init = await beforeWrite(input, init);
  const response = await fetch(input, init);
  // Supabase deletes the session on any refresh answer it doesn't call retryable,
  // and a rate limit or timeout is one of those. As a network failure it's retried.
  if ((response.status === 429 || response.status === 408) && isRefreshCall(input)) throw new TypeError(`Refresh deferred (${response.status})`);
  return response;
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
  global: { fetch: sessionFetch },
});

export { supabaseAnonKey };
