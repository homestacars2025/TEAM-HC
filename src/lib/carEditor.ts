/**
 * The rules behind the Edit Car sheet, kept apart from React so both apps can agree on
 * them: where each file lives, which photo is the car's face, how near an expiry is.
 */

export type DocKey = 'ruhsat' | 'kasko' | 'insurance' | 'contract' | 'invoice';

export interface DocSpec {
  key: DocKey;
  /** The `cars_registration` column holding the public URL. */
  column: 'ruhsat_url' | 'kasko' | 'insurance_file_url' | 'purchase_contract_url' | 'purchase_invoice_url';
  /** The file name in the `doc` bucket is `<prefix>-<PLATE>`, as Admin has always written it. */
  prefix: 'R' | 'K' | 'T' | 'S' | 'F';
  /** Staff may change it in Team. The purchase papers stay with Admin. */
  staffEditable: boolean;
}

export const DOCS: readonly DocSpec[] = [
  { key: 'ruhsat', column: 'ruhsat_url', prefix: 'R', staffEditable: true },
  { key: 'kasko', column: 'kasko', prefix: 'K', staffEditable: true },
  { key: 'insurance', column: 'insurance_file_url', prefix: 'T', staffEditable: true },
  { key: 'contract', column: 'purchase_contract_url', prefix: 'S', staffEditable: false },
  { key: 'invoice', column: 'purchase_invoice_url', prefix: 'F', staffEditable: false },
];

export const DOC_BUCKET = 'doc';
export const PHOTO_BUCKET = 'cars-photos';
export const DOC_ACCEPT = 'application/pdf,image/*';
export const PHOTO_ACCEPT = 'image/*';

export const docPath = (spec: DocSpec, plate: string) => `${spec.prefix}-${plate.trim().toUpperCase()}`;

/** The stored URL carries `?v=` so a replaced file isn't served from the browser's cache. */
export const versioned = (url: string, at: number = Date.now()) => `${url}?v=${at}`;

/** Where a public URL points inside its bucket, or `null` if it isn't in that bucket. */
export function storagePath(url: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const at = url.indexOf(marker);
  if (at === -1) return null;
  const path = url.slice(at + marker.length).split(/[?#]/)[0];
  try { return decodeURIComponent(path); } catch { return path; }
}

export const safeFileName = (name: string) => name.replace(/[^\w.-]/g, '_').replace(/_+/g, '_');

export const photoPath = (carId: number, name: string, at: number = Date.now()) =>
  `car_${carId}/${at}_${safeFileName(name.replace(/\.[^.]+$/, ''))}.jpg`;

// ─── Expiry ─────────────────────────────────────────────────────────────────────

export type ExpiryTone = 'good' | 'soon' | 'urgent' | 'expired' | 'unset';

/** Whole days from `today` to `date`, both `YYYY-MM-DD`; negative once it has passed. */
export function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** Green past 60 days, amber from 15 to 60, red under 15, and red "Expired" once it's gone. */
export function expiryTone(date: string | null | undefined, today: string): { tone: ExpiryTone; days: number | null } {
  if (!date) return { tone: 'unset', days: null };
  const days = daysUntil(date, today);
  if (days < 0) return { tone: 'expired', days };
  if (days < 15) return { tone: 'urgent', days };
  if (days <= 60) return { tone: 'soon', days };
  return { tone: 'good', days };
}

// ─── Photos ─────────────────────────────────────────────────────────────────────

export interface CarPhoto {
  /** `null` for a photo still only in `cars.car_photo_urls`, before it is copied over. */
  id: number | null;
  url: string;
  primary: boolean;
  /** Left by the old dashboard in a bucket that no longer exists. Shown, never counted. */
  dead: boolean;
  name?: string;
  uploadedAt?: string;
}

export interface PhotoRow { id: number; file_path: string; is_primary: boolean | null; sort_order: number | null; created_at?: string | null }
export interface LegacyPhoto { url: string; name?: string; uploaded_at?: string }

export const isDeadPhoto = (url: string) => url.includes('/storage/v1/object/public/car_photos/');

/**
 * Usable rows in their order, then the JSON photos when the table holds nothing usable
 * (so nothing a car had disappears before the first change copies them over), then
 * the dead rows.
 */
export function mergePhotos(rows: PhotoRow[], legacy: LegacyPhoto[] | null): CarPhoto[] {
  const fromRows = [...rows]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id)
    .map<CarPhoto>(row => ({ id: row.id, url: row.file_path, primary: false, dead: isDeadPhoto(row.file_path), uploadedAt: row.created_at ?? undefined }));
  const usable = fromRows.filter(photo => !photo.dead);
  const dead = fromRows.filter(photo => photo.dead);
  const seen = new Set(fromRows.map(photo => photo.url));
  const seeded = usable.length ? [] : (legacy ?? [])
    .filter(entry => entry?.url && !seen.has(entry.url))
    .map<CarPhoto>(entry => ({ id: null, url: entry.url, primary: false, dead: false, name: entry.name, uploadedAt: entry.uploaded_at }));
  return withPrimary([...usable, ...seeded, ...dead]);
}

/** The first usable photo is the car's main one, in both apps. A dead one never is. */
export function withPrimary(photos: CarPhoto[]): CarPhoto[] {
  const first = photos.find(photo => !photo.dead)?.url;
  return photos.map(photo => ({ ...photo, primary: photo.url === first }));
}

/** Starring a photo makes it the first one. */
export function toFront(photos: CarPhoto[], url: string): CarPhoto[] {
  const index = photos.findIndex(photo => photo.url === url);
  return withPrimary(index > 0 ? movePhoto(photos, index, 0) : photos);
}

export function movePhoto<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** What `cars.car_photo_urls` keeps for older readers: usable photos, the primary first. */
export function mirrorOf(photos: CarPhoto[]): LegacyPhoto[] {
  const usable = withPrimary(photos).filter(photo => !photo.dead);
  return [...usable.filter(photo => photo.primary), ...usable.filter(photo => !photo.primary)].map(photo => ({
    url: photo.url,
    name: photo.name ?? decodeURIComponent(photo.url.split('/').pop()?.split('?')[0] ?? '').replace(/^\d+_/, ''),
    uploaded_at: photo.uploadedAt ?? new Date().toISOString(),
  }));
}

// ─── Images ─────────────────────────────────────────────────────────────────────

export const MAX_IMAGE_SIDE = 1600;

/** The size to draw at so the longer side is at most `max`, never enlarged. */
export function fitWithin(width: number, height: number, max: number = MAX_IMAGE_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** GIFs would lose their motion and SVGs their sharpness, so only photos are redrawn. */
export const shouldCompress = (file: Pick<File, 'type'>) => /^image\//.test(file.type) && !/gif|svg/.test(file.type);

/** A JPEG at most 1600px on its longer side, even from a small file. Anything that can't be decoded goes as it is. */
export async function compressImage(file: File): Promise<File> {
  if (!shouldCompress(file)) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    const size = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export const isImageUrl = (url: string) => /\.(jpe?g|png|webp|heic|gif|avif)(\?|#|$)/i.test(url);
export const isPdfUrl = (url: string) => /\.pdf(\?|#|$)/i.test(url);
