/**
 * The Model Groups page: each group with its specs, prices and rules from
 * `model_group`, and how it performed from `model_group_stats(p_month)`.
 * The same page as Admin's, with what staff may see and change narrowed here.
 *
 * Money: `model_group.price` is the base daily price in USD (the website sells in
 * USD), shown in lira at today's rate. `deposit` is lira, and so is the RPC's
 * `avg_daily_rate`, what bookings really paid per day in the month. That figure is
 * accounting's, so only admins and people with the Accounting page see it.
 * `car_pricing_tiers` are long-rental discounts that apply to every group.
 *
 * Nothing here reads an investor: a group's cars come with plate, status and
 * utilization only.
 */

import { supabase } from './supabase';
import { CAR_STATUSES, readCarStatus, type CarStatus, type Utilization } from './fleetCalendar';
import { getCarUtilization } from './queries/fleetCalendar';

// ─── Rows ────────────────────────────────────────────────────────────────────

export interface ModelGroupRow {
  id: number;
  name: string;
  brand: string | null;
  model: string | null;
  category: string | null;
  transmission: string | null;
  fuel: string | null;
  seats: number | null;
  luggage: number | null;
  daily_km: number | null;
  monthly_km: number | null;
  deposit: number | null;
  min_age: number | null;
  price: number | null;
  image_url: string | null;
}

export interface ModelGroupStats {
  model_group_id: number;
  cars_total: number;
  cars_active: number;
  /** Cars on a confirmed or active booking today, whatever the month shown. */
  rented_now: number;
  /** 0 to 100 for the month: the group's cars' utilization, averaged. Null with no active car. */
  utilization: number | null;
  bookings_month: number;
  /** Lira per day the month's bookings really paid. Null when none had an amount. */
  avg_daily_rate: number | null;
}

export interface PricingTier {
  id: number;
  min_days: number;
  max_days: number;
  discount_percent: number;
  is_active: boolean;
}

export interface GroupCar {
  id: number;
  plate: string;
  isActive: boolean;
  status: CarStatus;
  utilization: Utilization | undefined;
}

const GROUP_COLUMNS = 'id, name, brand, model, category, transmission, fuel, seats, luggage, daily_km, monthly_km, deposit, min_age, price, image_url';

const num = (value: unknown): number | null => (value === null || value === undefined || value === '' || Number.isNaN(Number(value)) ? null : Number(value));
const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null);

export function readGroup(row: Record<string, unknown>): ModelGroupRow {
  return {
    id: Number(row.id),
    name: String(row.name ?? ''),
    brand: str(row.brand),
    model: str(row.model),
    category: str(row.category),
    transmission: str(row.transmission),
    fuel: str(row.fuel),
    seats: num(row.seats),
    luggage: num(row.luggage),
    daily_km: num(row.daily_km),
    monthly_km: num(row.monthly_km),
    deposit: num(row.deposit),
    min_age: num(row.min_age),
    price: num(row.price),
    image_url: str(row.image_url),
  };
}

export async function fetchModelGroups(): Promise<ModelGroupRow[]> {
  const { data, error } = await supabase.from('model_group').select(GROUP_COLUMNS).order('name');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map(readGroup);
}

export function readStats(row: Record<string, unknown>): ModelGroupStats {
  return {
    model_group_id: Number(row.model_group_id),
    cars_total: Number(row.cars_total) || 0,
    cars_active: Number(row.cars_active) || 0,
    rented_now: Number(row.rented_now) || 0,
    utilization: num(row.utilization),
    bookings_month: Number(row.bookings_month) || 0,
    avg_daily_rate: num(row.avg_daily_rate),
  };
}

/** The month's figures by group. `withRate` false drops the real daily rate as it arrives. */
export async function fetchModelGroupStats(month: string, withRate: boolean): Promise<Map<number, ModelGroupStats>> {
  const { data, error } = await supabase.rpc('model_group_stats', { p_month: `${month}-01` });
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const stats = readStats(row);
    if (!withRate) stats.avg_daily_rate = null;
    return [stats.model_group_id, stats];
  }));
}

export async function fetchPricingTiers(): Promise<PricingTier[]> {
  const { data, error } = await supabase.from('car_pricing_tiers').select('id, min_days, max_days, discount_percent, is_active').order('min_days');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: Number(row.id),
    min_days: Number(row.min_days),
    max_days: Number(row.max_days),
    discount_percent: Number(row.discount_percent) || 0,
    is_active: row.is_active !== false,
  }));
}

/** The group's cars with today's status and the month's utilization, fetched side by side. */
export async function fetchGroupCars(groupId: number, month: string): Promise<GroupCar[]> {
  const [cars, availability, utilization] = await Promise.all([
    supabase.from('cars').select('id, plate_number, is_active').eq('model_group_id', groupId),
    supabase.from('car_availability').select('id, status'),
    getCarUtilization(month),
  ]);
  if (cars.error) throw new Error(cars.error.message);
  if (availability.error) throw new Error(availability.error.message);
  const statusById = new Map(((availability.data ?? []) as Array<{ id: number; status: string | null }>).map((row) => [Number(row.id), row.status]));
  const utilById = new Map(utilization.map((row) => [row.carId, row]));
  return sortGroupCars(((cars.data ?? []) as Array<{ id: number; plate_number: string | null; is_active: boolean | null }>).map((car) => ({
    id: Number(car.id),
    plate: car.plate_number ?? '—',
    isActive: car.is_active !== false,
    status: readCarStatus(statusById.get(Number(car.id))),
    utilization: utilById.get(Number(car.id)),
  })));
}

/** Active cars first, those out on a booking at the top, then by plate. */
export function sortGroupCars(cars: GroupCar[]): GroupCar[] {
  const rank = (car: GroupCar) => (car.isActive ? CAR_STATUSES.indexOf(car.status) : CAR_STATUSES.length);
  return [...cars].sort((a, b) => rank(a) - rank(b) || a.plate.localeCompare(b.plate));
}

// ─── Who may do what ─────────────────────────────────────────────────────────

export interface ModelGroupAccess {
  /** Image and specs: admins, and staff with the Model Groups page. */
  canEditSpecs: boolean;
  /** Name, category, price, tiers, deposit and rules: admins only. */
  canEditAll: boolean;
  /** A new group needs a price, so admins only. */
  canCreate: boolean;
  /** What bookings really paid per day: admins, and staff with the Accounting page. */
  canSeeRealRate: boolean;
}

export function modelGroupAccess(role: string | null | undefined, canAccessPage: (key: string) => boolean): ModelGroupAccess {
  const isAdmin = role === 'admin';
  return {
    canEditSpecs: isAdmin || canAccessPage('model_groups'),
    canEditAll: isAdmin,
    canCreate: isAdmin,
    canSeeRealRate: isAdmin || canAccessPage('accounting'),
  };
}

// ─── Filters, search and sort ────────────────────────────────────────────────

export const MODEL_FILTERS = ['rented', 'low', 'noimage'] as const;
export type ModelFilter = typeof MODEL_FILTERS[number];

/** Below this a group's month counts as low. */
export const LOW_UTILIZATION = 60;

/** Every active car of the group is out on a booking right now. */
export const isFullyRented = (stats: ModelGroupStats | undefined): boolean =>
  Boolean(stats && stats.cars_active > 0 && stats.rented_now >= stats.cars_active);

export const isLowUtilization = (stats: ModelGroupStats | undefined): boolean =>
  Boolean(stats && stats.utilization !== null && stats.utilization < LOW_UTILIZATION);

export function matchesFilter(group: ModelGroupRow, stats: ModelGroupStats | undefined, filter: ModelFilter | 'all'): boolean {
  if (filter === 'rented') return isFullyRented(stats);
  if (filter === 'low') return isLowUtilization(stats);
  if (filter === 'noimage') return !group.image_url;
  return true;
}

export function filterCounts(groups: ModelGroupRow[], stats: Map<number, ModelGroupStats>): Record<ModelFilter, number> {
  const counts: Record<ModelFilter, number> = { rented: 0, low: 0, noimage: 0 };
  groups.forEach((group) => MODEL_FILTERS.forEach((filter) => { if (matchesFilter(group, stats.get(group.id), filter)) counts[filter] += 1; }));
  return counts;
}

/** "Brand Model", or the stored name where either is missing. */
export const displayName = (group: Pick<ModelGroupRow, 'name' | 'brand' | 'model'>): string => {
  const brand = group.brand?.trim();
  const model = group.model?.trim();
  return brand && model ? `${brand} ${model}` : group.name.trim() || brand || model || '';
};

const fold = (text: string) => text.toLocaleLowerCase('en-US').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');

export function matchesSearch(group: ModelGroupRow, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = fold([group.name, group.brand, group.model].filter(Boolean).join(' '));
  return words.every((word) => haystack.includes(word));
}

export const MODEL_SORTS = ['utilization', 'cars', 'price', 'name'] as const;
export type ModelSort = typeof MODEL_SORTS[number];
export type SortDirection = 'asc' | 'desc';

export const DEFAULT_SORT: ModelSort = 'utilization';

/** The way a sort opens: the busiest, biggest and dearest first, names from A. */
export const firstSortDirection = (key: ModelSort): SortDirection => (key === 'name' ? 'asc' : 'desc');

/** `?sort=price` or `?sort=price-asc`; anything else is the default. */
export function readSort(param: string | null): { key: ModelSort; direction: SortDirection } {
  const [key, direction] = (param ?? '').split('-');
  if (!(MODEL_SORTS as readonly string[]).includes(key)) return { key: DEFAULT_SORT, direction: firstSortDirection(DEFAULT_SORT) };
  const sortKey = key as ModelSort;
  return { key: sortKey, direction: direction === 'asc' || direction === 'desc' ? direction : firstSortDirection(sortKey) };
}

/** The address form of a sort, or null for the default so the URL stays clean. */
export function writeSort(key: ModelSort, direction: SortDirection): string | null {
  if (key === DEFAULT_SORT && direction === firstSortDirection(key)) return null;
  return direction === firstSortDirection(key) ? key : `${key}-${direction}`;
}

/** A group with no figure goes last either way; ties fall back to the name. */
export function sortGroups(groups: ModelGroupRow[], stats: Map<number, ModelGroupStats>, key: ModelSort, direction: SortDirection): ModelGroupRow[] {
  const sign = direction === 'asc' ? 1 : -1;
  const value = (group: ModelGroupRow): number | null => {
    if (key === 'utilization') return stats.get(group.id)?.utilization ?? null;
    if (key === 'cars') return stats.get(group.id)?.cars_total ?? null;
    if (key === 'price') return group.price;
    return null;
  };
  const byName = (a: ModelGroupRow, b: ModelGroupRow) => displayName(a).localeCompare(displayName(b), 'en');
  return [...groups].sort((a, b) => {
    if (key === 'name') return sign * byName(a, b);
    const va = value(a);
    const vb = value(b);
    if (va === null || vb === null) return (va === null ? 1 : 0) - (vb === null ? 1 : 0) || byName(a, b);
    return sign * (va - vb) || byName(a, b);
  });
}

// ─── Prices ──────────────────────────────────────────────────────────────────

/** The USD base price in lira at the given USD rate; null without a price or a rate. */
export function listPriceTry(priceUsd: number | null, usdRate: number | null | undefined): number | null {
  if (priceUsd === null || !usdRate || usdRate <= 0) return null;
  return Math.round(priceUsd * usdRate);
}

/** The deepest active long-rental discount and the days it starts from. */
export function bestTier(tiers: PricingTier[]): PricingTier | null {
  return tiers.filter((tier) => tier.is_active && tier.discount_percent > 0)
    .reduce<PricingTier | null>((best, tier) => (!best || tier.discount_percent > best.discount_percent ? tier : best), null);
}

export const discounted = (amount: number, percent: number): number => Math.round(amount * (1 - percent / 100));

export type RateTone = 'above' | 'below' | 'none';

/** What bookings really paid against the list price: at or above it is good, below it a warning. */
export function rateTone(avgDailyRate: number | null, listTry: number | null): RateTone {
  if (avgDailyRate === null || listTry === null) return 'none';
  return avgDailyRate >= listTry ? 'above' : 'below';
}

// ─── Edit form ───────────────────────────────────────────────────────────────

export const CATEGORIES = ['Economy', 'Middle', 'Luxury', 'SUV', 'Van', 'Electric'] as const;
export const TRANSMISSIONS = ['Automatic', 'Manual'] as const;
export const FUELS = ['Petrol', 'Diesel', 'Hybrid', 'Electric', 'Other'] as const;

export interface ModelGroupForm {
  name: string;
  brand: string;
  model: string;
  category: string;
  transmission: string;
  fuel: string;
  seats: string;
  luggage: string;
  price: string;
  deposit: string;
  min_age: string;
  daily_km: string;
  monthly_km: string;
}

export type FormField = keyof ModelGroupForm;

export const BASIC_FIELDS: readonly FormField[] = ['brand', 'model', 'name', 'category'];
export const SPEC_FIELDS: readonly FormField[] = ['transmission', 'fuel', 'seats', 'luggage'];
export const PRICE_FIELDS: readonly FormField[] = ['price'];
export const RULE_FIELDS: readonly FormField[] = ['deposit', 'min_age', 'daily_km', 'monthly_km'];
const ALL_FIELDS: readonly FormField[] = [...BASIC_FIELDS, ...SPEC_FIELDS, ...PRICE_FIELDS, ...RULE_FIELDS];

/** The fields this person may change; the rest of the form shows locked. */
export function editableFields(access: Pick<ModelGroupAccess, 'canEditSpecs' | 'canEditAll'>): ReadonlySet<FormField> {
  if (access.canEditAll) return new Set(ALL_FIELDS);
  if (access.canEditSpecs) return new Set(SPEC_FIELDS);
  return new Set();
}

export const EMPTY_FORM: ModelGroupForm = {
  name: '', brand: '', model: '', category: 'Economy', transmission: 'Automatic', fuel: 'Petrol',
  seats: '5', luggage: '', price: '', deposit: '', min_age: '', daily_km: '', monthly_km: '',
};

const text = (value: number | null) => (value === null ? '' : String(value));

export function toForm(group: ModelGroupRow): ModelGroupForm {
  return {
    name: group.name,
    brand: group.brand ?? '',
    model: group.model ?? '',
    category: group.category ?? 'Economy',
    transmission: group.transmission ?? 'Automatic',
    fuel: group.fuel ?? 'Petrol',
    seats: text(group.seats),
    luggage: text(group.luggage),
    price: text(group.price),
    deposit: text(group.deposit),
    min_age: text(group.min_age),
    daily_km: text(group.daily_km),
    monthly_km: text(group.monthly_km),
  };
}

export function changedFields(form: ModelGroupForm, baseline: ModelGroupForm): FormField[] {
  return (Object.keys(form) as FormField[]).filter((key) => form[key].trim() !== baseline[key].trim());
}

/** A number typed with a dot or a comma for decimals; null when empty, NaN when it isn't one. */
export function parseNumber(value: string): number | null {
  const trimmed = value.trim().replace(/\s/g, '');
  if (trimmed === '') return null;
  const normalised = trimmed.replace(',', '.');
  return /^\d+(\.\d+)?$/.test(normalised) ? Number(normalised) : Number.NaN;
}

/** A key under `modelGroups:errors`. */
export type FieldError = 'required' | 'priceRequired' | 'priceAboveZero' | 'amount' | 'whole' | 'seatsMin' | 'ageRange';

const WHOLE: FormField[] = ['seats', 'luggage', 'min_age', 'daily_km', 'monthly_km'];

/** Problems in the fields that can be changed; a locked field never blocks a save. */
export function validateForm(form: ModelGroupForm, fields: ReadonlySet<FormField>): Partial<Record<FormField, FieldError>> {
  const errors: Partial<Record<FormField, FieldError>> = {};
  if (!form.brand.trim()) errors.brand = 'required';
  if (!form.model.trim()) errors.model = 'required';
  if (!form.name.trim()) errors.name = 'required';
  const price = parseNumber(form.price);
  if (price === null) errors.price = 'priceRequired';
  else if (Number.isNaN(price) || price <= 0) errors.price = 'priceAboveZero';
  const deposit = parseNumber(form.deposit);
  if (deposit !== null && Number.isNaN(deposit)) errors.deposit = 'amount';
  WHOLE.forEach((key) => {
    const value = parseNumber(form[key]);
    if (value !== null && (Number.isNaN(value) || !Number.isInteger(value))) errors[key] = 'whole';
  });
  const seats = parseNumber(form.seats);
  if (!errors.seats && seats !== null && seats < 1) errors.seats = 'seatsMin';
  const age = parseNumber(form.min_age);
  if (!errors.min_age && age !== null && (age < 18 || age > 99)) errors.min_age = 'ageRange';
  (Object.keys(errors) as FormField[]).forEach((key) => { if (!fields.has(key)) delete errors[key]; });
  return errors;
}

type Payload = Partial<Record<FormField, string | number | null>>;

/** The columns to save: only the fields this person may change. Call it on a form that passed validateForm. */
export function formPayload(form: ModelGroupForm, fields: ReadonlySet<FormField>): Payload {
  const whole = (value: string) => { const parsed = parseNumber(value); return parsed === null ? null : Math.round(parsed); };
  const all: Record<FormField, string | number | null> = {
    name: form.name.trim(),
    brand: form.brand.trim(),
    model: form.model.trim(),
    category: form.category,
    transmission: form.transmission,
    fuel: form.fuel,
    seats: whole(form.seats),
    luggage: whole(form.luggage),
    price: parseNumber(form.price),
    deposit: parseNumber(form.deposit),
    min_age: whole(form.min_age),
    daily_km: whole(form.daily_km),
    monthly_km: whole(form.monthly_km),
  };
  return Object.fromEntries((Object.keys(all) as FormField[]).filter((key) => fields.has(key)).map((key) => [key, all[key]]));
}

// ─── Pricing tiers ───────────────────────────────────────────────────────────

/** A tier as it is being edited: `id` is null for one not saved yet. */
export interface TierDraft {
  key: string;
  id: number | null;
  min_days: string;
  max_days: string;
  discount_percent: string;
  is_active: boolean;
}

export const toTierDrafts = (tiers: PricingTier[]): TierDraft[] => tiers.map((tier) => ({
  key: `tier-${tier.id}`,
  id: tier.id,
  min_days: String(tier.min_days),
  max_days: String(tier.max_days),
  discount_percent: String(tier.discount_percent),
  is_active: tier.is_active,
}));

/** A key under `modelGroups:tierErrors`, with what the message needs. */
export interface TierError {
  code: 'days' | 'order' | 'percent' | 'overlap';
  from?: string;
  to?: string;
}

export function validateTiers(drafts: TierDraft[]): Record<string, TierError> {
  const errors: Record<string, TierError> = {};
  const parsed = drafts.map((draft) => ({ draft, min: parseNumber(draft.min_days), max: parseNumber(draft.max_days), pct: parseNumber(draft.discount_percent) }));
  parsed.forEach(({ draft, min, max, pct }) => {
    if (min === null || max === null || Number.isNaN(min) || Number.isNaN(max) || !Number.isInteger(min) || !Number.isInteger(max) || min < 1) errors[draft.key] = { code: 'days' };
    else if (max < min) errors[draft.key] = { code: 'order' };
    else if (pct === null || Number.isNaN(pct) || pct < 0 || pct > 100) errors[draft.key] = { code: 'percent' };
  });
  const active = parsed.filter((item) => item.draft.is_active && !errors[item.draft.key]).sort((a, b) => (a.min ?? 0) - (b.min ?? 0));
  for (let i = 1; i < active.length; i += 1) {
    if ((active[i].min ?? 0) <= (active[i - 1].max ?? 0)) errors[active[i].draft.key] = { code: 'overlap', from: active[i - 1].draft.min_days, to: active[i - 1].draft.max_days };
  }
  return errors;
}

/** How many tiers were added, edited or removed, for the unsaved-changes hint; works on drafts that don't validate yet. */
export function tierDraftChangeCount(original: PricingTier[], drafts: TierDraft[]): number {
  const before = new Map(toTierDrafts(original).map((draft) => [draft.id, draft]));
  const same = (a: string, b: string) => a.trim() === b.trim() || (parseNumber(a) !== null && parseNumber(a) === parseNumber(b));
  let count = 0;
  drafts.forEach((draft) => {
    const old = draft.id === null ? undefined : before.get(draft.id);
    if (!old) { count += 1; return; }
    if (!same(old.min_days, draft.min_days) || !same(old.max_days, draft.max_days) || !same(old.discount_percent, draft.discount_percent) || old.is_active !== draft.is_active) count += 1;
  });
  const kept = new Set(drafts.map((draft) => draft.id));
  original.forEach((tier) => { if (!kept.has(tier.id)) count += 1; });
  return count;
}

export interface TierChanges {
  inserts: Array<Omit<PricingTier, 'id'>>;
  updates: PricingTier[];
  deletes: number[];
}

/** What saving the drafts writes to car_pricing_tiers. Only call it on drafts that passed validateTiers. */
export function tierChanges(original: PricingTier[], drafts: TierDraft[]): TierChanges {
  const toTier = (draft: TierDraft) => ({
    min_days: Number(parseNumber(draft.min_days)),
    max_days: Number(parseNumber(draft.max_days)),
    discount_percent: Number(parseNumber(draft.discount_percent)),
    is_active: draft.is_active,
  });
  const kept = new Set(drafts.filter((draft) => draft.id !== null).map((draft) => draft.id as number));
  const byId = new Map(original.map((tier) => [tier.id, tier]));
  const updates: PricingTier[] = [];
  drafts.forEach((draft) => {
    if (draft.id === null) return;
    const before = byId.get(draft.id);
    const after = { id: draft.id, ...toTier(draft) };
    if (!before || before.min_days !== after.min_days || before.max_days !== after.max_days || before.discount_percent !== after.discount_percent || before.is_active !== after.is_active) updates.push(after);
  });
  return {
    inserts: drafts.filter((draft) => draft.id === null).map(toTier),
    updates,
    deletes: original.filter((tier) => !kept.has(tier.id)).map((tier) => tier.id),
  };
}

export const tierChangeCount = (changes: TierChanges) => changes.inserts.length + changes.updates.length + changes.deletes.length;

/** Edits and removals first, new tiers last: a failure before the insert leaves nothing to duplicate on a retry. */
export async function saveTierChanges(changes: TierChanges): Promise<void> {
  const now = new Date().toISOString();
  const first = await Promise.all([
    ...changes.updates.map(({ id, ...rest }) => supabase.from('car_pricing_tiers').update({ ...rest, updated_at: now }).eq('id', id)),
    ...(changes.deletes.length ? [supabase.from('car_pricing_tiers').delete().in('id', changes.deletes)] : []),
  ]);
  const failed = first.find((result) => result.error);
  if (failed?.error) throw new Error(failed.error.message);
  if (changes.inserts.length === 0) return;
  const { error } = await supabase.from('car_pricing_tiers').insert(changes.inserts);
  if (error) throw new Error(error.message);
}

/** Saves the group's changed columns, or adds it; returns the saved row's id. */
export async function saveModelGroup(id: number | null, payload: Payload): Promise<number> {
  const result = id === null
    ? await supabase.from('model_group').insert(payload).select('id').single()
    : await supabase.from('model_group').update(payload).eq('id', id).select('id').single();
  if (result.error) throw new Error(result.error.message);
  return Number((result.data as { id: number }).id);
}

// ─── Image ───────────────────────────────────────────────────────────────────

export const IMAGE_BUCKET = 'model-group';
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** A key under `modelGroups:sheet.image`, or null when the file will do. */
export function imageProblem(file: File): 'badType' | 'tooBig' | null {
  if (!IMAGE_TYPES.includes(file.type)) return 'badType';
  if (file.size > IMAGE_MAX_BYTES) return 'tooBig';
  return null;
}

/** A new path for every upload, so no other group's photo is overwritten and no cache serves the old one. */
export function imagePath(name: string, file: File, now: number = Date.now()): string {
  const extension = ({ 'image/png': 'png', 'image/webp': 'webp' } as Record<string, string>)[file.type] ?? 'jpg';
  const slug = fold(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'model-group';
  return `model-groups/${slug}-${now}.${extension}`;
}

export async function uploadGroupImage(name: string, file: File): Promise<string> {
  const path = imagePath(name, file);
  const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, file, { contentType: file.type, cacheControl: '31536000', upsert: false });
  if (error) throw new Error(error.message);
  return supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}
