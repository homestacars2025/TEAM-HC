import {
  EMPTY_FORM,
  SPEC_FIELDS,
  bestTier,
  editableFields,
  fetchModelGroupStats,
  filterCounts,
  formPayload,
  imagePath,
  imageProblem,
  isFullyRented,
  isLowUtilization,
  listPriceTry,
  matchesSearch,
  modelGroupAccess,
  rateTone,
  readSort,
  sortGroups,
  tierChanges,
  toTierDrafts,
  validateForm,
  validateTiers,
  writeSort,
  type ModelGroupRow,
  type ModelGroupStats,
} from './modelGroups';

let mockRpcRows: Array<Record<string, unknown>> = [];
jest.mock('./supabase', () => ({
  supabase: { rpc: async () => ({ data: mockRpcRows, error: null }) },
}));

const group = (over: Partial<ModelGroupRow>): ModelGroupRow => ({
  id: 1, name: 'Renault Clio', brand: 'Renault', model: 'Clio', category: 'Economy', transmission: 'Manual', fuel: 'Petrol',
  seats: 5, luggage: 2, daily_km: 300, monthly_km: null, deposit: 8000, min_age: 21, price: 40, image_url: 'x.jpg', ...over,
});
const stats = (over: Partial<ModelGroupStats>): ModelGroupStats => ({
  model_group_id: 1, cars_total: 4, cars_active: 4, rented_now: 2, utilization: 70, bookings_month: 9, avg_daily_rate: 1500, ...over,
});

describe('who may do what', () => {
  const pages = (...keys: string[]) => (key: string) => keys.includes(key);

  test('an admin edits everything and sees the real rate', () => {
    expect(modelGroupAccess('admin', pages())).toEqual({ canEditSpecs: true, canEditAll: true, canCreate: true, canSeeRealRate: true });
  });

  test('staff with the page edit specs only; the real rate needs the Accounting page', () => {
    expect(modelGroupAccess('staff', pages('model_groups'))).toEqual({ canEditSpecs: true, canEditAll: false, canCreate: false, canSeeRealRate: false });
    expect(modelGroupAccess('staff', pages('model_groups', 'accounting')).canSeeRealRate).toBe(true);
    expect(modelGroupAccess('staff', pages()).canEditSpecs).toBe(false);
  });

  test('staff can change the four specs and nothing else', () => {
    const staff = editableFields({ canEditSpecs: true, canEditAll: false });
    expect(Array.from(staff).sort()).toEqual([...SPEC_FIELDS].sort());
    expect(staff.has('price')).toBe(false);
    expect(staff.has('deposit')).toBe(false);
    expect(editableFields({ canEditSpecs: false, canEditAll: false }).size).toBe(0);
  });

  test("a staff save sends only spec columns, even when the price field holds something", () => {
    const staff = editableFields({ canEditSpecs: true, canEditAll: false });
    const payload = formPayload({ ...EMPTY_FORM, name: 'X', brand: 'X', model: 'Y', price: '999', deposit: '1', seats: '7' }, staff);
    expect(Object.keys(payload).sort()).toEqual(['fuel', 'luggage', 'seats', 'transmission']);
    expect(payload.seats).toBe(7);
  });

  test('a locked field never blocks a staff save', () => {
    const staff = editableFields({ canEditSpecs: true, canEditAll: false });
    // An old group with no price and a bad age: staff can't fix either, so neither stops them.
    expect(validateForm({ ...EMPTY_FORM, price: '', min_age: '12', seats: '0' }, staff)).toEqual({ seats: 'seatsMin' });
  });

  test('an admin save is checked in full', () => {
    const admin = editableFields({ canEditSpecs: true, canEditAll: true });
    expect(validateForm({ ...EMPTY_FORM, price: '0', min_age: '12' }, admin)).toEqual({ brand: 'required', model: 'required', name: 'required', price: 'priceAboveZero', min_age: 'ageRange' });
  });
});

describe('the month figures', () => {
  beforeEach(() => {
    mockRpcRows = [{ model_group_id: 3, cars_total: '5', cars_active: 4, rented_now: 4, utilization: '82', bookings_month: 11, avg_daily_rate: '1850' }];
  });

  test('read as numbers', async () => {
    const rows = await fetchModelGroupStats('2026-11', true);
    expect(rows.get(3)).toEqual({ model_group_id: 3, cars_total: 5, cars_active: 4, rented_now: 4, utilization: 82, bookings_month: 11, avg_daily_rate: 1850 });
  });

  test('the real daily rate is dropped for someone who may not see it', async () => {
    const rows = await fetchModelGroupStats('2026-11', false);
    expect(rows.get(3)?.avg_daily_rate).toBeNull();
    expect(rows.get(3)?.utilization).toBe(82);
  });
});

describe('tiles, search and sort', () => {
  test('fully rented means every active car is out, and a group with none is not', () => {
    expect(isFullyRented(stats({ cars_active: 3, rented_now: 3 }))).toBe(true);
    expect(isFullyRented(stats({ cars_active: 3, rented_now: 2 }))).toBe(false);
    expect(isFullyRented(stats({ cars_active: 0, rented_now: 0 }))).toBe(false);
    expect(isFullyRented(undefined)).toBe(false);
  });

  test('low utilization is below 60%, and no figure is not low', () => {
    expect(isLowUtilization(stats({ utilization: 59 }))).toBe(true);
    expect(isLowUtilization(stats({ utilization: 60 }))).toBe(false);
    expect(isLowUtilization(stats({ utilization: null }))).toBe(false);
  });

  test('counts each tile', () => {
    const groups = [group({ id: 1 }), group({ id: 2, image_url: null }), group({ id: 3 })];
    const rows = new Map([[1, stats({ model_group_id: 1, rented_now: 4 })], [2, stats({ model_group_id: 2, utilization: 30 })]]);
    expect(filterCounts(groups, rows)).toEqual({ rented: 1, low: 1, noimage: 1 });
  });

  test('search finds name or brand, every word, without accents', () => {
    expect(matchesSearch(group({}), 'clio ren')).toBe(true);
    expect(matchesSearch(group({ brand: 'Škoda', model: 'Octavia', name: 'Škoda Octavia' }), 'skoda')).toBe(true);
    expect(matchesSearch(group({}), 'fiat')).toBe(false);
  });

  test('sort keeps groups with no figure last both ways', () => {
    const groups = [group({ id: 1, name: 'A' }), group({ id: 2, name: 'B' }), group({ id: 3, name: 'C' })];
    const rows = new Map([[1, stats({ utilization: 40 })], [3, stats({ utilization: 90 })]]);
    expect(sortGroups(groups, rows, 'utilization', 'desc').map((g) => g.id)).toEqual([3, 1, 2]);
    expect(sortGroups(groups, rows, 'utilization', 'asc').map((g) => g.id)).toEqual([1, 3, 2]);
  });

  test('the sort round-trips through the address, the default leaving it clean', () => {
    expect(readSort(null)).toEqual({ key: 'utilization', direction: 'desc' });
    expect(writeSort('utilization', 'desc')).toBeNull();
    expect(readSort(writeSort('price', 'asc'))).toEqual({ key: 'price', direction: 'asc' });
    expect(readSort(writeSort('name', 'asc'))).toEqual({ key: 'name', direction: 'asc' });
    expect(readSort('bogus')).toEqual({ key: 'utilization', direction: 'desc' });
  });
});

describe('prices and tiers', () => {
  test('list price in lira, and the real rate against it', () => {
    expect(listPriceTry(40, 34.5)).toBe(1380);
    expect(listPriceTry(40, null)).toBeNull();
    expect(rateTone(1380, 1380)).toBe('above');
    expect(rateTone(1200, 1380)).toBe('below');
    expect(rateTone(null, 1380)).toBe('none');
  });

  test('the deepest active tier is the one a card quotes', () => {
    const tiers = [{ id: 1, min_days: 7, max_days: 29, discount_percent: 10, is_active: true }, { id: 2, min_days: 30, max_days: 90, discount_percent: 25, is_active: false }];
    expect(bestTier(tiers)?.id).toBe(1);
  });

  test('tiers that overlap or run backwards are caught, and changes are worked out', () => {
    const original = [{ id: 1, min_days: 7, max_days: 29, discount_percent: 10, is_active: true }];
    const drafts = [...toTierDrafts(original), { key: 'new-1', id: null, min_days: '20', max_days: '40', discount_percent: '15', is_active: true }];
    expect(validateTiers(drafts)['new-1']).toEqual({ code: 'overlap', from: '7', to: '29' });
    expect(validateTiers([{ ...drafts[1], max_days: '10' }])['new-1']).toEqual({ code: 'order' });
    const fixed = [{ ...drafts[0], discount_percent: '12' }, { ...drafts[1], min_days: '30' }];
    expect(tierChanges(original, fixed)).toEqual({
      inserts: [{ min_days: 30, max_days: 40, discount_percent: 15, is_active: true }],
      updates: [{ id: 1, min_days: 7, max_days: 29, discount_percent: 12, is_active: true }],
      deletes: [],
    });
  });
});

describe('the image', () => {
  test('only JPG, PNG or WebP under 5 MB', () => {
    expect(imageProblem(new File(['x'], 'a.gif', { type: 'image/gif' }))).toBe('badType');
    expect(imageProblem(new File([new Uint8Array(6 * 1024 * 1024)], 'a.png', { type: 'image/png' }))).toBe('tooBig');
    expect(imageProblem(new File(['x'], 'a.webp', { type: 'image/webp' }))).toBeNull();
  });

  test('every upload gets its own path', () => {
    expect(imagePath('Škoda Octavia', new File(['x'], 'a.png', { type: 'image/png' }), 42)).toBe('model-groups/skoda-octavia-42.png');
  });
});
