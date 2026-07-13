import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useCurrency } from '../lib/CurrencyContext';
import { useAccountingAccess } from '../lib/useAccountingAccess';

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
type Tab = 'cars' | 'expenses' | 'customers';

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

interface WalletBalance {
  employee_id: string;
  full_name: string | null;
  total_in: number;
  total_out: number;
  balance: number;
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

interface StaffOption {
  id: string;
  full_name: string | null;
}

interface CustomerLedgerRow {
  id: string;
  booking_id: number;
  customer_id: string;
  car_id: number;
  type: string;
  description: string | null;
  amount: number;
  direction: Direction;
  created_at: string | null;
  customers: { first_name: string | null; last_name: string | null } | null;
  cars: { plate_number: string | null } | null;
}

type ToastState = { message: string; type: 'success' | 'error' } | null;

// ─── Category options ─────────────────────────────────────────────────────────

const CAR_CATEGORIES: Record<Direction, string[]> = {
  IN: ['Rent Collection', 'Other'],
  OUT: ['Wash', 'Oil', 'Petrol', 'HGS', 'Maintenance', 'Other'],
};

const COMPANY_CATEGORIES: Record<Direction, string[]> = {
  IN: ['Deposit from Manager', 'Refund', 'Other'],
  OUT: ['Marketing', 'Operations', 'Branch', 'Maintenance', 'Food', 'Other'],
};

const WALLET_CATEGORIES: Record<Direction, string[]> = {
  IN: ['Custody from Manager', 'Other'],
  OUT: ['Wash', 'Maintenance', 'GPS', 'Branch', 'Other'],
};

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

function formatDateDisplay(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s + 'T00:00:00');
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatMonthLabel(d: Date): string {
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

async function uploadReceipt(bucket: string, file: File): Promise<string | null> {
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
  const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(fileName, file, { upsert: true });
  if (error) return null;
  const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
  return data.publicUrl;
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const COLOR_IN = '#16a34a';
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

const cardStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 16, border: '1px solid #ebebeb',
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
};

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
  <div style={{ padding: '52px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
    {label}
  </div>
);

const Spinner: React.FC = () => (
  <div style={{ padding: '52px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
    Loading…
  </div>
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

// ─── Th cell ──────────────────────────────────────────────────────────────────

const Th: React.FC<{ children?: React.ReactNode; align?: 'left' | 'right' }> = ({ children, align = 'left' }) => (
  <th style={{
    padding: '9px 14px', fontSize: 11, fontWeight: 700, color: '#6b7280',
    background: '#fafafa', borderBottom: '1px solid #ebebeb', textAlign: align,
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
}> = ({ monthDate, notify }) => {
  const { fmt } = useCurrency();
  const monthKey = monthKeyOf(monthDate);

  const [cars, setCars] = useState<CarOption[]>([]);
  const [txns, setTxns] = useState<CarTxn[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCarId, setSelectedCarId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editTxn, setEditTxn] = useState<CarTxn | null>(null);
  const [deleteTxn, setDeleteTxn] = useState<CarTxn | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadTxns = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('team_car_transactions')
      .select('id, car_id, plate_number, model_name, category, amount, direction, date, month_key, note, created_at')
      .eq('month_key', monthKey)
      .order('date', { ascending: false });
    setTxns((data ?? []) as CarTxn[]);
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
      setCars(opts);
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

  const selectedCar = useMemo(
    () => cars.find(c => c.id === selectedCarId) ?? null, [cars, selectedCarId]);

  const carTxns = useMemo(
    () => txns.filter(t => t.car_id === selectedCarId), [txns, selectedCarId]);

  const carTotal = useMemo(
    () => carTxns.reduce((s, t) => s + (t.direction === 'IN' ? t.amount : -t.amount), 0), [carTxns]);

  // per-car net for the badge on the list
  const netByCar = useMemo(() => {
    const m: Record<number, number> = {};
    for (const t of txns) m[t.car_id] = (m[t.car_id] ?? 0) + (t.direction === 'IN' ? t.amount : -t.amount);
    return m;
  }, [txns]);

  const handleDelete = async () => {
    if (!deleteTxn || deleting) return;
    setDeleting(true);
    // Delete from the underlying table (the view is read-only), matched by id.
    const { error } = await supabase.from('financial_transactions').delete().eq('id', deleteTxn.id);
    setDeleting(false);
    setDeleteTxn(null);
    if (error) { notify({ message: 'Could not delete transaction', type: 'error' }); return; }
    notify({ message: 'Transaction deleted', type: 'success' });
    await loadTxns();
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 320px) 1fr', gap: 20, alignItems: 'start' }}>
      {/* Car list */}
      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ padding: 14, borderBottom: '1px solid #f0f0f0' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search plate or model…"
            style={{ ...inputStyle, height: 38 }}
          />
        </div>
        <div style={{ maxHeight: 560, overflowY: 'auto' }}>
          {cars.length === 0 && <EmptyState label="No cars found." />}
          {filteredCars.map(car => {
            const active = car.id === selectedCarId;
            const net = netByCar[car.id] ?? 0;
            return (
              <button
                key={car.id}
                onClick={() => setSelectedCarId(car.id)}
                style={{
                  width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                  padding: '11px 14px', borderBottom: '1px solid #f3f4f6', fontFamily: 'inherit',
                  background: active ? 'rgba(75,166,234,0.08)' : '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: active ? '#2e8fd4' : '#0f1117' }}>
                    {car.plate_number}
                  </span>
                  <span style={{ display: 'block', fontSize: 12, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {car.model_name || '—'}
                  </span>
                </span>
                {net !== 0 && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: net >= 0 ? COLOR_IN : COLOR_OUT, flexShrink: 0 }}>
                    {net >= 0 ? '+' : '−'}{fmt(net)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Detail */}
      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{
          padding: '16px 18px', borderBottom: '1px solid #f0f0f0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f1117' }}>
              {selectedCar ? selectedCar.plate_number : 'Select a car'}
            </div>
            <div style={{ fontSize: 12.5, color: '#9ca3af' }}>
              {selectedCar ? (selectedCar.model_name || '—') : 'Pick a car from the list to view its sheet'}
            </div>
          </div>
          <button style={primaryBtn} onClick={() => setShowAdd(true)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            Add Transaction
          </button>
        </div>

        {selectedCar && (
          <div style={{
            padding: '14px 18px', borderBottom: '1px solid #f0f0f0',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#6b7280' }}>Running total ({formatMonthLabel(monthDate)}):</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: carTotal >= 0 ? COLOR_IN : COLOR_OUT }}>
              {carTotal >= 0 ? '+' : '−'}{fmt(carTotal)}
            </span>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          {loading ? <Spinner /> : !selectedCar ? (
            <EmptyState label="No car selected." />
          ) : carTxns.length === 0 ? (
            <EmptyState label="No transactions for this car this month." />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
              <thead>
                <tr>
                  <Th>Date</Th><Th>Direction</Th><Th>Category</Th><Th>Note</Th><Th align="right">Amount</Th><Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {carTxns.map(t => (
                  <tr key={t.id}>
                    <td style={tdStyle}>{formatDateDisplay(t.date)}</td>
                    <td style={tdStyle}><DirectionBadge direction={t.direction} /></td>
                    <td style={tdStyle}>{t.category || '—'}</td>
                    <td style={{ ...tdStyle, whiteSpace: 'normal', color: '#6b7280', maxWidth: 260 }}>{t.note || '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: t.direction === 'IN' ? COLOR_IN : COLOR_OUT }}>
                      {t.direction === 'IN' ? '+' : '−'}{fmt(t.amount)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button onClick={() => setEditTxn(t)} title="Edit" style={rowActionBtn}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <button onClick={() => setDeleteTxn(t)} title="Delete" style={{ ...rowActionBtn, color: COLOR_OUT }}>
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

      {showAdd && (
        <AddCarTxnModal
          cars={cars}
          defaultCarId={selectedCarId}
          onClose={() => setShowAdd(false)}
          onSaved={async (carId) => {
            setShowAdd(false);
            setSelectedCarId(carId);
            notify({ message: 'Transaction added', type: 'success' });
            await loadTxns();
          }}
          onError={() => notify({ message: 'Could not save transaction', type: 'error' })}
        />
      )}
      {editTxn && (
        <EditCarTxnModal
          txn={editTxn}
          onClose={() => setEditTxn(null)}
          onSaved={async () => { setEditTxn(null); notify({ message: 'Transaction updated', type: 'success' }); await loadTxns(); }}
          onError={() => notify({ message: 'Could not update transaction', type: 'error' })}
        />
      )}
      {deleteTxn && (
        <ConfirmDialog
          title="Delete transaction?"
          message="This car transaction will be permanently removed. This cannot be undone."
          confirmLabel="Delete"
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
  onSaved: (carId: number) => void;
  onError: () => void;
}> = ({ cars, defaultCarId, onClose, onSaved, onError }) => {
  const [carId, setCarId] = useState<number | ''>(defaultCarId ?? '');
  const [direction, setDirection] = useState<Direction>('IN');
  const [category, setCategory] = useState<string>(CAR_CATEGORIES.IN[0]);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(toDateStr(new Date()));
  const [note, setNote] = useState('');
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
    });
    setSaving(false);
    if (error) { onError(); return; }
    onSaved(car.id);
  };

  return (
    <Modal title="Add Car Transaction" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={labelStyle}>Car</label>
          <select value={carId} onChange={e => setCarId(e.target.value ? Number(e.target.value) : '')} style={inputStyle}>
            <option value="">Select a car…</option>
            {cars.map(c => (
              <option key={c.id} value={c.id}>
                {c.plate_number}{c.model_name ? ` — ${c.model_name}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Direction</label>
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
                }}>{d}</button>
              );
            })}
          </div>
        </div>

        <div>
          <label style={labelStyle}>Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}>
            {CAR_CATEGORIES[direction].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Amount</label>
            <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="0.00" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Note (optional)</label>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note…" style={inputStyle} />
        </div>

        <button style={{ ...primaryBtn, width: '100%', opacity: canSave && !saving ? 1 : 0.55 }}
          disabled={!canSave || saving} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save Transaction'}
        </button>
      </div>
    </Modal>
  );
};

const EditCarTxnModal: React.FC<{
  txn: CarTxn;
  onClose: () => void;
  onSaved: () => void;
  onError: () => void;
}> = ({ txn, onClose, onSaved, onError }) => {
  const [direction, setDirection] = useState<Direction>(txn.direction);
  const [category, setCategory] = useState<string>(txn.category ?? CAR_CATEGORIES[txn.direction][0]);
  const [amount, setAmount] = useState(String(txn.amount));
  const [date, setDate] = useState(txn.date);
  const [note, setNote] = useState(txn.note ?? '');
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
    // UPDATE the underlying table by id. investor_id, sheet_type and any
    // commission fields are intentionally left untouched.
    const { error } = await supabase.from('financial_transactions').update({
      direction,
      category,
      amount: Number(amount),
      date,
      month_key: date.slice(0, 7),
      note: note.trim() || null,
    }).eq('id', txn.id);
    setSaving(false);
    if (error) { onError(); return; }
    onSaved();
  };

  return (
    <Modal title="Edit Car Transaction" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <DirectionPicker direction={direction} onChange={chooseDirection} />

        <div>
          <label style={labelStyle}>Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}>
            {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Amount</label>
            <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="0.00" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Note (optional)</label>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note…" style={inputStyle} />
        </div>

        <button style={{ ...primaryBtn, width: '100%', opacity: canSave && !saving ? 1 : 0.55 }}
          disabled={!canSave || saving} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </Modal>
  );
};

// ════════════════════════════════════════════════════════════════════════════
//  TAB 2 — Company & Employee Expenses
// ════════════════════════════════════════════════════════════════════════════

const ExpensesTab: React.FC<{
  monthDate: Date;
  userId: string | null;
  notify: (t: ToastState) => void;
}> = ({ monthDate, userId, notify }) => {
  const [sub, setSub] = useState<'company' | 'wallets'>('company');
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {([['company', 'Company Expenses'], ['wallets', 'Employee Wallets']] as const).map(([k, label]) => {
          const on = sub === k;
          return (
            <button key={k} onClick={() => setSub(k)} style={{
              height: 36, padding: '0 16px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 13.5, fontWeight: 600,
              border: on ? '1px solid #4ba6ea' : '1px solid #e5e7eb',
              background: on ? 'rgba(75,166,234,0.08)' : '#fff',
              color: on ? '#2e8fd4' : '#6b7280',
            }}>{label}</button>
          );
        })}
      </div>
      {sub === 'company'
        ? <CompanyExpensesSection monthDate={monthDate} userId={userId} notify={notify} />
        : <EmployeeWalletsSection userId={userId} notify={notify} />}
    </div>
  );
};

const CompanyExpensesSection: React.FC<{
  monthDate: Date;
  userId: string | null;
  notify: (t: ToastState) => void;
}> = ({ monthDate, userId, notify }) => {
  const { fmt } = useCurrency();
  const [rows, setRows] = useState<CompanyExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editRow, setEditRow] = useState<CompanyExpense | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CompanyExpense | null>(null);
  const [deleting, setDeleting] = useState(false);

  const monthStart = toDateStr(new Date(monthDate.getFullYear(), monthDate.getMonth(), 1));
  const monthEnd = toDateStr(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0));

  const load = useCallback(async () => {
    setLoading(true);
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
    if (error) { notify({ message: 'Could not delete expense', type: 'error' }); return; }
    notify({ message: 'Expense deleted', type: 'success' });
    await load();
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <SummaryPill label="Total In" value={fmt(totals.tin)} color={COLOR_IN} />
        <SummaryPill label="Total Out" value={fmt(totals.tout)} color={COLOR_OUT} />
        <SummaryPill label="Net" value={`${totals.net >= 0 ? '+' : '−'}${fmt(totals.net)}`} color={totals.net >= 0 ? COLOR_IN : COLOR_OUT} />
        <div style={{ flex: 1 }} />
        <button style={primaryBtn} onClick={() => setShowAdd(true)}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          Add Expense
        </button>
      </div>

      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          {loading ? <Spinner /> : rows.length === 0 ? <EmptyState label="No company expenses this month." /> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr>
                  <Th>Date</Th><Th>Direction</Th><Th>Category</Th><Th>Description</Th><Th>Receipt</Th><Th align="right">Amount</Th><Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td style={tdStyle}>{formatDateDisplay(r.expense_date)}</td>
                    <td style={tdStyle}><DirectionBadge direction={r.direction} /></td>
                    <td style={tdStyle}>{r.category}</td>
                    <td style={{ ...tdStyle, whiteSpace: 'normal', color: '#6b7280', maxWidth: 280 }}>{r.description || '—'}</td>
                    <td style={tdStyle}>{r.receipt_url
                      ? <a href={r.receipt_url} target="_blank" rel="noreferrer" style={{ color: '#4ba6ea', fontWeight: 600, textDecoration: 'none' }}>View</a>
                      : '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: r.direction === 'IN' ? COLOR_IN : COLOR_OUT }}>
                      {r.direction === 'IN' ? '+' : '−'}{fmt(r.amount)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button onClick={() => setEditRow(r)} title="Edit" style={rowActionBtn}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <button onClick={() => setDeleteTarget(r)} title="Delete" style={{ ...rowActionBtn, color: COLOR_OUT }}>
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

      {showAdd && (
        <AddCompanyExpenseModal
          userId={userId}
          onClose={() => setShowAdd(false)}
          onSaved={async () => { setShowAdd(false); notify({ message: 'Expense added', type: 'success' }); await load(); }}
          onError={() => notify({ message: 'Could not save expense', type: 'error' })}
        />
      )}
      {editRow && (
        <EditCompanyExpenseModal
          row={editRow}
          onClose={() => setEditRow(null)}
          onSaved={async () => { setEditRow(null); notify({ message: 'Expense updated', type: 'success' }); await load(); }}
          onError={() => notify({ message: 'Could not update expense', type: 'error' })}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete expense?"
          message="This company expense will be permanently removed. This cannot be undone."
          confirmLabel="Delete"
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
    <Modal title="Edit Company Expense" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <DirectionPicker direction={direction} onChange={chooseDirection} />
        <div>
          <label style={labelStyle}>Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}>
            {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Amount</label>
            <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Description (optional)</label>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Add a description…" style={inputStyle} />
        </div>
        <button style={{ ...primaryBtn, width: '100%', opacity: canSave && !saving ? 1 : 0.55 }} disabled={!canSave || saving} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
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
    <Modal title="Add Company Expense" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <DirectionPicker direction={direction} onChange={chooseDirection} />
        <div>
          <label style={labelStyle}>Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}>
            {COMPANY_CATEGORIES[direction].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Amount</label>
            <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Description (optional)</label>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Add a description…" style={inputStyle} />
        </div>
        <FileField file={file} onChange={setFile} />
        <button style={{ ...primaryBtn, width: '100%', opacity: canSave && !saving ? 1 : 0.55 }} disabled={!canSave || saving} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save Expense'}
        </button>
      </div>
    </Modal>
  );
};

const EmployeeWalletsSection: React.FC<{
  userId: string | null;
  notify: (t: ToastState) => void;
}> = ({ userId, notify }) => {
  const { fmt } = useCurrency();
  const [balances, setBalances] = useState<WalletBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [openEmployee, setOpenEmployee] = useState<WalletBalance | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('employee_wallet_balances')
      .select('employee_id, full_name, total_in, total_out, balance')
      .order('full_name');
    setBalances((data ?? []) as WalletBalance[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button style={primaryBtn} onClick={() => setShowAdd(true)}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          Add Wallet Entry
        </button>
      </div>

      {loading ? <Spinner /> : balances.length === 0 ? (
        <div style={{ ...cardStyle }}><EmptyState label="No employee wallets yet." /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
          {balances.map(b => (
            <button key={b.employee_id} onClick={() => setOpenEmployee(b)} style={{
              ...cardStyle, padding: 18, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #4ba6ea 0%, #2e8fd4 100%)',
                  color: '#fff', fontSize: 13, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {(b.full_name || '?').trim().split(/\s+/).map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: '#0f1117' }}>{b.full_name || 'Unknown'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Balance</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: b.balance >= 0 ? COLOR_IN : COLOR_OUT }}>
                  {b.balance >= 0 ? '+' : '−'}{fmt(b.balance)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 14, fontSize: 12, color: '#6b7280' }}>
                <span>In <b style={{ color: COLOR_IN }}>{fmt(b.total_in)}</b></span>
                <span>Out <b style={{ color: COLOR_OUT }}>{fmt(b.total_out)}</b></span>
              </div>
            </button>
          ))}
        </div>
      )}

      {openEmployee && (
        <WalletHistoryModal
          employee={openEmployee}
          notify={notify}
          onChanged={load}
          onClose={() => setOpenEmployee(null)}
        />
      )}
      {showAdd && (
        <AddWalletEntryModal
          userId={userId}
          onClose={() => setShowAdd(false)}
          onSaved={async () => { setShowAdd(false); notify({ message: 'Wallet entry added', type: 'success' }); await load(); }}
          onError={() => notify({ message: 'Could not save wallet entry', type: 'error' })}
        />
      )}
    </div>
  );
};

const WalletHistoryModal: React.FC<{
  employee: WalletBalance;
  notify: (t: ToastState) => void;
  onChanged: () => void | Promise<void>;
  onClose: () => void;
}> = ({ employee, notify, onChanged, onClose }) => {
  const { fmt } = useCurrency();
  const [rows, setRows] = useState<WalletTxn[]>([]);
  const [loading, setLoading] = useState(true);
  const [editRow, setEditRow] = useState<WalletTxn | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WalletTxn | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('employee_wallets')
      .select('id, transaction_date, direction, category, amount, description, receipt_url')
      .eq('employee_id', employee.employee_id)
      .order('transaction_date', { ascending: false });
    setRows((data ?? []) as WalletTxn[]);
    setLoading(false);
  }, [employee.employee_id]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    const { error } = await supabase.from('employee_wallets').delete().eq('id', deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
    if (error) { notify({ message: 'Could not delete wallet entry', type: 'error' }); return; }
    notify({ message: 'Wallet entry deleted', type: 'success' });
    await load();
    await onChanged();
  };

  // Live totals so the header reflects edits/deletes without closing the modal.
  const totals = useMemo(() => {
    let tin = 0, tout = 0;
    for (const r of rows) (r.direction === 'IN' ? (tin += r.amount) : (tout += r.amount));
    return { tin, tout, balance: tin - tout };
  }, [rows]);

  return (
    <Modal title={`${employee.full_name || 'Employee'} — Wallet History`} onClose={onClose} maxWidth={680}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <SummaryPill label="Balance" value={`${totals.balance >= 0 ? '+' : '−'}${fmt(totals.balance)}`} color={totals.balance >= 0 ? COLOR_IN : COLOR_OUT} />
        <SummaryPill label="Total In" value={fmt(totals.tin)} color={COLOR_IN} />
        <SummaryPill label="Total Out" value={fmt(totals.tout)} color={COLOR_OUT} />
      </div>
      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          {loading ? <Spinner /> : rows.length === 0 ? <EmptyState label="No wallet transactions." /> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
              <thead>
                <tr><Th>Date</Th><Th>Direction</Th><Th>Category</Th><Th>Description</Th><Th align="right">Amount</Th><Th align="right">Actions</Th></tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td style={tdStyle}>{formatDateDisplay(r.transaction_date)}</td>
                    <td style={tdStyle}><DirectionBadge direction={r.direction} /></td>
                    <td style={tdStyle}>{r.category}</td>
                    <td style={{ ...tdStyle, whiteSpace: 'normal', color: '#6b7280', maxWidth: 220 }}>
                      {r.description || '—'}
                      {r.receipt_url && <> · <a href={r.receipt_url} target="_blank" rel="noreferrer" style={{ color: '#4ba6ea', textDecoration: 'none' }}>receipt</a></>}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: r.direction === 'IN' ? COLOR_IN : COLOR_OUT }}>
                      {r.direction === 'IN' ? '+' : '−'}{fmt(r.amount)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button onClick={() => setEditRow(r)} title="Edit" style={rowActionBtn}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <button onClick={() => setDeleteTarget(r)} title="Delete" style={{ ...rowActionBtn, color: COLOR_OUT }}>
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

      {editRow && (
        <EditWalletTxnModal
          row={editRow}
          onClose={() => setEditRow(null)}
          onSaved={async () => { setEditRow(null); notify({ message: 'Wallet entry updated', type: 'success' }); await load(); await onChanged(); }}
          onError={() => notify({ message: 'Could not update wallet entry', type: 'error' })}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete wallet entry?"
          message="This wallet transaction will be permanently removed. This cannot be undone."
          confirmLabel="Delete"
          busy={deleting}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </Modal>
  );
};

const EditWalletTxnModal: React.FC<{
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
    <Modal title="Edit Wallet Entry" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <DirectionPicker direction={direction} onChange={chooseDirection} />
        <div>
          <label style={labelStyle}>Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}>
            {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Amount</label>
            <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Description (optional)</label>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Add a description…" style={inputStyle} />
        </div>
        <button style={{ ...primaryBtn, width: '100%', opacity: canSave && !saving ? 1 : 0.55 }} disabled={!canSave || saving} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </Modal>
  );
};

const AddWalletEntryModal: React.FC<{
  userId: string | null;
  onClose: () => void;
  onSaved: () => void;
  onError: () => void;
}> = ({ userId, onClose, onSaved, onError }) => {
  const [staff, setStaff] = useState<StaffOption[]>([]);
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
      const { data } = await supabase.from('profiles').select('id, full_name').eq('role', 'staff').order('full_name');
      if (active) setStaff((data ?? []) as StaffOption[]);
    })();
    return () => { active = false; };
  }, []);

  const chooseDirection = (d: Direction) => { setDirection(d); setCategory(WALLET_CATEGORIES[d][0]); };
  const canSave = !!employeeId && Number(amount) > 0 && !!date && !!category;

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
    <Modal title="Add Wallet Entry" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={labelStyle}>Employee</label>
          <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} style={inputStyle}>
            <option value="">Select an employee…</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.full_name || s.id}</option>)}
          </select>
        </div>
        <DirectionPicker direction={direction} onChange={chooseDirection} />
        <div>
          <label style={labelStyle}>Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}>
            {WALLET_CATEGORIES[direction].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Amount</label>
            <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Description (optional)</label>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Add a description…" style={inputStyle} />
        </div>
        <FileField file={file} onChange={setFile} />
        <button style={{ ...primaryBtn, width: '100%', opacity: canSave && !saving ? 1 : 0.55 }} disabled={!canSave || saving} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save Entry'}
        </button>
      </div>
    </Modal>
  );
};

// ════════════════════════════════════════════════════════════════════════════
//  TAB 3 — Customers
// ════════════════════════════════════════════════════════════════════════════

const CUSTOMER_LEDGER_TYPES = ['rental', 'deposit', 'payment', 'refund', 'other'];
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

interface CustomerGroup {
  customerId: string;
  name: string;
  balance: number;
  rows: CustomerLedgerRow[];
}

interface BookingOption {
  id: number;
  booking_number: string | null;
  start_date: string;
  end_date: string;
  car_id: number;
  plate_number: string | null;
}

interface CustomerOption {
  id: string;
  name: string;
}

function bookingLabel(b: BookingOption): string {
  const num = b.booking_number || `#${b.id}`;
  const plate = b.plate_number ? ` · ${b.plate_number}` : '';
  return `${num}${plate} · ${formatDateDisplay(b.start_date)} → ${formatDateDisplay(b.end_date)}`;
}

const CustomersTab: React.FC<{
  userId: string | null;
  notify: (t: ToastState) => void;
}> = ({ userId, notify }) => {
  const { fmt } = useCurrency();
  const [rows, setRows] = useState<CustomerLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [addFor, setAddFor] = useState<{ customerId: string | null; name: string | null } | null>(null);
  const [editRow, setEditRow] = useState<CustomerLedgerRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomerLedgerRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('customer_accounting_ledger')
      .select('id, booking_id, customer_id, car_id, type, description, amount, direction, created_at, customers(first_name, last_name), cars(plate_number)')
      .order('created_at', { ascending: false });
    setRows((data ?? []) as unknown as CustomerLedgerRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    const { error } = await supabase.from('customer_accounting_ledger').delete().eq('id', deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
    if (error) { notify({ message: 'Could not delete transaction', type: 'error' }); return; }
    notify({ message: 'Transaction deleted', type: 'success' });
    await load();
  };

  const groups = useMemo<CustomerGroup[]>(() => {
    const map = new Map<string, CustomerGroup>();
    for (const r of rows) {
      const name = [r.customers?.first_name, r.customers?.last_name].filter(Boolean).join(' ').trim() || 'Unknown customer';
      let g = map.get(r.customer_id);
      if (!g) { g = { customerId: r.customer_id, name, balance: 0, rows: [] }; map.set(r.customer_id, g); }
      g.rows.push(r);
      g.balance += r.direction === 'IN' ? r.amount : -r.amount;
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(g =>
      g.name.toLowerCase().includes(q) ||
      g.rows.some(r => (r.cars?.plate_number || '').toLowerCase().includes(q)));
  }, [groups, search]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customer or plate…" style={{ ...inputStyle, maxWidth: 360 }} />
        <div style={{ flex: 1 }} />
        <button style={primaryBtn} onClick={() => setAddFor({ customerId: null, name: null })}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          Add Transaction
        </button>
      </div>

      {loading ? <div style={cardStyle}><Spinner /></div> : filtered.length === 0 ? (
        <div style={cardStyle}><EmptyState label="No customer ledger entries." /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(g => {
            const open = expanded[g.customerId];
            return (
              <div key={g.customerId} style={{ ...cardStyle, overflow: 'hidden' }}>
                <div style={{
                  padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                }}>
                  <div
                    role="button"
                    onClick={() => setExpanded(p => ({ ...p, [g.customerId]: !p[g.customerId] }))}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flex: 1, minWidth: 0 }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 140ms', color: '#9ca3af', flexShrink: 0 }}>
                      <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span style={{ fontSize: 15, fontWeight: 600, color: '#0f1117', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
                    <span style={{ fontSize: 12, color: '#9ca3af', flexShrink: 0 }}>{g.rows.length} {g.rows.length === 1 ? 'entry' : 'entries'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Balance</div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: g.balance >= 0 ? COLOR_IN : COLOR_OUT }}>
                        {g.balance >= 0 ? '+' : '−'}{fmt(g.balance)}
                      </div>
                    </div>
                    <button
                      onClick={() => setAddFor({ customerId: g.customerId, name: g.name })}
                      title="Add transaction for this customer"
                      style={{
                        height: 34, padding: '0 12px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
                        fontSize: 13, fontWeight: 600, color: '#2e8fd4', background: 'rgba(75,166,234,0.08)',
                        border: '1px solid rgba(75,166,234,0.35)', display: 'inline-flex', alignItems: 'center', gap: 6,
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                      </svg>
                      Add
                    </button>
                  </div>
                </div>
                {open && (
                  <div style={{ overflowX: 'auto', borderTop: '1px solid #f0f0f0' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                      <thead>
                        <tr><Th>Date</Th><Th>Plate</Th><Th>Type</Th><Th>Description</Th><Th>Direction</Th><Th align="right">Amount</Th><Th align="right">Actions</Th></tr>
                      </thead>
                      <tbody>
                        {g.rows.map(r => (
                          <tr key={r.id}>
                            <td style={tdStyle}>{formatDateDisplay(r.created_at ? r.created_at.slice(0, 10) : null)}</td>
                            <td style={tdStyle}>{r.cars?.plate_number || '—'}</td>
                            <td style={tdStyle}>{cap(r.type)}</td>
                            <td style={{ ...tdStyle, whiteSpace: 'normal', color: '#6b7280', maxWidth: 260 }}>{r.description || '—'}</td>
                            <td style={tdStyle}><DirectionBadge direction={r.direction} /></td>
                            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: r.direction === 'IN' ? COLOR_IN : COLOR_OUT }}>
                              {r.direction === 'IN' ? '+' : '−'}{fmt(r.amount)}
                            </td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
                                <button onClick={() => setEditRow(r)} title="Edit" style={rowActionBtn}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                </button>
                                <button onClick={() => setDeleteTarget(r)} title="Delete" style={{ ...rowActionBtn, color: COLOR_OUT }}>
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
                )}
              </div>
            );
          })}
        </div>
      )}

      {addFor && (
        <AddCustomerTxnModal
          userId={userId}
          presetCustomerId={addFor.customerId}
          presetName={addFor.name}
          onClose={() => setAddFor(null)}
          onSaved={async () => { setAddFor(null); notify({ message: 'Transaction added', type: 'success' }); await load(); }}
          onError={() => notify({ message: 'Could not save transaction', type: 'error' })}
        />
      )}
      {editRow && (
        <EditCustomerTxnModal
          row={editRow}
          onClose={() => setEditRow(null)}
          onSaved={async () => { setEditRow(null); notify({ message: 'Transaction updated', type: 'success' }); await load(); }}
          onError={() => notify({ message: 'Could not update transaction', type: 'error' })}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete transaction?"
          message="This customer ledger entry will be permanently removed. This cannot be undone."
          confirmLabel="Delete"
          busy={deleting}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
};

const rowActionBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff',
  cursor: 'pointer', color: '#6b7280', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};

const AddCustomerTxnModal: React.FC<{
  userId: string | null;
  presetCustomerId: string | null;
  presetName: string | null;
  onClose: () => void;
  onSaved: () => void;
  onError: () => void;
}> = ({ userId, presetCustomerId, presetName, onClose, onSaved, onError }) => {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customerId, setCustomerId] = useState<string>(presetCustomerId ?? '');
  const [bookings, setBookings] = useState<BookingOption[]>([]);
  const [bookingId, setBookingId] = useState<number | ''>('');
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [direction, setDirection] = useState<Direction>('IN');
  const [type, setType] = useState('rental');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  // Customer picker only needed for the global "Add" (no preset).
  useEffect(() => {
    if (presetCustomerId) return;
    let active = true;
    (async () => {
      const { data } = await supabase.from('customers').select('id, first_name, last_name').order('first_name');
      if (!active) return;
      setCustomers((data ?? []).map((c: any) => ({
        id: c.id,
        name: [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || 'Unknown customer',
      })));
    })();
    return () => { active = false; };
  }, [presetCustomerId]);

  // A ledger row requires a booking (which supplies car_id). Load the chosen customer's bookings.
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
      const opts: BookingOption[] = (data ?? []).map((b: any) => ({
        id: b.id,
        booking_number: b.booking_number,
        start_date: b.start_date,
        end_date: b.end_date,
        car_id: b.car_id,
        plate_number: b.cars?.plate_number ?? null,
      }));
      setBookings(opts);
      setBookingId(opts.length === 1 ? opts[0].id : '');
      setLoadingBookings(false);
    })();
    return () => { active = false; };
  }, [customerId]);

  const selectedBooking = useMemo(() => bookings.find(b => b.id === bookingId) ?? null, [bookings, bookingId]);
  const canSave = !!customerId && !!selectedBooking && Number(amount) > 0 && !!type;

  const handleSave = async () => {
    if (!canSave || saving || !selectedBooking) return;
    setSaving(true);
    // All three FKs are NOT NULL — booking supplies both booking_id and car_id.
    const { error } = await supabase.from('customer_accounting_ledger').insert({
      booking_id: selectedBooking.id,
      customer_id: customerId,
      car_id: selectedBooking.car_id,
      type,
      description: description.trim() || null,
      amount: Number(amount),
      direction,
      created_by: userId,
    });
    setSaving(false);
    if (error) { onError(); return; }
    onSaved();
  };

  return (
    <Modal title="Add Customer Transaction" onClose={onClose}>
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

        <DirectionPicker direction={direction} onChange={setDirection} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Type</label>
            <select value={type} onChange={e => setType(e.target.value)} style={inputStyle}>
              {CUSTOMER_LEDGER_TYPES.map(t => <option key={t} value={t}>{cap(t)}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Amount</label>
            <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" style={inputStyle} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Description (optional)</label>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Add a description…" style={inputStyle} />
        </div>

        <button style={{ ...primaryBtn, width: '100%', opacity: canSave && !saving ? 1 : 0.55 }} disabled={!canSave || saving} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save Transaction'}
        </button>
      </div>
    </Modal>
  );
};

const EditCustomerTxnModal: React.FC<{
  row: CustomerLedgerRow;
  onClose: () => void;
  onSaved: () => void;
  onError: () => void;
}> = ({ row, onClose, onSaved, onError }) => {
  const [direction, setDirection] = useState<Direction>(row.direction);
  const [type, setType] = useState(row.type);
  const [description, setDescription] = useState(row.description ?? '');
  const [amount, setAmount] = useState(String(row.amount));
  const [saving, setSaving] = useState(false);

  // Keep the row's existing type selectable even if it's an older/legacy value.
  const typeOptions = CUSTOMER_LEDGER_TYPES.includes(row.type) ? CUSTOMER_LEDGER_TYPES : [row.type, ...CUSTOMER_LEDGER_TYPES];
  const canSave = Number(amount) > 0 && !!type;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    const { error } = await supabase.from('customer_accounting_ledger').update({
      direction,
      type,
      description: description.trim() || null,
      amount: Number(amount),
    }).eq('id', row.id);
    setSaving(false);
    if (error) { onError(); return; }
    onSaved();
  };

  return (
    <Modal title="Edit Transaction" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <DirectionPicker direction={direction} onChange={setDirection} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Type</label>
            <select value={type} onChange={e => setType(e.target.value)} style={inputStyle}>
              {typeOptions.map(t => <option key={t} value={t}>{cap(t)}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Amount</label>
            <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" style={inputStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Description (optional)</label>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Add a description…" style={inputStyle} />
        </div>
        <button style={{ ...primaryBtn, width: '100%', opacity: canSave && !saving ? 1 : 0.55 }} disabled={!canSave || saving} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
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

// ─── Small shared form widgets ────────────────────────────────────────────────

const SummaryPill: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <div style={{ ...cardStyle, padding: '10px 16px', minWidth: 130 }}>
    <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{label}</div>
    <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
  </div>
);

const DirectionPicker: React.FC<{ direction: Direction; onChange: (d: Direction) => void }> = ({ direction, onChange }) => (
  <div>
    <label style={labelStyle}>Direction</label>
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
          }}>{d}</button>
        );
      })}
    </div>
  </div>
);

const FileField: React.FC<{ file: File | null; onChange: (f: File | null) => void }> = ({ file, onChange }) => (
  <div>
    <label style={labelStyle}>Receipt (optional)</label>
    <label style={{
      ...inputStyle, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
      color: file ? '#0f1117' : '#9ca3af', overflow: 'hidden',
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: '#9ca3af' }}>
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {file ? file.name : 'Upload a receipt…'}
      </span>
      <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
        onChange={e => onChange(e.target.files?.[0] ?? null)} />
    </label>
  </div>
);

// ════════════════════════════════════════════════════════════════════════════
//  Page shell
// ════════════════════════════════════════════════════════════════════════════

const TABS: { key: Tab; label: string }[] = [
  { key: 'cars', label: 'Car Rental Sheets' },
  { key: 'expenses', label: 'Company & Employee Expenses' },
  { key: 'customers', label: 'Customers' },
];

const AccountingPage: React.FC = () => {
  const allowed = useAccountingAccess();
  const [tab, setTab] = useState<Tab>('cars');
  const [monthDate, setMonthDate] = useState<Date>(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
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

  if (allowed === null) {
    return <div style={{ padding: '24px 32px', color: '#9ca3af', fontSize: 14 }}>Loading…</div>;
  }
  if (!allowed) {
    return <Navigate to="/dashboard" replace />;
  }

  const monthNavDisabled = tab === 'customers'; // customers ledger is not month-scoped

  return (
    <div style={{ padding: '24px 32px', background: '#fafafa', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.6px', color: '#0f1117' }}>Accounting</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13.5, color: '#9ca3af' }}>Rental sheets, company &amp; employee expenses, and customer balances.</p>
        </div>

        {!monthNavDisabled && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setMonthDate(d => addMonths(d, -1))} style={monthNavBtn} aria-label="Previous month">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <div style={{ minWidth: 150, textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#0f1117' }}>{formatMonthLabel(monthDate)}</div>
            <button onClick={() => setMonthDate(d => addMonths(d, 1))} style={monthNavBtn} aria-label="Next month">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 22, borderBottom: '1px solid #ebebeb', flexWrap: 'wrap' }}>
        {TABS.map(t => {
          const on = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 14, fontWeight: on ? 700 : 500, color: on ? '#2e8fd4' : '#6b7280',
              borderBottom: on ? '2px solid #4ba6ea' : '2px solid transparent', marginBottom: -1,
            }}>{t.label}</button>
          );
        })}
      </div>

      {tab === 'cars' && <CarSheetsTab monthDate={monthDate} notify={notify} />}
      {tab === 'expenses' && <ExpensesTab monthDate={monthDate} userId={userId} notify={notify} />}
      {tab === 'customers' && <CustomersTab userId={userId} notify={notify} />}

      <Toast toast={toast} />
    </div>
  );
};

const monthNavBtn: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff',
  cursor: 'pointer', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center',
};

export default AccountingPage;
