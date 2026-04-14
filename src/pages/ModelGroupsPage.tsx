import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../lib/supabase';
import type { ModelGroup, ModelGroupFormData } from '../types';
import { useCurrency } from '../lib/CurrencyContext';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const EMPTY_FORM: ModelGroupFormData = {
  name: '', brand: '', model: '',
  category: 'Economy', transmission: 'Automatic', fuel: 'Petrol',
  seats: 5, luggage: null, daily_km: null, monthly_km: null,
  deposit: null, min_age: null, price: 0, image_url: null,
};


const CATEGORY_STYLE: Record<string, { color: string; bg: string }> = {
  Economy: { color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
  Middle:  { color: '#2563eb', bg: 'rgba(37,99,235,0.10)' },
  SUV:     { color: '#d97706', bg: 'rgba(217,119,6,0.10)'  },
};

const categoryStyle = (cat: string) =>
  CATEGORY_STYLE[cat] ?? { color: '#6b7280', bg: '#f3f4f6' };

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

interface ToastProps { message: string; type: 'success' | 'error'; }

const Toast: React.FC<ToastProps> = ({ message, type }) =>
  ReactDOM.createPortal(
    <div style={{
      position: 'fixed', bottom: 28, right: 28, zIndex: 2000,
      display: 'flex', alignItems: 'center', gap: 10,
      background: type === 'success' ? '#0f1117' : '#ef4444',
      color: '#fff', borderRadius: 12,
      padding: '12px 20px', fontSize: 14, fontWeight: 500,
      boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      animation: 'slideUpIn 200ms ease',
    }}>
      {type === 'success'
        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="#4ade80" strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="12" r="9" stroke="#4ade80" strokeWidth="1.8"/></svg>
        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.8"/><path d="M12 8v4M12 16h.01" stroke="white" strokeWidth="1.8" strokeLinecap="round"/></svg>
      }
      {message}
    </div>,
    document.body
  );

// ---------------------------------------------------------------------------
// Form modal
// ---------------------------------------------------------------------------

interface FormModalProps {
  mode: 'add' | 'edit';
  initial: ModelGroupFormData;
  onClose: () => void;
  onSaved: () => void;
  editId?: number;
}

const FIELD_STYLE: React.CSSProperties = {
  width: '100%', height: 40, padding: '0 12px',
  fontSize: 14, color: '#0f1117',
  background: '#fff', border: '1.5px solid #e5e7eb',
  borderRadius: 8, outline: 'none', fontFamily: 'inherit',
  boxSizing: 'border-box', transition: 'border-color 150ms ease',
};

type FieldConfig =
  | { type: 'text' | 'number'; key: keyof ModelGroupFormData; label: string; required?: boolean; span?: 1 | 2 }
  | { type: 'select'; key: keyof ModelGroupFormData; label: string; options: string[]; required?: boolean; span?: 1 | 2 };

const FIELDS: FieldConfig[] = [
  { type: 'text',   key: 'name',        label: 'Name',           required: true,  span: 2 },
  { type: 'text',   key: 'brand',       label: 'Brand',          required: true  },
  { type: 'text',   key: 'model',       label: 'Model',          required: true  },
  { type: 'select', key: 'category',    label: 'Category',       options: ['Economy', 'Middle', 'SUV'] },
  { type: 'select', key: 'transmission',label: 'Transmission',   options: ['Automatic', 'Manual'] },
  { type: 'select', key: 'fuel',        label: 'Fuel',           options: ['Petrol', 'Diesel'] },
  { type: 'number', key: 'seats',       label: 'Seats' },
  { type: 'number', key: 'luggage',     label: 'Luggage' },
  { type: 'number', key: 'daily_km',    label: 'Daily KM' },
  { type: 'number', key: 'monthly_km',  label: 'Monthly KM' },
  { type: 'number', key: 'deposit',     label: 'Deposit (₺)' },
  { type: 'number', key: 'min_age',     label: 'Min Age' },
  { type: 'number', key: 'price',       label: 'Price (₺)',      required: true,  span: 2 },
  { type: 'text',   key: 'image_url',   label: 'Image URL',      span: 2 },
];

const FormModal: React.FC<FormModalProps> = ({ mode, initial, onClose, onSaved, editId }) => {
  const [form, setForm]       = useState<ModelGroupFormData>(initial);
  const [saving, setSaving]   = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const set = (key: keyof ModelGroupFormData, value: string | number | null) =>
    setForm(f => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);

    const payload = {
      ...form,
      seats:      form.seats      != null ? Number(form.seats)      : null,
      luggage:    form.luggage    != null ? Number(form.luggage)    : null,
      daily_km:   form.daily_km   != null ? Number(form.daily_km)   : null,
      monthly_km: form.monthly_km != null ? Number(form.monthly_km) : null,
      deposit:    form.deposit    != null ? Number(form.deposit)    : null,
      min_age:    form.min_age    != null ? Number(form.min_age)    : null,
      price:      Number(form.price),
      image_url:  form.image_url?.trim() || null,
    };

    const { error } = mode === 'add'
      ? await supabase.from('model_group').insert(payload)
      : await supabase.from('model_group').update(payload).eq('id', editId!);

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
        background: '#fff', borderRadius: 18, width: '100%', maxWidth: 560,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)',
        animation: 'slideUp 180ms ease',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f1117', letterSpacing: '-0.3px' }}>
              {mode === 'add' ? 'Add Model Group' : 'Edit Model Group'}
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
              {mode === 'add' ? 'Fill in the details to create a new model group' : 'Update the model group details'}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#e5e7eb'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f3f4f6'; }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#6b7280" strokeWidth="2" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* Form body */}
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px' }}>
            {FIELDS.map(field => (
              <div key={field.key} style={{ gridColumn: field.span === 2 ? 'span 2' : 'span 1' }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5, letterSpacing: '0.1px' }}>
                  {field.label}{field.required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
                </label>
                {field.type === 'select' ? (
                  <select
                    value={String(form[field.key] ?? '')}
                    onChange={e => set(field.key, e.target.value)}
                    style={{ ...FIELD_STYLE, cursor: 'pointer' }}
                    onFocus={e => { (e.target as HTMLSelectElement).style.borderColor = '#4ba6ea'; }}
                    onBlur={e => { (e.target as HTMLSelectElement).style.borderColor = '#e5e7eb'; }}
                  >
                    {field.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                ) : (
                  <input
                    type={field.type}
                    required={field.required}
                    value={form[field.key] != null ? String(form[field.key]) : ''}
                    onChange={e => set(field.key, field.type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)}
                    placeholder={field.label}
                    style={FIELD_STYLE}
                    onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
                    onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }}
                  />
                )}
              </div>
            ))}
          </div>

          {formError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, padding: '10px 14px', background: '#fef2f2', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.8"/><path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"/></svg>
              <span style={{ fontSize: 13, color: '#ef4444' }}>{formError}</span>
            </div>
          )}

          {/* Footer inside form so submit button works */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24, paddingTop: 18, borderTop: '1px solid #f3f4f6' }}>
            <button type="button" onClick={onClose}
              style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', fontSize: 14, fontWeight: 500, color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#9ca3af'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; }}
            >
              Cancel
            </button>
            <button type="submit" disabled={saving}
              style={{ padding: '9px 22px', borderRadius: 9, border: 'none', background: saving ? '#a8d4f5' : '#4ba6ea', color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'background 150ms ease' }}
              onMouseEnter={e => { if (!saving) (e.currentTarget as HTMLButtonElement).style.background = '#2e8fd4'; }}
              onMouseLeave={e => { if (!saving) (e.currentTarget as HTMLButtonElement).style.background = '#4ba6ea'; }}
            >
              {saving ? 'Saving…' : mode === 'add' ? 'Add Model Group' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{transform:translateY(12px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes slideUpIn { from{transform:translateY(8px);opacity:0} to{transform:translateY(0);opacity:1} }
      `}</style>
    </div>,
    document.body
  );
};

// ---------------------------------------------------------------------------
// Card skeleton
// ---------------------------------------------------------------------------

const SkeletonCard: React.FC = () => (
  <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #ebebeb', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
    <div style={{ height: 220, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
    <div style={{ padding: '18px 18px 14px' }}>
      <div style={{ width: '70%', height: 18, borderRadius: 6, background: '#f3f4f6', marginBottom: 10, animation: 'pulse 1.5s ease-in-out infinite' }} />
      <div style={{ width: '50%', height: 13, borderRadius: 5, background: '#f3f4f6', marginBottom: 16, animation: 'pulse 1.5s ease-in-out infinite' }} />
      <div style={{ display: 'flex', gap: 6 }}>
        {[60, 52, 56].map((w, i) => <div key={i} style={{ width: w, height: 22, borderRadius: 20, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />)}
      </div>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Model group card
// ---------------------------------------------------------------------------

interface CardProps {
  group: ModelGroup;
  onEdit: () => void;
}

const ModelGroupCard: React.FC<CardProps> = ({ group, onEdit }) => {
  const { fmt: formatPrice } = useCurrency();
  const [hovered, setHovered] = useState(false);
  const [imgError, setImgError] = useState(false);
  const cat = categoryStyle(group.category);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#fff',
        borderRadius: 16,
        border: '1px solid #ebebeb',
        overflow: 'hidden',
        boxShadow: hovered ? '0 12px 36px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.04)' : '0 1px 3px rgba(0,0,0,0.05)',
        transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
        transition: 'box-shadow 200ms ease, transform 200ms ease',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 380,
        width: '100%',
        position: 'relative',
      }}
    >
      {/* Edit button — appears on hover */}
      <button
        onClick={e => { e.stopPropagation(); onEdit(); }}
        style={{
          position: 'absolute', top: 12, right: 12, zIndex: 2,
          width: 32, height: 32, borderRadius: 8,
          border: 'none',
          background: hovered ? 'rgba(255,255,255,0.95)' : 'transparent',
          boxShadow: hovered ? '0 2px 8px rgba(0,0,0,0.12)' : 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          opacity: hovered ? 1 : 0,
          transition: 'opacity 150ms ease, background 150ms ease, box-shadow 150ms ease',
          pointerEvents: hovered ? 'auto' : 'none',
        }}
        aria-label="Edit"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="#374151" strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="#374151" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Image */}
      <div style={{ height: 220, background: '#f5f5f5', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {group.image_url && !imgError ? (
          <img
            src={group.image_url}
            alt={group.name}
            onError={() => setImgError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', transition: 'transform 300ms ease', transform: hovered ? 'scale(1.03)' : 'scale(1)' }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
              <path d="M5 17H3a2 2 0 01-2-2V7a2 2 0 012-2h11a2 2 0 012 2v3" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <rect x="9" y="11" width="14" height="10" rx="2" stroke="#d1d5db" strokeWidth="1.5"/>
              <circle cx="12" cy="16" r="1" fill="#d1d5db"/>
              <circle cx="20" cy="16" r="1" fill="#d1d5db"/>
            </svg>
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#0f1117', letterSpacing: '-0.4px', lineHeight: 1.3 }}>
            {group.name}
          </div>
          <span style={{
            flexShrink: 0, fontSize: 11, fontWeight: 700,
            color: '#4ba6ea', background: 'rgba(75,166,234,0.10)',
            borderRadius: 20, padding: '2px 9px', marginTop: 2,
          }}>
            {group.total_cars ?? 0} cars
          </span>
        </div>
        <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 12 }}>
          {group.brand} · {group.model}
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 700, color: cat.color, background: cat.bg, borderRadius: 20, padding: '3px 10px', letterSpacing: '0.2px' }}>
          {group.category}
        </span>
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 16px 16px', marginTop: 'auto', borderTop: '1px solid #f5f5f5', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#4ba6ea', marginRight: 4 }}>
          {formatPrice(group.price)}
        </span>
        {[
          group.seats != null   ? `${group.seats} seats`  : null,
          group.fuel            ? group.fuel               : null,
          group.transmission    ? group.transmission       : null,
        ].filter(Boolean).map((label, i) => (
          <span key={i} style={{ fontSize: 11, fontWeight: 500, color: '#6b7280', background: '#f3f4f6', borderRadius: 20, padding: '3px 9px' }}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const ModelGroupsPage: React.FC = () => {
  const [groups, setGroups]         = useState<ModelGroup[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [modal, setModal]           = useState<null | { mode: 'add' } | { mode: 'edit'; group: ModelGroup }>(null);
  const [toast, setToast]           = useState<null | { message: string; type: 'success' | 'error' }>(null);
  const toastTimer                  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  };

  const fetchGroups = async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('model_group')
      .select('id, name, brand, model, category, transmission, fuel, seats, luggage, daily_km, monthly_km, deposit, min_age, price, total_cars, image_url')
      .order('name', { ascending: true });
    setLoading(false);
    if (fetchError) { setError(fetchError.message); return; }
    setGroups((data ?? []) as ModelGroup[]);
  };

  useEffect(() => {
    let active = true;
    supabase
      .from('model_group')
      .select('id, name, brand, model, category, transmission, fuel, seats, luggage, daily_km, monthly_km, deposit, min_age, price, total_cars, image_url')
      .order('name', { ascending: true })
      .then(({ data, error: fetchError }) => {
        if (!active) return;
        setLoading(false);
        if (fetchError) { setError(fetchError.message); return; }
        setGroups((data ?? []) as ModelGroup[]);
      });
    return () => { active = false; };
  }, []);

  const handleSaved = () => {
    showToast(modal?.mode === 'add' ? 'Model group added successfully' : 'Changes saved', 'success');
    fetchGroups();
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)', padding: '44px 40px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 36 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ba6ea' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#4ba6ea', letterSpacing: '0.8px', textTransform: 'uppercase' }}>Fleet</span>
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.8px', color: '#0f1117', marginBottom: 6, lineHeight: 1.1 }}>
            Model Groups
          </h1>
          <p style={{ fontSize: 15, color: '#6b7280' }}>
            {loading ? 'Loading…' : `${groups.length} model group${groups.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={() => setModal({ mode: 'add' })}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            height: 42, padding: '0 20px',
            background: '#4ba6ea', color: '#fff', border: 'none',
            borderRadius: 10, fontSize: 14, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: '0 2px 8px rgba(75,166,234,0.30)',
            transition: 'background 150ms ease, box-shadow 150ms ease',
          }}
          onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = '#2e8fd4'; b.style.boxShadow = '0 4px 16px rgba(75,166,234,0.40)'; }}
          onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = '#4ba6ea'; b.style.boxShadow = '0 2px 8px rgba(75,166,234,0.30)'; }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
          </svg>
          Add Model Group
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid rgba(239,68,68,0.2)', borderLeft: '4px solid #ef4444', borderRadius: 12, padding: '14px 18px', marginBottom: 28, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.8"/>
            <path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0f1117', marginBottom: 2 }}>Failed to load model groups</div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>{error}</div>
          </div>
        </div>
      )}

      {/* Card grid — grouped by category */}
      {loading && (
        <div className="mg-grid">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {!loading && !error && groups.length === 0 && (
        <div style={{ textAlign: 'center', padding: '64px 0', color: '#9ca3af', fontSize: 15 }}>
          No model groups yet. Click "Add Model Group" to create one.
        </div>
      )}

      {!loading && !error && (['Economy', 'Middle', 'SUV'] as const).map(category => {
        const section = groups
          .filter(g => g.category === category)
          .sort((a, b) => a.name.localeCompare(b.name));
        if (section.length === 0) return null;
        const cat = categoryStyle(category);
        return (
          <div key={category} style={{ marginBottom: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{
                fontSize: 12, fontWeight: 700,
                color: cat.color, background: cat.bg,
                borderRadius: 20, padding: '4px 12px',
                letterSpacing: '0.3px',
              }}>
                {category}
              </span>
              <span style={{ fontSize: 13, color: '#c0c4cc' }}>{section.length} model{section.length !== 1 ? 's' : ''}</span>
              <div style={{ flex: 1, height: 1, background: '#ebebeb' }} />
            </div>
            <div className="mg-grid">
              {section.map(group => (
                <ModelGroupCard
                  key={group.id}
                  group={group}
                  onEdit={() => setModal({ mode: 'edit', group })}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Modals */}
      {modal && (
        <FormModal
          mode={modal.mode}
          initial={modal.mode === 'edit' ? { ...modal.group } : EMPTY_FORM}
          editId={modal.mode === 'edit' ? modal.group.id : undefined}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} />}

      <style>{`
        .mg-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 20px;
          align-items: stretch;
        }
        @media (max-width: 1100px) { .mg-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 640px)  { .mg-grid { grid-template-columns: minmax(0, 1fr); } }
        @keyframes pulse      { 0%,100%{opacity:1} 50%{opacity:0.45} }
        @keyframes fadeIn     { from{opacity:0} to{opacity:1} }
        @keyframes slideUp    { from{transform:translateY(12px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes slideUpIn  { from{transform:translateY(8px);opacity:0} to{transform:translateY(0);opacity:1} }
      `}</style>
    </div>
  );
};

export default ModelGroupsPage;
