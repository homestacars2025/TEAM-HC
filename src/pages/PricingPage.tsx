import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useCurrency } from '../lib/CurrencyContext';
import ReactDOM from 'react-dom';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExchangeRate {
  id: number;
  currency: string;
  rate_to_try: number;
  updated_at: string;
}

interface PricingTier {
  id: number;
  car_id: number | null;
  min_days: number;
  max_days: number;
  discount_percent: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface ModelGroup {
  id: number;
  name: string;
  brand: string;
  model: string;
  transmission: string;
  fuel: string;
  seats: number;
  luggage: number | null;
  category: string;
  daily_km: number | null;
  monthly_km: number | null;
  deposit: number | null;
  min_age: number | null;
  created_at: string;
  image_url: string | null;
  total_cars: number;
  price: number;
}

interface AddTierForm {
  min_days: string;
  max_days: string;
  discount_percent: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TIER_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const CURRENCY_FLAG: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵',
  CHF: '🇨🇭', AED: '🇦🇪', SAR: '🇸🇦', RUB: '🇷🇺',
};

const CURRENCY_NAME: Record<string, string> = {
  USD: 'US Dollar', EUR: 'Euro', GBP: 'British Pound', JPY: 'Japanese Yen',
  CHF: 'Swiss Franc', AED: 'UAE Dirham', SAR: 'Saudi Riyal', RUB: 'Russian Ruble',
};

// ─── Toast ────────────────────────────────────────────────────────────────────

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

// ─── Field style ──────────────────────────────────────────────────────────────

const FIELD_STYLE: React.CSSProperties = {
  width: '100%', height: 40, padding: '0 12px',
  fontSize: 14, color: '#0f1117',
  background: '#fff', border: '1.5px solid #e5e7eb',
  borderRadius: 8, outline: 'none', fontFamily: 'inherit',
  boxSizing: 'border-box', transition: 'border-color 150ms ease',
};

// ─── Section header ───────────────────────────────────────────────────────────

const SectionHeader: React.FC<{ title: string; subtitle: string; action?: React.ReactNode }> = ({ title, subtitle, action }) => (
  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
    <div>
      <div style={{ fontSize: 17, fontWeight: 700, color: '#0f1117', letterSpacing: '-0.3px' }}>{title}</div>
      <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>{subtitle}</div>
    </div>
    {action}
  </div>
);

// ─── Section 1: Exchange Rate Card ────────────────────────────────────────────

const ExchangeRateCard: React.FC<{
  rate: ExchangeRate;
  onSaved: (id: number, newRate: number) => void;
}> = ({ rate, onSaved }) => {
  const [editing,  setEditing]  = useState(false);
  const [value,    setValue]    = useState(String(rate.rate_to_try));
  const [saving,   setSaving]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(String(rate.rate_to_try));
  }, [rate.rate_to_try]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const save = useCallback(async () => {
    const parsed = parseFloat(value.replace(',', '.'));
    if (isNaN(parsed) || parsed <= 0) {
      setValue(String(rate.rate_to_try));
      setEditing(false);
      return;
    }
    if (parsed === rate.rate_to_try) { setEditing(false); return; }
    setSaving(true);
    const { error } = await supabase
      .from('exchange_rates')
      .update({ rate_to_try: parsed, updated_at: new Date().toISOString() })
      .eq('id', rate.id);
    setSaving(false);
    if (!error) onSaved(rate.id, parsed);
    setEditing(false);
  }, [value, rate, onSaved]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter')  save();
    if (e.key === 'Escape') { setValue(String(rate.rate_to_try)); setEditing(false); }
  };

  const flag = CURRENCY_FLAG[rate.currency] ?? '🌐';
  const name = CURRENCY_NAME[rate.currency] ?? rate.currency;

  return (
    <div style={{
      background: '#fff', borderRadius: 14, padding: '18px 20px',
      border: '1px solid #f0f0f0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      transition: 'transform 180ms ease, box-shadow 180ms ease',
      position: 'relative', overflow: 'hidden',
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 24px rgba(75,166,234,0.10)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'; }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#4ba6ea', borderRadius: '14px 14px 0 0' }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 22 }}>{flag}</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f1117' }}>{rate.currency}</div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>{name}</div>
        </div>
      </div>

      {/* Rate — inline editable */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>
          Rate to TRY
        </div>
        {editing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              ref={inputRef}
              type="number"
              step="0.0001"
              min="0"
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={save}
              style={{
                width: '100%', height: 36, padding: '0 10px',
                fontSize: 20, fontWeight: 700, color: '#0f1117',
                background: '#f9fafb', border: '1.5px solid #4ba6ea',
                borderRadius: 8, outline: 'none', fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
            {saving && (
              <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #e5e7eb', borderTopColor: '#4ba6ea', animation: 'spin 600ms linear infinite', flexShrink: 0 }} />
            )}
          </div>
        ) : (
          <div
            onClick={() => setEditing(true)}
            title="Click to edit"
            style={{
              fontSize: 26, fontWeight: 800, color: '#0f1117', letterSpacing: '-0.5px',
              cursor: 'text', display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '2px 4px', borderRadius: 6, margin: '-2px -4px',
              transition: 'background 120ms ease',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = '#f3f4f6'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
          >
            {rate.rate_to_try.toFixed(4)}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ color: '#9ca3af', flexShrink: 0, marginBottom: 4 }}>
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
      </div>

      {/* Updated */}
      <div style={{ fontSize: 11, color: '#c0c4cc' }}>
        Updated {timeAgo(rate.updated_at)}
      </div>
    </div>
  );
};

// ─── Section 2: Add Tier Modal ────────────────────────────────────────────────

const AddTierModal: React.FC<{
  onClose: () => void;
  onAdded: () => void;
}> = ({ onClose, onAdded }) => {
  const [form, setForm] = useState<AddTierForm>({ min_days: '', max_days: '', discount_percent: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const set = (k: keyof AddTierForm, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const min = parseInt(form.min_days, 10);
    const max = parseInt(form.max_days, 10);
    const disc = parseFloat(form.discount_percent);
    if (isNaN(min) || isNaN(max) || isNaN(disc)) { setErr('All fields are required.'); return; }
    if (min < 1 || max < min) { setErr('Max days must be ≥ min days.'); return; }
    if (disc < 0 || disc > 100) { setErr('Discount must be between 0 and 100.'); return; }
    setErr(null);
    setSaving(true);
    const { error } = await supabase.from('car_pricing_tiers').insert({
      car_id: null, min_days: min, max_days: max,
      discount_percent: disc, is_active: true,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onAdded();
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
        background: '#fff', borderRadius: 18, width: '100%', maxWidth: 420,
        boxShadow: '0 24px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)',
        animation: 'slideUp 180ms ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid #f3f4f6' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f1117', letterSpacing: '-0.3px' }}>Add Discount Tier</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Define a new duration-based discount</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#e5e7eb'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f3f4f6'; }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                Min Days <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input type="number" min="1" required value={form.min_days} onChange={e => set('min_days', e.target.value)} style={FIELD_STYLE}
                onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
                onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                Max Days <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input type="number" min="1" required value={form.max_days} onChange={e => set('max_days', e.target.value)} style={FIELD_STYLE}
                onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
                onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }} />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                Discount (%) <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input type="number" min="0" max="100" step="0.01" required value={form.discount_percent}
                  onChange={e => set('discount_percent', e.target.value)}
                  style={{ ...FIELD_STYLE, paddingRight: 32 }}
                  onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
                  onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }} />
                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: 14, pointerEvents: 'none' }}>%</span>
              </div>
            </div>
          </div>

          {err && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, padding: '10px 14px', background: '#fef2f2', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.8" /><path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" /></svg>
              <span style={{ fontSize: 13, color: '#ef4444' }}>{err}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, paddingTop: 18, borderTop: '1px solid #f3f4f6' }}>
            <button type="button" onClick={onClose}
              style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', fontSize: 14, fontWeight: 500, color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#9ca3af'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; }}>
              Cancel
            </button>
            <button type="submit" disabled={saving}
              style={{ padding: '9px 22px', borderRadius: 9, border: 'none', background: saving ? '#a8d4f5' : '#4ba6ea', color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'background 150ms ease' }}
              onMouseEnter={e => { if (!saving) (e.currentTarget as HTMLButtonElement).style.background = '#2e8fd4'; }}
              onMouseLeave={e => { if (!saving) (e.currentTarget as HTMLButtonElement).style.background = '#4ba6ea'; }}>
              {saving ? 'Adding…' : 'Add Tier'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

// ─── Section 2: Tier Row ──────────────────────────────────────────────────────

const TierRow: React.FC<{
  tier: PricingTier;
  label: string;
  isEven: boolean;
  onDeleted: () => void;
  onUpdated: (id: number, discount: number) => void;
  showToast: (msg: string, type: 'success' | 'error') => void;
}> = ({ tier, label, isEven, onDeleted, onUpdated, showToast }) => {
  const [editing,   setEditing]   = useState(false);
  const [editVal,   setEditVal]   = useState(String(tier.discount_percent));
  const [saving,    setSaving]    = useState(false);
  const [deleting,  setDeleting]  = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const saveDiscount = useCallback(async () => {
    const parsed = parseFloat(editVal);
    if (isNaN(parsed) || parsed < 0 || parsed > 100) {
      setEditVal(String(tier.discount_percent));
      setEditing(false);
      return;
    }
    if (parsed === tier.discount_percent) { setEditing(false); return; }
    setSaving(true);
    const { error } = await supabase
      .from('car_pricing_tiers')
      .update({ discount_percent: parsed, updated_at: new Date().toISOString() })
      .eq('id', tier.id);
    setSaving(false);
    if (error) { showToast('Failed to update tier.', 'error'); setEditing(false); return; }
    onUpdated(tier.id, parsed);
    showToast('Tier updated.', 'success');
    setEditing(false);
  }, [editVal, tier, onUpdated, showToast]);

  const handleDelete = async () => {
    setDeleting(true);
    const { error } = await supabase.from('car_pricing_tiers').delete().eq('id', tier.id);
    if (error) { showToast('Failed to delete tier.', 'error'); setDeleting(false); return; }
    onDeleted();
    showToast('Tier deleted.', 'success');
  };

  const TIER_COLORS: Record<string, { color: string; bg: string }> = {
    A: { color: '#4ba6ea', bg: 'rgba(75,166,234,0.12)' },
    B: { color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
    C: { color: '#f97316', bg: 'rgba(249,115,22,0.12)' },
    D: { color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
    E: { color: '#ec4899', bg: 'rgba(236,72,153,0.12)' },
    F: { color: '#06b6d4', bg: 'rgba(6,182,212,0.12)' },
  };
  const tierColor = TIER_COLORS[label] ?? { color: '#6b7280', bg: 'rgba(107,114,128,0.12)' };

  return (
    <tr style={{ background: isEven ? '#fafafa' : '#fff', transition: 'background 100ms ease' }}
      onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(75,166,234,0.03)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = isEven ? '#fafafa' : '#fff'; }}>

      {/* Tier label */}
      <td style={{ padding: '11px 16px' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 28, height: 28, borderRadius: 8,
          background: tierColor.bg, color: tierColor.color,
          fontSize: 12, fontWeight: 800, letterSpacing: '0.2px',
        }}>
          {label}
        </span>
      </td>

      {/* Duration */}
      <td style={{ padding: '11px 12px' }}>
        <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>
          {tier.min_days} – {tier.max_days} days
        </span>
      </td>

      {/* Discount — inline editable */}
      <td style={{ padding: '11px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {editing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ position: 'relative' }}>
                <input
                  ref={inputRef}
                  type="number" min="0" max="100" step="0.01"
                  value={editVal}
                  onChange={e => setEditVal(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveDiscount();
                    if (e.key === 'Escape') { setEditVal(String(tier.discount_percent)); setEditing(false); }
                  }}
                  onBlur={saveDiscount}
                  style={{
                    width: 80, height: 32, padding: '0 24px 0 10px',
                    fontSize: 13, fontWeight: 700, color: '#0f1117',
                    background: '#fff', border: '1.5px solid #4ba6ea',
                    borderRadius: 7, outline: 'none', fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                />
                <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#9ca3af', pointerEvents: 'none' }}>%</span>
              </div>
              {saving && <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #e5e7eb', borderTopColor: '#4ba6ea', animation: 'spin 600ms linear infinite' }} />}
            </div>
          ) : (
            <>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0f1117' }}>
                {tier.discount_percent}%
              </span>
              {tier.discount_percent > 0 && (
                <span style={{
                  fontSize: 10.5, fontWeight: 700,
                  color: '#22c55e', background: 'rgba(34,197,94,0.10)',
                  borderRadius: 20, padding: '2px 8px',
                }}>
                  Save {tier.discount_percent}%
                </span>
              )}
            </>
          )}
        </div>
      </td>

      {/* Actions */}
      <td style={{ padding: '11px 16px 11px 12px', textAlign: 'right' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          {!editing && (
            <ActionIconBtn onClick={() => { setEditVal(String(tier.discount_percent)); setEditing(true); }} title="Edit discount" hoverColor="#4ba6ea">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </ActionIconBtn>
          )}
          <ActionIconBtn onClick={handleDelete} title="Delete tier" hoverColor="#ef4444" disabled={deleting}>
            {deleting
              ? <div style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid #e5e7eb', borderTopColor: '#ef4444', animation: 'spin 600ms linear infinite' }} />
              : <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <path d="M3 6h18M19 6l-1 14H6L5 6M10 6V4h4v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            }
          </ActionIconBtn>
        </div>
      </td>
    </tr>
  );
};

// Small action icon button
const ActionIconBtn: React.FC<{ onClick: () => void; title: string; hoverColor: string; children: React.ReactNode; disabled?: boolean }> = ({
  onClick, title, hoverColor, children, disabled = false,
}) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button onClick={e => { e.stopPropagation(); if (!disabled) onClick(); }} title={title}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        width: 30, height: 30, borderRadius: 7, border: 'none',
        background: hovered && !disabled ? `${hoverColor}18` : 'transparent',
        color: hovered && !disabled ? hoverColor : '#9ca3af',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 140ms ease', flexShrink: 0, opacity: disabled ? 0.5 : 1,
      }}>
      {children}
    </button>
  );
};

// ─── Section 3: Model Pricing Card ────────────────────────────────────────────

const ModelPricingCard: React.FC<{
  model: ModelGroup;
  tiers: PricingTier[];
  onPriceUpdate: (modelId: number, newPrice: number) => void;
}> = ({ model, tiers, onPriceUpdate }) => {

  const [imgError, setImgError] = useState(false);
  const { fmtUSD } = useCurrency();
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceInput, setPriceInput] = useState('');
  const [savingPrice, setSavingPrice] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const priceInputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setPriceInput(String(model.price));
    setEditingPrice(true);
    setTimeout(() => priceInputRef.current?.select(), 0);
  };

  const cancelEdit = () => {
    setEditingPrice(false);
    setPriceInput('');
  };

  const savePrice = async () => {
    const parsed = parseFloat(priceInput);
    if (isNaN(parsed) || parsed <= 0) { cancelEdit(); return; }
    if (parsed === model.price) { cancelEdit(); return; }
    setSavingPrice(true);
    const { error } = await supabase
      .from('model_group')
      .update({ price: parsed })
      .eq('id', model.id);
    setSavingPrice(false);
    if (!error) {
      onPriceUpdate(model.id, parsed);
      setEditingPrice(false);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
    }
  };

  const TIER_LABELS_LOCAL = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const TIER_COLORS: Record<string, string> = {
    A: '#4ba6ea', B: '#22c55e', C: '#f97316', D: '#8b5cf6', E: '#ec4899', F: '#06b6d4',
  };

  return (
    <div style={{
      background: '#fff', borderRadius: 14, border: '1px solid #f0f0f0',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden',
      transition: 'transform 180ms ease, box-shadow 180ms ease',
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.10)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'; }}
    >
      {/* Image */}
      <div style={{ height: 140, background: '#f3f4f6', position: 'relative', overflow: 'hidden' }}>
        {model.image_url && !imgError ? (
          <img src={model.image_url} alt={model.name} onError={() => setImgError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
              <path d="M5 17H3a2 2 0 01-2-2V7a2 2 0 012-2h11a2 2 0 012 2v3" stroke="#d1d5db" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="9" y="11" width="14" height="10" rx="2" stroke="#d1d5db" strokeWidth="1.6" />
              <circle cx="12" cy="16" r="1" fill="#d1d5db" />
              <circle cx="20" cy="16" r="1" fill="#d1d5db" />
            </svg>
          </div>
        )}
        {/* Units badge */}
        <div style={{
          position: 'absolute', top: 10, right: 10,
          background: 'rgba(15,17,23,0.65)', backdropFilter: 'blur(4px)',
          borderRadius: 8, padding: '3px 8px',
          fontSize: 11, fontWeight: 700, color: '#fff',
        }}>
          {model.total_cars} units
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: '14px 16px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f1117', marginBottom: 2 }}>{model.name}</div>
        <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>{model.brand} · {model.model}</div>

        {/* Base price */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 12px', background: '#f9fafb', borderRadius: 9,
          marginBottom: tiers.length > 0 ? 10 : 0,
        }}>
          <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>Base / day</span>
          {editingPrice ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#6b7280' }}>$</span>
              <input
                ref={priceInputRef}
                type="number"
                step="0.01"
                min="0"
                value={priceInput}
                onChange={e => setPriceInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') savePrice();
                  if (e.key === 'Escape') cancelEdit();
                }}
                style={{
                  width: 72, padding: '3px 6px', fontSize: 14, fontWeight: 700,
                  border: '1.5px solid #4ba6ea', borderRadius: 6, outline: 'none',
                  color: '#0f1117', textAlign: 'right', background: '#fff',
                }}
              />
              {/* Confirm */}
              <button
                onClick={savePrice}
                disabled={savingPrice}
                title="Save"
                style={{
                  width: 24, height: 24, borderRadius: 6, border: 'none',
                  background: '#4ba6ea', color: '#fff', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                }}
              >
                {savingPrice ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.6s linear infinite' }}>
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="28 56" />
                  </svg>
                ) : (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
              {/* Cancel */}
              <button
                onClick={cancelEdit}
                title="Cancel"
                style={{
                  width: 24, height: 24, borderRadius: 6, border: '1px solid #e5e7eb',
                  background: '#fff', color: '#9ca3af', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {savedOk && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M5 13l4 4L19 7" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
              <span style={{ fontSize: 16, fontWeight: 800, color: '#0f1117', letterSpacing: '-0.3px' }}>
                {fmtUSD(model.price)}
              </span>
              <button
                onClick={startEdit}
                title="Edit base price (USD)"
                style={{
                  width: 22, height: 22, borderRadius: 5, border: '1px solid #e5e7eb',
                  background: '#fff', color: '#9ca3af', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                  flexShrink: 0,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#4ba6ea'; (e.currentTarget as HTMLButtonElement).style.color = '#4ba6ea'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af'; }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Tier breakdown */}
        {tiers.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {tiers.map((tier, i) => {
              const label = TIER_LABELS_LOCAL[i] ?? String(i + 1);
              const color = TIER_COLORS[label] ?? '#6b7280';
              const discountedDaily = model.price * (1 - tier.discount_percent / 100);
              const totalMin = discountedDaily * tier.min_days;

              return (
                <div key={tier.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 10px', borderRadius: 8,
                  border: `1px solid ${color}22`,
                  background: `${color}08`,
                }}>
                  {/* Tier badge */}
                  <span style={{
                    width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: `${color}20`, color,
                    fontSize: 10, fontWeight: 800,
                  }}>
                    {label}
                  </span>

                  {/* Duration */}
                  <span style={{ fontSize: 11, color: '#6b7280', flex: 1, whiteSpace: 'nowrap' }}>
                    {tier.min_days}–{tier.max_days}d
                  </span>

                  {/* Discount badge */}
                  {tier.discount_percent > 0 && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, color: '#22c55e',
                      background: 'rgba(34,197,94,0.12)', borderRadius: 20, padding: '1px 6px',
                      flexShrink: 0,
                    }}>
                      -{tier.discount_percent}%
                    </span>
                  )}

                  {/* Per day price */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0f1117' }}>
                      {fmtUSD(discountedDaily)}/d
                    </div>
                    <div style={{ fontSize: 10, color: '#9ca3af' }}>
                      {fmtUSD(totalMin)} total
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// Table header cell
const Th: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = ({ children, style, ...rest }) => (
  <th style={{
    padding: '9px 12px', fontSize: 11, fontWeight: 700,
    color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px',
    textAlign: 'left', background: '#fff',
    borderBottom: '1.5px solid #f0f0f0',
    position: 'sticky', top: 0, zIndex: 1,
    whiteSpace: 'nowrap', userSelect: 'none',
    ...style,
  }} {...rest}>
    {children}
  </th>
);

// ─── Main Page ────────────────────────────────────────────────────────────────

const PricingPage: React.FC = () => {
  const [rates,       setRates]       = useState<ExchangeRate[]>([]);
  const [tiers,       setTiers]       = useState<PricingTier[]>([]);
  const [models,      setModels]      = useState<ModelGroup[]>([]);
  const [loadingRates,  setLoadingRates]  = useState(true);
  const [loadingTiers,  setLoadingTiers]  = useState(true);
  const [loadingModels, setLoadingModels] = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [modelSearch, setModelSearch] = useState('');
  const [showAddTier, setShowAddTier] = useState(false);
  const [toast,       setToast]       = useState<ToastState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  // ── Fetch functions ──────────────────────────────────────────────────────────

  const fetchRates = useCallback(async () => {
    setLoadingRates(true);
    const { data, error: err } = await supabase
      .from('exchange_rates')
      .select('id, currency, rate_to_try, updated_at')
      .order('currency');
    if (err) { setError(err.message); setLoadingRates(false); return; }
    setRates((data as ExchangeRate[]) ?? []);
    setLoadingRates(false);
  }, []);

  const fetchTiers = useCallback(async () => {
    setLoadingTiers(true);
    const { data, error: err } = await supabase
      .from('car_pricing_tiers')
      .select('id, car_id, min_days, max_days, discount_percent, is_active, created_at, updated_at')
      .order('min_days', { ascending: true });
    if (err) { setError(err.message); setLoadingTiers(false); return; }
    setTiers((data as PricingTier[]) ?? []);
    setLoadingTiers(false);
  }, []);

  const fetchModels = useCallback(async () => {
    setLoadingModels(true);
    const { data, error: err } = await supabase
      .from('model_group')
      .select('id, name, brand, model, transmission, fuel, seats, luggage, category, daily_km, monthly_km, deposit, min_age, created_at, image_url, total_cars, price')
      .order('name');
    if (err) { setError(err.message); setLoadingModels(false); return; }
    setModels((data as ModelGroup[]) ?? []);
    setLoadingModels(false);
  }, []);

  useEffect(() => {
    fetchRates();
    fetchTiers();
    fetchModels();
  }, [fetchRates, fetchTiers, fetchModels]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleRateSaved = useCallback((id: number, newRate: number) => {
    setRates(prev => prev.map(r => r.id === id ? { ...r, rate_to_try: newRate, updated_at: new Date().toISOString() } : r));
    showToast('Exchange rate updated.', 'success');
  }, [showToast]);

  const filteredModels = models.filter(m =>
    !modelSearch.trim() || m.name.toLowerCase().includes(modelSearch.toLowerCase())
  );

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)', padding: '44px 40px' }}>
      <style>{`
        @keyframes pulse     { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes slideUpIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideUp   { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn    { from{opacity:0} to{opacity:1} }
        @keyframes spin      { to{transform:rotate(360deg)} }
      `}</style>

      {/* Page header */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ba6ea' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: '1px', textTransform: 'uppercase' }}>
            Operations
          </span>
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 800, color: '#0f1117', letterSpacing: '-0.8px', margin: 0 }}>
          Pricing
        </h1>
        <p style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>
          Manage exchange rates, discount tiers, and model pricing
        </p>
      </div>

      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 12, padding: '12px 16px', marginBottom: 28,
          display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#ef4444',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.8" /><path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" /></svg>
          {error}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          Section 1: Exchange Rates
      ════════════════════════════════════════════════════════════════════════ */}
      <div style={{ marginBottom: 40 }}>
        <SectionHeader
          title="Exchange Rates"
          subtitle="Click any rate value to edit it inline"
          action={
            <button
              onClick={fetchRates}
              disabled={loadingRates}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                height: 36, padding: '0 14px', borderRadius: 9,
                border: '1.5px solid #e5e7eb', background: '#fff',
                fontSize: 13, fontWeight: 600, color: '#374151',
                cursor: loadingRates ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', transition: 'all 140ms ease',
                opacity: loadingRates ? 0.6 : 1,
              }}
              onMouseEnter={e => { if (!loadingRates) { (e.currentTarget as HTMLButtonElement).style.borderColor = '#4ba6ea'; (e.currentTarget as HTMLButtonElement).style.color = '#4ba6ea'; } }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; (e.currentTarget as HTMLButtonElement).style.color = '#374151'; }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ animation: loadingRates ? 'spin 800ms linear infinite' : 'none' }}>
                <path d="M23 4v6h-6M1 20v-6h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {loadingRates ? 'Refreshing…' : 'Refresh'}
            </button>
          }
        />

        {loadingRates ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{ background: '#fff', borderRadius: 14, padding: '18px 20px', border: '1px solid #f0f0f0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div style={{ width: 80, height: 14, borderRadius: 6, background: '#f3f4f6', marginBottom: 14, animation: 'pulse 1.5s ease-in-out infinite' }} />
                <div style={{ width: '100%', height: 30, borderRadius: 6, background: '#f3f4f6', marginBottom: 10, animation: 'pulse 1.5s ease-in-out infinite' }} />
                <div style={{ width: 60, height: 11, borderRadius: 5, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
              </div>
            ))}
          </div>
        ) : rates.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 14, padding: '32px 24px', textAlign: 'center', border: '1px solid #f0f0f0', color: '#9ca3af', fontSize: 14 }}>
            No exchange rates found.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
            {rates.map(rate => (
              <ExchangeRateCard key={rate.id} rate={rate} onSaved={handleRateSaved} />
            ))}
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          Section 2: Discount Tiers
      ════════════════════════════════════════════════════════════════════════ */}
      <div style={{ marginBottom: 40 }}>
        <SectionHeader
          title="Discount Tiers"
          subtitle="Duration-based discounts applied to all model groups"
          action={
            <button
              onClick={() => setShowAddTier(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                height: 36, padding: '0 14px', borderRadius: 9,
                border: 'none', background: '#4ba6ea', color: '#fff',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit', transition: 'background 140ms ease',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#2e8fd4'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#4ba6ea'; }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
              Add Tier
            </button>
          }
        />

        <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0' }}>
          {loadingTiers ? (
            <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ height: 16, background: '#f3f4f6', borderRadius: 6, animation: 'pulse 1.5s ease-in-out infinite', width: `${60 + i * 10}%` }} />
              ))}
            </div>
          ) : tiers.length === 0 ? (
            <div style={{ padding: '32px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
              No discount tiers yet. Add your first tier.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <Th style={{ width: 60 }}>Tier</Th>
                  <Th>Duration Range</Th>
                  <Th>Discount</Th>
                  <Th style={{ textAlign: 'right' }}>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((tier, idx) => (
                  <TierRow
                    key={tier.id}
                    tier={tier}
                    label={TIER_LABELS[idx] ?? String(idx + 1)}
                    isEven={idx % 2 !== 0}
                    onDeleted={fetchTiers}
                    onUpdated={(id, disc) => setTiers(prev => prev.map(t => t.id === id ? { ...t, discount_percent: disc } : t))}
                    showToast={showToast}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          Section 3: Model Pricing
      ════════════════════════════════════════════════════════════════════════ */}
      <div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#0f1117', letterSpacing: '-0.3px' }}>Model Pricing</div>
            <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>
              Base price in USD · converted using live exchange rates
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Search */}
            <div style={{ position: 'relative' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }}>
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
                <path d="M20 20l-3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                placeholder="Search models…"
                value={modelSearch}
                onChange={e => setModelSearch(e.target.value)}
                style={{
                  height: 36, paddingLeft: 30, paddingRight: 12, width: 180,
                  fontSize: 13, color: '#0f1117', background: '#fff',
                  border: '1.5px solid #e5e7eb', borderRadius: 9, outline: 'none',
                  fontFamily: 'inherit', boxSizing: 'border-box', transition: 'border-color 150ms ease',
                }}
                onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
                onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }}
              />
            </div>

          </div>
        </div>

        {loadingModels ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', border: '1px solid #f0f0f0' }}>
                <div style={{ height: 140, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
                <div style={{ padding: '14px 16px' }}>
                  <div style={{ width: '60%', height: 14, borderRadius: 5, background: '#f3f4f6', marginBottom: 8, animation: 'pulse 1.5s ease-in-out infinite' }} />
                  <div style={{ width: '40%', height: 11, borderRadius: 5, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
                </div>
              </div>
            ))}
          </div>
        ) : filteredModels.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 14, padding: '40px 24px', textAlign: 'center', border: '1px solid #f0f0f0', color: '#9ca3af', fontSize: 14 }}>
            {modelSearch ? 'No models match your search.' : 'No model groups found.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {filteredModels.map(model => (
              <ModelPricingCard
                key={model.id}
                model={model}
                tiers={tiers}
                onPriceUpdate={(id, newPrice) =>
                  setModels(prev => prev.map(m => m.id === id ? { ...m, price: newPrice } : m))
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showAddTier && (
        <AddTierModal
          onClose={() => setShowAddTier(false)}
          onAdded={() => { fetchTiers(); showToast('Tier added successfully.', 'success'); }}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
};

export default PricingPage;
