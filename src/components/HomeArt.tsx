import React from 'react';

const ART_DIR = '/illustrations/home';

/** The width and height of each 1x file, so nothing shifts while one loads. */
export const ART_SIZES = {
  custody: [480, 467],
  notifications: [480, 364],
  operations: [480, 360],
  schedule: [480, 370],
  tasks: [480, 419],
  trophy: [291, 480],
  wallet: [480, 326],
} as const;

export type HomeArtName = keyof typeof ART_SIZES;

interface HomeArtProps {
  name: HomeArtName;
  /** For the cards in the first row. Everything else waits until it is near the screen. */
  eager?: boolean;
  className?: string;
}

/** The 3D renders. Always beside words that say the same thing, so always decorative. */
const HomeArt: React.FC<HomeArtProps> = ({ name, eager = false, className }) => {
  const [width, height] = ART_SIZES[name];
  return (
    <img
      src={`${ART_DIR}/${name}.webp`}
      srcSet={`${ART_DIR}/${name}.webp 1x, ${ART_DIR}/${name}@2x.webp 2x`}
      width={width}
      height={height}
      alt=""
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className={className}
    />
  );
};

export default HomeArt;
