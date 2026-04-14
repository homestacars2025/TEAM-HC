import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

// ─── Types (unchanged) ─────────────────────────────────────────────────────────

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

// ─── Helpers (unchanged) ───────────────────────────────────────────────────────

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
      zIndex: 9999,
      background: 'white',
      borderRadius: 12,
      padding: '14px 16px',
      pointerEvents: 'none',
      boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
      minWidth: 220,
      fontFamily: FONT,
      animation: 'ttFadeIn 0.15s ease',
    }}>
      {/* Status badge */}
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

      {/* Customer name */}
      {entry.customer_name && (
        <div style={{ fontSize: 14, fontWeight: 700, color: TEXT_DARK, marginBottom: 10, lineHeight: 1.3 }}>
          {entry.customer_name}
        </div>
      )}

      {/* Separator */}
      <div style={{ height: 1, background: BORDER_SOFT, marginBottom: 10 }} />

      {/* Date range */}
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

// ─── CalendarPage ─────────────────────────────────────────────────────────────

const CalendarPage: React.FC = () => {

  // ── State (unchanged) ───────────────────────────────────────────────────
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

  // ── Data fetching (unchanged) ────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setTooltip(null);

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

  // ── Filtered cars (unchanged) ────────────────────────────────────────────
  const filteredCars = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allCars.filter(car => {
      const matchSearch = !q || car.plate_number.toLowerCase().includes(q) || car.model_name.toLowerCase().includes(q);
      const matchStatus = statusFilter === 'all' || car.car_status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [allCars, search, statusFilter]);

  const handleHover = useCallback((entry: CalendarEntry | null, e: React.MouseEvent) => {
    setTooltip(entry ? { entry, x: e.clientX, y: e.clientY } : null);
  }, []);

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

      {/* ── Page header — Cars page style ───────────────────────────────── */}
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

        {/* Center: month nav — truly centered via absolute positioning */}
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
              background: 'white',
              cursor: 'pointer',
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
              background: 'white',
              cursor: 'pointer',
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
                    {/* Plate */}
                    <div style={{
                      fontSize: 15, fontWeight: 700, color: TEXT_DARK, lineHeight: 1.2,
                    }}>
                      {car.plate_number || '—'}
                    </div>
                    {/* Model */}
                    <div style={{
                      fontSize: 13, color: TEXT_MID, lineHeight: 1.2,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {car.model_name}
                    </div>
                    {/* Status badge — pill */}
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

                    // Circle fill — calEntry takes priority over today highlight
                    const circleBg = calEntry
                      ? CELL_FILL[kind]
                      : isToday
                        ? '#fff1f2'
                        : '#fecaca';

                    const circleColor = calEntry
                      ? CELL_TEXT_COLOR[kind]
                      : isToday
                        ? AIRBNB_RED
                        : '#dc2626';

                    return (
                      <div
                        key={`${car.id}-${day}`}
                        style={{
                          background: rowBg,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: calEntry ? 'pointer' : 'default',
                        }}
                        onMouseEnter={calEntry ? e => handleHover(calEntry, e) : undefined}
                        onMouseLeave={calEntry ? e => handleHover(null, e) : undefined}
                        onMouseMove={calEntry ? e => handleHover(calEntry, e) : undefined}
                      >
                        <div style={{
                          width: 36, height: 36, borderRadius: '50%',
                          background: circleBg,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'transform 0.12s ease',
                        }}>
                          <span style={{
                            fontSize: 13,
                            fontWeight: calEntry ? 600 : isToday ? 700 : 400,
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

      {tooltip && <Tooltip state={tooltip} />}
    </div>
  );
};

export default CalendarPage;
