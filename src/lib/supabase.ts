import { createClient } from '@supabase/supabase-js';
import { isWriteRequest } from './isWriteRequest';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL!;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY!;

type BeforeWrite = (input: RequestInfo | URL, init: RequestInit) => Promise<RequestInit>;

/** Set by `sessionKeeper`, which needs this client and so can't be imported here. */
let beforeWrite: BeforeWrite | null = null;
export const setBeforeWrite = (hook: BeforeWrite | null) => { beforeWrite = hook; };

const sessionFetch: typeof fetch = async (input, init = {}) => {
  if (beforeWrite && isWriteRequest(input, init)) init = await beforeWrite(input, init);
  return fetch(input, init);
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
