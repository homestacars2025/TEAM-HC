import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type OperationType =
  | 'DELIVERY' | 'PICKUP'
  | 'CAR_WASH' | 'MAINTENANCE' | 'OIL_CHANGE'
  | 'OTHER';

type TabKey = 'dp' | 'other';

interface CarOption      { id: number; plate_number: string; model_group: { name: string } | null; }
interface ProfileOption  { id: string; full_name: string | null; role: string; }
interface CustomerOption { id: string; first_name: string; last_name: string; }

interface OperationRow {
  id: number;
  operation_date: string;
  operation_time: string | null;
  type: OperationType;
  car_id: number;
  performed_by: string | null;
  customer_id: string | null;
  current_km: number | null;
  fuel_level: number | null;
  cleanliness_status: string | null;
  location_text: string | null;
  note: string | null;
  booking_id: number | null;
  folder_url: string | null;
  cars: { plate_number: string } | { plate_number: string }[] | null;
  handler: { full_name: string | null } | { full_name: string | null }[] | null;
  customers: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
}

interface Operation {
  id: number;
  operation_date: string;
  operation_time: string | null;
  type: OperationType;
  car_id: number;
  performed_by: string | null;
  customer_id: string | null;
  plate_number: string;
  handler_name: string | null;
  customer_name: string | null;
  current_km: number | null;
  fuel_level: number | null;
  cleanliness_status: string | null;
  location_text: string | null;
  note: string | null;
  booking_id: number | null;
  folder_url: string | null;
}

interface AddOpForm {
  type: OperationType;
  car_id: string;
  performed_by: string;
  customer_id: string;
  booking_id: string;
  operation_date: string;
  operation_time: string;
  current_km: string;
  fuel_level: string;
  cleanliness_status: 'clean' | 'not_clean' | '';
  location_text: string;
  note: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<OperationType, { label: string; color: string; bg: string; card: string }> = {
  DELIVERY:    { label: 'Delivery',    color: '#16a34a', bg: 'rgba(22,163,74,0.12)',    card: '#16a34a' },
  PICKUP:      { label: 'Pickup',      color: '#ef4444', bg: 'rgba(239,68,68,0.12)',    card: '#ef4444' },
  CAR_WASH:    { label: 'Car Wash',    color: '#0891b2', bg: 'rgba(8,145,178,0.12)',    card: '#0891b2' },
  MAINTENANCE: { label: 'Maintenance', color: '#6b7280', bg: 'rgba(107,114,128,0.12)', card: '#6b7280' },
  OIL_CHANGE:  { label: 'Oil Change',  color: '#ea580c', bg: 'rgba(234,88,12,0.12)',   card: '#ea580c' },

  OTHER:       { label: 'Other',       color: '#9ca3af', bg: 'rgba(156,163,175,0.12)', card: '#9ca3af' },
};

const ALL_OP_TYPES: OperationType[] = [
  'DELIVERY', 'PICKUP', 'CAR_WASH', 'MAINTENANCE', 'OIL_CHANGE', 'OTHER',
];

const DP_TYPES:    OperationType[] = ['DELIVERY', 'PICKUP'];
const OTHER_TYPES: OperationType[] = ['CAR_WASH', 'MAINTENANCE', 'OIL_CHANGE', 'OTHER'];

const DP_STAT_CARDS    = ['DELIVERY', 'PICKUP'] as const;
const OTHER_STAT_CARDS = ['CAR_WASH', 'MAINTENANCE', 'OIL_CHANGE', 'OTHER'] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMonthStart(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1); }
function getMonthEnd(d: Date):   Date { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function addMonths(d: Date, n: number): Date { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function formatMonthLabel(d: Date): string {
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}
function formatDate(s: string): string {
  if (!s) return '—';
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function todayStr(): string { return toDateStr(new Date()); }
function nowTimeStr(): string {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
}

function opToForm(op: Operation): AddOpForm {
  return {
    type:               op.type,
    car_id:             String(op.car_id),
    performed_by:       op.performed_by ?? '',
    customer_id:        op.customer_id ?? '',
    booking_id:         op.booking_id != null ? String(op.booking_id) : '',
    operation_date:     op.operation_date,
    operation_time:     op.operation_time ?? '',
    current_km:         op.current_km != null ? String(op.current_km) : '',
    fuel_level:         op.fuel_level != null ? String(op.fuel_level) : '',
    cleanliness_status: (op.cleanliness_status === 'clean' || op.cleanliness_status === 'not_clean')
                      ? op.cleanliness_status
                      : '',
    location_text:      op.location_text ?? '',
    note:               op.note ?? '',
  };
}

function sanitizePath(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9\-_]/g, '-')  // keep only alphanumeric, dash, underscore
    .replace(/-+/g, '-')                // collapse multiple dashes
    .replace(/^-|-$/g, '')             // trim leading/trailing dashes
    .toLowerCase();
}

function resolveOperation(row: OperationRow): Operation {
  const car  = Array.isArray(row.cars)      ? row.cars[0]      : row.cars;
  const hdlr = Array.isArray(row.handler)   ? row.handler[0]   : row.handler;
  const cust = Array.isArray(row.customers) ? row.customers[0] : row.customers;
  return {
    id:                 row.id,
    operation_date:     row.operation_date,
    operation_time:     row.operation_time,
    type:               row.type,
    car_id:             row.car_id,
    performed_by:       row.performed_by,
    customer_id:        row.customer_id,
    plate_number:       car?.plate_number ?? '—',
    handler_name:       hdlr?.full_name ?? null,
    customer_name:      cust ? `${cust.first_name} ${cust.last_name}`.trim() : null,
    current_km:         row.current_km,
    fuel_level:         row.fuel_level,
    cleanliness_status: row.cleanliness_status,
    location_text:      row.location_text,
    note:               row.note,
    booking_id:         row.booking_id,
    folder_url:         row.folder_url,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const StatCard: React.FC<{ label: string; value: number; bg: string; loading: boolean }> = ({
  label, value, bg, loading,
}) => (
  <div style={{ background: bg, borderRadius: 12, padding: '14px 18px', color: '#fff', display: 'flex', flexDirection: 'column', gap: 6 }}>
    <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.7px', opacity: 0.82 }}>{label}</div>
    <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-1.5px', lineHeight: 1 }}>{loading ? '—' : value}</div>
  </div>
);

const MonthArrow: React.FC<{ direction: 'left' | 'right'; onClick: () => void }> = ({ direction, onClick }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ width: 36, height: 36, borderRadius: 10, border: `1.5px solid ${hovered ? '#4ba6ea' : '#e5e7eb'}`, background: hovered ? 'rgba(75,166,234,0.06)' : '#fff', color: hovered ? '#4ba6ea' : '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 140ms ease', flexShrink: 0 }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        {direction === 'left'
          ? <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          : <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>}
      </svg>
    </button>
  );
};

const TypeBadge: React.FC<{ type: OperationType }> = ({ type }) => {
  const cfg = TYPE_CONFIG[type] ?? TYPE_CONFIG.OTHER;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: cfg.color, background: cfg.bg, borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
};

const SkeletonRow: React.FC<{ cols: number }> = ({ cols }) => (
  <tr>
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i} style={{ padding: '9px 12px' }}>
        <div style={{ height: 13, width: [80, 110, 90, 110, 120, 70, 80, 120, 60][i] ?? 80, borderRadius: 6, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
      </td>
    ))}
  </tr>
);

const Th: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = ({ children, style, ...rest }) => (
  <th style={{ padding: '9px 12px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px', textAlign: 'left', background: '#fff', borderBottom: '1.5px solid #f0f0f0', whiteSpace: 'nowrap', ...style }} {...rest}>
    {children}
  </th>
);

// ─── Toast ────────────────────────────────────────────────────────────────────

const Toast: React.FC<{ message: string; kind: 'success' | 'error' }> = ({ message, kind }) =>
  ReactDOM.createPortal(
    <div style={{
      position: 'fixed', bottom: 28, right: 28, zIndex: 2000,
      display: 'flex', alignItems: 'center', gap: 10,
      background: kind === 'success' ? '#0f1117' : '#fff1f2',
      color: kind === 'success' ? '#fff' : '#ef4444',
      border: kind === 'error' ? '1px solid #fecaca' : 'none',
      borderRadius: 12, padding: '12px 18px',
      fontSize: 13, fontWeight: 500,
      boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      animation: 'slideUp 200ms ease',
    }}>
      {kind === 'success'
        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#16a34a"/><path d="M7 12l4 4 6-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#ef4444" strokeWidth="1.8"/><path d="M12 8v5M12 16h.01" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/></svg>
      }
      {message}
    </div>,
    document.body,
  );

// ─── Add Operation Modal ──────────────────────────────────────────────────────

const EMPTY_FORM = (): AddOpForm => ({
  type:               'DELIVERY',
  car_id:             '',
  performed_by:       '',
  customer_id:        '',
  booking_id:         '',
  operation_date:     todayStr(),
  operation_time:     nowTimeStr(),
  current_km:         '',
  fuel_level:         '',
  cleanliness_status: '',
  location_text:      '',
  note:               '',
});

const AddOperationModal: React.FC<{
  onClose: () => void;
  onSaved: (warning?: string) => void;
  editOp?: Operation;
}> = ({ onClose, onSaved, editOp }) => {
  const isEdit = !!editOp;
  const [form, setForm]               = useState<AddOpForm>(isEdit ? opToForm(editOp!) : EMPTY_FORM);
  const [cars, setCars]               = useState<CarOption[]>([]);
  const [carsLoading, setCarsLoading] = useState(true);
  const [profiles, setProfiles]           = useState<ProfileOption[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [customers, setCustomers]         = useState<CustomerOption[]>([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [photos, setPhotos]               = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [saving, setSaving]           = useState(false);
  const [saveStep, setSaveStep]       = useState<'saving' | 'uploading'>('saving');
  const [formError, setFormError]     = useState<string | null>(null);

  // Refs to skip resets on initial mount when editing
  const skipCarResetRef     = useRef(isEdit);
  const skipBookingFillRef  = useRef(isEdit);

  // Fetch cars
  useEffect(() => {
    let active = true;
    supabase
      .from('cars')
      .select('id, plate_number, model_group:model_group_id(name)')
      .then(({ data }) => {
        if (active && data) {
          const sorted = (data as unknown as CarOption[]).sort((a, b) => {
            const nameA = a.model_group?.name ?? '';
            const nameB = b.model_group?.name ?? '';
            return nameA.localeCompare(nameB);
          });
          setCars(sorted);
        }
        if (active) setCarsLoading(false);
      });
    return () => { active = false; };
  }, []);

  // Fetch staff/admin profiles
  useEffect(() => {
    let active = true;
    supabase
      .from('profiles')
      .select('id, full_name, role')
      .in('role', ['admin', 'staff'])
      .order('full_name')
      .then(({ data }) => {
        if (active && data) setProfiles(data as ProfileOption[]);
        if (active) setProfilesLoading(false);
      });
    return () => { active = false; };
  }, []);

  // Fetch customers filtered by the selected car's booking history
  useEffect(() => {
    if (!form.car_id) {
      setCustomers([]);
      setCustomersLoading(false);
      if (!skipCarResetRef.current) {
        setForm(f => ({ ...f, customer_id: '', booking_id: '' }));
      }
      return;
    }
    let active = true;
    setCustomersLoading(true);
    if (!skipCarResetRef.current) {
      setCustomers([]);
      setForm(f => ({ ...f, customer_id: '', booking_id: '' }));
    }
    supabase
      .from('bookings')
      .select('customer_id, customers(id, first_name, last_name)')
      .eq('car_id', Number(form.car_id))
      .then(({ data }) => {
        if (!active) return;
        if (data) {
          const seen = new Set<string>();
          const unique: CustomerOption[] = [];
          for (const row of data as Array<{ customer_id: string | null; customers: CustomerOption | CustomerOption[] | null }>) {
            const c = Array.isArray(row.customers) ? row.customers[0] : row.customers;
            if (c && !seen.has(c.id)) {
              seen.add(c.id);
              unique.push(c);
            }
          }
          unique.sort((a, b) => a.first_name.localeCompare(b.first_name));
          setCustomers(unique);
        }
        setCustomersLoading(false);
        skipCarResetRef.current = false;
      });
    return () => { active = false; };
  }, [form.car_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear customer + booking when type leaves DELIVERY/PICKUP
  useEffect(() => {
    if (!(DP_TYPES as string[]).includes(form.type)) {
      setForm(f => ({ ...f, customer_id: '', booking_id: '' }));
    }
  }, [form.type]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fill booking_id when customer is selected (skip on initial mount in edit mode)
  useEffect(() => {
    if (!form.customer_id || !(DP_TYPES as string[]).includes(form.type)) return;
    if (skipBookingFillRef.current) { skipBookingFillRef.current = false; return; }
    let active = true;
    setBookingLoading(true);
    supabase
      .from('bookings')
      .select('id')
      .eq('customer_id', form.customer_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => {
        if (!active) return;
        setBookingLoading(false);
        if (data) setForm(f => ({ ...f, booking_id: String(data.id) }));
      });
    return () => { active = false; };
  }, [form.customer_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Blob URL previews — revoke on change / unmount
  useEffect(() => {
    const urls = photos.map(f => URL.createObjectURL(f));
    setPreviewUrls(urls);
    return () => urls.forEach(u => URL.revokeObjectURL(u));
  }, [photos]);

  const set = (k: keyof AddOpForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.car_id)     { setFormError('Please select a car.'); return; }
    if (!form.type)       { setFormError('Please select an operation type.'); return; }
    if (!form.performed_by) { setFormError('Please select who handled this operation.'); return; }
    if (form.fuel_level === '')                                    { setFormError('Fuel level is required.'); return; }
    if (Number(form.fuel_level) > 2000)                           { setFormError('Maximum fuel level is 2000'); return; }

    setSaving(true);
    setSaveStep('saving');
    setFormError(null);

    const corePayload: Record<string, unknown> = {
      type:               form.type,
      car_id:             Number(form.car_id),
      operation_date:     form.operation_date,
      operation_time:     form.operation_time || null,
      current_km:         form.current_km ? Number(form.current_km) : null,
      fuel_level:         form.fuel_level !== '' ? Number(form.fuel_level) : null,
      cleanliness_status: form.cleanliness_status || null,
      location_text:      form.location_text || null,
      note:               form.note || null,
      performed_by:       form.performed_by,
      customer_id:        form.customer_id || null,
      booking_id:         form.booking_id.trim() ? Number(form.booking_id) : null,
    };

    console.log('[DEBUG] cleanliness_status being saved:', corePayload.cleanliness_status);

    // ── Edit mode ────────────────────────────────────────────────────────────
    if (isEdit) {
      const { error: updateError } = await supabase
        .from('operations')
        .update(corePayload)
        .eq('id', editOp!.id);
      setSaving(false);
      if (updateError) { setFormError(updateError.message); return; }
      onSaved();
      return;
    }

    // ── Add mode ─────────────────────────────────────────────────────────────
    const { data: { user } } = await supabase.auth.getUser();
    const uid = user?.id ?? null;

    const selectedCar      = cars.find(c => String(c.id) === form.car_id);
    const selectedCustomer = customers.find(c => c.id === form.customer_id);
    const platePart    = sanitizePath(selectedCar?.plate_number ?? 'unknown');
    const typePart     = sanitizePath(form.type);
    const customerPart = selectedCustomer
      ? sanitizePath(`${selectedCustomer.first_name} ${selectedCustomer.last_name}`)
      : 'unknown';
    const folderName  = `${platePart}-${typePart}-${customerPart}`;
    const supabaseUrl = process.env.REACT_APP_SUPABASE_URL ?? '';
    const folderUrl   = photos.length > 0
      ? `${supabaseUrl}/storage/v1/object/public/operations/${folderName}/`
      : null;

    const insertPayload = { ...corePayload, created_by: uid, folder_url: folderUrl };

    const { error: insertError } = await supabase.from('operations').insert(insertPayload);
    if (insertError) { setSaving(false); setFormError(insertError.message); return; }

    // Upload photos if any
    if (photos.length > 0) {
      setSaveStep('uploading');
      let failCount = 0;
      for (const file of photos) {
        const ext      = file.name.includes('.') ? file.name.split('.').pop() : '';
        const baseName = sanitizePath(file.name.replace(/\.[^.]+$/, ''));
        const fileName = `${Date.now()}-${baseName}${ext ? `.${ext}` : ''}`;
        const path     = `${folderName}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('operations')
          .upload(path, file, { cacheControl: '3600', upsert: false });

        if (uploadError) failCount++;
      }
      setSaving(false);
      if (failCount > 0) {
        onSaved(`${failCount} photo(s) failed to upload. Operation was saved.`);
      } else {
        onSaved();
      }
    } else {
      setSaving(false);
      onSaved();
    }
  };

  // Shared input styles
  const inputStyle: React.CSSProperties = {
    width: '100%', height: 40, padding: '0 12px', fontSize: 13,
    border: '1.5px solid #e5e7eb', borderRadius: 9, outline: 'none',
    fontFamily: 'inherit', color: '#0f1117', background: '#fff',
    boxSizing: 'border-box', transition: 'border-color 140ms ease',
  };
  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 600, color: '#374151',
    marginBottom: 6, letterSpacing: '0.1px',
  };
  const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column' };

  const onFocus = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    { (e.target as HTMLElement).style.borderColor = '#4ba6ea'; };
  const onBlur  = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    { (e.target as HTMLElement).style.borderColor = '#e5e7eb'; };

  return ReactDOM.createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,17,23,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'fadeIn 150ms ease' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 600, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.2)', animation: 'slideUp 180ms ease' }}
      >
        {/* Header */}
        <div style={{ padding: '24px 28px 18px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#0f1117', letterSpacing: '-0.3px' }}>{isEdit ? 'Edit Operation' : 'New Operation'}</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 3 }}>{isEdit ? 'Update the operation details below' : 'Fill in the details below to log a new operation'}</div>
          </div>
          <button onClick={onClose}
            style={{ width: 34, height: 34, borderRadius: 9, border: 'none', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#e5e7eb'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f3f4f6'; }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#6b7280" strokeWidth="2.2" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', flex: 1, padding: '24px 28px' }}>

          {/* Section: Operation Details */}
          <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 14 }}>
            Operation Details
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 20px', marginBottom: 16 }}>

            {/* Type */}
            <div style={fieldStyle}>
              <label style={labelStyle}>Operation Type <span style={{ color: '#ef4444' }}>*</span></label>
              <select value={form.type} onChange={set('type')} onFocus={onFocus} onBlur={onBlur} style={selectStyle} required>
                {ALL_OP_TYPES.map(t => (
                  <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>
                ))}
              </select>
            </div>

            {/* Car */}
            <div style={fieldStyle}>
              <label style={labelStyle}>Car <span style={{ color: '#ef4444' }}>*</span></label>
              <select value={form.car_id} onChange={set('car_id')} onFocus={onFocus} onBlur={onBlur} style={selectStyle} required>
                <option value="">{carsLoading ? 'Loading cars…' : 'Select a car'}</option>
                {cars.map(c => (
                  <option key={c.id} value={String(c.id)}>
                    {c.plate_number}{c.model_group?.name ? ` — ${c.model_group.name}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Handled By */}
            <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Handled By <span style={{ color: '#ef4444' }}>*</span></label>
              <select value={form.performed_by} onChange={set('performed_by')} onFocus={onFocus} onBlur={onBlur} style={selectStyle} required>
                <option value="">{profilesLoading ? 'Loading staff…' : 'Select a person'}</option>
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.full_name ?? p.id}</option>
                ))}
              </select>
            </div>

            {/* Customer + Booking ID — only for DELIVERY / PICKUP */}
            {(DP_TYPES as string[]).includes(form.type) && (
              <>
                <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Customer <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></label>
                  <select
                    value={form.customer_id}
                    onChange={set('customer_id')}
                    onFocus={onFocus}
                    onBlur={onBlur}
                    disabled={!form.car_id || customersLoading}
                    style={{ ...selectStyle, color: (!form.car_id || customersLoading) ? '#9ca3af' : '#0f1117', opacity: 1 }}
                  >
                    <option value="">
                      {!form.car_id
                        ? 'Select a car first'
                        : customersLoading
                          ? 'Loading customers…'
                          : customers.length === 0
                            ? 'No customers found for this car'
                            : 'Select a customer'}
                    </option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>
                    Booking ID{' '}
                    <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span>
                    {bookingLoading && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 6, animation: 'spin 0.7s linear infinite', verticalAlign: 'middle', color: '#4ba6ea' }}>
                        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="28 56"/>
                      </svg>
                    )}
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Auto-filled when a customer is selected"
                    value={form.booking_id}
                    readOnly
                    style={{ ...inputStyle, background: '#f3f4f6', color: form.booking_id ? '#374151' : '#9ca3af', cursor: 'not-allowed' }}
                  />
                </div>
              </>
            )}

            {/* Date */}
            <div style={fieldStyle}>
              <label style={labelStyle}>Operation Date <span style={{ color: '#ef4444' }}>*</span></label>
              <input type="date" value={form.operation_date} onChange={set('operation_date')} onFocus={onFocus} onBlur={onBlur} style={inputStyle} required />
            </div>

            {/* Time */}
            <div style={fieldStyle}>
              <label style={labelStyle}>Operation Time</label>
              <input type="time" value={form.operation_time} onChange={set('operation_time')} onFocus={onFocus} onBlur={onBlur} style={inputStyle} />
            </div>

            {/* Mileage */}
            <div style={fieldStyle}>
              <label style={labelStyle}>Mileage (km)</label>
              <input type="number" min="0" placeholder="e.g. 54200" value={form.current_km} onChange={set('current_km')} onFocus={onFocus} onBlur={onBlur} style={inputStyle} />
            </div>

            {/* Fuel Level */}
            <div style={fieldStyle}>
              <label style={labelStyle}>Fuel Level (L) <span style={{ color: '#ef4444' }}>*</span></label>
              <input
                type="number"
                min="0"
                max="2000"
                placeholder="e.g. 45"
                value={form.fuel_level}
                onChange={e => {
                  setForm(f => ({ ...f, fuel_level: e.target.value }));
                  if (e.target.value !== '' && Number(e.target.value) > 2000) {
                    setFormError('Maximum fuel level is 2000');
                  } else {
                    setFormError(null);
                  }
                }}
                onFocus={onFocus}
                onBlur={onBlur}
                style={inputStyle}
              />
            </div>

            {/* Cleanliness */}
            <div style={fieldStyle}>
              <label style={labelStyle}>Cleanliness Status</label>
              <select value={form.cleanliness_status} onChange={set('cleanliness_status')} onFocus={onFocus} onBlur={onBlur} style={selectStyle}>
                <option value="">Not specified</option>
                <option value="clean">✅ Clean</option>
                <option value="not_clean">❌ Not clean</option>
              </select>
            </div>

            {/* Location */}
            <div style={fieldStyle}>
              <label style={labelStyle}>Location <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></label>
              <input type="text" placeholder="e.g. Şişli branch" value={form.location_text} onChange={set('location_text')} onFocus={onFocus} onBlur={onBlur} style={inputStyle} />
            </div>
          </div>

          {/* Note */}
          <div style={{ ...fieldStyle, marginBottom: 20 }}>
            <label style={labelStyle}>Note <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></label>
            <textarea
              rows={3}
              placeholder="Any additional notes…"
              value={form.note}
              onChange={set('note')}
              onFocus={onFocus}
              onBlur={onBlur}
              style={{ ...inputStyle, height: 'auto', padding: '10px 12px', resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>

          {/* Photos — add mode only */}
          {!isEdit && <div style={fieldStyle}>
            <label style={labelStyle}>
              Photos <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span>
            </label>

            {/* Drop / click zone */}
            <label style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 6, padding: '18px 12px', border: '1.5px dashed #d1d5db', borderRadius: 10,
              cursor: 'pointer', background: '#fafafa', transition: 'border-color 140ms ease, background 140ms ease',
            }}
              onMouseEnter={e => { const l = e.currentTarget; l.style.borderColor = '#4ba6ea'; l.style.background = 'rgba(75,166,234,0.04)'; }}
              onMouseLeave={e => { const l = e.currentTarget; l.style.borderColor = '#d1d5db'; l.style.background = '#fafafa'; }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ color: '#9ca3af' }}>
                <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.6"/>
                <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
                <path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>
                {photos.length > 0 ? `${photos.length} photo${photos.length > 1 ? 's' : ''} selected — click to add more` : 'Click to select photos'}
              </span>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>JPG, PNG, WEBP accepted</span>
              <input
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={e => {
                  const incoming = Array.from(e.target.files ?? []);
                  if (incoming.length > 0) setPhotos(prev => [...prev, ...incoming]);
                  e.target.value = '';
                }}
              />
            </label>

            {/* Previews */}
            {previewUrls.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 8, marginTop: 12 }}>
                {previewUrls.map((url, i) => (
                  <div key={i} style={{ position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', border: '1.5px solid #e5e7eb' }}>
                    <img src={url} alt={`Preview ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    <button
                      type="button"
                      onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
                      style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>}

          {formError && (
            <div style={{ marginTop: 16, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 9, fontSize: 13, color: '#ef4444' }}>
              {formError}
            </div>
          )}
        </form>

        {/* Footer */}
        <div style={{ padding: '16px 28px 24px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0 }}>
          <button type="button" onClick={onClose}
            style={{ height: 40, padding: '0 20px', borderRadius: 10, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 140ms ease' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#d1d5db'; (e.currentTarget as HTMLButtonElement).style.background = '#f9fafb'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; (e.currentTarget as HTMLButtonElement).style.background = '#fff'; }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={saving}
            style={{ height: 40, padding: '0 24px', borderRadius: 10, border: 'none', background: saving ? '#93c5fd' : '#4ba6ea', fontSize: 13, fontWeight: 700, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'background 140ms ease', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            {saving ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.7s linear infinite' }}>
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="28 56"/>
                </svg>
                {saveStep === 'uploading' ? 'Uploading photos…' : 'Saving…'}
              </>
            ) : isEdit ? 'Save Changes' : 'Save Operation'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─── Confirm Delete Dialog ────────────────────────────────────────────────────

const ConfirmDeleteDialog: React.FC<{
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}> = ({ onConfirm, onCancel, deleting }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return ReactDOM.createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(15,17,23,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'fadeIn 150ms ease' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 400, padding: '28px 28px 24px', boxShadow: '0 24px 80px rgba(0,0,0,0.2)', animation: 'slideUp 180ms ease', textAlign: 'center' }}
      >
        <div style={{ width: 52, height: 52, borderRadius: 14, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M10 11v5M14 11v5" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#0f1117', marginBottom: 8, letterSpacing: '-0.3px' }}>Delete Operation?</div>
        <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6, marginBottom: 24 }}>
          This will permanently delete this operation and all associated photos.<br/>This action cannot be undone.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            disabled={deleting}
            style={{ flex: 1, height: 42, borderRadius: 10, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 14, fontWeight: 600, color: '#374151', cursor: deleting ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'all 140ms ease' }}
            onMouseEnter={e => { if (!deleting) { const b = e.currentTarget as HTMLButtonElement; b.style.background = '#f9fafb'; b.style.borderColor = '#d1d5db'; } }}
            onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = '#fff'; b.style.borderColor = '#e5e7eb'; }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            style={{ flex: 1, height: 42, borderRadius: 10, border: 'none', background: deleting ? '#fca5a5' : '#ef4444', fontSize: 14, fontWeight: 700, color: '#fff', cursor: deleting ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'background 140ms ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
            onMouseEnter={e => { if (!deleting) (e.currentTarget as HTMLButtonElement).style.background = '#dc2626'; }}
            onMouseLeave={e => { if (!deleting) (e.currentTarget as HTMLButtonElement).style.background = '#ef4444'; }}
          >
            {deleting ? (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.7s linear infinite' }}>
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="28 56"/>
                </svg>
                Deleting…
              </>
            ) : 'Delete'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─── Photos Modal ─────────────────────────────────────────────────────────────

const PhotosModal: React.FC<{ folderUrl: string; onClose: () => void }> = ({ folderUrl, onClose }) => {
  const [photos, setPhotos]     = useState<string[]>([]);
  const [fetching, setFetching] = useState(true);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (lightbox) setLightbox(null); else onClose(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, lightbox]);

  useEffect(() => {
    let active = true;
    const parts = folderUrl.split('/public/operations/');
    const folderPath = parts[1]?.replace(/\/$/, '') ?? '';

    supabase.storage
      .from('operations')
      .list(folderPath)
      .then(({ data, error }) => {
        if (!active) return;
        setFetching(false);
        if (error) { setFetchErr(error.message); return; }
        if (!data || data.length === 0) { setPhotos([]); return; }
        const urls = data
          .filter(f => f.name && !f.name.startsWith('.'))
          .map(f => supabase.storage.from('operations').getPublicUrl(`${folderPath}/${f.name}`).data.publicUrl);
        setPhotos(urls);
      });
    return () => { active = false; };
  }, [folderUrl]);

  return ReactDOM.createPortal(
    <>
      {/* Main modal */}
      <div
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(15,17,23,0.6)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'fadeIn 150ms ease' }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 680, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.22)', animation: 'slideUp 180ms ease' }}
        >
          {/* Header */}
          <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0f1117', letterSpacing: '-0.3px' }}>Operation Photos</div>
              {!fetching && !fetchErr && (
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                  {photos.length} photo{photos.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              style={{ width: 34, height: 34, borderRadius: 9, border: 'none', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#e5e7eb'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f3f4f6'; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#6b7280" strokeWidth="2.2" strokeLinecap="round"/></svg>
            </button>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
            {fetching && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} style={{ aspectRatio: '4/3', borderRadius: 10, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
                ))}
              </div>
            )}

            {!fetching && fetchErr && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, fontSize: 13, color: '#ef4444' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.8"/><path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"/></svg>
                {fetchErr}
              </div>
            )}

            {!fetching && !fetchErr && photos.length === 0 && (
              <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style={{ margin: '0 auto 12px', display: 'block', color: '#d1d5db' }}>
                  <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5"/>
                  <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
                  <path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#6b7280' }}>No photos found</div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>The folder exists but contains no photos</div>
              </div>
            )}

            {!fetching && !fetchErr && photos.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {photos.map((url, i) => (
                  <button
                    key={i}
                    onClick={() => setLightbox(url)}
                    style={{ position: 'relative', aspectRatio: '4/3', borderRadius: 10, overflow: 'hidden', border: '1.5px solid #e5e7eb', cursor: 'zoom-in', padding: 0, background: '#f9fafb', display: 'block', width: '100%', transition: 'border-color 140ms ease, transform 140ms ease' }}
                    onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#4ba6ea'; b.style.transform = 'scale(1.02)'; }}
                    onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#e5e7eb'; b.style.transform = 'scale(1)'; }}
                  >
                    <img
                      src={url}
                      alt={`Photo ${i + 1}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0)', transition: 'background 140ms ease', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(0,0,0,0.12)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(0,0,0,0)'; }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ opacity: 0, transition: 'opacity 140ms ease', color: '#fff' }}>
                        <path d="M8 3H5a2 2 0 00-2 2v3M16 3h3a2 2 0 012 2v3M16 21h3a2 2 0 002-2v-3M8 21H5a2 2 0 01-2-2v-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'fadeIn 120ms ease', cursor: 'zoom-out' }}
        >
          <img
            src={lightbox}
            alt="Full size"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', borderRadius: 10, boxShadow: '0 24px 80px rgba(0,0,0,0.6)', cursor: 'default' }}
          />
          <button
            onClick={() => setLightbox(null)}
            style={{ position: 'fixed', top: 20, right: 20, width: 40, height: 40, borderRadius: 10, border: 'none', background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.22)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.12)'; }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
          </button>
          <a
            href={lightbox}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ position: 'fixed', top: 20, right: 68, width: 40, height: 40, borderRadius: 10, border: 'none', background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', textDecoration: 'none' }}
            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.22)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.12)'; }}
            title="Open in new tab"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M15 3h6v6M10 14L21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </a>
        </div>
      )}
    </>,
    document.body,
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const OperationsPage: React.FC = () => {
  const [tab, setTab] = useState<TabKey>('dp');

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [allOperations, setAllOperations] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const [search, setSearch]         = useState('');
  const [typeFilter, setTypeFilter] = useState<OperationType | ''>('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editOp, setEditOp]         = useState<Operation | null>(null);
  const [deleteOp, setDeleteOp]     = useState<Operation | null>(null);
  const [deleting, setDeleting]     = useState(false);
  const [photosOp, setPhotosOp]     = useState<Operation | null>(null);
  const [toast, setToast] = useState<{ message: string; kind: 'success' | 'error' } | null>(null);

  const showToast = (message: string, kind: 'success' | 'error') => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3500);
  };

  const handleTabChange = (t: TabKey) => {
    setTab(t);
    setTypeFilter('');
    setSearch('');
  };

  const handleDelete = async (op: Operation) => {
    setDeleting(true);
    // Delete storage files if folder_url exists
    if (op.folder_url) {
      const parts = op.folder_url.split('/public/operations/');
      const folderPath = parts[1]?.replace(/\/$/, '') ?? '';
      if (folderPath) {
        const { data: files } = await supabase.storage.from('operations').list(folderPath);
        if (files && files.length > 0) {
          await supabase.storage
            .from('operations')
            .remove(files.map(f => `${folderPath}/${f.name}`));
        }
      }
    }
    const { error } = await supabase.from('operations').delete().eq('id', op.id);
    setDeleting(false);
    setDeleteOp(null);
    if (error) {
      showToast('Failed to delete operation.', 'error');
    } else {
      fetchOperations(selectedMonth);
      showToast('Operation deleted.', 'success');
    }
  };

  // ── Fetch ───────────────────────────────────────────────────────────────────
  const fetchOperations = useCallback(async (month: Date) => {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('operations')
      .select(`
        id, operation_date, operation_time, type, car_id, performed_by, customer_id,
        current_km, fuel_level, cleanliness_status, location_text, note, booking_id, folder_url,
        cars!operations_car_id_fkey(plate_number),
        handler:profiles!operations_performed_by_fkey(id, full_name),
        customers(first_name, last_name)
      `)
      .gte('operation_date', toDateStr(getMonthStart(month)))
      .lte('operation_date', toDateStr(getMonthEnd(month)))
      .order('operation_date', { ascending: false });

    setLoading(false);
    if (fetchError) { setError(fetchError.message); return; }
    console.log('[DEBUG] First row cleanliness_status from DB:', (data as any)?.[0]?.cleanliness_status);
    setAllOperations(((data ?? []) as unknown as OperationRow[]).map(resolveOperation));
  }, []);

  useEffect(() => {
    fetchOperations(selectedMonth);
  }, [selectedMonth, fetchOperations]);

  // ── Split by tab ────────────────────────────────────────────────────────────
  const dpOps    = useMemo(() => allOperations.filter(op => (DP_TYPES    as string[]).includes(op.type)), [allOperations]);
  const otherOps = useMemo(() => allOperations.filter(op => (OTHER_TYPES as string[]).includes(op.type)), [allOperations]);

  const activeOps   = tab === 'dp' ? dpOps : otherOps;
  const activeTypes = tab === 'dp' ? DP_TYPES : OTHER_TYPES;

  // ── Stats ───────────────────────────────────────────────────────────────────
  const dpStats = useMemo(() => {
    const counts: Record<string, number> = { total: dpOps.length };
    DP_TYPES.forEach(t => { counts[t] = dpOps.filter(op => op.type === t).length; });
    return counts;
  }, [dpOps]);

  const otherStats = useMemo(() => {
    const counts: Record<string, number> = { total: otherOps.length };
    OTHER_TYPES.forEach(t => { counts[t] = otherOps.filter(op => op.type === t).length; });
    return counts;
  }, [otherOps]);

  const activeStats = tab === 'dp' ? dpStats : otherStats;

  // ── Filter ──────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = activeOps;
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(op =>
        op.plate_number.toLowerCase().includes(q) ||
        (op.customer_name ?? '').toLowerCase().includes(q) ||
        (op.handler_name  ?? '').toLowerCase().includes(q)
      );
    }
    if (typeFilter) result = result.filter(op => op.type === typeFilter);
    return result;
  }, [activeOps, search, typeFilter]);

  const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: '#374151', verticalAlign: 'middle' };
  const colCount = tab === 'dp' ? 11 : 10;

  // ── Stat card definitions per tab ────────────────────────────────────────
  const dpStatCards = [
    { key: 'total', label: 'Total', bg: '#4ba6ea' },
    ...DP_STAT_CARDS.map(t => ({ key: t, label: TYPE_CONFIG[t].label, bg: TYPE_CONFIG[t].card })),
  ];
  const otherStatCards = [
    { key: 'total', label: 'Total', bg: '#4ba6ea' },
    ...OTHER_STAT_CARDS.map(t => ({ key: t, label: TYPE_CONFIG[t].label, bg: TYPE_CONFIG[t].card })),
  ];
  const activeStatCards = tab === 'dp' ? dpStatCards : otherStatCards;

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)', padding: '44px 40px' }}>

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 28 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ba6ea' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#4ba6ea', letterSpacing: '0.8px', textTransform: 'uppercase' }}>Operations</span>
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.8px', color: '#0f1117', lineHeight: 1.1, marginBottom: 6 }}>Car Operations</h1>
          <p style={{ fontSize: 15, color: '#6b7280', lineHeight: 1.5 }}>Deliveries, pickups, washes, maintenance and more</p>
        </div>

        {/* Add Operation button */}
        <button
          onClick={() => setShowAddModal(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 44, padding: '0 22px', borderRadius: 12, border: 'none', background: '#4ba6ea', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 12px rgba(75,166,234,0.35)', transition: 'background 140ms ease, box-shadow 140ms ease', flexShrink: 0 }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#3b96da'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 18px rgba(75,166,234,0.45)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#4ba6ea'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 2px 12px rgba(75,166,234,0.35)'; }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
          </svg>
          Add Operation
        </button>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 28, background: '#f3f4f6', borderRadius: 12, padding: 4, alignSelf: 'flex-start', width: 'fit-content' }}>
        {([
          { key: 'dp',    label: 'Delivery & Pickup' },
          { key: 'other', label: 'Other Operations'  },
        ] as { key: TabKey; label: string }[]).map(t => (
          <button
            key={t.key}
            onClick={() => handleTabChange(t.key)}
            style={{
              padding: '8px 20px', borderRadius: 9, border: 'none',
              fontSize: 13, fontWeight: tab === t.key ? 700 : 500,
              color: tab === t.key ? '#0f1117' : '#6b7280',
              background: tab === t.key ? '#fff' : 'transparent',
              boxShadow: tab === t.key ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
              cursor: 'pointer', transition: 'all 160ms ease',
              fontFamily: 'inherit', whiteSpace: 'nowrap',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Stat cards ── */}
      <div className="ops-stats" style={{ gridTemplateColumns: `repeat(${activeStatCards.length}, 1fr)` }}>
        {activeStatCards.map(c => (
          <StatCard key={c.key} label={c.label} value={activeStats[c.key] ?? 0} bg={c.bg} loading={loading} />
        ))}
      </div>

      {/* ── Month nav + search + filter ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <MonthArrow direction="left"  onClick={() => setSelectedMonth(m => addMonths(m, -1))} />
        <span style={{ fontSize: 15, fontWeight: 700, color: '#0f1117', minWidth: 160, textAlign: 'center' }}>
          {formatMonthLabel(selectedMonth)}
        </span>
        <MonthArrow direction="right" onClick={() => setSelectedMonth(m => addMonths(m, 1))} />

        <div style={{ flex: 1, minWidth: 0 }} />

        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value as OperationType | '')}
          style={{ height: 36, padding: '0 12px', fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 9, outline: 'none', fontFamily: 'inherit', color: '#374151', background: '#fff', cursor: 'pointer' }}
        >
          <option value="">All types</option>
          {activeTypes.map(t => (
            <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>
          ))}
        </select>

        <div style={{ position: 'relative' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
            <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            placeholder="Search plate, customer…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ height: 36, padding: '0 12px 0 32px', fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 9, outline: 'none', fontFamily: 'inherit', color: '#0f1117', background: '#fff', width: 220, transition: 'border-color 140ms ease' }}
            onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
            onBlur={e  => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }}
          />
        </div>
      </div>

      {/* ── Table ── */}
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', boxShadow: '0 1px 6px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
        {error && (
          <div style={{ padding: '16px 20px', color: '#ef4444', fontSize: 13, borderBottom: '1px solid #fef2f2', background: '#fef2f2' }}>
            {error}
          </div>
        )}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: tab === 'dp' ? 980 : 860 }}>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Type</Th>
                <Th>Plate</Th>
                <Th>Handled By</Th>
                {tab === 'dp' && <Th>Customer</Th>}
                <Th>Mileage</Th>
                <Th>Fuel Level</Th>
                <Th style={{ textAlign: 'center' }}>Cleanliness</Th>
                <Th>Notes</Th>
                <Th style={{ textAlign: 'center' }}>Photos</Th>
                <Th style={{ textAlign: 'center' }}>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={colCount} />)}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={colCount} style={{ padding: '60px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
                    {search || typeFilter ? 'No operations match your filters.' : 'No operations for this month.'}
                  </td>
                </tr>
              )}

              {!loading && filtered.map((op, idx) => (
                <tr
                  key={op.id}
                  style={{ borderTop: idx === 0 ? 'none' : '1px solid #f7f7f7', transition: 'background 100ms ease' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = '#f9fafb'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = ''; }}
                >
                  <td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 500 }}>{formatDate(op.operation_date)}</td>

                  <td style={td}><TypeBadge type={op.type} /></td>

                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }}>{op.plate_number}</td>

                  <td style={{ ...td, color: op.handler_name ? '#374151' : '#d1d5db' }}>
                    {op.handler_name ?? '—'}
                  </td>

                  {tab === 'dp' && (
                    <td style={{ ...td, color: op.customer_name ? '#374151' : '#d1d5db' }}>
                      {op.customer_name ?? '—'}
                    </td>
                  )}

                  <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>
                    {op.current_km != null
                      ? op.current_km.toLocaleString() + ' km'
                      : <span style={{ color: '#d1d5db' }}>—</span>}
                  </td>

                  <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>
                    {op.fuel_level != null
                      ? op.fuel_level + ' L'
                      : <span style={{ color: '#d1d5db' }}>—</span>}
                  </td>

                  <td style={{ ...td, textAlign: 'center' }}>
                    {op.cleanliness_status === 'clean'
                      ? <span title="Clean" style={{ fontSize: 16 }}>✅</span>
                      : op.cleanliness_status === 'not_clean'
                        ? <span title="Not clean" style={{ fontSize: 16 }}>❌</span>
                        : <span style={{ color: '#d1d5db' }}>—</span>
                    }
                  </td>

                  <td style={{ ...td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: op.note ? '#374151' : '#d1d5db' }}>
                    {op.note ?? '—'}
                  </td>

                  <td style={{ ...td, textAlign: 'center' }}>
                    {op.folder_url ? (
                      <button
                        onClick={() => setPhotosOp(op)}
                        title="View photos"
                        style={{ width: 32, height: 32, borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#f9fafb', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6b7280', transition: 'all 140ms ease' }}
                        onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#4ba6ea'; b.style.color = '#4ba6ea'; b.style.background = 'rgba(75,166,234,0.07)'; }}
                        onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#e5e7eb'; b.style.color = '#6b7280'; b.style.background = '#f9fafb'; }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.8"/>
                          <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
                          <path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    ) : (
                      <button
                        disabled
                        title="No photos"
                        style={{ width: 32, height: 32, borderRadius: 8, border: '1.5px solid #f0f0f0', background: '#fafafa', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'not-allowed', color: '#d1d5db' }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.8"/>
                          <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
                          <path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    )}
                  </td>

                  {/* Edit + Delete */}
                  <td style={{ ...td, textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      {/* Edit */}
                      <button
                        onClick={() => setEditOp(op)}
                        title="Edit"
                        style={{ width: 32, height: 32, borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#f9fafb', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6b7280', transition: 'all 140ms ease' }}
                        onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#4ba6ea'; b.style.color = '#4ba6ea'; b.style.background = 'rgba(75,166,234,0.07)'; }}
                        onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#e5e7eb'; b.style.color = '#6b7280'; b.style.background = '#f9fafb'; }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      {/* Delete */}
                      <button
                        onClick={() => setDeleteOp(op)}
                        title="Delete"
                        style={{ width: 32, height: 32, borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#f9fafb', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6b7280', transition: 'all 140ms ease' }}
                        onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#fca5a5'; b.style.color = '#ef4444'; b.style.background = 'rgba(239,68,68,0.07)'; }}
                        onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#e5e7eb'; b.style.color = '#6b7280'; b.style.background = '#f9fafb'; }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M10 11v5M14 11v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#9ca3af' }}>
              Showing <strong style={{ color: '#374151' }}>{filtered.length}</strong> of{' '}
              <strong style={{ color: '#374151' }}>{activeOps.length}</strong> operation{activeOps.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* ── Photos Modal ── */}
      {photosOp?.folder_url && (
        <PhotosModal
          folderUrl={photosOp.folder_url}
          onClose={() => setPhotosOp(null)}
        />
      )}

      {/* ── Add Modal ── */}
      {showAddModal && (
        <AddOperationModal
          onClose={() => setShowAddModal(false)}
          onSaved={(warning) => {
            setShowAddModal(false);
            fetchOperations(selectedMonth);
            if (warning) {
              showToast(warning, 'error');
            } else {
              showToast('Operation saved successfully.', 'success');
            }
          }}
        />
      )}

      {/* ── Edit Modal ── */}
      {editOp && (
        <AddOperationModal
          editOp={editOp}
          onClose={() => setEditOp(null)}
          onSaved={() => {
            setEditOp(null);
            fetchOperations(selectedMonth);
            showToast('Operation updated successfully.', 'success');
          }}
        />
      )}

      {/* ── Delete Confirm ── */}
      {deleteOp && (
        <ConfirmDeleteDialog
          deleting={deleting}
          onCancel={() => setDeleteOp(null)}
          onConfirm={() => handleDelete(deleteOp)}
        />
      )}

      {/* ── Toast ── */}
      {toast && <Toast message={toast.message} kind={toast.kind} />}

      <style>{`
        .ops-stats {
          display: grid;
          gap: 12px;
          margin-bottom: 24px;
        }
        @media (max-width: 639px) {
          .ops-stats { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (min-width: 640px) and (max-width: 1023px) {
          .ops-stats { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:0.45} }
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{transform:translateY(12px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes spin    { to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
};

export default OperationsPage;
