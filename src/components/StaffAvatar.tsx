import React, { useState } from 'react';
import { getDefaultStaffAvatar, getStaffAvatar, type StaffAvatarProfile } from '../lib/staffAvatar';

interface StaffAvatarProps {
  profile?: StaffAvatarProfile | null;
  /** Diameter in pixels. */
  size: number;
}

/**
 * Every staff picture in the dashboard. The name always sits beside it, so the
 * image itself is decorative. A default character is a bust rising out of the
 * circle; someone's own photo is centred and fills it.
 */
const StaffAvatar: React.FC<StaffAvatarProps> = ({ profile, size }) => {
  const src = getStaffAvatar(profile);
  const fallback = getDefaultStaffAvatar(profile);
  // A dead `avatar_url` falls back to the default rather than a broken image.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const shown = failedSrc === src ? fallback : src;

  return (
    <span className={`hc-avatar ${shown === fallback ? 'hc-avatar-bust' : ''}`} style={{ width: size, height: size }}>
      <img src={shown} alt="" loading="lazy" decoding="async" onError={() => setFailedSrc(src)} />
    </span>
  );
};

export default StaffAvatar;
