import { supabase } from '../supabase';
import { compressImage, DOC_BUCKET, docPath, mirrorOf, PHOTO_BUCKET, photoPath, storagePath, versioned, withPrimary, type CarPhoto, type DocSpec, type LegacyPhoto, type PhotoRow, mergePhotos } from '../carEditor';
import { uploadWithProgress } from './storageUpload';

export interface CarRegistration {
  manufacture_year: number | null;
  car_package: string | null;
  insurance_expiry: string | null;
  inspection_expiry: string | null;
  purchase_date: string | null;
  ruhsat_url: string | null;
  kasko: string | null;
  insurance_file_url: string | null;
  purchase_contract_url: string | null;
  purchase_invoice_url: string | null;
}

export interface CarEditorData {
  id: number;
  plate: string;
  modelGroupId: number | null;
  /** Only read for admins. Staff never learn who owns a car. */
  investorId: number | null;
  registration: CarRegistration;
  photos: CarPhoto[];
  modelGroups: { id: number; name: string }[];
  investors: { id: number; name: string }[];
}

const REGISTRATION_COLUMNS = 'manufacture_year, car_package, insurance_expiry, inspection_expiry, purchase_date, ruhsat_url, kasko, insurance_file_url, purchase_contract_url, purchase_invoice_url';

const EMPTY_REGISTRATION: CarRegistration = {
  manufacture_year: null, car_package: null, insurance_expiry: null, inspection_expiry: null, purchase_date: null,
  ruhsat_url: null, kasko: null, insurance_file_url: null, purchase_contract_url: null, purchase_invoice_url: null,
};

export async function getCarEditor(carId: number, isAdmin: boolean): Promise<CarEditorData> {
  const [car, registration, photos, groups, investors] = await Promise.all([
    supabase.from('cars').select(isAdmin ? 'id, plate_number, model_group_id, investor_id, car_photo_urls' : 'id, plate_number, model_group_id, car_photo_urls').eq('id', carId).single(),
    supabase.from('cars_registration').select(REGISTRATION_COLUMNS).eq('car_id', carId).maybeSingle(),
    supabase.from('car_photos').select('id, file_path, is_primary, sort_order, created_at').eq('car_id', carId),
    supabase.from('model_group').select('id, name').order('name'),
    isAdmin ? supabase.from('investors').select('id, profiles!fk_investor_profile(full_name)') : Promise.resolve({ data: [], error: null }),
  ]);
  const failure = car.error ?? registration.error ?? photos.error ?? groups.error ?? investors.error;
  if (failure) throw failure;

  const row = car.data as unknown as { id: number; plate_number: string; model_group_id: number | null; investor_id?: number | null; car_photo_urls: LegacyPhoto[] | null };
  return {
    id: row.id,
    plate: row.plate_number ?? '',
    modelGroupId: row.model_group_id,
    investorId: isAdmin ? row.investor_id ?? null : null,
    registration: { ...EMPTY_REGISTRATION, ...(registration.data as Partial<CarRegistration> | null) },
    photos: mergePhotos((photos.data ?? []) as PhotoRow[], Array.isArray(row.car_photo_urls) ? row.car_photo_urls : null),
    modelGroups: ((groups.data ?? []) as { id: number; name: string }[]).map(group => ({ id: group.id, name: group.name.replace(/\s+/g, ' ').trim() })),
    investors: ((investors.data ?? []) as unknown as { id: number; profiles: { full_name: string | null } | null }[])
      .map(investor => ({ id: investor.id, name: investor.profiles?.full_name ?? '—' }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export interface CarFieldsChange {
  car?: { plate_number?: string; model_group_id?: number | null; investor_id?: number | null };
  registration?: Partial<Pick<CarRegistration, 'manufacture_year' | 'car_package' | 'insurance_expiry' | 'inspection_expiry' | 'purchase_date'>>;
}

/** Only what changed is sent, so a field this person can't edit is never written. */
export async function saveCarFields(carId: number, change: CarFieldsChange): Promise<void> {
  if (change.car && Object.keys(change.car).length) {
    const { error } = await supabase.from('cars').update(change.car).eq('id', carId);
    if (error) throw error;
  }
  if (change.registration && Object.keys(change.registration).length) {
    const { error } = await supabase.from('cars_registration').upsert({ car_id: carId, ...change.registration }, { onConflict: 'car_id' });
    if (error) throw error;
  }
}

// ─── Documents ─────────────────────────────────────────────────────────────────

/** Saved at once: the file replaces the one at the same path, and the row points at it. */
export async function uploadCarDoc(carId: number, spec: DocSpec, plate: string, file: File, onProgress: (percent: number) => void): Promise<string> {
  const ready = file.type.startsWith('image/') ? await compressImage(file) : file;
  const url = versioned(await uploadWithProgress(DOC_BUCKET, docPath(spec, plate), ready, onProgress, true));
  const { error } = await supabase.from('cars_registration').upsert({ car_id: carId, [spec.column]: url }, { onConflict: 'car_id' });
  if (error) throw error;
  return url;
}

/** The row lets go first, so it never points at a file that's gone. */
export async function removeCarDoc(carId: number, spec: DocSpec, url: string): Promise<void> {
  const { error } = await supabase.from('cars_registration').update({ [spec.column]: null }).eq('car_id', carId);
  if (error) throw error;
  const path = storagePath(url, DOC_BUCKET);
  if (path) await supabase.storage.from(DOC_BUCKET).remove([path]);
}

// ─── Photos ────────────────────────────────────────────────────────────────────

export async function uploadCarPhoto(carId: number, file: File, sortOrder: number, onProgress: (percent: number) => void): Promise<CarPhoto> {
  const ready = await compressImage(file);
  const url = await uploadWithProgress(PHOTO_BUCKET, photoPath(carId, file.name), ready, onProgress, false);
  const { data, error } = await supabase.from('car_photos').insert({ car_id: carId, file_path: url, is_primary: false, sort_order: sortOrder }).select('id, created_at').single();
  if (error) throw error;
  return { id: (data as { id: number }).id, url, primary: false, dead: false, name: file.name, uploadedAt: (data as { created_at: string | null }).created_at ?? new Date().toISOString() };
}

/**
 * Writes `photos` as they stand: copies over any still only in the JSON, stars the first
 * usable one, rewrites `sort_order` 0..n-1 and mirrors the usable ones into
 * `cars.car_photo_urls`. Only one row may be primary, so the old star comes off first.
 */
export async function syncCarPhotos(carId: number, photos: CarPhoto[]): Promise<CarPhoto[]> {
  let list = withPrimary(photos);
  const wanted = list.find(photo => photo.primary);

  const unstar = supabase.from('car_photos').update({ is_primary: false }).eq('car_id', carId).eq('is_primary', true);
  const { error: unstarError } = wanted?.id != null ? await unstar.neq('id', wanted.id) : await unstar;
  if (unstarError) throw unstarError;

  const seeded = list.filter(photo => photo.id === null);
  if (seeded.length) {
    const { data, error } = await supabase.from('car_photos')
      .insert(seeded.map(photo => ({ car_id: carId, file_path: photo.url, is_primary: false, sort_order: list.indexOf(photo) })))
      .select('id, file_path');
    if (error) throw error;
    const ids = new Map(((data ?? []) as { id: number; file_path: string }[]).map(row => [row.file_path, row.id]));
    list = list.map(photo => (photo.id === null ? { ...photo, id: ids.get(photo.url) ?? null } : photo));
  }

  const results = await Promise.all(list.map((photo, index) => (photo.id == null ? null : supabase.from('car_photos').update({ sort_order: index }).eq('id', photo.id))));
  const orderError = results.find(result => result?.error)?.error;
  if (orderError) throw orderError;

  const star = list.find(photo => photo.primary);
  if (star?.id != null) {
    const { error } = await supabase.from('car_photos').update({ is_primary: true }).eq('id', star.id);
    if (error) throw error;
  }

  const { error: mirrorError } = await supabase.from('cars').update({ car_photo_urls: mirrorOf(list) }).eq('id', carId);
  if (mirrorError) throw mirrorError;
  return list;
}

/** Takes the photo out of the table and the bucket, then writes what's left. */
export async function deleteCarPhoto(carId: number, photo: CarPhoto, rest: CarPhoto[]): Promise<CarPhoto[]> {
  if (photo.id != null) {
    const { error } = await supabase.from('car_photos').delete().eq('id', photo.id);
    if (error) throw error;
  }
  const path = storagePath(photo.url, PHOTO_BUCKET);
  if (path) await supabase.storage.from(PHOTO_BUCKET).remove([path]);
  return syncCarPhotos(carId, rest);
}
