import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../lib/supabase';
import { fetchCurrentUsdRate } from '../lib/exchangeRate';
import { printCustomerInvoice } from '../lib/printCustomerInvoice';
import { useCurrency, CURRENCY_SYMBOLS, type Currency } from '../lib/CurrencyContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type Direction = 'IN' | 'OUT';

/** Which car cards the top tabs show. */
type RentalTab = 'all' | 'current' | 'ended';

/** Minimal shape of the exchange-rate list handed over by the currency context. */
interface RateRow { currency: string; rate_to_try: number; }

type ToastState = { message: string; type: 'success' | 'error' } | null;

interface LedgerRow {
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
  customers: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null;
  cars: { plate_number: string | null } | { plate_number: string | null }[] | null;
}

/** Level 2 — one customer's ledger on ONE car. Balances are scoped to that car only. */
interface CustomerOnCar {
  customerId: string;
  name: string;
  /** This customer's entries on this car, newest first (the order printCustomerInvoice expects). */
  rows: LedgerRow[];
  totalIn: number;
  totalOut: number;
  balance: number;
  /** True when at least one entry could not be converted at its own stored rate. */
  approx: boolean;
  /** True when this customer holds a currently-active booking on THIS car. */
  live: boolean;
}

/** Level 1 — one car plate and every customer who has ledger entries against it. */
interface CarGroup {
  key: string;
  carId: number | null;
  plate: string;
  customers: CustomerOnCar[];
  totalIn: number;
  totalOut: number;
  balance: number;
  approx: boolean;
  hasLive: boolean;
}

const UNLINKED_KEY = '__unlinked__';

interface CustomerOption { id: string; name: string; }

/** Shape of the bookings lookup; supabase types embedded relations as arrays. */
interface BookingQueryRow {
  id: number;
  booking_number: string | null;
  start_date: string;
  end_date: string;
  car_id: number;
  cars: { plate_number: string | null } | { plate_number: string | null }[] | null;
}

/** Embedded relations come back as an object or a single-element array depending on the query. */
function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

interface BookingOption {
  id: number;
  booking_number: string | null;
  start_date: string;
  end_date: string;
  car_id: number;
  plate_number: string | null;
}

// ─── Ledger vocabulary ────────────────────────────────────────────────────────

const IN_TYPES  = ['payment', 'deposit'] as const;
const OUT_TYPES = ['rental', 'hgs', 'cleaning', 'fine', 'accident', 'refund', 'other'] as const;
const ALL_TYPES: string[] = [...IN_TYPES, ...OUT_TYPES];

const TYPE_LABELS: Record<string, string> = {
  payment:  'Payment',
  deposit:  'Deposit',
  rental:   'Rental',
  hgs:      'HGS Toll',
  cleaning: 'Cleaning',
  fine:     'Fine',
  accident: 'Accident',
  refund:   'Refund',
  other:    'Other',
};

/**
 * Preset map — picking a type sets the direction, so the two can never disagree by accident.
 * `other` is deliberately absent: it has no natural direction, so the user must choose one.
 */
const TYPE_DIRECTION: Record<string, Direction> = {
  payment:  'IN',
  deposit:  'IN',
  rental:   'OUT',
  hgs:      'OUT',
  cleaning: 'OUT',
  fine:     'OUT',
  accident: 'OUT',
  refund:   'OUT',
};

function typeLabel(t: string): string {
  return TYPE_LABELS[t] ?? (t ? t.charAt(0).toUpperCase() + t.slice(1) : '—');
}

// ─── Money & dates ────────────────────────────────────────────────────────────

/**
 * Thousands separators, never a raw float. Decimals follow the app-wide convention
 * in CurrencyContext: 3 for LYD, 2 everywhere else.
 */
function formatMoney(value: number, currency: Currency): string {
  const locale   = currency === 'TRY' ? 'tr-TR' : 'en-US';
  const decimals = currency === 'LYD' ? 3 : 2;
  const abs = Math.abs(value).toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (CURRENCY_SYMBOLS[currency] ?? '₺') + abs;
}

/** Signed figure using a true minus sign, matching the Accounting page. */
function formatSigned(value: number, currency: Currency): string {
  const sign = value < -0.005 ? '−' : value > 0.005 ? '+' : '';
  return sign + formatMoney(value, currency);
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateDisplay(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Converts one TRY-stored entry into the app's selected currency.
 *
 * USD uses the entry's OWN `exchange_rate_at_entry`, so historical rows keep the value they
 * had when recorded; a missing rate falls back to today's and is flagged approximate.
 * EUR/LYD have no per-entry rate stored, so they convert at today's rate — always approximate.
 */
function convertEntry(
  row: LedgerRow,
  currency: Currency,
  rates: RateRow[],
  fallbackUsdRate: number | null,
): { value: number; approx: boolean } {
  if (currency === 'TRY') return { value: row.amount, approx: false };

  if (currency === 'USD') {
    const stored = row.exchange_rate_at_entry;
    if (stored != null && stored > 0) return { value: row.amount / stored, approx: false };
    if (fallbackUsdRate != null && fallbackUsdRate > 0) return { value: row.amount / fallbackUsdRate, approx: true };
    return { value: 0, approx: true };
  }

  const rate = rates.find(r => r.currency === currency)?.rate_to_try;
  if (rate != null && rate > 0) return { value: row.amount / rate, approx: true };
  return { value: row.amount, approx: true };
}

function customerNameOf(row: LedgerRow): string {
  const c = firstOf(row.customers);
  return [c?.first_name, c?.last_name].filter(Boolean).join(' ').trim() || 'Unknown customer';
}

function bookingLabel(b: BookingOption): string {
  const num = b.booking_number || `#${b.id}`;
  const plate = b.plate_number ? ` · ${b.plate_number}` : '';
  return `${num}${plate} · ${formatDateDisplay(b.start_date)} → ${formatDateDisplay(b.end_date)}`;
}

// ─── Shared styles (mirrors the Accounting page design system) ────────────────

const COLOR_IN  = '#16a34a';
const COLOR_OUT = '#ef4444';
const COLOR_ZERO = '#6b7280';

const labelStyle: React.CSSProperties = {
  fontSize: 11.5, fontWeight: 700, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '0.5px',
  marginBottom: 6, display: 'block',
};

const inputStyle: React.CSSProperties = {
  width: '100%', height: 42, padding: '0 12px', borderRadius: 10,
  border: '1px solid #e5e7eb', background: '#fff', fontSize: 14,
  color: '#0f1117', fontFamily: 'inherit', outline: 'none',
};

const primaryBtn: React.CSSProperties = {
  height: 42, padding: '0 20px', borderRadius: 10, border: 'none',
  background: 'linear-gradient(135deg, #4ba6ea 0%, #2e8fd4 100%)',
  color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center',
  justifyContent: 'center', gap: 7,
};

const cardStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 16, border: '1px solid #ebebeb',
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
};

const rowActionBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff',
  cursor: 'pointer', color: '#6b7280', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};

const tdStyle: React.CSSProperties = {
  padding: '11px 14px', fontSize: 13.5, color: '#0f1117',
  borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap',
};

const Th: React.FC<{ children?: React.ReactNode; align?: 'left' | 'right' }> = ({ children, align = 'left' }) => (
  <th style={{
    padding: '9px 14px', fontSize: 11, fontWeight: 700, color: '#6b7280',
    background: '#fafafa', borderBottom: '1px solid #ebebeb', textAlign: align,
    textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap',
  }}>{children}</th>
);

/** Balance colour rule: red owes us, green in credit, grey settled. */
function balanceColor(balance: number): string {
  if (balance < -0.005) return COLOR_OUT;
  if (balance > 0.005) return COLOR_IN;
  return COLOR_ZERO;
}

// ─── Reusable bits ────────────────────────────────────────────────────────────

const Toast: React.FC<{ toast: ToastState }> = ({ toast }) => {
  if (!toast) return null;
  return ReactDOM.createPortal(
    <div style={{
      position: 'fixed', bottom: 28, right: 28, zIndex: 2000,
      display: 'flex', alignItems: 'center', gap: 10,
      background: toast.type === 'success' ? '#0f1117' : '#ef4444',
      color: '#fff', borderRadius: 12, padding: '12px 20px',
      fontSize: 14, fontWeight: 500, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
    }}>
      {toast.message}
    </div>,
    document.body,
  );
};

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; maxWidth?: number }> =
  ({ title, onClose, children, maxWidth = 520 }) =>
    ReactDOM.createPortal(
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,17,23,0.45)',
        backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 20,
      }}>
        <div onClick={e => e.stopPropagation()} style={{
          background: '#fff', borderRadius: 18, width: '100%', maxWidth,
          maxHeight: '92vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 80px rgba(0,0,0,0.2)',
        }}>
          <div style={{
            padding: '20px 24px', borderBottom: '1px solid #f0f0f0', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0f1117' }}>{title}</h3>
            <button onClick={onClose} style={{
              width: 30, height: 30, borderRadius: 8, border: '1px solid #e5e7eb',
              background: '#fff', cursor: 'pointer', color: '#9ca3af',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '22px 24px' }}>{children}</div>
        </div>
      </div>,
      document.body,
    );

const EmptyState: React.FC<{ label: string }> = ({ label }) => (
  <div style={{ padding: '52px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>{label}</div>
);

const Spinner: React.FC = () => (
  <div style={{ padding: '52px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>Loading…</div>
);

const DirectionBadge: React.FC<{ direction: Direction }> = ({ direction }) => {
  const isIn = direction === 'IN';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700,
      color: isIn ? COLOR_IN : COLOR_OUT,
      background: isIn ? 'rgba(22,163,74,0.1)' : 'rgba(239,68,68,0.1)',
      borderRadius: 20, padding: '3px 10px',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: isIn ? COLOR_IN : COLOR_OUT }} />
      {direction}
    </span>
  );
};

const ConfirmDialog: React.FC<{
  title: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}> = ({ title, message, confirmLabel = 'Confirm', busy, onConfirm, onClose }) => (
  <Modal title={title} onClose={onClose} maxWidth={420}>
    <p style={{ margin: '0 0 22px', fontSize: 14, color: '#4b5563', lineHeight: 1.55 }}>{message}</p>
    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
      <button onClick={onClose} style={{
        height: 42, padding: '0 18px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff',
        color: '#4b5563', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
      }}>Cancel</button>
      <button onClick={onConfirm} disabled={busy} style={{
        height: 42, padding: '0 18px', borderRadius: 10, border: 'none', background: COLOR_OUT,
        color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        opacity: busy ? 0.6 : 1,
      }}>{busy ? 'Deleting…' : confirmLabel}</button>
    </div>
  </Modal>
);

const SummaryPill: React.FC<{ label: string; value: string; color: string; hint?: string }> = ({ label, value, color, hint }) => (
  <div style={{ ...cardStyle, padding: '10px 16px', minWidth: 150 }}>
    <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{label}</div>
    <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
    {hint && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{hint}</div>}
  </div>
);

/** Marks a USD figure that had to fall back to today's rate. */
const ApproxMark: React.FC = () => (
  <span title="Approximate — converted at today's rate rather than the rate stored on the entry." style={{ color: '#9ca3af', marginRight: 2 }}>≈</span>
);

const TypeChip: React.FC<{ type: string }> = ({ type }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', fontSize: 12, fontWeight: 600,
    color: '#4b5563', background: '#f3f4f6', borderRadius: 7, padding: '3px 9px',
  }}>{typeLabel(type)}</span>
);

// ─── Transaction form fields shared by Add and Edit ───────────────────────────

const TypeSelect: React.FC<{ value: string; extraType?: string; onChange: (t: string) => void }> = ({ value, extraType, onChange }) => (
  <div>
    <label style={labelStyle}>Type</label>
    <select value={value} onChange={e => onChange(e.target.value)} style={inputStyle}>
      {/* A legacy value outside the 7 clean types stays selectable so editing can't silently rewrite it */}
      {extraType && !ALL_TYPES.includes(extraType) && (
        <option value={extraType}>{typeLabel(extraType)} (legacy)</option>
      )}
      <optgroup label="Money in">
        {IN_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
      </optgroup>
      <optgroup label="Money out">
        {OUT_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
      </optgroup>
    </select>
  </div>
);

const DirectionPicker: React.FC<{
  direction: Direction;
  /** False for types with no preset (currently `other`), which need a manual choice. */
  hasPreset: boolean;
  onChange: (d: Direction) => void;
}> = ({ direction, hasPreset, onChange }) => (
  <div>
    <label style={labelStyle}>Direction</label>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {(['IN', 'OUT'] as Direction[]).map(d => {
        const on = direction === d;
        const c = d === 'IN' ? COLOR_IN : COLOR_OUT;
        return (
          <button key={d} type="button" onClick={() => onChange(d)} style={{
            height: 42, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
            border: on ? `1.5px solid ${c}` : '1px solid #e5e7eb',
            background: on ? (d === 'IN' ? 'rgba(22,163,74,0.08)' : 'rgba(239,68,68,0.08)') : '#fff',
            color: on ? c : '#6b7280',
          }}>{d}</button>
        );
      })}
    </div>
    <div style={{ fontSize: 11.5, color: hasPreset ? '#9ca3af' : '#b45309', marginTop: 6 }}>
      {hasPreset
        ? 'Set automatically from the type — change it only if this entry is an exception.'
        : 'This type has no preset direction — choose whether the money came in or went out.'}
    </div>
  </div>
);

const AmountField: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
  <div>
    <label style={labelStyle}>Amount (₺)</label>
    <input
      type="number" min="0" step="0.01" value={value}
      onChange={e => onChange(e.target.value)}
      placeholder="0.00" style={inputStyle}
    />
    <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 6 }}>Always entered in Turkish Lira.</div>
  </div>
);

// ─── Add transaction ──────────────────────────────────────────────────────────

const AddTransactionModal: React.FC<{
  userId: string | null;
  presetCustomerId: string | null;
  presetName: string | null;
  /** When adding from inside a car card, the booking for that car is preselected. */
  presetCarId: number | null;
  fallbackUsdRate: number | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}> = ({ userId, presetCustomerId, presetName, presetCarId, fallbackUsdRate, onClose, onSaved, onError }) => {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customerId, setCustomerId] = useState<string>(presetCustomerId ?? '');
  const [bookings, setBookings] = useState<BookingOption[]>([]);
  const [bookingId, setBookingId] = useState<number | ''>('');
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [type, setType] = useState<string>('rental');
  const [direction, setDirection] = useState<Direction>('OUT');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  // Customer picker is only needed for the global "Add transaction".
  useEffect(() => {
    if (presetCustomerId) return;
    let active = true;
    (async () => {
      const { data } = await supabase.from('customers').select('id, first_name, last_name').order('first_name');
      if (!active) return;
      setCustomers((data ?? []).map((c: { id: string; first_name: string | null; last_name: string | null }) => ({
        id: c.id,
        name: [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || 'Unknown customer',
      })));
    })();
    return () => { active = false; };
  }, [presetCustomerId]);

  // A ledger row requires a booking, which also supplies the NOT NULL car_id.
  useEffect(() => {
    if (!customerId) { setBookings([]); setBookingId(''); return; }
    let active = true;
    setLoadingBookings(true);
    (async () => {
      const { data } = await supabase
        .from('bookings')
        .select('id, booking_number, start_date, end_date, car_id, cars(plate_number)')
        .eq('customer_id', customerId)
        .order('start_date', { ascending: false });
      if (!active) return;
      const opts: BookingOption[] = ((data ?? []) as unknown as BookingQueryRow[]).map(b => ({
        id: b.id,
        booking_number: b.booking_number,
        start_date: b.start_date,
        end_date: b.end_date,
        car_id: b.car_id,
        plate_number: firstOf(b.cars)?.plate_number ?? null,
      }));
      setBookings(opts);
      // Prefer this customer's booking on the car the card belongs to; otherwise the only one.
      const onPresetCar = presetCarId != null ? opts.find(o => o.car_id === presetCarId) : undefined;
      setBookingId(onPresetCar ? onPresetCar.id : opts.length === 1 ? opts[0].id : '');
      setLoadingBookings(false);
    })();
    return () => { active = false; };
  }, [customerId, presetCarId]);

  const selectedBooking = useMemo(() => bookings.find(b => b.id === bookingId) ?? null, [bookings, bookingId]);
  const canSave = !!customerId && !!selectedBooking && Number(amount) > 0 && !!type;

  const handleTypeChange = (t: string) => {
    setType(t);
    const preset = TYPE_DIRECTION[t];
    if (preset) setDirection(preset);
  };

  const handleSave = async () => {
    if (!canSave || saving || !selectedBooking) return;
    setSaving(true);

    // Stamp the rate that was current at entry time; fall back to the rate already loaded by the page.
    const rate = (await fetchCurrentUsdRate()) ?? fallbackUsdRate;
    if (rate == null) {
      setSaving(false);
      onError('Could not read the current USD rate — nothing was saved.');
      return;
    }

    const { error } = await supabase.from('customer_accounting_ledger').insert({
      booking_id: selectedBooking.id,
      customer_id: customerId,
      car_id: selectedBooking.car_id,
      type,
      description: description.trim() || null,
      amount: Number(amount),
      direction,
      exchange_rate_at_entry: rate,
      created_at: new Date().toISOString(),
      created_by: userId,
    });
    setSaving(false);
    if (error) { onError('Could not save the transaction.'); return; }
    onSaved();
  };

  return (
    <Modal title="Add Transaction" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={labelStyle}>Customer</label>
          {presetCustomerId ? (
            <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', color: '#0f1117' }}>{presetName || 'Customer'}</div>
          ) : (
            <select value={customerId} onChange={e => setCustomerId(e.target.value)} style={inputStyle}>
              <option value="">Select a customer…</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>

        <div>
          <label style={labelStyle}>Booking</label>
          <select
            value={bookingId}
            onChange={e => setBookingId(e.target.value ? Number(e.target.value) : '')}
            style={inputStyle}
            disabled={!customerId || loadingBookings || bookings.length === 0}
          >
            <option value="">
              {!customerId ? 'Select a customer first…'
                : loadingBookings ? 'Loading bookings…'
                : bookings.length === 0 ? 'No bookings for this customer'
                : 'Select a booking…'}
            </option>
            {bookings.map(b => <option key={b.id} value={b.id}>{bookingLabel(b)}</option>)}
          </select>
          {customerId && !loadingBookings && bookings.length === 0 && (
            <div style={{ fontSize: 12, color: COLOR_OUT, marginTop: 6 }}>
              This customer has no bookings — a transaction must be linked to one.
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <TypeSelect value={type} onChange={handleTypeChange} />
          <AmountField value={amount} onChange={setAmount} />
        </div>

        <DirectionPicker direction={direction} hasPreset={TYPE_DIRECTION[type] !== undefined} onChange={setDirection} />

        <div>
          <label style={labelStyle}>Description (optional)</label>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Add a description…" style={inputStyle} />
        </div>

        <button
          type="button"
          style={{ ...primaryBtn, width: '100%', opacity: canSave && !saving ? 1 : 0.55 }}
          disabled={!canSave || saving}
          onClick={handleSave}
        >
          {saving ? 'Saving…' : 'Save Transaction'}
        </button>
      </div>
    </Modal>
  );
};

// ─── Edit transaction ─────────────────────────────────────────────────────────

const EditTransactionModal: React.FC<{
  row: LedgerRow;
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}> = ({ row, onClose, onSaved, onError }) => {
  const [type, setType] = useState(row.type);
  const [direction, setDirection] = useState<Direction>(row.direction);
  const [description, setDescription] = useState(row.description ?? '');
  const [amount, setAmount] = useState(String(row.amount));
  // Prefilled with the stored rate, so leaving it untouched preserves the original.
  const [rate, setRate] = useState(row.exchange_rate_at_entry != null ? String(row.exchange_rate_at_entry) : '');
  const [saving, setSaving] = useState(false);

  const canSave = Number(amount) > 0 && !!type;
  const rateChanged = rate !== (row.exchange_rate_at_entry != null ? String(row.exchange_rate_at_entry) : '');

  const handleTypeChange = (t: string) => {
    setType(t);
    const preset = TYPE_DIRECTION[t];
    if (preset) setDirection(preset);
  };

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    const parsedRate = rate.trim() === '' ? null : Number(rate);
    if (parsedRate != null && (!isFinite(parsedRate) || parsedRate <= 0)) {
      setSaving(false);
      onError('Exchange rate must be a positive number.');
      return;
    }
    const { error } = await supabase.from('customer_accounting_ledger').update({
      type,
      direction,
      description: description.trim() || null,
      amount: Number(amount),
      exchange_rate_at_entry: parsedRate,
    }).eq('id', row.id);
    setSaving(false);
    if (error) { onError('Could not update the transaction.'); return; }
    onSaved();
  };

  return (
    <Modal title="Edit Transaction" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <TypeSelect value={type} extraType={row.type} onChange={handleTypeChange} />
          <AmountField value={amount} onChange={setAmount} />
        </div>

        <DirectionPicker direction={direction} hasPreset={TYPE_DIRECTION[type] !== undefined} onChange={setDirection} />

        <div>
          <label style={labelStyle}>Description (optional)</label>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Add a description…" style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>Exchange rate at entry (USD → ₺)</label>
          <input
            type="number" min="0" step="0.0001" value={rate}
            onChange={e => setRate(e.target.value)}
            placeholder="Not recorded" style={inputStyle}
          />
          <div style={{ fontSize: 11.5, color: rateChanged ? '#b45309' : '#9ca3af', marginTop: 6, lineHeight: 1.5 }}>
            {rateChanged
              ? 'You are overwriting the rate captured when this entry was created.'
              : 'Kept from when this entry was created — editing the amount does not re-stamp it.'}
          </div>
        </div>

        <button
          type="button"
          style={{ ...primaryBtn, width: '100%', opacity: canSave && !saving ? 1 : 0.55 }}
          disabled={!canSave || saving}
          onClick={handleSave}
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </Modal>
  );
};

// ─── Level 3 — one customer's transaction sheet for one car ───────────────────

const TransactionSheet: React.FC<{
  entry: CustomerOnCar;
  currency: Currency;
  rates: RateRow[];
  fallbackUsdRate: number | null;
  onEdit: (row: LedgerRow) => void;
  onDelete: (row: LedgerRow) => void;
}> = ({ entry, currency, rates, fallbackUsdRate, onEdit, onDelete }) => {
  // Oldest first so the running balance reads top-to-bottom.
  const chronological = useMemo(() => {
    const sorted = [...entry.rows].sort((a, b) => {
      const ta = a.created_at ? Date.parse(a.created_at) : 0;
      const tb = b.created_at ? Date.parse(b.created_at) : 0;
      return ta - tb;
    });
    let running = 0;
    return sorted.map(row => {
      const { value, approx } = convertEntry(row, currency, rates, fallbackUsdRate);
      running += row.direction === 'IN' ? value : -value;
      return { row, value, approx, running };
    });
  }, [entry.rows, currency, rates, fallbackUsdRate]);

  return (
    <div style={{ overflowX: 'auto', borderTop: '1px solid #f0f0f0', background: '#fcfcfd' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
        <thead>
          <tr>
            <Th>Date</Th>
            <Th>Type</Th>
            <Th>Direction</Th>
            <Th>Description</Th>
            <Th align="right">Amount</Th>
            <Th align="right">Balance</Th>
            <Th align="right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {chronological.map(({ row, value, approx, running }) => (
            <tr key={row.id}>
              <td style={tdStyle}>{formatDateDisplay(row.created_at)}</td>
              <td style={tdStyle}><TypeChip type={row.type} /></td>
              <td style={tdStyle}><DirectionBadge direction={row.direction} /></td>
              <td style={{ ...tdStyle, whiteSpace: 'normal', color: '#6b7280', maxWidth: 260 }}>{row.description || '—'}</td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: row.direction === 'IN' ? COLOR_IN : COLOR_OUT }}>
                {approx && <ApproxMark />}
                {row.direction === 'IN' ? '+' : '−'}{formatMoney(value, currency)}
              </td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: balanceColor(running) }}>
                {formatSigned(running, currency)}
              </td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>
                <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => onEdit(row)} title="Edit" style={rowActionBtn}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button type="button" onClick={() => onDelete(row)} title="Delete" style={{ ...rowActionBtn, color: COLOR_OUT }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ─── Level 2 — a customer row inside a car card ───────────────────────────────

const CustomerRow: React.FC<{
  entry: CustomerOnCar;
  currency: Currency;
  rates: RateRow[];
  fallbackUsdRate: number | null;
  open: boolean;
  onToggle: () => void;
  onAdd: () => void;
  onEdit: (row: LedgerRow) => void;
  onDelete: (row: LedgerRow) => void;
  onError: (message: string) => void;
}> = ({ entry, currency, rates, fallbackUsdRate, open, onToggle, onAdd, onEdit, onDelete, onError }) => {
  const [printing, setPrinting] = useState(false);

  /**
   * The invoice lib resolves customer and vehicle itself and applies its own ADMIN-matching
   * sign convention. It expects entries newest-first, which is how `entry.rows` is built —
   * and because those rows are already scoped to this car, the invoice covers this car only.
   */
  const handlePrintInvoice = async () => {
    if (printing) return;
    setPrinting(true);
    await printCustomerInvoice(
      entry.customerId,
      entry.rows.map(row => ({
        created_at:  row.created_at,
        type:        row.type,
        description: row.description,
        direction:   row.direction,
        amount:      row.amount,
        car_id:      row.car_id,
      })),
      { onError },
    );
    setPrinting(false);
  };

  return (
    <div style={{ borderTop: '1px solid #f0f0f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', flexWrap: 'wrap' }}>
        <div
          role="button"
          onClick={onToggle}
          style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flex: 1, minWidth: 180 }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 140ms', color: '#9ca3af', flexShrink: 0 }}>
            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              {entry.live && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 800,
                  color: COLOR_IN, background: 'rgba(22,163,74,0.12)', borderRadius: 20, padding: '2px 8px',
                  textTransform: 'uppercase', letterSpacing: '0.5px',
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: COLOR_IN }} />
                  Live
                </span>
              )}
              <span style={{ fontSize: 14.5, fontWeight: 600, color: '#0f1117' }}>{entry.name}</span>
            </div>
            <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 2 }}>
              {entry.rows.length} {entry.rows.length === 1 ? 'entry' : 'entries'} · In {formatMoney(entry.totalIn, currency)} · Out {formatMoney(entry.totalOut, currency)}
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'right', minWidth: 110 }}>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: balanceColor(entry.balance) }}>
            {entry.approx && <ApproxMark />}
            {formatSigned(entry.balance, currency)}
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>
            {entry.balance < -0.005 ? 'Owes us' : entry.balance > 0.005 ? 'In credit' : 'Settled'}
          </div>
        </div>

        <div style={{ display: 'inline-flex', gap: 6 }}>
          <button
            type="button" onClick={onAdd} title="Add a transaction for this customer on this car"
            style={{
              height: 32, padding: '0 11px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 12.5, fontWeight: 600, color: '#2e8fd4', background: 'rgba(75,166,234,0.08)',
              border: '1px solid rgba(75,166,234,0.35)', display: 'inline-flex', alignItems: 'center', gap: 5,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
            Add transaction
          </button>
          <button
            type="button" onClick={handlePrintInvoice} disabled={printing}
            title="Print an invoice for this customer on this car"
            style={{
              height: 32, padding: '0 11px', borderRadius: 9, cursor: printing ? 'wait' : 'pointer',
              fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#4b5563', background: '#fff',
              border: '1px solid #e5e7eb', display: 'inline-flex', alignItems: 'center', gap: 5,
              opacity: printing ? 0.6 : 1,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {printing ? 'Preparing…' : 'Print invoice'}
          </button>
        </div>
      </div>

      {open && (
        <TransactionSheet
          entry={entry}
          currency={currency}
          rates={rates}
          fallbackUsdRate={fallbackUsdRate}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}
    </div>
  );
};

// ─── Level 1 — a car card ─────────────────────────────────────────────────────

const CarCard: React.FC<{
  car: CarGroup;
  currency: Currency;
  rates: RateRow[];
  fallbackUsdRate: number | null;
  isOpen: (customerId: string) => boolean;
  onToggle: (customerId: string) => void;
  onAdd: (customer: CustomerOnCar) => void;
  onEdit: (row: LedgerRow) => void;
  onDelete: (row: LedgerRow) => void;
  onError: (message: string) => void;
}> = ({ car, currency, rates, fallbackUsdRate, isOpen, onToggle, onAdd, onEdit, onDelete, onError }) => (
  <div style={{ ...cardStyle, overflow: 'hidden' }}>
    {/* Car header */}
    <div style={{ padding: '15px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9, background: '#f3f4f6', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280',
        }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M5 17H3a2 2 0 01-2-2V7a2 2 0 012-2h11a2 2 0 012 2v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="9" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
            <circle cx="12" cy="16" r="1.2" fill="currentColor" />
            <circle cx="20" cy="16" r="1.2" fill="currentColor" />
          </svg>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#0f1117', letterSpacing: '-0.2px' }}>{car.plate}</span>
            {car.hasLive && (
              <span style={{
                fontSize: 10, fontWeight: 800, color: COLOR_IN, background: 'rgba(22,163,74,0.12)',
                borderRadius: 20, padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '0.5px',
              }}>
                On rent
              </span>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 2 }}>
            {car.customers.length} {car.customers.length === 1 ? 'customer' : 'customers'}
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
          Car balance
        </div>
        <div style={{ fontSize: 19, fontWeight: 800, color: balanceColor(car.balance) }}>
          {car.approx && <ApproxMark />}
          {formatSigned(car.balance, currency)}
        </div>
      </div>
    </div>

    {/* Customer rows */}
    {car.customers.map(entry => (
      <CustomerRow
        key={entry.customerId}
        entry={entry}
        currency={currency}
        rates={rates}
        fallbackUsdRate={fallbackUsdRate}
        open={isOpen(entry.customerId)}
        onToggle={() => onToggle(entry.customerId)}
        onAdd={() => onAdd(entry)}
        onEdit={onEdit}
        onDelete={onDelete}
        onError={onError}
      />
    ))}
  </div>
);

// ─── Page ─────────────────────────────────────────────────────────────────────

const CustomerWalletsPage: React.FC = () => {
  const { currency, rates } = useCurrency();

  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [usdRate, setUsdRate] = useState<number | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  /** `${car_id}:${customer_id}` for every currently-active booking. */
  const [liveKeys, setLiveKeys] = useState<Set<string>>(new Set());

  const [tab, setTab] = useState<RentalTab>('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [addFor, setAddFor] = useState<{ customerId: string | null; name: string | null; carId: number | null } | null>(null);
  const [editRow, setEditRow] = useState<LedgerRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LedgerRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const notify = useCallback((t: ToastState) => {
    setToast(t);
    if (t) window.setTimeout(() => setToast(null), 2600);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('customer_accounting_ledger')
      .select('id, booking_id, customer_id, car_id, type, description, amount, direction, exchange_rate_at_entry, created_at, customers(first_name, last_name), cars(plate_number)')
      .order('created_at', { ascending: false });
    setLoading(false);
    if (error) { setLoadError(error.message); return; }
    setLoadError(null);
    setRows((data ?? []) as unknown as LedgerRow[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let active = true;
    fetchCurrentUsdRate().then(rate => { if (active) setUsdRate(rate); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => { if (active) setUserId(data.user?.id ?? null); });
    return () => { active = false; };
  }, []);

  // A rental is live when a confirmed booking spans today — matched on car AND customer,
  // so a customer is only "live" on the specific car they currently hold.
  useEffect(() => {
    let active = true;
    const today = todayStr();
    supabase
      .from('bookings')
      .select('car_id, customer_id')
      .eq('status', 'confirmed')
      .lte('start_date', today)
      .gte('end_date', today)
      .then(({ data }) => {
        if (!active || !data) return;
        const keys = new Set<string>();
        for (const b of data as { car_id: number | null; customer_id: string | null }[]) {
          if (b.car_id != null && b.customer_id) keys.add(`${b.car_id}:${b.customer_id}`);
        }
        setLiveKeys(keys);
      });
    return () => { active = false; };
  }, []);

  // Group: car → customer → entries. Balances are scoped to the (car, customer) pair.
  const cars = useMemo<CarGroup[]>(() => {
    const byCar = new Map<string, CarGroup>();

    for (const row of rows) {
      const plate = firstOf(row.cars)?.plate_number ?? null;
      const linked = row.car_id != null && !!plate;
      const key = linked ? String(row.car_id) : UNLINKED_KEY;

      let car = byCar.get(key);
      if (!car) {
        car = {
          key,
          carId: linked ? row.car_id : null,
          plate: linked ? plate! : 'Unlinked to a car',
          customers: [], totalIn: 0, totalOut: 0, balance: 0, approx: false, hasLive: false,
        };
        byCar.set(key, car);
      }

      let entry = car.customers.find(c => c.customerId === row.customer_id);
      if (!entry) {
        entry = {
          customerId: row.customer_id,
          name: customerNameOf(row),
          rows: [], totalIn: 0, totalOut: 0, balance: 0, approx: false,
          live: linked && liveKeys.has(`${row.car_id}:${row.customer_id}`),
        };
        car.customers.push(entry);
      }

      entry.rows.push(row);
      const { value, approx } = convertEntry(row, currency, rates, usdRate);
      if (row.direction === 'IN') entry.totalIn += value; else entry.totalOut += value;
      if (approx) entry.approx = true;
    }

    const list = Array.from(byCar.values());
    for (const car of list) {
      for (const entry of car.customers) {
        entry.balance = entry.totalIn - entry.totalOut;
        car.totalIn += entry.totalIn;
        car.totalOut += entry.totalOut;
        if (entry.approx) car.approx = true;
        if (entry.live) car.hasLive = true;
      }
      car.balance = car.totalIn - car.totalOut;
      // Live customers first, then biggest debtor.
      car.customers.sort((a, b) => Number(b.live) - Number(a.live) || a.balance - b.balance || a.name.localeCompare(b.name));
    }

    // Live cars first, then by plate; the unlinked bucket always sits last.
    return list.sort((a, b) => {
      if (a.key === UNLINKED_KEY) return 1;
      if (b.key === UNLINKED_KEY) return -1;
      return Number(b.hasLive) - Number(a.hasLive) || a.plate.localeCompare(b.plate);
    });
  }, [rows, currency, rates, usdRate, liveKeys]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cars.filter(car => {
      if (tab === 'current' && !car.hasLive) return false;
      if (tab === 'ended' && car.hasLive) return false;
      if (!q) return true;
      return car.plate.toLowerCase().includes(q)
        || car.customers.some(c => c.name.toLowerCase().includes(q));
    });
  }, [cars, search, tab]);

  // Pills reflect what is on screen, and count per (customer, car) since that is the balance unit.
  const totals = useMemo(() => {
    let owed = 0, credit = 0, debtors = 0, inCredit = 0;
    for (const car of filtered) {
      for (const entry of car.customers) {
        if (entry.balance < -0.005) { owed += -entry.balance; debtors++; }
        else if (entry.balance > 0.005) { credit += entry.balance; inCredit++; }
      }
    }
    return { owed, credit, debtors, inCredit, net: credit - owed };
  }, [filtered]);

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    const { error } = await supabase.from('customer_accounting_ledger').delete().eq('id', deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
    if (error) { notify({ message: 'Could not delete the transaction', type: 'error' }); return; }
    notify({ message: 'Transaction deleted', type: 'success' });
    await load();
  };

  const TABS: { key: RentalTab; label: string }[] = [
    { key: 'all',     label: 'All' },
    { key: 'current', label: 'Current rentals' },
    { key: 'ended',   label: 'Ended rentals' },
  ];

  return (
    <div style={{ padding: '24px 32px', background: '#fafafa', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.6px', color: '#0f1117' }}>Customer Wallets</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13.5, color: '#9ca3af' }}>
          Balances per car and customer — charges owed against payments and deposits received.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: '1px solid #ebebeb', flexWrap: 'wrap' }}>
        {TABS.map(t => {
          const on = tab === t.key;
          return (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} style={{
              padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 14, fontWeight: on ? 700 : 500, color: on ? '#2e8fd4' : '#6b7280',
              borderBottom: on ? '2px solid #4ba6ea' : '2px solid transparent', marginBottom: -1,
            }}>{t.label}</button>
          );
        })}
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <SummaryPill
          label="Owed to us" color={COLOR_OUT}
          value={formatMoney(totals.owed, currency)}
          hint={`${totals.debtors} ${totals.debtors === 1 ? 'balance' : 'balances'}`}
        />
        <SummaryPill
          label="In credit" color={COLOR_IN}
          value={formatMoney(totals.credit, currency)}
          hint={`${totals.inCredit} ${totals.inCredit === 1 ? 'balance' : 'balances'}`}
        />
        <SummaryPill
          label="Net position" color={balanceColor(totals.net)}
          value={formatSigned(totals.net, currency)}
          hint={`${filtered.length} ${filtered.length === 1 ? 'car' : 'cars'}`}
        />
      </div>

      {/* Search + add */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search plate or customer…"
          style={{ ...inputStyle, maxWidth: 320 }}
        />
        <div style={{ flex: 1 }} />
        <button type="button" style={primaryBtn} onClick={() => setAddFor({ customerId: null, name: null, carId: null })}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          Add Transaction
        </button>
      </div>

      {loadError ? (
        <div style={{ ...cardStyle, padding: '16px 18px', color: COLOR_OUT, fontSize: 13.5 }}>
          Could not load the ledger: {loadError}
        </div>
      ) : loading ? (
        <div style={cardStyle}><Spinner /></div>
      ) : filtered.length === 0 ? (
        <div style={cardStyle}>
          <EmptyState label={
            cars.length === 0
              ? 'No customer ledger entries yet.'
              : 'No cars match this search or tab.'
          } />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(car => (
            <CarCard
              key={car.key}
              car={car}
              currency={currency}
              rates={rates}
              fallbackUsdRate={usdRate}
              isOpen={customerId => !!expanded[`${car.key}:${customerId}`]}
              onToggle={customerId => setExpanded(prev => ({
                ...prev,
                [`${car.key}:${customerId}`]: !prev[`${car.key}:${customerId}`],
              }))}
              onAdd={entry => setAddFor({ customerId: entry.customerId, name: entry.name, carId: car.carId })}
              onEdit={setEditRow}
              onDelete={setDeleteTarget}
              onError={message => notify({ message, type: 'error' })}
            />
          ))}
        </div>
      )}

      {addFor && (
        <AddTransactionModal
          userId={userId}
          presetCustomerId={addFor.customerId}
          presetName={addFor.name}
          presetCarId={addFor.carId}
          fallbackUsdRate={usdRate}
          onClose={() => setAddFor(null)}
          onSaved={async () => { setAddFor(null); notify({ message: 'Transaction added', type: 'success' }); await load(); }}
          onError={message => notify({ message, type: 'error' })}
        />
      )}

      {editRow && (
        <EditTransactionModal
          row={editRow}
          onClose={() => setEditRow(null)}
          onSaved={async () => { setEditRow(null); notify({ message: 'Transaction updated', type: 'success' }); await load(); }}
          onError={message => notify({ message, type: 'error' })}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete transaction?"
          message="This ledger entry will be permanently removed and the balance will be recalculated. This cannot be undone."
          confirmLabel="Delete"
          busy={deleting}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      <Toast toast={toast} />
    </div>
  );
};

export default CustomerWalletsPage;
