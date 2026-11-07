import React from 'react';
import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { render, screen } from '@testing-library/react';
import BrandLogo from '../components/BrandLogo';
import { BRAND_RATIO, brandImg, brandSrc, inlineBrandAssets, resetBrandCache } from './brand';

const SRC = join(__dirname, '..');
const PUBLIC = join(SRC, '..', 'public');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx|css)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('BrandLogo', () => {
  test('shows the official files at their own aspect ratio, with the brand as its alt', () => {
    render(<>
      <BrandLogo variant="icon" size={40} />
      <BrandLogo variant="wordmark" theme="light" size={34} />
      <BrandLogo variant="wordmark" theme="dark" size={34} />
    </>);
    const [icon, light, dark] = screen.getAllByAltText('Homesta Cars') as HTMLImageElement[];
    expect(icon.getAttribute('src')).toBe('/brand/homesta-icon.png');
    expect([icon.width, icon.height]).toEqual([40, 40]);
    expect(light.getAttribute('src')).toBe('/brand/homesta-wordmark-light.png');
    expect(dark.getAttribute('src')).toBe('/brand/homesta-wordmark-dark.png');
    expect(light.height).toBe(34);
    expect(light.width).toBe(Math.round(34 * 4000 / 1086));
  });
});

describe('brand files', () => {
  test('the three official files are in public/brand', () => {
    for (const file of ['homesta-icon.png', 'homesta-wordmark-light.png', 'homesta-wordmark-dark.png']) {
      expect(existsSync(join(PUBLIC, 'brand', file))).toBe(true);
    }
  });

  test('print documents size the logo from the file, never stretched', () => {
    const tag = brandImg('wordmarkLight', 34);
    expect(tag).toContain(`src="${brandSrc('wordmarkLight')}"`);
    expect(tag).toContain('alt="Homesta Cars"');
    expect(tag).toContain(`width:${Math.round(34 * BRAND_RATIO.wordmarkLight * 100) / 100}px;height:34px`);
  });

  test('before printing, each logo is swapped for a data URL', async () => {
    resetBrandCache();
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob(['png'], { type: 'image/png' })) });
    const original = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
    try {
      const html = `${brandImg('wordmarkLight', 34)}<footer>${brandImg('icon', 16)}</footer>`;
      const out = await inlineBrandAssets(html);
      expect(out).not.toContain('/brand/');
      expect(out.match(/src="data:image\/png;base64,/g)).toHaveLength(2);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      global.fetch = original;
      resetBrandCache();
    }
  });

  test('a file that cannot be fetched still prints from its full URL', async () => {
    resetBrandCache();
    const original = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    try {
      const out = await inlineBrandAssets(brandImg('icon', 16));
      expect(out).toContain(`src="${window.location.origin}/brand/homesta-icon.png"`);
    } finally {
      global.fetch = original;
      resetBrandCache();
    }
  });

  test('every printed document carries the official wordmark and icon', () => {
    for (const file of ['lib/printContract.ts', 'lib/printReplacementSheet.ts', 'lib/printCustomerInvoice.ts', 'pages/KGMPage.tsx']) {
      const source = readFileSync(join(SRC, file), 'utf8');
      expect(source).toMatch(/brandImg\('wordmark(Light|Dark)'/);
      expect(source).toContain("brandImg('icon'");
    }
    const pdf = readFileSync(join(SRC, 'components/hgs/HgsStatementPdf.tsx'), 'utf8');
    expect(pdf).toContain("brandDataUrl('wordmarkLight')");
    expect(pdf).toContain("brandDataUrl('icon')");
  });

  test('no hand-drawn or text logo is left anywhere', () => {
    const offenders = sources(SRC).filter(path => {
      const source = readFileSync(path, 'utf8');
      return /22 60 A 38 38|class="brand-name"|brand-dot|footer-brand|logo\.svg|App-logo/.test(source);
    }).map(path => relative(SRC, path));
    expect(offenders).toEqual([]);
    expect(existsSync(join(SRC, 'logo.svg'))).toBe(false);
    expect(existsSync(join(PUBLIC, 'favicon.svg'))).toBe(false);
  });
});
