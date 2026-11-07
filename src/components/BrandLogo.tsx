import React from 'react';
import clsx from 'clsx';
import { BRAND_ALT, BRAND_RATIO, brandSrc, lockupMetrics, type BrandAsset } from '../lib/brand';

export interface BrandLogoProps {
  /** The arch alone, the "homesta" wordmark alone, or the two side by side. */
  variant?: 'icon' | 'wordmark' | 'lockup';
  /** The surface it sits on: dark letters on light, white letters on dark. */
  theme?: 'light' | 'dark';
  /** Height in px; for the lockup, the icon's height (the wordmark follows). */
  size?: number;
  className?: string;
}

const Asset: React.FC<{ asset: BrandAsset; height: number; alt: string; className?: string }> = ({ asset, height, alt, className }) => {
  const width = Math.round(height * BRAND_RATIO[asset]);
  return (
    <img
      src={brandSrc(asset)}
      alt={alt}
      width={width}
      height={height}
      draggable={false}
      decoding="async"
      data-brand={asset}
      style={{ width, height }}
      className={clsx(
        'block max-w-none shrink-0 select-none object-contain',
        // The icon's white ground reads as an app tile.
        asset === 'icon' && 'rounded-[22%]',
        className,
      )}
    />
  );
};

/**
 * The only way the app shows the Homesta logo: the official files in
 * public/brand/, never redrawn, stretched, recolored or filtered. Each file
 * already holds its clear space, so nothing here adds or trims padding.
 *
 * The lockup is a flex row, so under dir="rtl" the icon sits on the right.
 */
const BrandLogo: React.FC<BrandLogoProps> = ({ variant = 'wordmark', theme = 'light', size = 32, className }) => {
  const wordmark: BrandAsset = theme === 'dark' ? 'wordmarkDark' : 'wordmarkLight';

  if (variant === 'lockup') {
    const m = lockupMetrics(size);
    return (
      <span role="img" aria-label={BRAND_ALT} data-brand="lockup" style={{ gap: m.gap }} className={clsx('inline-flex shrink-0 items-center', className)}>
        <Asset asset="icon" height={m.icon} alt="" />
        <Asset asset={wordmark} height={m.wordmark} alt="" />
      </span>
    );
  }

  return <Asset asset={variant === 'icon' ? 'icon' : wordmark} height={size} alt={BRAND_ALT} className={className} />;
};

export default BrandLogo;
