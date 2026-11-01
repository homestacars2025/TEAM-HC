/** The `profiles` columns that decide how a staff member's picture looks. */
export interface StaffAvatarProfile {
  avatar_url?: string | null;
  gender?: string | null;
  avatar_bg?: string | null;
}

/** The values `profiles.avatar_bg` allows. A new one needs the database check changed first. */
export const AVATAR_BACKGROUNDS = {
  sky: { center: '#EAF3FD', edge: '#CFE2F7' },
  mint: { center: '#E9F8EF', edge: '#C9EBD8' },
  peach: { center: '#FDF0E7', edge: '#F6D5BF' },
  lavender: { center: '#F1ECFD', edge: '#DCD2F6' },
} as const;

export type AvatarBackground = keyof typeof AVATAR_BACKGROUNDS;

export const AVATAR_BACKGROUND_KEYS = Object.keys(AVATAR_BACKGROUNDS) as AvatarBackground[];

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

/** Their chosen color, or sky when the row is missing or the color is not known. */
export function getAvatarBackground(profile?: StaffAvatarProfile | null): AvatarBackground {
  const chosen = profile?.avatar_bg;
  return AVATAR_BACKGROUND_KEYS.find(key => key === chosen) ?? 'sky';
}

/** Closest-side, so the rim is the edge color: that rim is the ring around a photo. */
export function getAvatarGradient(profile?: StaffAvatarProfile | null): string {
  const { center, edge } = AVATAR_BACKGROUNDS[getAvatarBackground(profile)];
  return `radial-gradient(circle closest-side, ${center}, ${edge})`;
}
