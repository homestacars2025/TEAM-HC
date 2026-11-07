import React from 'react';
import clsx from 'clsx';
import { BRAND_ALT, BRAND_RATIO, brandSrc, type BrandAsset } from '../lib/brand';

export interface BrandLogoProps {
  /** The arch alone, or the "homesta" wordmark. */
  variant?: 'icon' | 'wordmark';
  /** The surface it sits on: dark letters on light, white letters on dark. */
  theme?: 'light' | 'dark';
  /** Height in px; the width follows the file's own aspect ratio. */
  size?: number;
  className?: string;
}

/**
 * The only way the app shows the Homesta logo: the official files in
 * public/brand/, never redrawn, stretched, recolored or filtered. Each file
 * already holds its clear space, so nothing here adds or trims padding.
 */
const BrandLogo: React.FC<BrandLogoProps> = ({ variant = 'wordmark', theme = 'light', size = 32, className }) => {
  const asset: BrandAsset = variant === 'icon' ? 'icon' : theme === 'dark' ? 'wordmarkDark' : 'wordmarkLight';
  const width = Math.round(size * BRAND_RATIO[asset]);

  return (
    <img
      src={brandSrc(asset)}
      alt={BRAND_ALT}
      width={width}
      height={size}
      draggable={false}
      decoding="async"
      data-brand={asset}
      style={{ width, height: size }}
      className={clsx(
        'block max-w-none shrink-0 select-none object-contain',
        // The icon's white ground reads as an app tile.
        variant === 'icon' && 'rounded-[22%]',
        className,
      )}
    />
  );
};

export default BrandLogo;
