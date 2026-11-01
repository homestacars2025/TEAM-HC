'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import CustodyTab from '../components/accounting/CustodyTab';
import FinanceHome from '../components/accounting/FinanceHome';
import { SuggestionBanner, SuggestionDialogs, SuggestionList, useSuggestions } from '../components/accounting/Suggestions';
import PlateChip from '../components/booking/PlateChip';
import { getPendingReviewCount } from '../lib/queries/expenseReview';
import CustomerWalletsPage from './CustomerWalletsPage';
import SupplierDetailPage from './SupplierDetailPage';
import SuppliersPage from './SuppliersPage';
import { supabase } from '../lib/supabase';
import { sortCarsByModel } from '../lib/car-picker';
import { useCurrency } from '../lib/CurrencyContext';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import Button from '../components/Button';

/* ────────────────────────────────────────────────────────────────────────────
   AccountingPage — restricted view for staff accountants.

   PRIVACY: This page must NEVER surface any investor name, investor_id, or
   commission row/amount. Tab 1 reads ONLY from the `team_car_transactions`
   view (which excludes commissions + investors). When adding a car
   transaction we silently attach cars.investor_id to satisfy the NOT NULL
   constraint on financial_transactions — it is never displayed or chosen.
──────────────────────────────────────────────────────────────────────────── */

// ─── Types ──────────────────────────────────────────────────────────────────

type Direction = 'IN' | 'OUT';
type Tab = 'home' | 'car_sheets' | 'company' | 'custody' | 'customers' | 'suppliers';

interface CarOption {
  id: number;
  plate_number: string;
  model_name: string;
  investor_id: string | null; // silent — never rendered
}

interface CarTxn {
  id: number;
  car_id: number;
  plate_number: string;
  model_name: string | null;
  category: string | null;
  amount: number;
  direction: Direction;
  date: string;
  month_key: string;
  note: string | null;
  created_at: string;
  receipt_url: string | null;
}

interface CompanyExpense {
  id: number;
  expense_date: string;
  direction: Direction;
  category: string;
  amount: number;
  description: string | null;
  receipt_url: string | null;
  created_at: string | null;
}

interface WalletTxn {
  id: number;
  transaction_date: string;
  direction: Direction;
  category: string;
  amount: number;
  description: string | null;
  receipt_url: string | null;
}

interface EmployeeOption {
  employee_id: string;
  full_name: string | null;
}

type ToastState = { message: string; type: 'success' | 'error' } | null;

// ─── Category options ─────────────────────────────────────────────────────────

export const CAR_CATEGORIES: Record<Direction, string[]> = {
  IN: ['Rent Collection', 'Other'],
  OUT: ['Wash', 'Oil', 'Petrol', 'HGS', 'Maintenance', 'Other'],
};

export const COMPANY_CATEGORIES: Record<Direction, string[]> = {
  IN: ['Deposit from Manager', 'Refund', 'Other'],
  OUT: ['Marketing', 'Operations', 'Branch', 'Maintenance', 'Food', 'Other'],
};

const WALLET_CATEGORIES: Record<Direction, string[]> = {
  IN: ['Custody from Manager', 'Other'],
  OUT: ['Wash', 'Maintenance', 'GPS', 'Branch', 'Other'],
};

/**
 * Stored value → `categories.<key>`. The database keeps the English value; only
 * the label is translated, and a legacy value not listed here shows as stored.
 */
const CATEGORY_KEYS: Record<string, string> = {
  'Rent Collection': 'rentCollection',
  Wash: 'wash',
  Oil: 'oil',
  Petrol: 'petrol',
  HGS: 'hgs',
  Maintenance: 'maintenance',
  'Deposit from Manager': 'depositFromManager',
  Refund: 'refund',
  Marketing: 'marketing',
  Operations: 'operations',
  Branch: 'branch',
  Food: 'food',
  'Custody from Manager': 'custodyFromManager',
  GPS: 'gps',
  Parking: 'parking',
  'Office supplies': 'officeSupplies',
  Transport: 'transport',
  Other: 'other',
};

export function categoryLabel(t: TFunction, value: string | null): string {
  if (!value) return '—';
  const key = CATEGORY_KEYS[value];
  return key ? t(`categories.${key}`) : value;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad(n: number): string { return String(n).padStart(2, '0'); }

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

export function formatDateDisplay(s: string | null, locale: string): string {
  if (!s) return '—';
  const d = new Date(s + 'T00:00:00');
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatMonthLabel(d: Date, locale: string): string {
  return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

/** Western digits in Arabic, matching Bookings and Calendar. */
export function useDateLocale(): string {
  const { i18n } = useTranslation();
  return i18n.resolvedLanguage?.startsWith('ar') ? 'ar-u-nu-latn' : 'en-GB';
}

async function uploadReceipt(bucket: string, file: File): Promise<string | null> {
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
  const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(fileName, file, { upsert: true });
  if (error) return null;
  const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
  return data.publicUrl;
}

// ─── Car transaction receipts ────────────────────────────────────────────────

const RECEIPT_BUCKET = 'transaction-receipts';
const RECEIPT_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
const RECEIPT_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

export function isPdfUrl(url: string): boolean {
  return url.split('?')[0].toLowerCase().endsWith('.pdf');
}

/** Lowercase, no spaces — safe as a storage folder name. */
function slugForPath(s: string): string {
  const slug = (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'unknown';
}

function randomId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Uploads to `transaction-receipts` and returns the public URL. Throws on failure. */
async function uploadTransactionReceipt(carKey: string, file: File): Promise<string> {
  const nameExt = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  const ext = /^[a-z0-9]{1,5}$/.test(nameExt)
    ? nameExt
    : (file.type === 'application/pdf' ? 'pdf' : 'jpg');
  const path = `${slugForPath(carKey)}/${randomId()}.${ext}`;
  const { error } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(RECEIPT_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const COLOR_IN = '#16a34a';
/** The row a link from an approved expense came to find. */
const FOCUSED_ROW: React.CSSProperties = { background: 'var(--accent-soft)' };
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

const cardStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 16, border: '1px solid var(--border-subtle)',
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

const EmptyState: React.FC<{ label: string }> = ({ label }) => (
  <div style={{ padding: '52px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
    {label}
  </div>
);

const Spinner: React.FC = () => {
  const { t } = useTranslation('accounting');
  return (
    <div style={{ padding: '52px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
      {t('loading')}
    </div>
  );
};

const DirectionBadge: React.FC<{ direction: Direction }> = ({ direction }) => {
  const { t } = useTranslation('accounting');
  const isIn = direction === 'IN';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700,
      color: isIn ? COLOR_IN : COLOR_OUT,
      background: isIn ? 'rgba(22,163,74,0.1)' : 'rgba(239,68,68,0.1)',
      borderRadius: 20, padding: '3px 10px',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: isIn ? COLOR_IN : COLOR_OUT }} />
      {t(`direction.${direction}`)}
    </span>
  );
};

// ─── Th cell ──────────────────────────────────────────────────────────────────

const Th: React.FC<{ children?: React.ReactNode; align?: 'start' | 'end' }> = ({ children, align = 'start' }) => (
  <th style={{
    padding: '9px 14px', fontSize: 11, fontWeight: 700, color: '#6b7280',
    background: 'var(--surface)', borderBottom: '1px solid var(--border-subtle)', textAlign: align,
    textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap',
  }}>{children}</th>
);

const tdStyle: React.CSSProperties = {
  padding: '11px 14px', fontSize: 13.5, color: '#0f1117',
  borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap',
};

// ════════════════════════════════════════════════════════════════════════════
//  TAB 1 — Car Rental Sheets
// ════════════════════════════════════════════════════════════════════════════

const CarSheetsTab: React.FC<{
  monthDate: Date;
  notify: (t: ToastState) => void;
  /** From a link to one posted row. */
  focusCar: number | null;
  focusEntry: number | null;
  userId: string | null;
  onAnswered: (count: number) => void;
}> = ({ monthDate, notify, focusCar, focusEntry, userId, onAnswered }) => {
  const { t } = useTranslation('accounting');
  const { t: tc } = useTranslation('common');
  const { t: tf } = useTranslation('finance');
  const dateLocale = useDateLocale();
  const { fmt } = useCurrency();
  const monthKey = monthKeyOf(monthDate);

  const [cars, setCars] = useState<CarOption[]>([]);
  const [txns, setTxns] = useState<CarTxn[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCarId, setSelectedCarId] = useState<number | null>(focusCar);
  const [showAdd, setShowAdd] = useState(false);
  const [editTxn, setEditTxn] = useState<CarTxn | null>(null);
  const [deleteTxn, setDeleteTxn] = useState<CarTxn | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewReceipt, setViewReceipt] = useState<string | null>(null);

  // PDFs open in a new tab; images open in the lightbox.
  const openReceipt = (url: string) => {
    if (isPdfUrl(url)) window.open(url, '_blank', 'noopener,noreferrer');
    else setViewReceipt(url);
  };

  // Quietly after a suggestion lands, or the spinner would take away the row it animates.
  const loadTxns = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    const { data } = await supabase
      .from('team_car_transactions')
      .select('id, car_id, plate_number, model_name, category, amount, direction, date, month_key, note, created_at')
      .eq('month_key', monthKey)
      .order('date', { ascending: false });
    const rows = (data ?? []).map((r: any) => ({ ...r, receipt_url: null })) as CarTxn[];

    // The view doesn't carry receipt_url, so pull just (id, receipt_url) from the
    // underlying table for the rows we already have. No investor/commission field
    // is ever requested, and no row outside the view is ever fetched.
    if (rows.length > 0) {
      const { data: receipts } = await supabase
        .from('financial_transactions')
        .select('id, receipt_url')
        .in('id', rows.map(r => r.id));
      if (receipts) {
        const byId = new Map<number, string | null>(receipts.map((r: any) => [r.id, r.receipt_url ?? null]));
        for (const row of rows) row.receipt_url = byId.get(row.id) ?? null;
      }
    }

    setTxns(rows);
    setLoading(false);
  }, [monthKey]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('cars')
        .select('id, plate_number, investor_id, model_group(name)')
        .eq('is_active', true)
        .order('plate_number');
      if (!active) return;
      const opts: CarOption[] = (data ?? []).map((c: any) => ({
        id: c.id,
        plate_number: c.plate_number,
        model_name: c.model_group?.name ?? '',
        investor_id: c.investor_id ?? null,
      }));
      setCars(sortCarsByModel(opts));
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => { loadTxns(); }, [loadTxns]);

  const filteredCars = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cars;
    return cars.filter(c =>
      c.plate_number.toLowerCase().includes(q) || c.model_name.toLowerCase().includes(q));
  }, [cars, search]);

  const carTxns = useMemo(
    () => txns.filter(t => t.car_id === selectedCarId), [txns, selectedCarId]);

  const totalsByCar = useMemo(() => {
    const totals: Record<number, { in: number; out: number; net: number }> = {};
    for (const txn of txns) {
      const car = totals[txn.car_id] ?? { in: 0, out: 0, net: 0 };
      if (txn.direction === 'IN') car.in += txn.amount;
      else car.out += txn.amount;
      car.net = car.in - car.out;
      totals[txn.car_id] = car;
    }
    return totals;
  }, [txns]);

  const [freshTxn, setFreshTxn] = useState<number | null>(null);
  const pickerCars = useMemo(() => cars.map(car => ({ id: car.id, plate_number: car.plate_number, model: car.model_name || null })), [cars]);
  const suggestions = useSuggestions({
    scope: 'car',
    month: monthKey,
    cars: pickerCars,
    userId,
    onPosted: result => {
      setFreshTxn(result.car_tx_id);
      void loadTxns(true);
    },
    onAnswered,
    notify: (message, failed) => notify({ message, type: failed ? 'error' : 'success' }),
  });
  const suggestedByCar = useMemo(() => {
    const byCar = new Map<number, typeof suggestions.shown>();
    suggestions.shown.forEach(row => { if (row.car_id !== null) byCar.set(row.car_id, [...(byCar.get(row.car_id) ?? []), row]); });
    return byCar;
  }, [suggestions.shown]);

  const handleDelete = async () => {
    if (!deleteTxn || deleting) return;
    setDeleting(true);
    // Delete from the underlying table (the view is read-only), matched by id.
    const { error } = await supabase.from('financial_transactions').delete().eq('id', deleteTxn.id);
    setDeleting(false);
    setDeleteTxn(null);
    if (error) { notify({ message: t('toast.txnDeleteError'), type: 'error' }); return; }
    notify({ message: t('toast.txnDeleted'), type: 'success' });
    await loadTxns();
  };

  return (
    <div>
      <SuggestionBanner suggestions={suggestions} />
      <div className="hc-acc-sheet-tools">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('cars.search')} aria-label={t('cars.search')} className="hc-input" />
        <Button onClick={() => setShowAdd(true)}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          {t('cars.addTransaction')}
        </Button>
      </div>

      {loading ? <Spinner /> : cars.length === 0 ? <EmptyState label={t('cars.noCars')} /> : (
        <ul className="hc-acc-sheets">
          {filteredCars.map(car => {
            const open = car.id === selectedCarId;
            const own = totalsByCar[car.id];
            const suggested = suggestedByCar.get(car.id) ?? [];
            return (
              <li key={car.id} className="surface-depth">
                <button type="button" className="hc-acc-sheet-head" aria-expanded={open} onClick={() => setSelectedCarId(open ? null : car.id)}>
                  <span className="hc-acc-sheet-car">
                    <PlateChip plate={car.plate_number} />
                    <small dir="auto">{car.model_name || '—'}</small>
                    {suggested.length > 0 && <span className="hc-sug-chip">{tf('suggested.chip', { count: suggested.length })}</span>}
                  </span>
                  <span className="hc-acc-sheet-figures">
                    <span><small>{t('summary.totalIn')}</small><b className="is-in"><bdi dir="ltr">{fmt(own?.in ?? 0)}</bdi></b></span>
                    <span><small>{t('summary.totalOut')}</small><b className="is-out"><bdi dir="ltr">{fmt(own?.out ?? 0)}</bdi></b></span>
                    <span><small>{t('summary.balance')}</small><b className={(own?.net ?? 0) < 0 ? 'is-out' : 'is-in'}><bdi dir="ltr">{(own?.net ?? 0) < 0 ? '−' : '+'}{fmt(own?.net ?? 0)}</bdi></b></span>
                  </span>
                  <svg className="hc-appr-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                {open && (
                  <div className="hc-acc-sheet-body">
                    {carTxns.length === 0 ? (suggested.length === 0 && <EmptyState label={t('cars.noTransactions')} />) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 660 }}>
              <thead>
                <tr>
                  <Th>{tc('fields.date')}</Th><Th>{t('table.direction')}</Th><Th>{t('table.category')}</Th><Th>{t('table.note')}</Th><Th>{t('table.receipt')}</Th><Th align="end">{t('table.amount')}</Th><Th align="end">{t('table.actions')}</Th>
                </tr>
              </thead>
              <tbody>
                {carTxns.map(txn => (
                  <tr key={txn.id} className={txn.id === freshTxn ? 'hc-row-new' : undefined} style={txn.id === focusEntry ? FOCUSED_ROW : undefined}>
                    <td style={tdStyle}>{formatDateDisplay(txn.date, dateLocale)}</td>
                    <td style={tdStyle}><DirectionBadge direction={txn.direction} /></td>
                    <td style={tdStyle}>{categoryLabel(t, txn.category)}</td>
                    <td style={{ ...tdStyle, whiteSpace: 'normal', color: '#6b7280', maxWidth: 260 }}>{txn.note || '—'}</td>
                    <td style={tdStyle}>
                      {txn.receipt_url
                        ? <ReceiptChip url={txn.receipt_url} onOpen={() => openReceipt(txn.receipt_url!)} />
                        : <span style={{ color: '#d1d5db' }}>—</span>}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'end', fontWeight: 700, color: txn.direction === 'IN' ? COLOR_IN : COLOR_OUT }}>
                      <span className="hc-num">{txn.direction === 'IN' ? '+' : '−'}{fmt(txn.amount)}</span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'end' }}>
                      <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button onClick={() => setEditTxn(txn)} title={tc('actions.edit')} style={rowActionBtn}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <button onClick={() => setDeleteTxn(txn)} title={tc('actions.delete')} style={{ ...rowActionBtn, color: COLOR_OUT }}>
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
                    )}
                    <SuggestionList suggestions={suggestions} rows={suggested} onOpenReceipt={openReceipt} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {showAdd && (
        <AddCarTxnModal
          cars={cars}
          defaultCarId={selectedCarId}
          onClose={() => setShowAdd(false)}
          onSaved={async (carId, warning) => {
            setShowAdd(false);
            setSelectedCarId(carId);
            notify(warning
              ? { message: warning, type: 'error' }
              : { message: t('toast.txnAdded'), type: 'success' });
            await loadTxns();
          }}
          onError={() => notify({ message: t('toast.txnSaveError'), type: 'error' })}
        />
      )}
      {editTxn && (
        <EditCarTxnModal
          txn={editTxn}
          onClose={() => setEditTxn(null)}
          onSaved={async (warning) => {
            setEditTxn(null);
            notify(warning
              ? { message: warning, type: 'error' }
              : { message: t('toast.txnUpdated'), type: 'success' });
            await loadTxns();
          }}
          onError={() => notify({ message: t('toast.txnUpdateError'), type: 'error' })}
        />
      )}
      <SuggestionDialogs suggestions={suggestions} />
      {viewReceipt && <ReceiptLightbox url={viewReceipt} onClose={() => setViewReceipt(null)} />}
      {deleteTxn && (
        <ConfirmDialog
          title={t('cars.deleteTitle')}
          message={t('cars.deleteMessage')}
          confirmLabel={tc('actions.delete')}
          busy={deleting}
          onConfirm={handleDelete}
          onClose={() => setDeleteTxn(null)}
        />
      )}
    </div>
  );
};

const AddCarTxnModal: React.FC<{
  cars: CarOption[];
  defaultCarId: number | null;
  onClose: () => void;
  onSaved: (carId: number, warning?: string) => void;
  onError: () => void;
}> = ({ cars, defaultCarId, onClose, onSaved, onError }) => {
  const { t } = useTranslation('accounting');
  const { t: tc } = useTranslation('common');
  const [carId, setCarId] = useState<number | ''>(defaultCarId ?? '');
  const [direction, setDirection] = useState<Direction>('IN');
  const [category, setCategory] = useState<string>(CAR_CATEGORIES.IN[0]);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(toDateStr(new Date()));
  const [note, setNote] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const chooseDirection = (d: Direction) => {
    setDirection(d);
    setCategory(CAR_CATEGORIES[d][0]);
  };

  const canSave = carId !== '' && Number(amount) > 0 && !!date && !!category;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    const car = cars.find(c => c.id === carId);
    if (!car) { setSaving(false); onError(); return; }

    // The receipt is optional: a failed upload never blocks the transaction,
    // it only downgrades the success toast to a clear warning.
    let receipt_url: string | null = null;
    let warning: string | undefined;
    if (receiptFile) {
      setUploading(true);
      try {
        receipt_url = await uploadTransactionReceipt(car.plate_number || String(car.id), receiptFile);
      } catch (e) {
        warning = t('toast.receiptSavedWarning', { error: (e as Error).message });
      }
      setUploading(false);
    }

    // Silent investor_id — required NOT NULL, never shown to the accountant.
    const { error } = await supabase.from('financial_transactions').insert({
      sheet_type: 'car',
      car_id: car.id,
      investor_id: car.investor_id,
      category,
      amount: Number(amount),
      direction,
      date,
      month_key: date.slice(0, 7),
      note: note.trim() || null,
      receipt_url,
    });
    setSaving(false);
    if (error) { onError(); return; }
    onSaved(car.id, warning);
  };

  return (
    <Modal title={t('cars.addTitle')} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={labelStyle}>{tc('fields.car')}</label>
          <select value={carId} onChange={e => setCarId(e.target.value ? Number(e.target.value) : '')} style={inputStyle}>
            <option value="">{t('form.selectCar')}</option>
            {cars.map(c => (
              <option key={c.id} value={c.id}>
                {c.plate_number}{c.model_name ? ` — ${c.model_name}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>{t('table.direction')}</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {(['IN', 'OUT'] as Direction[]).map(d => {
              const on = direction === d;
              const c = d === 'IN' ? COLOR_IN : COLOR_OUT;
              return (
                <button key={d} onClick={() => chooseDirection(d)} style={{
                  height: 42, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 14, fontWeight: 700,
                  border: on ? `1.5px solid ${c}` : '1px solid #e5e7eb',
                  background: on ? (d === 'IN' ? 'rgba(22,163,74,0.08)' : 'rgba(239,68,68,0.08)') : '#fff',
                  color: on ? c : '#6b7280',
                }}>{t(`direction.${d}`)}</button>
              );
            })}
          </div>
        </div>

        <div>
          <label style={labelStyle}>{t('table.category')}</label>
          <select value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}>
            {CAR_CATEGORIES[direction].map(c => <option key={c} value={c}>{categoryLabel(t, c)}</option>)}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>{t('table.amount')}</label>
            <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="0.00" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>{tc('fields.date')}</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>{t('form.noteOptional')}</label>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder={t('form.notePlaceholder')} style={inputStyle} />
        </div>

        <ReceiptField
          file={receiptFile}
          existingUrl={null}
          onFileChange={setReceiptFile}
          onRemoveExisting={() => {}}
          disabled={saving}
        />

        <Button
          disabled={!canSave || saving} onClick={handleSave}
          style={{ width: '100%' }}
>
          {uploading ? t('form.uploadingReceipt') : saving ? tc('actions.saving') : t('form.saveTransaction')}
        </Button>
      </div>
    </Modal>
  );
};

const EditCarTxnModal: React.FC<{
  txn: CarTxn;
  onClose: () => void;
  onSaved: (warning?: string) => void;
  onError: () => void;
}> = ({ txn, onClose, onSaved, onError }) => {
  const { t } = useTranslation('accounting');
  const { t: tc } = useTranslation('common');
  const [direction, setDirection] = useState<Direction>(txn.direction);
  const [category, setCategory] = useState<string>(txn.category ?? CAR_CATEGORIES[txn.direction][0]);
  const [amount, setAmount] = useState(String(txn.amount));
  const [date, setDate] = useState(txn.date);
  const [note, setNote] = useState(txn.note ?? '');
  const [existingReceipt, setExistingReceipt] = useState<string | null>(txn.receipt_url);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const chooseDirection = (d: Direction) => {
    setDirection(d);
    setCategory(CAR_CATEGORIES[d][0]);
  };

  // Keep the row's existing category selectable even if it's an older/legacy value.
  const categoryOptions = CAR_CATEGORIES[direction].includes(category)
    ? CAR_CATEGORIES[direction]
    : [category, ...CAR_CATEGORIES[direction]];

  const canSave = Number(amount) > 0 && !!date && !!category;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);

    // Receipt stays optional: a new file replaces the old URL, clearing it sets
    // NULL, and an upload failure falls back to whatever was already stored.
    let receipt_url: string | null = existingReceipt;
    let warning: string | undefined;
    if (receiptFile) {
      setUploading(true);
      try {
        receipt_url = await uploadTransactionReceipt(txn.plate_number || String(txn.car_id), receiptFile);
      } catch (e) {
        warning = t('toast.receiptUpdatedWarning', { error: (e as Error).message });
      }
      setUploading(false);
    }

    // UPDATE the underlying table by id. investor_id, sheet_type and any
    // commission fields are intentionally left untouched.
    const { error } = await supabase.from('financial_transactions').update({
      direction,
      category,
      amount: Number(amount),
      date,
      month_key: date.slice(0, 7),
      note: note.trim() || null,
      receipt_url,
    }).eq('id', txn.id);
    setSaving(false);
    if (error) { onError(); return; }
    onSaved(warning);
  };

  return (
    <Modal title={t('cars.editTitle')} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <DirectionPicker direction={direction} onChange={chooseDirection} />

        <div>
          <label style={labelStyle}>{t('table.category')}</label>
          <select value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}>
            {categoryOptions.map(c => <option key={c} value={c}>{categoryLabel(t, c)}</option>)}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>{t('table.amount')}</label>
            <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="0.00" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>{tc('fields.date')}</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>{t('form.noteOptional')}</label>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder={t('form.notePlaceholder')} style={inputStyle} />
        </div>

        <ReceiptField
          file={receiptFile}
          existingUrl={existingReceipt}
          onFileChange={setReceiptFile}
          onRemoveExisting={() => setExistingReceipt(null)}
          disabled={saving}
        />

        <Button
          disabled={!canSave || saving} onClick={handleSave}
          style={{ width: '100%' }}
>
          {uploading ? t('form.uploadingReceipt') : saving ? tc('actions.saving') : tc('actions.saveChanges')}
        </Button>
      </div>
    </Modal>
  );
};

// ════════════════════════════════════════════════════════════════════════════
//  TAB 2 — Company & Employee Expenses
// ════════════════════════════════════════════════════════════════════════════

const CompanyExpensesSection: React.FC<{
  monthDate: Date;
  userId: string | null;
  notify: (t: ToastState) => void;
  focusEntry: number | null;
  onAnswered: (count: number) => void;
  onOpenReceipt: (url: string) => void;
}> = ({ monthDate, userId, notify, focusEntry, onAnswered, onOpenReceipt }) => {
  const { t } = useTranslation('accounting');
  const { t: tc } = useTranslation('common');
  const dateLocale = useDateLocale();
  const { fmt } = useCurrency();
  const [rows, setRows] = useState<CompanyExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editRow, setEditRow] = useState<CompanyExpense | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CompanyExpense | null>(null);
  const [deleting, setDeleting] = useState(false);

  const monthStart = toDateStr(new Date(monthDate.getFullYear(), monthDate.getMonth(), 1));
  const monthEnd = toDateStr(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0));

  const [freshRow, setFreshRow] = useState<number | null>(null);

  // Quietly after a suggestion lands, or the spinner would take away the row it animates.
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    const { data } = await supabase
      .from('company_expenses')
      .select('id, expense_date, direction, category, amount, description, receipt_url, created_at')
      .gte('expense_date', monthStart)
      .lte('expense_date', monthEnd)
      .order('expense_date', { ascending: false });
    setRows((data ?? []) as CompanyExpense[]);
    setLoading(false);
  }, [monthStart, monthEnd]);

  useEffect(() => { load(); }, [load]);

  const suggestions = useSuggestions({
    scope: 'company',
    month: monthStart.slice(0, 7),
    userId,
    onPosted: result => {
      setFreshRow(result.company_expense_id);
      void load(true);
    },
    onAnswered,
    notify: (message, failed) => notify({ message, type: failed ? 'error' : 'success' }),
  });

  const totals = useMemo(() => {
    let tin = 0, tout = 0;
    for (const r of rows) (r.direction === 'IN' ? (tin += r.amount) : (tout += r.amount));
    return { tin, tout, net: tin - tout };
  }, [rows]);

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    const { error } = await supabase.from('company_expenses').delete().eq('id', deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
    if (error) { notify({ message: t('toast.expenseDeleteError'), type: 'error' }); return; }
    notify({ message: t('toast.expenseDeleted'), type: 'success' });
    await load();
  };

  return (
    <div>
      <SuggestionBanner suggestions={suggestions} />
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <SummaryPill label={t('summary.totalIn')} value={fmt(totals.tin)} color={COLOR_IN} />
        <SummaryPill label={t('summary.totalOut')} value={fmt(totals.tout)} color={COLOR_OUT} />
        <SummaryPill label={t('summary.net')} value={`${totals.net >= 0 ? '+' : '−'}${fmt(totals.net)}`} color={totals.net >= 0 ? COLOR_IN : COLOR_OUT} />
        <div style={{ flex: 1 }} />
        <Button onClick={() => setShowAdd(true)}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          {t('expenses.addExpense')}
        </Button>
      </div>

      <div className="surface-depth" style={{ ...cardStyle, overflow: 'hidden' }}>
        <SuggestionList suggestions={suggestions} rows={suggestions.shown} onOpenReceipt={onOpenReceipt} />
        <div style={{ overflowX: 'auto' }}>
          {loading ? <Spinner /> : rows.length === 0 ? (suggestions.shown.length === 0 && <EmptyState label={t('expenses.empty')} />) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr>
                  <Th>{tc('fields.date')}</Th><Th>{t('table.direction')}</Th><Th>{t('table.category')}</Th><Th>{tc('fields.description')}</Th><Th>{t('table.receipt')}</Th><Th align="end">{t('table.amount')}</Th><Th align="end">{t('table.actions')}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className={r.id === freshRow ? 'hc-row-new' : undefined} style={r.id === focusEntry ? FOCUSED_ROW : undefined}>
                    <td style={tdStyle}>{formatDateDisplay(r.expense_date, dateLocale)}</td>
                    <td style={tdStyle}><DirectionBadge direction={r.direction} /></td>
                    <td style={tdStyle}>{categoryLabel(t, r.category)}</td>
                    <td style={{ ...tdStyle, whiteSpace: 'normal', color: '#6b7280', maxWidth: 280 }}>{r.description || '—'}</td>
                    <td style={tdStyle}>{r.receipt_url
                      ? <a href={r.receipt_url} target="_blank" rel="noreferrer" style={{ color: '#3A74C2', fontWeight: 600, textDecoration: 'none' }}>{t('receipt.view')}</a>
                      : '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'end', fontWeight: 700, color: r.direction === 'IN' ? COLOR_IN : COLOR_OUT }}>
                      <span className="hc-num">{r.direction === 'IN' ? '+' : '−'}{fmt(r.amount)}</span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'end' }}>
                      <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button onClick={() => setEditRow(r)} title={tc('actions.edit')} style={rowActionBtn}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <button onClick={() => setDeleteTarget(r)} title={tc('actions.delete')} style={{ ...rowActionBtn, color: COLOR_OUT }}>
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
          )}
        </div>
      </div>

      <SuggestionDialogs suggestions={suggestions} />
      {showAdd && (
        <AddCompanyExpenseModal
          userId={userId}
          onClose={() => setShowAdd(false)}
          onSaved={async () => { setShowAdd(false); notify({ message: t('toast.expenseAdded'), type: 'success' }); await load(); }}
          onError={() => notify({ message: t('toast.expenseSaveError'), type: 'error' })}
        />
      )}
      {editRow && (
        <EditCompanyExpenseModal
          row={editRow}
          onClose={() => setEditRow(null)}
          onSaved={async () => { setEditRow(null); notify({ message: t('toast.expenseUpdated'), type: 'success' }); await load(); }}
          onError={() => notify({ message: t('toast.expenseUpdateError'), type: 'error' })}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          title={t('expenses.deleteTitle')}
          message={t('expenses.deleteMessage')}
          confirmLabel={tc('actions.delete')}
          busy={deleting}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
};

const EditCompanyExpenseModal: React.FC<{
  row: CompanyExpense;
  onClose: () => void;
  onSaved: () => void;
  onError: () => void;
}> = ({ row, onClose, onSaved, onError }) => {
  const [direction, setDirection] = useState<Direction>(row.direction);
  const [category, setCategory] = useState(row.category);
  const [amount, setAmount] = useState(String(row.amount));
  const [description, setDescription] = useState(row.description ?? '');
  const [date, setDate] = useState(row.expense_date);
  const { t } = useTranslation('accounting');
  const { t: tc } = useTranslation('common');
  const [saving, setSaving] = useState(false);

  const chooseDirection = (d: Direction) => { setDirection(d); setCategory(COMPANY_CATEGORIES[d][0]); };

  // Keep the row's existing category selectable even if it's an older/legacy value.
  const categoryOptions = COMPANY_CATEGORIES[direction].includes(category)
    ? COMPANY_CATEGORIES[direction]
    : [category, ...COMPANY_CATEGORIES[direction]];

  const canSave = Number(amount) > 0 && !!date && !!category;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    const { error } = await supabase.from('company_expenses').update({
      expense_date: date,
      direction,
      category,
      amount: Number(amount),
      description: description.trim() || null,
    }).eq('id', row.id);
    setSaving(false);
    if (error) { onError(); return; }
    onSaved();
  };

  return (
    <Modal title={t('expenses.editTitle')} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <DirectionPicker direction={direction} onChange={chooseDirection} />
        <div>
          <label style={labelStyle}>{t('table.category')}</label>
          <select value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}>
            {categoryOptions.map(c => <option key={c} value={c}>{categoryLabel(t, c)}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>{t('table.amount')}</label>
            <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>{tc('fields.date')}</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>{t('form.descriptionOptional')}</label>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder={t('form.descriptionPlaceholder')} style={inputStyle} />
        </div>
        <Button disabled={!canSave || saving} onClick={handleSave} style={{ width: '100%' }}>
          {saving ? tc('actions.saving') : tc('actions.saveChanges')}
        </Button>
      </div>
    </Modal>
  );
};

const AddCompanyExpenseModal: React.FC<{
  userId: string | null;
  onClose: () => void;
  onSaved: () => void;
  onError: () => void;
}> = ({ userId, onClose, onSaved, onError }) => {
  const { t } = useTranslation('accounting');
  const { t: tc } = useTranslation('common');
  const [direction, setDirection] = useState<Direction>('OUT');
  const [category, setCategory] = useState(COMPANY_CATEGORIES.OUT[0]);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(toDateStr(new Date()));
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const chooseDirection = (d: Direction) => { setDirection(d); setCategory(COMPANY_CATEGORIES[d][0]); };
  const canSave = Number(amount) > 0 && !!date && !!category;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    let receipt_url: string | null = null;
    if (file) {
      receipt_url = await uploadReceipt('company_expenses', file);
      if (!receipt_url) { setSaving(false); onError(); return; }
    }
    const { error } = await supabase.from('company_expenses').insert({
      expense_date: date,
      direction,
      category,
      amount: Number(amount),
      description: description.trim() || null,
      receipt_url,
      created_by: userId,
    });
    setSaving(false);
    if (error) { onError(); return; }
    onSaved();
  };

  return (
    <Modal title={t('expenses.addTitle')} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <DirectionPicker direction={direction} onChange={chooseDirection} />
        <div>
          <label style={labelStyle}>{t('table.category')}</label>
          <select value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}>
            {COMPANY_CATEGORIES[direction].map(c => <option key={c} value={c}>{categoryLabel(t, c)}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>{t('table.amount')}</label>
            <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>{tc('fields.date')}</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>{t('form.descriptionOptional')}</label>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder={t('form.descriptionPlaceholder')} style={inputStyle} />
        </div>
        <FileField file={file} onChange={setFile} />
        <Button disabled={!canSave || saving} onClick={handleSave} style={{ width: '100%' }}>
          {saving ? tc('actions.saving') : t('form.saveExpense')}
        </Button>
      </div>
    </Modal>
  );
};

export const EditWalletTxnModal: React.FC<{
  row: WalletTxn;
  onClose: () => void;
  onSaved: () => void;
  onError: () => void;
}> = ({ row, onClose, onSaved, onError }) => {
  const [direction, setDirection] = useState<Direction>(row.direction);
  const [category, setCategory] = useState(row.category);
  const [amount, setAmount] = useState(String(row.amount));
  const [description, setDescription] = useState(row.description ?? '');
  const [date, setDate] = useState(row.transaction_date);
  const { t } = useTranslation('accounting');
  const { t: tc } = useTranslation('common');
  const [saving, setSaving] = useState(false);

  const chooseDirection = (d: Direction) => { setDirection(d); setCategory(WALLET_CATEGORIES[d][0]); };

  // Keep the row's existing category selectable even if it's an older/legacy value.
  const categoryOptions = WALLET_CATEGORIES[direction].includes(category)
    ? WALLET_CATEGORIES[direction]
    : [category, ...WALLET_CATEGORIES[direction]];

  const canSave = Number(amount) > 0 && !!date && !!category;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    const { error } = await supabase.from('employee_wallets').update({
      transaction_date: date,
      direction,
      category,
      amount: Number(amount),
      description: description.trim() || null,
    }).eq('id', row.id);
    setSaving(false);
    if (error) { onError(); return; }
    onSaved();
  };

  return (
    <Modal title={t('wallets.editTitle')} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <DirectionPicker direction={direction} onChange={chooseDirection} />
        <div>
          <label style={labelStyle}>{t('table.category')}</label>
          <select value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}>
            {categoryOptions.map(c => <option key={c} value={c}>{categoryLabel(t, c)}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>{t('table.amount')}</label>
            <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>{tc('fields.date')}</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>{t('form.descriptionOptional')}</label>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder={t('form.descriptionPlaceholder')} style={inputStyle} />
        </div>
        <Button disabled={!canSave || saving} onClick={handleSave} style={{ width: '100%' }}>
          {saving ? tc('actions.saving') : tc('actions.saveChanges')}
        </Button>
      </div>
    </Modal>
  );
};

export const AddWalletEntryModal: React.FC<{
  userId: string | null;
  onClose: () => void;
  onSaved: () => void;
  onError: () => void;
}> = ({ userId, onClose, onSaved, onError }) => {
  const { t } = useTranslation('accounting');
  const { t: tc } = useTranslation('common');
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [direction, setDirection] = useState<Direction>('IN');
  const [category, setCategory] = useState(WALLET_CATEGORIES.IN[0]);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(toDateStr(new Date()));
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      // This view already covers both admin and staff — admins hold custody wallets too.
      const { data } = await supabase.from('employee_wallet_balances').select('employee_id, full_name').order('full_name');
      if (active) setEmployees((data ?? []) as EmployeeOption[]);
    })();
    return () => { active = false; };
  }, []);

  const chooseDirection = (d: Direction) => { setDirection(d); setCategory(WALLET_CATEGORIES[d][0]); };
  // Posting an expense builds the sheet's note from its description.
  const canSave = !!employeeId && Number(amount) > 0 && !!date && !!category && (direction === 'IN' || !!description.trim());

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    let receipt_url: string | null = null;
    if (file) {
      receipt_url = await uploadReceipt('employee_wallets', file);
      if (!receipt_url) { setSaving(false); onError(); return; }
    }
    const { error } = await supabase.from('employee_wallets').insert({
      employee_id: employeeId,
      transaction_date: date,
      direction,
      category,
      amount: Number(amount),
      description: description.trim() || null,
      receipt_url,
      created_by: userId,
    });
    setSaving(false);
    if (error) { onError(); return; }
    onSaved();
  };

  return (
    <Modal title={t('wallets.addTitle')} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={labelStyle}>{t('form.employee')}</label>
          <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} style={inputStyle}>
            <option value="">{t('form.selectEmployee')}</option>
            {employees.map(e => <option key={e.employee_id} value={e.employee_id}>{e.full_name || e.employee_id}</option>)}
          </select>
        </div>
        <DirectionPicker direction={direction} onChange={chooseDirection} />
        <div>
          <label style={labelStyle}>{t('table.category')}</label>
          <select value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}>
            {WALLET_CATEGORIES[direction].map(c => <option key={c} value={c}>{categoryLabel(t, c)}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>{t('table.amount')}</label>
            <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>{tc('fields.date')}</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>{t('form.descriptionOptional')}</label>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder={t('form.descriptionPlaceholder')} style={inputStyle} />
        </div>
        <FileField file={file} onChange={setFile} />
        <Button disabled={!canSave || saving} onClick={handleSave} style={{ width: '100%' }}>
          {saving ? tc('actions.saving') : t('form.saveEntry')}
        </Button>
      </div>
    </Modal>
  );
};

const ConfirmDialog: React.FC<{
  title: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}> = ({ title, message, confirmLabel, busy, onConfirm, onClose }) => {
  const { t } = useTranslation('accounting');
  const { t: tc } = useTranslation('common');
  return (
  <Modal title={title} onClose={onClose} maxWidth={420}>
    <p style={{ margin: '0 0 22px', fontSize: 14, color: '#4b5563', lineHeight: 1.55 }}>{message}</p>
    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
      <Button variant="secondary" onClick={onClose}>{tc('actions.cancel')}</Button>
      <Button variant="destructive" onClick={onConfirm} disabled={busy}>{busy ? t('confirm.deleting') : confirmLabel ?? t('confirm.confirm')}</Button>
    </div>
  </Modal>
  );
};

// ─── Small shared form widgets ────────────────────────────────────────────────

const rowActionBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff',
  cursor: 'pointer', color: '#6b7280', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};

const SummaryPill: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <div className="surface-depth" style={{ ...cardStyle, padding: '10px 16px', minWidth: 130 }}>
    <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{label}</div>
    <div style={{ fontSize: 18, fontWeight: 800, color }}><bdi dir="ltr">{value}</bdi></div>
  </div>
);

const DirectionPicker: React.FC<{ direction: Direction; onChange: (d: Direction) => void }> = ({ direction, onChange }) => {
  const { t } = useTranslation('accounting');
  return (
  <div>
    <label style={labelStyle}>{t('table.direction')}</label>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {(['IN', 'OUT'] as Direction[]).map(d => {
        const on = direction === d;
        const c = d === 'IN' ? COLOR_IN : COLOR_OUT;
        return (
          <button key={d} onClick={() => onChange(d)} style={{
            height: 42, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
            border: on ? `1.5px solid ${c}` : '1px solid #e5e7eb',
            background: on ? (d === 'IN' ? 'rgba(22,163,74,0.08)' : 'rgba(239,68,68,0.08)') : '#fff',
            color: on ? c : '#6b7280',
          }}>{t(`direction.${d}`)}</button>
        );
      })}
    </div>
  </div>
  );
};

const FileField: React.FC<{ file: File | null; onChange: (f: File | null) => void }> = ({ file, onChange }) => {
  const { t } = useTranslation('accounting');
  return (
  <div>
    <label style={labelStyle}>{t('receipt.optional')}</label>
    <label style={{
      ...inputStyle, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
      color: file ? '#0f1117' : '#9ca3af', overflow: 'hidden',
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: '#9ca3af' }}>
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {file ? file.name : t('receipt.upload')}
      </span>
      <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
        onChange={e => onChange(e.target.files?.[0] ?? null)} />
    </label>
  </div>
  );
};

// ─── Car transaction receipt widgets ─────────────────────────────────────────

const receiptThumb: React.CSSProperties = {
  width: 54, height: 54, borderRadius: 10, objectFit: 'cover', display: 'block',
  border: '1px solid #e5e7eb', background: '#fafafa', flexShrink: 0,
};

const receiptSmallBtn: React.CSSProperties = {
  height: 28, padding: '0 10px', borderRadius: 8, border: '1px solid #e5e7eb',
  background: '#fff', cursor: 'pointer', fontFamily: 'inherit',
  fontSize: 12, fontWeight: 600, color: '#6b7280',
  display: 'inline-flex', alignItems: 'center',
};

const DocTile: React.FC = () => (
  <div style={{ ...receiptThumb, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM14 2v6h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </div>
);

/** Row indicator — only rendered for transactions that have a receipt. */
const ReceiptChip: React.FC<{ url: string; onOpen: () => void }> = ({ url, onOpen }) => {
  const { t } = useTranslation('accounting');
  return (
  <button onClick={onOpen} title={t('receipt.viewReceipt')} style={{
    ...receiptSmallBtn, gap: 5, color: '#3A74C2', borderColor: 'rgba(75,166,234,0.35)',
    background: 'rgba(75,166,234,0.08)',
  }}>
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <path d="M4 4a2 2 0 012-2h8l6 6v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zM14 2v6h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    {isPdfUrl(url) ? 'PDF' : t('receipt.view')}
  </button>
  );
};

export const ReceiptLightbox: React.FC<{ url: string; onClose: () => void }> = ({ url, onClose }) => {
  const { t } = useTranslation('accounting');
  const { t: tc } = useTranslation('common');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return ReactDOM.createPortal(
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(15,17,23,0.72)',
      backdropFilter: 'blur(4px)', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24,
    }}>
      <img
        src={url}
        alt={t('receipt.alt')}
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '100%', maxHeight: '78vh', borderRadius: 14,
          background: '#fff', boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
        }}
      />
      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 8 }}>
        <a href={url} target="_blank" rel="noreferrer" style={{
          ...receiptSmallBtn, height: 34, padding: '0 14px', textDecoration: 'none', color: '#0f1117',
        }}>{t('receipt.openInNewTab')}</a>
        <Button variant="secondary" onClick={onClose}>{tc('actions.close')}</Button>
      </div>
    </div>,
    document.body,
  );
};

/**
 * Optional receipt picker for car transactions. Handles a freshly picked file,
 * an already-stored receipt_url, and removing either of them.
 */
const ReceiptField: React.FC<{
  file: File | null;
  existingUrl: string | null;
  onFileChange: (f: File | null) => void;
  onRemoveExisting: () => void;
  disabled?: boolean;
}> = ({ file, existingUrl, onFileChange, onRemoveExisting, disabled }) => {
  const { t } = useTranslation('accounting');
  const { t: tc } = useTranslation('common');
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) { setPreview(null); return; }
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const pick = (picked: File | null) => {
    if (!picked) return;
    if (!RECEIPT_TYPES.includes(picked.type)) {
      setError(t('receipt.unsupported'));
      return;
    }
    if (picked.size > RECEIPT_MAX_BYTES) {
      setError(t('receipt.tooLarge'));
      return;
    }
    setError(null);
    onFileChange(picked);
  };

  const hiddenInput = (
    <input
      type="file"
      accept={RECEIPT_ACCEPT}
      disabled={disabled}
      style={{ display: 'none' }}
      onChange={e => { pick(e.target.files?.[0] ?? null); e.target.value = ''; }}
    />
  );

  const frame = (children: React.ReactNode) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: 10,
      border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff',
    }}>{children}</div>
  );

  let body: React.ReactNode;

  if (file) {
    body = frame(<>
      {preview
        ? <img src={preview} alt={t('receipt.previewAlt')} style={receiptThumb} />
        : <DocTile />}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f1117', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {file.name}
        </div>
        <div style={{ fontSize: 11.5, color: '#9ca3af' }}>
          {t('receipt.pendingUpload', { size: (file.size / 1024).toFixed(0) })}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <label style={{ ...receiptSmallBtn, cursor: disabled ? 'default' : 'pointer' }}>
          {t('receipt.replace')}{hiddenInput}
        </label>
        <button type="button" disabled={disabled} onClick={() => onFileChange(null)}
          style={{ ...receiptSmallBtn, color: COLOR_OUT }}>{tc('actions.remove')}</button>
      </div>
    </>);
  } else if (existingUrl) {
    const pdf = isPdfUrl(existingUrl);
    body = frame(<>
      {pdf
        ? <DocTile />
        : <img src={existingUrl} alt={t('receipt.current')} style={receiptThumb} />}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f1117' }}>{t('receipt.current')}</div>
        <a href={existingUrl} target="_blank" rel="noreferrer"
          style={{ fontSize: 11.5, color: '#3A74C2', fontWeight: 600, textDecoration: 'none' }}>
          {pdf ? t('receipt.viewPdf') : t('receipt.viewImage')}
        </a>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <label style={{ ...receiptSmallBtn, cursor: disabled ? 'default' : 'pointer' }}>
          {t('receipt.replace')}{hiddenInput}
        </label>
        <button type="button" disabled={disabled} onClick={onRemoveExisting}
          style={{ ...receiptSmallBtn, color: COLOR_OUT }}>{tc('actions.remove')}</button>
      </div>
    </>);
  } else {
    body = (
      <label style={{
        ...inputStyle, display: 'flex', alignItems: 'center', gap: 8,
        cursor: disabled ? 'default' : 'pointer', color: '#9ca3af', overflow: 'hidden',
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {t('receipt.attach')}
        </span>
        {hiddenInput}
      </label>
    );
  }

  return (
    <div>
      <label style={labelStyle}>{t('receipt.optional')}</label>
      {body}
      {error && <div style={{ marginTop: 6, fontSize: 12, color: COLOR_OUT }}>{error}</div>}
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════
//  Page shell
// ════════════════════════════════════════════════════════════════════════════

const TABS: Tab[] = ['home', 'car_sheets', 'company', 'custody', 'customers', 'suppliers'];

/** The names older links and notifications still use. */
const TAB_ALIASES: Record<string, Tab> = { cars: 'car_sheets', expenses: 'company' };

const AccountingPage: React.FC = () => {
  const { t } = useTranslation('accounting');
  const dateLocale = useDateLocale();
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab') ?? '';
  const tab: Tab = TAB_ALIASES[requested] ?? (TABS.includes(requested as Tab) ? requested as Tab : 'home');
  const focusEntry = Number(params.get('entry')) || null;
  const focusCar = Number(params.get('car')) || null;
  const [monthDate, setMonthDate] = useState<Date>(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const answered = useCallback((count: number) => setPendingCount(current => (current === null ? current : Math.max(0, current - count))), []);
  const [toast, setToast] = useState<ToastState>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => { if (active) setUserId(data.user?.id ?? null); });
    return () => { active = false; };
  }, []);

  const notify = useCallback((t: ToastState) => {
    setToast(t);
    if (t) window.setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => {
    let active = true;
    getPendingReviewCount().then(count => { if (active) setPendingCount(count); }).catch(() => {});
    return () => { active = false; };
  }, []);

  // A link to a posted row names its month.
  const linkedMonth = params.get('month');
  useEffect(() => {
    if (!linkedMonth || !/^\d{4}-\d{2}$/.test(linkedMonth)) return;
    const [year, month] = linkedMonth.split('-').map(Number);
    setMonthDate(new Date(year, month - 1, 1));
  }, [linkedMonth]);

  // On a phone the strip scrolls, and a link can open a tab that is off the end of it.
  const tabStrip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    tabStrip.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [tab]);

  const openTab = (next: Tab) => setParams(() => new URLSearchParams(next === 'home' ? '' : `tab=${next}`), { replace: true });

  // Access is enforced by <RequirePage page="accounting"> on the route.

  const monthNav = tab === 'car_sheets' || tab === 'company';
  const supplierId = Number(params.get('supplier')) || null;

  return (
    <div style={{ padding: '24px clamp(16px, 4vw, 32px)', background: 'var(--surface)', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 500, letterSpacing: '-0.6px', color: '#0f1117' }}>{t('title')}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13.5, color: '#9ca3af' }}>{t('subtitle')}</p>
        </div>

        {monthNav && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setMonthDate(d => addMonths(d, -1))} style={monthNavBtn} aria-label={t('month.previous')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path className="hc-flip-path" d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <div style={{ minWidth: 150, textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#0f1117' }}>{formatMonthLabel(monthDate, dateLocale)}</div>
            <button onClick={() => setMonthDate(d => addMonths(d, 1))} style={monthNavBtn} aria-label={t('month.next')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path className="hc-flip-path" d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div ref={tabStrip} role="tablist" aria-label={t('title')} className="hc-acc-tabs">
        {TABS.map(key => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => openTab(key)}>
            {t(`tabs.${key}`)}
            {key === 'custody' && !!pendingCount && <span className="hc-appr-badge">{pendingCount}</span>}
          </button>
        ))}
      </div>

      {tab === 'home' && <FinanceHome userId={userId} />}
      {tab === 'car_sheets' && <CarSheetsTab key={focusCar ?? 'cars'} monthDate={monthDate} notify={notify} focusCar={focusCar} focusEntry={focusEntry} userId={userId} onAnswered={answered} />}
      {tab === 'company' && <CompanyExpensesSection monthDate={monthDate} userId={userId} notify={notify} focusEntry={focusEntry} onAnswered={answered} onOpenReceipt={setReceipt} />}
      {tab === 'custody' && <CustodyTab userId={userId} onOpenReceipt={setReceipt} onPendingChange={setPendingCount} notify={(message, failed) => notify({ message, type: failed ? 'error' : 'success' })} />}
      {tab === 'customers' && <CustomerWalletsPage embedded />}
      {tab === 'suppliers' && (supplierId ? <SupplierDetailPage key={supplierId} supplierId={supplierId} /> : <SuppliersPage embedded />)}

      {receipt && <ReceiptLightbox url={receipt} onClose={() => setReceipt(null)} />}
      <Toast toast={toast} />
    </div>
  );
};

const monthNavBtn: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff',
  cursor: 'pointer', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center',
};

export default AccountingPage;
