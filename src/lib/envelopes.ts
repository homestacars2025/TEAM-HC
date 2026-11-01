import { SUPPLIER_CURRENCIES, type SupplierCurrency } from './suppliers';

export type EnvelopeStatus = 'with_employee' | 'in_safe' | 'with_admin' | 'cancelled';

export interface Envelope {
  id: number;
  ref: string;
  amount: number;
  currency: SupplierCurrency;
  holder_profile_id: string;
  status: EnvelopeStatus;
  current_account_id: number | null;
  booking_id: number | null;
  counted_amount: number | null;
  difference: number | null;
  difference_note: string | null;
  created_at: string;
  handed_at: string | null;
  admin_received_at: string | null;
  customer: { first_name: string | null; last_name: string | null } | null;
  car: { plate_number: string } | null;
}

export const envelopeCustomer = (envelope: Pick<Envelope, 'customer'>): string =>
  [envelope.customer?.first_name, envelope.customer?.last_name].filter(Boolean).join(' ');

const DAY_MS = 24 * 3_600_000;

/** Cash should not stay with a person past a day. */
export const isOverdue = (envelope: Pick<Envelope, 'status' | 'created_at'>, at: number): boolean =>
  envelope.status === 'with_employee' && at - new Date(envelope.created_at).getTime() > DAY_MS;

export interface EnvelopeSummary {
  count: number;
  totals: Array<{ currency: SupplierCurrency; total: number }>;
  overdue: boolean;
}

/** What someone is holding. Currencies never add up to one figure. */
export function holdingSummary(envelopes: Envelope[], at: number): EnvelopeSummary {
  const held = envelopes.filter(envelope => envelope.status === 'with_employee');
  return {
    count: held.length,
    totals: SUPPLIER_CURRENCIES.flatMap(currency => {
      const own = held.filter(envelope => envelope.currency === currency);
      return own.length ? [{ currency, total: own.reduce((sum, envelope) => sum + Number(envelope.amount), 0) }] : [];
    }),
    overdue: held.some(envelope => isOverdue(envelope, at)),
  };
}

/** A reference typed by hand: spaces and case never matter. */
export function findEnvelope(envelopes: Envelope[], typed: string): Envelope | null {
  const ref = typed.trim().toUpperCase().replace(/\s+/g, '');
  return envelopes.find(envelope => envelope.ref.toUpperCase() === ref) ?? null;
}

export type MovementKind = 'customer_payment' | 'envelope_handover' | 'transfer' | 'bank_deposit' | 'pos_settlement' | 'admin_receipt' | 'custody_out' | 'refund' | 'adjustment' | 'reversal';

/** All the Cash & Envelopes page ever calls a movement. The stored kinds stay as they are. */
export const MOVEMENT_GROUPS = ['customer_payment', 'bank_deposit', 'admin_receipt'] as const;
export type MovementGroup = typeof MOVEMENT_GROUPS[number];

export interface Movement {
  id: number;
  ref: string;
  kind: MovementKind;
  status: 'pending' | 'done';
  from_account_id: number | null;
  to_account_id: number | null;
  amount: number;
  currency: SupplierCurrency;
  amount_try: number | null;
  expected_at: string | null;
  note: string | null;
  reverses_id: number | null;
  created_by: string | null;
  created_at: string;
}

export interface CashAccount {
  id: number;
  code: string;
  name: string;
  kind: string;
  is_final: boolean;
  settlement_days: number | null;
  settles_to_account_id: number | null;
}

export interface AccountBalance {
  account_id: number;
  currency: SupplierCurrency;
  balance: number;
}

/**
 * A reversal swaps the two accounts, so one with neither does nothing to any balance.
 * A cash payment is like that: it reaches an account through its envelope.
 */
export const canReverse = (movement: Movement, reversed: Set<number>): boolean =>
  movement.status === 'done' && movement.kind !== 'reversal' && !reversed.has(movement.id)
  && (movement.from_account_id !== null || movement.to_account_id !== null);

export function pendingSettlement(movements: Movement[]) {
  const pending = movements.filter(movement => movement.status === 'pending' && movement.kind === 'pos_settlement');
  return {
    count: pending.length,
    totals: SUPPLIER_CURRENCIES.flatMap(currency => {
      const own = pending.filter(movement => movement.currency === currency);
      return own.length ? [{ currency, total: own.reduce((sum, movement) => sum + Number(movement.amount), 0) }] : [];
    }),
    next: pending.map(movement => movement.expected_at).filter((date): date is string => !!date).sort()[0] ?? null,
  };
}

/**
 * `null` is anything this page doesn't list: a reversal shows as its original struck
 * through, custody payouts belong to Staff custody, and a transfer between safes is
 * money that stayed in the company.
 */
export function movementGroup(movement: Pick<Movement, 'kind' | 'to_account_id'>, accounts: Pick<CashAccount, 'id' | 'kind'>[]): MovementGroup | null {
  if (movement.kind === 'customer_payment') return 'customer_payment';
  if (movement.kind === 'bank_deposit' || movement.kind === 'pos_settlement') return 'bank_deposit';
  if (movement.kind === 'admin_receipt' || movement.kind === 'envelope_handover') return 'admin_receipt';
  if (movement.kind === 'transfer' && accounts.find(account => account.id === movement.to_account_id)?.kind === 'bank') return 'bank_deposit';
  return null;
}

export const isInternalTransfer = (movement: Pick<Movement, 'kind' | 'to_account_id'>, accounts: Pick<CashAccount, 'id' | 'kind'>[]): boolean =>
  movement.kind === 'transfer' && movementGroup(movement, accounts) === null;

export type CashFilter = 'all' | 'staff' | 'pos' | `account-${number}`;

export const accountFilter = (id: number): `account-${number}` => `account-${id}`;

export function inCashFilter(envelope: Envelope, filter: string): boolean {
  if (filter === 'all') return true;
  if (filter === 'staff') return envelope.status === 'with_employee';
  if (filter === 'pos') return false;
  return filter === accountFilter(envelope.current_account_id ?? -1);
}

export function movementInFilter(movement: Movement, filter: string): boolean {
  if (filter === 'all') return true;
  if (filter === 'staff') return movement.kind === 'customer_payment' || movement.kind === 'envelope_handover';
  if (filter === 'pos') return movement.status === 'pending' && movement.kind === 'pos_settlement';
  return filter === accountFilter(movement.from_account_id ?? -1) || filter === accountFilter(movement.to_account_id ?? -1);
}

/** A refusal from the server, as a key under `cash.errors`. */
export function cashErrorKey(message: string | undefined): string {
  const known: Array<[RegExp, string]> = [
    [/forbidden/i, 'forbidden'],
    [/Only the admin/i, 'adminOnly'],
    [/not found/i, 'notFound'],
    [/is already/i, 'alreadyDone'],
    [/differs|note is required/i, 'note'],
    [/different accounts/i, 'sameAccount'],
    [/Already reversed/i, 'alreadyDone'],
    [/not pending/i, 'alreadyDone'],
    [/Choose a safe/i, 'destination'],
  ];
  return known.find(([pattern]) => pattern.test(message ?? ''))?.[1] ?? 'generic';
}
