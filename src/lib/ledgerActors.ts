import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/**
 * Who recorded and who last edited each customer-ledger line, and what changed.
 *
 * The database stamps `created_by` / `updated_by` itself and writes every edit or
 * delete to `customer_ledger_audit`. People come from `ledger_actor_cards`, which
 * answers only for finance, in one call per list, cached by id for the session.
 */

export interface LedgerActor {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  avatarBg: string | null;
  role: string | null;
}

/** The stamp columns every ledger read should carry. */
export const LEDGER_STAMP_COLUMNS = 'created_by, updated_by, updated_at';

export interface LedgerStamp {
  created_by?: string | null;
  created_at?: string | null;
  updated_by?: string | null;
  updated_at?: string | null;
}

// ── People ───────────────────────────────────────────────────────────────────

/** null: asked for and not returned (no such profile, or not finance). */
const actorCache = new Map<string, LedgerActor | null>();
const inFlight = new Map<string, Promise<void>>();

interface ActorCardRow { id: string; full_name: string | null; avatar_url: string | null; avatar_bg: string | null; role: string | null }

const toActor = (row: ActorCardRow): LedgerActor => ({
  id: row.id,
  fullName: (row.full_name ?? '').trim() || 'Unknown',
  avatarUrl: row.avatar_url || null,
  avatarBg: row.avatar_bg || null,
  role: row.role,
});

export const uniqueIds = (ids: Iterable<string | null | undefined>): string[] =>
  Array.from(new Set(Array.from(ids).filter((id): id is string => Boolean(id)))).sort();

/** One RPC for every id not already known; ids asked for elsewhere are awaited, not asked twice. */
export async function loadLedgerActors(ids: Iterable<string | null | undefined>): Promise<Map<string, LedgerActor>> {
  const wanted = uniqueIds(ids);
  const missing = wanted.filter((id) => !actorCache.has(id) && !inFlight.has(id));
  if (missing.length > 0) {
    const request = (async () => {
      const { data, error } = await supabase.rpc('ledger_actor_cards', { p_ids: missing });
      if (error) throw new Error(error.message);
      missing.forEach((id) => actorCache.set(id, null));
      ((data ?? []) as ActorCardRow[]).forEach((row) => actorCache.set(row.id, toActor(row)));
    })();
    missing.forEach((id) => inFlight.set(id, request));
    request.then(
      () => missing.forEach((id) => inFlight.delete(id)),
      () => missing.forEach((id) => inFlight.delete(id)),
    );
  }
  await Promise.all(Array.from(new Set(wanted.map((id) => inFlight.get(id)).filter(Boolean))));
  const found = new Map<string, LedgerActor>();
  wanted.forEach((id) => {
    const actor = actorCache.get(id);
    if (actor) found.set(id, actor);
  });
  return found;
}

/** For tests. */
export function clearLedgerActorCache(): void {
  actorCache.clear();
  inFlight.clear();
}

export interface LedgerActorsState {
  actors: Map<string, LedgerActor>;
  loading: boolean;
  error: string | null;
}

/** Everyone on a list, in one call, again only when the set of people changes. */
export function useLedgerActors(ids: Iterable<string | null | undefined>, enabled = true): LedgerActorsState {
  const key = uniqueIds(ids).join(',');
  const [state, setState] = useState<LedgerActorsState>({ actors: new Map(), loading: false, error: null });
  useEffect(() => {
    if (!enabled || !key) {
      setState({ actors: new Map(), loading: false, error: null });
      return undefined;
    }
    let active = true;
    setState((current) => ({ ...current, loading: true, error: null }));
    loadLedgerActors(key.split(','))
      .then((actors) => { if (active) setState({ actors, loading: false, error: null }); })
      .catch((failure: unknown) => {
        if (active) setState({ actors: new Map(), loading: false, error: failure instanceof Error ? failure.message : 'Could not load people.' });
      });
    return () => { active = false; };
  }, [key, enabled]);
  return state;
}

/** "Ahmet Yılmaz" → "AY"; one name → its first two letters. */
export function actorInitials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return Array.from(words[0]).slice(0, 2).join('').toUpperCase();
  return (Array.from(words[0])[0] + Array.from(words[words.length - 1])[0]).toUpperCase();
}

/** The signed-in person, for `created_by` on an insert. The database fills it anyway when this is null. */
export async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

// ── History ──────────────────────────────────────────────────────────────────

export type LedgerAuditAction = 'update' | 'delete';
type LedgerRowJson = Record<string, unknown>;

export interface LedgerAuditEntry {
  id: number;
  ledgerId: string;
  action: LedgerAuditAction;
  changedBy: string | null;
  changedAt: string;
  oldRow: LedgerRowJson | null;
  newRow: LedgerRowJson | null;
}

const AUDIT_COLUMNS = 'id, ledger_id, action, changed_by, changed_at, old_row, new_row';

const toAudit = (row: Record<string, unknown>): LedgerAuditEntry => ({
  id: Number(row.id),
  ledgerId: String(row.ledger_id),
  action: row.action === 'delete' ? 'delete' : 'update',
  changedBy: (row.changed_by as string | null) ?? null,
  changedAt: String(row.changed_at),
  oldRow: (row.old_row as LedgerRowJson | null) ?? null,
  newRow: (row.new_row as LedgerRowJson | null) ?? null,
});

/** One line's edits and its delete, newest first. */
export async function fetchLedgerHistory(ledgerId: string): Promise<LedgerAuditEntry[]> {
  const { data, error } = await supabase
    .from('customer_ledger_audit')
    .select(AUDIT_COLUMNS)
    .eq('ledger_id', ledgerId)
    .order('changed_at', { ascending: false })
    .order('id', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map(toAudit);
}

/** Every line deleted from one customer's wallet, newest first. */
export async function fetchDeletedLedgerEntries(customerId: string): Promise<LedgerAuditEntry[]> {
  const { data, error } = await supabase
    .from('customer_ledger_audit')
    .select(AUDIT_COLUMNS)
    .eq('action', 'delete')
    .eq('old_row->>customer_id', customerId)
    .order('changed_at', { ascending: false })
    .order('id', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map(toAudit);
}

export type AuditField = 'amount' | 'type' | 'direction' | 'description' | 'car_id' | 'booking_id' | 'account_id';

/** The fields a person can see change, in the order they're listed. */
export const AUDIT_FIELDS: readonly AuditField[] = ['amount', 'type', 'direction', 'description', 'car_id', 'booking_id', 'account_id'];

export interface FieldChange {
  field: AuditField;
  from: unknown;
  to: unknown;
}

const comparable = (field: AuditField, value: unknown): string => {
  if (value === null || value === undefined || String(value).trim() === '') return '';
  if (field === 'amount' || field.endsWith('_id')) {
    const number = Number(value);
    return Number.isFinite(number) ? String(number) : String(value);
  }
  return String(value).trim();
};

/** Only the fields that really changed: 100 and "100.00" are the same amount. */
export function changedFields(oldRow: LedgerRowJson | null, newRow: LedgerRowJson | null): FieldChange[] {
  if (!oldRow || !newRow) return [];
  return AUDIT_FIELDS
    .filter((field) => comparable(field, oldRow[field]) !== comparable(field, newRow[field]))
    .map((field) => ({ field, from: oldRow[field] ?? null, to: newRow[field] ?? null }));
}

export interface LedgerRefNames {
  cars: Map<number, string>;
  bookings: Map<number, string>;
  accounts: Map<number, string>;
}

const idsOf = (entries: LedgerAuditEntry[], field: AuditField): number[] => Array.from(new Set(
  entries.flatMap((entry) => [entry.oldRow?.[field], entry.newRow?.[field]])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0),
));

/** Plates, booking numbers and account names for the ids in some history, in parallel. */
export async function fetchLedgerRefNames(entries: LedgerAuditEntry[]): Promise<LedgerRefNames> {
  const carIds = idsOf(entries, 'car_id');
  const bookingIds = idsOf(entries, 'booking_id');
  const accountIds = idsOf(entries, 'account_id');
  const none = Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null });
  const [cars, bookings, accounts] = await Promise.all([
    carIds.length ? supabase.from('cars').select('id, plate_number').in('id', carIds) : none,
    bookingIds.length ? supabase.from('bookings').select('id, booking_number').in('id', bookingIds) : none,
    accountIds.length ? supabase.from('cash_accounts').select('id, name').in('id', accountIds) : none,
  ]);
  const map = (rows: unknown, label: string) => new Map(
    ((rows ?? []) as Array<Record<string, unknown>>)
      .filter((row) => row[label])
      .map((row) => [Number(row.id), String(row[label])] as [number, string]),
  );
  // A name that won't load leaves the id showing; it never hides the history.
  return {
    cars: map(cars.error ? [] : cars.data, 'plate_number'),
    bookings: map(bookings.error ? [] : bookings.data, 'booking_number'),
    accounts: map(accounts.error ? [] : accounts.data, 'name'),
  };
}

/** Ids for everyone in some history: who changed it and who first recorded it. */
export const auditActorIds = (entries: LedgerAuditEntry[]): string[] => uniqueIds(entries.flatMap((entry) => [
  entry.changedBy,
  (entry.oldRow?.created_by as string | null | undefined) ?? null,
]));
