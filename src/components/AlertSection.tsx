import React, { useEffect, useState, useRef } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../lib/supabase';
import type { AlertRow } from '../types';

interface AlertSectionProps {
  viewName: string;
  title: string;
  icon: React.ReactNode;
  accentColor: string;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const extractDateInfo = (row: Record<string, unknown>): { days_left: number; date_label: string } => {
  const formatLabel = (dateStr: string): string => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // Day-precision diff: both dates normalised to midnight so time-of-day doesn't affect the count
  const daysFrom = (dateStr: string): number => {
    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  // Always prefer end_date — it is the return/expiry date for upcoming_returns
  if (typeof row['end_date'] === 'string' && row['end_date']) {
    const val = row['end_date'] as string;
    return { days_left: daysFrom(val), date_label: formatLabel(val) };
  }

  // For other views (insurance, inspection): collect date-like keys, putting
  // end_date first and explicitly keeping start_date last so it is never picked
  // accidentally when a more relevant date column exists.
  const dateKeys = Object.keys(row)
    .filter(k => k !== 'start_date' && (k.endsWith('_date') || k.endsWith('_expiry') || k.endsWith('_at')));

  // Pre-computed days_left column
  const raw = row['days_left'];
  if (typeof raw === 'number' || (typeof raw === 'string' && !isNaN(Number(raw)))) {
    const days_left = Number(raw);
    for (const key of dateKeys) {
      const val = row[key];
      if (typeof val === 'string' && val) return { days_left, date_label: formatLabel(val) };
    }
    return { days_left, date_label: '—' };
  }

  // Derive from a date column
  for (const key of dateKeys) {
    const val = row[key];
    if (typeof val === 'string' && val) {
      const days_left = daysFrom(val);
      if (!isNaN(days_left)) return { days_left, date_label: formatLabel(val) };
    }
  }

  return { days_left: 0, date_label: '—' };
};

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

const daysBadge = (days: number): { label: string; color: string; bg: string } => {
  if (days <= 0) return { label: 'Today',    color: '#ef4444', bg: 'rgba(239,68,68,0.10)'  };
  if (days <= 2) return { label: `${days}d`, color: '#ef4444', bg: 'rgba(239,68,68,0.10)'  };
  if (days <= 7) return { label: `${days}d`, color: '#f97316', bg: 'rgba(249,115,22,0.10)' };
  return          { label: `${days}d`, color: '#22c55e', bg: 'rgba(34,197,94,0.10)'  };
};

// ---------------------------------------------------------------------------
// Model-name lookup  (view → cars → model_groups)
// ---------------------------------------------------------------------------

interface CarWithModelGroup {
  plate_number: string;
  model_group: { name: string }[] | null;
}

const fetchModelNames = async (
  plates: string[]
): Promise<Map<string, string>> => {
  const plateToModel = new Map<string, string>();
  if (plates.length === 0) return plateToModel;

  const { data } = await supabase
    .from('cars')
    .select('plate_number, model_group(name)')
    .eq('is_active', true)
    .in('plate_number', plates);

  const cars = (data ?? []) as unknown as CarWithModelGroup[];
  for (const car of cars) {
    const mg = car.model_group;
    const name = Array.isArray(mg) ? (mg[0]?.name ?? '—') : (mg as { name: string } | null)?.name ?? '—';
    plateToModel.set(car.plate_number, name);
  }

  return plateToModel;
};

// ---------------------------------------------------------------------------
// Skeleton + Row sub-components
// ---------------------------------------------------------------------------

const MAX_VISIBLE = 5;

const SkeletonRow: React.FC = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0' }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ width: 82, height: 13, borderRadius: 5, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
      <div style={{ width: 112, height: 11, borderRadius: 5, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
      <div style={{ width: 38, height: 22, borderRadius: 20, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
      <div style={{ width: 64, height: 11, borderRadius: 5, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
    </div>
  </div>
);

const RowItem: React.FC<{ row: AlertRow; divider: boolean }> = ({ row, divider }) => {
  const badge = daysBadge(row.days_left);
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 0',
      borderBottom: divider ? '1px solid #f5f5f5' : 'none',
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f1117', letterSpacing: '0.3px', marginBottom: 3 }}>
          {row.plate_number}
        </div>
        <div style={{ fontSize: 12, color: '#9ca3af' }}>
          {row.model}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <span style={{
          fontSize: 12, fontWeight: 700,
          color: badge.color, background: badge.bg,
          borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap',
        }}>
          {badge.label}
        </span>
        <span style={{ fontSize: 11, color: '#c0c4cc', letterSpacing: '0.1px' }}>
          {row.date_label}
        </span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

interface ModalProps {
  title: string;
  icon: React.ReactNode;
  accentColor: string;
  rows: AlertRow[];
  onClose: () => void;
}

const Modal: React.FC<ModalProps> = ({ title, icon, accentColor, rows, onClose }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return ReactDOM.createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15,17,23,0.45)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
        animation: 'fadeIn 150ms ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#ffffff',
          borderRadius: 18,
          width: '100%',
          maxWidth: 480,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)',
          animation: 'slideUp 180ms ease',
        }}
      >
        {/* Modal header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '18px 20px',
          borderBottom: '1px solid #f3f4f6',
          flexShrink: 0,
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9,
            background: `${accentColor}14`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {icon}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f1117', letterSpacing: '-0.2px' }}>
              {title}
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>{rows.length} total</div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 8,
              border: 'none', background: '#f3f4f6',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0, transition: 'background 140ms ease',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#e5e7eb'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f3f4f6'; }}
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="#6b7280" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Scrollable list */}
        <div ref={scrollRef} style={{ overflowY: 'auto', flex: 1, padding: '0 20px' }}>
          {rows.map((row, i) => (
            <RowItem key={i} row={row} divider={i < rows.length - 1} />
          ))}
        </div>

        {/* Modal footer */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid #f3f4f6',
          flexShrink: 0,
          display: 'flex', justifyContent: 'flex-end',
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 18px', borderRadius: 8,
              border: '1px solid #e5e7eb', background: '#ffffff',
              fontSize: 13, fontWeight: 600, color: '#6b7280',
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 140ms ease',
            }}
            onMouseEnter={e => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.borderColor = accentColor;
              b.style.color = accentColor;
            }}
            onMouseLeave={e => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.borderColor = '#e5e7eb';
              b.style.color = '#6b7280';
            }}
          >
            Close
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(12px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      `}</style>
    </div>,
    document.body
  );
};

// ---------------------------------------------------------------------------
// DEBUG — remove after confirming data shape
// ---------------------------------------------------------------------------

const debugModelGroupShape = async () => {
  const res = await supabase
    .from('cars')
    .select('plate_number, model_group_id, model_group(id, name)')
    .limit(3);
  // eslint-disable-next-line no-console
  console.log('[DEBUG] cars + model_group raw response:', JSON.stringify(res, null, 2));
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const AlertSection: React.FC<AlertSectionProps> = ({ viewName, title, icon, accentColor }) => {
  const [rows, setRows]         = useState<AlertRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // DEBUG — fires once from the first mounted section; remove after shape is confirmed
  useEffect(() => {
    if (viewName === 'upcoming_returns') debugModelGroupShape();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      // 1 — Fetch view rows
      // For upcoming_returns: order by end_date ascending (soonest return first)
      // and never fetch start_date — only end_date is relevant for display.
      const baseQuery = supabase.from(viewName);
      const { data: viewData, error: viewError } = await (
        viewName === 'upcoming_returns'
          ? baseQuery.select('car_id, plate_number, end_date, days_left').order('end_date', { ascending: true }).limit(100)
          : baseQuery.select('*').limit(100)
      );

      if (cancelled) return;
      if (viewError) { setError(viewError.message); setLoading(false); return; }

      const raw = (viewData ?? []) as Record<string, unknown>[];

      if (raw.length === 0) { setRows([]); setLoading(false); return; }

      // 2 — Resolve model names via cars → model_groups
      const plates = Array.from(new Set(
        raw.map(r => String(r['plate_number'] ?? r['plate'] ?? '')).filter(Boolean)
      ));

      const plateToModel = await fetchModelNames(plates);
      if (cancelled) return;

      // 3 — Map final rows (skip retired cars — only active cars appear in plateToModel)
      const mapped: AlertRow[] = raw
        .filter(row => {
          const plate = String(row['plate_number'] ?? row['plate'] ?? '');
          return plate !== '' && plateToModel.has(plate);
        })
        .map(row => {
          const plate = String(row['plate_number'] ?? row['plate'] ?? '—');

          // upcoming_returns: use end_date for the label and days_left from the view directly.
          // Never recalculate from start_date, never fall through to extractDateInfo.
          if (viewName === 'upcoming_returns') {
            const endDateStr = typeof row['end_date'] === 'string' ? (row['end_date'] as string) : '';
            const d = endDateStr ? new Date(endDateStr) : null;
            const date_label = d && !isNaN(d.getTime())
              ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
              : '—';
            const days_left = typeof row['days_left'] === 'number'
              ? (row['days_left'] as number)
              : (typeof row['days_left'] === 'string' ? Number(row['days_left']) : 0);
            return { plate_number: plate, model: plateToModel.get(plate) ?? '—', days_left, date_label };
          }

          const { days_left, date_label } = extractDateInfo(row);
          return {
            plate_number: plate,
            model:        plateToModel.get(plate) ?? '—',
            days_left,
            date_label,
          };
        })
        .sort((a, b) => a.days_left - b.days_left);

      setRows(mapped);
      setLoading(false);
    };

    fetchData();
    return () => { cancelled = true; };
  }, [viewName]);

  const preview = rows.slice(0, MAX_VISIBLE);
  const hasMore = rows.length > MAX_VISIBLE;

  return (
    <div style={{
      background: '#ffffff',
      borderRadius: 16,
      border: '1px solid #ebebeb',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '18px 20px 14px',
        borderBottom: '1px solid #f3f4f6',
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9,
          background: `${accentColor}14`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f1117', letterSpacing: '-0.2px' }}>
            {title}
          </div>
          {!loading && !error && (
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>{rows.length} upcoming</div>
          )}
        </div>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: accentColor, boxShadow: `0 0 0 3px ${accentColor}22`, flexShrink: 0,
        }} />
      </div>

      {/* Preview rows */}
      <div style={{ padding: '0 20px' }}>
        {loading && [...Array(4)].map((_, i) => (
          <div key={i} style={{ borderBottom: i < 3 ? '1px solid #f5f5f5' : 'none' }}>
            <SkeletonRow />
          </div>
        ))}

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 0', color: '#ef4444', fontSize: 13 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.8"/>
              <path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            {error}
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div style={{ padding: '20px 0', textAlign: 'center', color: '#c0c4cc', fontSize: 13 }}>
            No upcoming items
          </div>
        )}

        {!loading && !error && preview.map((row, i) => (
          <RowItem key={i} row={row} divider={i < preview.length - 1} />
        ))}
      </div>

      {/* Footer */}
      {!loading && !error && (
        <div style={{
          padding: '10px 20px 14px',
          borderTop: '1px solid #f3f4f6',
          marginTop: 4,
        }}>
          {hasMore ? (
            <button
              onClick={() => setModalOpen(true)}
              style={{
                background: 'none', border: 'none', padding: 0,
                fontSize: 13, fontWeight: 600, color: accentColor,
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.75'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
            >
              View all {rows.length}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path d="M5 12h14M13 6l6 6-6 6" stroke={accentColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          ) : (
            <span style={{ fontSize: 12, color: '#d1d5db' }}>
              {rows.length > 0 ? 'Showing all' : ''}
            </span>
          )}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <Modal
          title={title}
          icon={icon}
          accentColor={accentColor}
          rows={rows}
          onClose={() => setModalOpen(false)}
        />
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.45} }`}</style>
    </div>
  );
};

export default AlertSection;
