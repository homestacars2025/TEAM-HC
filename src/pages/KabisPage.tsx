import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type KabisStatus = 'pending' | 'checked_in' | 'checked_out';
type KabisAction = 'delivery' | 'pickup';

interface KabisRow {
  id: number;
  created_at: string;
  operation_id: number | null;
  booking_id: number | null;
  car_id: number | null;
  customer_name: string | null;
  customer_id_number: string | null;
  booking_number: string | null;
  plate_number: string | null;
  /** numeric arrives from PostgREST as a string, so accept both. */
  km: number | string | null;
  operation_date: string | null;
  action_type: string;
  status: string;
  entered_by: string | null;
  entered_at: string | null;
  note: string | null;
  entered_by_profile: { full_name: string | null } | { full_name: string | null }[] | null;
}

interface KabisEntry extends Omit<KabisRow, 'entered_by_profile'> {
  entered_by_name: string | null;
}

interface ToastState { message: string; kind: 'success' | 'error' }

/** Who marked the entry, resolved through an explicitly named foreign key. */
const KABIS_SELECT = `
  id, created_at, operation_id, booking_id, car_id,
  customer_name, customer_id_number, booking_number, plate_number, km, operation_date,
  action_type, status, entered_by, entered_at, note,
  entered_by_profile:profiles!kabis_entries_entered_by_fkey(full_name)
`;

// ─── Design tokens ────────────────────────────────────────────────────────────

/** Figures stay column-aligned across rows. */
const NUM: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' };

const STATUS_CONFIG: Record<KabisStatus, { label: string; color: string; bg: string }> = {
  pending:     { label: 'Pending',     color: '#ea580c', bg: 'rgba(249,115,22,0.12)' },
  checked_in:  { label: 'Checked in',  color: '#16a34a', bg: 'rgba(34,197,94,0.12)'  },
  checked_out: { label: 'Checked out', color: '#2563eb', bg: 'rgba(37,99,235,0.12)'  },
};

/**
 * KABIS mirrors the government system: a delivery is registered as a check-in, a
 * pickup as a check-out. Each row therefore has exactly one target status — a
 * delivery can only ever become `checked_in`, a pickup only ever `checked_out`.
 */
const ACTION_CONFIG: Record<KabisAction, {
  label: string; color: string; bg: string; target: KabisStatus; cta: string;
  ctaBg: string; ctaBgHover: string;
}> = {
  delivery: {
    label: 'Check-in',  color: '#4ba6ea', bg: 'rgba(75,166,234,0.12)',
    target: 'checked_in',  cta: 'Mark checked-in',
    ctaBg: '#16a34a', ctaBgHover: '#15803d',
  },
  pickup: {
    label: 'Check-out', color: '#7c3aed', bg: 'rgba(124,58,237,0.12)',
    target: 'checked_out', cta: 'Mark checked-out',
    ctaBg: '#2563eb', ctaBgHover: '#1d4ed8',
  },
};

const asStatus = (v: string): KabisStatus =>
  v === 'checked_in' || v === 'checked_out' ? v : 'pending';
const asAction = (v: string): KabisAction => (v === 'pickup' ? 'pickup' : 'delivery');

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', height: 44, padding: '0 12px',
  fontSize: 14, color: '#0f1117',
  background: '#fff', border: '1.5px solid #e5e7eb',
  borderRadius: 9, outline: 'none', fontFamily: 'inherit',
  boxSizing: 'border-box', transition: 'border-color 150ms ease',
};

const onFocus = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
  { (e.target as HTMLElement).style.borderColor = '#4ba6ea'; };
const onBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
  { (e.target as HTMLElement).style.borderColor = '#e5e7eb'; };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const dash = (v: string | null | undefined): string => (v?.trim() ? v.trim() : '—');

function formatDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s.length <= 10 ? s + 'T00:00:00' : s);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** `entered_at` arrives as an ISO string; null and unparseable both render as an em dash. */
function formatDateTime(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

/** numeric may arrive as a string; render with thousands separators or an em dash. */
function formatKm(v: number | string | null): string {
  if (v === null || v === '') return '—';
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? `${n.toLocaleString('en-US')} km` : '—';
}

function resolveRow(row: KabisRow): KabisEntry {
  const p = Array.isArray(row.entered_by_profile) ? row.entered_by_profile[0] : row.entered_by_profile;
  const { entered_by_profile, ...rest } = row;
  return { ...rest, entered_by_name: p?.full_name ?? null };
}

// ─── Small pieces ─────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const cfg = STATUS_CONFIG[asStatus(status)];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
      color: cfg.color, background: cfg.bg, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
};

const ActionBadge: React.FC<{ action: string }> = ({ action }) => {
  const cfg = ACTION_CONFIG[asAction(action)];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
      color: cfg.color, background: cfg.bg, whiteSpace: 'nowrap',
    }}>
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
    <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.7px', opacity: 0.85 }}>
      {label}
    </div>
    <div style={{ ...NUM, fontSize: 36, fontWeight: 800, letterSpacing: '-1.5px', lineHeight: 1 }}>
      {loading ? '—' : value}
    </div>
  </div>
);

const Toast: React.FC<ToastState> = ({ message, kind }) =>
  ReactDOM.createPortal(
    <div style={{
      position: 'fixed', bottom: 28, right: 28, zIndex: 2000,
      display: 'flex', alignItems: 'center', gap: 10,
      background: kind === 'success' ? '#0f1117' : '#ef4444',
      color: '#fff', borderRadius: 12, padding: '12px 20px',
      fontSize: 14, fontWeight: 500,
      boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      animation: 'kbSlideUp 200ms ease',
      maxWidth: 'calc(100vw - 56px)',
    }}>
      {message}
    </div>,
    document.body,
  );

// ─── Confirm modal ────────────────────────────────────────────────────────────

const ConfirmModal: React.FC<{
  entry: KabisEntry;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}> = ({ entry, saving, error, onCancel, onConfirm }) => {
  const [note, setNote] = useState(entry.note ?? '');

  return ReactDOM.createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15,17,23,0.5)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, animation: 'kbFade 150ms ease',
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 18, width: '100%', maxWidth: 440,
        boxShadow: '0 24px 80px rgba(0,0,0,0.2)', animation: 'kbSlideUp 180ms ease',
      }}>
        <div style={{ padding: '20px 24px 14px', borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0f1117', letterSpacing: '-0.3px' }}>
            {ACTION_CONFIG[asAction(entry.action_type)].cta}
          </div>
          <div style={{ fontSize: 12.5, color: '#9ca3af', marginTop: 3, lineHeight: 1.6 }}>
            Confirm you have registered this operation in the KABIS system.
          </div>
        </div>

        <div style={{ padding: '16px 24px 20px' }}>
          <div style={{
            background: '#f9fafb', borderRadius: 10, padding: '12px 14px',
            marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 7,
          }}>
            {[
              { k: 'Plate',     v: dash(entry.plate_number),      num: true  },
              { k: 'Customer',  v: dash(entry.customer_name),     num: false },
              { k: 'ID Number', v: dash(entry.customer_id_number), num: true  },
              { k: 'KM',        v: formatKm(entry.km),            num: true  },
              { k: 'Booking',   v: dash(entry.booking_number),    num: true  },
              { k: 'Type',      v: ACTION_CONFIG[asAction(entry.action_type)].label, num: false },
              { k: 'Date',      v: formatDate(entry.operation_date), num: true },
            ].map(item => (
              <div key={item.k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                <span style={{ color: '#9ca3af' }}>{item.k}</span>
                <span style={{ color: '#0f1117', fontWeight: 600, ...(item.num ? NUM : {}) }}>{item.v}</span>
              </div>
            ))}
          </div>

          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
            Note <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span>
          </label>
          <textarea
            rows={2}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Anything worth recording about this entry…"
            style={{ ...INPUT_STYLE, height: 'auto', padding: '10px 12px', resize: 'vertical', lineHeight: 1.6 }}
            onFocus={onFocus}
            onBlur={onBlur}
          />

          {error && (
            <div style={{
              marginTop: 12, padding: '10px 14px', background: '#fef2f2',
              border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8,
              fontSize: 13, color: '#ef4444',
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
            <button
              onClick={() => onConfirm(note)}
              disabled={saving}
              style={{
                flex: 1, minHeight: 44, minWidth: 130, borderRadius: 9, border: 'none',
                background: ACTION_CONFIG[asAction(entry.action_type)].ctaBg, color: '#fff',
                opacity: saving ? 0.6 : 1,
                fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', transition: 'opacity 140ms ease',
              }}
            >
              {saving ? 'Saving…' : 'Confirm'}
            </button>
            <button
              onClick={onCancel}
              disabled={saving}
              style={{
                minHeight: 44, padding: '0 20px', borderRadius: 9,
                border: '1px solid #e5e7eb', background: '#fff',
                fontSize: 14, fontWeight: 600, color: '#6b7280',
                cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const KabisPage: React.FC = () => {
  const [entries, setEntries] = useState<KabisEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<'all' | KabisStatus>('all');
  const [actionFilter, setActionFilter] = useState<'all' | KabisAction>('all');
  const [search, setSearch]             = useState('');

  const [confirmEntry, setConfirmEntry] = useState<KabisEntry | null>(null);
  const [saving, setSaving]             = useState(false);
  const [modalError, setModalError]     = useState<string | null>(null);
  const [revertingId, setRevertingId]   = useState<number | null>(null);

  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Arriving from a notification: highlight and scroll to that row.
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightId = useMemo(() => {
    const raw = searchParams.get('entry');
    return raw && /^\d+$/.test(raw) ? Number(raw) : null;
  }, [searchParams]);
  const highlightRef = useRef<HTMLTableRowElement | null>(null);

  const showToast = useCallback((message: string, kind: 'success' | 'error') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, kind });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    // Pending first, then newest.
    const { data, error: fetchError } = await supabase
      .from('kabis_entries')
      .select(KABIS_SELECT)
      .order('status', { ascending: true })
      .order('created_at', { ascending: false });

    setLoading(false);
    if (fetchError) { setError(fetchError.message); return; }
    setEntries(((data ?? []) as unknown as KabisRow[]).map(resolveRow));
  }, []);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  useEffect(() => {
    if (!highlightId || loading) return;
    const node = highlightRef.current;
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightId, loading, entries]);

  const stats = useMemo(() => ({
    pending:    entries.filter(e => asStatus(e.status) === 'pending').length,
    checkedIn:  entries.filter(e => asStatus(e.status) === 'checked_in').length,
    checkedOut: entries.filter(e => asStatus(e.status) === 'checked_out').length,
  }), [entries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter(e => {
      if (statusFilter !== 'all' && asStatus(e.status) !== statusFilter) return false;
      if (actionFilter !== 'all' && asAction(e.action_type) !== actionFilter) return false;
      if (!q) return true;
      return (
        (e.customer_name      ?? '').toLowerCase().includes(q) ||
        (e.customer_id_number ?? '').toLowerCase().includes(q) ||
        (e.booking_number     ?? '').toLowerCase().includes(q) ||
        (e.plate_number       ?? '').toLowerCase().includes(q)
      );
    });
  }, [entries, statusFilter, actionFilter, search]);

  /**
   * The target status follows the row's own action type — never the other one.
   * Only status and note are written; the trigger stamps entered_by / entered_at.
   */
  const handleConfirm = useCallback(async (note: string) => {
    if (!confirmEntry) return;
    setSaving(true);
    setModalError(null);

    const target = ACTION_CONFIG[asAction(confirmEntry.action_type)].target;
    const { error: updateError } = await supabase
      .from('kabis_entries')
      .update({ status: target, note: note.trim() || null })
      .eq('id', confirmEntry.id);

    setSaving(false);
    if (updateError) { setModalError(updateError.message); return; }

    setConfirmEntry(null);
    showToast(`Marked ${STATUS_CONFIG[target].label.toLowerCase()} in KABIS`, 'success');
    fetchEntries();
  }, [confirmEntry, showToast, fetchEntries]);

  /** Back to pending — the trigger clears entered_by / entered_at automatically. */
  const handleRevert = useCallback(async (entry: KabisEntry) => {
    setRevertingId(entry.id);
    const { error: updateError } = await supabase
      .from('kabis_entries')
      .update({ status: 'pending' })
      .eq('id', entry.id);
    setRevertingId(null);

    if (updateError) { showToast(`Could not undo: ${updateError.message}`, 'error'); return; }
    showToast('Moved back to pending', 'success');
    fetchEntries();
  }, [showToast, fetchEntries]);

  const clearHighlight = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('entry');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const th: React.CSSProperties = {
    textAlign: 'left', padding: '11px 14px', fontSize: 11, fontWeight: 700,
    color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px',
    whiteSpace: 'nowrap', borderBottom: '1px solid #f3f4f6',
  };
  const td: React.CSSProperties = {
    padding: '13px 14px', fontSize: 13.5, color: '#374151',
    borderBottom: '1px solid #f9fafb', verticalAlign: 'middle',
  };

  return (
    <div className="kb-page" style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)',
    }}>
      {/* ── Page header ── */}
      <div style={{ marginBottom: 26 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ba6ea' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#4ba6ea', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
            Operations
          </span>
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.8px', color: '#0f1117', lineHeight: 1.1, marginBottom: 6 }}>
          KABIS
        </h1>
        <p style={{ fontSize: 15, color: '#6b7280', lineHeight: 1.6, margin: 0, maxWidth: 640 }}>
          KABIS ledger — register deliveries as check-ins and pickups as check-outs in the KABIS system, then mark them here.
        </p>
      </div>

      {/* ── Stat cards ── */}
      <div className="kb-stats">
        <StatCard label="Pending"     value={stats.pending}    bg="#ea580c" loading={loading} />
        <StatCard label="Checked in"  value={stats.checkedIn}  bg="#16a34a" loading={loading} />
        <StatCard label="Checked out" value={stats.checkedOut} bg="#2563eb" loading={loading} />
      </div>

      {/* ── Filters ── */}
      <div style={{
        background: '#fff', borderRadius: 14, border: '1px solid #ebebeb',
        padding: '12px 14px', marginBottom: 16,
        display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <input
            type="text"
            placeholder="Search customer, ID number, booking, plate…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={INPUT_STYLE}
            onFocus={onFocus}
            onBlur={onBlur}
          />
        </div>

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as 'all' | KabisStatus)}
          style={{ ...INPUT_STYLE, width: 'auto', minWidth: 140, cursor: 'pointer', flex: '0 1 auto' }}
          onFocus={onFocus} onBlur={onBlur}
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="checked_in">Checked in</option>
          <option value="checked_out">Checked out</option>
        </select>

        <select
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value as 'all' | KabisAction)}
          style={{ ...INPUT_STYLE, width: 'auto', minWidth: 130, cursor: 'pointer', flex: '0 1 auto' }}
          onFocus={onFocus} onBlur={onBlur}
        >
          <option value="all">All types</option>
          <option value="delivery">Check-in</option>
          <option value="pickup">Check-out</option>
        </select>
      </div>

      {/* ── Highlight banner ── */}
      {highlightId && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, flexWrap: 'wrap', marginBottom: 14,
          background: 'rgba(75,166,234,0.08)', border: '1px solid rgba(75,166,234,0.3)',
          borderRadius: 10, padding: '10px 14px',
        }}>
          <span style={{ fontSize: 13, color: '#1f6ea8' }}>
            Opened from a notification — entry <strong style={NUM}>#{highlightId}</strong> is highlighted below.
          </span>
          <button
            onClick={clearHighlight}
            style={{
              minHeight: 36, padding: '0 14px', borderRadius: 8,
              border: '1px solid rgba(75,166,234,0.4)', background: '#fff',
              fontSize: 12.5, fontWeight: 600, color: '#1f6ea8',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Clear highlight
          </button>
        </div>
      )}

      {/* ── Table ── */}
      {error ? (
        <div style={{
          background: '#fff', borderRadius: 14, border: '1px solid #fecdd3',
          padding: '28px 20px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 14, color: '#ef4444', marginBottom: 14 }}>{error}</div>
          <button
            onClick={fetchEntries}
            style={{
              minHeight: 44, padding: '0 20px', borderRadius: 9,
              border: '1px solid #e5e7eb', background: '#fff',
              fontSize: 14, fontWeight: 600, color: '#6b7280',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Try again
          </button>
        </div>
      ) : loading ? (
        <div style={{
          background: '#fff', borderRadius: 14, border: '1px solid #ebebeb',
          padding: '48px 20px', textAlign: 'center', color: '#9ca3af', fontSize: 14,
        }}>
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          background: '#fff', borderRadius: 14, border: '1px solid #ebebeb',
          padding: '48px 20px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
            {entries.length === 0 ? 'No KABIS entries yet' : 'No entries match these filters'}
          </div>
          <div style={{ fontSize: 13.5, color: '#9ca3af', lineHeight: 1.6 }}>
            {entries.length === 0
              ? 'Entries are created automatically when a delivery or pickup is recorded.'
              : 'Try clearing the search or changing the filters.'}
          </div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
            Showing {filtered.length} of {entries.length} entr{entries.length === 1 ? 'y' : 'ies'}
          </div>

          <div style={{
            background: '#fff', borderRadius: 14, border: '1px solid #ebebeb',
            overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1220 }}>
                <thead>
                  <tr>
                    <th style={th}>Plate</th>
                    <th style={th}>KM</th>
                    <th style={th}>Customer</th>
                    <th style={th}>ID Number</th>
                    <th style={th}>Booking</th>
                    <th style={th}>Type</th>
                    <th style={th}>Date</th>
                    <th style={th}>Status</th>
                    <th style={th}>Registered At</th>
                    <th style={{ ...th, textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(entry => {
                    const status      = asStatus(entry.status);
                    const isHighlight = highlightId === entry.id;
                    return (
                      <tr
                        key={entry.id}
                        ref={isHighlight ? highlightRef : undefined}
                        style={{
                          background: isHighlight ? 'rgba(75,166,234,0.07)' : 'transparent',
                          boxShadow: isHighlight ? 'inset 3px 0 0 #4ba6ea' : 'none',
                          transition: 'background 160ms ease',
                        }}
                      >
                        <td style={{ ...td, ...NUM, fontWeight: 700, color: '#0f1117', whiteSpace: 'nowrap' }}>
                          {dash(entry.plate_number)}
                        </td>
                        <td style={{ ...td, ...NUM, whiteSpace: 'nowrap' }}>{formatKm(entry.km)}</td>
                        <td style={{ ...td, maxWidth: 200 }}>{dash(entry.customer_name)}</td>
                        <td style={{ ...td, ...NUM, whiteSpace: 'nowrap' }}>{dash(entry.customer_id_number)}</td>
                        <td style={{ ...td, ...NUM, whiteSpace: 'nowrap' }}>{dash(entry.booking_number)}</td>
                        <td style={td}><ActionBadge action={entry.action_type} /></td>
                        <td style={{ ...td, ...NUM, whiteSpace: 'nowrap' }}>{formatDate(entry.operation_date)}</td>
                        <td style={td}>
                          <StatusBadge status={entry.status} />
                          {status !== 'pending' && (
                            <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 5, lineHeight: 1.6 }}>
                              By {dash(entry.entered_by_name)}
                            </div>
                          )}
                          {entry.note && (
                            <div style={{
                              fontSize: 11.5, color: '#6b7280', marginTop: 5,
                              maxWidth: 220, lineHeight: 1.6, wordBreak: 'break-word',
                            }}>
                              Note: {entry.note}
                            </div>
                          )}
                        </td>

                        {/* Check-in row stamps the entry time, check-out row the exit time. */}
                        <td style={{
                          ...td, ...NUM, whiteSpace: 'nowrap',
                          color: status === 'pending' ? '#d1d5db' : '#374151',
                        }}>
                          {status === 'pending' ? '—' : formatDateTime(entry.entered_at)}
                        </td>
                        <td style={{ ...td, textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {status === 'pending' ? (
                            <button
                              onClick={() => { setModalError(null); setConfirmEntry(entry); }}
                              style={{
                                minHeight: 44, padding: '0 16px', borderRadius: 9, border: 'none',
                                background: ACTION_CONFIG[asAction(entry.action_type)].ctaBg, color: '#fff',
                                fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
                                fontFamily: 'inherit', transition: 'background 140ms ease',
                              }}
                              onMouseEnter={e => {
                                (e.currentTarget as HTMLButtonElement).style.background =
                                  ACTION_CONFIG[asAction(entry.action_type)].ctaBgHover;
                              }}
                              onMouseLeave={e => {
                                (e.currentTarget as HTMLButtonElement).style.background =
                                  ACTION_CONFIG[asAction(entry.action_type)].ctaBg;
                              }}
                            >
                              {ACTION_CONFIG[asAction(entry.action_type)].cta}
                            </button>
                          ) : (
                            <button
                              onClick={() => handleRevert(entry)}
                              disabled={revertingId === entry.id}
                              style={{
                                minHeight: 44, padding: '0 16px', borderRadius: 9,
                                border: '1px solid #e5e7eb', background: '#fff',
                                fontSize: 13, fontWeight: 600, color: '#6b7280',
                                cursor: revertingId === entry.id ? 'not-allowed' : 'pointer',
                                fontFamily: 'inherit',
                              }}
                              onMouseEnter={e => { if (revertingId !== entry.id) (e.currentTarget as HTMLButtonElement).style.borderColor = '#9ca3af'; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; }}
                            >
                              {revertingId === entry.id ? 'Undoing…' : 'Undo'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {confirmEntry && (
        <ConfirmModal
          entry={confirmEntry}
          saving={saving}
          error={modalError}
          onCancel={() => { setConfirmEntry(null); setModalError(null); }}
          onConfirm={handleConfirm}
        />
      )}

      {toast && <Toast {...toast} />}

      <style>{`
        .kb-page  { padding: 24px 16px; }
        .kb-stats { display: grid; grid-template-columns: 1fr; gap: 12px; margin-bottom: 18px; }
        @media (min-width: 640px) {
          .kb-page  { padding: 32px 24px; }
          .kb-stats { grid-template-columns: repeat(3, 1fr); gap: 16px; }
        }
        @media (min-width: 1024px) { .kb-page { padding: 44px 40px; } }
        @keyframes kbFade    { from { opacity: 0 } to { opacity: 1 } }
        @keyframes kbSlideUp { from { transform: translateY(10px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      `}</style>
    </div>
  );
};

export default KabisPage;
