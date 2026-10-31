/** The two `profiles` columns that decide which picture a staff member gets. */
export interface StaffAvatarProfile {
  avatar_url?: string | null;
  gender?: string | null;
}

const AVATAR_BASE = `${process.env.PUBLIC_URL ?? ''}/avatars`;

/** The default for this person, ignoring any photo of their own. */
export function getDefaultStaffAvatar(profile?: StaffAvatarProfile | null): string {
  if (profile?.gender === 'male') return `${AVATAR_BASE}/staff-male.webp`;
  if (profile?.gender === 'female') return `${AVATAR_BASE}/staff-female.webp`;
  return `${AVATAR_BASE}/staff-neutral.webp`;
}

/** Their own photo if they have one, otherwise the default for their gender. */
export function getStaffAvatar(profile?: StaffAvatarProfile | null): string {
  return profile?.avatar_url?.trim() || getDefaultStaffAvatar(profile);
}
