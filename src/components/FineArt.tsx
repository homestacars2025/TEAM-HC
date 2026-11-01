import React from 'react';

const ART = '/illustrations/alerts/fine';

/** Decorative everywhere: the words beside it say the same. */
const FineArt: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <img
    src={`${ART}.webp`}
    srcSet={`${ART}.webp 1x, ${ART}@2x.webp 2x`}
    alt=""
    width={size}
    height={size}
    decoding="async"
    className={className}
    style={{ width: size, height: size, objectFit: 'contain', flex: 'none' }}
  />
);

export default FineArt;
