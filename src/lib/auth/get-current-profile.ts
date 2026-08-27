import { supabase } from '../supabase';

/** Roles allowed into this dashboard at all. */
const ALLOWED_ROLES = ['admin', 'staff'] as const;
/** `user_status` values that count as an account in good standing. */
const ACTIVE_STATUSES = ['active'] as const;

export interface SessionProfile {
  id: string;
  role: string;
  status: string | null;
  full_name: string | null;
}

export const isAllowedRole = (role: string | null | undefined): boolean =>
  ALLOWED_ROLES.includes((role ?? '') as (typeof ALLOWED_ROLES)[number]);

export const isActiveStatus = (status: string | null | undefined): boolean =>
  ACTIVE_STATUSES.includes((status ?? '') as (typeof ACTIVE_STATUSES)[number]);

export const isAdmin = (profile: SessionProfile | null): boolean => profile?.role === 'admin';

/**
 * The signed-in user's live profile row.
 *
 * Cached for the tab's lifetime: every action re-checks the caller, and hitting
 * `profiles` on each keystroke-driven inline save would be a request per edit.
 * A sign-out clears it, so a different user never inherits the previous one.
 */
let cached: Promise<SessionProfile | null> | null = null;

export function clearProfileCache(): void {
  cached = null;
}

supabase.auth.onAuthStateChange(() => { cached = null; });

export function getSessionProfile(): Promise<SessionProfile | null> {
  if (!cached) {
    cached = (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) return null;

      const { data, error } = await supabase
        .from('profiles')
        .select('id, role, status, full_name')
        .eq('id', user.id)
        .single();

      if (error || !data) return null;
      return data as SessionProfile;
    })();
  }
  return cached;
}

/** `null` whenever the caller may not act — suspended, wrong role, or signed out. */
export async function getCurrentProfile(): Promise<SessionProfile | null> {
  const profile = await getSessionProfile();
  if (!profile) return null;
  if (!isActiveStatus(profile.status)) return null;
  if (!isAllowedRole(profile.role)) return null;
  return profile;
}
