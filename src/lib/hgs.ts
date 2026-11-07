import { addDay } from './bookingDates';
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

// ─── Periods: a month, all time, or a range of days ───────────────────────────

/** Istanbul days, `YYYY-MM-DD`, both ends included. */
export interface DayRange { from: string; to: string }
/** A month (`2026-11`), `all`, or a range of days. */
export type HgsPeriod = string | DayRange;

const isDay = (value: string | null | undefined): value is string =>
  !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;

/** `?from=&to=` or `?cfrom=&cto=`: both real days or nothing. The wrong way round is turned around. */
export function readRange(from: string | null, to: string | null): DayRange | null {
  if (!isDay(from) || !isDay(to)) return null;
  return from <= to ? { from, to } : { from: to, to: from };
}

export const inPeriod = (row: Pick<HgsTransit, 'transit_datetime'>, period: HgsPeriod): boolean => {
  if (typeof period !== 'string') {
    const day = transitDate(row.transit_datetime);
    return day >= period.from && day <= period.to;
  }
  return period === ALL_MONTHS || transitMonth(row.transit_datetime) === period;
};

/** Same period, as a value a hook can depend on. */
export const periodKey = (period: HgsPeriod): string => (typeof period === 'string' ? period : `${period.from}_${period.to}`);

export const RANGE_PRESETS = ['today', 'last7', 'thisMonth', 'lastMonth'] as const;
export type RangePreset = typeof RANGE_PRESETS[number];

const lastDayOf = (month: string): string => addDay(`${shiftMonth(month, 1)}-01`, -1);

/** Last 7 days is today and the six before it; this month runs to today; last month is all of it. */
export function presetRange(preset: RangePreset, today: string = istanbulDate()): DayRange {
  const month = today.slice(0, 7);
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'last7') return { from: addDay(today, -6), to: today };
  if (preset === 'thisMonth') return { from: `${month}-01`, to: today };
  const previous = shiftMonth(month, -1);
  return { from: `${previous}-01`, to: lastDayOf(previous) };
}

/** The preset a range is, to show it pressed. */
export function presetOf(range: DayRange | null, today: string = istanbulDate()): RangePreset | null {
  if (!range) return null;
  return RANGE_PRESETS.find(preset => { const p = presetRange(preset, today); return p.from === range.from && p.to === range.to; }) ?? null;
}

/** `01.11 → 06.11`, or `06.11` for one day; with the year, `01.11.25`, when the range isn't all in this year. */
export function rangeLabel(range: DayRange, today: string = istanbulDate()): string {
  const year = today.slice(0, 4);
  const withYear = range.from.slice(0, 4) !== year || range.to.slice(0, 4) !== year;
  const day = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}${withYear ? `.${iso.slice(2, 4)}` : ''}`;
  return range.from === range.to ? day(range.from) : `${day(range.from)} → ${day(range.to)}`;
}

/** First and last instant of a period, for a query on `transit_datetime`; `null` for all time. */
export function periodBounds(period: HgsPeriod): { from: string; to: string } | null {
  if (typeof period !== 'string') return { from: `${period.from}T00:00:00+03:00`, to: `${addDay(period.to, 1)}T00:00:00+03:00` };
  return period === ALL_MONTHS ? null : monthRange(period);
}

/** A period as days, for the export's file name; `null` for all time. */
export function periodDays(period: HgsPeriod): DayRange | null {
  if (typeof period !== 'string') return period;
  return period === ALL_MONTHS ? null : { from: `${period}-01`, to: lastDayOf(period) };
}

const byPlate = (a: { plate: string }, b: { plate: string }) => a.plate.localeCompare(b.plate, 'en', { numeric: true });

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
  /** One of today's active cars, as opposed to one that only shows up through its transits. */
  active: boolean;
}

/**
 * Every active car, idle ones and ones with no barcode too, and any car with transits in
 * the period that isn't active any more, so the rows add up to the total. `transits` is
 * already narrowed to the period.
 */
export function hgsRows(cars: readonly HgsCar[], transits: readonly HgsTransit[]): HgsRow[] {
  const rows = new Map<string, HgsRow>();
  const keyFor = (carId: number | null, plate: string | null) => (carId !== null ? `car:${carId}` : `plate:${(plate ?? '').replace(/\s/g, '')}`);
  for (const car of cars) {
    rows.set(keyFor(car.id, null), { key: keyFor(car.id, null), carId: car.id, plate: car.plate, model: car.model, barcode: hasBarcode(car.barcode) ? car.barcode!.trim() : null, transits: 0, amount: 0, last: null, share: 0, active: true });
  }
  let total = 0;
  for (const transit of transits) {
    const key = keyFor(transit.car_id, transit.plate_number);
    let row = rows.get(key);
    if (!row) {
      const car = cars.find(c => c.id === transit.car_id);
      row = { key, carId: transit.car_id, plate: car?.plate ?? transit.plate_number ?? '—', model: car?.model ?? null, barcode: car && hasBarcode(car.barcode) ? car.barcode!.trim() : null, transits: 0, amount: 0, last: null, share: 0, active: false };
      rows.set(key, row);
    }
    row.transits += 1;
    row.amount += transit.amount;
    if (!row.last || transit.transit_datetime > row.last) row.last = transit.transit_datetime;
    total += transit.amount;
  }
  return Array.from(rows.values()).map(row => ({ ...row, amount: Math.round(row.amount * 100) / 100, share: total > 0 ? row.amount / total : 0 }));
}

/** The row key a `?car=` names: a car id, or the plate of a car that isn't one. */
export const carParamKey = (value: string): string => (/^\d+$/.test(value) ? `car:${value}` : `plate:${value.replace(/\s/g, '')}`);
/** The `?car=` for a row. */
export const carParam = (row: Pick<HgsRow, 'carId' | 'plate'>): string => (row.carId !== null ? String(row.carId) : row.plate.replace(/\s/g, ''));

/**
 * One car's row worked out for its own range: its share is of what the whole fleet spent
 * in that range. A car with nothing in the range keeps its name and shows zeros.
 */
export function rangedRow(row: HgsRow, cars: readonly HgsCar[], transits: readonly HgsTransit[], range: DayRange): HgsRow {
  const found = hgsRows(cars, transits.filter(transit => inPeriod(transit, range))).find(other => other.key === row.key);
  return found ? { ...found, active: row.active } : { ...row, transits: 0, amount: 0, last: null, share: 0 };
}

/** Active cars with no transit at all in the period: the banner, and the "without transits" tile. */
export function idleRows(rows: readonly HgsRow[]): HgsRow[] {
  return rows.filter(row => row.active && row.transits === 0).sort(byPlate);
}

export interface HgsTiles {
  spend: number;
  transits: number;
  /** Cars that passed a toll in the period. */
  used: number;
  /** Active cars, with a barcode or not. */
  carsOnHgs: number;
  /** Active cars with no transit in the period, as `idleRows`. */
  idle: number;
  thisMonth: number;
  lastMonth: number;
  /** This month against last, `0.12` for +12%. `null` when last month had nothing to compare with. */
  delta: number | null;
}

export function hgsTiles(cars: readonly HgsCar[], transits: readonly HgsTransit[], month: HgsPeriod, now: string = istanbulDate().slice(0, 7)): HgsTiles {
  const period = transits.filter(row => inPeriod(row, month));
  const sum = (rows: readonly HgsTransit[]) => Math.round(rows.reduce((total, row) => total + row.amount, 0) * 100) / 100;
  const usedCars = new Set(period.map(row => (row.car_id !== null ? `car:${row.car_id}` : `plate:${row.plate_number}`)));
  const thisMonth = sum(transits.filter(row => transitMonth(row.transit_datetime) === now));
  const lastMonth = sum(transits.filter(row => transitMonth(row.transit_datetime) === shiftMonth(now, -1)));
  return {
    spend: sum(period),
    transits: period.length,
    used: usedCars.size,
    carsOnHgs: cars.length,
    idle: cars.filter(car => !usedCars.has(`car:${car.id}`)).length,
    thisMonth,
    lastMonth,
    delta: lastMonth > 0 ? (thisMonth - lastMonth) / lastMonth : null,
  };
}

export const HGS_FILTERS = ['used', 'idle'] as const;
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
