import React, { useEffect, useRef, useState } from 'react';
import { useCurrency } from '../lib/CurrencyContext';
import ReactDOM from 'react-dom';
import { supabase } from '../lib/supabase';
import type { ModelGroup, ModelGroupFormData } from '../types';

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
  Economy: { color: '#16a34a', bg: 'rgba(22,163,74,0.10)'   },
  Middle:  { color: '#2563eb', bg: 'rgba(37,99,235,0.10)'   },
  Luxury:  { color: '#7c3aed', bg: 'rgba(124,58,237,0.10)'  },
  SUV:     { color: '#d97706', bg: 'rgba(217,119,6,0.10)'   },
  Van:     { color: '#0891b2', bg: 'rgba(8,145,178,0.10)'   },
  Electric:{ color: '#059669', bg: 'rgba(5,150,105,0.10)'   },
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

const F: React.CSSProperties = {
  width: '100%', height: 40, padding: '0 12px',
  fontSize: 14, color: '#0f1117',
  background: '#fff', border: '1.5px solid #e5e7eb',
  borderRadius: 8, outline: 'none', fontFamily: 'inherit',
  boxSizing: 'border-box', transition: 'border-color 150ms ease',
};
const LBL: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600,
  color: '#374151', marginBottom: 5, letterSpacing: '0.1px',
};
const onFocus = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) =>
  { (e.target as HTMLElement).style.borderColor = '#4ba6ea'; };
const onBlur  = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) =>
  { (e.target as HTMLElement).style.borderColor = '#e5e7eb'; };

const FormModal: React.FC<FormModalProps> = ({ mode, initial, onClose, onSaved, editId }) => {
  const [form, setForm]       = useState<ModelGroupFormData>(initial);
  const [saving, setSaving]   = useState<'idle' | 'uploading' | 'saving'>('idle');
  const [formError, setFormError] = useState<string | null>(null);

  // Name auto-generate
  const nameEditedRef = useRef(mode === 'edit' && !!initial.name);
  const setField = (key: keyof ModelGroupFormData, value: string | number | null) =>
    setForm(f => ({ ...f, [key]: value }));

  const handleBrand = (val: string) => {
    setField('brand', val);
    if (!nameEditedRef.current) setForm(f => ({ ...f, brand: val, name: `${val} ${f.model}`.trim() }));
  };
  const handleModel = (val: string) => {
    setField('model', val);
    if (!nameEditedRef.current) setForm(f => ({ ...f, model: val, name: `${f.brand} ${val}`.trim() }));
  };
  const handleName = (val: string) => {
    nameEditedRef.current = true;
    setField('name', val);
  };

  // Image upload
  const [imageFile, setImageFile]   = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initial.image_url ?? null);

  useEffect(() => {
    if (!imageFile) return;
    const url = URL.createObjectURL(imageFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    let imageUrl = form.image_url;

    // Upload image if a new file was selected
    if (imageFile) {
      setSaving('uploading');
      const fileName = `model-groups/${form.brand}-${form.model}`
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9\-]/g, '') + '.jpg';

      const { error: uploadError } = await supabase.storage
        .from('model-group')
        .upload(fileName, imageFile, { upsert: true });

      if (uploadError) {
        setSaving('idle');
        setFormError(`Image upload failed: ${uploadError.message}`);
        return;
      }
      imageUrl = supabase.storage.from('model-group').getPublicUrl(fileName).data.publicUrl;
    }

    setSaving('saving');

    const payload = {
      ...form,
      image_url:  imageUrl,
      seats:      form.seats      != null ? Number(form.seats)      : null,
      luggage:    form.luggage    != null ? Number(form.luggage)    : null,
      daily_km:   form.daily_km   != null ? Number(form.daily_km)   : null,
      monthly_km: form.monthly_km != null ? Number(form.monthly_km) : null,
      deposit:    form.deposit    != null ? Number(form.deposit)    : null,
      min_age:    form.min_age    != null ? Number(form.min_age)    : null,
      price:      Number(form.price),
    };

    const { error } = mode === 'add'
      ? await supabase.from('model_group').insert(payload)
      : await supabase.from('model_group').update(payload).eq('id', editId!);

    setSaving('idle');
    if (error) { setFormError(error.message); return; }
    onSaved();
    onClose();
  };

  const isSaving = saving !== 'idle';
  const saveLabel = saving === 'uploading' ? 'Uploading image…'
                  : saving === 'saving'    ? 'Saving…'
                  : mode === 'add'         ? 'Add Model Group'
                  : 'Save Changes';

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

            {/* Brand */}
            <div>
              <label style={LBL}>Brand <span style={{ color: '#ef4444' }}>*</span></label>
              <input type="text" required value={form.brand} placeholder="e.g. Toyota"
                onChange={e => handleBrand(e.target.value)} onFocus={onFocus} onBlur={onBlur} style={F} />
            </div>

            {/* Model */}
            <div>
              <label style={LBL}>Model <span style={{ color: '#ef4444' }}>*</span></label>
              <input type="text" required value={form.model} placeholder="e.g. Corolla"
                onChange={e => handleModel(e.target.value)} onFocus={onFocus} onBlur={onBlur} style={F} />
            </div>

            {/* Name — auto-generated, full width */}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={LBL}>
                Name <span style={{ color: '#ef4444' }}>*</span>
                <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: 6 }}>(auto-generated)</span>
              </label>
              <input type="text" required value={form.name} placeholder="Auto generated (you can edit)"
                onChange={e => handleName(e.target.value)} onFocus={onFocus} onBlur={onBlur} style={F} />
            </div>

            {/* Category */}
            <div>
              <label style={LBL}>Category</label>
              <select value={form.category} onChange={e => setField('category', e.target.value)}
                onFocus={onFocus} onBlur={onBlur} style={{ ...F, cursor: 'pointer' }}>
                {['Economy', 'Middle', 'Luxury', 'SUV', 'Van', 'Electric'].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>

            {/* Transmission */}
            <div>
              <label style={LBL}>Transmission</label>
              <select value={form.transmission} onChange={e => setField('transmission', e.target.value)}
                onFocus={onFocus} onBlur={onBlur} style={{ ...F, cursor: 'pointer' }}>
                {['Automatic', 'Manual'].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>

            {/* Fuel */}
            <div>
              <label style={LBL}>Fuel</label>
              <select value={form.fuel} onChange={e => setField('fuel', e.target.value)}
                onFocus={onFocus} onBlur={onBlur} style={{ ...F, cursor: 'pointer' }}>
                {['Petrol', 'Diesel', 'Hybrid', 'Electric', 'Other'].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>

            {/* Seats */}
            <div>
              <label style={LBL}>Seats</label>
              <input type="number" min="1" placeholder="5"
                value={form.seats != null ? String(form.seats) : ''}
                onChange={e => setField('seats', e.target.value === '' ? null : Number(e.target.value))}
                onFocus={onFocus} onBlur={onBlur} style={F} />
            </div>

            {/* Luggage */}
            <div>
              <label style={LBL}>Luggage</label>
              <input type="number" min="0" placeholder="e.g. 2"
                value={form.luggage != null ? String(form.luggage) : ''}
                onChange={e => setField('luggage', e.target.value === '' ? null : Number(e.target.value))}
                onFocus={onFocus} onBlur={onBlur} style={F} />
            </div>

            {/* Daily KM */}
            <div>
              <label style={LBL}>Daily KM</label>
              <input type="number" min="0" placeholder="e.g. 300"
                value={form.daily_km != null ? String(form.daily_km) : ''}
                onChange={e => setField('daily_km', e.target.value === '' ? null : Number(e.target.value))}
                onFocus={onFocus} onBlur={onBlur} style={F} />
            </div>

            {/* Monthly KM */}
            <div>
              <label style={LBL}>Monthly KM</label>
              <input type="number" min="0" placeholder="e.g. 6000"
                value={form.monthly_km != null ? String(form.monthly_km) : ''}
                onChange={e => setField('monthly_km', e.target.value === '' ? null : Number(e.target.value))}
                onFocus={onFocus} onBlur={onBlur} style={F} />
            </div>

            {/* Deposit */}
            <div>
              <label style={LBL}>Deposit (USD)</label>
              <input type="number" min="0" step="0.01" placeholder="e.g. 500"
                value={form.deposit != null ? String(form.deposit) : ''}
                onChange={e => setField('deposit', e.target.value === '' ? null : Number(e.target.value))}
                onFocus={onFocus} onBlur={onBlur} style={F} />
            </div>

            {/* Min Age */}
            <div>
              <label style={LBL}>Min Age</label>
              <input type="number" min="18" max="99" placeholder="e.g. 21"
                value={form.min_age != null ? String(form.min_age) : ''}
                onChange={e => setField('min_age', e.target.value === '' ? null : Number(e.target.value))}
                onFocus={onFocus} onBlur={onBlur} style={F} />
            </div>

            {/* Price — full width */}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={LBL}>Price (USD $) <span style={{ color: '#ef4444' }}>*</span></label>
              <input type="number" min="0" step="0.01" required placeholder="e.g. 49.00"
                value={form.price != null ? String(form.price) : ''}
                onChange={e => setField('price', e.target.value === '' ? 0 : Number(e.target.value))}
                onFocus={onFocus} onBlur={onBlur} style={F} />
            </div>

            {/* Image upload — full width */}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={LBL}>Car Image</label>

              {/* Preview */}
              {previewUrl && (
                <div style={{ position: 'relative', marginBottom: 10 }}>
                  <img src={previewUrl} alt="Preview"
                    style={{ width: '100%', maxHeight: 160, objectFit: 'contain', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#f9fafb', display: 'block' }} />
                  <button type="button" onClick={() => { setImageFile(null); setPreviewUrl(null); setField('image_url', null); }}
                    style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.5)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
                  </button>
                </div>
              )}

              {/* Drop zone */}
              <label style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                padding: '14px 12px', border: '1.5px dashed #d1d5db', borderRadius: 9,
                cursor: 'pointer', background: '#fafafa',
                transition: 'border-color 140ms ease, background 140ms ease',
              }}
                onMouseEnter={e => { const l = e.currentTarget; l.style.borderColor = '#4ba6ea'; l.style.background = 'rgba(75,166,234,0.04)'; }}
                onMouseLeave={e => { const l = e.currentTarget; l.style.borderColor = '#d1d5db'; l.style.background = '#fafafa'; }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: '#9ca3af' }}>
                  <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.6"/>
                  <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
                  <path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>
                  {previewUrl ? 'Click to replace image' : 'Click to upload image'}
                </span>
                <span style={{ fontSize: 11, color: '#9ca3af' }}>JPG, PNG, WEBP</span>
                <input type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) setImageFile(f); e.target.value = ''; }} />
              </label>
            </div>

          </div>

          {formError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, padding: '10px 14px', background: '#fef2f2', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.8"/><path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"/></svg>
              <span style={{ fontSize: 13, color: '#ef4444' }}>{formError}</span>
            </div>
          )}

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24, paddingTop: 18, borderTop: '1px solid #f3f4f6' }}>
            <button type="button" onClick={onClose} disabled={isSaving}
              style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', fontSize: 14, fontWeight: 500, color: '#6b7280', cursor: isSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
              onMouseEnter={e => { if (!isSaving) (e.currentTarget as HTMLButtonElement).style.borderColor = '#9ca3af'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; }}
            >
              Cancel
            </button>
            <button type="submit" disabled={isSaving}
              style={{ padding: '9px 22px', borderRadius: 9, border: 'none', background: isSaving ? '#a8d4f5' : '#4ba6ea', color: '#fff', fontSize: 14, fontWeight: 600, cursor: isSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'background 150ms ease', display: 'flex', alignItems: 'center', gap: 7 }}
              onMouseEnter={e => { if (!isSaving) (e.currentTarget as HTMLButtonElement).style.background = '#2e8fd4'; }}
              onMouseLeave={e => { if (!isSaving) (e.currentTarget as HTMLButtonElement).style.background = '#4ba6ea'; }}
            >
              {isSaving && (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.7s linear infinite' }}>
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="28 56"/>
                </svg>
              )}
              {saveLabel}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{transform:translateY(12px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes slideUpIn { from{transform:translateY(8px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes spin    { to{transform:rotate(360deg)} }
      `}</style>
    </div>,
    document.body
  );
};

// ---------------------------------------------------------------------------
// Row skeleton
// ---------------------------------------------------------------------------

const SkeletonRow: React.FC = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '16px 20px', minHeight: 100, borderBottom: '1px solid #f5f5f5' }}>
    <div style={{ width: 160, height: 96, borderRadius: 8, background: '#f3f4f6', flexShrink: 0, animation: 'pulse 1.5s ease-in-out infinite' }} />
    <div style={{ flex: '0 0 210px' }}>
      <div style={{ width: 130, height: 14, borderRadius: 5, background: '#f3f4f6', marginBottom: 8, animation: 'pulse 1.5s ease-in-out infinite' }} />
      <div style={{ width: 90, height: 11, borderRadius: 5, background: '#f3f4f6', marginBottom: 8, animation: 'pulse 1.5s ease-in-out infinite' }} />
      <div style={{ width: 60, height: 18, borderRadius: 20, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
    </div>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {[50, 52, 70].map((w, i) => (
          <div key={i} style={{ width: w, height: 20, borderRadius: 20, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
        ))}
      </div>
      <div style={{ width: 70, height: 13, borderRadius: 5, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
      <div style={{ width: 62, height: 24, borderRadius: 20, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
      <div style={{ width: 34, height: 34, borderRadius: 9, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Model group row
// ---------------------------------------------------------------------------

interface RowProps {
  group: ModelGroup;
  onEdit: () => void;
}

const ModelGroupRow: React.FC<RowProps> = ({ group, onEdit }) => {
  const { fmtUSD } = useCurrency();
  const [hovered, setHovered] = useState(false);
  const [imgError, setImgError] = useState(false);
  const cat = categoryStyle(group.category);

  const specs = [
    group.seats != null ? `${group.seats} seats` : null,
    group.fuel          ? group.fuel              : null,
    group.transmission  ? group.transmission      : null,
  ].filter(Boolean) as string[];

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        padding: '16px 20px',
        minHeight: 100,
        background: hovered ? '#fafbfc' : '#fff',
        borderBottom: '1px solid #f5f5f5',
        transition: 'background 120ms ease',
      }}
    >
      {/* Image */}
      {group.image_url && !imgError ? (
        <img
          src={group.image_url}
          alt={group.name}
          onError={() => setImgError(true)}
          style={{ width: 160, height: 96, objectFit: 'contain', objectPosition: 'center', flexShrink: 0, display: 'block' }}
        />
      ) : (
        <div style={{ width: 160, height: 96, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path d="M5 17H3a2 2 0 01-2-2V7a2 2 0 012-2h11a2 2 0 012 2v3" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <rect x="9" y="11" width="14" height="10" rx="2" stroke="#d1d5db" strokeWidth="1.5"/>
            <circle cx="12" cy="16" r="1" fill="#d1d5db"/>
            <circle cx="20" cy="16" r="1" fill="#d1d5db"/>
          </svg>
        </div>
      )}

      {/* Identity */}
      <div style={{ flex: '0 0 210px', minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f1117', letterSpacing: '-0.2px', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {group.name}
        </div>
        <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 7 }}>
          {group.brand} · {group.model}
        </div>
        <span style={{
          display: 'inline-block', fontSize: 10.5, fontWeight: 700,
          color: cat.color, background: cat.bg,
          borderRadius: 20, padding: '2px 9px', letterSpacing: '0.2px',
        }}>
          {group.category}
        </span>
      </div>

      {/* Specs + price */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {specs.map((s, i) => (
            <span key={i} style={{ fontSize: 11, fontWeight: 500, color: '#6b7280', background: '#f3f4f6', borderRadius: 20, padding: '3px 9px', whiteSpace: 'nowrap' }}>
              {s}
            </span>
          ))}
        </div>
        <div>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#4ba6ea' }}>{fmtUSD(group.price)}</span>
          <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 2 }}>/day</span>
        </div>
      </div>

      {/* Cars count + edit */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span style={{
          fontSize: 11, fontWeight: 700,
          color: '#4ba6ea', background: 'rgba(75,166,234,0.10)',
          borderRadius: 20, padding: '4px 12px', whiteSpace: 'nowrap',
        }}>
          {group.total_cars ?? 0} cars
        </span>
        <button
          onClick={e => { e.stopPropagation(); onEdit(); }}
          aria-label="Edit"
          style={{
            width: 34, height: 34, borderRadius: 9,
            border: '1px solid #e5e7eb',
            background: hovered ? '#fff' : '#f9fafb',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#6b7280',
            transition: 'all 140ms ease', flexShrink: 0,
          }}
          onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#4ba6ea'; b.style.color = '#4ba6ea'; b.style.background = 'rgba(75,166,234,0.06)'; }}
          onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#e5e7eb'; b.style.color = '#6b7280'; b.style.background = hovered ? '#fff' : '#f9fafb'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
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

      {/* Row list — grouped by category */}
      {loading && (
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
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
          <div key={category} style={{ marginBottom: 28 }}>
            {/* Sticky section header */}
            <div style={{
              position: 'sticky', top: 0, zIndex: 10,
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 0 10px',
              background: 'linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)',
            }}>
              <span style={{
                fontSize: 11.5, fontWeight: 700,
                color: cat.color, background: cat.bg,
                borderRadius: 20, padding: '4px 12px',
                letterSpacing: '0.3px',
              }}>
                {category}
              </span>
              <span style={{ fontSize: 12.5, color: '#c0c4cc' }}>{section.length} model{section.length !== 1 ? 's' : ''}</span>
              <div style={{ flex: 1, height: 1, background: '#ebebeb' }} />
            </div>
            {/* Rows container */}
            <div style={{
              background: '#fff',
              borderRadius: 16,
              border: '1px solid #f0f0f0',
              overflow: 'hidden',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            }}>
              {section.map((group, idx) => (
                <div key={group.id} style={{ borderBottom: idx < section.length - 1 ? '1px solid #f5f5f5' : 'none' }}>
                  <ModelGroupRow
                    group={group}
                    onEdit={() => setModal({ mode: 'edit', group })}
                  />
                </div>
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
        @keyframes pulse      { 0%,100%{opacity:1} 50%{opacity:0.45} }
        @keyframes fadeIn     { from{opacity:0} to{opacity:1} }
        @keyframes slideUp    { from{transform:translateY(12px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes slideUpIn  { from{transform:translateY(8px);opacity:0} to{transform:translateY(0);opacity:1} }
      `}</style>
    </div>
  );
};

export default ModelGroupsPage;
