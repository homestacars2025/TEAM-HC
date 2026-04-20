import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

// ─── Types ─────────────────────────────────────────────────────────────────────

type CalendarStatus = 'working' | 'parking' | 'maintenance' | 'selling' | 'replacement';
type CellKind = CalendarStatus | 'booked';

interface ModelGroupJoin { name: string; image_url: string | null; }
interface CarRaw { id: number; plate_number: string; model_group: ModelGroupJoin | ModelGroupJoin[] | null; }
interface AvailabilityRaw { id: number; status: CalendarStatus; }
interface CarCalendarRaw { id: number; car_id: number; start_date: string; end_date: string; block_type: string; booking_id: number | null; }
interface CustomerJoin { first_name: string; last_name: string; }
interface BookingCustomerRaw { id: number; customers: CustomerJoin | CustomerJoin[] | null; }
interface CalendarCar { id: number; plate_number: string; model_name: string; image_url: string | null; car_status: CalendarStatus; }
interface CalendarEntry { id: number; car_id: number; start_date: string; end_date: string; block_type: string; booking_id: number | null; customer_name: string | null; }
interface TooltipState { entry: CalendarEntry; x: number; y: number; }
interface ToastInfo { message: string; isError?: boolean; }
interface BlockPopupState { entry: CalendarEntry; car: CalendarCar; x: number; y: number; }

// ─── Design tokens ─────────────────────────────────────────────────────────────

const TODAY       = new Date();
const AIRBNB_RED  = '#FF385C';
const TEXT_DARK   = '#222222';
const TEXT_MID    = '#717171';
const TEXT_LIGHT  = '#aaaaaa';
const BORDER_SOFT = '#f0f0f0';
const FONT        = "'Circular', 'Helvetica Neue', Helvetica, Arial, sans-serif";

const LEFT_W = 200;
const COL_W  = 40;
const ROW_H  = 64;

const BADGE: Record<CellKind, { bg: string; color: string }> = {
  working:     { bg: '#dcfce7', color: '#16a34a' },
  parking:     { bg: '#fef2f2', color: '#dc2626' },
  maintenance: { bg: '#f1f5f9', color: '#64748b' },
  selling:     { bg: '#fefce8', color: '#ca8a04' },
  replacement: { bg: '#fff7ed', color: '#ea580c' },
  booked:      { bg: '#fef2f2', color: '#dc2626' },
};

const CELL_FILL: Record<CellKind, string> = {
  working:     '#bbf7d0',
  parking:     '#fecaca',
  maintenance: '#e2e8f0',
  selling:     '#fef08a',
  replacement: '#fed7aa',
  booked:      '#bbf7d0',
};

const CELL_TEXT_COLOR: Record<CellKind, string> = {
  working:     '#15803d',
  parking:     '#dc2626',
  maintenance: '#475569',
  selling:     '#a16207',
  replacement: '#c2410c',
  booked:      '#15803d',
};

const LEGEND_DOT: Record<CalendarStatus, string> = {
  working:     '#22c55e',
  parking:     '#fecaca',
  maintenance: '#e2e8f0',
  selling:     '#fef08a',
  replacement: '#fed7aa',
};

const STATUS_LABEL: Record<CellKind, string> = {
  working:     'Working',
  parking:     'Parking',
  maintenance: 'Maintenance',
  selling:     'Selling',
  replacement: 'Replacement',
  booked:      'Booked',
};

const STATUS_OPTIONS: Array<{ value: CalendarStatus | 'all'; label: string }> = [
  { value: 'all',         label: 'All statuses'  },
  { value: 'working',     label: 'Working'        },
  { value: 'parking',     label: 'Parking'        },
  { value: 'maintenance', label: 'Maintenance'    },
  { value: 'selling',     label: 'Selling'        },
  { value: 'replacement', label: 'Replacement'    },
];

const LEGEND_KINDS: CalendarStatus[] = ['working', 'parking', 'maintenance', 'selling', 'replacement'];

const EDITABLE_BLOCK_TYPES = [
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'selling',     label: 'Selling'     },
  { value: 'replacement', label: 'Replacement' },
] as const;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function formatMonthLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function parseLocalDate(s: string): Date {
  const [y, m, day] = s.split('-').map(Number);
  return new Date(y, m - 1, day);
}

function formatDateShort(s: string): string {
  return parseLocalDate(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function resolveModelGroup(raw: ModelGroupJoin | ModelGroupJoin[] | null): ModelGroupJoin {
  if (!raw) return { name: '—', image_url: null };
  return Array.isArray(raw) ? (raw[0] ?? { name: '—', image_url: null }) : raw;
}

function resolveCustomer(raw: CustomerJoin | CustomerJoin[] | null): CustomerJoin {
  if (!raw) return { first_name: '—', last_name: '' };
  return Array.isArray(raw) ? (raw[0] ?? { first_name: '—', last_name: '' }) : raw;
}

function blockTypeToKind(blockType: string): CellKind {
  switch (blockType) {
    case 'selling':     return 'selling';
    case 'maintenance': return 'maintenance';
    case 'replacement': return 'replacement';
    default:            return 'booked';
  }
}

// ─── Tooltip ───────────────────────────────────────────────────────────────────

const Tooltip: React.FC<{ state: TooltipState }> = ({ state }) => {
  const { entry, x, y } = state;
  const flipLeft = x + 260 > window.innerWidth;
  const kind = blockTypeToKind(entry.block_type);
  return (
    <div style={{
      position: 'fixed',
      left: flipLeft ? x - 248 : x + 14,
      top: y - 16,
      zIndex: 9997,
      background: 'white',
      borderRadius: 12,
      padding: '14px 16px',
      pointerEvents: 'none',
      boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
      minWidth: 220,
      fontFamily: FONT,
      animation: 'ttFadeIn 0.15s ease',
    }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        background: BADGE[kind].bg, borderRadius: 20,
        padding: '3px 9px', marginBottom: 10,
      }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: CELL_TEXT_COLOR[kind], flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: BADGE[kind].color, letterSpacing: '0.2px' }}>
          {STATUS_LABEL[kind]}
        </span>
      </div>

      {entry.customer_name && (
        <div style={{ fontSize: 14, fontWeight: 700, color: TEXT_DARK, marginBottom: 10, lineHeight: 1.3 }}>
          {entry.customer_name}
        </div>
      )}

      <div style={{ height: 1, background: BORDER_SOFT, marginBottom: 10 }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'center' }}>
          <span style={{ fontSize: 12.5, color: TEXT_MID }}>From</span>
          <span style={{ fontSize: 12.5, fontWeight: 500, color: TEXT_DARK }}>{formatDateShort(entry.start_date)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'center' }}>
          <span style={{ fontSize: 12.5, color: TEXT_MID }}>To</span>
          <span style={{ fontSize: 12.5, fontWeight: 500, color: TEXT_DARK }}>{formatDateShort(entry.end_date)}</span>
        </div>
      </div>
    </div>
  );
};

// ─── BlockPopup ────────────────────────────────────────────────────────────────

const POPUP_W     = 284;
const POPUP_MAX_H = 360;

const BlockPopup: React.FC<{
  state: BlockPopupState;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  onToast: (t: ToastInfo) => void;
}> = ({ state, onClose, onSaved, onDeleted, onToast }) => {
  const { entry, car, x, y } = state;
  const isBooked = entry.booking_id !== null;
  const kind     = blockTypeToKind(entry.block_type);

  type PopupMode = 'view' | 'edit' | 'confirm-delete';
  const [mode,       setMode]       = useState<PopupMode>('view');
  const [editType,   setEditType]   = useState(entry.block_type);
  const [editStart,  setEditStart]  = useState(entry.start_date);
  const [editEnd,    setEditEnd]    = useState(entry.end_date);
  const [editError,  setEditError]  = useState<string | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [deleting,   setDeleting]   = useState(false);

  const left = Math.min(x + 12, window.innerWidth - POPUP_W - 16);
  const top  = y + 12 + POPUP_MAX_H > window.innerHeight ? y - POPUP_MAX_H - 8 : y + 12;

  const handleSave = async () => {
    if (editEnd <= editStart) {
      setEditError('End date must be after start date');
      return;
    }
    setEditError(null);
    setSaving(true);
    const { error } = await supabase
      .from('car_calendar')
      .update({ block_type: editType, start_date: editStart, end_date: editEnd })
      .eq('id', entry.id);
    setSaving(false);
    if (error) {
      onToast({ message: `Failed to update: ${error.message}`, isError: true });
    } else {
      onToast({ message: 'Block updated successfully' });
      onSaved();
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    const { error } = await supabase.from('car_calendar').delete().eq('id', entry.id);
    setDeleting(false);
    if (error) {
      onToast({ message: `Failed to delete: ${error.message}`, isError: true });
    } else {
      onToast({ message: 'Block deleted successfully' });
      onDeleted();
    }
  };

  // Shared input style
  const inputStyle: React.CSSProperties = {
    height: 36, padding: '0 10px',
    borderRadius: 8, border: `1px solid ${BORDER_SOFT}`,
    background: '#f7f7f7', fontSize: 13, color: TEXT_DARK,
    outline: 'none', fontFamily: FONT,
    width: '100%', boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: TEXT_LIGHT,
    letterSpacing: '0.5px', textTransform: 'uppercase' as const,
  };

  return (
    <div
      onClick={e => e.stopPropagation()}
      style={{
        position: 'fixed',
        left, top,
        zIndex: 9999,
        background: 'white',
        borderRadius: 16,
        boxShadow: '0 8px 40px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.06)',
        width: POPUP_W,
        fontFamily: FONT,
        animation: 'ttFadeIn 0.15s ease',
        overflow: 'hidden',
      }}
    >
      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 14px 0',
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          background: BADGE[kind].bg, borderRadius: 20, padding: '3px 9px',
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: CELL_TEXT_COLOR[kind], flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: BADGE[kind].color, letterSpacing: '0.2px' }}>
            {mode === 'edit' ? 'Edit Block' : STATUS_LABEL[kind]}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: TEXT_LIGHT, padding: 4, borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'color 0.12s ease',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = TEXT_DARK; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = TEXT_LIGHT; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* ── Car info ── */}
      <div style={{ padding: '10px 14px 0' }}>
        {entry.customer_name && (
          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT_DARK, marginBottom: 2, lineHeight: 1.3 }}>
            {entry.customer_name}
          </div>
        )}
        <div style={{ fontSize: 12.5, color: TEXT_MID }}>
          <span style={{ fontWeight: 600, color: TEXT_DARK }}>{car.plate_number}</span>
          {' · '}
          {car.model_name}
        </div>
      </div>

      <div style={{ height: 1, background: BORDER_SOFT, margin: '12px 14px 0' }} />

      {/* ── VIEW MODE ── */}
      {mode === 'view' && (
        <>
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12.5, color: TEXT_MID }}>From</span>
              <span style={{ fontSize: 12.5, fontWeight: 500, color: TEXT_DARK }}>{formatDateShort(entry.start_date)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12.5, color: TEXT_MID }}>To</span>
              <span style={{ fontSize: 12.5, fontWeight: 500, color: TEXT_DARK }}>{formatDateShort(entry.end_date)}</span>
            </div>
          </div>

          <div style={{ height: 1, background: BORDER_SOFT, margin: '0 14px' }} />

          {isBooked ? (
            <div style={{
              padding: '11px 14px 13px',
              display: 'flex', alignItems: 'center', gap: 7,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: TEXT_LIGHT }}>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/>
                <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              <span style={{ fontSize: 12.5, color: TEXT_MID }}>Managed from the Bookings page</span>
            </div>
          ) : (
            <div style={{ padding: '10px 10px 10px', display: 'flex', gap: 6 }}>
              <button
                onClick={() => setMode('edit')}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 6, height: 36, borderRadius: 10,
                  border: `1px solid ${BORDER_SOFT}`,
                  background: 'white', cursor: 'pointer',
                  fontSize: 13, fontWeight: 600, color: TEXT_DARK,
                  fontFamily: FONT, transition: 'background 0.12s ease',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f7f7f7'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'white'; }}
              >
                <span style={{ fontSize: 14 }}>✏️</span> Edit
              </button>
              <button
                onClick={() => setMode('confirm-delete')}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 6, height: 36, borderRadius: 10,
                  border: '1px solid #fecdd3',
                  background: '#fff5f5', cursor: 'pointer',
                  fontSize: 13, fontWeight: 600, color: '#dc2626',
                  fontFamily: FONT, transition: 'background 0.12s ease',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fff5f5'; }}
              >
                <span style={{ fontSize: 14 }}>🗑️</span> Delete
              </button>
            </div>
          )}
        </>
      )}

      {/* ── EDIT MODE ── */}
      {mode === 'edit' && (
        <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 11 }}>

          {/* Block type */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={labelStyle}>Block type</label>
            <select
              value={editType}
              onChange={e => setEditType(e.target.value)}
              style={{
                ...inputStyle,
                paddingRight: 28, cursor: 'pointer',
                appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23aaaaaa' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round' fill='none'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
              }}
            >
              {EDITABLE_BLOCK_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Start date */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={labelStyle}>Start date</label>
            <input
              type="date"
              value={editStart}
              onChange={e => { setEditStart(e.target.value); setEditError(null); }}
              style={inputStyle}
            />
          </div>

          {/* End date */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={labelStyle}>End date</label>
            <input
              type="date"
              value={editEnd}
              onChange={e => { setEditEnd(e.target.value); setEditError(null); }}
              style={inputStyle}
            />
          </div>

          {editError && (
            <div style={{ fontSize: 12, color: '#dc2626', marginTop: -4 }}>{editError}</div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
            <button
              onClick={() => { setMode('view'); setEditError(null); }}
              disabled={saving}
              style={{
                flex: 1, height: 36, borderRadius: 10,
                border: `1px solid ${BORDER_SOFT}`,
                background: 'white', cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 600, color: TEXT_MID,
                fontFamily: FONT, opacity: saving ? 0.6 : 1,
                transition: 'background 0.12s ease',
              }}
              onMouseEnter={e => { if (!saving) (e.currentTarget as HTMLButtonElement).style.background = '#f7f7f7'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'white'; }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                flex: 1, height: 36, borderRadius: 10, border: 'none',
                background: '#4ba6ea', cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 600, color: 'white',
                fontFamily: FONT, opacity: saving ? 0.75 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                transition: 'opacity 0.12s ease',
              }}
              onMouseEnter={e => { if (!saving) (e.currentTarget as HTMLButtonElement).style.opacity = '0.88'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = saving ? '0.75' : '1'; }}
            >
              {saving && (
                <div style={{
                  width: 12, height: 12, borderRadius: '50%',
                  border: '2px solid rgba(255,255,255,0.35)',
                  borderTop: '2px solid white',
                  animation: 'calSpin 0.75s linear infinite',
                }} />
              )}
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* ── CONFIRM DELETE ── */}
      {mode === 'confirm-delete' && (
        <div style={{ padding: '12px 14px 14px' }}>
          <p style={{ fontSize: 13.5, color: TEXT_DARK, margin: '0 0 14px', lineHeight: 1.55 }}>
            Are you sure you want to delete this block?
          </p>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setMode('view')}
              disabled={deleting}
              style={{
                flex: 1, height: 36, borderRadius: 10,
                border: `1px solid ${BORDER_SOFT}`,
                background: 'white', cursor: deleting ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 600, color: TEXT_MID,
                fontFamily: FONT, opacity: deleting ? 0.6 : 1,
                transition: 'background 0.12s ease',
              }}
              onMouseEnter={e => { if (!deleting) (e.currentTarget as HTMLButtonElement).style.background = '#f7f7f7'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'white'; }}
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{
                flex: 1, height: 36, borderRadius: 10, border: 'none',
                background: '#ef4444', cursor: deleting ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 600, color: 'white',
                fontFamily: FONT, opacity: deleting ? 0.75 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                transition: 'opacity 0.12s ease',
              }}
              onMouseEnter={e => { if (!deleting) (e.currentTarget as HTMLButtonElement).style.opacity = '0.88'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = deleting ? '0.75' : '1'; }}
            >
              {deleting && (
                <div style={{
                  width: 12, height: 12, borderRadius: '50%',
                  border: '2px solid rgba(255,255,255,0.35)',
                  borderTop: '2px solid white',
                  animation: 'calSpin 0.75s linear infinite',
                }} />
              )}
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── ActionMenu ────────────────────────────────────────────────────────────────

const MENU_W = 224;
const MENU_H = 228;

const ActionMenu: React.FC<{
  pos: { x: number; y: number };
  onAddBooking: () => void;
  onInsert: (type: 'maintenance' | 'selling' | 'replacement') => void;
  inserting: boolean;
}> = ({ pos, onAddBooking, onInsert, inserting }) => {
  const left = Math.min(pos.x + 12, window.innerWidth - MENU_W - 16);
  const top  = pos.y + 12 + MENU_H > window.innerHeight ? pos.y - MENU_H - 8 : pos.y + 12;

  const items: Array<{ icon: string; label: string; onClick: () => void }> = [
    { icon: '📅', label: 'Add Booking',  onClick: onAddBooking },
    { icon: '🔧', label: 'Maintenance',  onClick: () => onInsert('maintenance') },
    { icon: '💰', label: 'Selling',      onClick: () => onInsert('selling') },
    { icon: '🔄', label: 'Replacement',  onClick: () => onInsert('replacement') },
  ];

  return (
    <div style={{
      position: 'fixed',
      left, top,
      zIndex: 9999,
      background: 'white',
      borderRadius: 14,
      boxShadow: '0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)',
      padding: '6px',
      width: MENU_W,
      fontFamily: FONT,
      animation: 'ttFadeIn 0.15s ease',
    }}>
      <div style={{
        padding: '6px 12px 8px',
        borderBottom: `1px solid ${BORDER_SOFT}`,
        marginBottom: 4,
      }}>
        <span style={{
          fontSize: 11, fontWeight: 600, color: TEXT_LIGHT,
          letterSpacing: '0.6px', textTransform: 'uppercase',
        }}>
          Actions
        </span>
      </div>

      {items.map(item => (
        <button
          key={item.label}
          onClick={item.onClick}
          disabled={inserting}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            width: '100%',
            padding: '10px 12px',
            background: 'transparent',
            border: 'none',
            borderRadius: 8,
            cursor: inserting ? 'not-allowed' : 'pointer',
            fontSize: 13.5,
            color: TEXT_DARK,
            fontFamily: FONT,
            textAlign: 'left',
            transition: 'background 0.12s ease',
            opacity: inserting ? 0.5 : 1,
          }}
          onMouseEnter={e => { if (!inserting) (e.currentTarget as HTMLButtonElement).style.background = '#f7f7f7'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
        >
          <span style={{ fontSize: 15, lineHeight: 1, flexShrink: 0 }}>{item.icon}</span>
          <span style={{ fontWeight: 500 }}>{item.label}</span>
          {inserting && item.label !== 'Add Booking' && (
            <div style={{
              marginLeft: 'auto',
              width: 14, height: 14,
              borderRadius: '50%',
              border: '2px solid #e5e7eb',
              borderTop: '2px solid #4ba6ea',
              animation: 'calSpin 0.75s linear infinite',
              flexShrink: 0,
            }} />
          )}
        </button>
      ))}
    </div>
  );
};

// ─── Toast ─────────────────────────────────────────────────────────────────────

const Toast: React.FC<{ info: ToastInfo }> = ({ info }) => (
  <div style={{
    position: 'fixed',
    bottom: 24,
    right: 24,
    zIndex: 10000,
    background: 'white',
    borderRadius: 12,
    padding: '13px 18px',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
    border: `1px solid ${info.isError ? '#fecdd3' : '#bbf7d0'}`,
    fontFamily: FONT,
    animation: 'ttFadeIn 0.2s ease',
    minWidth: 240,
    maxWidth: 360,
  }}>
    <div style={{
      width: 8, height: 8, borderRadius: '50%',
      background: info.isError ? '#ef4444' : '#22c55e',
      flexShrink: 0,
    }} />
    <span style={{
      fontSize: 13.5,
      fontWeight: 500,
      color: info.isError ? '#b91c1c' : '#15803d',
      lineHeight: 1.4,
    }}>
      {info.message}
    </span>
  </div>
);

// ─── CalendarPage ─────────────────────────────────────────────────────────────

const CalendarPage: React.FC = () => {

  // ── State ───────────────────────────────────────────────────────────────
  const [currentMonth, setCurrentMonth] = useState<Date>(
    () => new Date(TODAY.getFullYear(), TODAY.getMonth(), 1)
  );
  const [allCars, setAllCars]           = useState<CalendarCar[]>([]);
  const [calendarMap, setCalendarMap]   = useState<Map<number, CalendarEntry[]>>(new Map());
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState<CalendarStatus | 'all'>('all');
  const [tooltip, setTooltip]           = useState<TooltipState | null>(null);

  // ── Selection state ─────────────────────────────────────────────────────
  const [selCarId,   setSelCarId]   = useState<number | null>(null);
  const [selStart,   setSelStart]   = useState<string | null>(null);
  const [selEnd,     setSelEnd]     = useState<string | null>(null);
  const [menuPos,    setMenuPos]    = useState<{ x: number; y: number } | null>(null);
  const [blockPopup, setBlockPopup] = useState<BlockPopupState | null>(null);
  const [toast,      setToast]      = useState<ToastInfo | null>(null);
  const [inserting,  setInserting]  = useState(false);

  const navigate = useNavigate();

  const year        = currentMonth.getFullYear();
  const month       = currentMonth.getMonth();
  const daysInMonth = getDaysInMonth(year, month);

  const isCurrentMonth = TODAY.getFullYear() === year && TODAY.getMonth() === month;
  const todayDay       = isCurrentMonth ? TODAY.getDate() : -1;

  const dayMeta = useMemo(() =>
    Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const d   = new Date(year, month, day);
      const dow = d.getDay();
      return {
        day,
        isWeekend: dow === 0 || dow === 6,
        abbr: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2),
      };
    }),
    [year, month, daysInMonth]
  );

  // ── Helpers ─────────────────────────────────────────────────────────────
  const resetSelection = useCallback(() => {
    setSelCarId(null);
    setSelStart(null);
    setSelEnd(null);
    setMenuPos(null);
  }, []);

  // ── Data fetching ────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setTooltip(null);
    setSelCarId(null);
    setSelStart(null);
    setSelEnd(null);
    setMenuPos(null);
    setBlockPopup(null);

    const pad        = (n: number) => String(n).padStart(2, '0');
    const monthStart = `${year}-${pad(month + 1)}-01`;
    const monthEnd   = `${year}-${pad(month + 1)}-${pad(daysInMonth)}`;

    const [carsRes, availRes, calRes] = await Promise.all([
      supabase.from('cars').select('id, plate_number, model_group(name, image_url)').order('plate_number'),
      supabase.from('car_availability').select('id, status'),
      supabase.from('car_calendar')
        .select('id, car_id, start_date, end_date, block_type, booking_id')
        .lte('start_date', monthEnd)
        .gte('end_date', monthStart),
    ]);

    if (carsRes.error || availRes.error || calRes.error) {
      setError(carsRes.error?.message ?? availRes.error?.message ?? calRes.error?.message ?? 'Failed to load data');
      setLoading(false);
      return;
    }

    const statusById = new Map<number, CalendarStatus>();
    for (const row of (availRes.data ?? []) as AvailabilityRaw[]) {
      statusById.set(row.id, row.status);
    }

    const mappedCars: CalendarCar[] = (carsRes.data as CarRaw[])
      .map(row => {
        const mg = resolveModelGroup(row.model_group);
        return { id: row.id, plate_number: row.plate_number, model_name: mg.name, image_url: mg.image_url, car_status: statusById.get(row.id) ?? 'working' };
      })
      .sort((a, b) => a.model_name.localeCompare(b.model_name));

    const calRows    = (calRes.data ?? []) as CarCalendarRaw[];
    const bookingIds = Array.from(new Set(calRows.map(r => r.booking_id).filter((id): id is number => id !== null)));

    const customerByBookingId = new Map<number, string>();
    if (bookingIds.length > 0) {
      const bookRes = await supabase.from('bookings').select('id, customers(first_name, last_name)').in('id', bookingIds);
      if (!bookRes.error) {
        for (const b of (bookRes.data ?? []) as BookingCustomerRaw[]) {
          const c = resolveCustomer(b.customers);
          customerByBookingId.set(b.id, `${c.first_name} ${c.last_name}`.trim());
        }
      }
    }

    const calMap = new Map<number, CalendarEntry[]>();
    for (const row of calRows) {
      const entry: CalendarEntry = {
        id: row.id, car_id: row.car_id,
        start_date: row.start_date.slice(0, 10),
        end_date: row.end_date.slice(0, 10),
        block_type: row.block_type, booking_id: row.booking_id,
        customer_name: row.booking_id !== null ? (customerByBookingId.get(row.booking_id) ?? null) : null,
      };
      const list = calMap.get(row.car_id);
      if (list) list.push(entry);
      else calMap.set(row.car_id, [entry]);
    }

    setAllCars(mappedCars);
    setCalendarMap(calMap);
    setLoading(false);
  }, [year, month, daysInMonth]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Toast auto-dismiss ───────────────────────────────────────────────────
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Filtered cars ────────────────────────────────────────────────────────
  const filteredCars = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allCars.filter(car => {
      const matchSearch = !q || car.plate_number.toLowerCase().includes(q) || car.model_name.toLowerCase().includes(q);
      const matchStatus = statusFilter === 'all' || car.car_status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [allCars, search, statusFilter]);

  // ── Event handlers ───────────────────────────────────────────────────────
  const handleHover = useCallback((entry: CalendarEntry | null, e: React.MouseEvent) => {
    setTooltip(entry ? { entry, x: e.clientX, y: e.clientY } : null);
  }, []);

  // Click on an existing calendar block → open popup
  const handleBlockClick = useCallback((entry: CalendarEntry, car: CalendarCar, e: React.MouseEvent) => {
    e.stopPropagation();
    setTooltip(null);
    resetSelection();
    setBlockPopup({ entry, car, x: e.clientX, y: e.clientY });
  }, [resetSelection]);

  // Click on an empty cell → date range selection
  const handleDayClick = useCallback((carId: number, dayStr: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTooltip(null);

    if (selCarId !== carId || selEnd !== null) {
      setSelCarId(carId);
      setSelStart(dayStr);
      setSelEnd(null);
      setMenuPos(null);
    } else if (selStart !== null) {
      if (dayStr > selStart) {
        setSelEnd(dayStr);
        setMenuPos({ x: e.clientX, y: e.clientY });
      } else {
        setSelStart(dayStr);
        setSelEnd(null);
        setMenuPos(null);
      }
    }
  }, [selCarId, selEnd, selStart]);

  const handleInsert = useCallback(async (blockType: 'maintenance' | 'selling' | 'replacement') => {
    if (!selCarId || !selStart || !selEnd) return;
    setInserting(true);

    const { data: { user } } = await supabase.auth.getUser();

    const { error: insertError } = await supabase.from('car_calendar').insert({
      car_id: selCarId,
      start_date: selStart,
      end_date: selEnd,
      block_type: blockType,
      created_by: user?.id ?? null,
    });

    setInserting(false);

    if (insertError) {
      setToast({ message: `Failed to save: ${insertError.message}`, isError: true });
    } else {
      const label = blockType.charAt(0).toUpperCase() + blockType.slice(1);
      setToast({ message: `${label} block added successfully` });
      resetSelection();
      loadData();
    }
  }, [selCarId, selStart, selEnd, resetSelection, loadData]);

  const handleAddBooking = useCallback(() => {
    if (!selCarId || !selStart || !selEnd) return;
    navigate(`/dashboard/bookings?car_id=${selCarId}&start_date=${selStart}&end_date=${selEnd}`);
    resetSelection();
  }, [selCarId, selStart, selEnd, navigate, resetSelection]);

  const gridCols = `${LEFT_W}px repeat(${daysInMonth}, ${COL_W}px)`;
  const gridMinW = LEFT_W + COL_W * daysInMonth;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'white',
      fontFamily: FONT,
      color: TEXT_DARK,
    }}>

      <style>{`
        @keyframes ttFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes calSpin { to { transform: rotate(360deg); } }
      `}</style>

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div style={{ padding: '32px 32px 20px', flexShrink: 0, background: 'white' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ba6ea' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#4ba6ea', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
            Fleet Calendar
          </span>
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.8px', color: '#0f1117', margin: '0 0 6px', lineHeight: 1.1 }}>
          Fleet Calendar
        </h1>
        <p style={{ fontSize: 15, color: '#6b7280', lineHeight: 1.5, margin: 0 }}>
          {allCars.length} vehicle{allCars.length !== 1 ? 's' : ''} · {formatMonthLabel(currentMonth)}
        </p>
      </div>

      {/* ── Controls bar ─────────────────────────────────────────────────── */}
      <div style={{
        height: 56,
        flexShrink: 0,
        borderTop: `1px solid ${BORDER_SOFT}`,
        borderBottom: `1px solid ${BORDER_SOFT}`,
        background: 'white',
        display: 'flex',
        alignItems: 'center',
        padding: '0 32px',
        position: 'relative',
      }}>

        {/* Center: month nav */}
        <div style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <button
            onClick={() => setCurrentMonth(m => addMonths(m, -1))}
            style={{
              width: 34, height: 34, borderRadius: '50%',
              border: `1px solid ${BORDER_SOFT}`,
              background: 'white', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: TEXT_DARK,
              transition: 'background 0.15s ease, border-color 0.15s ease',
              flexShrink: 0,
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = '#f7f7f7';
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#dddddd';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'white';
              (e.currentTarget as HTMLButtonElement).style.borderColor = BORDER_SOFT;
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          <span style={{
            fontSize: 18, fontWeight: 700, color: TEXT_DARK,
            minWidth: 168, textAlign: 'center', letterSpacing: '-0.4px',
            userSelect: 'none',
          }}>
            {formatMonthLabel(currentMonth)}
          </span>

          <button
            onClick={() => setCurrentMonth(m => addMonths(m, 1))}
            style={{
              width: 34, height: 34, borderRadius: '50%',
              border: `1px solid ${BORDER_SOFT}`,
              background: 'white', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: TEXT_DARK,
              transition: 'background 0.15s ease, border-color 0.15s ease',
              flexShrink: 0,
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = '#f7f7f7';
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#dddddd';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'white';
              (e.currentTarget as HTMLButtonElement).style.borderColor = BORDER_SOFT;
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
              <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {!isCurrentMonth && (
            <button
              onClick={() => setCurrentMonth(new Date(TODAY.getFullYear(), TODAY.getMonth(), 1))}
              style={{
                height: 34, padding: '0 18px',
                borderRadius: 20, border: 'none',
                background: AIRBNB_RED, color: 'white',
                fontSize: 13.5, fontWeight: 600,
                cursor: 'pointer', fontFamily: FONT,
                transition: 'opacity 0.15s ease',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.85'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
            >
              Today
            </button>
          )}
        </div>

        {/* Right: search + filter */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>

          {/* Search pill */}
          <div style={{ position: 'relative' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{
              position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)',
              pointerEvents: 'none', color: TEXT_LIGHT,
            }}>
              <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                paddingLeft: 36, paddingRight: 16, height: 38,
                borderRadius: 24, border: 'none',
                background: '#f7f7f7', fontSize: 13.5, color: TEXT_DARK,
                outline: 'none', width: 168, fontFamily: FONT,
                transition: 'box-shadow 0.15s ease',
              }}
              onFocus={e => { e.currentTarget.style.boxShadow = `0 0 0 2px ${AIRBNB_RED}50`; }}
              onBlur={e => { e.currentTarget.style.boxShadow = 'none'; }}
            />
          </div>

          {/* Filter pill */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as CalendarStatus | 'all')}
            style={{
              height: 38, paddingLeft: 16, paddingRight: 34,
              borderRadius: 24, border: 'none',
              background: '#f7f7f7', fontSize: 13.5, color: TEXT_DARK,
              cursor: 'pointer', outline: 'none', fontFamily: FONT,
              appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23aaaaaa' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round' fill='none'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
            }}
          >
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* ── Legend bar ────────────────────────────────────────────────────── */}
      <div style={{
        height: 44,
        flexShrink: 0,
        borderBottom: `1px solid ${BORDER_SOFT}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 32px',
        gap: 24,
        background: 'white',
      }}>
        {LEGEND_KINDS.map(kind => (
          <div key={kind} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{
              width: 11, height: 11, borderRadius: '50%',
              background: LEGEND_DOT[kind], flexShrink: 0,
            }} />
            <span style={{ fontSize: 12, color: TEXT_MID }}>{STATUS_LABEL[kind]}</span>
          </div>
        ))}

        {/* Selection hint */}
        {!selStart && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ color: TEXT_LIGHT }}>
              <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            <span style={{ fontSize: 12, color: TEXT_LIGHT }}>Click a day to start selecting a range</span>
          </div>
        )}

        {/* Active selection label */}
        {selStart && !selEnd && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: '#eff6ff', borderRadius: 20, padding: '4px 12px',
            }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ba6ea', flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#2563eb' }}>
                {formatDateShort(selStart)} — click a later day to set end date
              </span>
            </div>
            <button
              onClick={resetSelection}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: TEXT_LIGHT, padding: 4, display: 'flex', alignItems: 'center', borderRadius: 4,
              }}
              title="Clear selection"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        )}

        {/* Range selected label */}
        {selStart && selEnd && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: '#eff6ff', borderRadius: 20, padding: '4px 12px',
            }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ba6ea', flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#2563eb' }}>
                {formatDateShort(selStart)} → {formatDateShort(selEnd)}
              </span>
            </div>
            <button
              onClick={resetSelection}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: TEXT_LIGHT, padding: 4, display: 'flex', alignItems: 'center', borderRadius: 4,
              }}
              title="Clear selection"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* ── Loading ───────────────────────────────────────────────────────── */}
      {loading && (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 16,
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            border: `2.5px solid #f0f0f0`,
            borderTop: `2.5px solid ${AIRBNB_RED}`,
            animation: 'calSpin 0.75s linear infinite',
          }} />
          <span style={{ fontSize: 14, color: TEXT_MID, letterSpacing: '-0.1px' }}>Loading calendar…</span>
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && !loading && (
        <div style={{
          margin: '24px 32px 0',
          display: 'flex', alignItems: 'center', gap: 12,
          background: '#fff5f5', borderRadius: 12,
          border: '1px solid #fecdd3',
          padding: '14px 18px',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.8"/>
            <path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <span style={{ fontSize: 14, color: '#b91c1c', flex: 1 }}>{error}</span>
          <button
            onClick={loadData}
            style={{
              background: AIRBNB_RED, color: 'white', border: 'none',
              borderRadius: 20, padding: '7px 18px', fontSize: 13,
              fontWeight: 600, cursor: 'pointer', fontFamily: FONT, flexShrink: 0,
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Calendar grid ─────────────────────────────────────────────────── */}
      {!loading && !error && (
        <div style={{ flex: 1, overflow: 'auto', marginTop: 24 }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: gridCols,
            gridAutoRows: ROW_H,
            minWidth: gridMinW,
          }}>

            {/* ── Header row ─────────────────────────────────────────────── */}

            {/* Corner cell */}
            <div style={{
              position: 'sticky', top: 0, left: 0, zIndex: 20,
              background: 'white',
              borderBottom: `1px solid ${BORDER_SOFT}`,
              display: 'flex', alignItems: 'center',
              padding: '0 20px',
            }}>
              <span style={{
                fontSize: 11, fontWeight: 600, color: TEXT_LIGHT,
                letterSpacing: '0.6px', textTransform: 'uppercase',
              }}>
                {filteredCars.length} car{filteredCars.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Day header cells */}
            {dayMeta.map(({ day, abbr, isWeekend }) => {
              const isToday = day === todayDay;
              return (
                <div
                  key={`h-${day}`}
                  style={{
                    position: 'sticky', top: 0, zIndex: 10,
                    background: 'white',
                    borderBottom: `1px solid ${BORDER_SOFT}`,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 3,
                  }}
                >
                  <span style={{
                    fontSize: 10, fontWeight: 500,
                    color: TEXT_LIGHT, letterSpacing: '0.3px',
                    textTransform: 'uppercase', lineHeight: 1,
                  }}>
                    {abbr}
                  </span>

                  {isToday ? (
                    <div style={{
                      width: 26, height: 26, borderRadius: '50%',
                      background: AIRBNB_RED,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{
                        fontSize: 13, fontWeight: 700, color: 'white',
                        lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                      }}>
                        {day}
                      </span>
                    </div>
                  ) : (
                    <span style={{
                      fontSize: 14, fontWeight: 600,
                      color: isWeekend ? '#cccccc' : TEXT_DARK,
                      lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                    }}>
                      {day}
                    </span>
                  )}
                </div>
              );
            })}

            {/* ── Car rows ───────────────────────────────────────────────── */}

            {filteredCars.length === 0 && (
              <div style={{
                gridColumn: '1 / -1',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                padding: '80px 20px', gap: 8,
              }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: TEXT_DARK }}>No vehicles found</div>
                <div style={{ fontSize: 13, color: TEXT_MID }}>Try adjusting your search or filter.</div>
              </div>
            )}

            {filteredCars.map((car, rowIdx) => {
              const rowBg  = rowIdx % 2 === 0 ? 'white' : '#fafafa';
              const status = car.car_status;

              return (
                <React.Fragment key={car.id}>

                  {/* Left panel */}
                  <div style={{
                    position: 'sticky', left: 0, zIndex: 5,
                    background: rowBg,
                    borderRight: `1px solid ${BORDER_SOFT}`,
                    display: 'flex', flexDirection: 'column',
                    justifyContent: 'center',
                    padding: '0 20px',
                    width: LEFT_W,
                    gap: 2,
                  }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: TEXT_DARK, lineHeight: 1.2 }}>
                      {car.plate_number || '—'}
                    </div>
                    <div style={{
                      fontSize: 13, color: TEXT_MID, lineHeight: 1.2,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {car.model_name}
                    </div>
                    <div style={{
                      marginTop: 5,
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      background: BADGE[status].bg, borderRadius: 20,
                      padding: '2px 8px', alignSelf: 'flex-start',
                    }}>
                      <div style={{
                        width: 5, height: 5, borderRadius: '50%',
                        background: BADGE[status].color, flexShrink: 0,
                      }} />
                      <span style={{
                        fontSize: 11, fontWeight: 500, color: BADGE[status].color,
                        whiteSpace: 'nowrap', lineHeight: 1.4,
                      }}>
                        {STATUS_LABEL[status]}
                      </span>
                    </div>
                  </div>

                  {/* Day cells */}
                  {dayMeta.map(({ day, isWeekend }) => {
                    const isToday  = day === todayDay;
                    const dayStr   = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const entries  = calendarMap.get(car.id) ?? [];
                    const calEntry = entries.find(e => e.start_date.slice(0, 10) <= dayStr && dayStr <= e.end_date.slice(0, 10)) ?? null;
                    const kind     = calEntry ? blockTypeToKind(calEntry.block_type) : status;

                    // Default circle appearance
                    let circleBg = calEntry
                      ? CELL_FILL[kind]
                      : isToday ? '#fff1f2' : '#fecaca';

                    let circleColor = calEntry
                      ? CELL_TEXT_COLOR[kind]
                      : isToday ? AIRBNB_RED : '#dc2626';

                    let cellBg = rowBg;

                    // ── Selection overrides (only on empty cells) ──────────
                    const isThisCar  = selCarId === car.id;
                    const isSelStart = isThisCar && selStart === dayStr && !calEntry;
                    const isSelEnd   = isThisCar && selEnd === dayStr && !calEntry;
                    const isInRange  = isThisCar && selStart !== null && selEnd !== null
                                       && dayStr > selStart && dayStr < selEnd && !calEntry;
                    const isPending  = isThisCar && selStart !== null && selEnd === null
                                       && dayStr === selStart && !calEntry;

                    if (isSelStart || isSelEnd) {
                      circleBg    = '#4ba6ea';
                      circleColor = 'white';
                      cellBg      = '#eff6ff';
                    } else if (isInRange) {
                      circleBg    = '#bfdbfe';
                      circleColor = '#2563eb';
                      cellBg      = '#eff6ff';
                    } else if (isPending) {
                      circleBg    = '#4ba6ea';
                      circleColor = 'white';
                    }

                    // Highlight the active popup block
                    const isPopupBlock = blockPopup?.entry.id === calEntry?.id && calEntry !== null;

                    return (
                      <div
                        key={`${car.id}-${day}`}
                        style={{
                          background: cellBg,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer',
                          userSelect: 'none',
                        }}
                        onClick={e => {
                          if (calEntry) {
                            handleBlockClick(calEntry, car, e);
                          } else {
                            handleDayClick(car.id, dayStr, e);
                          }
                        }}
                        onMouseEnter={calEntry && !isPopupBlock ? e => handleHover(calEntry, e) : undefined}
                        onMouseLeave={calEntry ? () => setTooltip(null) : undefined}
                        onMouseMove={calEntry && !isPopupBlock ? e => handleHover(calEntry, e) : undefined}
                      >
                        <div style={{
                          width: 36, height: 36, borderRadius: '50%',
                          background: circleBg,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'transform 0.12s ease, background 0.1s ease',
                          boxShadow: (isSelStart || isSelEnd || isPending)
                            ? '0 2px 8px rgba(75,166,234,0.35)'
                            : isPopupBlock
                              ? '0 0 0 2px #4ba6ea'
                              : 'none',
                          outline: isPopupBlock ? '2px solid #4ba6ea' : 'none',
                          outlineOffset: 2,
                        }}>
                          <span style={{
                            fontSize: 13,
                            fontWeight: (isSelStart || isSelEnd || isPending || isInRange || calEntry) ? 600 : isToday ? 700 : 400,
                            color: circleColor,
                            fontVariantNumeric: 'tabular-nums', lineHeight: 1,
                            userSelect: 'none',
                          }}>
                            {day}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                </React.Fragment>
              );
            })}

          </div>
        </div>
      )}

      {/* Tooltip — hidden when any popup/menu is open */}
      {tooltip && !menuPos && !blockPopup && <Tooltip state={tooltip} />}

      {/* ── Action menu (new range selection) ───────────────────────────── */}
      {menuPos && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
            onClick={resetSelection}
          />
          <ActionMenu
            pos={menuPos}
            onAddBooking={handleAddBooking}
            onInsert={handleInsert}
            inserting={inserting}
          />
        </>
      )}

      {/* ── Block popup (click existing block) ──────────────────────────── */}
      {blockPopup && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
            onClick={() => setBlockPopup(null)}
          />
          <BlockPopup
            state={blockPopup}
            onClose={() => setBlockPopup(null)}
            onSaved={() => { setBlockPopup(null); loadData(); }}
            onDeleted={() => { setBlockPopup(null); loadData(); }}
            onToast={setToast}
          />
        </>
      )}

      {toast && <Toast info={toast} />}
    </div>
  );
};

export default CalendarPage;
