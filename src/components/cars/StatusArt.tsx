import React from 'react';

const ART_DIR = '/illustrations/status';

/** The width and height of each 1x file, so nothing shifts while one loads. */
const ART_SIZES = {
  total: [256, 150],
  working: [256, 176],
  parking: [256, 164],
  maintenance: [228, 256],
  selling: [256, 194],
  replacement: [256, 132],
} as const;

export type StatusArtName = keyof typeof ART_SIZES;

/** A car status as a 3D render. Always beside its label, so always decorative. */
const StatusArt: React.FC<{ name: StatusArtName; className?: string }> = ({ name, className }) => {
  const [width, height] = ART_SIZES[name];
  return (
    <img
      src={`${ART_DIR}/${name}.webp`}
      srcSet={`${ART_DIR}/${name}.webp 1x, ${ART_DIR}/${name}@2x.webp 2x`}
      width={width}
      height={height}
      alt=""
      decoding="async"
      className={className}
    />
  );
};

export default StatusArt;
