/**
 * The official Homesta logo files, in public/brand/. Nothing else draws the logo:
 * the app shows them through <BrandLogo>, and printouts and PDFs embed them as
 * data URLs so they print without a network request.
 *
 * - icon: the blue arch on its white ground (the app mark).
 * - wordmarkLight: dark letters, for light surfaces.
 * - wordmarkDark: white letters, for dark surfaces.
 *
 * Each file carries its own clear space, so it is shown whole, at its own aspect
 * ratio, never cropped, recolored, shadowed or filtered. The Admin app does the same.
 */

export type BrandAsset = 'icon' | 'wordmarkLight' | 'wordmarkDark';

export const BRAND_ALT = 'Homesta Cars';

const BRAND_FILES: Record<BrandAsset, string> = {
  icon: 'homesta-icon.png',
  wordmarkLight: 'homesta-wordmark-light.png',
  wordmarkDark: 'homesta-wordmark-dark.png',
};

/** Width over height of each file (the wordmarks are 4000 × 1086, the icon square). */
export const BRAND_RATIO: Record<BrandAsset, number> = {
  icon: 1,
  wordmarkLight: 4000 / 1086,
  wordmarkDark: 4000 / 1086,
};

/** Plenty for print: the wordmark is never printed wider than about 60mm. */
const EMBED_MAX_WIDTH: Record<BrandAsset, number> = {
  icon: 512,
  wordmarkLight: 1200,
  wordmarkDark: 1200,
};

/** The lockup: the wordmark sits at this share of the icon's height (22px beside a 32px icon). */
export const LOCKUP_WORDMARK_SCALE = 0.6875;

/** Icon and wordmark heights and the gap between them, for an icon `size` px high. */
export function lockupMetrics(size: number): { icon: number; wordmark: number; gap: number } {
  return { icon: size, wordmark: Math.round(size * LOCKUP_WORDMARK_SCALE), gap: Math.round((size * 10) / 32 * 10) / 10 };
}

const ASSETS = Object.keys(BRAND_FILES) as BrandAsset[];

/** The file's path in the app, e.g. `/brand/homesta-icon.png`. */
export function brandSrc(asset: BrandAsset): string {
  return `${process.env.PUBLIC_URL ?? ''}/brand/${BRAND_FILES[asset]}`;
}

/**
 * The logo for an HTML print document, at a height in px with the width set from
 * the file, so it can't be stretched. printHtml() inlines the file before printing.
 */
export function brandImg(asset: BrandAsset, height: number, className = 'brand-logo'): string {
  const width = Math.round(height * BRAND_RATIO[asset] * 100) / 100;
  return `<img class="${className}" src="${brandSrc(asset)}" alt="${BRAND_ALT}" width="${Math.round(width)}" height="${height}" style="width:${width}px;height:${height}px">`;
}

/**
 * The icon and the wordmark side by side for a print header, vertically centered.
 * A flex row, so in a right-to-left document the icon sits on the right.
 */
export function brandLockupHtml(iconHeight: number, theme: 'light' | 'dark' = 'light'): string {
  const { icon, wordmark, gap } = lockupMetrics(iconHeight);
  const asset: BrandAsset = theme === 'dark' ? 'wordmarkDark' : 'wordmarkLight';
  const img = (a: BrandAsset, h: number, radius: string) => {
    const w = Math.round(h * BRAND_RATIO[a] * 100) / 100;
    return `<img src="${brandSrc(a)}" alt="" width="${Math.round(w)}" height="${h}" style="display:block;flex:none;width:${w}px;height:${h}px;object-fit:contain${radius}">`;
  };
  return `<span class="brand-lockup" role="img" aria-label="${BRAND_ALT}" style="display:inline-flex;align-items:center;gap:${gap}px">`
    + img('icon', icon, ';border-radius:22%')
    + img(asset, wordmark, '')
    + '</span>';
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('unreadable')));
    reader.onerror = () => reject(reader.error ?? new Error('unreadable'));
    reader.readAsDataURL(blob);
  });
}

/** Scaled down, never up, at the same aspect ratio; the original when there's no canvas. */
async function embeddable(blob: Blob, maxWidth: number): Promise<string> {
  const original = readAsDataUrl(blob);
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return original;
  try {
    const bitmap = await createImageBitmap(blob);
    if (bitmap.width <= maxWidth) return original;
    const canvas = document.createElement('canvas');
    canvas.width = maxWidth;
    canvas.height = Math.round(bitmap.height * (maxWidth / bitmap.width));
    const context = canvas.getContext('2d');
    if (!context) return original;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL('image/png');
  } catch {
    return original;
  }
}

const cache = new Map<BrandAsset, Promise<string>>();

/** The file as a data URL, fetched once per session. Rejects if it can't be fetched. */
export function brandDataUrl(asset: BrandAsset): Promise<string> {
  const cached = cache.get(asset);
  if (cached) return cached;
  const loading = fetch(brandSrc(asset))
    .then(response => {
      if (!response.ok) throw new Error(`brand asset ${asset}: ${response.status}`);
      return response.blob();
    })
    .then(blob => embeddable(blob, EMBED_MAX_WIDTH[asset]));
  cache.set(asset, loading);
  loading.catch(() => cache.delete(asset));
  return loading;
}

/** All three as data URLs, for a PDF that has to carry them inside. */
export async function brandDataUrls(): Promise<Record<BrandAsset, string>> {
  const urls = await Promise.all(ASSETS.map(brandDataUrl));
  return Object.fromEntries(ASSETS.map((asset, i) => [asset, urls[i]])) as Record<BrandAsset, string>;
}

/**
 * Print documents write `brandSrc(...)` like any page. Before printing, each is
 * swapped for its data URL, so the logo is inside the document: a printout opened
 * from a blob URL can't reach `/brand/...`. If a file can't be fetched, the
 * absolute URL stands in, which still prints when online. Never throws.
 */
export async function inlineBrandAssets(html: string): Promise<string> {
  const used = ASSETS.filter(asset => html.includes(brandSrc(asset)));
  let out = html;
  for (const asset of used) {
    let replacement: string;
    try {
      replacement = await brandDataUrl(asset);
    } catch {
      replacement = new URL(brandSrc(asset), window.location.origin).href;
    }
    out = out.split(brandSrc(asset)).join(replacement);
  }
  return out;
}

/** For tests: forget what was fetched. */
export function resetBrandCache(): void {
  cache.clear();
}
