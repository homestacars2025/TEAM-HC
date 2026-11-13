/**
 * "Add HGS from portal" in the customer wallet, through the database's own functions
 * (shared with Admin), and only them:
 *
 * - `preview_customer_hgs(p_booking_id, p_from_date, p_to_date)`: the booking car's
 *   portal transits whose Istanbul day falls from `p_from_date` to `p_to_date` (null: the
 *   booking's start / end), not yet charged to a customer, each saying if it is outside
 *   the booking (`outside_booking`) and on which other booking's days (`other_booking`);
 * - `apply_customer_hgs(p_booking_id, p_from_date, p_to_date)`: charges them, one `hgs` /
 *   OUT line each, and marks the transits.
 *
 * The range is free: rows outside the booking are marked, and the dialog asks before charging them.
 *
 * Lira only. This never asks for, sends or stores an exchange rate: dollars are a view
 * concern, worked out elsewhere when someone chooses USD.
 */

import { supabase } from './supabase';
import { isHgsPass, type WalletLine } from './bookingWallet';

export interface PortalTransit {
  portalId: number;
  /** `YYYY-MM-DD`, Istanbul. */
  date: string;
  amount: number;
  roadType: string;
  /** `DD-MM-YYYY ENTRY → EXIT`, the line the wallet will show. */
  note: string;
  /** The day is not one of this booking's days. */
  outsideBooking: boolean;
  /** The car's other booking whose days it falls on, by number, if any. */
  otherBooking: string | null;
}

export interface PortalFreshness {
  /** When finance last uploaded this car's portal file; null when there is none. */
  lastUpload: string | null;
  /** The newest transit on record for the car. */
  lastTransit: string | null;
}

export interface PortalHgsResult {
  count: number;
  total: number;
}

const num = (value: unknown) => (value === null || value === undefined || Number.isNaN(Number(value)) ? 0 : Number(value));

export function readTransits(rows: unknown): PortalTransit[] {
  return (Array.isArray(rows) ? rows as Array<Record<string, unknown>> : []).map(row => ({
    portalId: num(row.portal_id),
    date: String(row.tdate ?? ''),
    amount: num(row.amount),
    roadType: String(row.road_type ?? ''),
    note: String(row.note ?? ''),
    outsideBooking: row.outside_booking === true,
    otherBooking: row.other_booking ? String(row.other_booking) : null,
  }));
}

export const transitsTotal = (transits: readonly Pick<PortalTransit, 'amount'>[]) =>
  Math.round(transits.reduce((sum, t) => sum + t.amount, 0) * 100) / 100;

/** The rows outside the booking, which the dialog asks about before charging. */
export const outsideBookingTransits = <T extends Pick<PortalTransit, 'outsideBooking'>>(transits: readonly T[]): T[] =>
  transits.filter(t => t.outsideBooking);

const rangeArgs = (bookingId: number, fromDate: string | null, toDate: string | null) =>
  ({ p_booking_id: bookingId, p_from_date: fromDate || null, p_to_date: toDate || null });

export async function previewPortalHgs(bookingId: number, fromDate: string | null, toDate: string | null): Promise<PortalTransit[]> {
  const { data, error } = await supabase.rpc('preview_customer_hgs', rangeArgs(bookingId, fromDate, toDate));
  if (error) throw new Error(error.message);
  return readTransits(data);
}

export async function applyPortalHgs(bookingId: number, fromDate: string | null, toDate: string | null): Promise<PortalHgsResult> {
  const { data, error } = await supabase.rpc('apply_customer_hgs', rangeArgs(bookingId, fromDate, toDate));
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  return { count: num(row?.inserted_count), total: num(row?.inserted_total) };
}

/** The newest upload and the newest transit for the car, test files left out, as the functions do. */
export async function getPortalFreshness(carId: number): Promise<PortalFreshness> {
  const base = () => supabase.from('hgs_portal_transits').select('created_at, transit_datetime').eq('car_id', carId).not('source_file', 'like', '%test%');
  const [upload, transit] = await Promise.all([
    base().order('created_at', { ascending: false }).limit(1).maybeSingle(),
    base().order('transit_datetime', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (upload.error) throw new Error(upload.error.message);
  if (transit.error) throw new Error(transit.error.message);
  return {
    lastUpload: (upload.data as { created_at: string | null } | null)?.created_at ?? null,
    lastTransit: (transit.data as { transit_datetime: string | null } | null)?.transit_datetime ?? null,
  };
}

// ─── The suggested start ──────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

export const addDays = (date: string, days: number): string => {
  const at = new Date(`${date}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
};

/** HGS lines typed by hand: not a pass from the toll feed or the portal. */
export const manualHgsLines = <T extends Pick<WalletLine, 'kind' | 'description'>>(lines: readonly T[]): T[] =>
  lines.filter(line => line.kind === 'hgs' && !isHgsPass(line.description));

/**
 * The latest date a hand-typed HGS line says it covers: "HGS to 31/09/2026",
 * "FROM 02/10 TO 01/11", "hgs to 05.11.2026", "TO 3.11". A day past the end of its
 * month (31/09) means the month's last day. Without a year, the one that puts the date
 * at or after the booking's start.
 */
export function coveredUntil(descriptions: readonly (string | null)[], bookingStart: string): string | null {
  const startYear = Number(bookingStart.slice(0, 4));
  let latest: string | null = null;
  for (const text of descriptions) {
    for (const match of (text ?? '').matchAll(/\bto\s+(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?/gi)) {
      const day = Number(match[1]);
      const month = Number(match[2]);
      if (month < 1 || month > 12 || day < 1 || day > 31) continue;
      let year = match[3] ? Number(match[3].length === 2 ? `20${match[3]}` : match[3]) : startYear;
      const clamp = (y: number) => iso(y, month, Math.min(day, new Date(Date.UTC(y, month, 0)).getUTCDate()));
      let date = clamp(year);
      if (!match[3] && date < bookingStart) { year += 1; date = clamp(year); }
      if (!latest || date > latest) latest = date;
    }
  }
  return latest;
}

/** The day after what hand-typed HGS lines cover, inside the booking; null when they say nothing usable. */
export function suggestedFrom(lines: readonly Pick<WalletLine, 'kind' | 'description'>[], start: string, end: string): string | null {
  const covered = coveredUntil(manualHgsLines(lines).map(line => line.description), start);
  if (!covered) return null;
  const from = addDays(covered, 1);
  if (from <= start || from > end) return null;
  return from;
}
