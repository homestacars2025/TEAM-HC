import { BUSINESS_TIME_ZONE, istanbulDate } from './istanbulTime';
import { ALL_MONTHS, shiftMonth } from './pendingInvoices';

/**
 * The HGS (motorway toll tag) page, worked out here so it can be tested. The same
 * rules run on the Admin page: a car is on HGS when its barcode isn't blank, and a
 * transit belongs to the Istanbul month of its time. The rows come from
 * `hgs_portal_transits`, the official portal files finance uploads per car.
 */

export interface HgsCar {
  id: number;
  plate: string;
  /** `cars.hgs_barcode`. Blank or spaces means no tag. */
  barcode: string | null;
  model: string | null;
}

export interface HgsTransit {
  id: number;
  car_id: number | null;
  plate_number: string | null;
  transit_datetime: string;
  amount: number;
  /** `private` is a bridge or private motorway (özel geçiş). */
  road_type: string | null;
}

export const hasBarcode = (barcode: string | null | undefined): boolean => !!barcode?.trim();

/** The Istanbul date of a transit. The portal gives the real time of day, so late-night ones keep their own date. */
export const transitDate = (iso: string): string => istanbulDate(new Date(iso));
/** `14:05`, Istanbul time. */
export const transitTime = (iso: string): string =>
  new Intl.DateTimeFormat('en-GB', { timeZone: BUSINESS_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
export const transitMonth = (iso: string): string => transitDate(iso).slice(0, 7);

export const inPeriod = (row: Pick<HgsTransit, 'transit_datetime'>, month: string): boolean =>
  month === ALL_MONTHS || transitMonth(row.transit_datetime) === month;

const byPlate = (a: { plate: string }, b: { plate: string }) => a.plate.localeCompare(b.plate, 'en', { numeric: true });

/** Active cars with no tag: their tolls reach nobody. */
export function missingHgs(cars: readonly HgsCar[]): HgsCar[] {
  return cars.filter(car => !hasBarcode(car.barcode)).sort(byPlate);
}

/** Ten digits, as every barcode on the fleet is. */
export function barcodeProblem(value: string): 'empty' | 'format' | null {
  const text = value.replace(/\s/g, '');
  if (!text) return 'empty';
  return /^\d{10}$/.test(text) ? null : 'format';
}

export interface HgsRow {
  key: string;
  carId: number | null;
  plate: string;
  model: string | null;
  barcode: string | null;
  transits: number;
  amount: number;
  /** ISO timestamp of the latest transit in the period. */
  last: string | null;
  /** Of the period's spend, 0 to 1. */
  share: number;
}

/**
 * Every car on HGS, idle ones too, and any car with transits in the period that
 * isn't one (sold since, or its tag taken off), so the rows add up to the total.
 * `transits` is already narrowed to the period.
 */
export function hgsRows(cars: readonly HgsCar[], transits: readonly HgsTransit[]): HgsRow[] {
  const rows = new Map<string, HgsRow>();
  const keyFor = (carId: number | null, plate: string | null) => (carId !== null ? `car:${carId}` : `plate:${(plate ?? '').replace(/\s/g, '')}`);
  for (const car of cars) {
    if (!hasBarcode(car.barcode)) continue;
    rows.set(keyFor(car.id, null), { key: keyFor(car.id, null), carId: car.id, plate: car.plate, model: car.model, barcode: car.barcode?.trim() ?? null, transits: 0, amount: 0, last: null, share: 0 });
  }
  let total = 0;
  for (const transit of transits) {
    const key = keyFor(transit.car_id, transit.plate_number);
    let row = rows.get(key);
    if (!row) {
      const car = cars.find(c => c.id === transit.car_id);
      row = { key, carId: transit.car_id, plate: car?.plate ?? transit.plate_number ?? '—', model: car?.model ?? null, barcode: car && hasBarcode(car.barcode) ? car.barcode!.trim() : null, transits: 0, amount: 0, last: null, share: 0 };
      rows.set(key, row);
    }
    row.transits += 1;
    row.amount += transit.amount;
    if (!row.last || transit.transit_datetime > row.last) row.last = transit.transit_datetime;
    total += transit.amount;
  }
  return Array.from(rows.values()).map(row => ({ ...row, amount: Math.round(row.amount * 100) / 100, share: total > 0 ? row.amount / total : 0 }));
}

export interface HgsTiles {
  spend: number;
  transits: number;
  /** Cars that passed a toll in the period. */
  used: number;
  carsOnHgs: number;
  /** On HGS, with no transit in the period. */
  idle: number;
  thisMonth: number;
  lastMonth: number;
  /** This month against last, `0.12` for +12%. `null` when last month had nothing to compare with. */
  delta: number | null;
}

export function hgsTiles(cars: readonly HgsCar[], transits: readonly HgsTransit[], month: string, now: string = istanbulDate().slice(0, 7)): HgsTiles {
  const period = transits.filter(row => inPeriod(row, month));
  const sum = (rows: readonly HgsTransit[]) => Math.round(rows.reduce((total, row) => total + row.amount, 0) * 100) / 100;
  const usedCars = new Set(period.map(row => (row.car_id !== null ? `car:${row.car_id}` : `plate:${row.plate_number}`)));
  const onHgs = cars.filter(car => hasBarcode(car.barcode));
  const thisMonth = sum(transits.filter(row => transitMonth(row.transit_datetime) === now));
  const lastMonth = sum(transits.filter(row => transitMonth(row.transit_datetime) === shiftMonth(now, -1)));
  return {
    spend: sum(period),
    transits: period.length,
    used: usedCars.size,
    carsOnHgs: onHgs.length,
    idle: onHgs.filter(car => !usedCars.has(`car:${car.id}`)).length,
    thisMonth,
    lastMonth,
    delta: lastMonth > 0 ? (thisMonth - lastMonth) / lastMonth : null,
  };
}

export const HGS_FILTERS = ['used'] as const;
export type HgsFilter = typeof HGS_FILTERS[number] | 'all';

export const HGS_SORTS = ['amount', 'transits', 'last'] as const;
export type HgsSort = typeof HGS_SORTS[number];

/** `?sort=`, with the default left out of the address. */
export const readSort = (value: string | null): HgsSort => (HGS_SORTS.includes(value as HgsSort) ? value as HgsSort : 'amount');

/** Counts grouped like the lira figures beside them: 3.132. */
export const formatCount = (n: number): string => n.toLocaleString('tr-TR');

/** Highest first; a tie, or a car that never passed a toll, falls back to the plate. */
export function sortHgsRows(rows: readonly HgsRow[], sort: HgsSort): HgsRow[] {
  const value = (row: HgsRow) => (sort === 'amount' ? row.amount : sort === 'transits' ? row.transits : row.last ? Date.parse(row.last) : -Infinity);
  return [...rows].sort((a, b) => value(b) - value(a) || byPlate(a, b));
}

const squash = (text: string | null | undefined) => (text ?? '').toLocaleLowerCase('en').replace(/\s/g, '');

/** `34 mdj` finds 34MDJ129; a barcode or a model works too. */
export function hgsRowMatches(row: Pick<HgsRow, 'plate' | 'barcode' | 'model'>, query: string): boolean {
  const needle = squash(query);
  return !needle || [row.plate, row.barcode, row.model].some(value => squash(value).includes(needle));
}

/** The first and last instants of an Istanbul month, for a query on `transit_datetime`. */
export function monthRange(month: string): { from: string; to: string } {
  return { from: `${month}-01T00:00:00+03:00`, to: `${shiftMonth(month, 1)}-01T00:00:00+03:00` };
}

/** The portal writes `*` for a station it doesn't know. */
const station = (value: string | null | undefined): string | null => {
  const text = value?.trim();
  return text && text !== '*' ? text : null;
};

/** `Entry → Exit` when both are known and differ, else the exit, the entry or the road. */
export function transitPlace(row: { entry_location: string | null; exit_location: string | null; otoyol: string | null }): string {
  const entry = station(row.entry_location);
  const exit = station(row.exit_location);
  if (entry && exit && entry !== exit) return `${entry} → ${exit}`;
  return exit ?? entry ?? station(row.otoyol) ?? '—';
}
