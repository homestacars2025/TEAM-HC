import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../lib/supabase';
import type { Booking, BookingStatus } from '../types';

// ─── Raw Supabase join shapes ─────────────────────────────────────────────────

interface CarJoin {
  plate_number: string;
  model_group: { name: string } | { name: string }[] | null;
}

interface CustomerJoin {
  first_name: string;
  last_name: string;
}

interface BookingRow {
  id: number;
  booking_number: string;
  status: BookingStatus;
  car_id: number;
  customer_id: number;
  start_date: string;
  end_date: string;
  kabis_reported: boolean;
  invoice_issued: boolean;
  cars: CarJoin | CarJoin[] | null;
  customers: CustomerJoin | CustomerJoin[] | null;
}

interface CarOption {
  id: number;
  plate_number: string;
  model: string;
}

interface CustomerOption {
  id: number;
  full_name: string; // derived: first_name + ' ' + last_name
}

type SortCol = 'booking_number' | 'start_date' | 'end_date' | null;
type SortDir = 'asc' | 'desc';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMonthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function getMonthEnd(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function formatMonthLabel(d: Date): string {
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function formatDateDisplay(s: string): string {
  if (!s) return '—';
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function resolveBooking(row: BookingRow): Booking {
  const carJoin = Array.isArray(row.cars) ? row.cars[0] : row.cars;
  const mg = carJoin?.model_group;
  const car_model = Array.isArray(mg)
    ? (mg[0]?.name ?? '—')
    : (mg as { name: string } | null)?.name ?? '—';

  const custJoin = Array.isArray(row.customers) ? row.customers[0] : row.customers;
  const customer_name = custJoin
    ? `${custJoin.first_name} ${custJoin.last_name}`.trim()
    : '—';

  return {
    id: row.id,
    created_at: '',
    car_id: row.car_id,
    start_date: row.start_date,
    end_date: row.end_date,
    insurance_type: null,
    notes: null,
    pickup_location: null,
    dropoff_location: null,
    booking_number: row.booking_number,
    additional_driver: null,
    customer_id: row.customer_id,
    kabis_reported: row.kabis_reported,
    invoice_issued: row.invoice_issued,
    status: row.status,
    additional_service: null,
    plate_number: carJoin?.plate_number ?? '—',
    car_model,
    customer_name,
  };
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<BookingStatus, { label: string; color: string; bg: string }> = {
  confirmed: { label: 'Confirmed', color: '#22c55e', bg: 'rgba(34,197,94,0.12)'   },
  pending:   { label: 'Pending',   color: '#f97316', bg: 'rgba(249,115,22,0.12)'  },
  cancelled: { label: 'Cancelled', color: '#ef4444', bg: 'rgba(239,68,68,0.12)'   },
  completed: { label: 'Completed', color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

// Stat card
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

// Toggle switch
const ToggleSwitch: React.FC<{
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}> = ({ checked, onChange, disabled = false }) => (
  <button
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={e => { e.stopPropagation(); onChange(); }}
    style={{
      width: 36, height: 20, borderRadius: 10, border: 'none',
      background: checked ? '#4ba6ea' : '#d1d5db',
      cursor: disabled ? 'not-allowed' : 'pointer',
      position: 'relative', padding: 0, flexShrink: 0,
      transition: 'background 200ms ease',
      opacity: disabled ? 0.6 : 1,
    }}
  >
    <span style={{
      position: 'absolute', top: 2, left: checked ? 18 : 2,
      width: 16, height: 16, borderRadius: 8, background: '#fff',
      boxShadow: '0 1px 3px rgba(0,0,0,0.20)',
      transition: 'left 200ms ease',
      display: 'block',
    }} />
  </button>
);

// Status badge
const StatusBadge: React.FC<{ status: BookingStatus }> = ({ status }) => {
  const cfg = STATUS_CONFIG[status];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11, fontWeight: 700,
      color: cfg.color, background: cfg.bg,
      borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
};

// Skeleton row
const SkeletonRow: React.FC = () => (
  <tr>
    {[44, 100, 90, 120, 80, 130, 80, 80, 44, 44, 60].map((w, i) => (
      <td key={i} style={{ padding: '9px 12px' }}>
        <div style={{ height: 13, width: w, borderRadius: 6, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
      </td>
    ))}
  </tr>
);

// Toast
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
        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="#4ade80" strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="12" r="9" stroke="#4ade80" strokeWidth="1.8"/></svg>
        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.8"/><path d="M12 8v4M12 16h.01" stroke="white" strokeWidth="1.8" strokeLinecap="round"/></svg>
      }
      {message}
    </div>,
    document.body,
  );

// Month arrow nav button
const MonthArrow: React.FC<{ direction: 'left' | 'right'; onClick: () => void }> = ({ direction, onClick }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 36, height: 36, borderRadius: 10,
        border: `1.5px solid ${hovered ? '#4ba6ea' : '#e5e7eb'}`,
        background: hovered ? 'rgba(75,166,234,0.06)' : '#fff',
        color: hovered ? '#4ba6ea' : '#6b7280',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 140ms ease', flexShrink: 0,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        {direction === 'left'
          ? <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          : <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
        }
      </svg>
    </button>
  );
};

// Table header cell
const Th: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = ({ children, style, ...rest }) => (
  <th
    style={{
      padding: '9px 12px', fontSize: 11, fontWeight: 700,
      color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px',
      textAlign: 'left', background: '#fff',
      borderBottom: '1.5px solid #f0f0f0',
      position: 'sticky', top: 0, zIndex: 1,
      whiteSpace: 'nowrap', userSelect: 'none',
      ...style,
    }}
    {...rest}
  >
    {children}
  </th>
);

// Action icon button
const ActionBtn: React.FC<{
  onClick: () => void;
  title: string;
  hoverColor: string;
  children: React.ReactNode;
}> = ({ onClick, title, hoverColor, children }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 30, height: 30, borderRadius: 7, border: 'none',
        background: hovered ? `${hoverColor}18` : 'transparent',
        color: hovered ? hoverColor : '#9ca3af',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'all 140ms ease', flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
};

// ─── Booking table row ────────────────────────────────────────────────────────

interface RowProps {
  booking: Booking;
  isSelected: boolean;
  isEven: boolean;
  onSelect: () => void;
  onToggle: (id: number, field: 'kabis_reported' | 'invoice_issued', current: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}

const BookingTableRow: React.FC<RowProps> = ({
  booking, isSelected, isEven, onSelect, onToggle, onEdit, onDelete,
}) => (
  <tr
    className="bk-row"
    style={{ background: isSelected ? 'rgba(75,166,234,0.05)' : isEven ? '#fafafa' : '#fff' }}
  >
    <td style={{ padding: '9px 8px 9px 16px' }}>
      <input type="checkbox" checked={isSelected} onChange={onSelect}
        style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#4ba6ea' }} />
    </td>
    <td style={{ padding: '9px 12px' }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#0f1117', letterSpacing: '0.1px' }}>
        {booking.booking_number}
      </span>
    </td>
    <td style={{ padding: '9px 12px' }}>
      <StatusBadge status={booking.status} />
    </td>
    <td style={{ padding: '9px 12px' }}>
      <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{booking.car_model}</span>
    </td>
    <td style={{ padding: '9px 12px' }}>
      <span style={{
        display: 'inline-block', background: '#f3f4f6', borderRadius: 6,
        padding: '2px 8px', fontSize: 12, fontWeight: 700, color: '#0f1117', letterSpacing: '0.2px',
      }}>
        {booking.plate_number}
      </span>
    </td>
    <td style={{ padding: '9px 12px' }}>
      <span style={{ fontSize: 13, color: '#374151' }}>{booking.customer_name}</span>
    </td>
    <td style={{ padding: '9px 12px' }}>
      <span style={{ fontSize: 13, color: '#6b7280', whiteSpace: 'nowrap' }}>
        {formatDateDisplay(booking.start_date)}
      </span>
    </td>
    <td style={{ padding: '9px 12px' }}>
      <span style={{ fontSize: 13, color: '#6b7280', whiteSpace: 'nowrap' }}>
        {formatDateDisplay(booking.end_date)}
      </span>
    </td>
    <td style={{ padding: '9px 12px', textAlign: 'center' }}>
      <ToggleSwitch
        checked={booking.kabis_reported}
        onChange={() => onToggle(booking.id, 'kabis_reported', booking.kabis_reported)}
      />
    </td>
    <td style={{ padding: '9px 12px', textAlign: 'center' }}>
      <ToggleSwitch
        checked={booking.invoice_issued}
        onChange={() => onToggle(booking.id, 'invoice_issued', booking.invoice_issued)}
      />
    </td>
    <td style={{ padding: '9px 16px 9px 8px', textAlign: 'right' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
        <ActionBtn onClick={onEdit} title="Edit" hoverColor="#4ba6ea">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </ActionBtn>
        <ActionBtn onClick={onDelete} title="Delete" hoverColor="#ef4444">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </ActionBtn>
      </div>
    </td>
  </tr>
);

// ─── Country / dial-code data ─────────────────────────────────────────────────

interface Country { code: string; name: string; dial: string; flag: string; }

const COUNTRIES: Country[] = [
  { code: 'AF', name: 'Afghanistan',                    dial: '+93',   flag: '🇦🇫' },
  { code: 'AL', name: 'Albania',                        dial: '+355',  flag: '🇦🇱' },
  { code: 'DZ', name: 'Algeria',                        dial: '+213',  flag: '🇩🇿' },
  { code: 'AD', name: 'Andorra',                        dial: '+376',  flag: '🇦🇩' },
  { code: 'AO', name: 'Angola',                         dial: '+244',  flag: '🇦🇴' },
  { code: 'AG', name: 'Antigua and Barbuda',            dial: '+1268', flag: '🇦🇬' },
  { code: 'AR', name: 'Argentina',                      dial: '+54',   flag: '🇦🇷' },
  { code: 'AM', name: 'Armenia',                        dial: '+374',  flag: '🇦🇲' },
  { code: 'AU', name: 'Australia',                      dial: '+61',   flag: '🇦🇺' },
  { code: 'AT', name: 'Austria',                        dial: '+43',   flag: '🇦🇹' },
  { code: 'AZ', name: 'Azerbaijan',                     dial: '+994',  flag: '🇦🇿' },
  { code: 'BS', name: 'Bahamas',                        dial: '+1242', flag: '🇧🇸' },
  { code: 'BH', name: 'Bahrain',                        dial: '+973',  flag: '🇧🇭' },
  { code: 'BD', name: 'Bangladesh',                     dial: '+880',  flag: '🇧🇩' },
  { code: 'BB', name: 'Barbados',                       dial: '+1246', flag: '🇧🇧' },
  { code: 'BY', name: 'Belarus',                        dial: '+375',  flag: '🇧🇾' },
  { code: 'BE', name: 'Belgium',                        dial: '+32',   flag: '🇧🇪' },
  { code: 'BZ', name: 'Belize',                         dial: '+501',  flag: '🇧🇿' },
  { code: 'BJ', name: 'Benin',                          dial: '+229',  flag: '🇧🇯' },
  { code: 'BT', name: 'Bhutan',                         dial: '+975',  flag: '🇧🇹' },
  { code: 'BO', name: 'Bolivia',                        dial: '+591',  flag: '🇧🇴' },
  { code: 'BA', name: 'Bosnia and Herzegovina',         dial: '+387',  flag: '🇧🇦' },
  { code: 'BW', name: 'Botswana',                       dial: '+267',  flag: '🇧🇼' },
  { code: 'BR', name: 'Brazil',                         dial: '+55',   flag: '🇧🇷' },
  { code: 'BN', name: 'Brunei',                         dial: '+673',  flag: '🇧🇳' },
  { code: 'BG', name: 'Bulgaria',                       dial: '+359',  flag: '🇧🇬' },
  { code: 'BF', name: 'Burkina Faso',                   dial: '+226',  flag: '🇧🇫' },
  { code: 'BI', name: 'Burundi',                        dial: '+257',  flag: '🇧🇮' },
  { code: 'CV', name: 'Cabo Verde',                     dial: '+238',  flag: '🇨🇻' },
  { code: 'KH', name: 'Cambodia',                       dial: '+855',  flag: '🇰🇭' },
  { code: 'CM', name: 'Cameroon',                       dial: '+237',  flag: '🇨🇲' },
  { code: 'CA', name: 'Canada',                         dial: '+1',    flag: '🇨🇦' },
  { code: 'CF', name: 'Central African Republic',       dial: '+236',  flag: '🇨🇫' },
  { code: 'TD', name: 'Chad',                           dial: '+235',  flag: '🇹🇩' },
  { code: 'CL', name: 'Chile',                          dial: '+56',   flag: '🇨🇱' },
  { code: 'CN', name: 'China',                          dial: '+86',   flag: '🇨🇳' },
  { code: 'CO', name: 'Colombia',                       dial: '+57',   flag: '🇨🇴' },
  { code: 'KM', name: 'Comoros',                        dial: '+269',  flag: '🇰🇲' },
  { code: 'CG', name: 'Congo',                          dial: '+242',  flag: '🇨🇬' },
  { code: 'CD', name: 'Congo (DRC)',                    dial: '+243',  flag: '🇨🇩' },
  { code: 'CR', name: 'Costa Rica',                     dial: '+506',  flag: '🇨🇷' },
  { code: 'HR', name: 'Croatia',                        dial: '+385',  flag: '🇭🇷' },
  { code: 'CU', name: 'Cuba',                           dial: '+53',   flag: '🇨🇺' },
  { code: 'CY', name: 'Cyprus',                         dial: '+357',  flag: '🇨🇾' },
  { code: 'CZ', name: 'Czech Republic',                 dial: '+420',  flag: '🇨🇿' },
  { code: 'DK', name: 'Denmark',                        dial: '+45',   flag: '🇩🇰' },
  { code: 'DJ', name: 'Djibouti',                       dial: '+253',  flag: '🇩🇯' },
  { code: 'DM', name: 'Dominica',                       dial: '+1767', flag: '🇩🇲' },
  { code: 'DO', name: 'Dominican Republic',             dial: '+1809', flag: '🇩🇴' },
  { code: 'EC', name: 'Ecuador',                        dial: '+593',  flag: '🇪🇨' },
  { code: 'EG', name: 'Egypt',                          dial: '+20',   flag: '🇪🇬' },
  { code: 'SV', name: 'El Salvador',                    dial: '+503',  flag: '🇸🇻' },
  { code: 'GQ', name: 'Equatorial Guinea',              dial: '+240',  flag: '🇬🇶' },
  { code: 'ER', name: 'Eritrea',                        dial: '+291',  flag: '🇪🇷' },
  { code: 'EE', name: 'Estonia',                        dial: '+372',  flag: '🇪🇪' },
  { code: 'SZ', name: 'Eswatini',                       dial: '+268',  flag: '🇸🇿' },
  { code: 'ET', name: 'Ethiopia',                       dial: '+251',  flag: '🇪🇹' },
  { code: 'FJ', name: 'Fiji',                           dial: '+679',  flag: '🇫🇯' },
  { code: 'FI', name: 'Finland',                        dial: '+358',  flag: '🇫🇮' },
  { code: 'FR', name: 'France',                         dial: '+33',   flag: '🇫🇷' },
  { code: 'GA', name: 'Gabon',                          dial: '+241',  flag: '🇬🇦' },
  { code: 'GM', name: 'Gambia',                         dial: '+220',  flag: '🇬🇲' },
  { code: 'GE', name: 'Georgia',                        dial: '+995',  flag: '🇬🇪' },
  { code: 'DE', name: 'Germany',                        dial: '+49',   flag: '🇩🇪' },
  { code: 'GH', name: 'Ghana',                          dial: '+233',  flag: '🇬🇭' },
  { code: 'GR', name: 'Greece',                         dial: '+30',   flag: '🇬🇷' },
  { code: 'GD', name: 'Grenada',                        dial: '+1473', flag: '🇬🇩' },
  { code: 'GT', name: 'Guatemala',                      dial: '+502',  flag: '🇬🇹' },
  { code: 'GN', name: 'Guinea',                         dial: '+224',  flag: '🇬🇳' },
  { code: 'GW', name: 'Guinea-Bissau',                  dial: '+245',  flag: '🇬🇼' },
  { code: 'GY', name: 'Guyana',                         dial: '+592',  flag: '🇬🇾' },
  { code: 'HT', name: 'Haiti',                          dial: '+509',  flag: '🇭🇹' },
  { code: 'HN', name: 'Honduras',                       dial: '+504',  flag: '🇭🇳' },
  { code: 'HU', name: 'Hungary',                        dial: '+36',   flag: '🇭🇺' },
  { code: 'IS', name: 'Iceland',                        dial: '+354',  flag: '🇮🇸' },
  { code: 'IN', name: 'India',                          dial: '+91',   flag: '🇮🇳' },
  { code: 'ID', name: 'Indonesia',                      dial: '+62',   flag: '🇮🇩' },
  { code: 'IR', name: 'Iran',                           dial: '+98',   flag: '🇮🇷' },
  { code: 'IQ', name: 'Iraq',                           dial: '+964',  flag: '🇮🇶' },
  { code: 'IE', name: 'Ireland',                        dial: '+353',  flag: '🇮🇪' },
  { code: 'IL', name: 'Israel',                         dial: '+972',  flag: '🇮🇱' },
  { code: 'IT', name: 'Italy',                          dial: '+39',   flag: '🇮🇹' },
  { code: 'JM', name: 'Jamaica',                        dial: '+1876', flag: '🇯🇲' },
  { code: 'JP', name: 'Japan',                          dial: '+81',   flag: '🇯🇵' },
  { code: 'JO', name: 'Jordan',                         dial: '+962',  flag: '🇯🇴' },
  { code: 'KZ', name: 'Kazakhstan',                     dial: '+7',    flag: '🇰🇿' },
  { code: 'KE', name: 'Kenya',                          dial: '+254',  flag: '🇰🇪' },
  { code: 'KI', name: 'Kiribati',                       dial: '+686',  flag: '🇰🇮' },
  { code: 'KP', name: 'North Korea',                    dial: '+850',  flag: '🇰🇵' },
  { code: 'KR', name: 'South Korea',                    dial: '+82',   flag: '🇰🇷' },
  { code: 'KW', name: 'Kuwait',                         dial: '+965',  flag: '🇰🇼' },
  { code: 'KG', name: 'Kyrgyzstan',                     dial: '+996',  flag: '🇰🇬' },
  { code: 'LA', name: 'Laos',                           dial: '+856',  flag: '🇱🇦' },
  { code: 'LV', name: 'Latvia',                         dial: '+371',  flag: '🇱🇻' },
  { code: 'LB', name: 'Lebanon',                        dial: '+961',  flag: '🇱🇧' },
  { code: 'LS', name: 'Lesotho',                        dial: '+266',  flag: '🇱🇸' },
  { code: 'LR', name: 'Liberia',                        dial: '+231',  flag: '🇱🇷' },
  { code: 'LY', name: 'Libya',                          dial: '+218',  flag: '🇱🇾' },
  { code: 'LI', name: 'Liechtenstein',                  dial: '+423',  flag: '🇱🇮' },
  { code: 'LT', name: 'Lithuania',                      dial: '+370',  flag: '🇱🇹' },
  { code: 'LU', name: 'Luxembourg',                     dial: '+352',  flag: '🇱🇺' },
  { code: 'MG', name: 'Madagascar',                     dial: '+261',  flag: '🇲🇬' },
  { code: 'MW', name: 'Malawi',                         dial: '+265',  flag: '🇲🇼' },
  { code: 'MY', name: 'Malaysia',                       dial: '+60',   flag: '🇲🇾' },
  { code: 'MV', name: 'Maldives',                       dial: '+960',  flag: '🇲🇻' },
  { code: 'ML', name: 'Mali',                           dial: '+223',  flag: '🇲🇱' },
  { code: 'MT', name: 'Malta',                          dial: '+356',  flag: '🇲🇹' },
  { code: 'MH', name: 'Marshall Islands',               dial: '+692',  flag: '🇲🇭' },
  { code: 'MR', name: 'Mauritania',                     dial: '+222',  flag: '🇲🇷' },
  { code: 'MU', name: 'Mauritius',                      dial: '+230',  flag: '🇲🇺' },
  { code: 'MX', name: 'Mexico',                         dial: '+52',   flag: '🇲🇽' },
  { code: 'FM', name: 'Micronesia',                     dial: '+691',  flag: '🇫🇲' },
  { code: 'MD', name: 'Moldova',                        dial: '+373',  flag: '🇲🇩' },
  { code: 'MC', name: 'Monaco',                         dial: '+377',  flag: '🇲🇨' },
  { code: 'MN', name: 'Mongolia',                       dial: '+976',  flag: '🇲🇳' },
  { code: 'ME', name: 'Montenegro',                     dial: '+382',  flag: '🇲🇪' },
  { code: 'MA', name: 'Morocco',                        dial: '+212',  flag: '🇲🇦' },
  { code: 'MZ', name: 'Mozambique',                     dial: '+258',  flag: '🇲🇿' },
  { code: 'MM', name: 'Myanmar',                        dial: '+95',   flag: '🇲🇲' },
  { code: 'NA', name: 'Namibia',                        dial: '+264',  flag: '🇳🇦' },
  { code: 'NR', name: 'Nauru',                          dial: '+674',  flag: '🇳🇷' },
  { code: 'NP', name: 'Nepal',                          dial: '+977',  flag: '🇳🇵' },
  { code: 'NL', name: 'Netherlands',                    dial: '+31',   flag: '🇳🇱' },
  { code: 'NZ', name: 'New Zealand',                    dial: '+64',   flag: '🇳🇿' },
  { code: 'NI', name: 'Nicaragua',                      dial: '+505',  flag: '🇳🇮' },
  { code: 'NE', name: 'Niger',                          dial: '+227',  flag: '🇳🇪' },
  { code: 'NG', name: 'Nigeria',                        dial: '+234',  flag: '🇳🇬' },
  { code: 'NO', name: 'Norway',                         dial: '+47',   flag: '🇳🇴' },
  { code: 'OM', name: 'Oman',                           dial: '+968',  flag: '🇴🇲' },
  { code: 'PK', name: 'Pakistan',                       dial: '+92',   flag: '🇵🇰' },
  { code: 'PW', name: 'Palau',                          dial: '+680',  flag: '🇵🇼' },
  { code: 'PA', name: 'Panama',                         dial: '+507',  flag: '🇵🇦' },
  { code: 'PG', name: 'Papua New Guinea',               dial: '+675',  flag: '🇵🇬' },
  { code: 'PY', name: 'Paraguay',                       dial: '+595',  flag: '🇵🇾' },
  { code: 'PE', name: 'Peru',                           dial: '+51',   flag: '🇵🇪' },
  { code: 'PH', name: 'Philippines',                    dial: '+63',   flag: '🇵🇭' },
  { code: 'PL', name: 'Poland',                         dial: '+48',   flag: '🇵🇱' },
  { code: 'PT', name: 'Portugal',                       dial: '+351',  flag: '🇵🇹' },
  { code: 'QA', name: 'Qatar',                          dial: '+974',  flag: '🇶🇦' },
  { code: 'RO', name: 'Romania',                        dial: '+40',   flag: '🇷🇴' },
  { code: 'RU', name: 'Russia',                         dial: '+7',    flag: '🇷🇺' },
  { code: 'RW', name: 'Rwanda',                         dial: '+250',  flag: '🇷🇼' },
  { code: 'KN', name: 'Saint Kitts and Nevis',          dial: '+1869', flag: '🇰🇳' },
  { code: 'LC', name: 'Saint Lucia',                    dial: '+1758', flag: '🇱🇨' },
  { code: 'VC', name: 'Saint Vincent and the Grenadines', dial: '+1784', flag: '🇻🇨' },
  { code: 'WS', name: 'Samoa',                          dial: '+685',  flag: '🇼🇸' },
  { code: 'SM', name: 'San Marino',                     dial: '+378',  flag: '🇸🇲' },
  { code: 'ST', name: 'Sao Tome and Principe',          dial: '+239',  flag: '🇸🇹' },
  { code: 'SA', name: 'Saudi Arabia',                   dial: '+966',  flag: '🇸🇦' },
  { code: 'SN', name: 'Senegal',                        dial: '+221',  flag: '🇸🇳' },
  { code: 'RS', name: 'Serbia',                         dial: '+381',  flag: '🇷🇸' },
  { code: 'SC', name: 'Seychelles',                     dial: '+248',  flag: '🇸🇨' },
  { code: 'SL', name: 'Sierra Leone',                   dial: '+232',  flag: '🇸🇱' },
  { code: 'SG', name: 'Singapore',                      dial: '+65',   flag: '🇸🇬' },
  { code: 'SK', name: 'Slovakia',                       dial: '+421',  flag: '🇸🇰' },
  { code: 'SI', name: 'Slovenia',                       dial: '+386',  flag: '🇸🇮' },
  { code: 'SB', name: 'Solomon Islands',                dial: '+677',  flag: '🇸🇧' },
  { code: 'SO', name: 'Somalia',                        dial: '+252',  flag: '🇸🇴' },
  { code: 'ZA', name: 'South Africa',                   dial: '+27',   flag: '🇿🇦' },
  { code: 'SS', name: 'South Sudan',                    dial: '+211',  flag: '🇸🇸' },
  { code: 'ES', name: 'Spain',                          dial: '+34',   flag: '🇪🇸' },
  { code: 'LK', name: 'Sri Lanka',                      dial: '+94',   flag: '🇱🇰' },
  { code: 'SD', name: 'Sudan',                          dial: '+249',  flag: '🇸🇩' },
  { code: 'SR', name: 'Suriname',                       dial: '+597',  flag: '🇸🇷' },
  { code: 'SE', name: 'Sweden',                         dial: '+46',   flag: '🇸🇪' },
  { code: 'CH', name: 'Switzerland',                    dial: '+41',   flag: '🇨🇭' },
  { code: 'SY', name: 'Syria',                          dial: '+963',  flag: '🇸🇾' },
  { code: 'TW', name: 'Taiwan',                         dial: '+886',  flag: '🇹🇼' },
  { code: 'TJ', name: 'Tajikistan',                     dial: '+992',  flag: '🇹🇯' },
  { code: 'TZ', name: 'Tanzania',                       dial: '+255',  flag: '🇹🇿' },
  { code: 'TH', name: 'Thailand',                       dial: '+66',   flag: '🇹🇭' },
  { code: 'TL', name: 'Timor-Leste',                    dial: '+670',  flag: '🇹🇱' },
  { code: 'TG', name: 'Togo',                           dial: '+228',  flag: '🇹🇬' },
  { code: 'TO', name: 'Tonga',                          dial: '+676',  flag: '🇹🇴' },
  { code: 'TT', name: 'Trinidad and Tobago',            dial: '+1868', flag: '🇹🇹' },
  { code: 'TN', name: 'Tunisia',                        dial: '+216',  flag: '🇹🇳' },
  { code: 'TR', name: 'Turkey',                         dial: '+90',   flag: '🇹🇷' },
  { code: 'TM', name: 'Turkmenistan',                   dial: '+993',  flag: '🇹🇲' },
  { code: 'TV', name: 'Tuvalu',                         dial: '+688',  flag: '🇹🇻' },
  { code: 'UG', name: 'Uganda',                         dial: '+256',  flag: '🇺🇬' },
  { code: 'UA', name: 'Ukraine',                        dial: '+380',  flag: '🇺🇦' },
  { code: 'AE', name: 'United Arab Emirates',           dial: '+971',  flag: '🇦🇪' },
  { code: 'GB', name: 'United Kingdom',                 dial: '+44',   flag: '🇬🇧' },
  { code: 'US', name: 'United States',                  dial: '+1',    flag: '🇺🇸' },
  { code: 'UY', name: 'Uruguay',                        dial: '+598',  flag: '🇺🇾' },
  { code: 'UZ', name: 'Uzbekistan',                     dial: '+998',  flag: '🇺🇿' },
  { code: 'VU', name: 'Vanuatu',                        dial: '+678',  flag: '🇻🇺' },
  { code: 'VE', name: 'Venezuela',                      dial: '+58',   flag: '🇻🇪' },
  { code: 'VN', name: 'Vietnam',                        dial: '+84',   flag: '🇻🇳' },
  { code: 'YE', name: 'Yemen',                          dial: '+967',  flag: '🇾🇪' },
  { code: 'ZM', name: 'Zambia',                         dial: '+260',  flag: '🇿🇲' },
  { code: 'ZW', name: 'Zimbabwe',                       dial: '+263',  flag: '🇿🇼' },
];

// ─── Searchable dial-code picker ──────────────────────────────────────────────

const DialCodePicker: React.FC<{
  value: string;
  onChange: (dial: string) => void;
}> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const selected = COUNTRIES.find(c => c.dial === value && c.code === 'TR') ??
                   COUNTRIES.find(c => c.dial === value) ??
                   COUNTRIES.find(c => c.code === 'TR')!;

  const filtered = search.trim()
    ? COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.dial.includes(search.replace(/^\+/, ''))
      )
    : COUNTRIES;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setSearch(''); }}
        style={{
          height: 40, padding: '0 10px',
          display: 'flex', alignItems: 'center', gap: 5,
          background: '#fff', border: '1.5px solid #e5e7eb',
          borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
          fontSize: 13, color: '#0f1117', whiteSpace: 'nowrap',
          transition: 'border-color 150ms ease',
        }}
      >
        <span style={{ fontSize: 17, lineHeight: 1 }}>{selected.flag}</span>
        <span style={{ fontWeight: 500 }}>{selected.dial}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
          <path d="M6 9l6 6 6-6" stroke="#9ca3af" strokeWidth="2.2" strokeLinecap="round"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 44, left: 0, zIndex: 300,
          background: '#fff', border: '1.5px solid #e5e7eb',
          borderRadius: 10, width: 272,
          boxShadow: '0 8px 32px rgba(0,0,0,0.13)',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '8px 8px 6px' }}>
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search country or code…"
              style={{
                width: '100%', height: 34, padding: '0 10px',
                fontSize: 13, border: '1.5px solid #e5e7eb',
                borderRadius: 7, outline: 'none', fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ maxHeight: 210, overflowY: 'auto' }}>
            {filtered.map(c => (
              <button
                key={c.code}
                type="button"
                onClick={() => { onChange(c.dial); setOpen(false); setSearch(''); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                  padding: '7px 12px', border: 'none', background: 'none',
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
                  textAlign: 'left', color: '#374151',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f9fafb'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
              >
                <span style={{ fontSize: 17, lineHeight: 1, flexShrink: 0 }}>{c.flag}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                <span style={{ color: '#9ca3af', fontSize: 12, flexShrink: 0 }}>{c.dial}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: '12px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                No results
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Booking form modal ───────────────────────────────────────────────────────

type BookingFormData = {
  // Booking fields
  booking_number: string;
  status: BookingStatus;
  car_id: string;
  start_date: string;
  end_date: string;
  // Customer fields (add mode only)
  cust_id_type: 'passport' | 'national_id';
  cust_id_number: string;
  cust_first_name: string;
  cust_last_name: string;
  cust_phone_dial: string;
  cust_phone: string;
  cust_nationality: string;
  cust_driving_license: string;
  cust_driving_license_number: string;
  cust_address: string;
  cust_birth_date: string;
  cust_notes: string;
};

const EMPTY_FORM: BookingFormData = {
  booking_number: '', status: 'pending', car_id: '',
  start_date: '', end_date: '',
  cust_id_type: 'passport', cust_id_number: '',
  cust_first_name: '', cust_last_name: '',
  cust_phone_dial: '+90', cust_phone: '',
  cust_nationality: '', cust_driving_license: '',
  cust_driving_license_number: '', cust_address: '',
  cust_birth_date: '', cust_notes: '',
};

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', height: 40, padding: '0 12px',
  fontSize: 14, color: '#0f1117',
  background: '#fff', border: '1.5px solid #e5e7eb',
  borderRadius: 8, outline: 'none', fontFamily: 'inherit',
  boxSizing: 'border-box', transition: 'border-color 150ms ease',
};

const focusBlue = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
  { (e.target as HTMLElement & { style: CSSStyleDeclaration }).style.borderColor = '#4ba6ea'; };
const blurGray = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
  { (e.target as HTMLElement & { style: CSSStyleDeclaration }).style.borderColor = '#e5e7eb'; };

// Section heading inside the form
const SectionHeading: React.FC<{ icon: React.ReactNode; title: string }> = ({ icon, title }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 8,
    gridColumn: 'span 2', margin: '4px 0 2px',
  }}>
    <div style={{
      width: 28, height: 28, borderRadius: 8,
      background: 'rgba(75,166,234,0.10)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#4ba6ea', flexShrink: 0,
    }}>
      {icon}
    </div>
    <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
      {title}
    </span>
    <div style={{ flex: 1, height: 1, background: '#f0f0f0' }} />
  </div>
);

interface FormModalProps {
  mode: 'add' | 'edit';
  initial: BookingFormData;
  editId?: number;
  customerName?: string;
  onClose: () => void;
  onSaved: () => void;
}

const BookingFormModal: React.FC<FormModalProps> = ({
  mode, initial, editId, customerName, onClose, onSaved,
}) => {
  const [form, setForm] = useState<BookingFormData>(initial);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [cars, setCars] = useState<CarOption[]>([]);
  const [bookingNumLoading, setBookingNumLoading] = useState(mode === 'add');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  useEffect(() => {
    let active = true;
    (async () => {
      // Cars — sorted by model name
      const { data: carsData } = await supabase
        .from('cars').select('id, plate_number, model_group(name)');
      if (!active) return;
      const carOpts: CarOption[] = ((carsData ?? []) as Array<{
        id: number;
        plate_number: string;
        model_group: { name: string } | { name: string }[] | null;
      }>).map(c => {
        const mg = c.model_group;
        const model = Array.isArray(mg) ? (mg[0]?.name ?? '') : (mg as { name: string } | null)?.name ?? '';
        return { id: c.id, plate_number: c.plate_number, model };
      });
      carOpts.sort((a, b) => a.model.localeCompare(b.model));
      setCars(carOpts);

      // Auto-generate booking number (add mode only)
      if (mode === 'add') {
        const now = new Date();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const yy = String(now.getFullYear()).slice(-2);
        const prefix = `HOM-${mm}-${yy}-`;
        const { count } = await supabase
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .like('booking_number', `${prefix}%`);
        if (!active) return;
        const seq = String((count ?? 0) + 1).padStart(3, '0');
        setForm(f => ({ ...f, booking_number: `${prefix}${seq}` }));
        setBookingNumLoading(false);
      }
    })();
    return () => { active = false; };
  }, [mode]);

  const set = <K extends keyof BookingFormData>(key: K, value: BookingFormData[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);

    if (mode === 'add') {
      // Step 1: create customer
      const phone = form.cust_phone
        ? `${form.cust_phone_dial}${form.cust_phone}`
        : null;

      const { data: custData, error: custError } = await supabase
        .from('customers')
        .insert({
          id_type:             form.cust_id_type,
          id_number:           form.cust_id_number   || null,
          first_name:          form.cust_first_name,
          last_name:           form.cust_last_name,
          phone:               phone,
          nationality:         form.cust_nationality        || null,
          driving_license:     form.cust_driving_license    || null,
          driving_license_number: form.cust_driving_license_number || null,
          address:             form.cust_address            || null,
          birth_date:          form.cust_birth_date         || null,
          notes:               form.cust_notes              || null,
        })
        .select('id')
        .single();

      if (custError) {
        setSaving(false);
        setFormError(custError.message);
        return;
      }

      // Step 2: create booking with the new customer id
      const { error: bookingError } = await supabase
        .from('bookings')
        .insert({
          booking_number: form.booking_number,
          status:         form.status,
          car_id:         Number(form.car_id),
          customer_id:    (custData as { id: number }).id,
          start_date:     form.start_date,
          end_date:       form.end_date,
          kabis_reported: false,
          invoice_issued: false,
        });

      setSaving(false);
      if (bookingError) { setFormError(bookingError.message); return; }
    } else {
      // Edit: update booking fields only
      const { error } = await supabase
        .from('bookings')
        .update({
          booking_number: form.booking_number,
          status:         form.status,
          car_id:         Number(form.car_id),
          start_date:     form.start_date,
          end_date:       form.end_date,
        })
        .eq('id', editId!);

      setSaving(false);
      if (error) { setFormError(error.message); return; }
    }

    onSaved();
    onClose();
  };

  return ReactDOM.createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15,17,23,0.45)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '24px 16px', overflowY: 'auto',
        animation: 'fadeIn 150ms ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 18, width: '100%', maxWidth: 720,
          marginTop: 'auto', marginBottom: 'auto',
          boxShadow: '0 24px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)',
          animation: 'slideUp 180ms ease',
        }}
      >
        {/* Modal header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px 16px', borderBottom: '1px solid #f3f4f6',
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f1117', letterSpacing: '-0.3px' }}>
              {mode === 'add' ? 'New Booking' : 'Edit Booking'}
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
              {mode === 'add' ? 'Create a new customer and booking' : 'Update booking details'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#e5e7eb'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f3f4f6'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="#6b7280" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Form body */}
        <form onSubmit={handleSubmit} style={{ padding: '20px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px' }}>

            {/* ── Booking Details ── */}
            <SectionHeading
              title="Booking Details"
              icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>}
            />

            <Field label="Booking Number">
              <div style={{
                ...INPUT_STYLE, display: 'flex', alignItems: 'center',
                background: '#f9fafb', color: bookingNumLoading ? '#9ca3af' : '#0f1117',
                fontWeight: bookingNumLoading ? 400 : 700, letterSpacing: bookingNumLoading ? 0 : '0.3px',
                cursor: 'default',
              }}>
                {bookingNumLoading ? 'Generating…' : form.booking_number}
              </div>
            </Field>

            <Field label="Status">
              <select value={form.status} onChange={e => set('status', e.target.value as BookingStatus)}
                style={{ ...INPUT_STYLE, cursor: 'pointer' }} onFocus={focusBlue} onBlur={blurGray}>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </Field>

            <Field label="Car" required>
              <select required value={form.car_id} onChange={e => set('car_id', e.target.value)}
                style={{ ...INPUT_STYLE, cursor: 'pointer' }} onFocus={focusBlue} onBlur={blurGray}>
                <option value="">Select car…</option>
                {cars.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.plate_number}{c.model ? ` — ${c.model}` : ''}
                  </option>
                ))}
              </select>
            </Field>

            {/* Customer read-only in edit mode */}
            {mode === 'edit' && customerName && (
              <Field label="Customer">
                <input readOnly value={customerName}
                  style={{ ...INPUT_STYLE, background: '#f9fafb', color: '#6b7280', cursor: 'default' }} />
              </Field>
            )}

            <Field label="Start Date" required>
              <input required type="date" value={form.start_date}
                onChange={e => set('start_date', e.target.value)}
                style={INPUT_STYLE} onFocus={focusBlue} onBlur={blurGray} />
            </Field>

            <Field label="End Date" required>
              <input required type="date" value={form.end_date}
                onChange={e => set('end_date', e.target.value)}
                style={INPUT_STYLE} onFocus={focusBlue} onBlur={blurGray} />
            </Field>

            {/* ── Customer Information (add mode only) ── */}
            {mode === 'add' && (
              <>
                <SectionHeading
                  title="Customer Information"
                  icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>}
                />

                <Field label="First Name" required>
                  <input required value={form.cust_first_name}
                    onChange={e => set('cust_first_name', e.target.value)}
                    placeholder="First name" style={INPUT_STYLE}
                    onFocus={focusBlue} onBlur={blurGray} />
                </Field>

                <Field label="Last Name" required>
                  <input required value={form.cust_last_name}
                    onChange={e => set('cust_last_name', e.target.value)}
                    placeholder="Last name" style={INPUT_STYLE}
                    onFocus={focusBlue} onBlur={blurGray} />
                </Field>

                <Field label="ID Type">
                  <select value={form.cust_id_type}
                    onChange={e => set('cust_id_type', e.target.value as 'passport' | 'national_id')}
                    style={{ ...INPUT_STYLE, cursor: 'pointer' }} onFocus={focusBlue} onBlur={blurGray}>
                    <option value="passport">Passport</option>
                    <option value="national_id">National ID</option>
                  </select>
                </Field>

                <Field label="ID Number">
                  <input value={form.cust_id_number}
                    onChange={e => set('cust_id_number', e.target.value)}
                    placeholder="Document number" style={INPUT_STYLE}
                    onFocus={focusBlue} onBlur={blurGray} />
                </Field>

                <Field label="Phone">
                  <div style={{ display: 'flex', gap: 8 }}>
                    <DialCodePicker
                      value={form.cust_phone_dial}
                      onChange={dial => set('cust_phone_dial', dial)}
                    />
                    <input value={form.cust_phone}
                      onChange={e => set('cust_phone', e.target.value)}
                      placeholder="Phone number" type="tel"
                      style={{ ...INPUT_STYLE, flex: 1 }}
                      onFocus={focusBlue} onBlur={blurGray} />
                  </div>
                </Field>

                <Field label="Nationality">
                  <select value={form.cust_nationality}
                    onChange={e => set('cust_nationality', e.target.value)}
                    style={{ ...INPUT_STYLE, cursor: 'pointer' }} onFocus={focusBlue} onBlur={blurGray}>
                    <option value="">Select country…</option>
                    {COUNTRIES.map(c => (
                      <option key={c.code} value={c.name}>{c.flag} {c.name}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Driving License">
                  <input value={form.cust_driving_license}
                    onChange={e => set('cust_driving_license', e.target.value)}
                    placeholder="License number" style={INPUT_STYLE}
                    onFocus={focusBlue} onBlur={blurGray} />
                </Field>

                <Field label="License Expiry / Mirror Number">
                  <input value={form.cust_driving_license_number}
                    onChange={e => set('cust_driving_license_number', e.target.value)}
                    placeholder="Expiry date or mirror number" style={INPUT_STYLE}
                    onFocus={focusBlue} onBlur={blurGray} />
                </Field>

                <Field label="Birth Date">
                  <input type="date" value={form.cust_birth_date}
                    onChange={e => set('cust_birth_date', e.target.value)}
                    style={INPUT_STYLE} onFocus={focusBlue} onBlur={blurGray} />
                </Field>

                <Field label="Address">
                  <input value={form.cust_address}
                    onChange={e => set('cust_address', e.target.value)}
                    placeholder="Home address" style={INPUT_STYLE}
                    onFocus={focusBlue} onBlur={blurGray} />
                </Field>

                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                    Notes
                  </label>
                  <textarea
                    value={form.cust_notes}
                    onChange={e => set('cust_notes', e.target.value)}
                    placeholder="Any notes about this customer…"
                    rows={2}
                    style={{ ...INPUT_STYLE, height: 'auto', padding: '10px 12px', resize: 'vertical' }}
                    onFocus={focusBlue} onBlur={blurGray}
                  />
                </div>
              </>
            )}
          </div>

          {formError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, padding: '10px 14px', background: '#fef2f2', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.8"/>
                <path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              <span style={{ fontSize: 13, color: '#ef4444' }}>{formError}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22, paddingTop: 18, borderTop: '1px solid #f3f4f6' }}>
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
              {saving ? 'Saving…' : mode === 'add' ? 'Add Booking' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(12px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      `}</style>
    </div>,
    document.body,
  );
};

// Small form field wrapper
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

// ─── Delete confirm modal ─────────────────────────────────────────────────────

const DeleteConfirm: React.FC<{
  booking: Booking;
  deleting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}> = ({ booking, deleting, onConfirm, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return ReactDOM.createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15,17,23,0.45)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, animation: 'fadeIn 150ms ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 18, width: '100%', maxWidth: 400,
          padding: 28, boxShadow: '0 24px 80px rgba(0,0,0,0.18)',
          animation: 'slideUp 180ms ease',
        }}
      >
        <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#0f1117', marginBottom: 8 }}>Delete Booking?</div>
        <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 24, lineHeight: 1.6 }}>
          Booking <strong style={{ color: '#0f1117' }}>{booking.booking_number}</strong> for{' '}
          <strong style={{ color: '#0f1117' }}>{booking.customer_name}</strong> will be permanently deleted.
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose}
            style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', fontSize: 14, fontWeight: 500, color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={deleting}
            style={{ padding: '9px 22px', borderRadius: 9, border: 'none', background: deleting ? '#fca5a5' : '#ef4444', color: '#fff', fontSize: 14, fontWeight: 600, cursor: deleting ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'background 150ms ease' }}>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

const BookingsPage: React.FC = () => {
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => getMonthStart(new Date()));
  const [bookings, setBookings]           = useState<Booking[]>([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);
  const [stats, setStats]                 = useState({ total: 0, confirmed: 0, pending: 0, completed: 0 });
  const [statsLoading, setStatsLoading]   = useState(true);
  const [search, setSearch]               = useState('');
  const [statusFilter, setStatusFilter]   = useState<BookingStatus | ''>('');
  const [sort, setSort]                   = useState<{ col: SortCol; dir: SortDir }>({ col: null, dir: 'asc' });
  const [selectedIds, setSelectedIds]     = useState<Set<number>>(new Set());
  const [modal, setModal]                 = useState<null | 'add' | { mode: 'edit'; booking: Booking }>(null);
  const [deleteTarget, setDeleteTarget]   = useState<Booking | null>(null);
  const [deleting, setDeleting]           = useState(false);
  const [toast, setToast]                 = useState<ToastState | null>(null);
  const toastTimer                        = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Fetch stats (separate lightweight query) ────────────────────────────────
  const fetchStats = useCallback(async (month: Date) => {
    setStatsLoading(true);
    const { data, error: statsError } = await supabase
      .from('bookings')
      .select('status', { count: 'exact' })
      .gte('start_date', toDateStr(getMonthStart(month)))
      .lte('start_date', toDateStr(getMonthEnd(month)));
    setStatsLoading(false);
    if (statsError || !data) return;
    const rows = data as Array<{ status: string }>;
    setStats({
      total:     rows.length,
      confirmed: rows.filter(r => r.status === 'confirmed').length,
      pending:   rows.filter(r => r.status === 'pending').length,
      completed: rows.filter(r => r.status === 'completed').length,
    });
  }, []);

  // ── Fetch bookings ──────────────────────────────────────────────────────────
  const fetchBookings = useCallback(async (month: Date) => {
    setLoading(true);
    setError(null);
    setSelectedIds(new Set());

    const { data, error: fetchError } = await supabase
      .from('bookings')
      .select(`
        id, booking_number, status, car_id, customer_id,
        start_date, end_date, kabis_reported, invoice_issued,
        cars(plate_number, model_group(name)),
        customers(first_name, last_name)
      `)
      .gte('start_date', toDateStr(getMonthStart(month)))
      .lte('start_date', toDateStr(getMonthEnd(month)))
      .order('created_at', { ascending: false });

    setLoading(false);
    if (fetchError) { setError(fetchError.message); return; }
    setBookings(((data ?? []) as unknown as BookingRow[]).map(resolveBooking));
  }, []);

  useEffect(() => {
    fetchStats(selectedMonth);
    fetchBookings(selectedMonth);
  }, [selectedMonth, fetchStats, fetchBookings]);

  // ── Filter + sort ───────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = bookings;
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(b =>
        b.booking_number.toLowerCase().includes(q) ||
        b.customer_name.toLowerCase().includes(q) ||
        b.plate_number.toLowerCase().includes(q)
      );
    }
    if (statusFilter) result = result.filter(b => b.status === statusFilter);
    return result;
  }, [bookings, search, statusFilter]);

  const sorted = useMemo(() => {
    if (!sort.col) return filtered;
    const col = sort.col;
    return [...filtered].sort((a, b) => {
      const av = a[col] as string;
      const bv = b[col] as string;
      return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [filtered, sort]);

  const handleSort = (col: Exclude<SortCol, null>) => {
    setSort(prev => {
      if (prev.col !== col) return { col, dir: 'asc' };
      if (prev.dir === 'asc') return { col, dir: 'desc' };
      return { col: null, dir: 'asc' };
    });
  };

  const sortIcon = (col: Exclude<SortCol, null>) =>
    sort.col !== col
      ? <span style={{ color: '#d1d5db', fontSize: 11 }}>↕</span>
      : <span style={{ color: '#4ba6ea', fontSize: 11 }}>{sort.dir === 'asc' ? '↑' : '↓'}</span>;

  // ── Selection ───────────────────────────────────────────────────────────────
  const allSelected  = sorted.length > 0 && sorted.every(b => selectedIds.has(b.id));
  const someSelected = sorted.some(b => selectedIds.has(b.id)) && !allSelected;

  const toggleSelectAll = () =>
    setSelectedIds(allSelected ? new Set() : new Set(sorted.map(b => b.id)));

  const toggleSelectRow = (id: number) =>
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  // ── Toggle kabis / invoice ──────────────────────────────────────────────────
  const handleToggle = useCallback(async (
    bookingId: number,
    field: 'kabis_reported' | 'invoice_issued',
    currentValue: boolean,
  ) => {
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, [field]: !currentValue } : b));
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ [field]: !currentValue })
      .eq('id', bookingId);
    if (updateError) {
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, [field]: currentValue } : b));
      showToast('Update failed', 'error');
    }
  }, [showToast]);

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error: deleteError } = await supabase.from('bookings').delete().eq('id', deleteTarget.id);
    setDeleting(false);
    if (deleteError) {
      showToast('Failed to delete booking', 'error');
    } else {
      showToast('Booking deleted', 'success');
      fetchStats(selectedMonth);
      setBookings(prev => prev.filter(b => b.id !== deleteTarget.id));
      setDeleteTarget(null);
    }
  };

  // ── Export CSV ──────────────────────────────────────────────────────────────
  const handleExport = () => {
    const headers = ['Booking #', 'Status', 'Car', 'Plate', 'Customer', 'Start Date', 'End Date', 'Kabis', 'Invoice'];
    const rows = sorted.map(b => [
      b.booking_number, b.status, b.car_model, b.plate_number, b.customer_name,
      b.start_date, b.end_date,
      b.kabis_reported ? 'Yes' : 'No',
      b.invoice_issued ? 'Yes' : 'No',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookings-${formatMonthLabel(selectedMonth).replace(' ', '-').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Edit form initial data ──────────────────────────────────────────────────
  const editFormData = (b: Booking): BookingFormData => ({
    booking_number: b.booking_number,
    status:         b.status,
    car_id:         String(b.car_id),
    start_date:     b.start_date,
    end_date:       b.end_date,
    // Customer fields unused in edit mode — provide empty defaults
    cust_id_type: 'passport', cust_id_number: '',
    cust_first_name: '', cust_last_name: '',
    cust_phone_dial: '+90', cust_phone: '',
    cust_nationality: '', cust_driving_license: '',
    cust_driving_license_number: '', cust_address: '',
    cust_birth_date: '', cust_notes: '',
  });

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)', padding: '44px 40px' }}>
      <div>

        {/* ── Page header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 16, flexWrap: 'wrap', marginBottom: 36,
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ba6ea' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#4ba6ea', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
                Operations
              </span>
            </div>
            <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.8px', color: '#0f1117', lineHeight: 1.1, marginBottom: 6 }}>
              Bookings
            </h1>
            <p style={{ fontSize: 15, color: '#6b7280', lineHeight: 1.5 }}>Monthly bookings control center</p>
          </div>

          <button
            onClick={() => setModal('add')}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              height: 40, padding: '0 18px',
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
            Add New Booking
          </button>
        </div>

        {/* ── Month navigation ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 28 }}>
          <MonthArrow direction="left"  onClick={() => setSelectedMonth(m => addMonths(m, -1))} />
          <span style={{ fontSize: 18, fontWeight: 700, color: '#0f1117', letterSpacing: '-0.4px', minWidth: 160, textAlign: 'center' }}>
            {formatMonthLabel(selectedMonth)}
          </span>
          <MonthArrow direction="right" onClick={() => setSelectedMonth(m => addMonths(m, 1))} />
        </div>

        {/* ── Stat cards ── */}
        <div className="bk-stats">
          <StatCard label="Total Bookings" value={stats.total}     bg="#4ba6ea" loading={statsLoading} />
          <StatCard label="Confirmed"      value={stats.confirmed} bg="#22c55e" loading={statsLoading} />
          <StatCard label="Pending"        value={stats.pending}   bg="#f97316" loading={statsLoading} />
          <StatCard label="Completed"      value={stats.completed} bg="#6b7280" loading={statsLoading} />
        </div>

        {/* ── Search + filter bar ── */}
        <div style={{
          background: '#fff', borderRadius: 14,
          border: '1px solid #ebebeb', padding: '12px 14px',
          marginBottom: 16,
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
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search booking number, customer, plate…"
              style={{
                width: '100%', height: 40, paddingLeft: 34, paddingRight: 12,
                fontSize: 13, color: '#0f1117',
                background: '#f9fafb', border: '1.5px solid #f0f0f0',
                borderRadius: 9, outline: 'none', fontFamily: 'inherit',
                transition: 'all 150ms ease',
              }}
              onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; (e.target as HTMLInputElement).style.background = '#fff'; }}
              onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#f0f0f0'; (e.target as HTMLInputElement).style.background = '#f9fafb'; }}
            />
          </div>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as BookingStatus | '')}
            style={{ height: 40, padding: '0 12px', fontSize: 13, color: '#374151', background: '#f9fafb', border: '1.5px solid #f0f0f0', borderRadius: 9, outline: 'none', fontFamily: 'inherit', cursor: 'pointer', minWidth: 136 }}
            onFocus={e => { (e.target as HTMLSelectElement).style.borderColor = '#4ba6ea'; }}
            onBlur={e => { (e.target as HTMLSelectElement).style.borderColor = '#f0f0f0'; }}
          >
            <option value="">All Statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="pending">Pending</option>
            <option value="cancelled">Cancelled</option>
            <option value="completed">Completed</option>
          </select>

          <button
            onClick={handleExport}
            style={{ height: 40, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: '#374151', background: '#f9fafb', border: '1.5px solid #f0f0f0', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 140ms ease', flexShrink: 0 }}
            onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#4ba6ea'; b.style.color = '#4ba6ea'; }}
            onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#f0f0f0'; b.style.color = '#374151'; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <polyline points="7 10 12 15 17 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            Export
          </button>
        </div>

        {/* ── Error ── */}
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid rgba(239,68,68,0.2)', borderLeft: '4px solid #ef4444', borderRadius: 12, padding: '14px 18px', marginBottom: 16 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.8"/><path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"/></svg>
            <span style={{ fontSize: 14, color: '#0f1117' }}>Failed to load bookings: <span style={{ color: '#6b7280' }}>{error}</span></span>
          </div>
        )}

        {/* ── Table ── */}
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #ebebeb', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
              <thead>
                <tr>
                  <Th style={{ width: 48, paddingLeft: 16, paddingRight: 8 }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = someSelected; }}
                      onChange={toggleSelectAll}
                      style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#4ba6ea' }}
                    />
                  </Th>
                  <Th onClick={() => handleSort('booking_number')} style={{ cursor: 'pointer' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      Booking # {sortIcon('booking_number')}
                    </span>
                  </Th>
                  <Th style={{ minWidth: 120 }}>Status</Th>
                  <Th>Car</Th>
                  <Th>Plate</Th>
                  <Th style={{ minWidth: 150 }}>Customer</Th>
                  <Th onClick={() => handleSort('start_date')} style={{ cursor: 'pointer' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      Start {sortIcon('start_date')}
                    </span>
                  </Th>
                  <Th onClick={() => handleSort('end_date')} style={{ cursor: 'pointer' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      End {sortIcon('end_date')}
                    </span>
                  </Th>
                  <Th style={{ textAlign: 'center' }}>Kabis</Th>
                  <Th style={{ textAlign: 'center' }}>Invoice</Th>
                  <Th style={{ textAlign: 'right', paddingRight: 16 }}>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {loading && Array.from({ length: 7 }).map((_, i) => <SkeletonRow key={i} />)}

                {!loading && sorted.length === 0 && (
                  <tr>
                    <td colSpan={11} style={{ padding: '60px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
                      {search || statusFilter ? 'No bookings match your filters.' : 'No bookings for this month.'}
                    </td>
                  </tr>
                )}

                {!loading && sorted.map((booking, idx) => (
                  <BookingTableRow
                    key={booking.id}
                    booking={booking}
                    isSelected={selectedIds.has(booking.id)}
                    isEven={idx % 2 === 1}
                    onSelect={() => toggleSelectRow(booking.id)}
                    onToggle={handleToggle}
                    onEdit={() => setModal({ mode: 'edit', booking })}
                    onDelete={() => setDeleteTarget(booking)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          {!loading && (
            <div style={{ padding: '12px 20px', borderTop: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 13, color: '#9ca3af' }}>
                Showing{' '}
                <strong style={{ color: '#374151' }}>{sorted.length}</strong>
                {' '}of{' '}
                <strong style={{ color: '#374151' }}>{bookings.length}</strong>
                {' '}booking{bookings.length !== 1 ? 's' : ''}
              </span>
              {selectedIds.size > 0 && (
                <span style={{ fontSize: 13, color: '#4ba6ea', fontWeight: 600 }}>
                  {selectedIds.size} selected
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {modal === 'add' && (
        <BookingFormModal
          mode="add"
          initial={EMPTY_FORM}
          onClose={() => setModal(null)}
          onSaved={() => {
            showToast('Booking added successfully', 'success');
            fetchStats(selectedMonth);
            fetchBookings(selectedMonth);
          }}
        />
      )}
      {modal !== null && modal !== 'add' && (
        <BookingFormModal
          mode="edit"
          initial={editFormData(modal.booking)}
          editId={modal.booking.id}
          customerName={modal.booking.customer_name}
          onClose={() => setModal(null)}
          onSaved={() => {
            showToast('Booking updated', 'success');
            fetchStats(selectedMonth);
            fetchBookings(selectedMonth);
          }}
        />
      )}
      {deleteTarget && (
        <DeleteConfirm
          booking={deleteTarget}
          deleting={deleting}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
      {toast && <Toast {...toast} />}

      <style>{`
        .bk-stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 20px; }
        @media (min-width: 768px) { .bk-stats { grid-template-columns: repeat(4, 1fr); gap: 16px; } }
        .bk-row:hover td { background: #f9fafb !important; }
        @keyframes pulse     { 0%,100%{opacity:1} 50%{opacity:0.45} }
        @keyframes slideUpIn { from{transform:translateY(8px);opacity:0} to{transform:translateY(0);opacity:1} }
      `}</style>
    </div>
  );
};

export default BookingsPage;
