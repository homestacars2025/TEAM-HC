import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/**
 * Resolves whether the current signed-in user may view the Accounting section.
 * Looks up the user's row in `team_members` (by profile_id = auth user id) and
 * checks `can_view_accounting`.
 *
 * @returns `null` while loading, then `true` / `false` once resolved.
 */
export function useAccountingAccess(): boolean | null {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setAllowed(false);
        return;
      }
      const { data, error } = await supabase
        .from('team_members')
        .select('can_view_accounting')
        .eq('profile_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      setAllowed(!error && data?.can_view_accounting === true);
    })();
    return () => { cancelled = true; };
  }, []);

  return allowed;
}
