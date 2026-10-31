import React, { useState } from 'react';
import { getDefaultStaffAvatar, getStaffAvatar, type StaffAvatarProfile } from '../lib/staffAvatar';

interface StaffAvatarProps {
  profile?: StaffAvatarProfile | null;
  /** Diameter in pixels. */
  size: number;
}

/**
 * Every staff picture in the dashboard. The name always sits beside it, so the
 * image itself is decorative. The hairline keeps the circle visible on a white
 * surface, where a character's white background would otherwise blend in.
 */
const StaffAvatar: React.FC<StaffAvatarProps> = ({ profile, size }) => {
  const src = getStaffAvatar(profile);
  // A dead `avatar_url` falls back to the default rather than a broken image.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  return (
    <img
      src={failedSrc === src ? getDefaultStaffAvatar(profile) : src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setFailedSrc(src)}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: '50%',
        objectFit: 'cover',
        objectPosition: 'top center',
        boxShadow: '0 0 0 1px var(--border-subtle)',
      }}
    />
  );
};

export default StaffAvatar;
