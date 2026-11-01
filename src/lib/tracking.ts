import { BUSINESS_TIME_ZONE } from './istanbulTime';

/** The first night `car_daily_km` was written. Nothing can exist before it. */
export const HISTORY_START = '2026-11-01';
export const NO_SIGNAL_HOURS = 24;
export const LATE_SIGNAL_HOURS = 6;
export const HIGH_DAY_KM = 500;
export const OIL_DUE_KM = 1000;
/** A fresh oil change leaves about this much, so this is a full bar. */
export const OIL_INTERVAL_KM = 10000;

export const DAY_FILTERS = ['moved', 'idle', 'noSignal', 'over500'] as const;
export type DayFilter = typeof DAY_FILTERS[number] | 'all';

export const LIVE_FILTERS = ['moving', 'ignition', 'oilDue', 'oilOverdue', 'noSignal'] as const;
export type LiveFilter = typeof LIVE_FILTERS[number] | 'all';

/** One row of `car_tracking`, as the screens use it. */
export interface TrackedCar {
  id: number;
  /** `null` when the tracker is not linked to a car, so nothing is saved for it at night. */
  car_id: number | null;
  plate: string;
  model: string | null;
  current_km: number | null;
  start_km: number | null;
  today_km: number;
  next_oil_change: number | null;
  ignition: boolean;
  speed: number;
  last_signal_at: string | null;
}

/** One car's day, whether it comes from the live row or from `car_daily_km`. */
export interface DayEntry {
  car_id: number | null;
  plate: string;
  model: string | null;
  start_km: number | null;
  end_km: number | null;
  km: number;
  last_signal_at: string | null;
}

/** A row of `car_daily_km`. */
export interface DailyKmRow {
  car_id: number;
  day: string;
  plate_number: string | null;
  start_km: number | null;
  end_km: number | null;
  km: number;
  last_signal_at: string | null;
}

/**
 * A tracker that was installed but never linked reports its device number as the
 * plate, with no distance. It is hardware, not a car in the fleet.
 */
export function isFleetCar(row: { car_id: number | null; plate_number: string | null }): boolean {
  return row.car_id !== null || !/^\d+$/.test(row.plate_number?.trim() ?? '');
}

export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The `count` days ending on `last`, oldest first. */
export function daysEnding(last: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => addDays(last, index - count + 1));
}

/** The moment a day stops. Turkey has stayed on UTC+3 all year since 2016. */
export function endOfDay(day: string): number {
  return new Date(`${addDays(day, 1)}T00:00:00+03:00`).getTime();
}

export function isValidDay(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function hasNoSignal(lastSignal: string | null, at: number): boolean {
  if (!lastSignal) return true;
  return at - new Date(lastSignal).getTime() > NO_SIGNAL_HOURS * 3_600_000;
}

export type SignalTone = 'ok' | 'amber' | 'red';

export function signalTone(lastSignal: string | null, at: number): SignalTone {
  if (hasNoSignal(lastSignal, at)) return 'red';
  return at - new Date(lastSignal as string).getTime() > LATE_SIGNAL_HOURS * 3_600_000 ? 'amber' : 'ok';
}

/** A silent tracker keeps its last speed and ignition, which say nothing about now. */
export const isMoving = (car: TrackedCar, at: number) => car.speed > 0 && !hasNoSignal(car.last_signal_at, at);
export const isIgnitionOn = (car: TrackedCar, at: number) => car.ignition && !hasNoSignal(car.last_signal_at, at);

export type OilTone = 'green' | 'amber' | 'red';

export interface OilStatus {
  remaining: number;
  tone: OilTone;
  /** How much of the bar is filled, 0 to 1. An overdue car is a full red bar. */
  fill: number;
}

export function oilStatus(car: Pick<TrackedCar, 'current_km' | 'next_oil_change'>): OilStatus | null {
  if (car.current_km === null || car.next_oil_change === null) return null;
  const remaining = car.next_oil_change - car.current_km;
  if (remaining <= 0) return { remaining, tone: 'red', fill: 1 };
  return {
    remaining,
    tone: remaining <= OIL_DUE_KM ? 'amber' : 'green',
    fill: Math.min(remaining / OIL_INTERVAL_KM, 1),
  };
}

export const todayEntry = (car: TrackedCar): DayEntry => ({
  car_id: car.car_id,
  plate: car.plate,
  model: car.model,
  start_km: car.start_km,
  end_km: car.current_km,
  km: car.today_km,
  last_signal_at: car.last_signal_at,
});

export function inDayFilter(entry: DayEntry, filter: DayFilter, at: number): boolean {
  if (filter === 'moved') return entry.km > 0;
  if (filter === 'idle') return entry.km === 0;
  if (filter === 'noSignal') return hasNoSignal(entry.last_signal_at, at);
  if (filter === 'over500') return entry.km > HIGH_DAY_KM;
  return true;
}

export function dayStats(entries: DayEntry[], at: number) {
  const group = (filter: DayFilter) => {
    const rows = entries.filter(entry => inDayFilter(entry, filter, at));
    return { count: rows.length, km: rows.reduce((sum, entry) => sum + entry.km, 0) };
  };
  return { all: group('all'), moved: group('moved'), idle: group('idle'), noSignal: group('noSignal'), over500: group('over500') };
}

export function inLiveFilter(car: TrackedCar, filter: LiveFilter, at: number): boolean {
  if (filter === 'moving') return isMoving(car, at);
  if (filter === 'ignition') return isIgnitionOn(car, at);
  if (filter === 'noSignal') return hasNoSignal(car.last_signal_at, at);
  if (filter === 'oilDue') return (oilStatus(car)?.remaining ?? Infinity) <= OIL_DUE_KM;
  if (filter === 'oilOverdue') return (oilStatus(car)?.remaining ?? Infinity) <= 0;
  return true;
}

export function liveStats(cars: TrackedCar[], at: number) {
  const count = (filter: LiveFilter) => cars.filter(car => inLiveFilter(car, filter, at)).length;
  return { all: cars.length, moving: count('moving'), ignition: count('ignition'), oilDue: count('oilDue'), oilOverdue: count('oilOverdue'), noSignal: count('noSignal') };
}

export interface TrackingOutage {
  /** The newest signal from any car, `null` when none has ever arrived. */
  lastSignal: string | null;
}

/** More than half the fleet silent means the feed is down, not that cars are parked. */
export function trackingOutage(cars: TrackedCar[], at: number): TrackingOutage | null {
  const silent = cars.filter(car => hasNoSignal(car.last_signal_at, at)).length;
  if (silent * 2 <= cars.length) return null;
  const times = cars.map(car => car.last_signal_at).filter((time): time is string => !!time);
  return { lastSignal: times.reduce<string | null>((newest, time) => (!newest || time > newest ? time : newest), null) };
}

/** Not the Turkish rules: those turn the I of CLIO into ı, and it stops matching Clio. */
export const matchesSearch = (row: { plate: string; model: string | null }, query: string) => {
  const q = query.trim().toLowerCase();
  return !q || row.plate.toLowerCase().includes(q) || (row.model ?? '').toLowerCase().includes(q);
};

export type LiveSort = 'plate' | 'model' | 'current_km' | 'today_km' | 'speed' | 'next_oil_change' | 'remaining' | 'last_signal_at';

const sortValue = (car: TrackedCar, column: LiveSort): string | number | null => {
  if (column === 'remaining') return oilStatus(car)?.remaining ?? null;
  return car[column];
};

/** Blanks stay at the end in either direction. */
export function sortCars(cars: TrackedCar[], column: LiveSort, direction: 'asc' | 'desc'): TrackedCar[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...cars].sort((a, b) => {
    const x = sortValue(a, column);
    const y = sortValue(b, column);
    if (x === null) return y === null ? 0 : 1;
    if (y === null) return -1;
    return sign * (typeof x === 'string' ? x.localeCompare(String(y), 'tr') : x - Number(y));
  });
}

export function formatSignalTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, {
    timeZone: BUSINESS_TIME_ZONE, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
}

/** How long ago, in the largest unit that reads naturally. `null` under a minute. */
export function relativeSignal(iso: string, at: number, locale: string): string | null {
  const minutes = Math.floor((at - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return null;
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'always' });
  if (minutes < 60) return format.format(-minutes, 'minute');
  if (minutes < 48 * 60) return format.format(-Math.floor(minutes / 60), 'hour');
  return format.format(-Math.floor(minutes / 1440), 'day');
}
