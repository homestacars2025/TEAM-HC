import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';

/**
 * Section-based access control.
 *
 * A section is PUBLIC unless it appears in `restricted_sections` with is_active = true.
 * Restricted sections are visible only to users granted them in `staff_sections`.
 * Admins are handled inside the SECURITY DEFINER RPC — `my_allowed_restricted_sections()`
 * returns every active restricted key for an admin — so there is no client-side role check.
 */

interface SectionAccessValue {
  /** True until both lookups have resolved. Callers should not decide access while loading. */
  loading: boolean;
  /** Active restricted keys. Anything not in here is public. */
  restricted: Set<string>;
  /** Restricted keys this user may see. */
  allowed: Set<string>;
  canAccess: (sectionKey: string) => boolean;
  refresh: () => Promise<void>;
}

const EMPTY = new Set<string>();

const SectionAccessContext = createContext<SectionAccessValue>({
  loading: true,
  restricted: EMPTY,
  allowed: EMPTY,
  canAccess: () => false,
  refresh: async () => {},
});

interface AllowedRow { section_key: string }
interface RestrictedRow { key: string }

export const SectionAccessProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [restricted, setRestricted] = useState<Set<string>>(EMPTY);
  const [allowed, setAllowed] = useState<Set<string>>(EMPTY);

  const load = useCallback(async () => {
    // Both are cheap, independent lookups — fetch once per session, in parallel.
    const [restrictedRes, allowedRes] = await Promise.all([
      supabase.from('restricted_sections').select('key').eq('is_active', true),
      supabase.rpc('my_allowed_restricted_sections'),
    ]);
    return {
      restricted: new Set(((restrictedRes.data ?? []) as RestrictedRow[]).map(r => r.key)),
      allowed: new Set(((allowedRes.data ?? []) as AllowedRow[]).map(r => r.section_key)),
    };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const next = await load();
      if (!active) return;
      setRestricted(next.restricted);
      setAllowed(next.allowed);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [load]);

  const refresh = useCallback(async () => {
    const next = await load();
    setRestricted(next.restricted);
    setAllowed(next.allowed);
    setLoading(false);
  }, [load]);

  /**
   * Denies while loading so a restricted item can never flash before the grant is known.
   * Public sections are unaffected — callers only consult this for keys they declare.
   */
  const canAccess = useCallback((sectionKey: string): boolean => {
    if (loading) return false;
    if (!restricted.has(sectionKey)) return true;
    return allowed.has(sectionKey);
  }, [loading, restricted, allowed]);

  return (
    <SectionAccessContext.Provider value={{ loading, restricted, allowed, canAccess, refresh }}>
      {children}
    </SectionAccessContext.Provider>
  );
};

export const useSectionAccess = () => useContext(SectionAccessContext);
