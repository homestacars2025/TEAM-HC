import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { StaffAvatarProfile } from '../lib/staffAvatar';

export interface StaffProfileRow extends StaffAvatarProfile {
  id: string;
  full_name: string | null;
}

export type StaffProfiles = Map<string, StaffProfileRow>;

/**
 * Avatar fields for every admin and staff account, for the screens whose data
 * gives a person's id but not their photo: an RPC, or a view of `profiles`.
 *
 * `null` until the answer arrives, so a caller can hold back rather than flash
 * the wrong picture. A failed lookup resolves to an empty map: a picture is not
 * worth an error state, and everyone simply shows the neutral avatar.
 */
export function useStaffProfiles(): StaffProfiles | null {
  const [profiles, setProfiles] = useState<StaffProfiles | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('profiles')
      .select('id, full_name, avatar_url, gender, avatar_bg')
      .in('role', ['admin', 'staff'])
      .then(({ data }) => {
        if (cancelled) return;
        setProfiles(new Map(((data ?? []) as StaffProfileRow[]).map(p => [p.id, p])));
      });
    return () => { cancelled = true; };
  }, []);

  return profiles;
}
