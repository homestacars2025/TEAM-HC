/**
 * "Add HGS from portal" in the customer wallet. The rule lives in the database
 * (`booking_portal_hgs_preview` / `post_booking_portal_hgs`), shared with Admin:
 *
 * - a transit is the customer's when its Istanbul day falls inside the booking's dates,
 *   boundary days included; the period asked for is clamped to them server-side;
 * - a transit already charged to a customer, or to the investor, is never charged;
 * - posting locks the rows and marks each transit with the booking, so a second click
 *   finds nothing new.
 *
 * Amounts are lira. Dollars are only shown, at the rate the employee confirms.
 */

import { supabase } from './supabase';
import type { WalletLine } from './bookingWallet';

export interface PortalTransit {
  id: number;
  /** `YYYY-MM-DD HH:mm`, Istanbul. */
  at: string;
  date: string;
  amount: number;
  roadType: string;
  entry: string | null;
  exit: string | null;
  otoyol: string | null;
}

export interface PortalHgsPreview {
  bookingId: number;
  plate: string | null;
  status: string | null;
  startDate: string;
  endDate: string;
  from: string;
  to: string;
  /** `YYYY-MM-DDTHH:mm`, Istanbul; null when the car has no portal data at all. */
  lastUpload: string | null;
  lastTransit: string | null;
  /** The newest rate on this booking's lines, for the default. */
  rateHint: number | null;
  transits: PortalTransit[];
  total: number;
  /** In the period but already charged to the investor: shown, never charged. */
  investorCount: number;
  investorTotal: number;
  /** Already charged to this booking from the portal. */
  postedCount: number;
}

export interface PortalHgsResult {
  posted: number;
  total: number;
}

/** The functions aren't in the database yet (the migration hasn't been applied). */
export class PortalHgsUnavailable extends Error {}

const num = (value: unknown) => (value === null || value === undefined || Number.isNaN(Number(value)) ? 0 : Number(value));
const str = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null);

function failure(error: { message: string; code?: string }): Error {
  if (error.code === 'PGRST202' || /could not find the function/i.test(error.message)) return new PortalHgsUnavailable(error.message);
  return new Error(error.message);
}

export function readPreview(raw: Record<string, unknown>): PortalHgsPreview {
  const transits = Array.isArray(raw.transits) ? raw.transits as Array<Record<string, unknown>> : [];
  return {
    bookingId: num(raw.booking_id),
    plate: str(raw.plate),
    status: str(raw.status),
    startDate: String(raw.start_date ?? ''),
    endDate: String(raw.end_date ?? ''),
    from: String(raw.from ?? ''),
    to: String(raw.to ?? ''),
    lastUpload: str(raw.last_upload),
    lastTransit: str(raw.last_transit),
    rateHint: raw.rate_hint == null ? null : num(raw.rate_hint) || null,
    transits: transits.map(row => ({
      id: num(row.id),
      at: String(row.at ?? ''),
      date: String(row.date ?? ''),
      amount: num(row.amount),
      roadType: String(row.road_type ?? ''),
      entry: str(row.entry_location),
      exit: str(row.exit_location),
      otoyol: str(row.otoyol),
    })),
    total: num(raw.total),
    investorCount: num(raw.investor_count),
    investorTotal: num(raw.investor_total),
    postedCount: num(raw.posted_count),
  };
}

export async function previewPortalHgs(bookingId: number, from: string | null, to: string | null): Promise<PortalHgsPreview> {
  const { data, error } = await supabase.rpc('booking_portal_hgs_preview', { p_booking_id: bookingId, p_from: from, p_to: to });
  if (error) throw failure(error);
  return readPreview((data ?? {}) as Record<string, unknown>);
}

export async function postPortalHgs(bookingId: number, from: string, to: string, rate: number): Promise<PortalHgsResult> {
  const { data, error } = await supabase.rpc('post_booking_portal_hgs', { p_booking_id: bookingId, p_from: from, p_to: to, p_rate: rate });
  if (error) throw failure(error);
  const raw = (data ?? {}) as Record<string, unknown>;
  return { posted: num(raw.posted), total: num(raw.total) };
}

// ─── The default period ───────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

export const addDays = (date: string, days: number): string => {
  const at = new Date(`${date}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
};

/** HGS lines typed by hand, not posted from the portal. */
export const manualHgsLines = <T extends Pick<WalletLine, 'kind' | 'description'>>(lines: readonly T[]): T[] =>
  lines.filter(line => line.kind === 'hgs' && !/^\s*\[AUTO-HGS\]/.test(line.description ?? ''));

/**
 * The latest date a hand-typed HGS line says it covers: "HGS to 31/09/2026",
 * "FROM 02/10 TO 01/11", "hgs to 05.11.2026", "TO 3.11". A day past the end of its
 * month (31/09) means the month's last day. Without a year, the one that puts the date
 * inside or after the booking's start.
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
      const monthEnd = new Date(Date.UTC(year, month, 0)).getUTCDate();
      let date = iso(year, month, Math.min(day, monthEnd));
      if (!match[3] && date < bookingStart) { year += 1; date = iso(year, month, Math.min(day, new Date(Date.UTC(year, month, 0)).getUTCDate())); }
      if (!latest || date > latest) latest = date;
    }
  }
  return latest;
}

/** From: the day after what hand-typed lines already cover, else the booking's start. Always inside the booking. */
export function defaultFrom(lines: readonly Pick<WalletLine, 'kind' | 'description'>[], start: string, end: string): string {
  const covered = coveredUntil(manualHgsLines(lines).map(line => line.description), start);
  const from = covered ? addDays(covered, 1) : start;
  if (from < start) return start;
  if (from > end) return end;
  return from;
}

/** The description the wallet shows for a pass, the same text the database writes. */
export const transitRoute = (transit: Pick<PortalTransit, 'entry' | 'exit' | 'otoyol'>) =>
  `${transit.entry ?? '?'} → ${transit.exit ?? transit.otoyol ?? '?'}`;
