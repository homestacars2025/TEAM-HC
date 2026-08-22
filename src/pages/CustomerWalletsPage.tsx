import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  /** Display + ordering only, resolved from `model_group`. Never affects money. */
  modelName: string | null;
  imageUrl: string | null;
}

const UNLINKED_KEY = '__unlinked__';

/** Read-only presentation data for a car, keyed by car id. */
interface CarMeta {
  modelName: string | null;
  imageUrl: string | null;
}

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

// ─── Reusable bits ────────────────────────────────────────────────────────────

const Toast: React.FC<{ toast: ToastState }> = ({ toast }) => {
  if (!toast) return null;
  return ReactDOM.createPortal(
    <div style={{
      position: 'fixed', bottom: 28, insetInlineEnd: 28, zIndex: 2000,
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

// ─── Visual layer ─────────────────────────────────────────────────────────────
//
// Hover, focus-visible, media queries and reduced-motion cannot be expressed with the
// inline-style approach used elsewhere in the app, so this page scopes its own stylesheet
// (the same technique Layout.tsx uses for its keyframes). The token block is shared by the
// page root and the modal overlay, since the modal is portalled outside `.cw-page`.

const CW_STYLES = `
.cw-page, .cw-overlay {
  --cw-bg:#F5F6F8; --cw-card:#FFFFFF;
  --cw-ink:#0B0F19; --cw-muted:#667085;
  --cw-pos:#12B76A; --cw-pos-bg:#ECFDF3;
  --cw-neg:#F04438; --cw-neg-bg:#FEF3F2;
  --cw-neu:#667085; --cw-neu-bg:#F2F4F7;
  --cw-accent:#3B6EF5; --cw-accent-bg:#EFF4FF;
  --cw-border:#EAECF0;
  --cw-shadow:0 1px 2px rgba(16,24,40,.04), 0 8px 24px rgba(16,24,40,.06);
  --cw-shadow-lift:0 2px 4px rgba(16,24,40,.05), 0 14px 34px rgba(16,24,40,.09);
}
.cw-page { background:var(--cw-bg); min-height:100%; padding:30px 32px 56px; color:var(--cw-ink); }
.cw-page *:focus-visible, .cw-overlay *:focus-visible { outline:2px solid var(--cw-accent); outline-offset:2px; border-radius:6px; }
.cw-num { font-variant-numeric:tabular-nums; font-feature-settings:"tnum" 1; }

/* ── Header ── */
.cw-head { margin-bottom:22px; }
.cw-h1 { margin:0; font-size:28px; font-weight:800; letter-spacing:-.8px; color:var(--cw-ink); }
.cw-sub { margin:5px 0 0; font-size:14px; color:var(--cw-muted); }

/* ── Stat cards ── */
.cw-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-bottom:22px; }
.cw-stat { background:var(--cw-card); border-radius:20px; padding:20px 22px; box-shadow:var(--cw-shadow); }
.cw-stat-label { font-size:11px; font-weight:700; letter-spacing:.7px; text-transform:uppercase; color:var(--cw-muted); }
.cw-stat-value { margin-top:8px; font-size:30px; font-weight:700; letter-spacing:-1px; line-height:1.1; }
.cw-stat-hint { margin-top:4px; font-size:12.5px; color:var(--cw-muted); }

/* ── Toolbar ── */
.cw-toolbar { display:flex; align-items:center; gap:14px; flex-wrap:wrap; margin-bottom:22px; }
.cw-seg { display:inline-flex; background:var(--cw-neu-bg); border-radius:999px; padding:4px; gap:2px; }
.cw-seg-btn {
  appearance:none; border:none; background:none; cursor:pointer; font-family:inherit;
  min-height:36px; padding:0 16px; border-radius:999px; font-size:13.5px; font-weight:600;
  color:var(--cw-muted); transition:background 160ms ease, color 160ms ease, box-shadow 160ms ease;
}
.cw-seg-btn:hover { color:var(--cw-ink); }
.cw-seg-btn.is-on { background:var(--cw-card); color:var(--cw-ink); box-shadow:0 1px 3px rgba(16,24,40,.10); }
.cw-search { position:relative; flex:1; min-width:200px; max-width:340px; }
.cw-search svg { position:absolute; top:50%; left:14px; transform:translateY(-50%); color:var(--cw-muted); pointer-events:none; }
.cw-search input {
  width:100%; min-height:44px; padding:0 16px 0 40px; border-radius:999px;
  border:1px solid var(--cw-border); background:var(--cw-card); color:var(--cw-ink);
  font-size:14px; font-family:inherit; outline:none;
  box-shadow:inset 0 1px 2px rgba(16,24,40,.04); transition:border-color 160ms ease, box-shadow 160ms ease;
}
.cw-search input::placeholder { color:var(--cw-muted); }
.cw-search input:focus { border-color:var(--cw-accent); box-shadow:0 0 0 4px var(--cw-accent-bg); }
.cw-btn-primary {
  appearance:none; border:none; cursor:pointer; font-family:inherit;
  min-height:44px; padding:0 18px; border-radius:12px; background:var(--cw-accent); color:#fff;
  font-size:14px; font-weight:600; display:inline-flex; align-items:center; gap:8px;
  box-shadow:0 1px 2px rgba(16,24,40,.10), 0 6px 16px rgba(59,110,245,.24);
  transition:transform 160ms ease, box-shadow 160ms ease, filter 160ms ease;
}
.cw-btn-primary:hover { filter:brightness(1.05); box-shadow:0 2px 4px rgba(16,24,40,.12), 0 10px 22px rgba(59,110,245,.30); }
.cw-btn-primary:active { transform:scale(.98); }

/* ── Car grid ── */
.cw-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(300px,1fr)); gap:18px; }
.cw-tile {
  appearance:none; border:none; text-align:left; font-family:inherit; color:inherit; cursor:pointer;
  background:var(--cw-card); border-radius:20px; box-shadow:var(--cw-shadow); padding:18px;
  display:flex; flex-direction:column; gap:12px;
  transition:box-shadow 160ms ease, transform 160ms ease;
}
.cw-tile:hover { box-shadow:var(--cw-shadow-lift); transform:translateY(-2px); }
.cw-tile:active { transform:translateY(0); }
/* Plate is the first hero — the photo is a small supporting accent beside it. */
/* Centred so the tall thumb and the single-line plate share a visual axis. */
.cw-tile-top { display:flex; align-items:center; justify-content:space-between; gap:14px; }
.cw-tile-plate {
  font-size:23px; font-weight:800; letter-spacing:-.7px; line-height:1.15; color:var(--cw-ink);
  font-variant-numeric:tabular-nums; font-feature-settings:"tnum" 1; min-width:0; word-break:break-word;
}
.cw-thumb {
  width:56px; height:56px; border-radius:12px; overflow:hidden; flex-shrink:0;
  background:var(--cw-neu-bg); color:#B4BCC8;
  display:flex; align-items:center; justify-content:center;
}
.cw-thumb img { width:100%; height:100%; object-fit:cover; display:block; }
.cw-tile-meta { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.cw-rule { display:block; height:1px; background:var(--cw-border); }
/* Balance is the second hero — it visually rivals the plate. */
.cw-tile-bal { display:flex; align-items:flex-end; justify-content:space-between; gap:12px; }
.cw-tile-bal-value {
  display:block; margin-top:3px; font-size:21px; font-weight:700; letter-spacing:-.5px; line-height:1.15;
}
.cw-view { display:inline-flex; align-items:center; gap:4px; font-size:12.5px; font-weight:600; color:var(--cw-accent); }
.cw-tile:hover .cw-view svg { transform:translateX(2px); }
.cw-view svg { transition:transform 160ms ease; }

/* ── Shared identity bits ── */
.cw-plate-line { display:flex; align-items:center; gap:9px; flex-wrap:wrap; }
.cw-plate { font-size:18px; font-weight:750; letter-spacing:-.3px; color:var(--cw-ink); }
.cw-caption { margin-top:3px; font-size:12.5px; color:var(--cw-muted); }
.cw-pill {
  display:inline-flex; align-items:center; gap:5px; border-radius:999px; padding:3px 10px;
  font-size:11px; font-weight:700; letter-spacing:.3px;
}
.cw-pill i { width:6px; height:6px; border-radius:50%; background:currentColor; display:block; }
.cw-pill--live { color:var(--cw-pos); background:var(--cw-pos-bg); }
.cw-pill--idle { color:var(--cw-neu); background:var(--cw-neu-bg); }
.cw-bal-block { text-align:right; flex-shrink:0; }
.cw-bal-label { font-size:11px; font-weight:700; letter-spacing:.7px; text-transform:uppercase; color:var(--cw-muted); }
.cw-bal-lg { margin-top:3px; font-size:22px; font-weight:750; letter-spacing:-.6px; line-height:1.15; }
.cw-bal-md { font-size:18px; font-weight:700; letter-spacing:-.4px; }

/* ── Modal ── */
.cw-overlay {
  position:fixed; inset:0; z-index:1200; background:rgba(11,15,25,.5); backdrop-filter:blur(5px);
  display:flex; align-items:center; justify-content:center; padding:24px; animation:cwFade 160ms ease;
}
.cw-modal {
  background:var(--cw-card); border-radius:22px; width:100%; max-width:820px; max-height:88vh;
  display:flex; flex-direction:column; box-shadow:0 28px 90px rgba(11,15,25,.28);
  animation:cwRise 200ms cubic-bezier(.22,1,.36,1); color:var(--cw-ink);
}
.cw-modal-head { display:flex; align-items:center; gap:14px; padding:18px 20px; border-bottom:1px solid var(--cw-border); flex-shrink:0; }
.cw-modal-thumb {
  width:76px; height:52px; border-radius:13px; overflow:hidden; flex-shrink:0;
  background:var(--cw-neu-bg); display:flex; align-items:center; justify-content:center; color:#B4BCC8;
}
.cw-modal-thumb img { width:100%; height:100%; object-fit:cover; display:block; }
.cw-modal-close {
  appearance:none; width:36px; height:36px; border-radius:10px; border:1px solid var(--cw-border);
  background:var(--cw-card); color:var(--cw-muted); cursor:pointer; flex-shrink:0;
  display:inline-flex; align-items:center; justify-content:center; transition:color 160ms ease, border-color 160ms ease;
}
.cw-modal-close:hover { color:var(--cw-ink); border-color:#DDE1E8; }
.cw-modal-body { padding:16px 20px 20px; overflow-y:auto; }
@keyframes cwFade { from { opacity:0 } to { opacity:1 } }
@keyframes cwRise { from { opacity:0; transform:translateY(14px) scale(.985) } to { opacity:1; transform:none } }

/* ── Customer row ── */
.cw-rows { display:flex; flex-direction:column; gap:10px; }
.cw-crow { border:1px solid var(--cw-border); background:#FAFBFC; border-radius:14px; overflow:hidden; transition:border-color 160ms ease; }
.cw-crow:hover { border-color:#DDE1E8; }
.cw-crow-head { display:flex; align-items:center; gap:14px; padding:14px 16px; flex-wrap:wrap; }
.cw-disclose {
  appearance:none; border:none; background:none; cursor:pointer; font-family:inherit; text-align:left;
  display:flex; align-items:center; gap:11px; flex:1; min-width:180px; min-height:44px; padding:0; color:inherit;
}
.cw-chev { color:var(--cw-muted); flex-shrink:0; transition:transform 200ms ease; }
.cw-crow.is-open .cw-chev { transform:rotate(90deg); }
.cw-cust-name { font-size:15px; font-weight:600; color:var(--cw-ink); }
.cw-row-actions { display:inline-flex; gap:8px; flex-shrink:0; }
.cw-btn-soft, .cw-btn-ghost {
  appearance:none; cursor:pointer; font-family:inherit; min-height:40px; padding:0 13px;
  border-radius:10px; font-size:13px; font-weight:600; display:inline-flex; align-items:center; gap:6px;
  transition:transform 160ms ease, background 160ms ease, border-color 160ms ease, color 160ms ease;
}
.cw-btn-soft { border:1px solid transparent; background:var(--cw-accent-bg); color:var(--cw-accent); }
.cw-btn-soft:hover { background:#E4ECFF; }
.cw-btn-ghost { border:1px solid var(--cw-border); background:var(--cw-card); color:var(--cw-muted); }
.cw-btn-ghost:hover { border-color:#DDE1E8; color:var(--cw-ink); }
.cw-btn-soft:active, .cw-btn-ghost:active { transform:scale(.98); }
.cw-btn-ghost[disabled] { opacity:.6; cursor:wait; }

/* ── Transaction sheet (animated disclosure) ── */
.cw-sheet { display:grid; grid-template-rows:0fr; opacity:0; transition:grid-template-rows 200ms ease, opacity 200ms ease; }
.cw-crow.is-open .cw-sheet { grid-template-rows:1fr; opacity:1; }
.cw-sheet-inner { overflow:hidden; min-height:0; visibility:hidden; transition:visibility 0s 200ms; }
.cw-crow.is-open .cw-sheet-inner { visibility:visible; transition:visibility 0s 0s; }
.cw-sheet-scroll { overflow-x:auto; border-top:1px solid var(--cw-border); background:var(--cw-card); padding-top:6px; }
.cw-tx { width:100%; border-collapse:collapse; min-width:620px; }
.cw-tx th {
  padding:12px 16px 10px; font-size:10.5px; font-weight:700; letter-spacing:.6px; text-transform:uppercase;
  color:var(--cw-muted); text-align:left; white-space:nowrap; border-bottom:1px solid var(--cw-border);
}
.cw-tx th.r, .cw-tx td.r { text-align:right; }
.cw-tx td { padding:12px 16px; font-size:13.5px; color:var(--cw-ink); border-bottom:1px solid #F4F5F7; white-space:nowrap; }
.cw-tx tr:last-child td { border-bottom:none; }
.cw-tx tbody tr { transition:background 160ms ease; }
.cw-tx tbody tr:hover { background:#FAFBFC; }
.cw-tx .cw-date { color:var(--cw-muted); }
.cw-tx .cw-desc { white-space:normal; color:var(--cw-muted); max-width:260px; }
.cw-chip {
  display:inline-flex; align-items:center; gap:6px; border-radius:999px; padding:4px 10px;
  background:var(--cw-neu-bg); color:#475467; font-size:12px; font-weight:600;
}
.cw-chip i { width:6px; height:6px; border-radius:50%; display:block; }
.cw-tx-actions { display:inline-flex; gap:6px; opacity:0; transition:opacity 160ms ease; }
.cw-tx tbody tr:hover .cw-tx-actions, .cw-tx tbody tr:focus-within .cw-tx-actions { opacity:1; }
.cw-icon-btn {
  appearance:none; width:36px; height:36px; border-radius:9px; border:1px solid var(--cw-border);
  background:var(--cw-card); color:var(--cw-muted); cursor:pointer;
  display:inline-flex; align-items:center; justify-content:center; transition:color 160ms ease, border-color 160ms ease;
}
.cw-icon-btn:hover { color:var(--cw-ink); border-color:#DDE1E8; }
.cw-icon-btn.danger:hover { color:var(--cw-neg); border-color:#FDA29B; }

/* ── Misc ── */
.cw-approx {
  display:inline-block; font-size:10px; font-weight:700; color:var(--cw-muted);
  background:var(--cw-neu-bg); border-radius:999px; padding:1px 5px; margin-right:5px;
  vertical-align:2px; cursor:help;
}
.cw-empty { background:var(--cw-card); border-radius:20px; box-shadow:var(--cw-shadow); padding:64px 24px; text-align:center; }
.cw-empty-title { font-size:15px; font-weight:650; color:var(--cw-ink); }
.cw-empty-sub { margin-top:6px; font-size:13.5px; color:var(--cw-muted); }
.cw-pos { color:var(--cw-pos); } .cw-neg { color:var(--cw-neg); } .cw-neu { color:var(--cw-neu); }

/* ── Mobile ── */
@media (max-width:760px) {
  .cw-page { padding:22px 16px 44px; }
  .cw-h1 { font-size:24px; }
  .cw-stats { grid-template-columns:1fr; gap:12px; }
  .cw-stat { padding:16px 18px; }
  .cw-stat-value { font-size:26px; }
  .cw-search { max-width:none; flex-basis:100%; }
  .cw-btn-primary { width:100%; justify-content:center; }
  .cw-grid { grid-template-columns:1fr; gap:14px; }
  .cw-overlay { padding:0; align-items:flex-end; }
  .cw-modal { max-width:none; max-height:100vh; height:100vh; border-radius:0; }
  .cw-modal-head { padding:16px; }
  .cw-modal-thumb { width:58px; height:42px; }
  .cw-modal-body { padding:14px 14px 20px; }
  .cw-crow-head { flex-direction:column; align-items:stretch; gap:12px; }
  .cw-row-actions { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .cw-btn-soft, .cw-btn-ghost { justify-content:center; min-height:44px; }
}
@media (min-width:761px) and (max-width:1100px) {
  .cw-grid { grid-template-columns:repeat(auto-fill, minmax(280px,1fr)); }
}
@media (pointer:coarse) {
  .cw-icon-btn { width:44px; height:44px; }
  .cw-tx-actions { opacity:1; }
}
@media (prefers-reduced-motion:reduce) {
  .cw-page *, .cw-page *::before, .cw-page *::after,
  .cw-overlay *, .cw-overlay *::before, .cw-overlay *::after {
    transition-duration:.01ms !important; animation-duration:.01ms !important;
  }
  .cw-tile:hover { transform:none; }
  .cw-btn-primary:active, .cw-btn-soft:active, .cw-btn-ghost:active { transform:none; }
}
`;

/** Balance tone as a class, so colour and the text caption always agree. */
function toneClass(balance: number): string {
  if (balance < -0.005) return 'cw-neg';
  if (balance > 0.005) return 'cw-pos';
  return 'cw-neu';
}

function balanceCaption(balance: number): string {
  if (balance < -0.005) return 'Owes us';
  if (balance > 0.005) return 'In credit';
  return 'Settled';
}

const Approx: React.FC = () => (
  <span className="cw-approx" title="Approximate — converted at today's rate rather than the rate stored on the entry.">≈</span>
);

const CarGlyph: React.FC<{ size?: number }> = ({ size = 26 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 17H3a2 2 0 01-2-2V7a2 2 0 012-2h11a2 2 0 012 2v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="9" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.7" />
    <circle cx="12" cy="16" r="1.1" fill="currentColor" />
    <circle cx="20" cy="16" r="1.1" fill="currentColor" />
  </svg>
);

/** Model photo that degrades to a tinted glyph — a broken URL never shows a broken image. */
const CarImage: React.FC<{ url: string | null; alt: string; glyphSize?: number }> = ({ url, alt, glyphSize }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [url]);
  if (!url || failed) return <CarGlyph size={glyphSize} />;
  return <img src={url} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
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
    <div className="cw-sheet-scroll">
      <table className="cw-tx">
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Description</th>
            <th className="r">Amount</th>
            <th className="r">Balance</th>
            <th className="r"><span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {chronological.map(({ row, value, approx, running }) => {
            const isIn = row.direction === 'IN';
            return (
              <tr key={row.id}>
                <td className="cw-date">{formatDateDisplay(row.created_at)}</td>
                <td>
                  {/* The dot carries direction; the signed, coloured amount repeats it. */}
                  <span className="cw-chip" title={isIn ? 'Money in' : 'Money out'}>
                    <i style={{ background: isIn ? 'var(--cw-pos)' : 'var(--cw-neg)' }} />
                    {typeLabel(row.type)}
                  </span>
                </td>
                <td className="cw-desc">{row.description || '—'}</td>
                <td className={`r cw-num ${isIn ? 'cw-pos' : 'cw-neg'}`} style={{ fontWeight: 650 }}>
                  {approx && <Approx />}
                  {isIn ? '+' : '−'}{formatMoney(value, currency)}
                </td>
                <td className="r cw-num cw-neu">{formatSigned(running, currency)}</td>
                <td className="r">
                  <span className="cw-tx-actions">
                    <button type="button" className="cw-icon-btn" onClick={() => onEdit(row)} title="Edit transaction" aria-label="Edit transaction">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button type="button" className="cw-icon-btn danger" onClick={() => onDelete(row)} title="Delete transaction" aria-label="Delete transaction">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ─── Level 2 — a customer row inside the car modal ────────────────────────────

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
    <div className={`cw-crow${open ? ' is-open' : ''}`}>
      <div className="cw-crow-head">
        <button type="button" className="cw-disclose" onClick={onToggle} aria-expanded={open}>
          <svg className="cw-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ minWidth: 0 }}>
            <span className="cw-plate-line">
              {/* Pill trails the name so names stay left-aligned down the card. */}
              <span className="cw-cust-name">{entry.name}</span>
              {entry.live && <span className="cw-pill cw-pill--live"><i />Live</span>}
            </span>
            <span className="cw-caption" style={{ display: 'block' }}>
              {entry.rows.length} {entry.rows.length === 1 ? 'entry' : 'entries'}
              {' · '}In <span className="cw-num">{formatMoney(entry.totalIn, currency)}</span>
              {' · '}Out <span className="cw-num">{formatMoney(entry.totalOut, currency)}</span>
            </span>
          </span>
        </button>

        <div className="cw-bal-block">
          <div className={`cw-bal-md cw-num ${toneClass(entry.balance)}`}>
            {entry.approx && <Approx />}
            {formatSigned(entry.balance, currency)}
          </div>
          <div className="cw-caption" style={{ marginTop: 1 }}>{balanceCaption(entry.balance)}</div>
        </div>

        <div className="cw-row-actions">
          <button type="button" className="cw-btn-soft" onClick={onAdd} title="Add a transaction for this customer on this car">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
            Add transaction
          </button>
          <button type="button" className="cw-btn-ghost" onClick={handlePrintInvoice} disabled={printing} title="Print an invoice for this customer on this car">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {printing ? 'Preparing…' : 'Print invoice'}
          </button>
        </div>
      </div>

      <div className="cw-sheet">
        <div className="cw-sheet-inner">
          <TransactionSheet
            entry={entry}
            currency={currency}
            rates={rates}
            fallbackUsdRate={fallbackUsdRate}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </div>
      </div>
    </div>
  );
};

// ─── Level 1 — a car tile in the grid ─────────────────────────────────────────

const CarTile: React.FC<{
  car: CarGroup;
  currency: Currency;
  onOpen: (trigger: HTMLButtonElement) => void;
}> = ({ car, currency, onOpen }) => (
  <button
    type="button"
    className="cw-tile"
    onClick={e => onOpen(e.currentTarget)}
    aria-label={`${car.plate} — open customers and transactions`}
  >
    <span className="cw-tile-top">
      <span className="cw-tile-plate">{car.plate}</span>
      <span className="cw-thumb">
        <CarImage url={car.imageUrl} alt={car.modelName ?? car.plate} glyphSize={22} />
      </span>
    </span>

    <span className="cw-tile-meta">
      <span className="cw-caption" style={{ marginTop: 0 }}>{car.modelName ?? 'No model group'}</span>
      {car.hasLive
        ? <span className="cw-pill cw-pill--live"><i />On rent</span>
        : <span className="cw-pill cw-pill--idle"><i />Available</span>}
      <span className="cw-caption" style={{ marginTop: 0 }}>
        · {car.customers.length} {car.customers.length === 1 ? 'customer' : 'customers'}
      </span>
    </span>

    <span className="cw-rule" />

    <span className="cw-tile-bal">
      <span style={{ minWidth: 0 }}>
        <span className="cw-bal-label" style={{ display: 'block' }}>Car balance</span>
        <span className={`cw-tile-bal-value cw-num ${toneClass(car.balance)}`}>
          {car.approx && <Approx />}
          {formatSigned(car.balance, currency)}
        </span>
      </span>
      <span className="cw-view">
        View
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </span>
  </button>
);

// ─── Levels 2 + 3 — the car modal ─────────────────────────────────────────────

const CarModal: React.FC<{
  car: CarGroup;
  currency: Currency;
  rates: RateRow[];
  fallbackUsdRate: number | null;
  expanded: Record<string, boolean>;
  onToggle: (customerId: string) => void;
  onAdd: (customer: CustomerOnCar) => void;
  onEdit: (row: LedgerRow) => void;
  onDelete: (row: LedgerRow) => void;
  onError: (message: string) => void;
  onClose: () => void;
}> = ({ car, currency, rates, fallbackUsdRate, expanded, onToggle, onAdd, onEdit, onDelete, onError, onClose }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const titleId = `cw-modal-${car.key}`;

  // Lock background scrolling for as long as the modal is mounted.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  // Escape closes; Tab cycles inside the dialog. Controls in a collapsed sheet are skipped,
  // since they are visibility:hidden and must stay out of the tab order.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab' || !boxRef.current) return;
      const focusable = Array.from(
        boxRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
      ).filter(el => !el.hasAttribute('disabled') && !el.closest('.cw-crow:not(.is-open) .cw-sheet'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => { boxRef.current?.querySelector<HTMLElement>('button')?.focus(); }, []);

  return ReactDOM.createPortal(
    <div className="cw-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cw-modal" ref={boxRef} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="cw-modal-head">
          <span className="cw-modal-thumb">
            <CarImage url={car.imageUrl} alt={car.modelName ?? car.plate} glyphSize={22} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="cw-plate-line">
              <span className="cw-plate" id={titleId}>{car.plate}</span>
              {car.hasLive
                ? <span className="cw-pill cw-pill--live"><i />On rent</span>
                : <span className="cw-pill cw-pill--idle"><i />Available</span>}
            </div>
            <div className="cw-caption">
              {car.modelName ?? 'No model group'} · {car.customers.length} {car.customers.length === 1 ? 'customer' : 'customers'}
            </div>
          </div>
          <div className="cw-bal-block" style={{ marginRight: 4 }}>
            <div className="cw-bal-label">Car balance</div>
            <div className={`cw-bal-lg cw-num ${toneClass(car.balance)}`}>
              {car.approx && <Approx />}
              {formatSigned(car.balance, currency)}
            </div>
          </div>
          <button type="button" className="cw-modal-close" onClick={onClose} aria-label="Close">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="cw-modal-body">
          <div className="cw-rows">
            {car.customers.map(entry => (
              <CustomerRow
                key={entry.customerId}
                entry={entry}
                currency={currency}
                rates={rates}
                fallbackUsdRate={fallbackUsdRate}
                open={!!expanded[`${car.key}:${entry.customerId}`]}
                onToggle={() => onToggle(entry.customerId)}
                onAdd={() => onAdd(entry)}
                onEdit={onEdit}
                onDelete={onDelete}
                onError={onError}
              />
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

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
  /** car id → model group name + image, for display and ordering only. */
  const [carMeta, setCarMeta] = useState<Map<number, CarMeta>>(new Map());

  const [tab, setTab] = useState<RentalTab>('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [openCarKey, setOpenCarKey] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

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

  // Model group per car — presentation and ordering only. Fetched separately (the pattern
  // CarsPage uses) so the ledger query stays untouched; a failure here degrades to a
  // placeholder glyph and never affects balances.
  useEffect(() => {
    let active = true;
    (async () => {
      const [carsRes, groupsRes] = await Promise.all([
        supabase.from('cars').select('id, plate_number, model_group_id'),
        supabase.from('model_group').select('id, name, brand, model, image_url'),
      ]);
      if (!active) return;
      const groups = new Map<number, { name: string | null; brand: string | null; model: string | null; image_url: string | null }>();
      for (const g of (groupsRes.data ?? []) as { id: number; name: string | null; brand: string | null; model: string | null; image_url: string | null }[]) {
        groups.set(g.id, g);
      }
      const meta = new Map<number, CarMeta>();
      for (const c of (carsRes.data ?? []) as { id: number; model_group_id: number | null }[]) {
        const g = c.model_group_id != null ? groups.get(c.model_group_id) : undefined;
        const label = g ? (g.name ?? ([g.brand, g.model].filter(Boolean).join(' ') || null)) : null;
        meta.set(c.id, { modelName: label, imageUrl: g?.image_url ?? null });
      }
      setCarMeta(meta);
    })();
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
        const meta = linked ? carMeta.get(row.car_id as number) : undefined;
        car = {
          key,
          carId: linked ? row.car_id : null,
          plate: linked ? plate! : 'Unlinked to a car',
          customers: [], totalIn: 0, totalOut: 0, balance: 0, approx: false, hasLive: false,
          modelName: meta?.modelName ?? null,
          imageUrl: meta?.imageUrl ?? null,
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

    // Same model group sits consecutively: group name A→Z, then plate. Cars without a model
    // group fall to the end, and the unlinked bucket is always last of all.
    return list.sort((a, b) => {
      if (a.key === UNLINKED_KEY) return 1;
      if (b.key === UNLINKED_KEY) return -1;
      if (!a.modelName !== !b.modelName) return a.modelName ? -1 : 1;
      const byModel = (a.modelName ?? '').localeCompare(b.modelName ?? '');
      return byModel !== 0 ? byModel : a.plate.localeCompare(b.plate);
    });
  }, [rows, currency, rates, usdRate, liveKeys, carMeta]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cars.filter(car => {
      if (tab === 'current' && !car.hasLive) return false;
      if (tab === 'ended' && car.hasLive) return false;
      if (!q) return true;
      return car.plate.toLowerCase().includes(q)
        || (car.modelName ?? '').toLowerCase().includes(q)
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

  /** The open car, re-read from the live list so it stays fresh after any mutation. */
  const openCar = useMemo(
    () => (openCarKey ? cars.find(c => c.key === openCarKey) ?? null : null),
    [cars, openCarKey],
  );

  const closeCar = useCallback(() => {
    setOpenCarKey(null);
    triggerRef.current?.focus();
  }, []);

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

  const emptyTitle = cars.length === 0
    ? 'No customer ledger entries yet.'
    : tab === 'current' ? 'No cars with current rentals.'
    : tab === 'ended'   ? 'No cars with ended rentals.'
    : 'No cars match this search.';

  return (
    <div className="cw-page">
      <style>{CW_STYLES}</style>

      <header className="cw-head">
        <h1 className="cw-h1">Customer Wallets</h1>
        <p className="cw-sub">Balances per car and customer — charges owed against payments and deposits received.</p>
      </header>

      {/* Summary */}
      <div className="cw-stats">
        <div className="cw-stat">
          <div className="cw-stat-label">Owed to us</div>
          <div className="cw-stat-value cw-num cw-neg">{formatMoney(totals.owed, currency)}</div>
          <div className="cw-stat-hint">{totals.debtors} {totals.debtors === 1 ? 'balance' : 'balances'}</div>
        </div>
        <div className="cw-stat">
          <div className="cw-stat-label">In credit</div>
          <div className="cw-stat-value cw-num cw-pos">{formatMoney(totals.credit, currency)}</div>
          <div className="cw-stat-hint">{totals.inCredit} {totals.inCredit === 1 ? 'balance' : 'balances'}</div>
        </div>
        <div className="cw-stat">
          <div className="cw-stat-label">Net position</div>
          <div className={`cw-stat-value cw-num ${toneClass(totals.net)}`}>{formatSigned(totals.net, currency)}</div>
          <div className="cw-stat-hint">{filtered.length} {filtered.length === 1 ? 'car' : 'cars'}</div>
        </div>
      </div>

      {/* Tabs + search + add */}
      <div className="cw-toolbar">
        <div className="cw-seg" role="tablist" aria-label="Rental status">
          {TABS.map(t => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={`cw-seg-btn${tab === t.key ? ' is-on' : ''}`}
              onClick={() => setTab(t.key)}
            >{t.label}</button>
          ))}
        </div>

        <div className="cw-search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search plate, model or customer…"
            aria-label="Search by plate, model group or customer name"
          />
        </div>

        <button type="button" className="cw-btn-primary" onClick={() => setAddFor({ customerId: null, name: null, carId: null })}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          Add Transaction
        </button>
      </div>

      {loadError ? (
        <div className="cw-empty">
          <div className="cw-empty-title cw-neg">Could not load the ledger</div>
          <div className="cw-empty-sub">{loadError}</div>
        </div>
      ) : loading ? (
        <div className="cw-empty">
          <div className="cw-empty-title">Loading…</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="cw-empty">
          <div className="cw-empty-title">{emptyTitle}</div>
          <div className="cw-empty-sub">Transactions you add will appear here, grouped by car.</div>
        </div>
      ) : (
        <div className="cw-grid">
          {filtered.map(car => (
            <CarTile
              key={car.key}
              car={car}
              currency={currency}
              onOpen={trigger => { triggerRef.current = trigger; setOpenCarKey(car.key); }}
            />
          ))}
        </div>
      )}

      {openCar && (
        <CarModal
          car={openCar}
          currency={currency}
          rates={rates}
          fallbackUsdRate={usdRate}
          expanded={expanded}
          onToggle={customerId => setExpanded(prev => ({
            ...prev,
            [`${openCar.key}:${customerId}`]: !prev[`${openCar.key}:${customerId}`],
          }))}
          onAdd={entry => setAddFor({ customerId: entry.customerId, name: entry.name, carId: openCar.carId })}
          onEdit={setEditRow}
          onDelete={setDeleteTarget}
          onError={message => notify({ message, type: 'error' })}
          onClose={closeCar}
        />
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
