import { readFileSync } from 'fs';
import { join } from 'path';
import {
  DOCS, daysUntil, docPath, expiryTone, fitWithin, isDeadPhoto, mergePhotos, mirrorOf, movePhoto, photoPath,
  shouldCompress, storagePath, toFront, versioned, withPrimary, type CarPhoto,
} from './carEditor';

const BASE = 'https://x.supabase.co/storage/v1/object/public';
const live = (name: string) => `${BASE}/cars-photos/car_1/${name}.jpg`;
const dead = (name: string) => `${BASE}/car_photos/car_1/${name}.jpg`;

describe('expiry chip', () => {
  it('counts whole days in the calendar, not hours', () => {
    expect(daysUntil('2026-11-06', '2026-11-05')).toBe(1);
    expect(daysUntil('2026-11-05', '2026-11-05')).toBe(0);
    expect(daysUntil('2026-11-01', '2026-11-05')).toBe(-4);
    expect(daysUntil('2027-03-31', '2026-11-05')).toBe(146);
  });

  it('is green past 60 days, amber from 15 to 60, red under 15 and once expired', () => {
    const today = '2026-11-05';
    expect(expiryTone('2027-01-05', today)).toEqual({ tone: 'good', days: 61 });
    expect(expiryTone('2027-01-04', today).tone).toBe('soon');
    expect(expiryTone('2026-11-20', today)).toEqual({ tone: 'soon', days: 15 });
    expect(expiryTone('2026-11-19', today)).toEqual({ tone: 'urgent', days: 14 });
    expect(expiryTone('2026-11-05', today)).toEqual({ tone: 'urgent', days: 0 });
    expect(expiryTone('2026-11-04', today)).toEqual({ tone: 'expired', days: -1 });
    expect(expiryTone(null, today)).toEqual({ tone: 'unset', days: null });
  });
});

describe('documents', () => {
  it('keeps the paths Admin has always used, and only the branch papers', () => {
    expect(DOCS.map(doc => `${doc.key}:${doc.prefix}:${doc.column}`)).toEqual(['ruhsat:R:ruhsat_url', 'kasko:K:kasko', 'insurance:T:insurance_file_url']);
    expect(docPath(DOCS[0], ' 34abc123 ')).toBe('R-34ABC123');
  });

  it('finds the object behind a versioned, encoded URL', () => {
    const url = versioned(`${BASE}/doc/K-34%20HZ`, 123);
    expect(url.endsWith('?v=123')).toBe(true);
    expect(storagePath(url, 'doc')).toBe('K-34 HZ');
    expect(storagePath(url, 'cars-photos')).toBeNull();
  });
});

describe('photos', () => {
  it('names uploads car_<id>/<time>_<name>.jpg', () => {
    expect(photoPath(7, 'My photo (1).HEIC', 99)).toBe('car_7/99_My_photo_1_.jpg');
  });

  it('spots rows left in the deleted bucket', () => {
    expect(isDeadPhoto(dead('a'))).toBe(true);
    expect(isDeadPhoto(live('a'))).toBe(false);
  });

  it('shows the JSON photos first and the dead rows last, the first JSON one starred', () => {
    const merged = mergePhotos(
      [{ id: 2, file_path: dead('b'), is_primary: true, sort_order: 1 }, { id: 1, file_path: dead('a'), is_primary: false, sort_order: 0 }],
      [{ url: live('x') }, { url: live('y') }],
    );
    expect(merged.map(photo => [photo.id, photo.dead, photo.primary])).toEqual([[null, false, true], [null, false, false], [1, true, false], [2, true, false]]);
  });

  it('stars the first usable row, whatever the table says', () => {
    const merged = mergePhotos([{ id: 1, file_path: live('a'), is_primary: false, sort_order: 0 }, { id: 2, file_path: live('b'), is_primary: true, sort_order: 1 }], null);
    expect(merged.map(photo => photo.primary)).toEqual([true, false]);
  });

  it('ignores the JSON once the table holds a usable photo', () => {
    const merged = mergePhotos([{ id: 1, file_path: live('a'), is_primary: true, sort_order: 0 }], [{ url: live('x') }]);
    expect(merged.map(photo => photo.url)).toEqual([live('a')]);
  });

  it('makes the first usable photo the primary, and starring moves a photo to the front', () => {
    const list: CarPhoto[] = [
      { id: 1, url: dead('a'), primary: true, dead: true },
      { id: 2, url: live('b'), primary: false, dead: false },
      { id: 3, url: live('c'), primary: false, dead: false },
    ];
    expect(withPrimary(list).map(photo => photo.primary)).toEqual([false, true, false]);
    expect(toFront(list, live('c')).map(photo => [photo.url, photo.primary])).toEqual([[live('c'), true], [dead('a'), false], [live('b'), false]]);
    expect(withPrimary([list[0]]).map(photo => photo.primary)).toEqual([false]);
  });

  it('mirrors the usable photos into the JSON, the primary first', () => {
    const list: CarPhoto[] = [
      { id: 1, url: live('a'), primary: false, dead: false, name: 'a.jpg', uploadedAt: 't1' },
      { id: 2, url: dead('b'), primary: false, dead: true },
      { id: 3, url: live('c'), primary: false, dead: false, name: 'c.jpg', uploadedAt: 't3' },
    ];
    expect(mirrorOf(list)).toEqual([{ url: live('a'), name: 'a.jpg', uploaded_at: 't1' }, { url: live('c'), name: 'c.jpg', uploaded_at: 't3' }]);
  });

  it('moves one photo and leaves the rest in order', () => {
    expect(movePhoto(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(movePhoto(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(movePhoto(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
  });

  it('shrinks to 1600px on the longer side and never enlarges', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(shouldCompress({ type: 'image/jpeg' })).toBe(true);
    expect(shouldCompress({ type: 'image/gif' })).toBe(false);
    expect(shouldCompress({ type: 'application/pdf' })).toBe(false);
  });
});

describe('no investors or purchase papers in Team', () => {
  const read = (file: string) => readFileSync(join(__dirname, file), 'utf8');
  const sources = ['queries/carEditor.ts', '../pages/CarsPage.tsx', '../components/cars/CarEditor.tsx', '../components/AlertSection.tsx', 'queries/carCompliance.ts']
    .map(file => [file, read(file)] as const);

  it.each(sources)('%s never names them', (_file, source) => {
    expect(source).not.toMatch(/investor|purchase_contract_url|purchase_invoice_url|purchase_date|purchaseDate/i);
  });

  it('reads the car and its registration by named columns only', () => {
    const source = read('queries/carEditor.ts');
    expect(source).toMatch(/CAR_COLUMNS = 'id, plate_number, model_group_id, car_photo_urls'/);
    expect(source).toMatch(/REGISTRATION_COLUMNS = 'manufacture_year, car_package, insurance_expiry, inspection_expiry, ruhsat_url, kasko, insurance_file_url, has_spare_key'/);
    expect(source).not.toMatch(/select\('\*'\)/);
  });

  it('never selects everything from a Cars page view', () => {
    expect(read('../components/AlertSection.tsx')).not.toMatch(/select\('\*'\)/);
  });
});
