import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../lib/supabase';
import { useCurrency } from '../lib/CurrencyContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type FineStatus = 'paid' | 'unpaid';

interface Fine {
  id: number;
  status: FineStatus;
  plate_number: string;
  violation_number: string;
  customer_name: string | null;
  notification_date: string | null;
  amount: number;
  location: string | null;
  violation_date: string | null;
  violation_time: string | null;
  article: string | null;
  description: string | null;
  fine_image_url: string | null;
  fine_pdf_url: string | null;
  payment_receipt_url: string | null;
  created_at: string;
  car_id: number | null;
  customer_id: string | null;
  violation_code: string | null;
}

interface CarOption {
  id: number;
  plate_number: string;
  model_name: string;
}

interface CustomerOption {
  id: string;
  full_name: string;
}

interface AddFineForm {
  violation_number: string;
  car_id: number | null;
  plate_number: string;
  customer_id: string | null;
  amount: string;
  violation_date: string;
  violation_time: string;
  location: string;
  article: string;
  description: string;
  fine_image: File | null;
  fine_pdf: File | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateDisplay(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

async function fetchCarCustomers(carId: number): Promise<CustomerOption[]> {
  const { data: bookingsData } = await supabase
    .from('bookings')
    .select('customer_id')
    .eq('car_id', carId);

  const customerIds = [...new Set(
    (bookingsData ?? [])
      .map(b => (b as { customer_id: string | number | null }).customer_id)
      .filter((id): id is string | number => id !== null)
      .map(id => String(id)),
  )];

  if (customerIds.length === 0) return [];

  const { data: custData } = await supabase
    .from('customers')
    .select('id, first_name, last_name')
    .in('id', customerIds)
    .order('first_name', { ascending: true });

  return (custData as Array<{ id: string | number; first_name: string; last_name: string }> ?? [])
    .map(c => ({ id: String(c.id), full_name: `${c.first_name} ${c.last_name}`.trim() }));
}

async function getUploadSequence(plate: string): Promise<number> {
  const { count } = await supabase
    .from('traffic_fines')
    .select('id', { count: 'exact', head: true })
    .eq('plate_number', plate);
  return (count ?? 0) + 1;
}

async function uploadFile(
  bucket: string,
  folder: string,
  fileName: string,
  file: File,
): Promise<string | null> {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(`${folder}/${fileName}`, file, { upsert: true });
  if (error) return null;
  const { data } = supabase.storage.from(bucket).getPublicUrl(`${folder}/${fileName}`);
  return data.publicUrl;
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG: Record<FineStatus, { label: string; color: string; bg: string }> = {
  unpaid: { label: 'Unpaid', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  paid:   { label: 'Paid',   color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

// Toast
interface ToastState { message: string; type: 'success' | 'error'; }
const Toast: React.FC<ToastState> = ({ message, type }) =>
  ReactDOM.createPortal(
    <div style={{
      position: 'fixed', bottom: 28, right: 28, zIndex: 2000,
      display: 'flex', alignItems: 'center', gap: 10,
      background: type === 'success' ? '#0f1117' : '#ef4444',
      color: '#fff', borderRadius: 12, padding: '12px 20px',
      fontSize: 14, fontWeight: 500,
      boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      animation: 'slideUpIn 200ms ease',
    }}>
      {type === 'success'
        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" /><circle cx="12" cy="12" r="9" stroke="#4ade80" strokeWidth="1.8" /></svg>
        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.8" /><path d="M12 8v4M12 16h.01" stroke="white" strokeWidth="1.8" strokeLinecap="round" /></svg>
      }
      {message}
    </div>,
    document.body,
  );

// Status badge
const StatusBadge: React.FC<{ status: FineStatus }> = ({ status }) => {
  const cfg = STATUS_CFG[status];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11, fontWeight: 700,
      color: cfg.color, background: cfg.bg,
      borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
};

// Table header cell
const Th: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = ({ children, style, ...rest }) => (
  <th
    style={{
      padding: '9px 12px', fontSize: 11, fontWeight: 700,
      color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px',
      textAlign: 'left', background: '#fff',
      borderBottom: '1.5px solid #f0f0f0',
      position: 'sticky', top: 0, zIndex: 1,
      whiteSpace: 'nowrap', userSelect: 'none',
      ...style,
    }}
    {...rest}
  >
    {children}
  </th>
);

// Action icon button
const ActionBtn: React.FC<{
  onClick: () => void;
  title: string;
  hoverColor: string;
  children: React.ReactNode;
}> = ({ onClick, title, hoverColor, children }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 30, height: 30, borderRadius: 7, border: 'none',
        background: hovered ? `${hoverColor}18` : 'transparent',
        color: hovered ? hoverColor : '#9ca3af',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'all 140ms ease', flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
};

// Skeleton row
const SkeletonRow: React.FC = () => (
  <tr>
    {[80, 130, 90, 70, 90, 130, 100].map((w, i) => (
      <td key={i} style={{ padding: '11px 12px' }}>
        <div style={{ height: 13, width: w, borderRadius: 6, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
      </td>
    ))}
  </tr>
);

// Field style
const FIELD_STYLE: React.CSSProperties = {
  width: '100%', height: 40, padding: '0 12px',
  fontSize: 14, color: '#0f1117',
  background: '#fff', border: '1.5px solid #e5e7eb',
  borderRadius: 8, outline: 'none', fontFamily: 'inherit',
  boxSizing: 'border-box', transition: 'border-color 150ms ease',
};

// ─── File Upload Field ────────────────────────────────────────────────────────

const FileUploadField: React.FC<{
  label: string;
  accept: string;
  file: File | null;
  onChange: (f: File | null) => void;
}> = ({ label, accept, file, onChange }) => {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6, letterSpacing: '0.3px' }}>
        {label}
      </label>
      <div
        onClick={() => ref.current?.click()}
        style={{
          height: 40, border: '1.5px dashed #d1d5db', borderRadius: 8,
          display: 'flex', alignItems: 'center', padding: '0 12px', gap: 8,
          cursor: 'pointer', background: '#fafafa', transition: 'border-color 150ms ease',
          fontSize: 13, color: file ? '#0f1117' : '#9ca3af',
          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = '#4ba6ea')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = '#d1d5db')}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: '#9ca3af' }}>
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {file ? file.name : 'Choose file…'}
        </span>
        {file && (
          <button
            onClick={e => { e.stopPropagation(); onChange(null); if (ref.current) ref.current.value = ''; }}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0, flexShrink: 0 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        )}
      </div>
      <input ref={ref} type="file" accept={accept} style={{ display: 'none' }}
        onChange={e => onChange(e.target.files?.[0] ?? null)} />
    </div>
  );
};

// ─── Add Fine Modal ───────────────────────────────────────────────────────────

interface AddFineModalProps {
  cars: CarOption[];
  onClose: () => void;
  onSaved: () => void;
}

const AddFineModal: React.FC<AddFineModalProps> = ({ cars, onClose, onSaved }) => {
  const [form, setForm] = useState<AddFineForm>({
    violation_number: '', car_id: null, plate_number: '', customer_id: null as string | null,
    amount: '', violation_date: '', violation_time: '',
    location: '', article: '', description: '',
    fine_image: null, fine_pdf: null,
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [carCustomers, setCarCustomers] = useState<CustomerOption[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const set = (key: keyof AddFineForm, value: AddFineForm[keyof AddFineForm]) =>
    setForm(f => ({ ...f, [key]: value }));

  const handleCarChange = async (carId: string) => {
    const id = parseInt(carId, 10);
    const car = cars.find(c => c.id === id);
    setForm(f => ({ ...f, car_id: id || null, plate_number: car?.plate_number ?? '', customer_id: null }));
    if (!id) { setCarCustomers([]); return; }
    setCustomersLoading(true);
    const custs = await fetchCarCustomers(id);
    setCarCustomers(custs);
    setCustomersLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.violation_number.trim() || !form.car_id || !form.amount || !form.violation_date) {
      setFormError('Please fill in all required fields.');
      return;
    }
    setFormError(null);
    setSaving(true);

    try {
      const seq = await getUploadSequence(form.plate_number);
      const plate = form.plate_number;

      let fine_image_url: string | null = null;
      let fine_pdf_url: string | null = null;

      if (form.fine_image) {
        const ext = form.fine_image.name.split('.').pop();
        fine_image_url = await uploadFile('cezalar', 'CZ-R', `CZ-R-${plate}-${seq}.${ext}`, form.fine_image);
      }
      if (form.fine_pdf) {
        const ext = form.fine_pdf.name.split('.').pop();
        fine_pdf_url = await uploadFile('cezalar', 'CZ-D', `CZ-D-${plate}-${seq}.${ext}`, form.fine_pdf);
      }

      const payload = {
        status: 'unpaid' as FineStatus,
        plate_number: plate,
        violation_number: form.violation_number.trim(),
        customer_id: form.customer_id || null,
        car_id: form.car_id,
        amount: parseFloat(form.amount),
        violation_date: form.violation_date || null,
        violation_time: form.violation_time || null,
        location: form.location || null,
        article: form.article || null,
        description: form.description || null,
        fine_image_url,
        fine_pdf_url,
        payment_receipt_url: null,
      };

      const { error } = await supabase.from('traffic_fines').insert(payload);
      if (error) throw error;
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save fine.';
      setFormError(msg);
      setSaving(false);
    }
  };

  return ReactDOM.createPortal(
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(15,17,23,0.45)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, animation: 'fadeIn 150ms ease',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 18, width: '100%', maxWidth: 600,
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)',
        animation: 'slideUp 180ms ease',
      }}>
        {/* Header */}
        <div style={{ padding: '22px 26px 18px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#0f1117', letterSpacing: '-0.3px' }}>Add Fine</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Enter the violation details below</div>
            </div>
            <button onClick={onClose} style={{
              width: 32, height: 32, borderRadius: 8, border: '1px solid #e5e7eb',
              background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#9ca3af',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '22px 26px' }}>
          {formError && (
            <div style={{
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 10, padding: '10px 14px', marginBottom: 18,
              fontSize: 13, color: '#ef4444', display: 'flex', gap: 8, alignItems: 'center',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.8" /><path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" /></svg>
              {formError}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* Plate Number (car dropdown) */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6, letterSpacing: '0.3px' }}>
                Plate Number <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                required
                value={form.car_id ?? ''}
                onChange={e => handleCarChange(e.target.value)}
                style={{ ...FIELD_STYLE, cursor: 'pointer' }}
              >
                <option value="">Select plate…</option>
                {cars.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.plate_number}{c.model_name ? ` — ${c.model_name}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Violation Number (manual input) */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6, letterSpacing: '0.3px' }}>
                Violation Number <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                required
                value={form.violation_number}
                onChange={e => set('violation_number', e.target.value)}
                placeholder="e.g. MB-94271641"
                style={FIELD_STYLE}
              />
            </div>

            {/* Customer (dependent on selected car) */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6, letterSpacing: '0.3px' }}>
                Customer
              </label>
              <select
                value={form.customer_id ?? ''}
                onChange={e => set('customer_id', e.target.value || null)}
                disabled={!form.car_id || customersLoading}
                style={{ ...FIELD_STYLE, cursor: (!form.car_id || customersLoading) ? 'not-allowed' : 'pointer', opacity: 1, color: !form.car_id ? '#9ca3af' : '#0f1117' }}
              >
                {!form.car_id
                  ? <option value="">Select a car first</option>
                  : customersLoading
                    ? <option value="">Loading…</option>
                    : <>
                        <option value="">— No customer (general fine) —</option>
                        {carCustomers.length === 0
                          ? <option disabled value="">No customers found for this car</option>
                          : carCustomers.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)
                        }
                      </>
                }
              </select>
            </div>

            {/* Amount */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6, letterSpacing: '0.3px' }}>
                Amount (TRY) <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={form.amount}
                onChange={e => set('amount', e.target.value)}
                placeholder="0.00"
                style={FIELD_STYLE}
              />
            </div>

            {/* Violation Date */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6, letterSpacing: '0.3px' }}>
                Violation Date <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="date"
                required
                value={form.violation_date}
                onChange={e => set('violation_date', e.target.value)}
                style={FIELD_STYLE}
              />
            </div>

            {/* Violation Time */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6, letterSpacing: '0.3px' }}>
                Violation Time
              </label>
              <input
                type="time"
                value={form.violation_time}
                onChange={e => set('violation_time', e.target.value)}
                style={FIELD_STYLE}
              />
            </div>

            {/* Location */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6, letterSpacing: '0.3px' }}>
                Location
              </label>
              <input
                type="text"
                value={form.location}
                onChange={e => set('location', e.target.value)}
                placeholder="e.g. Şişli, Istanbul"
                style={FIELD_STYLE}
              />
            </div>

            {/* Article */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6, letterSpacing: '0.3px' }}>
                Article
              </label>
              <input
                type="text"
                value={form.article}
                onChange={e => set('article', e.target.value)}
                placeholder="e.g. Art. 51"
                style={FIELD_STYLE}
              />
            </div>

            {/* Fine Image */}
            <div>
              <FileUploadField
                label="Fine Image"
                accept="image/*"
                file={form.fine_image}
                onChange={f => set('fine_image', f)}
              />
            </div>

            {/* Fine PDF */}
            <div>
              <FileUploadField
                label="Fine PDF"
                accept=".pdf,application/pdf"
                file={form.fine_pdf}
                onChange={f => set('fine_pdf', f)}
              />
            </div>

            {/* Description */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6, letterSpacing: '0.3px' }}>
                Description
              </label>
              <textarea
                value={form.description}
                onChange={e => set('description', e.target.value)}
                rows={3}
                placeholder="Optional notes about the violation…"
                style={{
                  ...FIELD_STYLE, height: 'auto', padding: '10px 12px',
                  resize: 'vertical', lineHeight: 1.5,
                }}
              />
            </div>
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24, paddingTop: 20, borderTop: '1px solid #f0f0f0' }}>
            <button type="button" onClick={onClose} style={{
              height: 40, padding: '0 18px', borderRadius: 9, border: '1.5px solid #e5e7eb',
              background: '#fff', fontSize: 14, fontWeight: 500, color: '#6b7280',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              Cancel
            </button>
            <button type="submit" disabled={saving} style={{
              height: 40, padding: '0 22px', borderRadius: 9, border: 'none',
              background: saving ? '#93c5fd' : '#4ba6ea', color: '#fff',
              fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', transition: 'background 150ms ease',
            }}>
              {saving ? 'Saving…' : 'Add Fine'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

// ─── Edit Fine Modal ──────────────────────────────────────────────────────────

interface EditFineModalProps {
  fine: Fine;
  cars: CarOption[];
  onClose: () => void;
  onSaved: () => void;
}

const EditFineModal: React.FC<EditFineModalProps> = ({ fine, cars, onClose, onSaved }) => {
  const [form, setForm] = useState({
    violation_number: fine.violation_number,
    car_id: fine.car_id ?? null as number | null,
    plate_number: fine.plate_number,
    customer_id: fine.customer_id ?? null as string | null,
    amount: String(fine.amount),
    violation_date: fine.violation_date ?? '',
    violation_time: fine.violation_time ?? '',
    location: fine.location ?? '',
    article: fine.article ?? '',
    description: fine.description ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [carCustomers, setCarCustomers] = useState<CustomerOption[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  // Pre-load customers for the existing car on mount
  useEffect(() => {
    if (!fine.car_id) return;
    let active = true;
    setCustomersLoading(true);
    fetchCarCustomers(fine.car_id).then(custs => {
      if (!active) return;
      setCarCustomers(custs);
      setCustomersLoading(false);
    });
    return () => { active = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key: keyof typeof form, value: string | number | null) =>
    setForm(f => ({ ...f, [key]: value }));

  const handleCarChange = async (carId: string) => {
    const id = parseInt(carId, 10);
    const car = cars.find(c => c.id === id);
    setForm(f => ({ ...f, car_id: id || null, plate_number: car?.plate_number ?? '', customer_id: null }));
    if (!id) { setCarCustomers([]); return; }
    setCustomersLoading(true);
    const custs = await fetchCarCustomers(id);
    setCarCustomers(custs);
    setCustomersLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.violation_number.trim() || !form.amount || !form.violation_date) {
      setFormError('Please fill in all required fields.');
      return;
    }
    setFormError(null);
    setSaving(true);

    const { error } = await supabase
      .from('traffic_fines')
      .update({
        violation_number: form.violation_number.trim(),
        car_id: form.car_id,
        plate_number: form.plate_number,
        customer_id: form.customer_id || null,
        amount: parseFloat(form.amount),
        violation_date: form.violation_date || null,
        violation_time: form.violation_time || null,
        location: form.location || null,
        article: form.article || null,
        description: form.description || null,
      })
      .eq('id', fine.id);

    setSaving(false);
    if (error) { setFormError(error.message); return; }
    onSaved();
    onClose();
  };

  return ReactDOM.createPortal(
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(15,17,23,0.45)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, animation: 'fadeIn 150ms ease',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 18, width: '100%', maxWidth: 600,
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)',
        animation: 'slideUp 180ms ease',
      }}>
        <div style={{ padding: '22px 26px 18px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#0f1117', letterSpacing: '-0.3px' }}>Edit Fine</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{fine.violation_number}</div>
            </div>
            <button onClick={onClose} style={{
              width: 32, height: 32, borderRadius: 8, border: '1px solid #e5e7eb',
              background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#9ca3af',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '22px 26px' }}>
          {formError && (
            <div style={{
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 10, padding: '10px 14px', marginBottom: 18,
              fontSize: 13, color: '#ef4444', display: 'flex', gap: 8, alignItems: 'center',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.8" /><path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" /></svg>
              {formError}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6, letterSpacing: '0.3px' }}>
                Plate Number
              </label>
              <select value={form.car_id ?? ''} onChange={e => handleCarChange(e.target.value)} style={{ ...FIELD_STYLE, cursor: 'pointer' }}>
                <option value="">Select plate…</option>
                {cars.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.plate_number}{c.model_name ? ` — ${c.model_name}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6, letterSpacing: '0.3px' }}>
                Violation Number <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                required
                value={form.violation_number}
                onChange={e => set('violation_number', e.target.value)}
                placeholder="e.g. MB-94271641"
                style={FIELD_STYLE}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6, letterSpacing: '0.3px' }}>
                Customer
              </label>
              <select
                value={form.customer_id ?? ''}
                onChange={e => set('customer_id', e.target.value || null)}
                disabled={!form.car_id || customersLoading}
                style={{ ...FIELD_STYLE, cursor: (!form.car_id || customersLoading) ? 'not-allowed' : 'pointer', opacity: 1, color: !form.car_id ? '#9ca3af' : '#0f1117' }}
              >
                {!form.car_id
                  ? <option value="">Select a car first</option>
                  : customersLoading
                    ? <option value="">Loading…</option>
                    : <>
                        <option value="">— No customer (general fine) —</option>
                        {carCustomers.length === 0
                          ? <option disabled value="">No customers found for this car</option>
                          : carCustomers.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)
                        }
                      </>
                }
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6, letterSpacing: '0.3px' }}>
                Amount (TRY) <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input type="number" min="0" step="0.01" required value={form.amount} onChange={e => set('amount', e.target.value)} style={FIELD_STYLE} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6, letterSpacing: '0.3px' }}>
                Violation Date <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input type="date" required value={form.violation_date} onChange={e => set('violation_date', e.target.value)} style={FIELD_STYLE} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6, letterSpacing: '0.3px' }}>
                Violation Time
              </label>
              <input type="time" value={form.violation_time} onChange={e => set('violation_time', e.target.value)} style={FIELD_STYLE} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6, letterSpacing: '0.3px' }}>
                Article
              </label>
              <input type="text" value={form.article} onChange={e => set('article', e.target.value)} style={FIELD_STYLE} />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6, letterSpacing: '0.3px' }}>
                Location
              </label>
              <input type="text" value={form.location} onChange={e => set('location', e.target.value)} style={FIELD_STYLE} />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6, letterSpacing: '0.3px' }}>
                Description
              </label>
              <textarea
                value={form.description}
                onChange={e => set('description', e.target.value)}
                rows={3}
                style={{ ...FIELD_STYLE, height: 'auto', padding: '10px 12px', resize: 'vertical', lineHeight: 1.5 }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24, paddingTop: 20, borderTop: '1px solid #f0f0f0' }}>
            <button type="button" onClick={onClose} style={{
              height: 40, padding: '0 18px', borderRadius: 9, border: '1.5px solid #e5e7eb',
              background: '#fff', fontSize: 14, fontWeight: 500, color: '#6b7280',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              Cancel
            </button>
            <button type="submit" disabled={saving} style={{
              height: 40, padding: '0 22px', borderRadius: 9, border: 'none',
              background: saving ? '#93c5fd' : '#4ba6ea', color: '#fff',
              fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

// ─── View Fine Modal ──────────────────────────────────────────────────────────

const ViewFineModal: React.FC<{ fine: Fine; onClose: () => void }> = ({ fine, onClose }) => {
  const { fmt: formatAmount } = useCurrency();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const cfg = STATUS_CFG[fine.status];

  const DetailRow: React.FC<{ label: string; value: string | null | undefined }> = ({ label, value }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
      <span style={{ fontSize: 14, color: value ? '#0f1117' : '#d1d5db', fontWeight: value ? 500 : 400 }}>{value || '—'}</span>
    </div>
  );

  return ReactDOM.createPortal(
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(15,17,23,0.45)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, animation: 'fadeIn 150ms ease',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 18, width: '100%', maxWidth: 540,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)',
        animation: 'slideUp 180ms ease',
      }}>
        <div style={{ padding: '22px 26px 18px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#0f1117', letterSpacing: '-0.3px' }}>{fine.violation_number}</div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{formatDateDisplay(fine.violation_date)}</div>
              </div>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 11, fontWeight: 700, color: cfg.color, background: cfg.bg,
                borderRadius: 20, padding: '3px 10px',
              }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
                {cfg.label}
              </span>
            </div>
            <button onClick={onClose} style={{
              width: 32, height: 32, borderRadius: 8, border: '1px solid #e5e7eb',
              background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '22px 26px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <DetailRow label="Plate Number" value={fine.plate_number} />
            <DetailRow label="Customer" value={fine.customer_name} />
            <DetailRow label="Amount" value={formatAmount(fine.amount)} />
            <DetailRow label="Violation Date" value={formatDateDisplay(fine.violation_date)} />
            <DetailRow label="Violation Time" value={fine.violation_time} />
            <DetailRow label="Article" value={fine.article} />
            <div style={{ gridColumn: '1 / -1' }}>
              <DetailRow label="Location" value={fine.location} />
            </div>
            {fine.description && (
              <div style={{ gridColumn: '1 / -1' }}>
                <DetailRow label="Description" value={fine.description} />
              </div>
            )}
          </div>

          {(fine.fine_image_url || fine.fine_pdf_url || fine.payment_receipt_url) && (
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #f0f0f0' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
                Attachments
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {fine.fine_image_url && (
                  <a href={fine.fine_image_url} target="_blank" rel="noopener noreferrer" style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px',
                    background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb',
                    textDecoration: 'none', color: '#374151', fontSize: 13, fontWeight: 500,
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" stroke="#9ca3af" strokeWidth="1.8" /><circle cx="8.5" cy="8.5" r="1.5" fill="#9ca3af" /><path d="M21 15l-5-5L5 21" stroke="#9ca3af" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    Fine Image
                  </a>
                )}
                {fine.fine_pdf_url && (
                  <a href={fine.fine_pdf_url} target="_blank" rel="noopener noreferrer" style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px',
                    background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb',
                    textDecoration: 'none', color: '#374151', fontSize: 13, fontWeight: 500,
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="#9ca3af" strokeWidth="1.8" /><path d="M14 2v6h6" stroke="#9ca3af" strokeWidth="1.8" strokeLinecap="round" /></svg>
                    Fine PDF
                  </a>
                )}
                {fine.payment_receipt_url && (
                  <a href={fine.payment_receipt_url} target="_blank" rel="noopener noreferrer" style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px',
                    background: 'rgba(34,197,94,0.06)', borderRadius: 8, border: '1px solid rgba(34,197,94,0.2)',
                    textDecoration: 'none', color: '#374151', fontSize: 13, fontWeight: 500,
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" /><circle cx="12" cy="12" r="9" stroke="#22c55e" strokeWidth="1.8" /></svg>
                    Payment Receipt
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: '16px 26px', borderTop: '1px solid #f0f0f0', flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            height: 40, padding: '0 22px', borderRadius: 9, border: '1.5px solid #e5e7eb',
            background: '#fff', fontSize: 14, fontWeight: 500, color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit',
          }}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─── Confirm Payment Modal ────────────────────────────────────────────────────

interface ConfirmPaymentModalProps {
  fine: Fine;
  onClose: () => void;
  onPaid: () => void;
}

const ConfirmPaymentModal: React.FC<ConfirmPaymentModalProps> = ({ fine, onClose, onPaid }) => {
  const { fmt: formatAmount } = useCurrency();
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const handleConfirm = async () => {
    setError(null);
    setSaving(true);
    try {
      let payment_receipt_url: string | null = fine.payment_receipt_url;

      if (receiptFile) {
        // Determine next sequence number for this plate
        const { data: existingFiles, error: listError } = await supabase
          .storage
          .from('cezalar')
          .list('CZ-F', { limit: 1000, search: `CZ-F-${fine.plate_number}-` });

        console.log('[Receipt upload] bucket=cezalar, plate=', fine.plate_number, 'existing=', existingFiles, 'listError=', listError);

        if (listError) throw new Error(`Failed to list existing receipts: ${listError.message}`);

        const sequence = (existingFiles?.length ?? 0) + 1;
        const ext = receiptFile.name.split('.').pop()?.toLowerCase() ?? 'pdf';
        const filePath = `CZ-F/CZ-F-${fine.plate_number}-${sequence}.${ext}`;

        console.log('[Receipt upload] filePath=', filePath, 'fileSize=', receiptFile.size);

        const { data: uploadData, error: uploadError } = await supabase
          .storage
          .from('cezalar')
          .upload(filePath, receiptFile, { cacheControl: '3600', upsert: false });

        console.log('[Receipt upload] response=', { data: uploadData, error: uploadError });

        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

        const { data: urlData } = supabase.storage.from('cezalar').getPublicUrl(filePath);
        payment_receipt_url = urlData.publicUrl;
      }

      const { error: updateErr } = await supabase
        .from('traffic_fines')
        .update({ status: 'paid', payment_receipt_url })
        .eq('id', fine.id);

      if (updateErr) throw updateErr;
      onPaid();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to confirm payment.');
      setSaving(false);
    }
  };

  return ReactDOM.createPortal(
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(15,17,23,0.45)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, animation: 'fadeIn 150ms ease',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 18, width: '100%', maxWidth: 440,
        boxShadow: '0 24px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)',
        animation: 'slideUp 180ms ease',
      }}>
        <div style={{ padding: '22px 26px 18px', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#0f1117', letterSpacing: '-0.3px' }}>Confirm Payment</div>
            <button onClick={onClose} style={{
              width: 32, height: 32, borderRadius: 8, border: '1px solid #e5e7eb',
              background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
          </div>
        </div>

        <div style={{ padding: '22px 26px' }}>
          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 10, padding: '10px 14px', marginBottom: 18,
              fontSize: 13, color: '#ef4444',
            }}>
              {error}
            </div>
          )}

          {/* Summary card */}
          <div style={{
            background: '#f9fafb', borderRadius: 12, padding: '16px 18px',
            border: '1px solid #e5e7eb', marginBottom: 20,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Plate Number</span>
              <span style={{
                background: '#f3f4f6', borderRadius: 6, padding: '2px 8px',
                fontSize: 12, fontWeight: 700, color: '#0f1117', letterSpacing: '0.2px',
              }}>
                {fine.plate_number}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Fine Amount</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: '#ef4444', letterSpacing: '-0.5px' }}>
                {formatAmount(fine.amount)}
              </span>
            </div>
          </div>

          {/* Receipt upload */}
          <FileUploadField
            label="Payment Receipt (optional)"
            accept="image/*,.pdf"
            file={receiptFile}
            onChange={setReceiptFile}
          />

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22, paddingTop: 20, borderTop: '1px solid #f0f0f0' }}>
            <button onClick={onClose} style={{
              height: 40, padding: '0 18px', borderRadius: 9, border: '1.5px solid #e5e7eb',
              background: '#fff', fontSize: 14, fontWeight: 500, color: '#6b7280',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              Cancel
            </button>
            <button onClick={handleConfirm} disabled={saving} style={{
              height: 40, padding: '0 22px', borderRadius: 9, border: 'none',
              background: saving ? '#86efac' : '#22c55e', color: '#fff',
              fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}>
              {saving ? 'Confirming…' : 'Confirm Payment'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

const DeleteModal: React.FC<{
  fine: Fine;
  onClose: () => void;
  onDeleted: () => void;
}> = ({ fine, onClose, onDeleted }) => {
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const handleDelete = async () => {
    setDeleting(true);
    await supabase.from('traffic_fines').delete().eq('id', fine.id);
    onDeleted();
    onClose();
  };

  return ReactDOM.createPortal(
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(15,17,23,0.45)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, animation: 'fadeIn 150ms ease',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 18, width: '100%', maxWidth: 400,
        boxShadow: '0 24px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)',
        animation: 'slideUp 180ms ease', padding: '26px',
      }}>
        <div style={{
          width: 46, height: 46, borderRadius: 12, background: 'rgba(239,68,68,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M3 6h18M19 6l-1 14H6L5 6M10 6V4h4v2" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: '#0f1117', marginBottom: 8 }}>Delete Fine</div>
        <div style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.5, marginBottom: 24 }}>
          Are you sure you want to delete fine <strong style={{ color: '#0f1117' }}>{fine.violation_number}</strong> for plate <strong style={{ color: '#0f1117' }}>{fine.plate_number}</strong>? This action cannot be undone.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, height: 40, borderRadius: 9, border: '1.5px solid #e5e7eb',
            background: '#fff', fontSize: 14, fontWeight: 500, color: '#6b7280',
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
            Cancel
          </button>
          <button onClick={handleDelete} disabled={deleting} style={{
            flex: 1, height: 40, borderRadius: 9, border: 'none',
            background: deleting ? '#fca5a5' : '#ef4444', color: '#fff',
            fontSize: 14, fontWeight: 600, cursor: deleting ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
          }}>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

type FilterStatus = 'all' | 'paid' | 'unpaid';
type ModalState =
  | { type: 'add' }
  | { type: 'edit'; fine: Fine }
  | { type: 'view'; fine: Fine }
  | { type: 'pay'; fine: Fine }
  | { type: 'delete'; fine: Fine }
  | null;

const FinesPage: React.FC = () => {
  const { fmt: formatAmount } = useCurrency();
  const [fines, setFines] = useState<Fine[]>([]);
  const [cars, setCars] = useState<CarOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const fetchFines = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('traffic_fines')
      .select(`
        id, status, plate_number, violation_number, customer_name,
        notification_date, amount, location, violation_date, violation_time,
        article, description, fine_image_url, fine_pdf_url, payment_receipt_url,
        created_at, car_id, customer_id, violation_code
      `)
      .order('created_at', { ascending: false });

    if (err) { setError(err.message); setLoading(false); return; }

    const rawFines = (data as Fine[]) ?? [];

    // Resolve customer names from customer_id (new fines don't have customer_name stored)
    const customerIds = [...new Set(
      rawFines.map(f => f.customer_id).filter((id): id is string => !!id),
    )];

    if (customerIds.length > 0) {
      const { data: custData } = await supabase
        .from('customers')
        .select('id, first_name, last_name')
        .in('id', customerIds);

      const custMap = new Map(
        (custData as Array<{ id: string | number; first_name: string; last_name: string }> ?? [])
          .map(c => [String(c.id), `${c.first_name} ${c.last_name}`.trim()]),
      );

      setFines(rawFines.map(f =>
        f.customer_id && custMap.has(f.customer_id)
          ? { ...f, customer_name: custMap.get(f.customer_id)! }
          : f,
      ));
    } else {
      setFines(rawFines);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: carsData } = await supabase
        .from('cars')
        .select('id, plate_number, model_group:model_group_id(name)')
        .eq('is_active', true)
        .order('plate_number');
      if (!active) return;
      setCars(
        (carsData as Array<{ id: number; plate_number: string; model_group: { name: string } | { name: string }[] | null }> ?? [])
          .map(c => {
            const mg = c.model_group;
            const model_name = Array.isArray(mg) ? (mg[0]?.name ?? '') : (mg as { name: string } | null)?.name ?? '';
            return { id: c.id, plate_number: c.plate_number, model_name };
          })
      );
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    fetchFines();
  }, [fetchFines]);

  // Stats
  const totalCount = fines.length;
  const totalUnpaid = fines
    .filter(f => f.status === 'unpaid')
    .reduce((sum, f) => sum + f.amount, 0);

  // Filtered
  const filtered = fines.filter(f => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      f.plate_number.toLowerCase().includes(q) ||
      (f.customer_name ?? '').toLowerCase().includes(q) ||
      f.violation_number.toLowerCase().includes(q) ||
      (f.location ?? '').toLowerCase().includes(q);
    const matchStatus = filterStatus === 'all' || f.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)', padding: '44px 40px' }}>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes slideUpIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .fine-row:hover { background: rgba(75,166,234,0.03) !important; }
      `}</style>

      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ba6ea' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: '1px', textTransform: 'uppercase' }}>
            Operations
          </span>
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 800, color: '#0f1117', letterSpacing: '-0.8px', margin: 0 }}>
          Traffic Fines
        </h1>
        <p style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>
          Manage and track all vehicle traffic fines
        </p>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 12, padding: '12px 16px', marginBottom: 24,
          display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#ef4444',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.8" /><path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" /></svg>
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 28 }}>
        {/* Total Fines */}
        <div style={{
          background: '#fff', borderRadius: 14, padding: '20px 22px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0',
          position: 'relative', overflow: 'hidden',
          transition: 'transform 180ms ease, box-shadow 180ms ease',
        }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-4px)';
            (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 24px rgba(75,166,234,0.12)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
            (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)';
          }}
        >
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: '#4ba6ea', borderRadius: '14px 14px 0 0' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 8 }}>
                Total Fines
              </div>
              <div style={{ fontSize: 40, fontWeight: 800, color: '#0f1117', letterSpacing: '-1.5px', lineHeight: 1 }}>
                {loading ? '—' : totalCount}
              </div>
            </div>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(75,166,234,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <rect x="2" y="6" width="20" height="13" rx="2" stroke="#4ba6ea" strokeWidth="1.8" />
                <path d="M2 10h20" stroke="#4ba6ea" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M6 14h2M10 14h4" stroke="#4ba6ea" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        </div>

        {/* Total Unpaid */}
        <div style={{
          background: '#fff', borderRadius: 14, padding: '20px 22px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0',
          position: 'relative', overflow: 'hidden',
          transition: 'transform 180ms ease, box-shadow 180ms ease',
        }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-4px)';
            (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 24px rgba(239,68,68,0.12)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
            (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)';
          }}
        >
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: '#ef4444', borderRadius: '14px 14px 0 0' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 8 }}>
                Total Unpaid
              </div>
              <div style={{ fontSize: 32, fontWeight: 800, color: '#ef4444', letterSpacing: '-1px', lineHeight: 1 }}>
                {loading ? '—' : formatAmount(totalUnpaid)}
              </div>
            </div>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.8" />
                <path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{
        background: '#fff', borderRadius: 14, padding: '16px 18px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0',
        marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 160 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
            <path d="M20 20l-3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="Search plate, customer, violation…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', height: 38, paddingLeft: 34, paddingRight: 12,
              fontSize: 13, color: '#0f1117', background: '#f9fafb',
              border: '1.5px solid #e5e7eb', borderRadius: 9, outline: 'none',
              fontFamily: 'inherit', boxSizing: 'border-box', transition: 'border-color 150ms ease',
            }}
            onFocus={e => (e.target.style.borderColor = '#4ba6ea')}
            onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
          />
        </div>

        {/* Status filter */}
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as FilterStatus)}
          style={{
            height: 38, padding: '0 12px', fontSize: 13, color: '#374151',
            background: '#f9fafb', border: '1.5px solid #e5e7eb', borderRadius: 9,
            outline: 'none', fontFamily: 'inherit', cursor: 'pointer',
          }}
        >
          <option value="all">All Statuses</option>
          <option value="paid">Paid</option>
          <option value="unpaid">Unpaid</option>
        </select>

        <div style={{ flex: 1 }} />

        {/* Add Fine button */}
        <button
          onClick={() => setModal({ type: 'add' })}
          style={{
            height: 38, padding: '0 18px', borderRadius: 9, border: 'none',
            background: '#4ba6ea', color: '#fff',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 7,
            fontFamily: 'inherit', transition: 'background 150ms ease',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#2e8fd4')}
          onMouseLeave={e => (e.currentTarget.style.background = '#4ba6ea')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          Add Fine
        </button>
      </div>

      {/* Table */}
      <div style={{
        background: '#fff', borderRadius: 14, overflow: 'hidden',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr>
                <Th>Plate</Th>
                <Th>Violation #</Th>
                <Th>Customer</Th>
                <Th style={{ textAlign: 'right' }}>Amount</Th>
                <Th>Status</Th>
                <Th>Date</Th>
                <Th>Location</Th>
                <Th style={{ textAlign: 'right' }}>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
                : filtered.length === 0
                  ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '48px 24px', textAlign: 'center' }}>
                        <div style={{ fontSize: 14, color: '#9ca3af' }}>
                          {search || filterStatus !== 'all' ? 'No fines match your search.' : 'No fines recorded yet.'}
                        </div>
                      </td>
                    </tr>
                  )
                  : filtered.map((fine, idx) => (
                    <tr key={fine.id} className="fine-row" style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa', transition: 'background 100ms ease' }}>
                      <td style={{ padding: '11px 12px' }}>
                        <span style={{
                          display: 'inline-block', background: '#f3f4f6', borderRadius: 6,
                          padding: '2px 8px', fontSize: 12, fontWeight: 700, color: '#0f1117', letterSpacing: '0.2px',
                        }}>
                          {fine.plate_number}
                        </span>
                      </td>
                      <td style={{ padding: '11px 12px' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{fine.violation_number}</span>
                      </td>
                      <td style={{ padding: '11px 12px' }}>
                        <span style={{ fontSize: 13, color: '#374151' }}>{fine.customer_name || '—'}</span>
                      </td>
                      <td style={{ padding: '11px 12px', textAlign: 'right' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: fine.status === 'unpaid' ? '#ef4444' : '#0f1117' }}>
                          {formatAmount(fine.amount)}
                        </span>
                      </td>
                      <td style={{ padding: '11px 12px' }}>
                        <StatusBadge status={fine.status} />
                      </td>
                      <td style={{ padding: '11px 12px' }}>
                        <span style={{ fontSize: 13, color: '#6b7280', whiteSpace: 'nowrap' }}>
                          {formatDateDisplay(fine.violation_date)}
                        </span>
                      </td>
                      <td style={{ padding: '11px 12px', maxWidth: 180 }}>
                        <span style={{
                          fontSize: 13, color: '#6b7280',
                          display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {fine.location || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '11px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'flex-end' }}>
                          {fine.status === 'unpaid' && (
                            <button
                              onClick={() => setModal({ type: 'pay', fine })}
                              title="Mark as paid"
                              style={{
                                height: 28, padding: '0 10px', borderRadius: 7, border: 'none',
                                background: 'rgba(34,197,94,0.1)', color: '#22c55e',
                                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                fontFamily: 'inherit', transition: 'all 140ms ease',
                                whiteSpace: 'nowrap',
                              }}
                              onMouseEnter={e => {
                                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(34,197,94,0.18)';
                              }}
                              onMouseLeave={e => {
                                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(34,197,94,0.1)';
                              }}
                            >
                              Pay
                            </button>
                          )}
                          <ActionBtn onClick={() => setModal({ type: 'view', fine })} title="View details" hoverColor="#4ba6ea">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="1.8" />
                              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
                            </svg>
                          </ActionBtn>
                          <ActionBtn onClick={() => setModal({ type: 'edit', fine })} title="Edit fine" hoverColor="#6b7280">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </ActionBtn>
                          <ActionBtn onClick={() => setModal({ type: 'delete', fine })} title="Delete fine" hoverColor="#ef4444">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                              <path d="M3 6h18M19 6l-1 14H6L5 6M10 6V4h4v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </ActionBtn>
                        </div>
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>

        {/* Table footer */}
        {!loading && filtered.length > 0 && (
          <div style={{
            padding: '12px 18px', borderTop: '1px solid #f5f5f5',
            fontSize: 12, color: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span>Showing {filtered.length} of {totalCount} fines</span>
            {filterStatus !== 'all' && (
              <button
                onClick={() => setFilterStatus('all')}
                style={{ background: 'none', border: 'none', color: '#4ba6ea', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
              >
                Clear filter
              </button>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {modal?.type === 'add' && (
        <AddFineModal
          cars={cars}
          onClose={() => setModal(null)}
          onSaved={() => { fetchFines(); showToast('Fine added successfully.', 'success'); }}
        />
      )}
      {modal?.type === 'edit' && (
        <EditFineModal
          fine={modal.fine}
          cars={cars}
          onClose={() => setModal(null)}
          onSaved={() => { fetchFines(); showToast('Fine updated successfully.', 'success'); }}
        />
      )}
      {modal?.type === 'view' && (
        <ViewFineModal
          fine={modal.fine}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'pay' && (
        <ConfirmPaymentModal
          fine={modal.fine}
          onClose={() => setModal(null)}
          onPaid={() => { fetchFines(); showToast('Payment confirmed successfully.', 'success'); }}
        />
      )}
      {modal?.type === 'delete' && (
        <DeleteModal
          fine={modal.fine}
          onClose={() => setModal(null)}
          onDeleted={() => { fetchFines(); showToast('Fine deleted.', 'success'); }}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
};

export default FinesPage;
