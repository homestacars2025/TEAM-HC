import { brandLockupHtml } from './brand';

/**
 * "Receive cash": a staff member in the field takes cash from a customer.
 * `staff_receive_cash` credits the customer's wallet at once and issues an envelope
 * code the staff member holds (`with_employee`) until finance takes it into a safe.
 * The rules worked out here are kept pure so they can be tested.
 */

export const CASH_PURPOSES = ['rental', 'deposit', 'extension', 'hgs', 'fine', 'damage', 'fuel', 'delivery', 'other'] as const;
export type CashPurpose = typeof CASH_PURPOSES[number];

export const CASH_CURRENCIES = ['TRY', 'USD', 'EUR'] as const;
export type CashCurrency = typeof CASH_CURRENCIES[number];
export const CURRENCY_SIGN: Record<CashCurrency, string> = { TRY: '₺', USD: '$', EUR: '€' };

/** A note is required for "other": the server refuses it without one. */
export const needsNote = (purpose: CashPurpose | null): boolean => purpose === 'other';

/**
 * What was typed in the amount field, as a number, or null when it isn't one above 0.
 * A comma or a dot works as the decimal point; at most two decimals.
 */
export function parseAmount(typed: string): number | null {
  const text = typed.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Keeps the field to digits and one decimal separator, two places after it. */
export function cleanAmountInput(typed: string): string {
  let seenPoint = false;
  let out = '';
  for (const char of typed.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))) {
    if (/\d/.test(char)) {
      const decimals = seenPoint ? out.split(/[.,]/)[1]?.length ?? 0 : 0;
      if (decimals < 2) out += char;
    } else if ((char === '.' || char === ',') && !seenPoint && out.length > 0) {
      seenPoint = true;
      out += char;
    }
  }
  return out.slice(0, 12);
}

export function formatCashAmount(amount: number, currency: CashCurrency): string {
  const digits = amount.toLocaleString(currency === 'TRY' ? 'tr-TR' : 'en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return `${CURRENCY_SIGN[currency]}${digits}`;
}

// ── Bookings ──────────────────────────────────────────────────────────────────

export type CashBookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';

export interface CashBooking {
  id: number;
  bookingNumber: string;
  status: CashBookingStatus;
  startDate: string;
  endDate: string;
  plate: string | null;
  model: string | null;
  customerId: string;
  customerName: string;
  createdAt: string | null;
}

const isActive = (booking: Pick<CashBooking, 'status'>) => booking.status === 'pending' || booking.status === 'confirmed';

/** Newest first, cancelled ones left out: the server refuses cash on them anyway. */
export function cashBookings(rows: readonly CashBooking[]): CashBooking[] {
  return rows
    .filter(row => row.status !== 'cancelled')
    .sort((a, b) => b.startDate.localeCompare(a.startDate) || (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || b.id - a.id);
}

/** The one active booking, when there is exactly one, so it can be chosen for them. */
export function preselectBooking(rows: readonly CashBooking[]): CashBooking | null {
  const active = rows.filter(isActive);
  return active.length === 1 ? active[0] : null;
}

/**
 * Plates look like 34 ABC 123: letters and digits together. A name or a phone number
 * doesn't, so only a term with both is also looked up as a plate.
 */
export function plateTerm(typed: string): string | null {
  const text = typed.replace(/[\s-]/g, '').toUpperCase();
  return text.length >= 3 && /\d/.test(text) && /[A-Z]/.test(text) && /^[0-9A-Z]+$/.test(text) ? text : null;
}

// ── The server's answer ───────────────────────────────────────────────────────

export interface CashEnvelope {
  ref: string;
  purpose: string;
  plate: string | null;
  customer: string | null;
  bookingNumber: string | null;
  /** `YYYY-MM-DD HH:MM`, Istanbul. */
  date: string;
  amount: number;
  currency: CashCurrency;
  holder: string | null;
  status: string;
}

export interface CashReceipt {
  ledgerId: string;
  amountTry: number;
  envelope: CashEnvelope;
}

export function toCashReceipt(raw: unknown): CashReceipt {
  const row = (raw ?? {}) as Record<string, unknown>;
  const env = (row.envelope ?? {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
  const currency = CASH_CURRENCIES.includes(env.currency as CashCurrency) ? env.currency as CashCurrency : 'TRY';
  return {
    ledgerId: String(row.ledger_id ?? ''),
    amountTry: Number(row.amount_try ?? 0),
    envelope: {
      ref: text(env.ref) ?? '',
      purpose: text(env.purpose) ?? '',
      plate: text(env.plate),
      customer: text(env.customer),
      bookingNumber: text(env.booking_number),
      date: text(env.date) ?? '',
      amount: Number(env.amount ?? 0),
      currency,
      holder: text(env.holder),
      status: text(env.status) ?? 'with_employee',
    },
  };
}

/** A refusal from `staff_receive_cash`, as a key under `errors` in the `cash` namespace. */
export function receiveCashErrorKey(message: string | undefined | null): string {
  const known: Array<[RegExp, string]> = [
    [/forbidden|permission denied|42501/i, 'forbidden'],
    [/Choose what the money is for/i, 'purpose'],
    [/Amount must be/i, 'amount'],
    [/Currency must be/i, 'currency'],
    [/Add a note/i, 'note'],
    [/Booking not found/i, 'notFound'],
    [/cancelled/i, 'cancelled'],
    [/exchange rate/i, 'rate'],
    [/Failed to fetch|NetworkError|Load failed|network/i, 'offline'],
  ];
  return known.find(([pattern]) => pattern.test(message ?? ''))?.[1] ?? 'generic';
}

// ── After: what goes on the envelope ──────────────────────────────────────────

export interface EnvelopeLines {
  ref: string;
  customer: string;
  booking: string;
  plate: string;
  amount: string;
  purpose: string;
  date: string;
  holder: string;
}

/** The WhatsApp summary: one line per field, in the reader's language. */
export function envelopeShareText(title: string, labels: Record<keyof EnvelopeLines, string>, lines: EnvelopeLines, instruction: string): string {
  const keys: Array<keyof EnvelopeLines> = ['ref', 'customer', 'booking', 'plate', 'amount', 'purpose', 'date', 'holder'];
  return [title, ...keys.filter(key => lines[key]).map(key => `${labels[key]}: ${lines[key]}`), '', instruction].join('\n');
}

export const whatsappUrl = (text: string): string => `https://wa.me/?text=${encodeURIComponent(text)}`;

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * A label for the envelope: the code large enough to read across a desk, then who, what
 * and when. Labels in both languages, since finance reads it in either. Sized for a
 * 100 × 70 mm label; on A4 it prints at that size in the corner.
 */
export function envelopeLabelHtml(lines: EnvelopeLines, labels: { en: Record<keyof EnvelopeLines, string>; ar: Record<keyof EnvelopeLines, string> }, instruction: { en: string; ar: string }): string {
  const keys: Array<keyof EnvelopeLines> = ['customer', 'booking', 'plate', 'amount', 'purpose', 'date', 'holder'];
  const rows = keys.filter(key => lines[key]).map(key => `
      <tr><th><span>${escapeHtml(labels.en[key])}</span><span dir="rtl">${escapeHtml(labels.ar[key])}</span></th><td dir="auto">${escapeHtml(lines[key])}</td></tr>`).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(lines.ref)}</title>
<style>
  @page { size: 100mm 70mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, "Noto Sans Arabic", sans-serif; color: #0f1117; background: #fff; }
  .page { width: 100mm; height: 70mm; padding: 4mm 5mm; display: flex; flex-direction: column; gap: 2mm; overflow: hidden; }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 3mm; }
  .brand-logo { display: block; object-fit: contain; }
  .tag { font-size: 7pt; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: .08em; text-align: end; }
  .ref { margin: 0; padding: 2mm 0; border-top: .4mm solid #0f1117; border-bottom: .4mm solid #0f1117; font: 600 19pt/1.1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .04em; text-align: center; direction: ltr; }
  table { width: 100%; border-collapse: collapse; font-size: 8pt; }
  th { width: 26mm; padding: .5mm 0; text-align: start; vertical-align: top; color: #6b7280; font-weight: 500; }
  th span { display: block; line-height: 1.15; }
  th span + span { font-size: 6.5pt; }
  td { padding: .5mm 0; font-weight: 600; vertical-align: top; }
  .note { margin-top: auto; font-size: 7pt; color: #374151; display: flex; justify-content: space-between; gap: 3mm; }
  .print-bar { display: flex; gap: 8px; padding: 12px; }
  .print-bar button { font: inherit; padding: 10px 16px; border-radius: 10px; border: 1px solid #d1d5db; background: #fff; cursor: pointer; }
  @media print { .print-bar { display: none; } }
</style>
</head>
<body>
<div class="print-bar"><button type="button" onclick="history.back()">← Back</button><button type="button" onclick="window.print()">🖨 Print</button></div>
<div class="page">
  <div class="head">${brandLockupHtml(18)}<div class="tag">Cash envelope<br><span dir="rtl">ظرف نقدي</span></div></div>
  <p class="ref">${escapeHtml(lines.ref)}</p>
  <table>${rows}
  </table>
  <div class="note"><span>${escapeHtml(instruction.en)}</span><span dir="rtl">${escapeHtml(instruction.ar)}</span></div>
</div>
</body>
</html>`;
}

// ── Held envelopes ────────────────────────────────────────────────────────────

export interface HeldEnvelope {
  id: number;
  ref: string;
  amount: number;
  currency: CashCurrency;
  createdAt: string;
  bookingNumber: string | null;
  plate: string | null;
  customer: string | null;
  note: string | null;
}

export function toHeldEnvelope(raw: Record<string, unknown>): HeldEnvelope {
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
  return {
    id: Number(raw.id),
    ref: text(raw.ref) ?? '',
    amount: Number(raw.amount ?? 0),
    currency: CASH_CURRENCIES.includes(raw.currency as CashCurrency) ? raw.currency as CashCurrency : 'TRY',
    createdAt: text(raw.created_at) ?? '',
    bookingNumber: text(raw.booking_number),
    plate: text(raw.plate),
    customer: text(raw.customer),
    note: text(raw.note),
  };
}

const DAY_MS = 24 * 3_600_000;

/** Cash should not stay with a person past a day. */
export const heldTooLong = (envelope: Pick<HeldEnvelope, 'createdAt'>, now: number): boolean => {
  const at = Date.parse(envelope.createdAt);
  return !Number.isNaN(at) && now - at > DAY_MS;
};

export interface HeldSummary {
  count: number;
  /** One total per currency, in TRY, USD, EUR order. Currencies never add up to one figure. */
  totals: Array<{ currency: CashCurrency; total: number }>;
  late: number;
}

export function heldSummary(envelopes: readonly HeldEnvelope[], now: number): HeldSummary {
  return {
    count: envelopes.length,
    totals: CASH_CURRENCIES.flatMap(currency => {
      const own = envelopes.filter(envelope => envelope.currency === currency);
      return own.length ? [{ currency, total: Math.round(own.reduce((sum, envelope) => sum + envelope.amount, 0) * 100) / 100 }] : [];
    }),
    late: envelopes.filter(envelope => heldTooLong(envelope, now)).length,
  };
}

/** How long it has been held: minutes, hours, then whole days. */
export function heldFor(createdAt: string, now: number): { unit: 'now' | 'minutes' | 'hours' | 'days'; count: number } | null {
  const at = Date.parse(createdAt);
  if (Number.isNaN(at)) return null;
  const minutes = Math.floor(Math.max(now - at, 0) / 60_000);
  if (minutes < 1) return { unit: 'now', count: 0 };
  if (minutes < 60) return { unit: 'minutes', count: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { unit: 'hours', count: hours };
  return { unit: 'days', count: Math.floor(hours / 24) };
}
