import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type IssueType   = 'damage' | 'accident' | 'sound' | 'mechanical' | 'maintenance' | 'other';
type IssueStatus = 'open' | 'resolved';

/** One row of car_issues_detailed. The view already hides soft-deleted rows. */
interface IssueRow {
  id: number;
  car_id: number;
  plate_number: string;
  model_name: string | null;
  type: string;
  status: string;
  description: string | null;
  damage_photos: string[] | null;
  repair_photos: string[] | null;
  damage_photo_count: number | null;
  repair_photo_count: number | null;
  booking_id: number | null;
  booking_number: string | null;
  /** customers.id is a uuid — never cast. */
  customer_id: string | null;
  customer_name: string | null;
  discovered_at: string;
  discovered_by: string | null;
  discovered_by_name: string | null;
  resolved_at: string | null;
  days_to_resolve: number | null;
  created_at: string;
  updated_at: string;
}

interface CarOption { id: number; plate_number: string; model: string | null }

interface BookingOption {
  id: number;
  booking_number: string | null;
  customer_id: string | null;
  customer_name: string;
  start_date: string;
  end_date: string;
}

interface ToastState { message: string; type: 'success' | 'error' }

const ISSUE_SELECT =
  'id, car_id, plate_number, model_name, type, status, description, ' +
  'damage_photos, repair_photos, damage_photo_count, repair_photo_count, ' +
  'booking_id, booking_number, customer_id, customer_name, ' +
  'discovered_at, discovered_by, discovered_by_name, resolved_at, days_to_resolve, ' +
  'created_at, updated_at';

// ─── Design tokens ────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<IssueType, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  damage: {
    label: 'Damage', color: '#dc2626', bg: 'rgba(220,38,38,0.10)',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round"/>
      </svg>
    ),
  },
  accident: {
    label: 'Accident', color: '#ea580c', bg: 'rgba(234,88,12,0.10)',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
        <path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"/>
      </svg>
    ),
  },
  sound: {
    label: 'Sound', color: '#7c3aed', bg: 'rgba(124,58,237,0.10)',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
        <path d="M15.5 8.5a5 5 0 010 7M19 5a10 10 0 010 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
  mechanical: {
    label: 'Mechanical', color: '#0891b2', bg: 'rgba(8,145,178,0.10)',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  maintenance: {
    label: 'Maintenance', color: '#ca8a04', bg: 'rgba(202,138,4,0.10)',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
      </svg>
    ),
  },
  other: {
    label: 'Other', color: '#6b7280', bg: 'rgba(107,114,128,0.10)',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M9.5 9.5a2.5 2.5 0 115 0c0 1.7-2.5 1.9-2.5 4M12 17.5h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
};

const STATUS_CONFIG: Record<IssueStatus, { label: string; color: string; bg: string }> = {
  open:     { label: 'Open',     color: '#dc2626', bg: 'rgba(220,38,38,0.10)' },
  resolved: { label: 'Resolved', color: '#16a34a', bg: 'rgba(34,197,94,0.10)' },
};

const TYPE_ORDER: IssueType[] = ['damage', 'accident', 'sound', 'mechanical', 'maintenance', 'other'];

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', height: 44, padding: '0 12px',
  fontSize: 14, color: '#0f1117',
  background: '#fff', border: '1.5px solid #e5e7eb',
  borderRadius: 9, outline: 'none', fontFamily: 'inherit',
  boxSizing: 'border-box', transition: 'border-color 150ms ease',
};

const focusBlue = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
  { (e.target as HTMLElement & { style: CSSStyleDeclaration }).style.borderColor = '#4ba6ea'; };
const blurGray = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
  { (e.target as HTMLElement & { style: CSSStyleDeclaration }).style.borderColor = '#e5e7eb'; };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const todayStr = (): string => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function formatDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** jsonb arrives parsed, but tolerate null / a JSON string / non-string members. */
function toUrlArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (typeof v === 'string') {
    try {
      const parsed: unknown = JSON.parse(v);
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }
  return [];
}

const asType   = (v: string): IssueType   => (TYPE_ORDER as string[]).includes(v) ? (v as IssueType) : 'other';
const asStatus = (v: string): IssueStatus => (v === 'resolved' ? 'resolved' : 'open');

/**
 * Storage keys are ASCII and id-based, never filename-based: uploaded names may carry
 * Turkish/Arabic characters Storage rejects, and two files sharing a name would collide.
 */
async function uploadIssuePhotos(files: File[], prefix: string): Promise<{ urls: string[]; failed: number }> {
  const results = await Promise.all(files.map(async (file) => {
    const rawExt = file.name.includes('.') ? file.name.split('.').pop() ?? '' : '';
    const ext    = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
    const path   = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from('car-issues')
      .upload(path, file, { upsert: true, contentType: file.type || undefined });
    if (error) return null;
    return supabase.storage.from('car-issues').getPublicUrl(path).data.publicUrl;
  }));
  return {
    urls: results.filter((u): u is string => u !== null),
    failed: results.filter(u => u === null).length,
  };
}

// ─── Small presentational pieces ──────────────────────────────────────────────

const TypeBadge: React.FC<{ type: string }> = ({ type }) => {
  const cfg = TYPE_CONFIG[asType(type)];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 20, fontSize: 12, fontWeight: 600,
      color: cfg.color, background: cfg.bg, whiteSpace: 'nowrap',
    }}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const cfg = STATUS_CONFIG[asStatus(status)];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 20, fontSize: 12, fontWeight: 600,
      color: cfg.color, background: cfg.bg, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
};

const StatCard: React.FC<{ label: string; value: number; bg: string; loading: boolean }> = ({
  label, value, bg, loading,
}) => (
  <div style={{
    background: bg, borderRadius: 12, padding: '14px 18px', color: '#fff',
    display: 'flex', flexDirection: 'column', gap: 6,
  }}>
    <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.7px', opacity: 0.80 }}>
      {label}
    </div>
    <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-1.5px', lineHeight: 1 }}>
      {loading ? '—' : value}
    </div>
  </div>
);

const Toast: React.FC<ToastState> = ({ message, type }) =>
  ReactDOM.createPortal(
    <div style={{
      position: 'fixed', bottom: 28, insetInlineEnd: 28, zIndex: 2000,
      display: 'flex', alignItems: 'center', gap: 10,
      background: type === 'success' ? '#0f1117' : '#ef4444',
      color: '#fff', borderRadius: 12, padding: '12px 20px',
      fontSize: 14, fontWeight: 500,
      boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      animation: 'ciSlideUpIn 200ms ease',
      maxWidth: 'calc(100vw - 56px)',
    }}>
      {type === 'success'
        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="#4ade80" strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="12" r="9" stroke="#4ade80" strokeWidth="1.8"/></svg>
        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.8"/><path d="M12 8v4M12 16h.01" stroke="white" strokeWidth="1.8" strokeLinecap="round"/></svg>
      }
      {message}
    </div>,
    document.body,
  );

const Field: React.FC<{ label: string; required?: boolean; children: React.ReactNode }> = ({
  label, required, children,
}) => (
  <div>
    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
      {label}{required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
    </label>
    {children}
  </div>
);

const PhotoGallery: React.FC<{ urls: string[]; empty: string }> = ({ urls, empty }) => {
  if (urls.length === 0) {
    return <div style={{ fontSize: 13, color: '#9ca3af', padding: '10px 0' }}>{empty}</div>;
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {urls.map((url, i) => (
        <a
          key={`${url}-${i}`}
          href={url} target="_blank" rel="noreferrer"
          style={{
            width: 78, height: 78, borderRadius: 10, overflow: 'hidden',
            border: '1px solid #e5e7eb', flexShrink: 0, display: 'block', background: '#f9fafb',
          }}
        >
          <img
            src={url} alt={`Attachment ${i + 1}`}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </a>
      ))}
    </div>
  );
};

const ModalShell: React.FC<{
  title: string; subtitle: string; maxWidth: number;
  onClose: () => void; children: React.ReactNode;
}> = ({ title, subtitle, maxWidth, onClose, children }) =>
  ReactDOM.createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15,17,23,0.45)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '24px 16px', overflowY: 'auto',
        animation: 'ciFadeIn 150ms ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 18, width: '100%', maxWidth,
          marginTop: 'auto', marginBottom: 'auto',
          boxShadow: '0 24px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)',
          animation: 'ciSlideUp 180ms ease',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, padding: '20px 24px 16px', borderBottom: '1px solid #f3f4f6',
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f1117', letterSpacing: '-0.3px' }}>
              {title}
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{subtitle}</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 44, height: 44, borderRadius: 10, border: 'none', background: '#f3f4f6',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#e5e7eb'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f3f4f6'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="#6b7280" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );

const ErrorBanner: React.FC<{ message: string }> = ({ message }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 8, marginTop: 14,
    padding: '10px 14px', background: '#fef2f2', borderRadius: 8,
    border: '1px solid rgba(239,68,68,0.2)',
  }}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.8"/>
      <path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
    <span style={{ fontSize: 13, color: '#ef4444' }}>{message}</span>
  </div>
);

const PrimaryButton: React.FC<{
  children: React.ReactNode; disabled?: boolean; onClick?: () => void;
  type?: 'button' | 'submit'; danger?: boolean;
}> = ({ children, disabled, onClick, type = 'button', danger }) => {
  const base = danger ? '#ef4444' : '#4ba6ea';
  const hover = danger ? '#dc2626' : '#2e8fd4';
  return (
    <button
      type={type} disabled={disabled} onClick={onClick}
      style={{
        minHeight: 44, padding: '0 22px', borderRadius: 9, border: 'none',
        background: disabled ? '#c7d2da' : base, color: '#fff',
        fontSize: 14, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit', transition: 'background 150ms ease',
      }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = hover; }}
      onMouseLeave={e => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = base; }}
    >
      {children}
    </button>
  );
};

const GhostButton: React.FC<{
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; type?: 'button' | 'submit';
}> = ({ children, onClick, disabled, type = 'button' }) => (
  <button
    type={type} onClick={onClick} disabled={disabled}
    style={{
      minHeight: 44, padding: '0 18px', borderRadius: 9,
      border: '1px solid #e5e7eb', background: '#fff',
      fontSize: 14, fontWeight: 500, color: '#6b7280',
      cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
      opacity: disabled ? 0.6 : 1,
    }}
    onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.borderColor = '#9ca3af'; }}
    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; }}
  >
    {children}
  </button>
);

// ─── File picker ──────────────────────────────────────────────────────────────

const PhotoPicker: React.FC<{
  files: File[];
  onChange: (files: File[]) => void;
  label: string;
  disabled?: boolean;
}> = ({ files, onChange, label, disabled }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <input
        ref={inputRef}
        type="file" accept="image/*" multiple
        style={{ display: 'none' }}
        onChange={e => {
          const picked = Array.from(e.target.files ?? []);
          if (picked.length > 0) onChange([...files, ...picked]);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          width: '100%', minHeight: 44, padding: '0 14px',
          border: '1.5px dashed #d1d5db', borderRadius: 9,
          background: '#fafbfc', color: '#6b7280',
          fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'border-color 150ms ease, color 150ms ease',
        }}
        onMouseEnter={e => { if (!disabled) { (e.currentTarget as HTMLButtonElement).style.borderColor = '#4ba6ea'; (e.currentTarget as HTMLButtonElement).style.color = '#4ba6ea'; } }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#d1d5db'; (e.currentTarget as HTMLButtonElement).style.color = '#6b7280'; }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
        </svg>
        {label}
      </button>

      {files.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {files.map((f, i) => (
            <div
              key={`${f.name}-${i}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '6px 8px 6px 10px', borderRadius: 8,
                background: '#f3f4f6', fontSize: 12, color: '#374151', maxWidth: '100%',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                {f.name}
              </span>
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                onClick={() => onChange(files.filter((_, idx) => idx !== i))}
                style={{
                  width: 22, height: 22, borderRadius: 6, border: 'none',
                  background: '#e5e7eb', color: '#6b7280', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Add issue modal ──────────────────────────────────────────────────────────

const AddIssueModal: React.FC<{
  cars: CarOption[];
  carsLoading: boolean;
  onClose: () => void;
  onSaved: () => void;
}> = ({ cars, carsLoading, onClose, onSaved }) => {
  const [carId, setCarId]               = useState('');
  const [type, setType]                 = useState<IssueType>('damage');
  const [description, setDescription]   = useState('');
  const [discoveredAt, setDiscoveredAt] = useState(todayStr());
  const [bookingId, setBookingId]       = useState('');
  const [bookings, setBookings]         = useState<BookingOption[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [files, setFiles]               = useState<File[]>([]);
  const [saving, setSaving]             = useState(false);
  const [formError, setFormError]       = useState<string | null>(null);

  // Bookings for the chosen car — optional link, so no status or date filter.
  useEffect(() => {
    setBookingId('');
    setBookings([]);
    if (!carId) return;

    let active = true;
    setBookingsLoading(true);
    (async () => {
      const { data } = await supabase
        .from('bookings')
        .select('id, booking_number, customer_id, start_date, end_date, customers(first_name, last_name)')
        .eq('car_id', Number(carId))
        .order('start_date', { ascending: false });
      if (!active) return;

      type Raw = {
        id: number; booking_number: string | null; customer_id: string | null;
        start_date: string; end_date: string;
        customers: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
      };
      setBookings(((data ?? []) as unknown as Raw[]).map(b => {
        const c = Array.isArray(b.customers) ? b.customers[0] : b.customers;
        return {
          id: b.id,
          booking_number: b.booking_number,
          customer_id: b.customer_id,
          customer_name: c ? `${c.first_name} ${c.last_name}`.trim() : 'Unknown customer',
          start_date: b.start_date,
          end_date: b.end_date,
        };
      }));
      setBookingsLoading(false);
    })();
    return () => { active = false; };
  }, [carId]);

  const selectedBooking = bookings.find(b => String(b.id) === bookingId) ?? null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!carId)                  { setFormError('Select the car this issue belongs to.'); return; }
    if (!description.trim())     { setFormError('Add a short description of the issue.'); return; }
    if (!discoveredAt)           { setFormError('Discovered date is required.'); return; }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();

    let photoUrls: string[] = [];
    if (files.length > 0) {
      const { urls, failed } = await uploadIssuePhotos(files, `${carId}/damage`);
      photoUrls = urls;
      if (failed > 0 && urls.length === 0) {
        setSaving(false);
        setFormError('Photo upload failed. Check your connection and try again.');
        return;
      }
    }

    // resolved_at is left alone entirely — the DB trigger owns it.
    const { error: insertError } = await supabase.from('car_issues').insert({
      car_id:        Number(carId),
      type,
      status:        'open',
      description:   description.trim(),
      damage_photos: photoUrls,
      repair_photos: [],
      discovered_at: discoveredAt,
      discovered_by: user?.id ?? null,
      booking_id:    selectedBooking ? selectedBooking.id : null,
      customer_id:   selectedBooking ? selectedBooking.customer_id : null, // uuid — never cast
    });

    setSaving(false);
    if (insertError) { setFormError(insertError.message); return; }
    onSaved();
  };

  return (
    <ModalShell
      title="Log Issue"
      subtitle="Record a new damage, fault or maintenance item"
      maxWidth={620}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} style={{ padding: '20px 24px' }}>
        <div className="ci-form-grid">

          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Car" required>
              <select
                value={carId} onChange={e => setCarId(e.target.value)}
                style={{ ...INPUT_STYLE, cursor: 'pointer', color: carId ? '#0f1117' : '#9ca3af' }}
                onFocus={focusBlue} onBlur={blurGray}
              >
                <option value="">{carsLoading ? 'Loading cars…' : 'Select car…'}</option>
                {cars.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.plate_number}{c.model ? ` — ${c.model}` : ''}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Type" required>
            <select
              value={type} onChange={e => setType(e.target.value as IssueType)}
              style={{ ...INPUT_STYLE, cursor: 'pointer' }}
              onFocus={focusBlue} onBlur={blurGray}
            >
              {TYPE_ORDER.map(t => (
                <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>
              ))}
            </select>
          </Field>

          <Field label="Discovered On" required>
            <input
              required type="date" value={discoveredAt}
              onChange={e => setDiscoveredAt(e.target.value)}
              style={INPUT_STYLE} onFocus={focusBlue} onBlur={blurGray}
            />
          </Field>

          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Description" required>
              <textarea
                rows={3} value={description}
                placeholder="What happened, and where on the car?"
                onChange={e => setDescription(e.target.value)}
                style={{ ...INPUT_STYLE, height: 'auto', padding: '10px 12px', resize: 'vertical' }}
                onFocus={focusBlue} onBlur={blurGray}
              />
            </Field>
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Booking (optional)">
              <select
                value={bookingId} onChange={e => setBookingId(e.target.value)}
                disabled={!carId || bookingsLoading || bookings.length === 0}
                style={{
                  ...INPUT_STYLE,
                  cursor: carId && bookings.length > 0 ? 'pointer' : 'not-allowed',
                  background: carId && bookings.length > 0 ? '#fff' : '#f9fafb',
                  color: bookingId ? '#0f1117' : '#9ca3af',
                }}
                onFocus={focusBlue} onBlur={blurGray}
              >
                <option value="">
                  {!carId            ? 'Select a car first…'
                    : bookingsLoading ? 'Loading bookings…'
                    : bookings.length === 0 ? 'No bookings for this car'
                    : 'No booking linked'}
                </option>
                {bookings.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.customer_name} · {b.booking_number ?? `#${b.id}`} · {b.start_date} → {b.end_date}
                  </option>
                ))}
              </select>
            </Field>
            {selectedBooking && (
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>
                Links this issue to <strong>{selectedBooking.customer_name}</strong>.
              </div>
            )}
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Damage Photos">
              <PhotoPicker
                files={files} onChange={setFiles} disabled={saving}
                label="Add photos"
              />
            </Field>
          </div>
        </div>

        {formError && <ErrorBanner message={formError} />}

        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 10,
          marginTop: 22, paddingTop: 18, borderTop: '1px solid #f3f4f6', flexWrap: 'wrap',
        }}>
          <GhostButton onClick={onClose} disabled={saving}>Cancel</GhostButton>
          <PrimaryButton type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Log Issue'}
          </PrimaryButton>
        </div>
      </form>
    </ModalShell>
  );
};

// ─── Detail modal ─────────────────────────────────────────────────────────────

const DetailRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: '7px 0', borderBottom: '1px solid #f6f7f8' }}>
    <span style={{
      fontSize: 11, fontWeight: 700, color: '#9ca3af',
      textTransform: 'uppercase', letterSpacing: '0.5px',
      width: 110, flexShrink: 0,
    }}>
      {label}
    </span>
    <span style={{ fontSize: 13.5, color: '#374151', minWidth: 0, wordBreak: 'break-word' }}>{children}</span>
  </div>
);

const IssueDetailModal: React.FC<{
  issue: IssueRow;
  onClose: () => void;
  onChanged: (message: string) => void;
}> = ({ issue, onClose, onChanged }) => {
  const damagePhotos = useMemo(() => toUrlArray(issue.damage_photos), [issue.damage_photos]);
  const repairPhotos = useMemo(() => toUrlArray(issue.repair_photos), [issue.repair_photos]);

  const [editing, setEditing]         = useState(false);
  const [editType, setEditType]       = useState<IssueType>(asType(issue.type));
  const [editDesc, setEditDesc]       = useState(issue.description ?? '');
  const [repairFiles, setRepairFiles] = useState<File[]>([]);
  const [busy, setBusy]               = useState<null | 'status' | 'save' | 'photos' | 'delete'>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const status = asStatus(issue.status);
  const anyBusy = busy !== null;

  const handleToggleStatus = async () => {
    setBusy('status');
    setError(null);
    // resolved_at is never written here: the trigger sets it on resolve and clears it on reopen.
    const next: IssueStatus = status === 'open' ? 'resolved' : 'open';
    const { error: updateError } = await supabase
      .from('car_issues')
      .update({ status: next })
      .eq('id', issue.id);
    setBusy(null);
    if (updateError) { setError(updateError.message); return; }
    onChanged(next === 'resolved' ? 'Issue marked resolved' : 'Issue reopened');
  };

  const handleSaveEdits = async () => {
    if (!editDesc.trim()) { setError('Description cannot be empty.'); return; }
    setBusy('save');
    setError(null);
    const { error: updateError } = await supabase
      .from('car_issues')
      .update({ type: editType, description: editDesc.trim() })
      .eq('id', issue.id);
    setBusy(null);
    if (updateError) { setError(updateError.message); return; }
    setEditing(false);
    onChanged('Issue updated');
  };

  const handleAddRepairPhotos = async () => {
    if (repairFiles.length === 0) return;
    setBusy('photos');
    setError(null);
    const { urls, failed } = await uploadIssuePhotos(repairFiles, `${issue.car_id}/repair/${issue.id}`);
    if (urls.length === 0) {
      setBusy(null);
      setError('Photo upload failed. Check your connection and try again.');
      return;
    }
    // Append rather than replace so concurrent additions do not drop earlier photos.
    const { error: updateError } = await supabase
      .from('car_issues')
      .update({ repair_photos: [...repairPhotos, ...urls] })
      .eq('id', issue.id);
    setBusy(null);
    if (updateError) { setError(updateError.message); return; }
    setRepairFiles([]);
    onChanged(failed > 0 ? `${urls.length} photo(s) added, ${failed} failed` : 'Repair photos added');
  };

  const handleDelete = async () => {
    setBusy('delete');
    setError(null);
    const { error: deleteError } = await supabase
      .from('car_issues')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', issue.id);
    setBusy(null);
    if (deleteError) { setError(deleteError.message); return; }
    onChanged('Issue deleted');
  };

  return (
    <ModalShell
      title={`${issue.plate_number} · ${TYPE_CONFIG[asType(issue.type)].label}`}
      subtitle={issue.model_name ?? 'Issue detail'}
      maxWidth={660}
      onClose={onClose}
    >
      <div style={{ padding: '18px 24px 22px' }}>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <TypeBadge type={issue.type} />
          <StatusBadge status={issue.status} />
          {status === 'resolved' && issue.days_to_resolve !== null && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', padding: '3px 9px',
              borderRadius: 20, fontSize: 12, fontWeight: 600,
              color: '#16a34a', background: 'rgba(34,197,94,0.10)',
            }}>
              Resolved in {issue.days_to_resolve} day{issue.days_to_resolve === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
            <Field label="Type">
              <select
                value={editType} onChange={e => setEditType(e.target.value as IssueType)}
                style={{ ...INPUT_STYLE, cursor: 'pointer' }} onFocus={focusBlue} onBlur={blurGray}
              >
                {TYPE_ORDER.map(t => <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>)}
              </select>
            </Field>
            <Field label="Description">
              <textarea
                rows={3} value={editDesc} onChange={e => setEditDesc(e.target.value)}
                style={{ ...INPUT_STYLE, height: 'auto', padding: '10px 12px', resize: 'vertical' }}
                onFocus={focusBlue} onBlur={blurGray}
              />
            </Field>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <PrimaryButton onClick={handleSaveEdits} disabled={anyBusy}>
                {busy === 'save' ? 'Saving…' : 'Save changes'}
              </PrimaryButton>
              <GhostButton
                disabled={anyBusy}
                onClick={() => {
                  setEditing(false);
                  setEditType(asType(issue.type));
                  setEditDesc(issue.description ?? '');
                  setError(null);
                }}
              >
                Cancel
              </GhostButton>
            </div>
          </div>
        ) : (
          <div style={{
            fontSize: 14, color: '#374151', lineHeight: 1.6,
            background: '#f9fafb', borderRadius: 10, padding: '12px 14px', marginBottom: 16,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {issue.description?.trim() ? issue.description : <span style={{ color: '#9ca3af' }}>No description</span>}
          </div>
        )}

        <div style={{ marginBottom: 18 }}>
          <DetailRow label="Car">{issue.plate_number}{issue.model_name ? ` · ${issue.model_name}` : ''}</DetailRow>
          <DetailRow label="Discovered">{formatDate(issue.discovered_at)}</DetailRow>
          <DetailRow label="Logged by">{issue.discovered_by_name ?? '—'}</DetailRow>
          <DetailRow label="Customer">{issue.customer_name ?? '—'}</DetailRow>
          <DetailRow label="Booking">{issue.booking_number ?? '—'}</DetailRow>
          <DetailRow label="Resolved">{status === 'resolved' ? formatDate(issue.resolved_at) : '—'}</DetailRow>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: '#374151',
            textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8,
          }}>
            Damage photos ({damagePhotos.length})
          </div>
          <PhotoGallery urls={damagePhotos} empty="No damage photos." />
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: '#374151',
            textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8,
          }}>
            Repair photos ({repairPhotos.length})
          </div>
          <PhotoGallery urls={repairPhotos} empty="No repair photos yet." />

          <div style={{ marginTop: 10 }}>
            <PhotoPicker
              files={repairFiles} onChange={setRepairFiles} disabled={anyBusy}
              label="Add repair photos"
            />
            {repairFiles.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <PrimaryButton onClick={handleAddRepairPhotos} disabled={anyBusy}>
                  {busy === 'photos' ? 'Uploading…' : `Upload ${repairFiles.length} photo(s)`}
                </PrimaryButton>
              </div>
            )}
          </div>
        </div>

        {error && <ErrorBanner message={error} />}

        <div style={{
          display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
          marginTop: 20, paddingTop: 18, borderTop: '1px solid #f3f4f6',
        }}>
          <PrimaryButton onClick={handleToggleStatus} disabled={anyBusy}>
            {busy === 'status'
              ? 'Updating…'
              : status === 'open' ? 'Mark Resolved' : 'Reopen Issue'}
          </PrimaryButton>

          {!editing && (
            <GhostButton onClick={() => setEditing(true)} disabled={anyBusy}>Edit</GhostButton>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {confirmDelete ? (
              <>
                <span style={{ fontSize: 13, color: '#6b7280', alignSelf: 'center' }}>Delete this issue?</span>
                <GhostButton onClick={() => setConfirmDelete(false)} disabled={anyBusy}>No</GhostButton>
                <PrimaryButton danger onClick={handleDelete} disabled={anyBusy}>
                  {busy === 'delete' ? 'Deleting…' : 'Yes, delete'}
                </PrimaryButton>
              </>
            ) : (
              <GhostButton onClick={() => setConfirmDelete(true)} disabled={anyBusy}>Delete</GhostButton>
            )}
          </div>
        </div>
      </div>
    </ModalShell>
  );
};

// ─── Issue card ───────────────────────────────────────────────────────────────

const IssueCard: React.FC<{ issue: IssueRow; onClick: () => void }> = ({ issue, onClick }) => {
  const [hover, setHover] = useState(false);
  const damagePhotos = toUrlArray(issue.damage_photos);
  const thumb = damagePhotos[0] ?? null;
  const status = asStatus(issue.status);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', flexDirection: 'column', gap: 0,
        textAlign: 'left', width: '100%', padding: 0,
        background: '#fff', border: '1px solid #ebebeb', borderRadius: 14,
        cursor: 'pointer', fontFamily: 'inherit', overflow: 'hidden',
        boxShadow: hover ? '0 8px 24px rgba(0,0,0,0.09)' : '0 1px 3px rgba(0,0,0,0.04)',
        transform: hover ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'box-shadow 160ms ease, transform 160ms ease',
      }}
    >
      <div style={{
        height: 132, background: '#f3f4f6', position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {thumb ? (
          <img
            src={thumb} alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" style={{ color: '#c9ced6' }}>
            <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.7"/>
            <circle cx="8.5" cy="10" r="1.6" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M21 16l-5-4-4.5 4-2-1.7L3 19" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
        {damagePhotos.length > 1 && (
          <span style={{
            position: 'absolute', bottom: 8, insetInlineEnd: 8,
            background: 'rgba(15,17,23,0.72)', color: '#fff',
            borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 600,
          }}>
            +{damagePhotos.length - 1}
          </span>
        )}
      </div>

      <div style={{ padding: '13px 14px 15px', display: 'flex', flexDirection: 'column', gap: 9, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#0f1117', letterSpacing: '-0.3px' }}>
            {issue.plate_number}
          </span>
          {issue.model_name && (
            <span style={{ fontSize: 12.5, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {issue.model_name}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <TypeBadge type={issue.type} />
          <StatusBadge status={issue.status} />
        </div>

        <p style={{
          fontSize: 13, color: '#6b7280', lineHeight: 1.5, margin: 0,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden', wordBreak: 'break-word', minHeight: 39,
        }}>
          {issue.description?.trim() ? issue.description : '—'}
        </p>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 8, marginTop: 'auto', paddingTop: 4, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 12, color: '#9ca3af' }}>{formatDate(issue.discovered_at)}</span>
          {status === 'resolved' && issue.days_to_resolve !== null ? (
            <span style={{ fontSize: 12, fontWeight: 600, color: '#16a34a' }}>
              Resolved in {issue.days_to_resolve}d
            </span>
          ) : issue.customer_name ? (
            <span style={{
              fontSize: 12, color: '#6b7280', maxWidth: '60%',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {issue.customer_name}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

const CarIssuesPage: React.FC = () => {
  const [issues, setIssues]   = useState<IssueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const [cars, setCars]               = useState<CarOption[]>([]);
  const [carsLoading, setCarsLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<'all' | IssueStatus>('all');
  const [typeFilter, setTypeFilter]     = useState<'all' | IssueType>('all');
  const [search, setSearch]             = useState('');

  const [addOpen, setAddOpen]       = useState(false);
  const [detail, setDetail]         = useState<IssueRow | null>(null);
  const [toast, setToast]           = useState<ToastState | null>(null);
  const toastTimer                  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const fetchIssues = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('car_issues_detailed')
      .select(ISSUE_SELECT)
      .order('created_at', { ascending: false });
    setLoading(false);
    if (fetchError) { setError(fetchError.message); return; }
    setIssues((data ?? []) as unknown as IssueRow[]);
  }, []);

  useEffect(() => { fetchIssues(); }, [fetchIssues]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('cars')
        .select('id, plate_number, model_group(name)')
        .eq('is_active', true)
        .order('plate_number');
      if (!active) return;
      type Raw = { id: number; plate_number: string; model_group: { name: string } | { name: string }[] | null };
      setCars(((data ?? []) as unknown as Raw[]).map(c => {
        const mg = Array.isArray(c.model_group) ? c.model_group[0] : c.model_group;
        return { id: c.id, plate_number: c.plate_number, model: mg?.name ?? null };
      }));
      setCarsLoading(false);
    })();
    return () => { active = false; };
  }, []);

  // Keep the open detail modal in sync with refreshed rows.
  useEffect(() => {
    if (!detail) return;
    const fresh = issues.find(i => i.id === detail.id);
    if (!fresh) { setDetail(null); return; }
    if (fresh !== detail) setDetail(fresh);
  }, [issues, detail]);

  const stats = useMemo(() => ({
    total:    issues.length,
    open:     issues.filter(i => asStatus(i.status) === 'open').length,
    resolved: issues.filter(i => asStatus(i.status) === 'resolved').length,
  }), [issues]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return issues.filter(i => {
      if (statusFilter !== 'all' && asStatus(i.status) !== statusFilter) return false;
      if (typeFilter !== 'all' && asType(i.type) !== typeFilter) return false;
      if (!q) return true;
      return (
        i.plate_number.toLowerCase().includes(q) ||
        (i.model_name ?? '').toLowerCase().includes(q) ||
        (i.customer_name ?? '').toLowerCase().includes(q) ||
        (i.description ?? '').toLowerCase().includes(q)
      );
    });
  }, [issues, statusFilter, typeFilter, search]);

  const handleDetailChanged = useCallback((message: string) => {
    showToast(message, 'success');
    fetchIssues();
  }, [showToast, fetchIssues]);

  return (
    <div className="ci-page" style={{ minHeight: '100vh', background: 'linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)' }}>

      {/* ── Page header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 16, flexWrap: 'wrap', marginBottom: 28,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ba6ea' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#4ba6ea', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
              Fleet
            </span>
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.8px', color: '#0f1117', lineHeight: 1.1, marginBottom: 6 }}>
            Car Issues
          </h1>
          <p style={{ fontSize: 15, color: '#6b7280', lineHeight: 1.5, margin: 0 }}>
            Damage, accidents, sounds, mechanical faults and maintenance
          </p>
        </div>

        <button
          onClick={() => setAddOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            height: 44, padding: '0 18px',
            background: '#4ba6ea', color: '#fff', border: 'none',
            borderRadius: 10, fontSize: 14, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
            boxShadow: '0 2px 8px rgba(75,166,234,0.30)',
            transition: 'background 150ms ease',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#2e8fd4'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#4ba6ea'; }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
          </svg>
          Log Issue
        </button>
      </div>

      {/* ── Stat cards ── */}
      <div className="ci-stats">
        <StatCard label="Total Issues" value={stats.total}    bg="#4ba6ea" loading={loading} />
        <StatCard label="Open"         value={stats.open}     bg="#ef4444" loading={loading} />
        <StatCard label="Resolved"     value={stats.resolved} bg="#22c55e" loading={loading} />
      </div>

      {/* ── Filters ── */}
      <div style={{
        background: '#fff', borderRadius: 14, border: '1px solid #ebebeb',
        padding: '12px 14px', marginBottom: 18,
        display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        <div style={{ flex: '1 1 220px', position: 'relative', minWidth: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            placeholder="Search plate, model, customer or description…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...INPUT_STYLE, paddingLeft: 34 }}
            onFocus={focusBlue} onBlur={blurGray}
          />
        </div>

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as 'all' | IssueStatus)}
          style={{ ...INPUT_STYLE, width: 'auto', minWidth: 140, cursor: 'pointer', flex: '0 1 auto' }}
          onFocus={focusBlue} onBlur={blurGray}
        >
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
        </select>

        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value as 'all' | IssueType)}
          style={{ ...INPUT_STYLE, width: 'auto', minWidth: 150, cursor: 'pointer', flex: '0 1 auto' }}
          onFocus={focusBlue} onBlur={blurGray}
        >
          <option value="all">All types</option>
          {TYPE_ORDER.map(t => <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>)}
        </select>
      </div>

      {/* ── Body ── */}
      {error ? (
        <div style={{
          background: '#fff', borderRadius: 14, border: '1px solid #fecdd3',
          padding: '28px 20px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 14, color: '#ef4444', marginBottom: 12 }}>{error}</div>
          <GhostButton onClick={fetchIssues}>Try again</GhostButton>
        </div>
      ) : loading ? (
        <div style={{
          background: '#fff', borderRadius: 14, border: '1px solid #ebebeb',
          padding: '48px 20px', textAlign: 'center', color: '#9ca3af', fontSize: 14,
        }}>
          Loading issues…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          background: '#fff', borderRadius: 14, border: '1px solid #ebebeb',
          padding: '48px 20px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
            {issues.length === 0 ? 'No issues logged yet' : 'No issues match these filters'}
          </div>
          <div style={{ fontSize: 13.5, color: '#9ca3af' }}>
            {issues.length === 0
              ? 'Use “Log Issue” to record the first damage or fault.'
              : 'Try clearing the search or changing the status and type filters.'}
          </div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
            Showing {filtered.length} of {issues.length} issue{issues.length === 1 ? '' : 's'}
          </div>
          <div className="ci-grid">
            {filtered.map(issue => (
              <IssueCard key={issue.id} issue={issue} onClick={() => setDetail(issue)} />
            ))}
          </div>
        </>
      )}

      {/* ── Modals ── */}
      {addOpen && (
        <AddIssueModal
          cars={cars}
          carsLoading={carsLoading}
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false);
            showToast('Issue logged successfully', 'success');
            fetchIssues();
          }}
        />
      )}

      {detail && (
        <IssueDetailModal
          issue={detail}
          onClose={() => setDetail(null)}
          onChanged={handleDetailChanged}
        />
      )}

      {toast && <Toast {...toast} />}

      <style>{`
        .ci-page  { padding: 24px 16px; }
        .ci-stats { display: grid; grid-template-columns: 1fr; gap: 12px; margin-bottom: 18px; }
        .ci-grid  { display: grid; grid-template-columns: 1fr; gap: 14px; }
        .ci-form-grid { display: grid; grid-template-columns: 1fr; gap: 14px 16px; }
        @media (min-width: 640px) {
          .ci-page  { padding: 32px 24px; }
          .ci-stats { grid-template-columns: repeat(3, 1fr); gap: 16px; }
          .ci-grid  { grid-template-columns: repeat(2, 1fr); gap: 16px; }
          .ci-form-grid { grid-template-columns: 1fr 1fr; }
        }
        @media (min-width: 1024px) {
          .ci-page { padding: 44px 40px; }
          .ci-grid { grid-template-columns: repeat(3, 1fr); }
        }
        @keyframes ciFadeIn     { from { opacity: 0 } to { opacity: 1 } }
        @keyframes ciSlideUp    { from { transform: translateY(12px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        @keyframes ciSlideUpIn  { from { transform: translateY(8px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      `}</style>
    </div>
  );
};

export default CarIssuesPage;
