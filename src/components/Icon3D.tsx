import React from 'react';

export type Icon3DName = 'total' | 'confirmed' | 'pending' | 'completed';

const ICON_DIR = `${process.env.PUBLIC_URL ?? ''}/icons/3d/bookings`;

/** The 3D status icons. Always beside words that say the same thing, so always decorative. */
const Icon3D: React.FC<{ name: Icon3DName; size?: number; className?: string }> = ({ name, size = 60, className }) => (
  <img src={`${ICON_DIR}/${name}.png`} alt="" width={size} height={size} decoding="async" className={className} />
);

export default Icon3D;
