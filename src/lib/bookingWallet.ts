/**
 * A customer's wallet is the sum of their bookings. The car is only a label on each
 * booking: no balance here is ever split by car. Every number is worked out from
 * `customer_accounting_ledger` the way `transfer_booking_balance` works it out,
 * IN minus OUT per booking, and the rules match Admin's `customerWallet.ts`, so both
 * apps and the server always agree.
 */
import type { Direction } from './customerLedger';

export type LineKind = 'rental' | 'deposit' | 'payment' | 'hgs' | 'transfer' | 'refund' | 'other';

type Joined<T> = T | T[] | null | undefined;
const firstOf = <T,>(value: Joined<T>): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null);

export interface WalletLineRow {
  id: string;
  booking_id: number | null;
  customer_id: string;
  car_id: number | null;
  type: string;
  description: string | null;
  amount: number;
  direction: Direction;
  exchange_rate_at_entry: number | null;
  created_at: string | null;
  pay_method?: string | null;
  payment_ref?: string | null;
  cars?: Joined<{ plate_number: string | null }>;
}

export interface WalletBookingRow {
  id: number;
  booking_number: string | null;
  customer_id: string | null;
  car_id: number | null;
  start_date: string;
  end_date: string;
  status: string | null;
  is_currently_active: boolean | null;
  plate: string | null;
  model: string | null;
}

export interface ReplacementRow {
  original_booking_id: number | null;
  original_car_id: number | null;
  replacement_car_id: number | null;
  start_date: string | null;
  original_plate: string | null;
  replacement_plate: string | null;
}

export interface WalletLine extends WalletLineRow {
  kind: LineKind;
  /** IN is +, OUT is −, in lira. */
  signed: number;
  /** For a transfer: the booking on the other side, when it can be found. */
  partner: { id: number | null; number: string } | null;
  /** For a transfer: what was typed after " · ". */
  note: string | null;
}

export type BookingNote =
  | { kind: 'carChanged'; from: string; to: string }
  | { kind: 'replacement'; from: string; to: string; date: string | null };

export interface BookingWallet {
  booking: WalletBookingRow;
  /** Newest first. */
  lines: WalletLine[];
  /** Lira, IN minus OUT, to the kuruş. Positive is credit, negative is owed. */
  balance: number;
  notes: BookingNote[];
}

export type BalanceTone = 'credit' | 'owes' | 'settled';

export const round2 = (value: number) => Math.round(value * 100) / 100;

export function balanceTone(balance: number): BalanceTone {
  const value = round2(balance);
  if (value >= 0.01) return 'credit';
  if (value <= -0.01) return 'owes';
  return 'settled';
}

/** Lira as Turkey writes it, with kuruş only when there are some. */
export const formatLira = (value: number) =>
  '₺' + Math.abs(round2(value)).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function lineKind(type: string): LineKind {
  const value = type.trim().toLowerCase();
  if (value === 'rental' || value === 'deposit' || value === 'payment' || value === 'hgs' || value === 'transfer') return value;
  if (value.startsWith('ref')) return 'refund';
  return 'other';
}

/** car_wash → "Car wash", for a type nobody gave a name. */
export const humanType = (type: string) => {
  const text = type.trim().replace(/_/g, ' ');
  return text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : '—';
};

const DESCRIBED_TRANSFER = /^Balance moved (to|from) (\S+)/;

const time = (value: string | null) => (value ? Date.parse(value) || 0 : 0);
const newestBookingFirst = (a: WalletBookingRow, b: WalletBookingRow) => b.start_date.localeCompare(a.start_date) || b.id - a.id;

/**
 * Groups one customer's lines under their bookings, newest booking first. A transfer
 * finds its other half by the `payment_ref` both halves share, and falls back to the
 * booking number written in its description.
 */
export function buildWallet(rows: WalletLineRow[], bookings: WalletBookingRow[], replacements: ReplacementRow[] = []): BookingWallet[] {
  const byNumber = new Map(bookings.filter(booking => booking.booking_number).map(booking => [booking.booking_number as string, booking.id]));
  const numberOf = new Map(bookings.map(booking => [booking.id, booking.booking_number ?? `#${booking.id}`]));

  const partnerOf = (row: WalletLineRow): WalletLine['partner'] => {
    const other = row.payment_ref ? rows.find(candidate =>
      candidate.id !== row.id
      && candidate.payment_ref === row.payment_ref
      && lineKind(candidate.type) === 'transfer'
      && candidate.booking_id !== row.booking_id
      && candidate.direction !== row.direction
      && round2(Number(candidate.amount)) === round2(Number(row.amount))) : undefined;
    if (other?.booking_id != null) return { id: other.booking_id, number: numberOf.get(other.booking_id) ?? `#${other.booking_id}` };
    const written = row.description?.match(DESCRIBED_TRANSFER)?.[2];
    return written ? { id: byNumber.get(written) ?? null, number: written } : null;
  };

  const grouped = new Map<number, WalletLine[]>();
  for (const row of rows) {
    if (row.booking_id == null) continue;
    const kind = lineKind(row.type);
    const amount = Number(row.amount);
    const transfer = kind === 'transfer';
    const note = transfer && row.description?.includes(' · ') ? row.description.slice(row.description.indexOf(' · ') + 3).trim() || null : null;
    const line: WalletLine = { ...row, amount, kind, signed: row.direction === 'IN' ? amount : -amount, partner: transfer ? partnerOf(row) : null, note };
    grouped.set(row.booking_id, [...(grouped.get(row.booking_id) ?? []), line]);
  }

  return bookings
    .filter(booking => grouped.has(booking.id) || booking.status !== 'cancelled')
    .sort(newestBookingFirst)
    .map(booking => {
      const lines = [...(grouped.get(booking.id) ?? [])].sort((a, b) => time(b.created_at) - time(a.created_at) || b.id.localeCompare(a.id));
      return {
        booking,
        lines,
        balance: round2(lines.reduce((sum, line) => sum + line.signed, 0)),
        notes: bookingNotes(booking, lines, replacements.filter(sheet => sheet.original_booking_id === booking.id)),
      };
    });
}

/**
 * Nothing records a car change, so it is read from what it leaves behind: lines on a car
 * the booking no longer has (HGS stays on the old car, and older changes moved nothing).
 * A replacement car isn't a change, so its lines are skipped and its sheet is its own note.
 */
export function bookingNotes(booking: WalletBookingRow, lines: WalletLine[], sheets: ReplacementRow[]): BookingNote[] {
  const current = booking.plate ?? (booking.car_id != null ? `Car #${booking.car_id}` : '—');
  const replacementCars = new Set(sheets.map(sheet => sheet.replacement_car_id));
  const firstSeen = new Map<number, { at: number; plate: string }>();
  for (const line of lines) {
    if (line.car_id == null || line.car_id === booking.car_id || replacementCars.has(line.car_id)) continue;
    const at = time(line.created_at);
    const seen = firstSeen.get(line.car_id);
    if (!seen || at < seen.at) firstSeen.set(line.car_id, { at, plate: firstOf(line.cars)?.plate_number ?? `Car #${line.car_id}` });
  }
  const changes: BookingNote[] = [...firstSeen.values()].sort((a, b) => a.at - b.at).map(seen => ({ kind: 'carChanged', from: seen.plate, to: current }));
  const swaps: BookingNote[] = [...sheets]
    .sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? ''))
    .map(sheet => ({
      kind: 'replacement',
      from: sheet.original_plate ?? (sheet.original_car_id != null ? `Car #${sheet.original_car_id}` : '—'),
      to: sheet.replacement_plate ?? (sheet.replacement_car_id != null ? `Car #${sheet.replacement_car_id}` : '—'),
      date: sheet.start_date,
    }));
  return [...changes, ...swaps];
}

export const walletTotal = (wallet: BookingWallet[]) => round2(wallet.reduce((sum, entry) => sum + entry.balance, 0));

/** Where a balance can go: the customer's other bookings that aren't cancelled, newest first. */
export const transferTargets = (wallet: BookingWallet[], fromId: number) =>
  wallet.filter(entry => entry.booking.id !== fromId && entry.booking.status !== 'cancelled');

export const canMove = (wallet: BookingWallet[], entry: BookingWallet) =>
  balanceTone(entry.balance) !== 'settled' && transferTargets(wallet, entry.booking.id).length > 0;

/** The booking on the road now, or the newest one when none is. */
export function defaultTarget(wallet: BookingWallet[], fromId: number): number | null {
  const targets = transferTargets(wallet, fromId);
  return (targets.find(entry => entry.booking.is_currently_active) ?? targets[0])?.booking.id ?? null;
}

export type AmountProblem = 'empty' | 'zero' | 'tooMuch';

/**
 * What to send as `p_amount`. The person types how much, always positive; the server
 * wants it signed like the balance (owes 1500 → −1500).
 */
export function transferAmount(balance: number, typed: string): { amount: number } | { problem: AmountProblem } {
  const cleaned = typed.replace(/\s/g, '').replace(',', '.');
  if (!cleaned) return { problem: 'empty' };
  const value = round2(Number(cleaned));
  if (!Number.isFinite(value) || value <= 0) return { problem: 'zero' };
  if (value > round2(Math.abs(balance))) return { problem: 'tooMuch' };
  return { amount: balance < 0 ? -value : value };
}

/** The newest booking other than `bookingId` that still holds money either way. */
export const leftoverBalance = (wallet: BookingWallet[], bookingId: number): BookingWallet | null =>
  wallet.find(entry => entry.booking.id !== bookingId && balanceTone(entry.balance) !== 'settled') ?? null;

/** Only "forbidden" has its own words; anything else the server says is shown as it is. */
export const transferFailure = (message: string | undefined): { key: 'forbidden' | 'failed'; message: string | null } =>
  (message ?? '').toLowerCase().includes('forbidden') ? { key: 'forbidden', message: null } : { key: 'failed', message: message?.trim() || null };
