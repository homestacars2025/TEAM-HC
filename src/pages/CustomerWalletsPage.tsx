import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useUrlSearch } from '../hooks/useUrlSearch';
import PaymentFields from '../components/payments/PaymentFields';
import PaymentReceipts from '../components/payments/PaymentReceipts';
import { usePaymentAccounts } from '../hooks/usePaymentAccounts';
import { emptyPayment, hasPayment, paymentErrorKey, paymentProblem, type PaymentDraft, type PaymentReceipt, type PaymentType } from '../lib/payments';
import { recordPayment } from '../lib/queries/payments';
import { getLedgerRows, type Direction, type LedgerRow } from '../lib/customerLedger';
import { fetchCurrentUsdRate } from '../lib/exchangeRate';
import { useTranslation } from 'react-i18next';
import Button from '../components/Button';
import BannedBadge from '../components/customers/BannedBadge';
import { useCurrentUser } from '../contexts/CurrentUserContext';
import { usePageAccess } from '../contexts/PageAccessContext';
import CustomerAvatar from '../components/CustomerAvatar';
import PlateChip from '../components/booking/PlateChip';
import { StatTile } from '../components/WalletParts';
import { useTileFilter } from '../hooks/useTileFilter';
import CustomerWalletSheet from '../components/wallet/CustomerWalletSheet';
import { BalanceChip } from '../components/wallet/WalletParts';
import { balanceTone, formatLira, round2, type BalanceTone } from '../lib/bookingWallet';

// ─── Types ────────────────────────────────────────────────────────────────────

type ToastState = { message: string; type: 'success' | 'error' } | null;

/** One customer in the list: the sum of all their bookings, never split by car. */
interface CustomerSummary {
  customerId: string;
  name: string;
  banned: boolean;
  banReason: string | null;
  balance: number;
  bookings: number;
  /** The car on their newest booking, as a label only. */
  plate: string | null;
  onRent: boolean;
}

/** A line the edit form can change: anything not tied to an envelope or a transfer. */
type EditableLine = Pick<LedgerRow, 'id' | 'type' | 'direction' | 'description' | 'amount' | 'exchange_rate_at_entry'>;

interface CustomerOption { id: string; name: string; banned: boolean; }

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

// ─── Dates ────────────────────────────────────────────────────────────────────

function formatDateDisplay(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
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

// ─── Reusable bits ────────────────────────────────────────────────────────────

const Toast: React.FC<{ toast: ToastState }> = ({ toast }) => {
  if (!toast) return null;
  return ReactDOM.createPortal(
    <div style={{
      position: 'fixed', bottom: 28, insetInlineEnd: 28, zIndex: 8500,
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
        position: 'fixed', inset: 0, zIndex: 8400, background: 'rgba(15,17,23,0.45)',
        backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 20,
      }}>
        <div className="surface-depth surface-float" onClick={e => e.stopPropagation()} style={{
          background: '#fff', borderRadius: 18, width: '100%', maxWidth,
          maxHeight: '92vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 80px rgba(0,0,0,0.2)',
        }}>
          <div style={{
            padding: '20px 24px', borderBottom: '1px solid #f0f0f0', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 500, color: '#0f1117' }}>{title}</h3>
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
}> = ({ title, message, confirmLabel, busy, onConfirm, onClose }) => {
  const { t } = useTranslation('wallets');
  const { t: tc } = useTranslation('common');
  return (
  <Modal title={title} onClose={onClose} maxWidth={420}>
    <p style={{ margin: '0 0 22px', fontSize: 14, color: '#4b5563', lineHeight: 1.55 }}>{message}</p>
    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
      <Button variant="secondary" onClick={onClose}>{tc('actions.cancel')}</Button>
      <Button variant="destructive" onClick={onConfirm} disabled={busy}>{busy ? t('confirm.deleting') : (confirmLabel ?? t('confirm.confirm'))}</Button>
    </div>
  </Modal>
  );
};

// ─── Transaction form fields shared by Add and Edit ───────────────────────────

const TypeSelect: React.FC<{ value: string; extraType?: string; chargeOnly?: boolean; onChange: (v: string) => void }> = ({ value, extraType, chargeOnly = false, onChange }) => {
  const { t } = useTranslation('wallets');
  return (
  <div>
    <label style={labelStyle}>{t('form.typeLabel')}</label>
    <select value={value} onChange={e => onChange(e.target.value)} style={inputStyle}>
      {/* A legacy value outside the 7 clean types stays selectable so editing can't silently rewrite it */}
      {extraType && !ALL_TYPES.includes(extraType) && (
        <option value={extraType}>{typeLabel(extraType)} {t('form.legacy')}</option>
      )}
      {/* Money in only reaches the ledger through `record_customer_payment`, so a charge can't be relabelled into it. */}
      {!chargeOnly && (
        <optgroup label={t('direction.moneyIn')}>
          {IN_TYPES.map(ty => <option key={ty} value={ty}>{t(`types.${ty}`)}</option>)}
        </optgroup>
      )}
      <optgroup label={t('direction.moneyOut')}>
        {OUT_TYPES.map(ty => <option key={ty} value={ty}>{t(`types.${ty}`)}</option>)}
      </optgroup>
    </select>
  </div>
  );
};

const DirectionPicker: React.FC<{
  direction: Direction;
  /** False for types with no preset (currently `other`), which need a manual choice. */
  hasPreset: boolean;
  onChange: (d: Direction) => void;
}> = ({ direction, hasPreset, onChange }) => {
  const { t } = useTranslation('wallets');
  return (
  <div>
    <label style={labelStyle}>{t('form.directionLabel')}</label>
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
          }}>{t(`direction.${d}`)}</button>
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
};

const AmountField: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const { t } = useTranslation('wallets');
  return (
  <div>
    <label style={labelStyle}>{t('form.amountLabel')}</label>
    <input
      type="number" min="0" step="0.01" value={value}
      onChange={e => onChange(e.target.value)}
      placeholder="0.00" style={inputStyle}
    />
    <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 6 }}>{t('form.amountHint')}</div>
  </div>
  );
};

// ─── Add transaction ──────────────────────────────────────────────────────────

const AddTransactionModal: React.FC<{
  userId: string | null;
  presetCustomerId: string | null;
  presetName: string | null;
  /** When adding from a booking card, that booking is preselected. */
  presetBookingId: number | null;
  fallbackUsdRate: number | null;
  onClose: () => void;
  /** With the envelope to number, when the money was cash. */
  onSaved: (receipt: PaymentReceipt | null) => void;
  onError: (message: string) => void;
}> = ({ userId, presetCustomerId, presetName, presetBookingId, fallbackUsdRate, onClose, onSaved, onError }) => {
  const { t } = useTranslation('wallets');
  const { t: tc } = useTranslation('common');
  const { t: tf } = useTranslation('finance');
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
  const [payment, setPayment] = useState<PaymentDraft>(emptyPayment);
  const paymentAccounts = usePaymentAccounts();
  const isPayment = type === 'payment' || type === 'deposit';
  // Admins and the Accounting page (`is_finance` on the server) may record the amount alone.
  const { profile } = useCurrentUser();
  const { canAccessPage } = usePageAccess();
  const isFinance = profile?.role === 'admin' || canAccessPage('accounting');

  // Customer picker is only needed for the global "Add transaction".
  useEffect(() => {
    if (presetCustomerId) return;
    let active = true;
    (async () => {
      const { data } = await supabase.from('customers').select('id, first_name, last_name, is_banned').order('first_name');
      if (!active) return;
      setCustomers((data ?? []).map((c: { id: string; first_name: string | null; last_name: string | null; is_banned: boolean }) => ({
        id: c.id,
        name: [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || t('unknownCustomer'),
        banned: c.is_banned,
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
      // The booking the card belongs to; otherwise the only one.
      const preset = presetBookingId != null ? opts.find(o => o.id === presetBookingId) : undefined;
      setBookingId(preset ? preset.id : opts.length === 1 ? opts[0].id : '');
      setLoadingBookings(false);
    })();
    return () => { active = false; };
  }, [customerId, presetBookingId]);

  const selectedBooking = useMemo(() => bookings.find(b => b.id === bookingId) ?? null, [bookings, bookingId]);
  const canSave = !!customerId && !!selectedBooking && !!type
    && (isPayment ? hasPayment(payment) && !paymentProblem(payment, isFinance) : Number(amount) > 0);

  const handleTypeChange = (t: string) => {
    setType(t);
    const preset = TYPE_DIRECTION[t];
    if (preset) setDirection(preset);
  };

  const handleSave = async () => {
    if (!canSave || saving || !selectedBooking) return;
    setSaving(true);

    // Money received goes through the server, which also makes its envelope and movement.
    if (isPayment) {
      try {
        const done = await recordPayment(selectedBooking.id, type as PaymentType, payment, description.trim() || null);
        setSaving(false);
        onSaved(done.envelope);
      } catch (failure) {
        setSaving(false);
        onError(tf(`payment.errors.${paymentErrorKey((failure as { message?: string })?.message)}`));
      }
      return;
    }

    // Stamp the rate that was current at entry time; fall back to the rate already loaded by the page.
    const rate = (await fetchCurrentUsdRate()) ?? fallbackUsdRate;
    if (rate == null) {
      setSaving(false);
      onError(t('errors.rate'));
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
    if (error) { onError(t('errors.save')); return; }
    onSaved(null);
  };

  return (
    <Modal title={t('form.addTitle')} onClose={onClose}>
      <div className="hc-wallet-add" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={labelStyle}>{t('form.customer')}</label>
          {presetCustomerId ? (
            <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', color: '#0f1117' }}>{presetName || 'Customer'}</div>
          ) : (
            <select value={customerId} onChange={e => setCustomerId(e.target.value)} style={inputStyle}>
              <option value="">{t('form.selectCustomer')}</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.banned ? `${c.name} (${tc('customer.banned')})` : c.name}</option>)}
            </select>
          )}
        </div>

        <div>
          <label style={labelStyle}>{t('form.booking')}</label>
          <select
            value={bookingId}
            onChange={e => setBookingId(e.target.value ? Number(e.target.value) : '')}
            style={inputStyle}
            disabled={!customerId || loadingBookings || bookings.length === 0}
          >
            <option value="">
              {!customerId ? t('form.selectCustomerFirst')
                : loadingBookings ? t('form.loadingBookings')
                : bookings.length === 0 ? t('form.noBookings')
                : t('form.selectBooking')}
            </option>
            {bookings.map(b => <option key={b.id} value={b.id}>{bookingLabel(b)}</option>)}
          </select>
          {customerId && !loadingBookings && bookings.length === 0 && (
            <div style={{ fontSize: 12, color: COLOR_OUT, marginTop: 6 }}>
              {t('noBookingsWarn')}
            </div>
          )}
        </div>

        {isPayment ? (
          <>
            <TypeSelect value={type} onChange={handleTypeChange} />
            <PaymentFields label={tf('cash.table.amount')} required routeOptional={isFinance} value={payment} onChange={setPayment} accounts={paymentAccounts} disabled={saving} />
          </>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <TypeSelect value={type} onChange={handleTypeChange} />
              <AmountField value={amount} onChange={setAmount} />
            </div>

            <DirectionPicker direction={direction} hasPreset={TYPE_DIRECTION[type] !== undefined} onChange={setDirection} />
          </>
        )}

        <div>
          <label style={labelStyle}>{t('form.descriptionOptional')}</label>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder={t('form.descriptionPlaceholder')} style={inputStyle} />
        </div>

        <Button
          type="button"
          disabled={!canSave || saving}
          onClick={handleSave}
          style={{ width: '100%' }}
>
          {saving ? t('form.saving') : t('form.saveTransaction')}
        </Button>
      </div>
    </Modal>
  );
};

// ─── Edit transaction ─────────────────────────────────────────────────────────

const EditTransactionModal: React.FC<{
  row: EditableLine;
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}> = ({ row, onClose, onSaved, onError }) => {
  const { t } = useTranslation('wallets');
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
      onError(t('errors.ratePositive'));
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
    if (error) { onError(t('errors.update')); return; }
    onSaved();
  };

  return (
    <Modal title={t('form.editTitle')} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <TypeSelect value={type} extraType={row.type} chargeOnly={row.type !== 'payment' && row.type !== 'deposit'} onChange={handleTypeChange} />
          <AmountField value={amount} onChange={setAmount} />
        </div>

        <DirectionPicker direction={direction} hasPreset={TYPE_DIRECTION[type] !== undefined} onChange={setDirection} />

        <div>
          <label style={labelStyle}>{t('form.descriptionOptional')}</label>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder={t('form.descriptionPlaceholder')} style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>{t('form.rateLabel')}</label>
          <input
            type="number" min="0" step="0.0001" value={rate}
            onChange={e => setRate(e.target.value)}
            placeholder={t('form.ratePlaceholder')} style={inputStyle}
          />
          <div style={{ fontSize: 11.5, color: rateChanged ? '#b45309' : '#9ca3af', marginTop: 6, lineHeight: 1.5 }}>
            {rateChanged
              ? t('form.rateWarning')
              : 'Kept from when this entry was created — editing the amount does not re-stamp it.'}
          </div>
        </div>

        <Button
          type="button"
          disabled={!canSave || saving}
          onClick={handleSave}
          style={{ width: '100%' }}
>
          {saving ? t('form.saving') : t('form.saveChanges')}
        </Button>
      </div>
    </Modal>
  );
};

// ─── Customer list ────────────────────────────────────────────────────────────

const FILTERS = ['owes', 'credit', 'settled'] as const;

interface BookingLabelRow {
  id: number;
  customer_id: string | null;
  start_date: string;
  is_currently_active: boolean | null;
  cars: { plate_number: string | null } | { plate_number: string | null }[] | null;
}

/** Per booking rounded to the kuruş, then summed: the same total the wallet shows. */
export function summarizeCustomers(rows: LedgerRow[], bookings: BookingLabelRow[], unknown: string): CustomerSummary[] {
  const perBooking = new Map<string, number>();
  const people = new Map<string, { row: LedgerRow; bookings: Set<number> }>();
  for (const row of rows) {
    const key = `${row.customer_id}:${row.booking_id ?? 'none'}`;
    perBooking.set(key, (perBooking.get(key) ?? 0) + (row.direction === 'IN' ? Number(row.amount) : -Number(row.amount)));
    const person = people.get(row.customer_id) ?? { row, bookings: new Set<number>() };
    if (row.booking_id != null) person.bookings.add(row.booking_id);
    people.set(row.customer_id, person);
  }
  const balances = new Map<string, number>();
  perBooking.forEach((sum, key) => {
    const customerId = key.slice(0, key.lastIndexOf(':'));
    balances.set(customerId, (balances.get(customerId) ?? 0) + round2(sum));
  });
  const newest = new Map<string, BookingLabelRow>();
  const onRent = new Set<string>();
  for (const booking of bookings) {
    if (!booking.customer_id) continue;
    if (booking.is_currently_active) onRent.add(booking.customer_id);
    // The label comes from a booking with money on it, never an empty or cancelled one.
    if (!people.get(booking.customer_id)?.bookings.has(booking.id)) continue;
    const seen = newest.get(booking.customer_id);
    if (!seen || booking.start_date > seen.start_date) newest.set(booking.customer_id, booking);
  }
  return Array.from(people.entries()).map(([customerId, { row, bookings: ids }]) => {
    const person = firstOf(row.customers);
    return {
      customerId,
      name: [person?.first_name, person?.last_name].filter(Boolean).join(' ').trim() || unknown,
      banned: person?.is_banned === true,
      banReason: person?.ban_reason ?? null,
      balance: round2(balances.get(customerId) ?? 0),
      bookings: ids.size,
      plate: firstOf(newest.get(customerId)?.cars)?.plate_number ?? null,
      onRent: onRent.has(customerId),
    };
  });
}

const TONE_ORDER: Record<BalanceTone, number> = { owes: 0, credit: 1, settled: 2 };

const CustomerRow: React.FC<{ entry: CustomerSummary; onOpen: () => void }> = ({ entry, onOpen }) => {
  const { t } = useTranslation('wallets');
  return (
    <button type="button" className="hc-cw-row surface-depth" onClick={onOpen}>
      <CustomerAvatar size={40} />
      <span className="hc-cw-row-text">
        <span className="hc-cw-row-name">
          <bdi dir="auto">{entry.name}</bdi>
          {entry.banned && <BannedBadge reason={entry.banReason} />}
        </span>
        <span className="hc-cw-row-meta">
          <span>{t('bookingCount', { count: entry.bookings })}</span>
          {entry.plate && <PlateChip plate={entry.plate} />}
          {entry.onRent && <span className="hc-cw-pill is-live">{t('wallet.onRent')}</span>}
        </span>
      </span>
      <BalanceChip balance={entry.balance} />
    </button>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

/** `embedded` sits inside a tab of Accounting, which has its own title and padding. */
const CustomerWalletsPage: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const { t } = useTranslation('wallets');
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useTileFilter(FILTERS);
  const openId = params.get('customer');

  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [bookings, setBookings] = useState<BookingLabelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [usdRate, setUsdRate] = useState<number | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  useUrlSearch(setSearch);

  const [addFor, setAddFor] = useState<{ customerId: string | null; name: string | null; bookingId: number | null } | null>(null);
  const [editRow, setEditRow] = useState<EditableLine | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EditableLine | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([]);
  /** Bumped after a line changes, so an open wallet reads itself again. */
  const [walletVersion, setWalletVersion] = useState(0);

  const notify = useCallback((next: ToastState) => {
    setToast(next);
    if (next) window.setTimeout(() => setToast(null), 2600);
  }, []);

  const load = useCallback(async () => {
    try {
      const [ledger, labels] = await Promise.all([
        getLedgerRows(),
        supabase.from('bookings').select('id, customer_id, start_date, is_currently_active, cars(plate_number)'),
      ]);
      if (labels.error) throw labels.error;
      setRows(ledger);
      setBookings((labels.data ?? []) as unknown as BookingLabelRow[]);
      setLoadError(null);
    } catch (failure) {
      setLoadError((failure as { message?: string })?.message ?? '');
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let active = true;
    fetchCurrentUsdRate().then(rate => { if (active) setUsdRate(rate); });
    supabase.auth.getUser().then(({ data }) => { if (active) setUserId(data.user?.id ?? null); });
    return () => { active = false; };
  }, []);

  const customers = useMemo(() => summarizeCustomers(rows, bookings, t('unknownCustomer'))
    .sort((a, b) => {
      const ta = balanceTone(a.balance);
      const tb = balanceTone(b.balance);
      return TONE_ORDER[ta] - TONE_ORDER[tb] || Math.abs(b.balance) - Math.abs(a.balance) || a.name.localeCompare(b.name);
    }), [rows, bookings, t]);

  const totals = useMemo(() => {
    const owes = customers.filter(entry => balanceTone(entry.balance) === 'owes');
    const credit = customers.filter(entry => balanceTone(entry.balance) === 'credit');
    return {
      owes: owes.length,
      owed: owes.reduce((sum, entry) => sum - entry.balance, 0),
      credit: credit.length,
      held: credit.reduce((sum, entry) => sum + entry.balance, 0),
      settled: customers.length - owes.length - credit.length,
    };
  }, [customers]);

  const shown = useMemo(() => {
    const query = search.trim().toLowerCase();
    return customers.filter(entry => {
      if (filter !== 'all' && balanceTone(entry.balance) !== filter) return false;
      return !query || entry.name.toLowerCase().includes(query) || (entry.plate ?? '').toLowerCase().includes(query);
    });
  }, [customers, filter, search]);

  const openWallet = (customerId: string | null) => setParams(current => {
    const next = new URLSearchParams(current);
    if (customerId) next.set('customer', customerId); else next.delete('customer');
    return next;
  }, { replace: true });

  const changed = useCallback(async () => {
    setWalletVersion(value => value + 1);
    await load();
  }, [load]);

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    const { error } = await supabase.from('customer_accounting_ledger').delete().eq('id', deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
    if (error) { notify({ message: t('errors.delete'), type: 'error' }); return; }
    notify({ message: t('toast.deleted'), type: 'success' });
    await changed();
  };

  const ready = !loading && !loadError;
  const emptyTitle = customers.length === 0 ? t('empty.noEntries') : search.trim() ? t('empty.noMatch') : t(`empty.${filter}`);

  return (
    <div className={`hc-cw-page${embedded ? ' is-embedded' : ''}`}>
      {!embedded && (
        <header className="hc-cw-page-head">
          <h1>{t('title')}</h1>
          <p>{t('subtitle')}</p>
        </header>
      )}

      <div className="hc-tiles hc-tiles-filter hc-cw-tiles">
        <StatTile tone="total" label={t('tiles.all')} value={ready ? String(customers.length) : null} sub={t('customerCount', { count: customers.length })} onPress={() => setFilter('all')} pressed={filter === 'all'} />
        <StatTile tone="negative" label={t('tiles.owes')} value={ready ? formatLira(totals.owed) : null} sub={t('customerCount', { count: totals.owes })} onPress={() => setFilter('owes')} pressed={filter === 'owes'} />
        <StatTile tone="received" label={t('tiles.credit')} value={ready ? formatLira(totals.held) : null} sub={t('customerCount', { count: totals.credit })} onPress={() => setFilter('credit')} pressed={filter === 'credit'} />
        <StatTile tone="balance" label={t('tiles.settled')} value={ready ? String(totals.settled) : null} sub={t('customerCount', { count: totals.settled })} onPress={() => setFilter('settled')} pressed={filter === 'settled'} />
      </div>

      <div className="hc-cw-toolbar">
        <label className="hc-cw-search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input className="hc-input" value={search} onChange={e => setSearch(e.target.value)} placeholder={t('search')} aria-label={t('searchAria')} />
        </label>
        <Button onClick={() => setAddFor({ customerId: null, name: null, bookingId: null })}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          {t('form.addTitle')}
        </Button>
      </div>

      {loadError ? (
        <div className="hc-cw-state surface-depth" role="alert">
          <p>{t('loadError')}</p>
          <small>{loadError}</small>
        </div>
      ) : loading ? (
        <div className="hc-cw-state surface-depth" role="status"><span className="hc-cw-spinner" aria-hidden="true" />{t('loading')}</div>
      ) : shown.length === 0 ? (
        <div className="hc-cw-state surface-depth"><p>{emptyTitle}</p></div>
      ) : (
        <div className="hc-cw-list">
          {shown.map(entry => <CustomerRow key={entry.customerId} entry={entry} onOpen={() => openWallet(entry.customerId)} />)}
        </div>
      )}

      {openId && (
        <CustomerWalletSheet
          customerId={openId}
          version={walletVersion}
          covered={!!(addFor || editRow || deleteTarget || receipts.length)}
          onClose={() => openWallet(null)}
          onChanged={() => void load()}
          onAdd={(bookingId, name) => setAddFor({ customerId: openId, name, bookingId })}
          onEdit={line => setEditRow(line)}
          onDelete={line => setDeleteTarget(line)}
        />
      )}

      {receipts.length > 0 && <PaymentReceipts receipts={receipts} onClose={() => setReceipts([])} />}

      {addFor && (
        <AddTransactionModal
          userId={userId}
          presetCustomerId={addFor.customerId}
          presetName={addFor.name}
          presetBookingId={addFor.bookingId}
          fallbackUsdRate={usdRate}
          onClose={() => setAddFor(null)}
          onSaved={async receipt => { setAddFor(null); notify({ message: t('toast.added'), type: 'success' }); if (receipt) setReceipts([receipt]); await changed(); }}
          onError={message => notify({ message, type: 'error' })}
        />
      )}

      {editRow && (
        <EditTransactionModal
          row={editRow}
          onClose={() => setEditRow(null)}
          onSaved={async () => { setEditRow(null); notify({ message: t('toast.updated'), type: 'success' }); await changed(); }}
          onError={message => notify({ message, type: 'error' })}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={t('confirm.deleteTitle')}
          message={t('confirm.deleteBody')}
          confirmLabel={t('confirm.delete')}
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
