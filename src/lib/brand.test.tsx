import React from 'react';
import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { render, screen } from '@testing-library/react';
import BrandLogo from '../components/BrandLogo';
import { BRAND_RATIO, brandImg, brandLockupHtml, brandSrc, inlineBrandAssets, lockupMetrics, resetBrandCache } from './brand';

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

describe('the lockup', () => {
  test('icon then wordmark at 22px beside a 32px icon, 10px apart, one label for both', () => {
    expect(lockupMetrics(32)).toEqual({ icon: 32, wordmark: 22, gap: 10 });
    render(<BrandLogo variant="lockup" size={32} />);
    const lockup = screen.getByRole('img', { name: 'Homesta Cars' });
    expect(lockup.style.gap).toBe('10px');
    const [icon, wordmark] = Array.from(lockup.querySelectorAll('img'));
    expect(icon.getAttribute('src')).toBe('/brand/homesta-icon.png');
    expect([icon.width, icon.height]).toEqual([32, 32]);
    expect(wordmark.getAttribute('src')).toBe('/brand/homesta-wordmark-light.png');
    expect([wordmark.width, wordmark.height]).toEqual([Math.round(22 * 4000 / 1086), 22]);
    expect([icon.alt, wordmark.alt]).toEqual(['', '']);
  });

  test('the dark lockup takes the white wordmark', () => {
    render(<BrandLogo variant="lockup" theme="dark" size={40} />);
    const imgs = screen.getByRole('img', { name: 'Homesta Cars' }).querySelectorAll('img');
    expect(imgs[1].getAttribute('src')).toBe('/brand/homesta-wordmark-dark.png');
    expect(imgs[1].height).toBe(28);
  });

  test('print headers get the same lockup, at the files\' own ratio', () => {
    const html = brandLockupHtml(32);
    expect(html).toContain('aria-label="Homesta Cars"');
    expect(html).toContain('gap:10px');
    expect(html.indexOf(brandSrc('icon'))).toBeLessThan(html.indexOf(brandSrc('wordmarkLight')));
    expect(html).toContain(`width:${Math.round(22 * BRAND_RATIO.wordmarkLight * 100) / 100}px;height:22px`);
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
      expect(source).toContain('brandLockupHtml(');
      expect(source).toContain("brandImg('icon'");
    }
    const pdf = readFileSync(join(SRC, 'components/hgs/HgsStatementPdf.tsx'), 'utf8');
    expect(pdf).toContain("brandDataUrl('wordmarkLight')");
    expect(pdf).toContain("brandDataUrl('icon')");
    expect(pdf).toContain('lockupMetrics(');
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
