import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../lib/supabase';
import { fetchCurrentUsdRate } from '../lib/exchangeRate';
import { printCustomerInvoice } from '../lib/printCustomerInvoice';

// ─── Types ────────────────────────────────────────────────────────────────────

type Direction = 'IN' | 'OUT';

/** This page converts per-entry, so it deliberately does not use the global 4-currency context. */
type WalletCurrency = 'TRY' | 'USD';

type BalanceFilter = 'all' | 'debtors' | 'credit';

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

interface CustomerWallet {
  customerId: string;
  name: string;
  rows: LedgerRow[];
  totalIn: number;
  totalOut: number;
  balance: number;
  /** True when at least one entry fell back to today's rate instead of its own stored rate. */
  approx: boolean;
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

const CURRENCY_SYMBOL: Record<WalletCurrency, string> = { TRY: '₺', USD: '$' };

/** Always 2 decimals with thousands separators — never a raw float. */
function formatMoney(value: number, currency: WalletCurrency): string {
  const locale = currency === 'TRY' ? 'tr-TR' : 'en-US';
  const abs = Math.abs(value).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return CURRENCY_SYMBOL[currency] + abs;
}

/** Signed figure using a true minus sign, matching the Accounting page. */
function formatSigned(value: number, currency: WalletCurrency): string {
  const sign = value < -0.005 ? '−' : value > 0.005 ? '+' : '';
  return sign + formatMoney(value, currency);
}

function formatDateDisplay(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Converts one entry into the selected currency.
 * USD uses the entry's OWN stored rate; when that is missing or zero it falls back to
 * today's rate and flags the result as approximate.
 */
function convertEntry(
  row: LedgerRow,
  currency: WalletCurrency,
  fallbackRate: number | null,
): { value: number; approx: boolean } {
  if (currency === 'TRY') return { value: row.amount, approx: false };
  const stored = row.exchange_rate_at_entry;
  if (stored != null && stored > 0) return { value: row.amount / stored, approx: false };
  if (fallbackRate != null && fallbackRate > 0) return { value: row.amount / fallbackRate, approx: true };
  return { value: 0, approx: true };
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
  <span title="Approximate — this entry has no stored exchange rate, so today's rate was used." style={{ color: '#9ca3af', marginRight: 2 }}>≈</span>
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
  fallbackUsdRate: number | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}> = ({ userId, presetCustomerId, presetName, fallbackUsdRate, onClose, onSaved, onError }) => {
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
      setBookingId(opts.length === 1 ? opts[0].id : '');
      setLoadingBookings(false);
    })();
    return () => { active = false; };
  }, [customerId]);

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

// ─── Currency toggle ──────────────────────────────────────────────────────────

const CurrencyToggle: React.FC<{
  currency: WalletCurrency;
  usdAvailable: boolean;
  onChange: (c: WalletCurrency) => void;
}> = ({ currency, usdAvailable, onChange }) => (
  <div style={{ display: 'inline-flex', background: '#f3f4f6', borderRadius: 10, padding: 3, gap: 3 }}>
    {(['TRY', 'USD'] as WalletCurrency[]).map(c => {
      const on = currency === c;
      const disabled = c === 'USD' && !usdAvailable;
      return (
        <button
          key={c}
          type="button"
          onClick={() => !disabled && onChange(c)}
          disabled={disabled}
          title={disabled ? 'USD view unavailable — exchange rate not loaded' : `Show amounts in ${c}`}
          style={{
            height: 32, padding: '0 16px', borderRadius: 8, border: 'none',
            background: on ? '#fff' : 'transparent',
            color: disabled ? '#c0c4cc' : on ? '#0f1117' : '#6b7280',
            fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
            cursor: disabled ? 'not-allowed' : 'pointer',
            boxShadow: on ? '0 1px 3px rgba(0,0,0,0.09)' : 'none',
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}
        >
          <span style={{ fontSize: 14 }}>{CURRENCY_SYMBOL[c]}</span>
          {c}
        </button>
      );
    })}
  </div>
);

// ─── Customer detail ──────────────────────────────────────────────────────────

const CustomerDetail: React.FC<{
  wallet: CustomerWallet;
  currency: WalletCurrency;
  usdRate: number | null;
  onBack: () => void;
  onAdd: () => void;
  onEdit: (row: LedgerRow) => void;
  onDelete: (row: LedgerRow) => void;
  onError: (message: string) => void;
}> = ({ wallet, currency, usdRate, onBack, onAdd, onEdit, onDelete, onError }) => {
  const [printing, setPrinting] = useState(false);

  /**
   * The invoice lib resolves the customer and vehicle itself and applies its own
   * ADMIN-matching sign convention (balance = charged − paid). It expects entries in
   * created_at DESC order, which is how `wallet.rows` arrives from the query.
   */
  const handlePrintInvoice = async () => {
    if (printing) return;
    setPrinting(true);
    await printCustomerInvoice(
      wallet.customerId,
      wallet.rows.map(row => ({
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

  // Oldest first so the running balance reads top-to-bottom.
  const chronological = useMemo(() => {
    const sorted = [...wallet.rows].sort((a, b) => {
      const ta = a.created_at ? Date.parse(a.created_at) : 0;
      const tb = b.created_at ? Date.parse(b.created_at) : 0;
      return ta - tb;
    });
    let running = 0;
    return sorted.map(row => {
      const { value, approx } = convertEntry(row, currency, usdRate);
      const signedValue = row.direction === 'IN' ? value : -value;
      running += signedValue;
      return { row, value, approx, running };
    });
  }, [wallet.rows, currency, usdRate]);

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        style={{
          height: 34, padding: '0 12px 0 8px', borderRadius: 9, border: '1px solid #e5e7eb',
          background: '#fff', color: '#4b5563', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 16,
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        All wallets
      </button>

      {/* Balance header */}
      <div style={{ ...cardStyle, padding: '20px 22px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: '#0f1117', letterSpacing: '-0.3px' }}>{wallet.name}</div>
          <div style={{ fontSize: 12.5, color: '#9ca3af', marginTop: 3 }}>
            {wallet.rows.length} {wallet.rows.length === 1 ? 'entry' : 'entries'} · In {formatMoney(wallet.totalIn, currency)} · Out {formatMoney(wallet.totalOut, currency)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
            Balance
          </div>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.8px', color: balanceColor(wallet.balance), lineHeight: 1.15 }}>
            {wallet.approx && <ApproxMark />}
            {formatSigned(wallet.balance, currency)}
          </div>
          <div style={{ fontSize: 12, color: '#9ca3af' }}>
            {wallet.balance < -0.005 ? 'Owes us' : wallet.balance > 0.005 ? 'In credit' : 'Settled'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handlePrintInvoice}
            disabled={printing}
            title="Print an invoice for this customer"
            style={{
              height: 42, padding: '0 16px', borderRadius: 10, cursor: printing ? 'wait' : 'pointer',
              fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: '#4b5563',
              background: '#fff', border: '1px solid #e5e7eb',
              display: 'inline-flex', alignItems: 'center', gap: 7, opacity: printing ? 0.6 : 1,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {printing ? 'Preparing…' : 'Print Invoice'}
          </button>
          <button type="button" style={primaryBtn} onClick={onAdd}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            Add Transaction
          </button>
        </div>
      </div>

      {/* Ledger */}
      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Type</Th>
                <Th>Direction</Th>
                <Th>Description</Th>
                <Th>Booking</Th>
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
                  <td style={tdStyle}>
                    {row.booking_id != null ? (
                      <span style={{ color: '#4b5563' }}>
                        #{row.booking_id}
                        {firstOf(row.cars)?.plate_number
                          ? <span style={{ color: '#9ca3af' }}> · {firstOf(row.cars)?.plate_number}</span>
                          : null}
                      </span>
                    ) : <span style={{ color: '#d1d5db' }}>—</span>}
                  </td>
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
      </div>
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const CustomerWalletsPage: React.FC = () => {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [usdRate, setUsdRate] = useState<number | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [currency, setCurrency] = useState<WalletCurrency>('TRY');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<BalanceFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [addFor, setAddFor] = useState<{ customerId: string | null; name: string | null } | null>(null);
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

  // Group into wallets and convert into the selected currency.
  const wallets = useMemo<CustomerWallet[]>(() => {
    const map = new Map<string, CustomerWallet>();
    for (const row of rows) {
      let wallet = map.get(row.customer_id);
      if (!wallet) {
        wallet = { customerId: row.customer_id, name: customerNameOf(row), rows: [], totalIn: 0, totalOut: 0, balance: 0, approx: false };
        map.set(row.customer_id, wallet);
      }
      wallet.rows.push(row);
      const { value, approx } = convertEntry(row, currency, usdRate);
      if (row.direction === 'IN') wallet.totalIn += value; else wallet.totalOut += value;
      if (approx) wallet.approx = true;
    }
    const list = Array.from(map.values());
    for (const wallet of list) wallet.balance = wallet.totalIn - wallet.totalOut;
    // Biggest debtors first — this page exists to surface who owes money.
    return list.sort((a, b) => a.balance - b.balance || a.name.localeCompare(b.name));
  }, [rows, currency, usdRate]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return wallets.filter(w => {
      if (filter === 'debtors' && !(w.balance < -0.005)) return false;
      if (filter === 'credit' && !(w.balance > 0.005)) return false;
      if (!q) return true;
      // Name, or any plate appearing on one of this customer's entries (same as the old tab).
      return w.name.toLowerCase().includes(q)
        || w.rows.some(r => (firstOf(r.cars)?.plate_number || '').toLowerCase().includes(q));
    });
  }, [wallets, search, filter]);

  const totals = useMemo(() => {
    let owed = 0, credit = 0, debtors = 0, inCredit = 0;
    for (const w of wallets) {
      if (w.balance < -0.005) { owed += -w.balance; debtors++; }
      else if (w.balance > 0.005) { credit += w.balance; inCredit++; }
    }
    return { owed, credit, debtors, inCredit, net: credit - owed };
  }, [wallets]);

  const selected = useMemo(
    () => (selectedId ? wallets.find(w => w.customerId === selectedId) ?? null : null),
    [wallets, selectedId],
  );

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

  const FILTERS: { key: BalanceFilter; label: string }[] = [
    { key: 'all',     label: 'All' },
    { key: 'debtors', label: 'Debtors only' },
    { key: 'credit',  label: 'In credit' },
  ];

  return (
    <div style={{ padding: '24px 32px', background: '#fafafa', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.6px', color: '#0f1117' }}>Customer Wallets</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13.5, color: '#9ca3af' }}>
            Every customer&apos;s balance — charges owed against payments and deposits received.
          </p>
        </div>
        <CurrencyToggle currency={currency} usdAvailable={usdRate != null} onChange={setCurrency} />
      </div>

      {currency === 'USD' && (
        <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 14, marginTop: -6 }}>
          Each entry is converted with the rate stored on it. {' '}
          <span style={{ color: '#6b7280' }}>≈</span> marks entries converted at today&apos;s rate because none was stored.
        </div>
      )}

      {/* Summary */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <SummaryPill
          label="Owed to us" color={COLOR_OUT}
          value={formatMoney(totals.owed, currency)}
          hint={`${totals.debtors} ${totals.debtors === 1 ? 'debtor' : 'debtors'}`}
        />
        <SummaryPill
          label="In credit" color={COLOR_IN}
          value={formatMoney(totals.credit, currency)}
          hint={`${totals.inCredit} ${totals.inCredit === 1 ? 'customer' : 'customers'}`}
        />
        <SummaryPill
          label="Net position" color={balanceColor(totals.net)}
          value={formatSigned(totals.net, currency)}
          hint={`${wallets.length} ${wallets.length === 1 ? 'wallet' : 'wallets'}`}
        />
      </div>

      {loadError ? (
        <div style={{ ...cardStyle, padding: '16px 18px', color: COLOR_OUT, fontSize: 13.5 }}>
          Could not load the ledger: {loadError}
        </div>
      ) : loading ? (
        <div style={cardStyle}><Spinner /></div>
      ) : selected ? (
        <CustomerDetail
          wallet={selected}
          currency={currency}
          usdRate={usdRate}
          onBack={() => setSelectedId(null)}
          onAdd={() => setAddFor({ customerId: selected.customerId, name: selected.name })}
          onEdit={setEditRow}
          onDelete={setDeleteTarget}
          onError={message => notify({ message, type: 'error' })}
        />
      ) : (
        <>
          {/* Search + filter + add */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search customer or plate…"
              style={{ ...inputStyle, maxWidth: 320 }}
            />
            <div style={{ display: 'inline-flex', background: '#f3f4f6', borderRadius: 10, padding: 3, gap: 3 }}>
              {FILTERS.map(f => {
                const on = filter === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    style={{
                      height: 32, padding: '0 14px', borderRadius: 8, border: 'none',
                      background: on ? '#fff' : 'transparent',
                      color: on ? '#0f1117' : '#6b7280',
                      fontSize: 13, fontWeight: on ? 700 : 500, fontFamily: 'inherit', cursor: 'pointer',
                      boxShadow: on ? '0 1px 3px rgba(0,0,0,0.09)' : 'none',
                    }}
                  >{f.label}</button>
                );
              })}
            </div>
            <div style={{ flex: 1 }} />
            <button type="button" style={primaryBtn} onClick={() => setAddFor({ customerId: null, name: null })}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
              Add Transaction
            </button>
          </div>

          {filtered.length === 0 ? (
            <div style={cardStyle}>
              <EmptyState label={
                wallets.length === 0
                  ? 'No customer ledger entries yet.'
                  : 'No customers match this search or filter.'
              } />
            </div>
          ) : (
            <div style={{ ...cardStyle, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                  <thead>
                    <tr>
                      <Th>Customer</Th>
                      <Th align="right">Entries</Th>
                      <Th align="right">Total in</Th>
                      <Th align="right">Total out</Th>
                      <Th align="right">Balance</Th>
                      <Th align="right">Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(w => (
                      <tr
                        key={w.customerId}
                        onClick={() => setSelectedId(w.customerId)}
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = '#fafafa'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'; }}
                      >
                        <td style={{ ...tdStyle, fontWeight: 600 }}>{w.name}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: '#9ca3af' }}>{w.rows.length}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: COLOR_IN }}>{formatMoney(w.totalIn, currency)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: COLOR_OUT }}>{formatMoney(w.totalOut, currency)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, fontSize: 14, color: balanceColor(w.balance) }}>
                          {w.approx && <ApproxMark />}
                          {formatSigned(w.balance, currency)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: '#9ca3af', fontSize: 12.5 }}>
                          {w.balance < -0.005 ? 'Owes us' : w.balance > 0.005 ? 'In credit' : 'Settled'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {addFor && (
        <AddTransactionModal
          userId={userId}
          presetCustomerId={addFor.customerId}
          presetName={addFor.name}
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
          message="This ledger entry will be permanently removed and the customer's balance will be recalculated. This cannot be undone."
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
