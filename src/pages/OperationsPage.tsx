import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Trans, useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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
  photos: OperationPhotos | null;
  checklist_license_present: boolean | null;
  checklist_tutanak_present: boolean | null;
  checklist_air_freshener:   boolean | null;
  checklist_customer_card:   boolean | null;
  cars: { plate_number: string } | { plate_number: string }[] | null;
  handler: { full_name: string | null } | { full_name: string | null }[] | null;
  customers: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
}

/** Structured delivery/pickup photo set stored in `operations.photos` (jsonb). */
interface OperationPhotos {
  front?:       string;
  right_side?:  string;
  left_side?:   string;
  rear?:        string;
  corner_1?:    string;
  corner_2?:    string;
  corner_3?:    string;
  corner_4?:    string;
  trunk?:       string;
  rear_seats?:  string;
  front_seats?: string;
  odometer?:    string;
  dashboard?:   string;
  extra_scratches?: string[];
  /** Storage folder these photos live in: `${plate}/${type}-${date}/${uid}`. */
  base_path?:   string;
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
  photos: OperationPhotos | null;
  checklist_license_present: boolean | null;
  checklist_tutanak_present: boolean | null;
  checklist_air_freshener:   boolean | null;
  checklist_customer_card:   boolean | null;
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
  checklist_license_present: ChecklistAnswer;
  checklist_tutanak_present: ChecklistAnswer;
  checklist_air_freshener:   ChecklistAnswer;
  checklist_customer_card:   ChecklistAnswer;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<OperationType, { color: string; bg: string; card: string }> = {
  DELIVERY:    { color: '#16a34a', bg: 'rgba(22,163,74,0.12)',    card: '#16a34a' },
  PICKUP:      { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',    card: '#ef4444' },
  CAR_WASH:    { color: '#0891b2', bg: 'rgba(8,145,178,0.12)',    card: '#0891b2' },
  MAINTENANCE: { color: '#6b7280', bg: 'rgba(107,114,128,0.12)', card: '#6b7280' },
  OIL_CHANGE:  { color: '#ea580c', bg: 'rgba(234,88,12,0.12)',   card: '#ea580c' },

  OTHER:       { color: '#9ca3af', bg: 'rgba(156,163,175,0.12)', card: '#9ca3af' },
};

const ALL_OP_TYPES: OperationType[] = [
  'DELIVERY', 'PICKUP', 'CAR_WASH', 'MAINTENANCE', 'OIL_CHANGE', 'OTHER',
];

const DP_TYPES:    OperationType[] = ['DELIVERY', 'PICKUP'];
const OTHER_TYPES: OperationType[] = ['CAR_WASH', 'MAINTENANCE', 'OIL_CHANGE', 'OTHER'];

/** Delivery checklist — four yes/no items captured on every new DELIVERY. */
type ChecklistKey =
  | 'checklist_license_present' | 'checklist_tutanak_present'
  | 'checklist_air_freshener'   | 'checklist_customer_card';

type ChecklistAnswer = 'yes' | 'no' | '';

const CHECKLIST_ITEMS: { key: ChecklistKey; labelKey: string }[] = [
  { key: 'checklist_license_present', labelKey: 'checklist.license' },
  { key: 'checklist_tutanak_present', labelKey: 'checklist.tutanak' },
  { key: 'checklist_air_freshener',   labelKey: 'checklist.freshener' },
  { key: 'checklist_customer_card',   labelKey: 'checklist.card' },
];

/** null means "never asked" (pre-checklist operation), not "No". */
const boolToAnswer = (v: boolean | null | undefined): ChecklistAnswer =>
  v === true ? 'yes' : v === false ? 'no' : '';

const DP_STAT_CARDS    = ['DELIVERY', 'PICKUP'] as const;
const OTHER_STAT_CARDS = ['CAR_WASH', 'MAINTENANCE', 'OIL_CHANGE', 'OTHER'] as const;

/** Fixed, ordered photo positions captured for every DELIVERY / PICKUP operation. */
type PhotoSlotKey =
  | 'front' | 'right_side' | 'left_side' | 'rear'
  | 'corner_1' | 'corner_2' | 'corner_3' | 'corner_4'
  | 'trunk' | 'rear_seats' | 'front_seats' | 'odometer' | 'dashboard';

/** Where a slot's target area sits on the shared top-view car (viewBox 0 0 48 84, nose at top). */
type SlotHighlight =
  | { shape: 'dot';  cx: number; cy: number; r: number }
  | { shape: 'zone'; x: number; y: number; w: number; h: number; rx: number };

type SlotArea = 'exterior' | 'interior';

const AREA_TONE: Record<SlotArea, string> = {
  exterior: '#ef4444',
  interior: '#16a34a',
};

/**
 * Single source of truth: key, English label, order, exterior/interior tone and the
 * highlight geometry all live on one row, so a diagram can never drift from its label.
 * Corner order is fixed: 1 front-left, 2 front-right, 3 rear-left, 4 rear-right.
 */
const PHOTO_SLOTS: { key: PhotoSlotKey; labelKey: string; area: SlotArea; highlight: SlotHighlight }[] = [
  { key: 'front',       labelKey: 'slots.front',       area: 'exterior', highlight: { shape: 'dot',  cx: 24,   cy: 10.5, r: 4 } },
  { key: 'right_side',  labelKey: 'slots.rightSide',  area: 'exterior', highlight: { shape: 'dot',  cx: 37.5, cy: 42,   r: 4 } },
  { key: 'left_side',   labelKey: 'slots.leftSide',   area: 'exterior', highlight: { shape: 'dot',  cx: 10.5, cy: 42,   r: 4 } },
  { key: 'rear',        labelKey: 'slots.rear',        area: 'exterior', highlight: { shape: 'dot',  cx: 24,   cy: 71.5, r: 4 } },
  { key: 'corner_1',    labelKey: 'slots.corner1',    area: 'exterior', highlight: { shape: 'dot',  cx: 12.8, cy: 17,   r: 3.8 } },
  { key: 'corner_2',    labelKey: 'slots.corner2',    area: 'exterior', highlight: { shape: 'dot',  cx: 35.2, cy: 17,   r: 3.8 } },
  { key: 'corner_3',    labelKey: 'slots.corner3',    area: 'exterior', highlight: { shape: 'dot',  cx: 12.8, cy: 69,   r: 3.8 } },
  { key: 'corner_4',    labelKey: 'slots.corner4',    area: 'exterior', highlight: { shape: 'dot',  cx: 35.2, cy: 69,   r: 3.8 } },
  { key: 'trunk',       labelKey: 'slots.trunk',       area: 'interior', highlight: { shape: 'zone', x: 12.5, y: 65.5, w: 23, h: 10,   rx: 3.5 } },
  { key: 'rear_seats',  labelKey: 'slots.rearSeats',  area: 'interior', highlight: { shape: 'zone', x: 14,   y: 45,   w: 20, h: 10.5, rx: 3.5 } },
  { key: 'front_seats', labelKey: 'slots.frontSeats', area: 'interior', highlight: { shape: 'zone', x: 14,   y: 34,   w: 20, h: 10.5, rx: 3.5 } },
  { key: 'odometer',    labelKey: 'slots.odometer',    area: 'interior', highlight: { shape: 'dot',  cx: 18.5, cy: 31,  r: 3.4 } },
  { key: 'dashboard',   labelKey: 'slots.dashboard',   area: 'interior', highlight: { shape: 'zone', x: 14,   y: 28.2, w: 20, h: 5.6,  rx: 2.4 } },
];

const MAX_SCRATCH_PHOTOS = 5;
const UPLOAD_CONCURRENCY = 4;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMonthStart(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1); }
function getMonthEnd(d: Date):   Date { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function addMonths(d: Date, n: number): Date { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function formatMonthLabel(d: Date, locale: string): string {
  return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}
function formatDate(s: string, locale: string): string {
  if (!s) return '—';
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}
function todayStr(): string { return toDateStr(new Date()); }

/**
 * Dates follow the UI language with Western digits. Money and kilometres keep
 * their own `en-US` formatters untouched — amount shape reaches printed
 * documents, and both already render Western digits either way.
 */
function useDateLocale(): string {
  const { i18n } = useTranslation();
  return i18n.resolvedLanguage?.startsWith('ar') ? 'ar-u-nu-latn' : 'en-GB';
}
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
    checklist_license_present: boolToAnswer(op.checklist_license_present),
    checklist_tutanak_present: boolToAnswer(op.checklist_tutanak_present),
    checklist_air_freshener:   boolToAnswer(op.checklist_air_freshener),
    checklist_customer_card:   boolToAnswer(op.checklist_customer_card),
  };
}

function sanitizePath(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9\-_]/g, '-')  // keep only alphanumeric, dash, underscore
    .replace(/-+/g, '-')                // collapse multiple dashes
    .replace(/^-|-$/g, '')             // trim leading/trailing dashes
    .toLowerCase();
}

/** Plate segment of the structured storage path: lowercased, spaces removed. */
function plateForPath(plate: string): string {
  return plate.toLowerCase().replace(/\s+/g, '');
}

/**
 * Short unique folder segment, so two same-type operations for the same car on the
 * same date never write to the same fixed filenames.
 */
function newFolderUid(): string {
  return (crypto?.randomUUID?.() ?? String(Date.now())).slice(0, 8);
}

/** True when the operation carries a structured delivery/pickup photo set. */
function hasStructuredPhotos(photos: OperationPhotos | null): boolean {
  if (!photos) return false;
  return PHOTO_SLOTS.some(s => !!photos[s.key]) || (photos.extra_scratches?.length ?? 0) > 0;
}

/** Runs `worker` over `items` with a bounded number of in-flight tasks; rethrows the first failure. */
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const state = { next: 0, error: null as string | null };
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (state.next < items.length && state.error === null) {
      const item = items[state.next++];
      try {
        await worker(item);
      } catch (err) {
        if (state.error === null) state.error = err instanceof Error ? err.message : String(err);
      }
    }
  });
  await Promise.all(runners);
  if (state.error !== null) throw new Error(state.error);
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
    photos:             row.photos ?? null,
    checklist_license_present: row.checklist_license_present ?? null,
    checklist_tutanak_present: row.checklist_tutanak_present ?? null,
    checklist_air_freshener:   row.checklist_air_freshener   ?? null,
    checklist_customer_card:   row.checklist_customer_card   ?? null,
  };
}

/** True when at least one checklist answer was recorded. */
function hasChecklist(op: Operation): boolean {
  return CHECKLIST_ITEMS.some(i => op[i.key] !== null);
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
  const { t } = useTranslation('operations');
  const cfg = TYPE_CONFIG[type] ?? TYPE_CONFIG.OTHER;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: cfg.color, background: cfg.bg, borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
      {t(`types.${type}`)}
    </span>
  );
};

/**
 * One shared top-view car body (nose at top) drawn once. Only the highlight moves between
 * slots — a constant silhouette is what makes the 13 tiles readable as a set.
 * Scales to its container via preserveAspectRatio, so it never breaks the tile grid.
 */
const CarDiagram: React.FC<{ highlight: SlotHighlight; area: SlotArea }> = ({ highlight, area }) => {
  const tone = AREA_TONE[area];
  return (
    <svg
      viewBox="0 0 48 84"
      preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
      aria-hidden="true"
      focusable="false"
    >
      {/* Wheels and mirrors sit under the body so only their outer half shows.
          The mirrors are the cue that tells the nose from the tail at a glance. */}
      <g fill="#c2c9d2">
        <rect x="4.6" y="16" width="4.8" height="10" rx="1.9" />
        <rect x="38.6" y="16" width="4.8" height="10" rx="1.9" />
        <rect x="4.6" y="57" width="4.8" height="10" rx="1.9" />
        <rect x="38.6" y="57" width="4.8" height="10" rx="1.9" />
      </g>
      <g fill="#aeb7c2">
        <rect x="3.4" y="28.6" width="6.2" height="3.4" rx="1.6" />
        <rect x="38.4" y="28.6" width="6.2" height="3.4" rx="1.6" />
      </g>

      {/* Body */}
      <path
        d="M24 4c7 0 10.6 3 11.6 10 3 4 4.4 10 4.4 18v26c0 10-1.4 16-4.4 19-3.5 2.6-19.7 2.6-23.2 0C9.4 74 8 68 8 58V32c0-8 1.4-14 4.4-18C13.4 7 17 4 24 4Z"
        fill="#f4f5f7"
        stroke="#cfd4da"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      {/* Cabin: windshield (deeper, front), roof, rear window */}
      <path d="M15.2 28.4 32.8 28.4 29.8 19.6c-2-1.7-9.6-1.7-11.6 0Z" fill="#d3d9e0" />
      <rect x="14.6" y="28.4" width="18.8" height="27.6" rx="2.4" fill="#eef0f3" />
      <path d="M15.8 56 32.2 56 30 62.6c-1.9 1.4-9.1 1.4-11 0Z" fill="#d3d9e0" />

      {/* Target area for this slot */}
      {highlight.shape === 'dot' ? (
        <g>
          <circle cx={highlight.cx} cy={highlight.cy} r={highlight.r + 3.2} fill={tone} opacity={0.16} />
          <circle cx={highlight.cx} cy={highlight.cy} r={highlight.r} fill={tone} stroke="#fff" strokeWidth="1.3" />
        </g>
      ) : (
        <g>
          <rect x={highlight.x} y={highlight.y} width={highlight.w} height={highlight.h} rx={highlight.rx} fill={tone} opacity={0.2} />
          <rect x={highlight.x} y={highlight.y} width={highlight.w} height={highlight.h} rx={highlight.rx} fill="none" stroke={tone} strokeWidth="1.5" />
        </g>
      )}
    </svg>
  );
};

/** Red = exterior, green = interior — matches the highlight colours on every tile. */
const AreaLegendChip: React.FC<{ area: SlotArea; label: string }> = ({ area, label }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700, color: '#6b7280', letterSpacing: '0.2px' }}>
    <span style={{ width: 8, height: 8, borderRadius: '50%', background: AREA_TONE[area], flexShrink: 0 }} />
    {label}
  </span>
);

/**
 * One named photo position. Tapping it opens the camera / file picker for THIS slot only;
 * picking again replaces the previous shot.
 */
const PhotoSlotCard: React.FC<{
  label: string;
  previewUrl?: string;
  /** Mandatory positions pass their car diagram; scratch tiles omit it and fall back to a camera icon. */
  diagram?: { area: SlotArea; highlight: SlotHighlight };
  onPick: (file: File) => void;
  onRemove?: () => void;
}> = ({ label, previewUrl, diagram, onPick, onRemove }) => {
  const { t } = useTranslation('operations');
  const inputRef = useRef<HTMLInputElement>(null);
  const [hovered, setHovered] = useState(false);
  const filled = !!previewUrl;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: 'relative', width: '100%', aspectRatio: '1', minHeight: 92,
          borderRadius: 10, overflow: 'hidden', padding: 0, cursor: 'pointer',
          border: filled
            ? `1.5px solid ${hovered ? '#4ba6ea' : '#e5e7eb'}`
            : `1.5px dashed ${hovered ? '#4ba6ea' : '#d1d5db'}`,
          background: filled ? '#f9fafb' : (hovered ? 'rgba(75,166,234,0.05)' : '#fafafa'),
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 5, transition: 'all 140ms ease', fontFamily: 'inherit',
        }}
      >
        {filled ? (
          <>
            <img src={previewUrl} alt={label} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: 'rgba(15,17,23,0.62)', color: '#fff', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.3px', padding: '4px 0', textAlign: 'center' }}>
              {t('form.replaceRetake')}
            </span>
          </>
        ) : diagram ? (
          <>
            {/* Diagram is the empty-state guide — the thumbnail takes the tile over once captured */}
            <div style={{ position: 'absolute', top: 9, right: 9, bottom: 9, left: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CarDiagram area={diagram.area} highlight={diagram.highlight} />
            </div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', top: 7, insetInlineEnd: 7, color: hovered ? '#4ba6ea' : '#d1d5db', transition: 'color 140ms ease' }}>
              <path d="M4 8a2 2 0 012-2h1.6a2 2 0 001.7-.9l.6-1a1 1 0 01.9-.5h2.4a1 1 0 01.9.5l.6 1a2 2 0 001.7.9H18a2 2 0 012 2v9a2 2 0 01-2 2H6a2 2 0 01-2-2V8z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
              <circle cx="12" cy="12.5" r="3.2" stroke="currentColor" strokeWidth="1.9" />
            </svg>
          </>
        ) : (
          <>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ color: hovered ? '#4ba6ea' : '#9ca3af' }}>
              <path d="M4 8a2 2 0 012-2h1.6a2 2 0 001.7-.9l.6-1a1 1 0 01.9-.5h2.4a1 1 0 01.9.5l.6 1a2 2 0 001.7.9H18a2 2 0 012 2v9a2 2 0 01-2 2H6a2 2 0 01-2-2V8z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              <circle cx="12" cy="12.5" r="3.2" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: '#9ca3af' }}>{t('slots.tapToCapture')}</span>
          </>
        )}
      </button>

      <div style={{ fontSize: 11, fontWeight: 700, color: filled ? '#374151' : '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, minWidth: 0 }}>
        {filled && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" fill="#16a34a" />
            <path d="M7 12l4 4 6-6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      </div>

      {filled && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          style={{ border: 'none', background: 'none', padding: 0, fontSize: 10.5, fontWeight: 600, color: '#9ca3af', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af'; }}
        >
          Remove
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.target.value = '';
        }}
      />
    </div>
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
  <th style={{ padding: '9px 12px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px', textAlign: 'start', background: '#fff', borderBottom: '1.5px solid #f0f0f0', whiteSpace: 'nowrap', ...style }} {...rest}>
    {children}
  </th>
);

// ─── Pickup charges ───────────────────────────────────────────────────────────

/** Payload returned by `preview_pickup_charges` and `apply_pickup_charges` (jsonb). */
interface PickupCharges {
  booking_id:  number | null;
  customer_id: string | null;
  car_id:      number | null;
  rental_days: number;
  km: {
    delivery_km: number; pickup_km: number; used: number; allowed: number;
    over: number; price_per_km: number; charge: number;
  };
  fuel: {
    delivery_level: number | null; pickup_level: number | null; drop: number;
    tolerance: number; liters: number; price_per_liter: number; charge: number;
  };
  wash: { delivery_clean: string; return_clean: string; charge: number };
  total_charge: number;
  applied?: boolean;
}

/** `apply_pickup_charges` raises this when the pickup was already billed — not a failure. */
const ALREADY_APPLIED = /already applied/i;

/** Every ledger row written by `apply_pickup_charges` carries this description prefix. */
const chargeTag = (pickupId: number) => `pickup_charge:op=${pickupId}`;

const formatTry = (n: number): string =>
  `${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })} \u20ba`;

const formatKm = (n: number): string =>
  Number(n).toLocaleString('en-US', { maximumFractionDigits: 1 });

/** One-line billing summary — only the lines that actually cost something. */
function summarizeCharges(c: PickupCharges): string {
  const parts: string[] = [];
  if (Number(c.km.charge)   > 0) parts.push(`extra km ${formatTry(c.km.charge)}`);
  if (Number(c.fuel.charge) > 0) parts.push(`fuel ${formatTry(c.fuel.charge)}`);
  if (Number(c.wash.charge) > 0) parts.push(`wash ${formatTry(c.wash.charge)}`);
  const breakdown = parts.length > 1
    ? `${parts.join(' + ')} = ${formatTry(c.total_charge)}`
    : parts[0];
  return `Charged to the customer wallet: ${breakdown}`;
}

/**
 * Bills the customer wallet for a freshly created pickup. Called exactly once, right
 * after the pickup row is inserted — the report modal only ever previews. Never throws:
 * the operation is already saved, and an unapplied charge can be recorded later.
 */
async function applyPickupCharges(pickupId: number, uid: string | null): Promise<SaveNotice> {
  const { data, error } = await supabase.rpc('apply_pickup_charges', {
    p_pickup_operation_id: pickupId,
    p_created_by: uid,
  });

  if (error) {
    return ALREADY_APPLIED.test(error.message)
      ? { message: 'Pickup saved \u2014 charges were already recorded.', kind: 'muted' }
      : { message: `Pickup saved, but charges could not be applied: ${error.message}`, kind: 'error' };
  }

  const charges = data as PickupCharges | null;
  if (!charges || Number(charges.total_charge) <= 0) {
    return { message: 'Pickup saved \u2014 no extra charges.', kind: 'muted' };
  }
  return { message: summarizeCharges(charges), kind: 'success' };
}

// ─── Toast ────────────────────────────────────────────────────────────────────

type ToastKind = 'success' | 'error' | 'muted';

/** What a save wants the page to announce, instead of the generic success toast. */
interface SaveNotice { message: string; kind: ToastKind }

const TOAST_SKIN: Record<ToastKind, { bg: string; color: string; border: string }> = {
  success: { bg: '#0f1117', color: '#ffffff', border: 'none' },
  error:   { bg: '#fff1f2', color: '#ef4444', border: '1px solid #fecaca' },
  muted:   { bg: '#f9fafb', color: '#4b5563', border: '1px solid #e5e7eb' },
};

const Toast: React.FC<{ message: string; kind: ToastKind }> = ({ message, kind }) =>
  ReactDOM.createPortal(
    <div style={{
      position: 'fixed', bottom: 28, insetInlineEnd: 28, zIndex: 2000,
      display: 'flex', alignItems: 'flex-start', gap: 10,
      background: TOAST_SKIN[kind].bg,
      color: TOAST_SKIN[kind].color,
      border: TOAST_SKIN[kind].border,
      borderRadius: 12, padding: '12px 18px',
      maxWidth: 'min(440px, calc(100vw - 40px))',
      fontSize: 13, fontWeight: 500, lineHeight: 1.5,
      boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      animation: 'slideUp 200ms ease',
    }}>
      <span style={{ flexShrink: 0, marginTop: 1, display: 'inline-flex' }}>
        {kind === 'success' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#16a34a"/><path d="M7 12l4 4 6-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        {kind === 'error'   && <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#ef4444" strokeWidth="1.8"/><path d="M12 8v5M12 16h.01" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/></svg>}
        {kind === 'muted'   && <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#9ca3af" strokeWidth="1.8"/><path d="M12 11v5M12 8h.01" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round"/></svg>}
      </span>
      <span>{message}</span>
    </div>,
    document.body,
  );

// ─── Add Operation Modal ──────────────────────────────────────────────────────

const ChecklistRow: React.FC<{
  label: string;
  value: ChecklistAnswer;
  onChange: (v: ChecklistAnswer) => void;
  last: boolean;
}> = ({ label, value, onChange, last }) => {
  const { t: tc } = useTranslation('common');
  return (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    padding: '9px 12px',
    borderBottom: last ? 'none' : '1px solid #f0f0f0',
    background: value === 'no' ? 'rgba(239,68,68,0.05)' : '#fff',
    transition: 'background 140ms ease',
  }}>
    <span style={{ fontSize: 13, color: '#374151', flex: '1 1 180px', minWidth: 0 }}>{label}</span>
    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
      {(['yes', 'no'] as const).map(opt => {
        const active = value === opt;
        const tone   = opt === 'yes' ? '#16a34a' : '#ef4444';
        return (
          <button
            key={opt}
            type="button"
            aria-pressed={active}
            /* Tapping the active answer clears it, so a mis-tap is recoverable. */
            onClick={() => onChange(active ? '' : opt)}
            style={{
              minHeight: 44, minWidth: 66, padding: '0 16px', borderRadius: 9,
              border: `1.5px solid ${active ? tone : '#e5e7eb'}`,
              background: active ? tone : '#fff',
              color: active ? '#fff' : '#6b7280',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit', transition: 'all 140ms ease',
            }}
          >
            {opt === 'yes' ? tc('actions.yes') : tc('actions.no')}
          </button>
          );
      })}
    </div>
  </div>
  );
};

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
  checklist_license_present: '',
  checklist_tutanak_present: '',
  checklist_air_freshener:   '',
  checklist_customer_card:   '',
});

const AddOperationModal: React.FC<{
  onClose: () => void;
  onSaved: (notice?: SaveNotice) => void;
  editOp?: Operation;
}> = ({ onClose, onSaved, editOp }) => {
  const { t } = useTranslation('operations');
  const { t: tc } = useTranslation('common');
  const dateLocale = useDateLocale();
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

  // Structured delivery/pickup capture — one file per named slot + optional scratch shots
  const [slotFiles, setSlotFiles]           = useState<Partial<Record<PhotoSlotKey, File>>>({});
  const [slotPreviews, setSlotPreviews]     = useState<Partial<Record<PhotoSlotKey, string>>>({});
  const [scratchFiles, setScratchFiles]     = useState<File[]>([]);
  const [scratchPreviews, setScratchPreviews] = useState<string[]>([]);
  const [uploadDone, setUploadDone]         = useState(0);
  const [uploadTotal, setUploadTotal]       = useState(0);

  // Structured capture replaces the free uploader for new DELIVERY / PICKUP operations only
  const isStructured   = !isEdit && (DP_TYPES as string[]).includes(form.type);
  const checklistAnswered = CHECKLIST_ITEMS.filter(i => form[i.key] !== '').length;
  const capturedCount  = PHOTO_SLOTS.filter(s => !!slotFiles[s.key]).length;
  const missingCount   = PHOTO_SLOTS.length - capturedCount;
  const photosComplete = missingCount === 0;

  // Refs to skip resets on initial mount when editing
  const skipCarResetRef     = useRef(isEdit);
  const skipBookingFillRef  = useRef(isEdit);

  // Fetch cars
  useEffect(() => {
    let active = true;
    supabase
      .from('cars')
      .select('id, plate_number, model_group:model_group_id(name)')
      .eq('is_active', true)
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

  // Blob URL previews for the named slots
  useEffect(() => {
    const entries = (Object.entries(slotFiles) as [PhotoSlotKey, File | undefined][])
      .filter((e): e is [PhotoSlotKey, File] => !!e[1])
      .map(([key, file]) => [key, URL.createObjectURL(file)] as const);
    setSlotPreviews(Object.fromEntries(entries) as Partial<Record<PhotoSlotKey, string>>);
    return () => entries.forEach(([, url]) => URL.revokeObjectURL(url));
  }, [slotFiles]);

  // Blob URL previews for the optional scratch photos
  useEffect(() => {
    const urls = scratchFiles.map(f => URL.createObjectURL(f));
    setScratchPreviews(urls);
    return () => urls.forEach(u => URL.revokeObjectURL(u));
  }, [scratchFiles]);

  const set = (k: keyof AddOpForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  /**
   * Uploads every named slot (and any scratch photos) under `basePath`, then returns the
   * `photos` jsonb payload. Throws on the first failed upload so no half-filled
   * operation is ever inserted.
   */
  const uploadStructuredPhotos = async (basePath: string): Promise<OperationPhotos> => {
    const slotUrls: Partial<Record<PhotoSlotKey, string>> = {};
    const scratchUrls: string[] = new Array(scratchFiles.length).fill('');

    const tasks: { path: string; file: File; label: string; assign: (url: string) => void }[] = [];
    for (const slot of PHOTO_SLOTS) {
      const file = slotFiles[slot.key];
      if (!file) continue;
      tasks.push({
        path:  `${basePath}/${slot.key}.jpg`,
        file,
        label: t(slot.labelKey),
        assign: url => { slotUrls[slot.key] = url; },
      });
    }
    scratchFiles.forEach((file, i) => {
      tasks.push({
        path:  `${basePath}/scratch-${i + 1}.jpg`,
        file,
        label: `Extra scratch ${i + 1}`,
        assign: url => { scratchUrls[i] = url; },
      });
    });

    setUploadDone(0);
    setUploadTotal(tasks.length);

    await runWithConcurrency(tasks, UPLOAD_CONCURRENCY, async task => {
      const { error: uploadError } = await supabase.storage
        .from('operations')
        .upload(task.path, task.file, { upsert: true, contentType: task.file.type });
      if (uploadError) throw new Error(`Failed to upload “${task.label}”: ${uploadError.message}`);
      task.assign(supabase.storage.from('operations').getPublicUrl(task.path).data.publicUrl);
      setUploadDone(d => d + 1);
    });

    return { ...slotUrls, extra_scratches: scratchUrls, base_path: basePath };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.car_id)     { setFormError(t('errors.selectCar')); return; }
    if (!form.type)       { setFormError(t('errors.selectType')); return; }
    if (!form.performed_by) { setFormError(t('errors.selectPerson')); return; }
    if (form.fuel_level === '')          { setFormError(t('errors.fuelRequired')); return; }
    if (Number(form.fuel_level) > 2000)  { setFormError(t('errors.fuelMax')); return; }
    // Required on NEW deliveries only: 169 legacy deliveries predate the checklist,
    // so editing one must never be blocked by it.
    if (!isEdit && form.type === 'DELIVERY') {
      const unanswered = CHECKLIST_ITEMS.filter(i => form[i.key] === '');
      if (unanswered.length > 0) {
        setFormError(
          t('errors.checklistIncomplete', {
            count: unanswered.length,
            items: unanswered.map(i => t(i.labelKey)).join(', '),
          })
        );
        return;
      }
    }
    if (isStructured) {
      if (!form.operation_date) { setFormError(t('errors.dateRequired')); return; }
      if (!photosComplete) {
        const missing = PHOTO_SLOTS.filter(s => !slotFiles[s.key]).map(s => t(s.labelKey));
        setFormError(t('errors.photosMissing', { count: missing.length, items: missing.join(', ') }));
        return;
      }
    }

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

    // An unanswered item saves as null, never false: editing a pre-checklist delivery
    // must not silently record four "No" answers. Non-DELIVERY types clear all four.
    for (const item of CHECKLIST_ITEMS) {
      const answer = form[item.key];
      corePayload[item.key] = (form.type === 'DELIVERY' && answer !== '')
        ? (answer === 'yes')
        : null;
    }

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

    // ── Structured DELIVERY / PICKUP: upload every photo first, insert only if all succeed ──
    if (isStructured) {
      const car       = cars.find(c => String(c.id) === form.car_id);
      const plate     = plateForPath(car?.plate_number ?? 'unknown') || 'unknown';
      const typePart  = form.type.toLowerCase();
      const folderUid = newFolderUid();
      const basePath  = `${plate}/${typePart}-${form.operation_date}/${folderUid}`;

      setSaveStep('uploading');
      let photosPayload: OperationPhotos;
      try {
        photosPayload = await uploadStructuredPhotos(basePath);
      } catch (uploadErr) {
        setSaving(false);
        setFormError(uploadErr instanceof Error ? uploadErr.message : t('errors.photoUpload'));
        return;
      }

      setSaveStep('saving');
      const { data: structuredRow, error: structuredInsertError } = await supabase
        .from('operations')
        .insert({ ...corePayload, created_by: uid, photos: photosPayload })
        .select('id')
        .single();

      if (structuredInsertError) { setSaving(false); setFormError(structuredInsertError.message); return; }

      // Charges are applied here and nowhere else — one pickup, one billing.
      const structuredNotice = form.type === 'PICKUP' && structuredRow
        ? await applyPickupCharges(structuredRow.id, uid)
        : undefined;

      setSaving(false);
      onSaved(structuredNotice);
      return;
    }

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

    const { data: insertedRow, error: insertError } = await supabase
      .from('operations')
      .insert(insertPayload)
      .select('id')
      .single();
    if (insertError) { setSaving(false); setFormError(insertError.message); return; }

    // Upload photos if any
    let failCount = 0;
    if (photos.length > 0) {
      setSaveStep('uploading');
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
    }

    const chargeNotice = form.type === 'PICKUP' && insertedRow
      ? await applyPickupCharges(insertedRow.id, uid)
      : undefined;

    setSaving(false);
    if (failCount > 0) {
      const photoWarning = `${failCount} photo(s) failed to upload. Operation was saved.`;
      onSaved({
        message: chargeNotice ? `${photoWarning} ${chargeNotice.message}` : photoWarning,
        kind: 'error',
      });
    } else {
      onSaved(chargeNotice);
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
            <div style={{ fontSize: 18, fontWeight: 800, color: '#0f1117', letterSpacing: '-0.3px' }}>{isEdit ? t('form.editTitle') : t('form.newTitle')}</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 3 }}>{isEdit ? t('form.editSubtitle') : 'Fill in the details below to log a new operation'}</div>
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
            {t('sections.operationDetails')}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 20px', marginBottom: 16 }}>

            {/* Type */}
            <div style={fieldStyle}>
              <label style={labelStyle}>{t('form.operationType')} <span style={{ color: '#ef4444' }}>*</span></label>
              <select value={form.type} onChange={set('type')} onFocus={onFocus} onBlur={onBlur} style={selectStyle} required>
                {ALL_OP_TYPES.map(ty => (
                  <option key={ty} value={ty}>{t(`types.${ty}`)}</option>
                ))}
              </select>
            </div>

            {/* Car */}
            <div style={fieldStyle}>
              <label style={labelStyle}>{tc('fields.car')} <span style={{ color: '#ef4444' }}>*</span></label>
              <select value={form.car_id} onChange={set('car_id')} onFocus={onFocus} onBlur={onBlur} style={selectStyle} required>
                <option value="">{carsLoading ? t('form.loadingCars') : t('form.selectCar')}</option>
                {cars.map(c => (
                  <option key={c.id} value={String(c.id)}>
                    {c.plate_number}{c.model_group?.name ? ` — ${c.model_group.name}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Handled By */}
            <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
              <label style={labelStyle}>{t('form.handledBy')} <span style={{ color: '#ef4444' }}>*</span></label>
              <select value={form.performed_by} onChange={set('performed_by')} onFocus={onFocus} onBlur={onBlur} style={selectStyle} required>
                <option value="">{profilesLoading ? t('form.loadingStaff') : t('form.selectPerson')}</option>
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.full_name ?? p.id}</option>
                ))}
              </select>
            </div>

            {/* Customer + Booking ID — only for DELIVERY / PICKUP */}
            {(DP_TYPES as string[]).includes(form.type) && (
              <>
                <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>{tc('fields.customer')} <span style={{ color: '#9ca3af', fontWeight: 400 }}>{t('form.optional')}</span></label>
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
                        ? t('form.selectCarFirst')
                        : customersLoading
                          ? t('form.loadingCustomers')
                          : customers.length === 0
                            ? t('form.noCustomers')
                            : t('form.selectCustomer')}
                    </option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>
                    {t('form.bookingId')}{' '}
                    <span style={{ color: '#9ca3af', fontWeight: 400 }}>{t('form.optional')}</span>
                    {bookingLoading && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ marginInlineStart: 6, animation: 'spin 0.7s linear infinite', verticalAlign: 'middle', color: '#4ba6ea' }}>
                        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="28 56"/>
                      </svg>
                    )}
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder={t('form.autoFilled')}
                    value={form.booking_id}
                    readOnly
                    style={{ ...inputStyle, background: '#f3f4f6', color: form.booking_id ? '#374151' : '#9ca3af', cursor: 'not-allowed' }}
                  />
                </div>
              </>
            )}

            {/* Date */}
            <div style={fieldStyle}>
              <label style={labelStyle}>{t('form.operationDate')} <span style={{ color: '#ef4444' }}>*</span></label>
              <input type="date" value={form.operation_date} onChange={set('operation_date')} onFocus={onFocus} onBlur={onBlur} style={inputStyle} required />
            </div>

            {/* Time */}
            <div style={fieldStyle}>
              <label style={labelStyle}>{t('form.operationTime')}</label>
              <input type="time" value={form.operation_time} onChange={set('operation_time')} onFocus={onFocus} onBlur={onBlur} style={inputStyle} />
            </div>

            {/* Mileage */}
            <div style={fieldStyle}>
              <label style={labelStyle}>{t('form.mileage')}</label>
              <input type="number" min="0" placeholder={t('form.mileagePlaceholder')} value={form.current_km} onChange={set('current_km')} onFocus={onFocus} onBlur={onBlur} style={inputStyle} />
            </div>

            {/* Fuel Level */}
            <div style={fieldStyle}>
              <label style={labelStyle}>{t('form.fuelRange')} <span style={{ color: '#ef4444' }}>*</span></label>
              <input
                type="number"
                min="0"
                max="2000"
                placeholder={t('form.fuelPlaceholder')}
                value={form.fuel_level}
                onChange={e => {
                  setForm(f => ({ ...f, fuel_level: e.target.value }));
                  if (e.target.value !== '' && Number(e.target.value) > 2000) {
                    setFormError(t('errors.fuelMax'));
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
              <label style={labelStyle}>{t('form.cleanliness')}</label>
              <select value={form.cleanliness_status} onChange={set('cleanliness_status')} onFocus={onFocus} onBlur={onBlur} style={selectStyle}>
                <option value="">{t('form.notSpecified')}</option>
                <option value="clean">✅ Clean</option>
                <option value="not_clean">❌ Not clean</option>
              </select>
            </div>

            {/* Location */}
            <div style={fieldStyle}>
              <label style={labelStyle}>{t('form.location')} <span style={{ color: '#9ca3af', fontWeight: 400 }}>{t('form.optional')}</span></label>
              <input type="text" placeholder={t('form.locationPlaceholder')} value={form.location_text} onChange={set('location_text')} onFocus={onFocus} onBlur={onBlur} style={inputStyle} />
            </div>
          </div>

          {/* Note */}
          <div style={{ ...fieldStyle, marginBottom: 20 }}>
            <label style={labelStyle}>{t('form.note')} <span style={{ color: '#9ca3af', fontWeight: 400 }}>{t('form.optional')}</span></label>
            <textarea
              rows={3}
              placeholder={t('form.notePlaceholder')}
              value={form.note}
              onChange={set('note')}
              onFocus={onFocus}
              onBlur={onBlur}
              style={{ ...inputStyle, height: 'auto', padding: '10px 12px', resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>

          {/* Delivery checklist — DELIVERY only; required on new, optional on edit */}
          {form.type === 'DELIVERY' && (
            <div style={{ ...fieldStyle, marginBottom: 20 }}>
              <div style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                gap: 10, marginBottom: 10, flexWrap: 'wrap',
              }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>
                  {t('sections.deliveryChecklist')} {!isEdit && <span style={{ color: '#ef4444' }}>*</span>}
                </label>
                <span style={{
                  fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                  color: checklistAnswered === CHECKLIST_ITEMS.length ? '#16a34a' : '#4ba6ea',
                }}>
                  {checklistAnswered}/{CHECKLIST_ITEMS.length} answered
                </span>
              </div>

              <div style={{ border: '1.5px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
                {CHECKLIST_ITEMS.map((item, idx) => (
                  <ChecklistRow
                    key={item.key}
                    label={t(item.labelKey)}
                    value={form[item.key]}
                    last={idx === CHECKLIST_ITEMS.length - 1}
                    onChange={v => setForm(f => ({ ...f, [item.key]: v } as AddOpForm))}
                  />
                ))}
              </div>

              {isEdit && (
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6, lineHeight: 1.5 }}>
                  Optional when editing — deliveries recorded before this checklist existed stay unanswered.
                </div>
              )}
            </div>
          )}

          {/* Structured photo slots — new DELIVERY / PICKUP operations only */}
          {isStructured && (
            <div style={fieldStyle}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>
                  {t('sections.vehiclePhotos')} <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <span style={{ fontSize: 12, fontWeight: 700, color: photosComplete ? '#16a34a' : '#4ba6ea', whiteSpace: 'nowrap' }}>
                  {capturedCount} / {PHOTO_SLOTS.length} photos captured
                </span>
              </div>

              {/* Progress bar */}
              <div style={{ height: 5, borderRadius: 99, background: '#f0f0f0', overflow: 'hidden', marginBottom: 10 }}>
                <div style={{ height: '100%', width: `${(capturedCount / PHOTO_SLOTS.length) * 100}%`, background: photosComplete ? '#16a34a' : '#4ba6ea', borderRadius: 99, transition: 'width 200ms ease' }} />
              </div>

              {/* Diagram legend */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
                <AreaLegendChip area="exterior" label={t('slots.exterior')} />
                <AreaLegendChip area="interior" label={t('slots.interior')} />
                <span style={{ fontSize: 10.5, color: '#9ca3af', fontWeight: 500 }}>
                  {t('form.tapPosition')}
                </span>
              </div>

              {/* 13 mandatory slots — 2 columns on phones, more on wider screens */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))', gap: 12 }}>
                {PHOTO_SLOTS.map(slot => (
                  <PhotoSlotCard
                    key={slot.key}
                    label={t(slot.labelKey)}
                    diagram={{ area: slot.area, highlight: slot.highlight }}
                    previewUrl={slotPreviews[slot.key]}
                    onPick={file => {
                      setSlotFiles(prev => ({ ...prev, [slot.key]: file }));
                      setFormError(null);
                    }}
                    onRemove={() => setSlotFiles(prev => {
                      const next = { ...prev };
                      delete next[slot.key];
                      return next;
                    })}
                  />
                ))}
              </div>

              {/* Optional extra scratches */}
              <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid #f0f0f0' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>
                    {t('sections.extraScratches')} <span style={{ color: '#9ca3af', fontWeight: 400 }}>{t('form.optional')}</span>
                  </label>
                  <span style={{ fontSize: 11.5, color: '#9ca3af', whiteSpace: 'nowrap' }}>
                    {scratchFiles.length} / {MAX_SCRATCH_PHOTOS}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))', gap: 12 }}>
                  {scratchFiles.map((_, i) => (
                    <PhotoSlotCard
                      key={`scratch-${i}`}
                      label={`Scratch ${i + 1}`}
                      previewUrl={scratchPreviews[i]}
                      onPick={file => setScratchFiles(prev => prev.map((f, idx) => (idx === i ? file : f)))}
                      onRemove={() => setScratchFiles(prev => prev.filter((_, idx) => idx !== i))}
                    />
                  ))}
                  {scratchFiles.length < MAX_SCRATCH_PHOTOS && (
                    <PhotoSlotCard
                      label={`Add scratch ${scratchFiles.length + 1}`}
                      onPick={file => setScratchFiles(prev => [...prev, file])}
                    />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Photos — add mode only, non-structured types */}
          {!isEdit && !isStructured && <div style={fieldStyle}>
            <label style={labelStyle}>
              {t('form.photos')} <span style={{ color: '#9ca3af', fontWeight: 400 }}>{t('form.optional')}</span>
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
                {photos.length > 0 ? `${photos.length} photo${photos.length > 1 ? 's' : ''} selected — click to add more` : t('form.clickToSelect')}
              </span>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>{t('form.accepted')}</span>
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
                      style={{ position: 'absolute', top: 4, insetInlineEnd: 4, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
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
        <div style={{ padding: '16px 28px 24px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', flexShrink: 0 }}>
          {isStructured && !photosComplete && !saving && (
            <span style={{ fontSize: 11.5, color: '#9ca3af', marginInlineEnd: 'auto', lineHeight: 1.4 }}>
              {missingCount} more photo{missingCount > 1 ? 's' : ''} needed to save
            </span>
          )}
          <button type="button" onClick={onClose}
            style={{ height: 40, padding: '0 20px', borderRadius: 10, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 140ms ease' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#d1d5db'; (e.currentTarget as HTMLButtonElement).style.background = '#f9fafb'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; (e.currentTarget as HTMLButtonElement).style.background = '#fff'; }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={saving || (isStructured && !photosComplete)}
            style={{ height: 40, padding: '0 24px', borderRadius: 10, border: 'none', background: (saving || (isStructured && !photosComplete)) ? '#93c5fd' : '#4ba6ea', fontSize: 13, fontWeight: 700, color: '#fff', cursor: (saving || (isStructured && !photosComplete)) ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'background 140ms ease', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            {saving ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.7s linear infinite' }}>
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="28 56"/>
                </svg>
                {saveStep === 'uploading'
                  ? (uploadTotal > 0 ? `Uploading ${uploadDone} / ${uploadTotal}…` : t('form.uploading'))
                  : t('form.saving')}
              </>
            ) : isEdit ? t('form.saveChanges') : t('form.saveOperation')}
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
  const { t } = useTranslation('operations');
  const { t: tc } = useTranslation('common');
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
        <div style={{ fontSize: 16, fontWeight: 800, color: '#0f1117', marginBottom: 8, letterSpacing: '-0.3px' }}>{t('delete.title')}</div>
        <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6, marginBottom: 24 }}>
          {t('delete.body')}<br/>{t('delete.irreversible')}
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
                {t('delete.deleting')}
              </>
            ) : tc('actions.delete')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─── Photos Modal ─────────────────────────────────────────────────────────────

const PhotosModal: React.FC<{ operation: Operation; onClose: () => void }> = ({ operation, onClose }) => {
  const { t } = useTranslation('operations');
  const structured    = hasStructuredPhotos(operation.photos);
  const folderUrl     = operation.folder_url;
  const showChecklist = operation.type === 'DELIVERY' && hasChecklist(operation);

  const [listed, setListed]     = useState<string[]>([]);
  const [fetching, setFetching] = useState(!structured && !!folderUrl);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  // Single cache-buster per open — fixed filenames mean the CDN may still hold a previous shot
  const cacheBust = useMemo(() => Date.now(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (lightbox) setLightbox(null); else onClose(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, lightbox]);

  useEffect(() => {
    if (structured || !folderUrl) return;
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
        if (!data || data.length === 0) { setListed([]); return; }
        const urls = data
          .filter(f => f.name && !f.name.startsWith('.'))
          .map(f => supabase.storage.from('operations').getPublicUrl(`${folderPath}/${f.name}`).data.publicUrl);
        setListed(urls);
      });
    return () => { active = false; };
  }, [folderUrl, structured]);

  // Named slots first (in capture order), then any extra scratches
  const photos: { label: string; url: string }[] = useMemo(() => {
    if (!structured) return listed.map((url, i) => ({ label: t('photos.photoN', { n: i + 1 }), url }));
    const p = operation.photos!;
    const items: { label: string; url: string }[] = [];
    for (const slot of PHOTO_SLOTS) {
      const url = p[slot.key];
      if (url) items.push({ label: t(slot.labelKey), url: `${url}?t=${cacheBust}` });
    }
    (p.extra_scratches ?? []).forEach((url, i) => {
      if (url) items.push({ label: t('photos.extraScratch', { n: i + 1 }), url: `${url}?t=${cacheBust}` });
    });
    return items;
  }, [structured, listed, operation.photos, cacheBust]);

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
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0f1117', letterSpacing: '-0.3px' }}>{t('photos.title')}</div>
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
            {showChecklist && (
              <div style={{ marginBottom: 20 }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: '#374151',
                  textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8,
                }}>
                  Delivery Checklist
                </div>
                <div style={{ border: '1.5px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
                  {CHECKLIST_ITEMS.map((item, idx) => {
                    const v = operation[item.key];
                    return (
                      <div
                        key={item.key}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          gap: 12, padding: '9px 12px', flexWrap: 'wrap',
                          borderBottom: idx === CHECKLIST_ITEMS.length - 1 ? 'none' : '1px solid #f0f0f0',
                          background: v === false ? 'rgba(239,68,68,0.06)' : '#fff',
                        }}
                      >
                        <span style={{ fontSize: 13, color: '#374151', flex: '1 1 180px', minWidth: 0 }}>
                          {t(item.labelKey)}
                        </span>
                        <span style={{
                          fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
                          color: v === true ? '#16a34a' : v === false ? '#ef4444' : '#9ca3af',
                        }}>
                          {v === true ? '\u2713 Yes' : v === false ? '\u2717 No' : '\u2014'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

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

            {!fetching && !fetchErr && photos.length === 0 && !showChecklist && (
              <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style={{ margin: '0 auto 12px', display: 'block', color: '#d1d5db' }}>
                  <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5"/>
                  <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
                  <path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#6b7280' }}>{t('photos.none')}</div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>{t('photos.emptyFolder')}</div>
              </div>
            )}

            {!fetching && !fetchErr && photos.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                {photos.map(({ label, url }, i) => (
                  <button
                    key={i}
                    onClick={() => setLightbox(url)}
                    title={label}
                    style={{ position: 'relative', aspectRatio: '4/3', borderRadius: 10, overflow: 'hidden', border: '1.5px solid #e5e7eb', cursor: 'zoom-in', padding: 0, background: '#f9fafb', display: 'block', width: '100%', transition: 'border-color 140ms ease, transform 140ms ease' }}
                    onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#4ba6ea'; b.style.transform = 'scale(1.02)'; }}
                    onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#e5e7eb'; b.style.transform = 'scale(1)'; }}
                  >
                    <img
                      src={url}
                      alt={label}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                    {structured && (
                      <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: 'rgba(15,17,23,0.62)', color: '#fff', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.3px', padding: '4px 6px', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {label}
                      </span>
                    )}
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
            alt={t('photos.fullSize')}
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', borderRadius: 10, boxShadow: '0 24px 80px rgba(0,0,0,0.6)', cursor: 'default' }}
          />
          <button
            onClick={() => setLightbox(null)}
            style={{ position: 'fixed', top: 20, insetInlineEnd: 20, width: 40, height: 40, borderRadius: 10, border: 'none', background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
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
            style={{ position: 'fixed', top: 20, insetInlineEnd: 68, width: 40, height: 40, borderRadius: 10, border: 'none', background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', textDecoration: 'none' }}
            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.22)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.12)'; }}
            title={t('photos.openTab')}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M15 3h6v6M10 14L21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </a>
        </div>
      )}
    </>,
    document.body,
  );
};

// ─── Pickup Report Modal ──────────────────────────────────────────────────────

type MatchMethod = 'booking' | 'car';

interface DeliveryMatch {
  operation_date: string;
  current_km: number | null;
  fuel_level: number | null;
  cleanliness_status: string | null;
}

const DELIVERY_SELECT = 'operation_date, current_km, fuel_level, cleanliness_status';

/** Module-level, so the translator is passed in. The raw enum is what the
    database stores; only its rendering changes. */
function formatCleanliness(v: string | null, t: TFunction): string {
  if (v === 'clean')     return t('report.cleanValue');
  if (v === 'not_clean') return t('report.notCleanValue');
  return '—';
}

function daysBetween(fromDate: string, toDate: string): number | null {
  const a = new Date(fromDate + 'T00:00:00');
  const b = new Date(toDate + 'T00:00:00');
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/** Module-level, so the translator is passed in rather than hooked. */
function formatDuration(days: number, t: TFunction): string {
  if (days === 0) return t('sameDay');
  return t('days', { count: days });
}

const MetricCard: React.FC<{
  label: string;
  value: React.ReactNode;
  raw: React.ReactNode;
  incomplete: boolean;
  warning?: string;
}> = ({ label, value, raw, incomplete, warning }) => {
  const { t } = useTranslation('operations');
  return (
  <div style={{ border: '1px solid #f0f0f0', borderRadius: 12, padding: '14px 16px', background: '#fafafa' }}>
    <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 8 }}>
      {label}
    </div>
    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.6px', lineHeight: 1.1, color: '#0f1117', fontVariantNumeric: 'tabular-nums' }}>
      {value}
    </div>
    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 7 }}>{raw}</div>
    {incomplete && (
      <div style={{ fontSize: 11, color: '#d97706', marginTop: 5, fontWeight: 600 }}>{t('report.incompleteData')}</div>
    )}
    {warning && (
      <div style={{ fontSize: 11, color: '#b45309', marginTop: 5, fontWeight: 600 }}>{warning}</div>
    )}
  </div>
  );
};

const ChargeRow: React.FC<{
  label: string;
  detail: React.ReactNode;
  amount: number;
  isTotal?: boolean;
}> = ({ label, detail, amount, isTotal = false }) => (
  <div style={{
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    gap: 14, padding: '12px 0',
    borderTop: isTotal ? '1px solid #e5e7eb' : 'none',
    borderBottom: isTotal ? 'none' : '1px solid #f0f0f0',
  }}>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: isTotal ? 13 : 13, fontWeight: isTotal ? 800 : 600, color: '#0f1117' }}>{label}</div>
      {detail && <div style={{ fontSize: 11.5, color: '#6b7280', marginTop: 3, lineHeight: 1.45 }}>{detail}</div>}
    </div>
    <div style={{
      fontSize: isTotal ? 16 : 14, fontWeight: isTotal ? 800 : 700,
      fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
      letterSpacing: isTotal ? '-0.3px' : undefined,
      color: amount > 0 ? '#0f1117' : '#d1d5db',
    }}>
      {amount > 0 ? formatTry(amount) : '\u2014'}
    </div>
  </div>
);

const PickupReportModal: React.FC<{ pickup: Operation; onClose: () => void }> = ({ pickup, onClose }) => {
  const { t } = useTranslation('operations');
  const dateLocale = useDateLocale();
  const [delivery, setDelivery]   = useState<DeliveryMatch | null>(null);
  const [method, setMethod]       = useState<MatchMethod | null>(null);
  const [fetching, setFetching]   = useState(true);
  const [fetchErr, setFetchErr]   = useState<string | null>(null);

  const [charges, setCharges]               = useState<PickupCharges | null>(null);
  const [chargesLoading, setChargesLoading] = useState(true);
  const [chargesErr, setChargesErr]         = useState<string | null>(null);
  const [chargesApplied, setChargesApplied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    setFetching(true);
    setFetchErr(null);
    setDelivery(null);
    setMethod(null);

    (async () => {
      // 1. Primary match — same booking_id
      if (pickup.booking_id != null) {
        const { data, error } = await supabase
          .from('operations')
          .select(DELIVERY_SELECT)
          .eq('type', 'DELIVERY')
          .eq('booking_id', pickup.booking_id)
          .order('operation_date', { ascending: false })
          .limit(1);
        if (!active) return;
        if (error) { setFetchErr(error.message); setFetching(false); return; }
        if (data && data.length > 0) {
          setDelivery(data[0] as DeliveryMatch);
          setMethod('booking');
          setFetching(false);
          return;
        }
      }

      // 2. Fallback match — latest DELIVERY for the same car on/before the pickup date
      const { data, error } = await supabase
        .from('operations')
        .select(DELIVERY_SELECT)
        .eq('type', 'DELIVERY')
        .eq('car_id', pickup.car_id)
        .lte('operation_date', pickup.operation_date)
        .order('operation_date', { ascending: false })
        .order('operation_time', { ascending: false, nullsFirst: false })
        .limit(1);
      if (!active) return;
      setFetching(false);
      if (error) { setFetchErr(error.message); return; }
      if (data && data.length > 0) {
        setDelivery(data[0] as DeliveryMatch);
        setMethod('car');
      }
    })();

    return () => { active = false; };
  }, [pickup.booking_id, pickup.car_id, pickup.operation_date]);

  // ── Charges ────────────────────────────────────────────────────────────────
  // Preview only. Billing runs once, at pickup save time — never on modal open.
  useEffect(() => {
    let active = true;
    setChargesLoading(true);
    setChargesErr(null);
    setCharges(null);
    setChargesApplied(false);

    (async () => {
      const [preview, ledger] = await Promise.all([
        supabase.rpc('preview_pickup_charges', { p_pickup_operation_id: pickup.id }),
        supabase
          .from('customer_accounting_ledger')
          .select('id')
          .like('description', `${chargeTag(pickup.id)}%`)
          .limit(1),
      ]);
      if (!active) return;
      setChargesLoading(false);
      if (preview.error) { setChargesErr(preview.error.message); return; }
      setCharges(preview.data as PickupCharges);
      setChargesApplied(!ledger.error && (ledger.data?.length ?? 0) > 0);
    })();

    return () => { active = false; };
  }, [pickup.id]);

  // ── Metrics ────────────────────────────────────────────────────────────────
  const durationDays = delivery != null && delivery.operation_date && pickup.operation_date
    ? daysBetween(delivery.operation_date, pickup.operation_date)
    : null;

  const kmOk   = delivery != null && delivery.current_km != null && pickup.current_km != null;
  const kmUsed = kmOk ? (pickup.current_km as number) - (delivery!.current_km as number) : null;

  const fuelOk   = delivery != null && delivery.fuel_level != null && pickup.fuel_level != null;
  const fuelDiff = fuelOk ? (pickup.fuel_level as number) - (delivery!.fuel_level as number) : null;

  // Legacy rows stored fuel as a 0–100 percentage; new rows store range in km.
  // Flag only when the two readings sit in different magnitudes — never convert.
  const fuelUnitsSuspect = fuelOk
    && ((delivery!.fuel_level as number) <= 100) !== ((pickup.fuel_level as number) <= 100);

  const cleanOk = delivery != null && delivery.cleanliness_status != null && pickup.cleanliness_status != null;
  const washNeeded = cleanOk
    && delivery!.cleanliness_status === 'clean'
    && pickup.cleanliness_status === 'not_clean';

  const dash = <span style={{ color: '#d1d5db' }}>—</span>;

  return ReactDOM.createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(15,17,23,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'fadeIn 150ms ease' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 560, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.2)', animation: 'slideUp 180ms ease' }}
      >
        {/* Header */}
        <div style={{ padding: '22px 26px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#0f1117', letterSpacing: '-0.3px' }}>
              {t('report.title')} — {pickup.plate_number}
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 3 }}>
              {t('report.pickupOn')} {formatDate(pickup.operation_date, dateLocale)}
            </div>
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
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 26px 24px' }}>
          {fetching && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ height: i === 0 ? 44 : 84, borderRadius: 12, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
              ))}
            </div>
          )}

          {!fetching && fetchErr && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, fontSize: 13, color: '#ef4444' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.8"/><path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"/></svg>
              {fetchErr}
            </div>
          )}

          {!fetching && !fetchErr && !delivery && (
            <div style={{ textAlign: 'center', padding: '44px 0', color: '#6b7280', fontSize: 14, fontWeight: 500 }}>
              {t('report.noMatch')}
            </div>
          )}

          {!fetching && !fetchErr && delivery && (
            <>
              {/* Match info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
                <span style={{ fontSize: 13, color: '#374151' }}>
                  {t('report.matchedDelivery')} <strong style={{ color: '#0f1117' }}>{formatDate(delivery.operation_date, dateLocale)}</strong>
                </span>
                {method === 'booking' ? (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', background: 'rgba(22,163,74,0.12)', borderRadius: 20, padding: '4px 10px' }}>
                    {t('report.matchedByBooking')}
                  </span>
                ) : (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#b45309', background: 'rgba(245,158,11,0.15)', borderRadius: 20, padding: '4px 10px' }}>
                    {t('report.approximate')}
                  </span>
                )}
              </div>

              {/* Metrics */}
              <div style={{ display: 'grid', gap: 12 }}>
                <MetricCard
                  label={t('report.rentalDuration')}
                  incomplete={durationDays == null}
                  value={durationDays != null ? formatDuration(durationDays, t) : dash}
                  raw={
                    <>
                      {t('report.deliveryLabel')} {formatDate(delivery.operation_date, dateLocale)}
                      {' → '}
                      {t('report.pickupLabel')} {formatDate(pickup.operation_date, dateLocale)}
                    </>
                  }
                />

                <MetricCard
                  label={t('report.kilometersUsed')}
                  incomplete={!kmOk}
                  value={kmOk ? `${Math.round(kmUsed as number).toLocaleString()} km` : dash}
                  raw={
                    <>
                      {t('report.deliveryLabel')} {delivery.current_km != null ? `${delivery.current_km.toLocaleString()} km` : '—'}
                      {' → '}
                      {t('report.pickupLabel')} {pickup.current_km != null ? `${pickup.current_km.toLocaleString()} km` : '—'}
                    </>
                  }
                />

                <MetricCard
                  label={t('report.fuelDifference')}
                  incomplete={!fuelOk}
                  warning={fuelUnitsSuspect ? t('report.inconsistentFuel') : undefined}
                  value={
                    fuelOk
                      ? <span style={{ color: (fuelDiff as number) < 0 ? '#ef4444' : '#16a34a' }}>
                          {(fuelDiff as number) < 0 ? '−' : '+'}{Math.abs(fuelDiff as number).toLocaleString()} km
                        </span>
                      : dash
                  }
                  raw={
                    <>
                      {t('report.deliveryLabel')} {delivery.fuel_level != null ? `${delivery.fuel_level.toLocaleString()} km` : '—'}
                      {' → '}
                      {t('report.pickupLabel')} {pickup.fuel_level != null ? `${pickup.fuel_level.toLocaleString()} km` : '—'}
                    </>
                  }
                />

                <MetricCard
                  label={t('report.cleanliness')}
                  incomplete={!cleanOk}
                  value={
                    !cleanOk
                      ? dash
                      : washNeeded
                        ? <span style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', background: 'rgba(239,68,68,0.12)', borderRadius: 20, padding: '5px 12px', display: 'inline-block' }}>{t('report.washNeeded')}</span>
                        : <span style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', background: 'rgba(22,163,74,0.12)', borderRadius: 20, padding: '5px 12px', display: 'inline-block' }}>{t('report.noWashNeeded')}</span>
                  }
                  raw={
                    <>
                      {t('report.deliveredLabel')} {formatCleanliness(delivery.cleanliness_status, t)}
                      {' → '}
                      {t('report.returned')} {formatCleanliness(pickup.cleanliness_status, t)}
                    </>
                  }
                />
              </div>

            </>
          )}

          {/* Charges due — read-only preview; billing happens once, at pickup save time */}
          {!fetching && (
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #f0f0f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px' }}>
                  {t('sections.chargesDue')}
                </div>
                {chargesApplied && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', background: 'rgba(22,163,74,0.12)', borderRadius: 20, padding: '4px 10px' }}>
                    ✓ Applied to wallet
                  </span>
                )}
              </div>

              {chargesLoading && (
                <div style={{ height: 180, borderRadius: 12, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
              )}

              {!chargesLoading && chargesErr && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, fontSize: 13, color: '#ef4444' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.8"/><path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"/></svg>
                  {chargesErr}
                </div>
              )}

              {!chargesLoading && !chargesErr && charges && (
                <>
                  {Number(charges.km.delivery_km) === 0 && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '11px 14px', marginBottom: 12, background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 10, fontSize: 12, color: '#b45309', lineHeight: 1.45 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1 }}><path d="M12 3l9 16H3l9-16z" stroke="#b45309" strokeWidth="1.8" strokeLinejoin="round"/><path d="M12 10v4M12 17h.01" stroke="#b45309" strokeWidth="1.8" strokeLinecap="round"/></svg>
                      No reference delivery operation to compare against — these figures may be incomplete.
                    </div>
                  )}

                  <div style={{ border: '1px solid #f0f0f0', borderRadius: 12, background: '#fafafa', padding: '2px 16px' }}>
                    <ChargeRow
                      label={t('report.extraKm')}
                      amount={Number(charges.km.charge)}
                      detail={
                        <>
                          {formatKm(charges.km.used)} km used · {formatKm(charges.km.allowed)} km allowed
                          {Number(charges.km.over) > 0 && <> · {formatKm(charges.km.over)} km over × {formatTry(charges.km.price_per_km)}</>}
                        </>
                      }
                    />
                    <ChargeRow
                      label={t('report.fuel')}
                      amount={Number(charges.fuel.charge)}
                      detail={
                        <>
                          {t('report.rangeDrop', {
                            drop: formatKm(charges.fuel.drop),
                            tolerance: formatKm(charges.fuel.tolerance),
                          })}
                          {Number(charges.fuel.charge) > 0 && <> · {t('report.refill', {
                            liters: formatKm(charges.fuel.liters),
                            price: formatTry(charges.fuel.price_per_liter),
                          })}</>}
                        </>
                      }
                    />
                    <ChargeRow
                      label={t('report.carWash')}
                      amount={Number(charges.wash.charge)}
                      detail={t('report.washDetail', {
                          delivered: formatCleanliness(charges.wash.delivery_clean || null, t),
                          returned: formatCleanliness(charges.wash.return_clean || null, t),
                        })}
                    />
                    <ChargeRow
                      label={t('report.total')}
                      amount={Number(charges.total_charge)}
                      detail={null}
                      isTotal
                    />
                  </div>

                  <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 9, lineHeight: 1.5 }}>
                    {chargesApplied
                      ? 'Recorded on the customer wallet when this pickup was saved.'
                      : t('report.previewOnly')}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Damage Inspection placeholder */}
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #f0f0f0' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 10 }}>
              {t('sections.damageInspection')}
            </div>
            <div style={{ border: '1.5px dashed #e5e7eb', borderRadius: 12, padding: '26px 16px', textAlign: 'center', fontSize: 13, color: '#9ca3af', background: '#fafafa' }}>
              {t('report.comingSoon')}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const OperationsPage: React.FC = () => {
  const { t } = useTranslation('operations');
  const { t: tc } = useTranslation('common');
  const dateLocale = useDateLocale();
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
  const [reportOp, setReportOp]     = useState<Operation | null>(null);
  const [toast, setToast] = useState<{ message: string; kind: ToastKind } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string, kind: ToastKind, durationMs = 3500) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, kind });
    toastTimer.current = setTimeout(() => setToast(null), durationMs);
  };

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

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
      showToast(t('toast.deleteFailed'), 'error');
    } else {
      fetchOperations(selectedMonth);
      showToast(t('toast.deleted'), 'success');
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
        current_km, fuel_level, cleanliness_status, location_text, note, booking_id, folder_url, photos,
        checklist_license_present, checklist_tutanak_present, checklist_air_freshener, checklist_customer_card,
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
    { key: 'total', label: t('stats.total'), bg: '#4ba6ea' },
    ...DP_STAT_CARDS.map(ty => ({ key: ty, label: t(`types.${ty}`), bg: TYPE_CONFIG[ty].card })),
  ];
  const otherStatCards = [
    { key: 'total', label: t('stats.total'), bg: '#4ba6ea' },
    ...OTHER_STAT_CARDS.map(ty => ({ key: ty, label: t(`types.${ty}`), bg: TYPE_CONFIG[ty].card })),
  ];
  const activeStatCards = tab === 'dp' ? dpStatCards : otherStatCards;

  return (
    <div style={{ minHeight: '100%', background: 'linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)', padding: '44px 40px' }}>

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 28 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ba6ea' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#4ba6ea', letterSpacing: '0.8px', textTransform: 'uppercase' }}>{t('eyebrow')}</span>
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.8px', color: '#0f1117', lineHeight: 1.1, marginBottom: 6 }}>{t('title')}</h1>
          <p style={{ fontSize: 15, color: '#6b7280', lineHeight: 1.5 }}>{t('subtitle')}</p>
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
          {t('addOperation')}
        </button>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 28, background: '#f3f4f6', borderRadius: 12, padding: 4, alignSelf: 'flex-start', width: 'fit-content' }}>
        {([
          { key: 'dp',    labelKey: 'tabs.dp'    },
          { key: 'other', labelKey: 'tabs.other' },
        ] as { key: TabKey; labelKey: string }[]).map(tb => (
          <button
            key={tb.key}
            onClick={() => handleTabChange(tb.key)}
            style={{
              padding: '8px 20px', borderRadius: 9, border: 'none',
              fontSize: 13, fontWeight: tab === tb.key ? 700 : 500,
              color: tab === tb.key ? '#0f1117' : '#6b7280',
              background: tab === tb.key ? '#fff' : 'transparent',
              boxShadow: tab === tb.key ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
              cursor: 'pointer', transition: 'all 160ms ease',
              fontFamily: 'inherit', whiteSpace: 'nowrap',
            }}
          >
            {t(tb.labelKey)}
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
          {formatMonthLabel(selectedMonth, dateLocale)}
        </span>
        <MonthArrow direction="right" onClick={() => setSelectedMonth(m => addMonths(m, 1))} />

        <div style={{ flex: 1, minWidth: 0 }} />

        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value as OperationType | '')}
          style={{ height: 36, padding: '0 12px', fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 9, outline: 'none', fontFamily: 'inherit', color: '#374151', background: '#fff', cursor: 'pointer' }}
        >
          <option value="">{t('table.allTypes')}</option>
          {activeTypes.map(ty => (
            <option key={ty} value={ty}>{t(`types.${ty}`)}</option>
          ))}
        </select>

        <div style={{ position: 'relative' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            style={{ position: 'absolute', insetInlineStart: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
            <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            placeholder={t('table.search')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ height: 36, paddingBlock: 0, paddingInlineStart: 32, paddingInlineEnd: 12, fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 9, outline: 'none', fontFamily: 'inherit', color: '#0f1117', background: '#fff', width: 220, transition: 'border-color 140ms ease' }}
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
                <Th>{tc('fields.date')}</Th>
                <Th>{tc('fields.type')}</Th>
                <Th>{tc('fields.plate')}</Th>
                <Th>{t('table.handledBy')}</Th>
                {tab === 'dp' && <Th>{tc('fields.customer')}</Th>}
                <Th>{t('table.mileage')}</Th>
                <Th>{t('table.fuelRange')}</Th>
                <Th style={{ textAlign: 'center' }}>{t('table.cleanliness')}</Th>
                <Th>{tc('fields.notes')}</Th>
                <Th style={{ textAlign: 'center' }}>{t('table.photos')}</Th>
                <Th style={{ textAlign: 'center' }}>{t('table.actions')}</Th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={colCount} />)}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={colCount} style={{ padding: '60px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
                    {search || typeFilter ? t('table.empty') : t('table.emptyMonth')}
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
                  <td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 500 }}>{formatDate(op.operation_date, dateLocale)}</td>

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
                      ? op.fuel_level.toLocaleString() + ' km'
                      : <span style={{ color: '#d1d5db' }}>—</span>}
                  </td>

                  <td style={{ ...td, textAlign: 'center' }}>
                    {op.cleanliness_status === 'clean'
                      ? <span title={t('table.clean')} style={{ fontSize: 16 }}>✅</span>
                      : op.cleanliness_status === 'not_clean'
                        ? <span title={t('table.notClean')} style={{ fontSize: 16 }}>❌</span>
                        : <span style={{ color: '#d1d5db' }}>—</span>
                    }
                  </td>

                  <td style={{ ...td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: op.note ? '#374151' : '#d1d5db' }}>
                    {op.note ?? '—'}
                  </td>

                  <td style={{ ...td, textAlign: 'center' }}>
                    {(op.folder_url || hasStructuredPhotos(op.photos) || (op.type === 'DELIVERY' && hasChecklist(op))) ? (
                      <button
                        onClick={() => setPhotosOp(op)}
                        title={op.folder_url || hasStructuredPhotos(op.photos) ? 'View photos' : 'View delivery checklist'}
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
                        title={t('photos.noPhotos')}
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
                      {/* Report — pickup rows only */}
                      {op.type === 'PICKUP' && (
                        <button
                          onClick={() => setReportOp(op)}
                          title={t('report.openReport')}
                          style={{ height: 32, padding: '0 10px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#f9fafb', display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', color: '#6b7280', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', transition: 'all 140ms ease', whiteSpace: 'nowrap' }}
                          onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#4ba6ea'; b.style.color = '#4ba6ea'; b.style.background = 'rgba(75,166,234,0.07)'; }}
                          onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#e5e7eb'; b.style.color = '#6b7280'; b.style.background = '#f9fafb'; }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M14 2v6h6M9 13h6M9 17h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Report
                        </button>
                      )}
                      {/* Edit */}
                      <button
                        onClick={() => setEditOp(op)}
                        title={tc('actions.edit')}
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
                        title={tc('actions.delete')}
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
              <Trans
                t={t}
                i18nKey="table.showing"
                values={{ shown: filtered.length, count: activeOps.length }}
                components={[<span />, <strong style={{ color: '#374151' }} />, <strong style={{ color: '#374151' }} />]}
              />
            </span>
          </div>
        )}
      </div>

      {/* ── Photos Modal ── */}
      {photosOp && (
        <PhotosModal
          operation={photosOp}
          onClose={() => setPhotosOp(null)}
        />
      )}

      {/* ── Pickup Report Modal ── */}
      {reportOp && (
        <PickupReportModal
          pickup={reportOp}
          onClose={() => setReportOp(null)}
        />
      )}

      {/* ── Add Modal ── */}
      {showAddModal && (
        <AddOperationModal
          onClose={() => setShowAddModal(false)}
          onSaved={(notice) => {
            setShowAddModal(false);
            fetchOperations(selectedMonth);
            // Charge summaries carry money figures — hold them long enough to read.
            if (notice) showToast(notice.message, notice.kind, 8000);
            else        showToast(t('toast.saved'), 'success');
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
            showToast(t('toast.updated'), 'success');
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
