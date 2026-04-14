import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../lib/supabase';
import type { CarAvailabilityRow, CarStatus, CarStatusCounts } from '../types';
import AlertSection from '../components/AlertSection';

// ─── Car Table Types ──────────────────────────────────────────────────────────

interface CarTableRow {
  id: number;
  plate_number: string;
  model: string;
  current_km: number | string;
  year: number | string;
  status: string;
  contract_url:  string | null;
  invoice_url:   string | null;
  insurance_url: string | null;
  ruhsat_url:    string | null;
  kasko_url:     string | null;
}

type CarTableStatus = 'working' | 'parking' | 'maintenance' | 'selling' | 'replacement';

const STATUS_CONFIG: Record<CarTableStatus, { label: string; color: string; bg: string }> = {
  working:     { label: 'Working',     color: '#16a34a', bg: 'rgba(34,197,94,0.1)'  },
  parking:     { label: 'Parking',     color: '#ea580c', bg: 'rgba(249,115,22,0.1)' },
  maintenance: { label: 'Maintenance', color: '#6b7280', bg: 'rgba(107,114,128,0.1)'},
  selling:     { label: 'Selling',     color: '#ca8a04', bg: 'rgba(234,179,8,0.1)'  },
  replacement: { label: 'Replacement', color: '#0891b2', bg: 'rgba(6,182,212,0.1)'  },
};

const CarStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const cfg = STATUS_CONFIG[status as CarTableStatus];
  if (!cfg) return <span style={{ fontSize: 12, color: '#9ca3af' }}>{status || '—'}</span>;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 20, fontSize: 12, fontWeight: 600,
      color: cfg.color, background: cfg.bg,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
};

// ─── Stat Card Types ───────────────────────────────────────────────────────────

interface StatCard {
  key: 'all' | CarStatus;
  label: string;
  description: string;
  accentColor: string;
  iconBg: string;
  icon: React.ReactNode;
}

const CARDS: StatCard[] = [
  {
    key: 'all',
    label: 'Total Fleet',
    description: 'All registered vehicles',
    accentColor: '#4ba6ea',
    iconBg: 'rgba(75,166,234,0.1)',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="#4ba6ea" strokeWidth="1.8" strokeLinecap="round"/>
        <circle cx="9" cy="7" r="4" stroke="#4ba6ea" strokeWidth="1.8"/>
        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="#4ba6ea" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    key: 'working',
    label: 'Working',
    description: 'Active on the road',
    accentColor: '#22c55e',
    iconBg: 'rgba(34,197,94,0.1)',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M9 12l2 2 4-4" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="12" cy="12" r="9" stroke="#22c55e" strokeWidth="1.8"/>
      </svg>
    ),
  },
  {
    key: 'parking',
    label: 'Parking',
    description: 'Parked at branch',
    accentColor: '#ef4444',
    iconBg: 'rgba(239,68,68,0.1)',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="3" stroke="#ef4444" strokeWidth="1.8"/>
        <path d="M9 17V7h4.5a3 3 0 010 6H9" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    key: 'maintenance',
    label: 'Maintenance',
    description: 'Under service',
    accentColor: '#6b7280',
    iconBg: 'rgba(107,114,128,0.1)',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke="#6b7280" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    key: 'selling',
    label: 'Selling',
    description: 'Listed for sale',
    accentColor: '#eab308',
    iconBg: 'rgba(234,179,8,0.1)',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" stroke="#eab308" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="7" cy="7" r="1.5" fill="#eab308"/>
      </svg>
    ),
  },
  {
    key: 'replacement',
    label: 'Replacement',
    description: 'Replacement vehicles',
    accentColor: '#06b6d4',
    iconBg: 'rgba(6,182,212,0.1)',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M1 4v6h6" stroke="#06b6d4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M23 20v-6h-6" stroke="#06b6d4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M20.49 9A9 9 0 005.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 013.51 15" stroke="#06b6d4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

interface HoverCardProps {
  card: StatCard;
  count: number;
  total: number;
}

const StatCardComponent: React.FC<HoverCardProps> = ({ card, count, total }) => {
  const ref = useRef<HTMLDivElement>(null);

  const handleEnter = () => {
    if (!ref.current) return;
    ref.current.style.transform = 'translateY(-4px)';
    ref.current.style.boxShadow = `0 16px 40px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.04)`;
  };

  const handleLeave = () => {
    if (!ref.current) return;
    ref.current.style.transform = 'translateY(0)';
    ref.current.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)';
  };

  const pct = total > 0 && card.key !== 'all' ? Math.round((count / total) * 100) : null;

  return (
    <div
      ref={ref}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      style={{
        background: '#ffffff',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
        transition: 'transform 200ms ease, box-shadow 200ms ease',
        cursor: 'default',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Colored top bar */}
      <div style={{ height: 4, background: card.accentColor, flexShrink: 0 }} />

      <div style={{ padding: '24px 24px 22px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Icon + label row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{
            width: 42,
            height: 42,
            borderRadius: 11,
            background: card.iconBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            {card.icon}
          </div>
          {pct !== null && (
            <span style={{
              fontSize: 12,
              fontWeight: 600,
              color: card.accentColor,
              background: card.iconBg,
              borderRadius: 20,
              padding: '3px 9px',
              letterSpacing: '0.2px',
            }}>
              {pct}%
            </span>
          )}
        </div>

        {/* Number */}
        <div>
          <div style={{
            fontSize: 52,
            fontWeight: 800,
            letterSpacing: '-3px',
            color: '#0f1117',
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {count}
          </div>
        </div>

        {/* Label + description */}
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#0f1117', marginBottom: 2 }}>
            {card.label}
          </div>
          <div style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.4 }}>
            {card.description}
          </div>
        </div>
      </div>
    </div>
  );
};

const SkeletonCard: React.FC = () => (
  <div style={{
    background: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
  }}>
    <div style={{ height: 4, background: '#f3f4f6' }} />
    <div style={{ padding: '24px' }}>
      <div style={{ width: 42, height: 42, borderRadius: 11, background: '#f3f4f6', marginBottom: 20, animation: 'pulse 1.5s ease-in-out infinite' }} />
      <div style={{ width: '50%', height: 52, borderRadius: 8, background: '#f3f4f6', marginBottom: 14, animation: 'pulse 1.5s ease-in-out infinite' }} />
      <div style={{ width: '65%', height: 15, borderRadius: 6, background: '#f3f4f6', marginBottom: 6, animation: 'pulse 1.5s ease-in-out infinite' }} />
      <div style={{ width: '45%', height: 13, borderRadius: 6, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
    </div>
  </div>
);

// ─── Add Car Modal ────────────────────────────────────────────────────────────

interface ModelGroupOption { id: number; name: string; }
interface InvestorOption   { id: number; full_name: string; }

const AddCarModal: React.FC<{ onClose: () => void; onAdded: () => void }> = ({ onClose, onAdded }) => {
  const [modelGroups, setModelGroups]   = useState<ModelGroupOption[]>([]);
  const [investors,   setInvestors]     = useState<InvestorOption[]>([]);
  const [loadingData, setLoadingData]   = useState(true);

  const [modelGroupId, setModelGroupId] = useState('');
  const [plate,        setPlate]        = useState('');
  const [investorId,   setInvestorId]   = useState('');
  const [saving,       setSaving]       = useState(false);
  const [formError,    setFormError]    = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [mgRes, invRes] = await Promise.all([
        supabase.from('model_group').select('id, name').order('name'),
        supabase.from('investors').select('id, profiles!fk_investor_profile(full_name)'),
      ]);
      if (cancelled) return;
      setModelGroups((mgRes.data ?? []) as ModelGroupOption[]);
      const raw = (invRes.data ?? []) as unknown as { id: number; profiles: { full_name: string } | null }[];
      setInvestors(raw.map(r => ({ id: r.id, full_name: r.profiles?.full_name ?? '—' })));
      setLoadingData(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async () => {
    setFormError(null);
    if (!modelGroupId) { setFormError('Please select a model group.'); return; }
    if (!plate.trim()) { setFormError('Plate number is required.'); return; }
    if (!investorId)   { setFormError('Please select an investor.'); return; }

    setSaving(true);
    const { error } = await supabase.from('cars').insert({
      plate_number:    plate.trim().toUpperCase(),
      model_group_id:  Number(modelGroupId),
      investor_id:     Number(investorId),
    });
    setSaving(false);

    if (error) { setFormError(error.message); return; }
    onAdded();
    onClose();
  };

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 600,
    color: '#374151', marginBottom: 5, letterSpacing: '0.1px',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', fontSize: 14,
    border: '1.5px solid #e5e7eb', borderRadius: 9, outline: 'none',
    color: '#0f1117', background: '#fff', boxSizing: 'border-box',
    fontFamily: 'inherit', appearance: 'none',
  };
  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' };

  return ReactDOM.createPortal(
    <div
      onClick={handleBackdrop}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15,17,23,0.45)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
        animation: 'fadeIn 160ms ease',
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 460,
        boxShadow: '0 24px 60px rgba(0,0,0,0.18)',
        animation: 'slideUp 200ms ease',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '22px 24px 18px',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#0f1117', letterSpacing: '-0.3px' }}>
              Add New Car
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
              Register a new vehicle in the fleet
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: 8, border: '1px solid #e5e7eb',
              background: '#fff', cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: '#9ca3af',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Model Group */}
          <div>
            <label style={labelStyle}>Model Group <span style={{ color: '#ef4444' }}>*</span></label>
            <select
              value={modelGroupId}
              onChange={e => setModelGroupId(e.target.value)}
              disabled={loadingData}
              style={selectStyle}
            >
              <option value="">
                {loadingData ? 'Loading…' : 'Select model group'}
              </option>
              {modelGroups.map(mg => (
                <option key={mg.id} value={String(mg.id)}>{mg.name}</option>
              ))}
            </select>
          </div>

          {/* Plate Number */}
          <div>
            <label style={labelStyle}>Plate Number <span style={{ color: '#ef4444' }}>*</span></label>
            <input
              type="text"
              placeholder="34 ABC 123"
              value={plate}
              onChange={e => setPlate(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
              style={inputStyle}
            />
          </div>

          {/* Investor */}
          <div>
            <label style={labelStyle}>Investor <span style={{ color: '#ef4444' }}>*</span></label>
            <select
              value={investorId}
              onChange={e => setInvestorId(e.target.value)}
              disabled={loadingData}
              style={selectStyle}
            >
              <option value="">
                {loadingData ? 'Loading…' : 'Select investor'}
              </option>
              {investors.map(inv => (
                <option key={inv.id} value={String(inv.id)}>{inv.full_name}</option>
              ))}
            </select>
          </div>

          {/* Error */}
          {formError && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 9, padding: '10px 12px',
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                <circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.8"/>
                <path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              <span style={{ fontSize: 13, color: '#dc2626' }}>{formError}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #f0f0f0',
          display: 'flex', gap: 10, justifyContent: 'flex-end',
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '9px 18px', borderRadius: 9, border: '1.5px solid #e5e7eb',
              background: '#fff', fontSize: 14, fontWeight: 500, color: '#374151',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || loadingData}
            style={{
              padding: '9px 20px', borderRadius: 9, border: 'none',
              background: saving ? '#93c5fd' : '#4ba6ea',
              fontSize: 14, fontWeight: 600, color: '#fff',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 6,
              transition: 'background 150ms ease',
            }}
          >
            {saving && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.6s linear infinite' }}>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="28 56" />
              </svg>
            )}
            {saving ? 'Creating…' : 'Create Car'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─── PDF Upload Field ─────────────────────────────────────────────────────────

const PdfUploadField: React.FC<{
  label: string;
  existingUrl: string;
  file: File | null;
  onFileChange: (f: File | null) => void;
}> = ({ label, existingUrl, file, onFileChange }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5, letterSpacing: '0.1px' };

  return (
    <div>
      <label style={lbl}>{label}</label>
      <input ref={inputRef} type="file" accept="application/pdf" style={{ display: 'none' }}
        onChange={e => { onFileChange(e.target.files?.[0] ?? null); e.target.value = ''; }} />

      {file ? (
        /* New file selected — pending upload */
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', border: '1.5px solid #4ba6ea', borderRadius: 9, background: 'rgba(75,166,234,0.04)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: '#4ba6ea' }}>
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span style={{ fontSize: 12, color: '#0f1117', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
          <button onClick={() => onFileChange(null)} title="Remove" style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 2, display: 'flex', alignItems: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
          </button>
        </div>
      ) : existingUrl ? (
        /* Already uploaded */
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', border: '1.5px solid #e5e7eb', borderRadius: 9, background: '#f9fafb' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" stroke="#16a34a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M22 4L12 14.01l-3-3" stroke="#16a34a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#16a34a' }}>Uploaded</span>
          <a href={existingUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#4ba6ea', textDecoration: 'none', marginLeft: 2 }}>View</a>
          <button onClick={() => inputRef.current?.click()} style={{ marginLeft: 'auto', padding: '3px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', fontSize: 12, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
            Replace
          </button>
        </div>
      ) : (
        /* No file yet */
        <div
          onClick={() => inputRef.current?.click()}
          style={{ border: '1.5px dashed #e5e7eb', borderRadius: 9, padding: '14px 12px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', background: '#fafafa', transition: 'border-color 140ms ease' }}
          onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = '#4ba6ea'}
          onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = '#e5e7eb'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: '#d1d5db' }}>
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M12 12v4M10 14h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <span style={{ fontSize: 12, color: '#9ca3af' }}>Upload {label} PDF</span>
        </div>
      )}
    </div>
  );
};

// ─── Edit Car Modal ───────────────────────────────────────────────────────────

const EditCarModal: React.FC<{ carId: number; onClose: () => void; onSaved: () => void }> = ({ carId, onClose, onSaved }) => {
  const [loadingData, setLoadingData] = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [formError,   setFormError]   = useState<string | null>(null);
  const [hasReg,      setHasReg]      = useState(false);

  const [modelGroups, setModelGroups] = useState<{ id: number; name: string }[]>([]);
  const [investors,   setInvestors]   = useState<{ id: number; full_name: string }[]>([]);

  // Section 1
  const [plateNumber,  setPlateNumber]  = useState('');
  const [investorId,   setInvestorId]   = useState('');
  const [modelGroupId, setModelGroupId] = useState('');

  // Section 2
  const [manufactureYear,  setManufactureYear]  = useState('');
  const [carPackage,       setCarPackage]        = useState('');
  const [insuranceExpiry,  setInsuranceExpiry]   = useState('');
  const [inspectionExpiry, setInspectionExpiry]  = useState('');
  const [purchaseDate,     setPurchaseDate]      = useState('');
  const [contractUrl,      setContractUrl]       = useState('');
  const [invoiceUrl,       setInvoiceUrl]        = useState('');
  const [insuranceUrl,     setInsuranceUrl]      = useState('');
  const [ruhsatUrl,        setRuhsatUrl]         = useState('');
  const [kasko,            setKasko]             = useState('');

  // Pending file uploads (set on file select, uploaded on Save)
  const [contractFile,  setContractFile]  = useState<File | null>(null);
  const [invoiceFile,   setInvoiceFile]   = useState<File | null>(null);
  const [insuranceFile, setInsuranceFile] = useState<File | null>(null);
  const [ruhsatFile,    setRuhsatFile]    = useState<File | null>(null);
  const [kaskoFile,     setKaskoFile]     = useState<File | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [carRes, regRes, invRes, mgRes] = await Promise.all([
        supabase.from('cars').select('id, plate_number, investor_id, model_group_id').eq('id', carId).single(),
        supabase.from('cars_registration').select('*').eq('car_id', carId).maybeSingle(),
        supabase.from('investors').select('id, profiles!fk_investor_profile(full_name)'),
        supabase.from('model_group').select('id, name').order('name'),
      ]);
      if (cancelled) return;

      if (carRes.data) {
        const c = carRes.data as { plate_number: string; investor_id: number | null; model_group_id: number | null };
        setPlateNumber(c.plate_number ?? '');
        setInvestorId(c.investor_id != null ? String(c.investor_id) : '');
        setModelGroupId(c.model_group_id != null ? String(c.model_group_id) : '');
      }

      if (regRes.data) {
        const r = regRes.data as Record<string, unknown>;
        setHasReg(true);
        setManufactureYear(r.manufacture_year != null ? String(r.manufacture_year) : '');
        setCarPackage((r.car_package as string) ?? '');
        setInsuranceExpiry((r.insurance_expiry as string) ?? '');
        setInspectionExpiry((r.inspection_expiry as string) ?? '');
        setPurchaseDate((r.purchase_date as string) ?? '');
        setContractUrl((r.purchase_contract_url as string) ?? '');
        setInvoiceUrl((r.purchase_invoice_url as string) ?? '');
        setInsuranceUrl((r.insurance_file_url as string) ?? '');
        setRuhsatUrl((r.ruhsat_url as string) ?? '');
        setKasko((r.kasko as string) ?? '');
      }

      const rawInv = (invRes.data ?? []) as unknown as { id: number; profiles: { full_name: string } | null }[];
      setInvestors(rawInv.map(r => ({ id: r.id, full_name: r.profiles?.full_name ?? '—' })));
      setModelGroups((mgRes.data ?? []) as { id: number; name: string }[]);
      setLoadingData(false);
    })();
    return () => { cancelled = true; };
  }, [carId]);

  const handleSave = async () => {
    setFormError(null);
    if (!plateNumber.trim()) { setFormError('Plate number is required.'); return; }
    setSaving(true);

    const plate = plateNumber.trim().toUpperCase();

    const { error: carErr } = await supabase
      .from('cars')
      .update({
        plate_number:   plate,
        investor_id:    investorId    ? Number(investorId)    : null,
        model_group_id: modelGroupId  ? Number(modelGroupId)  : null,
      })
      .eq('id', carId);

    if (carErr) { setSaving(false); setFormError(carErr.message); return; }

    // Upload any pending PDF files, fall back to existing URL if none selected
    const uploadDoc = async (file: File | null, existing: string, prefix: string): Promise<string | null> => {
      if (!file) return existing || null;
      const path = `${prefix}-${plate}`;
      const { error: upErr } = await supabase.storage.from('doc').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('doc').getPublicUrl(path);
      return urlData.publicUrl;
    };

    let finalContract: string | null, finalInvoice: string | null,
        finalInsurance: string | null, finalRuhsat: string | null, finalKasko: string | null;
    try {
      [finalContract, finalInvoice, finalInsurance, finalRuhsat, finalKasko] = await Promise.all([
        uploadDoc(contractFile,  contractUrl,  'S'),
        uploadDoc(invoiceFile,   invoiceUrl,   'F'),
        uploadDoc(insuranceFile, insuranceUrl, 'T'),
        uploadDoc(ruhsatFile,    ruhsatUrl,    'R'),
        uploadDoc(kaskoFile,     kasko,        'K'),
      ]);
    } catch (upErr: unknown) {
      setSaving(false);
      setFormError(upErr instanceof Error ? upErr.message : 'File upload failed.');
      return;
    }

    const regData = {
      car_id:               carId,
      manufacture_year:     manufactureYear ? Number(manufactureYear) : null,
      car_package:          carPackage.trim()   || null,
      insurance_expiry:     insuranceExpiry     || null,
      inspection_expiry:    inspectionExpiry    || null,
      purchase_date:        purchaseDate        || null,
      purchase_contract_url: finalContract,
      purchase_invoice_url:  finalInvoice,
      insurance_file_url:    finalInsurance,
      ruhsat_url:            finalRuhsat,
      kasko:                 finalKasko,
    };

    const regOp = hasReg
      ? supabase.from('cars_registration').update(regData).eq('car_id', carId)
      : supabase.from('cars_registration').insert(regData);
    const { error: regErr } = await regOp;

    setSaving(false);
    if (regErr) { setFormError(regErr.message); return; }
    onSaved();
    onClose();
  };

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 600,
    color: '#374151', marginBottom: 5, letterSpacing: '0.1px',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', fontSize: 14,
    border: '1.5px solid #e5e7eb', borderRadius: 9, outline: 'none',
    color: '#0f1117', background: '#fff', boxSizing: 'border-box', fontFamily: 'inherit',
  };
  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer', appearance: 'none' };
  const rowStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };

  return ReactDOM.createPortal(
    <div
      onClick={handleBackdrop}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15,17,23,0.45)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, animation: 'fadeIn 160ms ease',
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 580,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 60px rgba(0,0,0,0.18)',
        animation: 'slideUp 200ms ease',
      }}>
        {/* Header */}
        <div style={{
          padding: '22px 24px 18px', borderBottom: '1px solid #f0f0f0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#0f1117', letterSpacing: '-0.3px' }}>Edit Car</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Update vehicle details and registration info</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '22px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {loadingData ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.7s linear infinite', color: '#4ba6ea' }}>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="28 56"/>
              </svg>
            </div>
          ) : (
            <>
              {/* Section 1 */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 14 }}>
                  Car Info
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={rowStyle}>
                    <div>
                      <label style={labelStyle}>Plate Number <span style={{ color: '#ef4444' }}>*</span></label>
                      <input type="text" value={plateNumber} onChange={e => setPlateNumber(e.target.value)} style={inputStyle} />
                    </div>
                  </div>
                  <div style={rowStyle}>
                    <div>
                      <label style={labelStyle}>Model Group</label>
                      <select value={modelGroupId} onChange={e => setModelGroupId(e.target.value)} style={selectStyle}>
                        <option value="">Select model group</option>
                        {modelGroups.map(mg => <option key={mg.id} value={String(mg.id)}>{mg.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Investor</label>
                      <select value={investorId} onChange={e => setInvestorId(e.target.value)} style={selectStyle}>
                        <option value="">Select investor</option>
                        {investors.map(inv => <option key={inv.id} value={String(inv.id)}>{inv.full_name}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: '#f0f0f0' }} />

              {/* Section 2 */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 14 }}>
                  Registration Info
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={rowStyle}>
                    <div>
                      <label style={labelStyle}>Manufacture Year</label>
                      <input type="number" value={manufactureYear} onChange={e => setManufactureYear(e.target.value)} placeholder="e.g. 2021" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Car Package</label>
                      <input type="text" value={carPackage} onChange={e => setCarPackage(e.target.value)} placeholder="e.g. Premium" style={inputStyle} />
                    </div>
                  </div>
                  <div style={rowStyle}>
                    <div>
                      <label style={labelStyle}>Insurance Expiry</label>
                      <input type="date" value={insuranceExpiry} onChange={e => setInsuranceExpiry(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Inspection Expiry</label>
                      <input type="date" value={inspectionExpiry} onChange={e => setInspectionExpiry(e.target.value)} style={inputStyle} />
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Purchase Date</label>
                    <input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} style={{ ...inputStyle, maxWidth: '50%' }} />
                  </div>
                  <PdfUploadField label="Purchase Contract" existingUrl={contractUrl}  file={contractFile}  onFileChange={setContractFile}  />
                  <PdfUploadField label="Purchase Invoice"  existingUrl={invoiceUrl}   file={invoiceFile}   onFileChange={setInvoiceFile}   />
                  <PdfUploadField label="Insurance File"    existingUrl={insuranceUrl} file={insuranceFile} onFileChange={setInsuranceFile} />
                  <div style={rowStyle}>
                    <PdfUploadField label="Ruhsat" existingUrl={ruhsatUrl} file={ruhsatFile} onFileChange={setRuhsatFile} />
                    <PdfUploadField label="Kasko"  existingUrl={kasko}     file={kaskoFile}  onFileChange={setKaskoFile}  />
                  </div>
                </div>
              </div>

              {/* Error */}
              {formError && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 9, padding: '10px 12px' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                    <circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.8"/>
                    <path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                  <span style={{ fontSize: 13, color: '#dc2626' }}>{formError}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 14, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loadingData}
            style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: saving ? '#93c5fd' : '#4ba6ea', fontSize: 14, fontWeight: 600, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, transition: 'background 150ms ease' }}
          >
            {saving && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.6s linear infinite' }}>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="28 56"/>
              </svg>
            )}
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const CarsPage: React.FC = () => {
  const [counts, setCounts]         = useState<CarStatusCounts | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [showAddCar, setShowAddCar] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [cars, setCars]             = useState<CarTableRow[]>([]);
  const [carsLoading, setCarsLoading] = useState(true);
  const [tableSearch, setTableSearch] = useState('');
  const [editingCarId, setEditingCarId] = useState<number | null>(null);
  const [sortCol,  setSortCol]  = useState<'plate_number' | 'model' | 'year' | 'current_km' | 'status' | null>(null);
  const [sortDir,  setSortDir]  = useState<'asc' | 'desc'>('asc');
  const [totalCars, setTotalCars] = useState(0);

  const handleSort = (col: 'plate_number' | 'model' | 'year' | 'current_km' | 'status') => {
    if (sortCol !== col) { setSortCol(col); setSortDir('asc'); }
    else if (sortDir === 'asc') { setSortDir('desc'); }
    else { setSortCol(null); setSortDir('asc'); }
  };

  useEffect(() => {
    let cancelled = false;

    const fetchCars = async () => {
      setLoading(true);
      setError(null);

      const [{ count, error: countError }, { data: availability, error: availError }] = await Promise.all([
        supabase.from('cars').select('*', { count: 'exact', head: true }),
        supabase.from('car_availability').select('status'),
      ]);

      if (cancelled) return;

      if (countError || availError) {
        setError((countError ?? availError)!.message);
        setLoading(false);
        return;
      }

      setTotalCars(count ?? 0);

      const working     = availability?.filter(c => c.status?.toLowerCase() === 'working').length     ?? 0;
      const parking     = availability?.filter(c => c.status?.toLowerCase() === 'parking').length     ?? 0;
      const maintenance = availability?.filter(c => c.status?.toLowerCase() === 'maintenance').length ?? 0;
      const selling     = availability?.filter(c => c.status?.toLowerCase() === 'selling').length     ?? 0;
      const replacement = availability?.filter(c => c.status?.toLowerCase() === 'replacement').length ?? 0;

      setCounts({ working, parking, maintenance, selling, replacement });
      setLoading(false);
    };

    fetchCars();
    return () => { cancelled = true; };
  }, [refreshKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCarsLoading(true);
      const [carsRes, trackingRes, registrationsRes, availabilityRes, modelGroupsRes] = await Promise.all([
        supabase.from('cars').select('id, plate_number, model_group_id').order('id', { ascending: false }),
        supabase.from('car_tracking').select('car_id, current_km, updated_at').order('updated_at', { ascending: false }),
        supabase.from('cars_registration').select('car_id, manufacture_year, purchase_contract_url, purchase_invoice_url, insurance_file_url, ruhsat_url, kasko'),
        supabase.from('car_availability').select('id, status'),
        supabase.from('model_group').select('id, name'),
      ]);
      if (cancelled) return;

      const rawCars        = (carsRes.data         ?? []) as { id: number; plate_number: string; model_group_id: number | null }[];
      const rawTracking    = (trackingRes.data      ?? []) as { car_id: number; current_km: number; updated_at: string }[];
      const rawRegs        = (registrationsRes.data ?? []) as { car_id: number; manufacture_year: number | null; purchase_contract_url: string | null; purchase_invoice_url: string | null; insurance_file_url: string | null; ruhsat_url: string | null; kasko: string | null }[];
      const rawAvailability= (availabilityRes.data  ?? []) as { id: number; status: string }[];
      const rawModels      = (modelGroupsRes.data   ?? []) as { id: number; name: string }[];

      // Deduplicate tracking — keep only the first (latest) record per car_id
      const seenCarIds = new Set<number>();
      const latestTracking = rawTracking.filter(t => {
        if (seenCarIds.has(t.car_id)) return false;
        seenCarIds.add(t.car_id);
        return true;
      });

      const combined: CarTableRow[] = rawCars.map(car => {
        const reg = rawRegs.find(r => r.car_id === car.id);
        return {
          id:            car.id,
          plate_number:  car.plate_number,
          model:         rawModels.find(m => m.id === car.model_group_id)?.name ?? '—',
          current_km:    latestTracking.find(t => t.car_id === car.id)?.current_km ?? '—',
          year:          reg?.manufacture_year ?? '—',
          status:        rawAvailability.find(a => a.id === car.id)?.status ?? '—',
          contract_url:  reg?.purchase_contract_url ?? null,
          invoice_url:   reg?.purchase_invoice_url ?? null,
          insurance_url: reg?.insurance_file_url ?? null,
          ruhsat_url:    reg?.ruhsat_url ?? null,
          kasko_url:     reg?.kasko ?? null,
        };
      });

      setCars(combined);
      setCarsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  const total = totalCars;

  const countFor = (key: StatCard['key']): number => {
    if (!counts) return 0;
    if (key === 'all') return total;
    return counts[key];
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)',
      padding: '44px 40px',
    }}>
      {/* Page header */}
      <div style={{ marginBottom: 36, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#4ba6ea',
            }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#4ba6ea', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
              Fleet Overview
            </span>
          </div>
          <h1 style={{
            fontSize: 30,
            fontWeight: 800,
            letterSpacing: '-0.8px',
            color: '#0f1117',
            marginBottom: 6,
            lineHeight: 1.1,
          }}>
            Cars
          </h1>
          <p style={{ fontSize: 15, color: '#6b7280', lineHeight: 1.5 }}>
            Real-time availability across all branches.
          </p>
        </div>
        <button
          onClick={() => setShowAddCar(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '10px 18px', borderRadius: 10, border: 'none',
            background: '#4ba6ea', color: '#fff',
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit', flexShrink: 0,
            boxShadow: '0 2px 8px rgba(75,166,234,0.35)',
            transition: 'background 150ms ease, box-shadow 150ms ease',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = '#2e8fd4';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 14px rgba(75,166,234,0.45)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = '#4ba6ea';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 2px 8px rgba(75,166,234,0.35)';
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
          Add Car
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: '#fff',
          border: '1px solid rgba(239,68,68,0.2)',
          borderLeft: '4px solid #ef4444',
          borderRadius: 12,
          padding: '14px 18px',
          marginBottom: 32,
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.8"/>
            <path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0f1117', marginBottom: 2 }}>Failed to load fleet data</div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>{error}</div>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        gap: 14,
        marginBottom: 36,
      }}>
        {loading
          ? CARDS.map(c => <SkeletonCard key={c.key} />)
          : CARDS.map(card => (
              <StatCardComponent
                key={card.key}
                card={card}
                count={countFor(card.key)}
                total={total}
              />
            ))
        }
      </div>

      {/* Alert sections */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#f97316', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
            Alerts
          </span>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 14,
        }}>
          <AlertSection
            viewName="upcoming_returns"
            title="Upcoming Returns"
            accentColor="#4ba6ea"
            icon={
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <path d="M3 10h13M3 10l4-4M3 10l4 4" stroke="#4ba6ea" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M21 14H8M21 14l-4-4M21 14l-4 4" stroke="#4ba6ea" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
          />
          <AlertSection
            viewName="upcoming_insurance"
            title="Insurance Expiry"
            accentColor="#f97316"
            icon={
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="#f97316" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
          />
          <AlertSection
            viewName="upcoming_inspection"
            title="Inspection Expiry"
            accentColor="#8b5cf6"
            icon={
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <path d="M9 11l3 3L22 4" stroke="#8b5cf6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="#8b5cf6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
          />
        </div>
      </div>

      {/* Fleet Table */}
      <div style={{ marginTop: 32 }}>
        {/* Section header + search */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ba6ea' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#4ba6ea', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
              All Vehicles
            </span>
          </div>
          {/* Search */}
          <div style={{ position: 'relative' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              placeholder="Search plate or model…"
              value={tableSearch}
              onChange={e => setTableSearch(e.target.value)}
              style={{
                paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
                fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 9,
                outline: 'none', color: '#0f1117', background: '#fff',
                width: 220, fontFamily: 'inherit',
              }}
            />
          </div>
        </div>

        {/* Table card */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f0f0f0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr>
                  {([
                    { label: 'Plate Number', col: 'plate_number' },
                    { label: 'Model',        col: 'model'        },
                    { label: 'Year',         col: 'year'         },
                    { label: 'Current KM',   col: 'current_km'   },
                    { label: 'Status',       col: 'status'       },
                  ] as const).map(({ label, col }) => {
                    const active = sortCol === col;
                    return (
                      <th
                        key={col}
                        onClick={() => handleSort(col)}
                        style={{
                          padding: '9px 14px', fontSize: 11, fontWeight: 700,
                          color: active ? '#4ba6ea' : '#9ca3af',
                          textTransform: 'uppercase', letterSpacing: '0.7px',
                          textAlign: 'left', background: '#fff',
                          borderBottom: '1.5px solid #f0f0f0',
                          whiteSpace: 'nowrap', userSelect: 'none',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={e => { if (!active) (e.currentTarget as HTMLTableCellElement).style.color = '#6b7280'; }}
                        onMouseLeave={e => { if (!active) (e.currentTarget as HTMLTableCellElement).style.color = '#9ca3af'; }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {label}
                          {active ? (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                              {sortDir === 'asc'
                                ? <path d="M12 19V5M5 12l7-7 7 7" stroke="#4ba6ea" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                                : <path d="M12 5v14M5 12l7 7 7-7" stroke="#4ba6ea" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                              }
                            </svg>
                          ) : (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ opacity: 0 }} className="sort-hint">
                              <path d="M12 5v14M7 9l5-5 5 5M7 15l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </span>
                      </th>
                    );
                  })}
                  {([
                    { key: 'contract_url',  label: 'Contract'  },
                    { key: 'invoice_url',   label: 'Invoice'   },
                    { key: 'insurance_url', label: 'Insurance' },
                    { key: 'ruhsat_url',    label: 'Ruhsat'    },
                    { key: 'kasko_url',     label: 'Kasko'     },
                  ] as const).map(col => {
                    const have = cars.filter(c => !!c[col.key]).length;
                    const tot  = cars.length;
                    return (
                      <th key={col.key} style={{
                        padding: '9px 14px', fontSize: 11, fontWeight: 700,
                        color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px',
                        textAlign: 'center', background: '#fff',
                        borderBottom: '1.5px solid #f0f0f0',
                        whiteSpace: 'nowrap', userSelect: 'none',
                      }}>
                        <div>{col.label}</div>
                        {!carsLoading && tot > 0 && (
                          <div style={{ fontSize: 10, fontWeight: 500, color: '#c0c4cc', marginTop: 1, letterSpacing: 0 }}>
                            ({have}/{tot})
                          </div>
                        )}
                      </th>
                    );
                  })}
                  <th style={{
                    padding: '9px 14px', fontSize: 11, fontWeight: 700,
                    color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px',
                    textAlign: 'center', background: '#fff',
                    borderBottom: '1.5px solid #f0f0f0',
                    whiteSpace: 'nowrap', userSelect: 'none',
                  }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {carsLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 11 }).map((__, j) => (
                        <td key={j} style={{ padding: '12px 14px' }}>
                          <div style={{ height: 14, borderRadius: 6, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite', width: j === 0 ? '80px' : j >= 5 ? '20px' : '60%', margin: j >= 5 ? '0 auto' : undefined }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (() => {
                  const q = tableSearch.trim().toLowerCase();
                  const filtered = cars.filter(car => {
                    if (!q) return true;
                    return car.plate_number.toLowerCase().includes(q) || car.model.toLowerCase().includes(q);
                  });

                  if (sortCol) {
                    filtered.sort((a, b) => {
                      let av: string | number;
                      let bv: string | number;
                      if (sortCol === 'year' || sortCol === 'current_km') {
                        av = a[sortCol] === '—' ? 0 : Number(a[sortCol]);
                        bv = b[sortCol] === '—' ? 0 : Number(b[sortCol]);
                      } else {
                        av = String(a[sortCol]).toLowerCase();
                        bv = String(b[sortCol]).toLowerCase();
                      }
                      if (av < bv) return sortDir === 'asc' ? -1 : 1;
                      if (av > bv) return sortDir === 'asc' ? 1 : -1;
                      return 0;
                    });
                  }

                  if (filtered.length === 0) {
                    return (
                      <tr>
                        <td colSpan={11} style={{ padding: '36px 14px', textAlign: 'center', fontSize: 13, color: '#9ca3af' }}>
                          {tableSearch ? 'No cars match your search.' : 'No cars found.'}
                        </td>
                      </tr>
                    );
                  }

                  return filtered.map((car, idx) => (
                    <tr key={car.plate_number + idx} style={{ borderTop: idx === 0 ? 'none' : '1px solid #f7f7f7' }}>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#0f1117', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.3px' }}>
                          {car.plate_number}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 13, color: '#374151' }}>
                        {car.model}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 13, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>
                        {car.year}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 13, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>
                        {car.current_km !== '—' ? Number(car.current_km).toLocaleString() + ' km' : '—'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {car.status && car.status !== '—' ? <CarStatusBadge status={car.status} /> : <span style={{ fontSize: 12, color: '#9ca3af' }}>—</span>}
                      </td>
                      {([car.contract_url, car.invoice_url, car.insurance_url, car.ruhsat_url, car.kasko_url] as (string | null)[]).map((url, di) => (
                        <td key={di} style={{ padding: '12px 14px', textAlign: 'center' }}>
                          {url ? (
                            <a href={url} target="_blank" rel="noreferrer" title="Open document" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#4ba6ea' }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" opacity="0.15"/>
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="#4ba6ea" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M14 2v6h6" stroke="#4ba6ea" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M9 13h6M9 17h4" stroke="#4ba6ea" strokeWidth="1.4" strokeLinecap="round"/>
                              </svg>
                            </a>
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#d1d5db' }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M9 13h6M9 17h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                              </svg>
                            </span>
                          )}
                        </td>
                      ))}
                      {/* Actions */}
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        <button
                          onClick={() => setEditingCarId(car.id)}
                          title="Edit car"
                          style={{
                            width: 30, height: 30, borderRadius: 7, border: '1px solid #e5e7eb',
                            background: '#fff', cursor: 'pointer', display: 'inline-flex',
                            alignItems: 'center', justifyContent: 'center', color: '#9ca3af',
                            transition: 'all 140ms ease',
                          }}
                          onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#4ba6ea'; b.style.color = '#4ba6ea'; b.style.background = 'rgba(75,166,234,0.06)'; }}
                          onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#e5e7eb'; b.style.color = '#9ca3af'; b.style.background = '#fff'; }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
        th:hover .sort-hint { opacity: 0.4 !important; }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {showAddCar && (
        <AddCarModal
          onClose={() => setShowAddCar(false)}
          onAdded={() => setRefreshKey(k => k + 1)}
        />
      )}
      {editingCarId !== null && (
        <EditCarModal
          carId={editingCarId}
          onClose={() => setEditingCarId(null)}
          onSaved={() => { setEditingCarId(null); setRefreshKey(k => k + 1); }}
        />
      )}
    </div>
  );
};

export default CarsPage;
