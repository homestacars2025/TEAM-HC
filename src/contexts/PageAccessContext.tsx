import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';

/**
 * Page-based access control.
 *
 * `my_allowed_pages()` decides what the signed-in user may open: admins get every
 * active page; staff get their department's pages plus admin grants, minus admin
 * denies. There is no role check on this side — the RPC is the only authority.
 *
 * FAIL-CLOSED: `allowedPages` is only ever filled from a complete, successful
 * load. If the first load fails the set stays empty and `error` is set, so nothing
 * can open by default.
 *
 * Only a successful load may change access. Once one has succeeded, a failed
 * refresh keeps that answer — it is the server's last word, not a default — sets
 * `refreshFailed` and retries with backoff, so a dropped connection never throws
 * someone off a page they are halfway through.
 */

export interface AppPage {
  key: string;
  label_en: string;
  label_ar: string;
  route: string;
  group_key: string;
  sort_order: number;
}

export interface Department {
  key: string;
  label: string;
}

interface DepartmentRow {
  key: string;
  label_en: string;
  label_ar: string;
}

interface TeamMemberRow {
  department_key: string | null;
  is_department_head: boolean | null;
  departments: DepartmentRow | null;
}

interface AllowedPageRow { page_key: string }

interface PageAccessValue {
  /** Active pages in `sort_order`, including ones this user may not open. */
  pages: AppPage[];
  allowedPages: Set<string>;
  canAccessPage: (key: string) => boolean;
  /** Exact match on a page's route, so an unknown path is never allowed. */
  canAccessRoute: (pathname: string) => boolean;
  firstAllowedRoute: string | null;
  department: Department | null;
  isDepartmentHead: boolean;
  loading: boolean;
  /** The first load failed: nothing is allowed until it succeeds. */
  error: string | null;
  /** A refresh failed: access is unchanged and a retry is scheduled. */
  refreshFailed: boolean;
  refresh: () => Promise<void>;
}

interface Snapshot {
  pages: AppPage[];
  allowedPages: Set<string>;
  department: DepartmentRow | null;
  isDepartmentHead: boolean;
}

const REFRESH_MS = 5 * 60 * 1000;

/** Delay before each retry of a failed refresh, then `RETRY_STEADY_MS` from there on. */
const RETRY_BACKOFF_MS = [1000, 3000, 10000];
const RETRY_STEADY_MS = 60 * 1000;

const EMPTY_SNAPSHOT: Snapshot = {
  pages: [],
  allowedPages: new Set<string>(),
  department: null,
  isDepartmentHead: false,
};

const PageAccessContext = createContext<PageAccessValue>({
  pages: EMPTY_SNAPSHOT.pages,
  allowedPages: EMPTY_SNAPSHOT.allowedPages,
  canAccessPage: () => false,
  canAccessRoute: () => false,
  firstAllowedRoute: null,
  department: null,
  isDepartmentHead: false,
  loading: true,
  error: null,
  refreshFailed: false,
  refresh: async () => {},
});

const normalizePath = (pathname: string): string => pathname.replace(/\/+$/, '') || '/';

/** Throws if any lookup fails: a partial answer must never become a permission. */
async function fetchSnapshot(): Promise<Snapshot> {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session) throw new Error('No active session');

  const [allowedRes, pagesRes, memberRes] = await Promise.all([
    supabase.rpc('my_allowed_pages'),
    supabase
      .from('app_pages')
      .select('key, label_en, label_ar, route, group_key, sort_order')
      .eq('is_active', true)
      .order('sort_order')
      // Wallet and custody share a sort_order, and a tie would otherwise be random.
      .order('key', { ascending: false }),
    // Filtered by id because staff can read every team_members row. Admins have
    // no row at all, which is a valid answer rather than a failure.
    supabase
      .from('team_members')
      .select('department_key, is_department_head, departments(key, label_en, label_ar)')
      .eq('profile_id', session.user.id)
      .maybeSingle(),
  ]);

  const failure = allowedRes.error ?? pagesRes.error ?? memberRes.error;
  if (failure) throw failure;

  const pages = (pagesRes.data ?? []) as AppPage[];
  const activeKeys = new Set(pages.map(p => p.key));
  const member = memberRes.data as unknown as TeamMemberRow | null;

  return {
    pages,
    // A key with no active page has no route to open and no item to show.
    allowedPages: new Set(
      ((allowedRes.data ?? []) as AllowedPageRow[]).map(r => r.page_key).filter(k => activeKeys.has(k)),
    ),
    department: member?.departments ?? null,
    isDepartmentHead: member?.is_department_head === true,
  };
}

const fingerprint = (s: Snapshot): string =>
  JSON.stringify([s.pages, Array.from(s.allowedPages).sort(), s.department, s.isDepartmentHead]);

export const PageAccessProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { i18n } = useTranslation();
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Refreshes failed in a row since the last success; drives the backoff below. */
  const [failedRefreshes, setFailedRefreshes] = useState(0);

  const mounted = useRef(true);
  const inFlight = useRef<Promise<void> | null>(null);
  const lastFingerprint = useRef('');
  const hasLoaded = useRef(false);
  const hasError = useRef(false);

  const load = useCallback((): Promise<void> => {
    // Focus, the timer and a retry can overlap; one request answers them all.
    if (inFlight.current) return inFlight.current;

    const run = (async () => {
      try {
        const next = await fetchSnapshot();
        if (!mounted.current) return;
        // A refresh that changes nothing must not re-render every guard.
        const nextFingerprint = fingerprint(next);
        if (nextFingerprint !== lastFingerprint.current) {
          lastFingerprint.current = nextFingerprint;
          setSnapshot(next);
        }
        hasLoaded.current = true;
        hasError.current = false;
        setError(null);
        setFailedRefreshes(0);
      } catch (e) {
        if (!mounted.current) return;
        if (hasLoaded.current) {
          setFailedRefreshes(n => n + 1);
        } else {
          hasError.current = true;
          setError(e instanceof Error ? e.message : (e as { message?: string })?.message ?? 'Could not load page access');
        }
      } finally {
        inFlight.current = null;
        if (mounted.current) setLoading(false);
      }
    })();

    inFlight.current = run;
    return run;
  }, []);

  const refresh = useCallback(async () => {
    // After a failed first load the screen is the error state, so a retry shows
    // progress. Otherwise the refresh is silent and the current page stays put.
    if (hasError.current) setLoading(true);
    await load();
  }, [load]);

  useEffect(() => {
    mounted.current = true;
    load();

    const timer = window.setInterval(load, REFRESH_MS);
    window.addEventListener('focus', load);

    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', load);
    };
  }, [load]);

  useEffect(() => {
    if (failedRefreshes === 0) return;
    const delay = RETRY_BACKOFF_MS[failedRefreshes - 1] ?? RETRY_STEADY_MS;
    const timer = window.setTimeout(load, delay);
    return () => window.clearTimeout(timer);
  }, [failedRefreshes, load]);

  const isArabic = i18n.resolvedLanguage?.startsWith('ar') ?? false;

  const value = useMemo<PageAccessValue>(() => {
    const { pages, allowedPages, department, isDepartmentHead } = snapshot;
    const allowedRoutes = new Set(pages.filter(p => allowedPages.has(p.key)).map(p => normalizePath(p.route)));

    return {
      pages,
      allowedPages,
      canAccessPage: (key: string) => allowedPages.has(key),
      canAccessRoute: (pathname: string) => allowedRoutes.has(normalizePath(pathname)),
      firstAllowedRoute: pages.find(p => allowedPages.has(p.key))?.route ?? null,
      department: department
        ? { key: department.key, label: isArabic ? department.label_ar : department.label_en }
        : null,
      isDepartmentHead,
      loading,
      error,
      refreshFailed: failedRefreshes > 0,
      refresh,
    };
  }, [snapshot, isArabic, loading, error, failedRefreshes, refresh]);

  return <PageAccessContext.Provider value={value}>{children}</PageAccessContext.Provider>;
};

export const usePageAccess = () => useContext(PageAccessContext);
