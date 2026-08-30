import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';
import { Trans, useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { sortCarsByModel } from '../lib/car-picker';
import { localisedCountryName } from '../lib/countries';
import type { Booking, BookingStatus } from '../types';
import { useCurrency } from '../lib/CurrencyContext';
import { printBookingContract } from '../lib/printContract';
import { printReplacementSheet } from '../lib/printReplacementSheet';
import type { ReplacementSheet } from '../lib/printReplacementSheet';
import { fetchCurrentUsdRate } from '../lib/exchangeRate';

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
  pickup_location: string | null;
  dropoff_location: string | null;
  km_at_delivery: number | null;
  fuel_at_delivery: string | null;
  insurance_type: string | null;
  notes: string | null;
  additional_services: string | null;
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
function formatMonthLabel(d: Date, locale: string): string {
  return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
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
function formatDateDisplay(s: string, locale: string): string {
  if (!s) return '—';
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Western digits in Arabic, matching Cars and Car Issues. Amounts are formatted
 * elsewhere and deliberately untouched: their shape reaches printed contracts
 * and invoices, which are outside this work.
 */
function useDateLocale(): string {
  const { i18n } = useTranslation();
  return i18n.resolvedLanguage?.startsWith('ar') ? 'ar-u-nu-latn' : 'en-GB';
}

/**
 * `(country) => name in the reader's language`.
 *
 * Only ever used for what is shown. The nationality select stores `c.name`, the
 * English name, because that column already holds English across every existing
 * customer row.
 */
function useCountryName(): (c: { code: string; name: string }) => string {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  return React.useCallback(
    (c: { code: string; name: string }) => localisedCountryName(lang, c.code, c.name),
    [lang],
  );
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
    insurance_type: row.insurance_type ?? null,
    notes: row.notes ?? null,
    pickup_location: row.pickup_location ?? null,
    dropoff_location: row.dropoff_location ?? null,
    km_at_delivery: row.km_at_delivery ?? null,
    fuel_at_delivery: row.fuel_at_delivery ?? null,
    booking_number: row.booking_number,
    additional_driver: null,
    customer_id: row.customer_id,
    kabis_reported: row.kabis_reported,
    invoice_issued: row.invoice_issued,
    status: row.status,
    additional_services: row.additional_services ?? null,
    plate_number: carJoin?.plate_number ?? '—',
    car_model,
    customer_name,
  };
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<BookingStatus, { color: string; bg: string }> = {
  confirmed: { color: '#22c55e', bg: 'rgba(34,197,94,0.12)'   },
  pending:   { color: '#f97316', bg: 'rgba(249,115,22,0.12)'  },
  cancelled: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)'   },
  completed: { color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
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
  const { t } = useTranslation('bookings');
  const cfg = STATUS_CONFIG[status];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11, fontWeight: 700,
      color: cfg.color, background: cfg.bg,
      borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
      {t(`status.${status}`)}
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
      position: 'fixed', bottom: 28, insetInlineEnd: 28, zIndex: 2000,
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
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="hc-flip">
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
      textAlign: 'start', background: '#fff',
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
  onPrint: () => void;
}

const BookingTableRow: React.FC<RowProps> = ({
  booking, isSelected, isEven, onSelect, onToggle, onEdit, onPrint,
}) => {
  const { t } = useTranslation('bookings');
  const dateLocale = useDateLocale();
  return (
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
        {formatDateDisplay(booking.start_date, dateLocale)}
      </span>
    </td>
    <td style={{ padding: '9px 12px' }}>
      <span style={{ fontSize: 13, color: '#6b7280', whiteSpace: 'nowrap' }}>
        {formatDateDisplay(booking.end_date, dateLocale)}
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
    <td style={{ padding: '9px 16px 9px 8px', textAlign: 'end' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
        <ActionBtn onClick={onPrint} title={t('table.printContract')} hoverColor="#8b5cf6">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M6 9V2h12v7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <rect x="6" y="14" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </ActionBtn>
        <ActionBtn onClick={onEdit} title={t('table.edit')} hoverColor="#4ba6ea">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </ActionBtn>
      </div>
    </td>
  </tr>
  );
};

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

// ─── Phone helpers ────────────────────────────────────────────────────────────

function parseStoredPhone(stored: string): { dial: string; local: string } {
  if (!stored) return { dial: '+90', local: '' };
  const normalized = stored.startsWith('+') ? stored : `+${stored}`;
  try {
    const parsed = parsePhoneNumber(normalized);
    if (parsed) {
      return { dial: `+${parsed.countryCallingCode}`, local: parsed.nationalNumber };
    }
  } catch {}
  // Fallback: match by longest known dial code prefix
  const match = COUNTRIES.slice()
    .sort((a, b) => b.dial.length - a.dial.length)
    .find(c => normalized.startsWith(c.dial));
  if (match) return { dial: match.dial, local: normalized.slice(match.dial.length) };
  return { dial: '+90', local: stored };
}

// ─── Searchable dial-code picker ──────────────────────────────────────────────

const DialCodePicker: React.FC<{
  value: string;
  onChange: (dial: string) => void;
}> = ({ value, onChange }) => {
  const { t } = useTranslation('bookings');
  const countryName = useCountryName();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const selected = COUNTRIES.find(c => c.dial === value && c.code === 'TR') ??
                   COUNTRIES.find(c => c.dial === value) ??
                   COUNTRIES.find(c => c.code === 'TR')!;

  const filtered = search.trim()
    ? COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        countryName(c).toLowerCase().includes(search.toLowerCase()) ||
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
          position: 'absolute', top: 44, insetInlineStart: 0, zIndex: 300,
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
              placeholder={t('form.searchCountry')}
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
                  textAlign: 'start', color: '#374151',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f9fafb'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
              >
                <span style={{ fontSize: 17, lineHeight: 1, flexShrink: 0 }}>{c.flag}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{countryName(c)}</span>
                <span style={{ color: '#9ca3af', fontSize: 12, flexShrink: 0 }}>{c.dial}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: '12px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                {t('noResults')}
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
  // Vehicle condition at delivery
  pickup_location: string;
  dropoff_location: string;
  km_at_delivery: string;
  fuel_at_delivery: string;
  // Insurance & additional services
  insurance_type: string;
  additional_services: string;
  // Customer fields (add mode only)
  cust_id_type: 'passport' | 'national_id';
  cust_language: CustomerLanguage;
  cust_id_number: string;
  cust_first_name: string;
  cust_last_name: string;
  cust_phone_dial: string;
  cust_phone: string;
  cust_nationality: string;
  cust_driving_license_number: string;
  cust_license_issue_date: string;
  cust_address: string;
  cust_birth_date: string;
  cust_notes: string;
  // Financial fields (add mode only)
  fin_currency: 'TRY' | 'USD';
  fin_rental_amount: string;
  fin_deposit: string;
  fin_paid_amount: string;
};

/** Mirrors the customers_language_check constraint: only these three values are accepted. */
type CustomerLanguage = 'ar' | 'tr' | 'en';

const CUSTOMER_LANGUAGES: { value: CustomerLanguage; labelKey: string }[] = [
  { value: 'ar', labelKey: 'customerLanguages.ar' },
  { value: 'tr', labelKey: 'customerLanguages.tr' },
  { value: 'en', labelKey: 'customerLanguages.en' },
];

/** Falls back to the column default for anything unrecognised. */
const toCustomerLanguage = (v: unknown): CustomerLanguage =>
  (v === 'tr' || v === 'en' || v === 'ar') ? v : 'ar';

const EMPTY_FORM: BookingFormData = {
  booking_number: '', status: 'pending', car_id: '',
  start_date: '', end_date: '',
  pickup_location: '', dropoff_location: '', km_at_delivery: '', fuel_at_delivery: '',
  insurance_type: '', additional_services: '',
  cust_id_type: 'passport', cust_id_number: '',
  cust_language: 'ar',
  cust_first_name: '', cust_last_name: '',
  cust_phone_dial: '+90', cust_phone: '',
  cust_nationality: '',
  cust_driving_license_number: '', cust_license_issue_date: '',
  cust_address: '', cust_birth_date: '', cust_notes: '',
  fin_currency: 'TRY', fin_rental_amount: '', fin_deposit: '', fin_paid_amount: '',
};

const LOCATION_PRESETS = [
  'Şişli Branch',
  'Kayaşehir Branch',
  'Istanbul Airport (IST)',
  'Sabiha Gökçen Airport (SAW)',
] as const;

const isLocationPreset = (val: string): boolean =>
  (LOCATION_PRESETS as readonly string[]).includes(val);

const INSURANCE_PRESETS = [
  'Korumasız',
  'Kısmi Koruma',
  'Orta Koruma',
  'Tam Koruma',
] as const;
const isInsurancePreset = (val: string): boolean =>
  (INSURANCE_PRESETS as readonly string[]).includes(val);

const ADDITIONAL_SERVICE_OPTS = ['Çocuk Koltuğu', 'Yedek Sürücü', 'Ek Kilometre'] as const;

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

// ─── Document upload field ────────────────────────────────────────────────────

const DocUploadField: React.FC<{
  label:       string;
  existingUrl?: string | null;
  file:        File | null;
  onChange:    (f: File | null) => void;
}> = ({ label, existingUrl, file, onChange }) => {
  const { t: tc } = useTranslation('common');
  const { t: tc2 } = useTranslation('bookings');
  const [preview, setPreview] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!file || !file.type.startsWith('image/')) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const isImage = (url: string) => /\.(jpe?g|png|gif|webp)(\?|$)/i.test(url);

  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
        {label}
      </label>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,.pdf" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0] ?? null; onChange(f); e.target.value = ''; }} />

      {/* Existing file row */}
      {existingUrl && !file && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, padding: '6px 10px', borderRadius: 8, background: '#f8faff', border: '1px solid rgba(75,166,234,0.18)' }}>
          {isImage(existingUrl) ? (
            <img src={existingUrl} alt="doc" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 36, height: 36, borderRadius: 6, background: '#e0edfa', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="#4ba6ea" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 2v6h6" stroke="#4ba6ea" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
          )}
          <a href={existingUrl} target="_blank" rel="noopener noreferrer" style={{ flex: 1, fontSize: 12, color: '#4ba6ea', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {tc2('viewCurrentFile')}
          </a>
          <button type="button" onClick={() => inputRef.current?.click()} style={{ fontSize: 11, color: '#6b7280', background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            {tc2('replaceFile')}
          </button>
        </div>
      )}

      {/* New file preview */}
      {file && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 9, border: '1.5px solid #4ba6ea', background: 'rgba(75,166,234,0.04)', marginBottom: 0 }}>
          {preview ? (
            <img src={preview} alt="preview" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, flexShrink: 0, border: '1px solid rgba(75,166,234,0.2)' }} />
          ) : (
            <div style={{ width: 44, height: 44, borderRadius: 6, background: 'rgba(75,166,234,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="#4ba6ea" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 2v6h6" stroke="#4ba6ea" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#0f1117', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
            <div style={{ fontSize: 11, color: '#4ba6ea', marginTop: 1 }}>Ready · {(file.size / 1024).toFixed(0)} KB</div>
          </div>
          <button type="button" onClick={() => onChange(null)}
            style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', flexShrink: 0 }}
            onMouseEnter={e => { const b = e.currentTarget; b.style.color = '#ef4444'; b.style.borderColor = '#fca5a5'; }}
            onMouseLeave={e => { const b = e.currentTarget; b.style.color = '#9ca3af'; b.style.borderColor = '#e5e7eb'; }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
          </button>
        </div>
      )}

      {/* Upload zone — only when no new file */}
      {!file && (
        <button type="button" onClick={() => inputRef.current?.click()}
          style={{ width: '100%', height: existingUrl ? 44 : 68, borderRadius: 9, border: '1.5px dashed #e5e7eb', background: '#fafafa', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, cursor: 'pointer', color: '#9ca3af', transition: 'all 140ms ease' }}
          onMouseEnter={e => { const b = e.currentTarget; b.style.borderColor = '#4ba6ea'; b.style.color = '#4ba6ea'; b.style.background = 'rgba(75,166,234,0.04)'; }}
          onMouseLeave={e => { const b = e.currentTarget; b.style.borderColor = '#e5e7eb'; b.style.color = '#9ca3af'; b.style.background = '#fafafa'; }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <polyline points="17 8 12 3 7 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          {!existingUrl && <span style={{ fontSize: 11, fontWeight: 500 }}>{tc('actions.uploadFile')}</span>}
        </button>
      )}
    </div>
  );
};

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
  editCustomerId?: number;
  onClose: () => void;
  onSaved: () => void;
}

const BookingFormModal: React.FC<FormModalProps> = ({
  mode, initial, editId, editCustomerId, onClose, onSaved,
}) => {
  const { t } = useTranslation('bookings');
  const { t: tc } = useTranslation('common');
  const dateLocale = useDateLocale();
  const countryName = useCountryName();
  const [form, setForm] = useState<BookingFormData>(initial);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [cars, setCars] = useState<CarOption[]>([]);
  const [bookingNumLoading, setBookingNumLoading] = useState(mode === 'add');
  const { rates } = useCurrency();

  // Location dropdown "Other" mode — true when value doesn't match a preset
  const [pickupOther,  setPickupOther]  = useState(() => !!initial.pickup_location  && !isLocationPreset(initial.pickup_location));
  const [dropoffOther, setDropoffOther] = useState(() => !!initial.dropoff_location && !isLocationPreset(initial.dropoff_location));

  // Insurance "Other" mode
  const [insuranceOther, setInsuranceOther] = useState(() =>
    !!initial.insurance_type && !isInsurancePreset(initial.insurance_type)
  );

  // Additional services checkboxes
  const [additionalChecked, setAdditionalChecked] = useState<string[]>(() => {
    if (!initial.additional_services) return [];
    const parts = initial.additional_services.split(',').map(s => s.trim()).filter(Boolean);
    const checked: string[] = [];
    for (const p of parts) {
      if ((ADDITIONAL_SERVICE_OPTS as readonly string[]).includes(p as typeof ADDITIONAL_SERVICE_OPTS[number])) {
        checked.push(p);
      } else {
        checked.push('Diğer');
      }
    }
    return [...new Set(checked)];
  });
  const [additionalOtherText, setAdditionalOtherText] = useState<string>(() => {
    if (!initial.additional_services) return '';
    const parts = initial.additional_services.split(',').map(s => s.trim()).filter(Boolean);
    return parts.find(p => !(ADDITIONAL_SERVICE_OPTS as readonly string[]).includes(p as typeof ADDITIONAL_SERVICE_OPTS[number])) ?? '';
  });

  // Document uploads
  const [docIdPhoto,           setDocIdPhoto]           = useState<File | null>(null);
  const [docIdPhotoBack,       setDocIdPhotoBack]       = useState<File | null>(null);
  const [docDrivingLicense,    setDocDrivingLicense]    = useState<File | null>(null);
  const [docDrivingLicenseBack, setDocDrivingLicenseBack] = useState<File | null>(null);
  const [docEntryStamp,        setDocEntryStamp]        = useState<File | null>(null);
  const [existingDocUrls,      setExistingDocUrls]      = useState<{
    id_photo_url:                  string | null;
    id_photo_back_url:             string | null;
    driving_license_photo_url:     string | null;
    driving_license_back_url:      string | null;
    entry_stamp_photo_url:         string | null;
  }>({ id_photo_url: null, id_photo_back_url: null, driving_license_photo_url: null, driving_license_back_url: null, entry_stamp_photo_url: null });

  // ID lookup (add mode only)
  const [idLookupStatus, setIdLookupStatus] = useState<'idle' | 'searching' | 'found' | 'not-found'>('idle');
  const idLookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Field-level validation errors
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<'cust_id_number' | 'cust_id_type' | 'cust_nationality' | 'cust_phone' | 'cust_license_issue_date', string>>>({});

  // Refs for scroll-to-error
  const refIdNumber         = useRef<HTMLDivElement>(null);
  const refIdType           = useRef<HTMLDivElement>(null);
  const refNationality      = useRef<HTMLDivElement>(null);
  const refPhone            = useRef<HTMLDivElement>(null);
  const refLicenseIssueDate = useRef<HTMLDivElement>(null);

  /**
   * Every customer document is keyed by customer id, never by name: names may contain
   * characters Storage rejects (Turkish/Arabic), and two customers sharing a name would
   * overwrite each other because upsert is enabled.
   */
  const uploadDocById = async (file: File, fieldName: string, customerId: string | number): Promise<string | null> => {
    const ext  = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
    const path = `${customerId}/${fieldName}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('customers_doc').upload(path, file, { upsert: true });
    if (error) { console.error(`[Booking] upload ${fieldName} error:`, error); return null; }
    const { data } = supabase.storage.from('customers_doc').getPublicUrl(path);
    return data.publicUrl;
  };

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
        .from('cars').select('id, plate_number, model_group(name)').eq('is_active', true);
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
      setCars(sortCarsByModel(carOpts));

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

  // Fetch existing customer data in edit mode
  useEffect(() => {
    if (mode !== 'edit' || !editCustomerId) return;
    let active = true;
    supabase
      .from('customers')
      .select('*')
      .eq('id', editCustomerId)
      .single()
      .then(({ data, error }) => {
        if (!active || error || !data) return;
        const c = data as {
          first_name: string; last_name: string; phone: string | null;
          nationality: string | null; id_type: string | null; id_number: string | null;
          driving_license_number: string | null;
          license_issue_date: string | null;
          address: string | null; birth_date: string | null; notes: string | null;
          id_photo_url: string | null; id_photo_back_url: string | null;
          driving_license_photo_url: string | null; driving_license_back_url: string | null;
          entry_stamp_photo_url: string | null;
          language: string | null;
        };
        setForm(f => ({
          ...f,
          cust_first_name:             c.first_name,
          cust_last_name:              c.last_name,
          cust_phone_dial:             parseStoredPhone(c.phone ?? '').dial,
          cust_phone:                  parseStoredPhone(c.phone ?? '').local,
          cust_nationality:            c.nationality ?? '',
          cust_language:               toCustomerLanguage(c.language),
          cust_id_type:                (c.id_type === 'national_id' ? 'national_id' : 'passport') as 'passport' | 'national_id',
          cust_id_number:              c.id_number ?? '',
          cust_driving_license_number: c.driving_license_number ?? '',
          cust_license_issue_date:     c.license_issue_date ?? '',
          cust_address:                c.address ?? '',
          cust_birth_date:             c.birth_date ?? '',
          cust_notes:                  c.notes ?? '',
        }));
        setExistingDocUrls({
          id_photo_url:              c.id_photo_url              ?? null,
          id_photo_back_url:         c.id_photo_back_url         ?? null,
          driving_license_photo_url: c.driving_license_photo_url ?? null,
          driving_license_back_url:  c.driving_license_back_url  ?? null,
          entry_stamp_photo_url:     c.entry_stamp_photo_url     ?? null,
        });
      });
    return () => { active = false; };
  }, [mode, editCustomerId]);

  // Fetch existing ledger rows in edit mode
  const [existingLedgerIds, setExistingLedgerIds] = useState<{ rental?: number; deposit?: number; payment?: number }>({});

  useEffect(() => {
    if (mode !== 'edit' || !editId) return;
    let active = true;
    supabase
      .from('customer_accounting_ledger')
      .select('id, type, amount')
      .eq('booking_id', editId)
      .in('type', ['rental', 'deposit', 'payment'])
      .then(({ data }) => {
        if (!active || !data) return;
        const ids: typeof existingLedgerIds = {};
        const amts: Record<string, string> = {};
        for (const row of data as { id: number; type: string; amount: number }[]) {
          if (row.type === 'rental' || row.type === 'deposit' || row.type === 'payment') {
            ids[row.type as 'rental' | 'deposit' | 'payment'] = row.id;
            amts[row.type] = row.amount > 0 ? String(row.amount) : '';
          }
        }
        setExistingLedgerIds(ids);
        setForm(f => ({
          ...f,
          fin_currency:      'TRY',
          fin_rental_amount: amts['rental']    ?? '',
          fin_deposit:     amts['deposit'] ?? '',
          fin_paid_amount:   amts['payment']   ?? '',
        }));
      });
    return () => { active = false; };
  }, [mode, editId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Convert field amounts when currency toggle is switched
  const handleFinCurrencyChange = (newCurrency: 'TRY' | 'USD') => {
    const oldCurrency = form.fin_currency;
    if (oldCurrency === newCurrency) return;
    const usdRate = rates.find(r => r.currency === 'USD')?.rate_to_try ?? 1;
    const convert = (val: string) => {
      const num = parseFloat(val);
      if (!num || isNaN(num)) return val;
      const result = oldCurrency === 'TRY' ? num / usdRate : num * usdRate;
      return result.toFixed(2);
    };
    setForm(f => ({
      ...f,
      fin_currency:      newCurrency,
      fin_rental_amount: convert(f.fin_rental_amount),
      fin_deposit:     convert(f.fin_deposit),
      fin_paid_amount:   convert(f.fin_paid_amount),
    }));
  };

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => { if (idLookupTimer.current) clearTimeout(idLookupTimer.current); };
  }, []);

  const lookupByIdNumber = useCallback(async (idNum: string) => {
    if (!idNum.trim()) { setIdLookupStatus('idle'); return; }
    setIdLookupStatus('searching');
    const { data, error: lookupErr } = await supabase
      .from('customers')
      .select('*')
      .eq('id_number', idNum.trim())
      .maybeSingle();
    if (lookupErr || !data) { setIdLookupStatus('not-found'); return; }
    const c = data as {
      first_name: string; last_name: string; phone: string | null;
      nationality: string | null; id_type: string | null; id_number: string | null;
      driving_license_number: string | null;
      license_issue_date: string | null;
      address: string | null; birth_date: string | null; notes: string | null;
      id_photo_url: string | null; id_photo_back_url: string | null;
      driving_license_photo_url: string | null; driving_license_back_url: string | null;
      entry_stamp_photo_url: string | null;
      language: string | null;
    };
    setForm(f => ({
      ...f,
      cust_first_name:             c.first_name,
      cust_last_name:              c.last_name,
      cust_phone_dial:             parseStoredPhone(c.phone ?? '').dial,
      cust_phone:                  parseStoredPhone(c.phone ?? '').local,
      cust_nationality:            c.nationality ?? '',
      cust_language:               toCustomerLanguage(c.language),
      cust_id_type:                (c.id_type === 'national_id' ? 'national_id' : 'passport') as 'passport' | 'national_id',
      cust_driving_license_number: c.driving_license_number ?? '',
      cust_license_issue_date:     c.license_issue_date ?? '',
      cust_address:                c.address ?? '',
      cust_birth_date:             c.birth_date ?? '',
      cust_notes:                  c.notes ?? '',
    }));
    setExistingDocUrls({
      id_photo_url:              c.id_photo_url              ?? null,
      id_photo_back_url:         c.id_photo_back_url         ?? null,
      driving_license_photo_url: c.driving_license_photo_url ?? null,
      driving_license_back_url:  c.driving_license_back_url  ?? null,
      entry_stamp_photo_url:     c.entry_stamp_photo_url     ?? null,
    });
    setIdLookupStatus('found');
  }, []);

  const set = <K extends keyof BookingFormData>(key: K, value: BookingFormData[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  const buildAdditionalServices = (): string | null => {
    const parts = additionalChecked
      .filter(s => s !== 'Diğer')
      .concat(additionalChecked.includes('Diğer') && additionalOtherText.trim() ? [additionalOtherText.trim()] : []);
    return parts.length > 0 ? parts.join(',') : null;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    // Validate required customer fields
    const errors: typeof fieldErrors = {};
    if (!form.cust_id_number.trim())        errors.cust_id_number        = t('errors.idRequired');
    if (!form.cust_id_type)                 errors.cust_id_type          = 'ID type is required';
    if (!form.cust_nationality)             errors.cust_nationality      = t('errors.nationalityRequired');
    if (!form.cust_phone.trim()) {
      errors.cust_phone = t('errors.phoneRequired');
    } else {
      const fullPhone = `${form.cust_phone_dial}${form.cust_phone}`;
      if (!isValidPhoneNumber(fullPhone)) errors.cust_phone = t('errors.phoneInvalid');
    }
    if (!form.cust_license_issue_date)      errors.cust_license_issue_date = t('errors.licenseDateRequired');

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      // Scroll to first error
      const firstRef = errors.cust_id_number        ? refIdNumber
                     : errors.cust_id_type          ? refIdType
                     : errors.cust_nationality      ? refNationality
                     : errors.cust_phone            ? refPhone
                     : refLicenseIssueDate;
      firstRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setFieldErrors({});

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
          language:            form.cust_language,
          driving_license_number: form.cust_driving_license_number || null,
          license_issue_date:  form.cust_license_issue_date || null,
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

      // Step 2: upload documents and patch customer
      const customerId = (custData as { id: number }).id;
      const docUpdates: Record<string, string> = {};

      const [idUrl, idBackUrl, dlUrl, dlBackUrl, esUrl] = await Promise.all([
        docIdPhoto            ? uploadDocById(docIdPhoto,            'id-photo',             customerId)            : Promise.resolve(null),
        docIdPhotoBack        ? uploadDocById(docIdPhotoBack,        'id-photo-back',        customerId)            : Promise.resolve(null),
        docDrivingLicense     ? uploadDocById(docDrivingLicense,     'driving-license',      customerId)            : Promise.resolve(null),
        docDrivingLicenseBack ? uploadDocById(docDrivingLicenseBack, 'driving-license-back', customerId)            : Promise.resolve(null),
        docEntryStamp         ? uploadDocById(docEntryStamp,         'entry-stamp',          customerId)            : Promise.resolve(null),
      ]);
      if (idUrl)     docUpdates.id_photo_url                  = idUrl;
      if (idBackUrl) docUpdates.id_photo_back_url             = idBackUrl;
      if (dlUrl)     docUpdates.driving_license_photo_url     = dlUrl;
      if (dlBackUrl) docUpdates.driving_license_back_url      = dlBackUrl;
      if (esUrl)     docUpdates.entry_stamp_photo_url         = esUrl;
      if (Object.keys(docUpdates).length > 0) {
        const { error: docErr } = await supabase.from('customers').update(docUpdates).eq('id', customerId);
        if (docErr) console.error('[Booking] customer doc update error:', docErr);
      }

      // Step 3: create booking with the new customer id
      const { data: bookingData, error: bookingError } = await supabase
        .from('bookings')
        .insert({
          booking_number:  form.booking_number,
          status:          form.status,
          car_id:          Number(form.car_id),
          customer_id:     customerId,
          start_date:      form.start_date,
          end_date:        form.end_date,
          kabis_reported:  false,
          invoice_issued:  false,
          pickup_location:  form.pickup_location  || null,
          dropoff_location: form.dropoff_location || null,
          km_at_delivery:   form.km_at_delivery  !== '' ? Number(form.km_at_delivery)  : null,
          fuel_at_delivery: form.fuel_at_delivery !== '' ? form.fuel_at_delivery : null,
          insurance_type:   form.insurance_type   || null,
          additional_services: buildAdditionalServices(),
        })
        .select('id')
        .single();

      if (bookingError) { setSaving(false); setFormError(bookingError.message); return; }

      // Step 4: insert ledger rows (skip rows with 0 or empty amount)
      const bookingId = (bookingData as { id: number }).id;
      const carIdNum  = Number(form.car_id);
      const usdRate   = rates.find(r => r.currency === 'USD')?.rate_to_try ?? 1;
      const toTRY     = (v: number) => form.fin_currency === 'USD' ? v * usdRate : v;
      type LedgerRow = { booking_id: number; customer_id: number; car_id: number; type: string; amount: number; direction: string; description: string; exchange_rate_at_entry?: number };
      // Stamp the rate that applies right now, exactly as the Customer Wallets page does.
      // Read once per save; if it cannot be read the field is omitted rather than blocking the booking.
      const entryRate = await fetchCurrentUsdRate();
      const rateStamp = entryRate != null ? { exchange_rate_at_entry: entryRate } : {};
      const ledgerRows: LedgerRow[] = [];
      const rentalAmt    = parseFloat(form.fin_rental_amount);
      const depositAmt = parseFloat(form.fin_deposit);
      const paidAmt      = parseFloat(form.fin_paid_amount);
      if (rentalAmt > 0)    ledgerRows.push({ booking_id: bookingId, customer_id: customerId, car_id: carIdNum, type: 'rental',    amount: toTRY(rentalAmt),    direction: 'OUT', description: 'Rental fee', ...rateStamp });
      if (depositAmt > 0) ledgerRows.push({ booking_id: bookingId, customer_id: customerId, car_id: carIdNum, type: 'deposit', amount: toTRY(depositAmt), direction: 'IN',  description: 'Deposit fee', ...rateStamp });
      if (paidAmt > 0)      ledgerRows.push({ booking_id: bookingId, customer_id: customerId, car_id: carIdNum, type: 'payment',   amount: toTRY(paidAmt),      direction: 'IN',  description: 'Customer payment', ...rateStamp });
      if (ledgerRows.length > 0) {
        const { error: ledgerError } = await supabase.from('customer_accounting_ledger').insert(ledgerRows);
        if (ledgerError) console.error('[Booking] ledger insert error:', ledgerError.message);
      }

      setSaving(false);
    } else {
      // Edit: update booking
      const { error: bookingErr } = await supabase
        .from('bookings')
        .update({
          booking_number:   form.booking_number,
          status:           form.status,
          car_id:           Number(form.car_id),
          start_date:       form.start_date,
          end_date:         form.end_date,
          pickup_location:  form.pickup_location  || null,
          dropoff_location: form.dropoff_location || null,
          km_at_delivery:   form.km_at_delivery  !== '' ? Number(form.km_at_delivery)  : null,
          fuel_at_delivery: form.fuel_at_delivery !== '' ? form.fuel_at_delivery : null,
          insurance_type:   form.insurance_type   || null,
          additional_services: buildAdditionalServices(),
        })
        .eq('id', editId!);

      if (bookingErr) { setSaving(false); setFormError(bookingErr.message); return; }

      // Edit: update customer + upload docs
      if (editCustomerId) {
        const phone    = form.cust_phone
          ? `${form.cust_phone_dial}${form.cust_phone}`
          : null;

        const [idUrl, idBackUrl, dlUrl, dlBackUrl, esUrl] = await Promise.all([
          docIdPhoto            ? uploadDocById(docIdPhoto,            'id-photo',             editCustomerId)                      : Promise.resolve(null),
          docIdPhotoBack        ? uploadDocById(docIdPhotoBack,        'id-photo-back',        editCustomerId)                      : Promise.resolve(null),
          docDrivingLicense     ? uploadDocById(docDrivingLicense,     'driving-license',      editCustomerId)                      : Promise.resolve(null),
          docDrivingLicenseBack ? uploadDocById(docDrivingLicenseBack, 'driving-license-back', editCustomerId)                      : Promise.resolve(null),
          docEntryStamp         ? uploadDocById(docEntryStamp,         'entry-stamp',          editCustomerId)                      : Promise.resolve(null),
        ]);

        const { error: custErr } = await supabase
          .from('customers')
          .update({
            first_name:              form.cust_first_name,
            last_name:               form.cust_last_name,
            phone,
            nationality:             form.cust_nationality            || null,
            language:                form.cust_language,
            id_type:                 form.cust_id_type,
            id_number:               form.cust_id_number              || null,
            driving_license_number:  form.cust_driving_license_number || null,
            license_issue_date:      form.cust_license_issue_date     || null,
            address:                 form.cust_address                || null,
            birth_date:              form.cust_birth_date             || null,
            notes:                   form.cust_notes                  || null,
            ...(idUrl     && { id_photo_url:                  idUrl     }),
            ...(idBackUrl && { id_photo_back_url:             idBackUrl }),
            ...(dlUrl     && { driving_license_photo_url:     dlUrl     }),
            ...(dlBackUrl && { driving_license_back_url:      dlBackUrl }),
            ...(esUrl     && { entry_stamp_photo_url:         esUrl     }),
          })
          .eq('id', editCustomerId);

        if (custErr) console.error('[Booking] customer update error:', custErr);
      }

      // Edit: upsert / delete ledger rows
      const carIdNum   = Number(form.car_id);
      const usdRate    = rates.find(r => r.currency === 'USD')?.rate_to_try ?? 1;
      const toTRY      = (v: number) => form.fin_currency === 'USD' ? v * usdRate : v;
      const ledgerDefs: Array<{ key: 'rental' | 'deposit' | 'payment'; amtField: string; direction: 'IN' | 'OUT'; description: string }> = [
        { key: 'rental',    amtField: form.fin_rental_amount, direction: 'OUT', description: 'Rental fee'       },
        { key: 'deposit',   amtField: form.fin_deposit,     direction: 'IN',  description: 'Deposit fee'      },
        { key: 'payment',   amtField: form.fin_paid_amount,   direction: 'IN',  description: 'Customer payment' },
      ];
      // Stamp the rate that applies right now, exactly as the Customer Wallets page does.
      // Read once per save; if it cannot be read the field is omitted rather than blocking the booking.
      const entryRate = await fetchCurrentUsdRate();
      const rateStamp = entryRate != null ? { exchange_rate_at_entry: entryRate } : {};
      await Promise.all(ledgerDefs.map(async ({ key, amtField, direction, description }) => {
        const amt        = parseFloat(amtField);
        const existingId = existingLedgerIds[key];
        if (existingId) {
          if (amt > 0) {
            // The amount is being rewritten, so the stored rate is re-stamped to match it.
            await supabase.from('customer_accounting_ledger').update({ amount: toTRY(amt), ...rateStamp }).eq('id', existingId);
          } else {
            await supabase.from('customer_accounting_ledger').delete().eq('id', existingId);
          }
        } else if (amt > 0) {
          await supabase.from('customer_accounting_ledger').insert({
            booking_id: editId!, customer_id: editCustomerId!, car_id: carIdNum,
            type: key, amount: toTRY(amt), direction, description, ...rateStamp,
          });
        }
      }));

      setSaving(false);
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
              {mode === 'add' ? t('form.newTitle') : t('form.editTitle')}
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
              {mode === 'add' ? t('form.newSubtitle') : t('form.editSubtitle')}
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
              title={t('form.bookingDetails')}
              icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>}
            />

            <Field label={t('form.bookingNumber')}>
              <div style={{
                ...INPUT_STYLE, display: 'flex', alignItems: 'center',
                background: '#f9fafb', color: bookingNumLoading ? '#9ca3af' : '#0f1117',
                fontWeight: bookingNumLoading ? 400 : 700, letterSpacing: bookingNumLoading ? 0 : '0.3px',
                cursor: 'default',
              }}>
                {bookingNumLoading ? 'Generating…' : form.booking_number}
              </div>
            </Field>

            <Field label={tc('fields.status')}>
              <select value={form.status} onChange={e => set('status', e.target.value as BookingStatus)}
                style={{ ...INPUT_STYLE, cursor: 'pointer' }} onFocus={focusBlue} onBlur={blurGray}>
                <option value="pending">{t('status.pending')}</option>
                <option value="confirmed">{t('status.confirmed')}</option>
                <option value="cancelled">{t('status.cancelled')}</option>
              </select>
            </Field>

            <div style={{ gridColumn: 'span 2' }}>
              <Field label={tc('fields.car')} required>
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
            </div>

            <Field label={tc('fields.startDate')} required>
              <input required type="date" value={form.start_date}
                onChange={e => set('start_date', e.target.value)}
                style={INPUT_STYLE} onFocus={focusBlue} onBlur={blurGray} />
            </Field>

            <Field label={tc('fields.endDate')} required>
              <input required type="date" value={form.end_date}
                onChange={e => set('end_date', e.target.value)}
                style={INPUT_STYLE} onFocus={focusBlue} onBlur={blurGray} />
            </Field>

            {/* ── Vehicle Condition at Delivery ── */}
            <SectionHeading
              title={t('form.vehicleCondition')}
              icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 17H3a2 2 0 01-2-2v-4a2 2 0 012-2h1l2-4h10l2 4h1a2 2 0 012 2v4a2 2 0 01-2 2h-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><circle cx="7.5" cy="17.5" r="2.5" stroke="currentColor" strokeWidth="1.8"/><circle cx="16.5" cy="17.5" r="2.5" stroke="currentColor" strokeWidth="1.8"/></svg>}
            />

            <Field label={t('form.pickupLocation')}>
              <select
                value={pickupOther ? 'other' : form.pickup_location}
                onChange={e => {
                  const val = e.target.value;
                  if (val === 'other') {
                    setPickupOther(true);
                    set('pickup_location', '');
                  } else {
                    setPickupOther(false);
                    set('pickup_location', val);
                  }
                }}
                style={{ ...INPUT_STYLE, cursor: 'pointer' }}
                onFocus={focusBlue}
                onBlur={blurGray}
              >
                <option value="">{t('form.selectLocation')}</option>
                {LOCATION_PRESETS.map(p => <option key={p} value={p}>{p}</option>)}
                <option value="other">{tc('actions.other')}</option>
              </select>
              {pickupOther && (
                <input
                  type="text"
                  value={form.pickup_location}
                  onChange={e => set('pickup_location', e.target.value)}
                  placeholder={t('form.customLocation')}
                  style={{ ...INPUT_STYLE, marginTop: 8 }}
                  onFocus={focusBlue}
                  onBlur={blurGray}
                  autoFocus
                />
              )}
            </Field>

            <Field label={t('form.dropoffLocation')}>
              <select
                value={dropoffOther ? 'other' : form.dropoff_location}
                onChange={e => {
                  const val = e.target.value;
                  if (val === 'other') {
                    setDropoffOther(true);
                    set('dropoff_location', '');
                  } else {
                    setDropoffOther(false);
                    set('dropoff_location', val);
                  }
                }}
                style={{ ...INPUT_STYLE, cursor: 'pointer' }}
                onFocus={focusBlue}
                onBlur={blurGray}
              >
                <option value="">{t('form.selectLocation')}</option>
                {LOCATION_PRESETS.map(p => <option key={p} value={p}>{p}</option>)}
                <option value="other">{tc('actions.other')}</option>
              </select>
              {dropoffOther && (
                <input
                  type="text"
                  value={form.dropoff_location}
                  onChange={e => set('dropoff_location', e.target.value)}
                  placeholder={t('form.customLocation')}
                  style={{ ...INPUT_STYLE, marginTop: 8 }}
                  onFocus={focusBlue}
                  onBlur={blurGray}
                  autoFocus
                />
              )}
            </Field>

            <Field label={t('form.kmAtDelivery')}>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={form.km_at_delivery}
                onChange={e => set('km_at_delivery', e.target.value)}
                placeholder={t('form.kmPlaceholder')}
                style={INPUT_STYLE}
                onFocus={focusBlue}
                onBlur={blurGray}
              />
            </Field>

            <Field label={t('form.fuelAtDelivery')}>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={form.fuel_at_delivery}
                onChange={e => set('fuel_at_delivery', e.target.value)}
                placeholder={t('form.fuelPlaceholder')}
                style={INPUT_STYLE}
                onFocus={focusBlue}
                onBlur={blurGray}
              />
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{t('form.fuelHint')}</div>
            </Field>

            {/* ── Insurance & Additional Services ── */}
            <SectionHeading
              title="SİGORTA VE EK HİZMETLER"
              icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 2L3 7v5c0 5 3.8 9.7 9 11 5.2-1.3 9-6 9-11V7L12 2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            />

            <Field label={t('form.insuranceType')}>
              <select
                value={insuranceOther ? 'other' : form.insurance_type}
                onChange={e => {
                  const val = e.target.value;
                  if (val === 'other') {
                    setInsuranceOther(true);
                    set('insurance_type', '');
                  } else {
                    setInsuranceOther(false);
                    set('insurance_type', val);
                  }
                }}
                style={{ ...INPUT_STYLE, cursor: 'pointer' }}
                onFocus={focusBlue}
                onBlur={blurGray}
              >
                <option value="">{t('form.selectInsurance')}</option>
                {INSURANCE_PRESETS.map(p => <option key={p} value={p}>{p}</option>)}
                <option value="other" style={{ color: '#ef4444' }}>Diğer</option>
              </select>
              {insuranceOther && (
                <input
                  type="text"
                  value={form.insurance_type}
                  onChange={e => set('insurance_type', e.target.value)}
                  placeholder={t('form.specifyInsurance')}
                  style={{ ...INPUT_STYLE, marginTop: 8 }}
                  onFocus={focusBlue}
                  onBlur={blurGray}
                  autoFocus
                />
              )}
            </Field>

            <Field label={t('form.additionalServices')}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
                {([...ADDITIONAL_SERVICE_OPTS, 'Diğer'] as string[]).map(opt => (
                  <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', minHeight: 24 }}>
                    <input
                      type="checkbox"
                      checked={additionalChecked.includes(opt)}
                      onChange={e => {
                        if (e.target.checked) {
                          setAdditionalChecked(prev => [...prev, opt]);
                        } else {
                          setAdditionalChecked(prev => prev.filter(x => x !== opt));
                          if (opt === 'Diğer') setAdditionalOtherText('');
                        }
                      }}
                      style={{ width: 16, height: 16, accentColor: '#4ba6ea', cursor: 'pointer', flexShrink: 0 }}
                    />
                    <span style={{ fontSize: 14, color: opt === 'Diğer' ? '#ef4444' : '#374151', userSelect: 'none' }}>{opt}</span>
                  </label>
                ))}
                {additionalChecked.includes('Diğer') && (
                  <input
                    type="text"
                    value={additionalOtherText}
                    onChange={e => setAdditionalOtherText(e.target.value)}
                    placeholder={t('form.specifyService')}
                    style={{ ...INPUT_STYLE }}
                    onFocus={focusBlue}
                    onBlur={blurGray}
                    autoFocus
                  />
                )}
              </div>
            </Field>

            {/* ── Customer Information ── */}
            <>
              <SectionHeading
                title={t('form.customerInfo')}
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>}
              />

                {/* ── ID Number first — with auto-lookup in add mode ── */}
                <div ref={refIdNumber}>
                <Field label={t('form.idNumber')} required>
                  <input value={form.cust_id_number}
                    onChange={e => {
                      set('cust_id_number', e.target.value);
                      if (fieldErrors.cust_id_number) setFieldErrors(fe => ({ ...fe, cust_id_number: undefined }));
                      if (mode === 'add') {
                        setIdLookupStatus('idle');
                        if (idLookupTimer.current) clearTimeout(idLookupTimer.current);
                        if (e.target.value.trim()) {
                          idLookupTimer.current = setTimeout(() => lookupByIdNumber(e.target.value), 500);
                        }
                      }
                    }}
                    placeholder={t('form.documentNumber')}
                    style={{ ...INPUT_STYLE, borderColor: fieldErrors.cust_id_number ? '#ef4444' : '#e5e7eb' }}
                    onFocus={focusBlue}
                    onBlur={e => {
                      if (!fieldErrors.cust_id_number) blurGray(e);
                      if (mode === 'add' && form.cust_id_number.trim()) {
                        if (idLookupTimer.current) clearTimeout(idLookupTimer.current);
                        lookupByIdNumber(form.cust_id_number);
                      }
                    }}
                  />
                  {fieldErrors.cust_id_number && (
                    <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{fieldErrors.cust_id_number}</div>
                  )}
                </Field>
                </div>

                <div ref={refIdType}>
                <Field label={t('form.idType')} required>
                  <select value={form.cust_id_type}
                    onChange={e => { set('cust_id_type', e.target.value as 'passport' | 'national_id'); if (fieldErrors.cust_id_type) setFieldErrors(fe => ({ ...fe, cust_id_type: undefined })); }}
                    style={{ ...INPUT_STYLE, cursor: 'pointer', borderColor: fieldErrors.cust_id_type ? '#ef4444' : '#e5e7eb' }} onFocus={focusBlue} onBlur={blurGray}>
                    <option value="passport">{t('form.passport')}</option>
                    <option value="national_id">{t('form.nationalId')}</option>
                  </select>
                  {fieldErrors.cust_id_type && (
                    <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{fieldErrors.cust_id_type}</div>
                  )}
                </Field>
                </div>

                {/* Auto-fill status indicator */}
                {mode === 'add' && idLookupStatus !== 'idle' && (
                  <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: 7, margin: '-4px 0 4px' }}>
                    {idLookupStatus === 'searching' && (
                      <>
                        <div style={{
                          width: 13, height: 13, borderRadius: '50%',
                          border: '2px solid #e5e7eb', borderTop: '2px solid #4ba6ea',
                          animation: 'spin 0.7s linear infinite', flexShrink: 0,
                        }} />
                        <span style={{ fontSize: 12, color: '#6b7280' }}>Looking up customer…</span>
                      </>
                    )}
                    {idLookupStatus === 'found' && (
                      <span style={{ fontSize: 12.5, color: '#16a34a', fontWeight: 600 }}>
                        ✅ Customer found
                      </span>
                    )}
                    {idLookupStatus === 'not-found' && (
                      <span style={{ fontSize: 12, color: '#9ca3af' }}>
                        {t('newCustomerHint')}
                      </span>
                    )}
                  </div>
                )}

                {/* Row 2: First Name | Last Name */}
                <Field label={tc('fields.firstName')} required>
                  <input required value={form.cust_first_name}
                    onChange={e => set('cust_first_name', e.target.value)}
                    placeholder={t('form.firstNamePlaceholder')} style={INPUT_STYLE}
                    onFocus={focusBlue} onBlur={blurGray} />
                </Field>

                <Field label={tc('fields.lastName')} required>
                  <input required value={form.cust_last_name}
                    onChange={e => set('cust_last_name', e.target.value)}
                    placeholder={t('form.lastNamePlaceholder')} style={INPUT_STYLE}
                    onFocus={focusBlue} onBlur={blurGray} />
                </Field>

                {/* Row 3: Driving License | License Issue Date */}
                <Field label={t('form.drivingLicense')}>
                  <input value={form.cust_driving_license_number}
                    onChange={e => set('cust_driving_license_number', e.target.value)}
                    placeholder={t('form.licenseNumber')} style={INPUT_STYLE}
                    onFocus={focusBlue} onBlur={blurGray} />
                </Field>

                <div ref={refLicenseIssueDate}>
                <Field label={t('form.licenseIssueDate')} required>
                  <input type="date" value={form.cust_license_issue_date}
                    onChange={e => { set('cust_license_issue_date', e.target.value); if (fieldErrors.cust_license_issue_date) setFieldErrors(fe => ({ ...fe, cust_license_issue_date: undefined })); }}
                    style={{ ...INPUT_STYLE, borderColor: fieldErrors.cust_license_issue_date ? '#ef4444' : '#e5e7eb' }}
                    onFocus={focusBlue}
                    onBlur={e => { if (!fieldErrors.cust_license_issue_date) blurGray(e); }} />
                  {fieldErrors.cust_license_issue_date && (
                    <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{fieldErrors.cust_license_issue_date}</div>
                  )}
                  {form.cust_license_issue_date && (() => {
                    const diffDays = (Date.now() - new Date(form.cust_license_issue_date).getTime()) / 86400000;
                    return diffDays < 365 ? (
                      <div style={{ marginTop: 6, padding: '7px 10px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 7, fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>
                        ⚠️ Driver's license was issued less than 1 year ago. This booking may require additional review.
                      </div>
                    ) : null;
                  })()}
                </Field>
                </div>

                {/* Row 4: Phone | Nationality */}
                <div ref={refPhone}>
                <Field label={tc('fields.phone')} required>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <DialCodePicker
                      value={form.cust_phone_dial}
                      onChange={dial => set('cust_phone_dial', dial)}
                    />
                    <input value={form.cust_phone}
                      onChange={e => { set('cust_phone', e.target.value); if (fieldErrors.cust_phone) setFieldErrors(fe => ({ ...fe, cust_phone: undefined })); }}
                      placeholder={t('form.phonePlaceholder')} type="tel"
                      style={{ ...INPUT_STYLE, flex: 1, borderColor: fieldErrors.cust_phone ? '#ef4444' : '#e5e7eb' }}
                      onFocus={focusBlue}
                      onBlur={e => { if (!fieldErrors.cust_phone) blurGray(e); }} />
                  </div>
                  {fieldErrors.cust_phone && (
                    <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{fieldErrors.cust_phone}</div>
                  )}
                </Field>
                </div>

                <div ref={refNationality}>
                <Field label={tc('fields.nationality')} required>
                  <select value={form.cust_nationality}
                    onChange={e => { set('cust_nationality', e.target.value); if (fieldErrors.cust_nationality) setFieldErrors(fe => ({ ...fe, cust_nationality: undefined })); }}
                    style={{ ...INPUT_STYLE, cursor: 'pointer', borderColor: fieldErrors.cust_nationality ? '#ef4444' : '#e5e7eb' }} onFocus={focusBlue} onBlur={blurGray}>
                    <option value="">{t('form.selectCountry')}</option>
                    {COUNTRIES.map(c => (
                      <option key={c.code} value={c.name}>{c.flag} {countryName(c)}</option>
                    ))}
                  </select>
                  {fieldErrors.cust_nationality && (
                    <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{fieldErrors.cust_nationality}</div>
                  )}
                </Field>
                </div>

                <Field label={tc('fields.language')}>
                  <select value={form.cust_language}
                    onChange={e => set('cust_language', e.target.value as CustomerLanguage)}
                    style={{ ...INPUT_STYLE, cursor: 'pointer' }} onFocus={focusBlue} onBlur={blurGray}>
                    {CUSTOMER_LANGUAGES.map(l => (
                      <option key={l.value} value={l.value}>{t(l.labelKey)}</option>
                    ))}
                  </select>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                    {t('whatsappHint')}
                  </div>
                </Field>

                {/* Row 5: Birth Date | Address */}
                <Field label={t('form.birthDate')}>
                  <input type="date" value={form.cust_birth_date}
                    onChange={e => set('cust_birth_date', e.target.value)}
                    style={INPUT_STYLE} onFocus={focusBlue} onBlur={blurGray} />
                  {form.cust_birth_date && (() => {
                    const diffYears = (Date.now() - new Date(form.cust_birth_date).getTime()) / (365.25 * 86400000);
                    return diffYears < 22 ? (
                      <div style={{ marginTop: 6, padding: '7px 10px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 7, fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>
                        ⚠️ Customer is under 22 years old. Young driver surcharge may apply.
                      </div>
                    ) : null;
                  })()}
                </Field>

                <Field label={tc('fields.address')}>
                  <input value={form.cust_address}
                    onChange={e => set('cust_address', e.target.value)}
                    placeholder={t('form.addressPlaceholder')} style={INPUT_STYLE}
                    onFocus={focusBlue} onBlur={blurGray} />
                </Field>

                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                    Notes
                  </label>
                  <textarea
                    value={form.cust_notes}
                    onChange={e => set('cust_notes', e.target.value)}
                    placeholder={t('form.notesPlaceholder')}
                    rows={2}
                    style={{ ...INPUT_STYLE, height: 'auto', padding: '10px 12px', resize: 'vertical' }}
                    onFocus={focusBlue} onBlur={blurGray}
                  />
                </div>

                {/* ── Customer Documents ── */}
                <SectionHeading
                  title={t('form.customerDocuments')}
                  icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M9 13h6M9 17h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>}
                />

                <DocUploadField
                  label={t('form.idPhoto')}
                  existingUrl={existingDocUrls.id_photo_url}
                  file={docIdPhoto}
                  onChange={setDocIdPhoto}
                />

                <DocUploadField
                  label={t('form.idPhotoBack')}
                  existingUrl={existingDocUrls.id_photo_back_url}
                  file={docIdPhotoBack}
                  onChange={setDocIdPhotoBack}
                />

                <DocUploadField
                  label={t('form.drivingLicense')}
                  existingUrl={existingDocUrls.driving_license_photo_url}
                  file={docDrivingLicense}
                  onChange={setDocDrivingLicense}
                />

                <DocUploadField
                  label={t('form.licenseBack')}
                  existingUrl={existingDocUrls.driving_license_back_url}
                  file={docDrivingLicenseBack}
                  onChange={setDocDrivingLicenseBack}
                />

                <DocUploadField
                  label={t('form.entryStamp')}
                  existingUrl={existingDocUrls.entry_stamp_photo_url}
                  file={docEntryStamp}
                  onChange={setDocEntryStamp}
                />

                {/* ── Financial Information ── */}
                <>
                  <SectionHeading
                    title={t('form.financialInfo')}
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/><path d="M12 7v1m0 8v1M9.5 9.5A2.5 2.5 0 0112 8a2.5 2.5 0 012.5 2.5c0 1.5-1.5 2-2.5 2.5s-2.5 1-2.5 2.5A2.5 2.5 0 0012 18a2.5 2.5 0 002.5-2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>}
                  />

                  {/* Currency toggle */}
                  <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{tc('fields.currency')}</span>
                    <div style={{ display: 'flex', borderRadius: 8, border: '1.5px solid #e5e7eb', overflow: 'hidden' }}>
                      {(['TRY', 'USD'] as const).map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => handleFinCurrencyChange(c)}
                          style={{
                            padding: '5px 14px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
                            background: form.fin_currency === c ? '#4ba6ea' : '#fff',
                            color:      form.fin_currency === c ? '#fff'    : '#6b7280',
                            transition: 'background 120ms ease, color 120ms ease',
                          }}
                        >
                          {c === 'TRY' ? '₺ TRY' : '$ USD'}
                        </button>
                      ))}
                    </div>
                    {form.fin_currency === 'USD' && (
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>
                        {t('convertHint')}
                      </span>
                    )}
                  </div>

                  <Field label={`${t('form.rentalAmount')} (${form.fin_currency})`}>
                    <input
                      type="number" min="0" step="0.01" placeholder="0.00"
                      value={form.fin_rental_amount}
                      onChange={e => set('fin_rental_amount', e.target.value)}
                      style={INPUT_STYLE} onFocus={focusBlue} onBlur={blurGray}
                    />
                  </Field>

                  <Field label={`${t('form.deposit')} (${form.fin_currency})`}>
                    <input
                      type="number" min="0" step="0.01" placeholder="0.00"
                      value={form.fin_deposit}
                      onChange={e => set('fin_deposit', e.target.value)}
                      style={INPUT_STYLE} onFocus={focusBlue} onBlur={blurGray}
                    />
                  </Field>

                  <Field label={`${t('form.paidAmount')} (${form.fin_currency})`}>
                    <input
                      type="number" min="0" step="0.01" placeholder="0.00"
                      value={form.fin_paid_amount}
                      onChange={e => set('fin_paid_amount', e.target.value)}
                      style={INPUT_STYLE} onFocus={focusBlue} onBlur={blurGray}
                    />
                  </Field>
                </>
            </>
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
              {saving ? 'Saving…' : mode === 'add' ? t('form.submitAdd') : t('form.submitSave')}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(12px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        @keyframes spin    { to { transform: rotate(360deg); } }
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
      {label}{required && <span style={{ color: '#ef4444', marginInlineStart: 3 }}>*</span>}
    </label>
    {children}
  </div>
);

// ─── Delete confirm modal ─────────────────────────────────────────────────────

// ─── Replacement sheets ───────────────────────────────────────────────────────

/** The real statuses car_availability can return. Nothing else is ever rendered. */
type AvailabilityStatus = 'working' | 'parking' | 'maintenance' | 'replacement' | 'selling' | 'pending';

/** Keys into `bookings:availability`; the wording lives in the locale files. */
const AVAILABILITY_LABEL_KEY: Record<AvailabilityStatus, string> = {
  working:     'availability.working',
  parking:     'availability.parking',
  maintenance: 'availability.maintenance',
  replacement: 'availability.replacement',
  selling:     'availability.selling',
  pending:     'availability.pending',
};

/**
 * car_availability LEFT JOINs car_calendar on today, so a car carrying two overlapping
 * blocks can surface twice. Collapse to the most restrictive status rather than letting
 * row order decide.
 */
const STATUS_PRIORITY: AvailabilityStatus[] = ['selling', 'maintenance', 'replacement', 'working', 'pending', 'parking'];

const toAvailabilityStatus = (v: string | null | undefined): AvailabilityStatus | null => {
  const s = (v ?? '').toLowerCase();
  return (STATUS_PRIORITY as string[]).includes(s) ? (s as AvailabilityStatus) : null;
};

interface ReplacementCarOption {
  id: number;
  plate_number: string;
  model: string | null;
  status: AvailabilityStatus | null;
}

interface CarBookingOption {
  id: number;
  booking_number: string | null;
  /** customers.id is a uuid. */
  customer_id: string | null;
  customer_name: string;
  start_date: string;
  end_date: string;
}

/** A stored sheet, plus the identity fields the reprint list needs. */
type ReplacementSheetRecord = ReplacementSheet & { id: number; created_at: string };

/**
 * replacement_sheets has two FKs to cars, so both embeds are disambiguated by constraint
 * name — a bare `cars(...)` embed returns a 400.
 */
const SHEET_SELECT = `
  id, created_at, sheet_number, customer_id, original_booking_id,
  start_date, end_date, km_at_handover, fuel_at_handover, notes,
  customers(first_name, last_name),
  original_booking:bookings(booking_number),
  original_car:cars!replacement_sheets_original_car_id_fkey(plate_number, model_group(name)),
  replacement_car:cars!replacement_sheets_replacement_car_id_fkey(plate_number, model_group(name))
`;

interface SheetCarJoin { plate_number: string; model_group: { name: string } | { name: string }[] | null }

interface SheetRowRaw {
  id: number;
  created_at: string;
  sheet_number: string | null;
  customer_id: string | null;
  original_booking_id: number | null;
  start_date: string;
  end_date: string;
  km_at_handover: number | string | null;
  fuel_at_handover: string | null;
  notes: string | null;
  customers: CustomerJoin | CustomerJoin[] | null;
  original_booking: { booking_number: string | null } | { booking_number: string | null }[] | null;
  original_car: SheetCarJoin | SheetCarJoin[] | null;
  replacement_car: SheetCarJoin | SheetCarJoin[] | null;
}

const firstOf = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

const carModelName = (c: SheetCarJoin | null): string | null =>
  firstOf(c?.model_group)?.name ?? null;

/** The single mapper behind both create and reprint, so a sheet always prints identically. */
function mapSheetRow(row: SheetRowRaw): ReplacementSheetRecord {
  const cust        = firstOf(row.customers);
  const booking     = firstOf(row.original_booking);
  const originalCar = firstOf(row.original_car);
  const replCar     = firstOf(row.replacement_car);
  const km          = row.km_at_handover;

  return {
    id:                      row.id,
    created_at:              row.created_at,
    sheet_number:            row.sheet_number ?? '—',
    customer_id:             row.customer_id ?? '',
    customer_name:           cust ? `${cust.first_name} ${cust.last_name}`.trim() : '',
    original_booking_number: booking?.booking_number ?? null,
    original_plate:          originalCar?.plate_number ?? null,
    original_model:          carModelName(originalCar),
    replacement_plate:       replCar?.plate_number ?? '—',
    replacement_model:       carModelName(replCar),
    start_date:              row.start_date,
    end_date:                row.end_date,
    km_at_handover:          km == null ? null : Number(km),
    fuel_at_handover:        row.fuel_at_handover,
    notes:                   row.notes,
  };
}

const todayStr = (): string => toDateStr(new Date());

// ─── Searchable car picker (original car, by plate or model) ──────────────────

const CarSearchSelect: React.FC<{
  cars: ReplacementCarOption[];
  value: string;
  onChange: (carId: string) => void;
  loading: boolean;
}> = ({ cars, value, onChange, loading }) => {
  const { t } = useTranslation('bookings');
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const selected = cars.find(c => String(c.id) === value) ?? null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cars;
    return cars.filter(c =>
      c.plate_number.toLowerCase().includes(q) ||
      (c.model ?? '').toLowerCase().includes(q)
    );
  }, [cars, search]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(''); }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setSearch(''); }}
        style={{
          ...INPUT_STYLE, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 8, cursor: 'pointer', textAlign: 'start',
          color: selected ? '#0f1117' : '#9ca3af',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {loading
            ? 'Loading cars…'
            : selected
              ? `${selected.plate_number}${selected.model ? ` — ${selected.model}` : ''}`
              : 'Search plate or model…'}
        </span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
          <path d="M6 9l6 6 6-6" stroke="#9ca3af" strokeWidth="2.2" strokeLinecap="round"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 44, insetInlineStart: 0, insetInlineEnd: 0, zIndex: 300,
          background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 10,
          boxShadow: '0 8px 32px rgba(0,0,0,0.13)', overflow: 'hidden',
        }}>
          <div style={{ padding: '8px 8px 6px' }}>
            <input
              autoFocus type="text" value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('form.searchCar')}
              style={{
                width: '100%', height: 36, padding: '0 10px', fontSize: 13,
                border: '1.5px solid #e5e7eb', borderRadius: 7, outline: 'none',
                fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {filtered.map(c => (
              <button
                key={c.id} type="button"
                onClick={() => { onChange(String(c.id)); setOpen(false); setSearch(''); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                  padding: '11px 12px', minHeight: 44, border: 'none', background: 'none',
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
                  textAlign: 'start', color: '#374151',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f9fafb'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
              >
                <span style={{ fontWeight: 700, flexShrink: 0 }}>{c.plate_number}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#6b7280' }}>
                  {c.model ?? ''}
                </span>
                {c.status && (
                  <span style={{ color: '#9ca3af', fontSize: 11, flexShrink: 0 }}>
                    {t(AVAILABILITY_LABEL_KEY[c.status])}
                  </span>
                )}
              </button>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: '12px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                {t('noResults')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Replacement form modal ───────────────────────────────────────────────────

const WARN_STYLE: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 7, marginTop: 6,
  padding: '7px 10px', background: '#fffbeb', borderRadius: 7,
  border: '1px solid rgba(245,158,11,0.28)', fontSize: 12, color: '#b45309', lineHeight: 1.45,
};

const ReplacementFormModal: React.FC<{
  onClose: () => void;
  onSaved: (sheet: ReplacementSheetRecord) => void;
}> = ({ onClose, onSaved }) => {
  const { t } = useTranslation('bookings');
  const { t: tc } = useTranslation('common');
  const [cars, setCars]               = useState<ReplacementCarOption[]>([]);
  const [carsLoading, setCarsLoading] = useState(true);

  const [originalCarId, setOriginalCarId] = useState('');
  const [carBookings, setCarBookings]         = useState<CarBookingOption[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingId, setBookingId]             = useState('');

  const [replacementCarId, setReplacementCarId] = useState('');
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate,   setEndDate]   = useState('');
  const [km,        setKm]        = useState('');
  const [fuel,      setFuel]      = useState('');
  const [notes,     setNotes]     = useState('');

  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ── All cars (no is_active filter — a car being replaced may already be parked up) ──
  useEffect(() => {
    let active = true;
    (async () => {
      const [carsRes, availRes] = await Promise.all([
        supabase.from('cars').select('id, plate_number, model_group(name)').order('plate_number'),
        supabase.from('car_availability').select('id, status'),
      ]);
      if (!active) return;

      const statusById = new Map<number, AvailabilityStatus>();
      for (const row of (availRes.data ?? []) as Array<{ id: number; status: string | null }>) {
        const next = toAvailabilityStatus(row.status);
        if (!next) continue;
        const prev = statusById.get(row.id);
        if (!prev || STATUS_PRIORITY.indexOf(next) < STATUS_PRIORITY.indexOf(prev)) {
          statusById.set(row.id, next);
        }
      }

      setCars(((carsRes.data ?? []) as unknown as Array<{ id: number; plate_number: string; model_group: { name: string } | { name: string }[] | null }>)
        .map(c => ({
          id: c.id,
          plate_number: c.plate_number,
          model: firstOf(c.model_group)?.name ?? null,
          status: statusById.get(c.id) ?? null,
        })));
      setCarsLoading(false);
    })();
    return () => { active = false; };
  }, []);

  // ── Bookings for the chosen plate — every booking, newest first, no status filter ──
  useEffect(() => {
    setBookingId('');
    setCarBookings([]);
    if (!originalCarId) return;

    let active = true;
    setBookingsLoading(true);
    (async () => {
      const { data } = await supabase
        .from('bookings')
        .select('id, booking_number, customer_id, start_date, end_date, customers(first_name, last_name)')
        .eq('car_id', Number(originalCarId))
        .order('start_date', { ascending: false });
      if (!active) return;

      setCarBookings(((data ?? []) as unknown as Array<{
        id: number; booking_number: string | null; customer_id: string | null;
        start_date: string; end_date: string; customers: CustomerJoin | CustomerJoin[] | null;
      }>).map(b => {
        const c = firstOf(b.customers);
        return {
          id: b.id,
          booking_number: b.booking_number,
          customer_id: b.customer_id,
          customer_name: c ? `${c.first_name} ${c.last_name}`.trim() : t('replacement.unknownCustomer'),
          start_date: b.start_date,
          end_date: b.end_date,
        };
      }));
      setBookingsLoading(false);
    })();
    return () => { active = false; };
  }, [originalCarId]);

  const selectedBooking = carBookings.find(b => String(b.id) === bookingId) ?? null;

  // Return date defaults to the original booking's end date, and stays editable after.
  useEffect(() => {
    if (selectedBooking) setEndDate(selectedBooking.end_date);
  }, [selectedBooking]);

  const originalCar    = cars.find(c => String(c.id) === originalCarId) ?? null;
  const replacementCar = cars.find(c => String(c.id) === replacementCarId) ?? null;

  const noBookings   = !!originalCarId && !bookingsLoading && carBookings.length === 0;
  const sameCarWarn  = !!replacementCarId && replacementCarId === originalCarId;
  const nonParkWarn  = !!replacementCar && replacementCar.status !== null && replacementCar.status !== 'parking';

  // Parking cars first — they are the ones genuinely free to hand over.
  const { parkingCars, otherCars } = useMemo(() => ({
    parkingCars: cars.filter(c => c.status === 'parking'),
    otherCars:   cars.filter(c => c.status !== 'parking'),
  }), [cars]);

  const carLabel = (c: ReplacementCarOption) =>
    `${c.plate_number}${c.model ? ` — ${c.model}` : ''}${c.status ? ` · ${t(AVAILABILITY_LABEL_KEY[c.status])}` : ''}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!originalCarId)                  { setFormError(t('replacement.errors.originalCar')); return; }
    if (!selectedBooking)                { setFormError(t('replacement.errors.booking')); return; }
    if (!selectedBooking.customer_id)    { setFormError(t('replacement.errors.noCustomer')); return; }
    if (!replacementCarId)               { setFormError(t('replacement.errors.replacementCar')); return; }
    if (!startDate || !endDate)          { setFormError(t('replacement.errors.datesRequired')); return; }
    if (endDate < startDate)             { setFormError(t('replacement.errors.returnBeforeHandover')); return; }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();

    const blockNote = `Replacement for ${originalCar?.plate_number ?? '—'} · ${selectedBooking.customer_name}`;

    // 1 — block the replacement car's calendar. booking_id stays null: the column is UNIQUE
    // and a replacement block is not a booking.
    const { data: blockData, error: blockError } = await supabase
      .from('car_calendar')
      .insert({
        car_id:      Number(replacementCarId),
        start_date:  startDate,
        end_date:    endDate,
        block_type:  'replacement',
        booking_id:  null,
        created_by:  user?.id ?? null,
        notes:       blockNote,
      })
      .select('id')
      .single();

    if (blockError || !blockData) {
      setSaving(false);
      setFormError(blockError?.message ?? t('replacement.errors.blockCalendar'));
      return;
    }

    const blockId = (blockData as { id: number }).id;

    // 2 — the sheet itself. sheet_number is filled by the trigger.
    const { data: sheetData, error: sheetError } = await supabase
      .from('replacement_sheets')
      .insert({
        created_by:          user?.id ?? null,
        original_booking_id: selectedBooking.id,
        customer_id:         selectedBooking.customer_id, // uuid — never cast
        original_car_id:     Number(originalCarId),
        replacement_car_id:  Number(replacementCarId),
        start_date:          startDate,
        end_date:            endDate,
        km_at_handover:      km.trim()   !== '' ? Number(km)   : null,
        fuel_at_handover:    fuel.trim() !== '' ? fuel.trim()  : null,
        notes:               notes.trim() !== '' ? notes.trim() : null,
        calendar_block_id:   blockId,
      })
      .select(SHEET_SELECT)
      .single();

    if (sheetError || !sheetData) {
      // Roll the block back so a failed sheet never leaves an orphan on the calendar.
      await supabase.from('car_calendar').delete().eq('id', blockId);
      setSaving(false);
      setFormError(sheetError?.message ?? t('replacement.errors.saveSheet'));
      return;
    }

    setSaving(false);
    onSaved(mapSheetRow(sheetData as unknown as SheetRowRaw));
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
          background: '#fff', borderRadius: 18, width: '100%', maxWidth: 640,
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
              Replacement Car
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
              {t('replacement.subtitle')}
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

        <form onSubmit={handleSubmit} style={{ padding: '20px 24px' }}>
          <div className="rp-grid">

            {/* ── Original vehicle ── */}
            <SectionHeading
              title={t('replacement.originalVehicle')}
              icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 17H3a2 2 0 01-2-2v-4a2 2 0 012-2h1l2-4h10l2 4h1a2 2 0 012 2v4a2 2 0 01-2 2h-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><circle cx="7.5" cy="17.5" r="2.5" stroke="currentColor" strokeWidth="1.8"/><circle cx="16.5" cy="17.5" r="2.5" stroke="currentColor" strokeWidth="1.8"/></svg>}
            />

            <div style={{ gridColumn: '1 / -1' }}>
              <Field label={t('replacement.originalCar')} required>
                <CarSearchSelect
                  cars={cars}
                  value={originalCarId}
                  onChange={setOriginalCarId}
                  loading={carsLoading}
                />
              </Field>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <Field label={t('replacement.originalBooking')} required>
                <select
                  value={bookingId}
                  onChange={e => setBookingId(e.target.value)}
                  disabled={!originalCarId || bookingsLoading || carBookings.length === 0}
                  style={{
                    ...INPUT_STYLE, cursor: originalCarId && carBookings.length > 0 ? 'pointer' : 'not-allowed',
                    background: originalCarId && carBookings.length > 0 ? '#fff' : '#f9fafb',
                    color: bookingId ? '#0f1117' : '#9ca3af',
                  }}
                  onFocus={focusBlue} onBlur={blurGray}
                >
                  <option value="">
                    {!originalCarId    ? 'Select a plate first…'
                      : bookingsLoading ? 'Loading bookings…'
                      : carBookings.length === 0 ? t('replacement.noBookings')
                      : 'Select booking…'}
                  </option>
                  {carBookings.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.customer_name} · {b.booking_number ?? `#${b.id}`} · {b.start_date} → {b.end_date}
                    </option>
                  ))}
                </select>
              </Field>
              {noBookings && (
                <div style={WARN_STYLE}>
                  <span>
                    No bookings found for this car. A replacement sheet needs a customer, so pick a
                    different plate.
                  </span>
                </div>
              )}
            </div>

            {/* ── Replacement vehicle ── */}
            <SectionHeading
              title={t('replacement.replacementVehicle')}
              icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M17 2l4 4-4 4M21 6H9M7 22l-4-4 4-4M3 18h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            />

            <div style={{ gridColumn: '1 / -1' }}>
              <Field label={t('replacement.replacementCar')} required>
                <select
                  value={replacementCarId}
                  onChange={e => setReplacementCarId(e.target.value)}
                  style={{ ...INPUT_STYLE, cursor: 'pointer', color: replacementCarId ? '#0f1117' : '#9ca3af' }}
                  onFocus={focusBlue} onBlur={blurGray}
                >
                  <option value="">{carsLoading ? t('replacement.loadingCars') : t('replacement.selectCar')}</option>
                  {parkingCars.length > 0 && (
                    <optgroup label={t('replacement.freeToHandOver')}>
                      {parkingCars.map(c => <option key={c.id} value={c.id}>{carLabel(c)}</option>)}
                    </optgroup>
                  )}
                  {otherCars.length > 0 && (
                    <optgroup label={t('replacement.otherVehicles')}>
                      {otherCars.map(c => <option key={c.id} value={c.id}>{carLabel(c)}</option>)}
                    </optgroup>
                  )}
                </select>
              </Field>
              {sameCarWarn && (
                <div style={WARN_STYLE}>
                  <span>{t('replacement.sameCarWarn')}</span>
                </div>
              )}
              {nonParkWarn && !sameCarWarn && replacementCar?.status && (
                <div style={WARN_STYLE}>
                  <span>
                    <Trans
                      t={t}
                      i18nKey="replacement.notParking"
                      values={{ status: t(AVAILABILITY_LABEL_KEY[replacementCar.status]) }}
                      components={[<strong />]}
                    />
                  </span>
                </div>
              )}
            </div>

            <Field label={t('replacement.handoverDate')} required>
              <input
                required type="date" value={startDate}
                onChange={e => setStartDate(e.target.value)}
                style={INPUT_STYLE} onFocus={focusBlue} onBlur={blurGray}
              />
            </Field>

            <Field label={t('replacement.returnDate')} required>
              <input
                required type="date" value={endDate}
                onChange={e => setEndDate(e.target.value)}
                style={INPUT_STYLE} onFocus={focusBlue} onBlur={blurGray}
              />
            </Field>

            <Field label={t('replacement.kmAtHandover')}>
              <input
                type="number" min="0" step="1" placeholder={t('replacement.kmPlaceholder')}
                value={km} onChange={e => setKm(e.target.value)}
                style={INPUT_STYLE} onFocus={focusBlue} onBlur={blurGray}
              />
            </Field>

            <Field label={t('replacement.fuelAtHandover')}>
              <input
                type="text" placeholder={t('replacement.fuelPlaceholder')}
                value={fuel} onChange={e => setFuel(e.target.value)}
                style={INPUT_STYLE} onFocus={focusBlue} onBlur={blurGray}
              />
            </Field>

            <div style={{ gridColumn: '1 / -1' }}>
              <Field label={tc('fields.notes')}>
                <textarea
                  rows={2} placeholder={t('replacement.notesPlaceholder')}
                  value={notes} onChange={e => setNotes(e.target.value)}
                  style={{ ...INPUT_STYLE, height: 'auto', padding: '9px 12px', resize: 'vertical' }}
                  onFocus={focusBlue} onBlur={blurGray}
                />
              </Field>
            </div>
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
              style={{ padding: '11px 18px', minHeight: 44, borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', fontSize: 14, fontWeight: 500, color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#9ca3af'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; }}
            >
              Cancel
            </button>
            <button type="submit" disabled={saving || noBookings}
              style={{
                padding: '11px 22px', minHeight: 44, borderRadius: 9, border: 'none',
                background: saving || noBookings ? '#a8d4f5' : '#4ba6ea', color: '#fff',
                fontSize: 14, fontWeight: 600, cursor: saving || noBookings ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', transition: 'background 150ms ease',
              }}
              onMouseEnter={e => { if (!saving && !noBookings) (e.currentTarget as HTMLButtonElement).style.background = '#2e8fd4'; }}
              onMouseLeave={e => { if (!saving && !noBookings) (e.currentTarget as HTMLButtonElement).style.background = '#4ba6ea'; }}
            >
              {saving ? 'Saving…' : t('replacement.createPrint')}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(12px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        .rp-grid { display: grid; grid-template-columns: 1fr; gap: 14px 16px; }
        @media (min-width: 640px) { .rp-grid { grid-template-columns: 1fr 1fr; } }
      `}</style>
    </div>,
    document.body,
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

const BookingsPage: React.FC = () => {
  const { t } = useTranslation('bookings');
  const { t: tc } = useTranslation('common');
  const dateLocale = useDateLocale();
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
  const [replacementOpen, setReplacementOpen] = useState(false);
  const [sheets, setSheets]               = useState<ReplacementSheetRecord[]>([]);
  const [sheetsLoading, setSheetsLoading] = useState(true);
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
        pickup_location, dropoff_location, km_at_delivery, fuel_at_delivery,
        insurance_type, notes, additional_services,
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

  // ── Fetch replacement sheets (not month-scoped — this is a running log) ──────
  const fetchSheets = useCallback(async () => {
    setSheetsLoading(true);
    const { data, error: sheetsError } = await supabase
      .from('replacement_sheets')
      .select(SHEET_SELECT)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    setSheetsLoading(false);
    if (sheetsError) return;
    setSheets(((data ?? []) as unknown as SheetRowRaw[]).map(mapSheetRow));
  }, []);

  useEffect(() => { fetchSheets(); }, [fetchSheets]);

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
      showToast(t('toast.updateFailed'), 'error');
    }
  }, [showToast]);

  // ── Export CSV ──────────────────────────────────────────────────────────────
  const handleExport = () => {
    // English on purpose — a CSV is opened in a spreadsheet, and its columns
    // are what any saved filter or formula keys on.
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
    a.download = `bookings-${formatMonthLabel(selectedMonth, 'en-GB').replace(' ', '-').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Edit form initial data ──────────────────────────────────────────────────
  const editFormData = (b: Booking): BookingFormData => ({
    booking_number:      b.booking_number,
    status:              b.status,
    car_id:              String(b.car_id),
    start_date:          b.start_date,
    end_date:            b.end_date,
    pickup_location:     b.pickup_location  ?? '',
    dropoff_location:    b.dropoff_location ?? '',
    km_at_delivery:      b.km_at_delivery   != null ? String(b.km_at_delivery) : '',
    fuel_at_delivery:    b.fuel_at_delivery ?? '',
    insurance_type:      b.insurance_type   ?? '',
    additional_services: b.additional_services ?? '',
    // Customer fields unused in edit mode — provide empty defaults
    cust_id_type: 'passport', cust_id_number: '',
    cust_language: 'ar',
    cust_first_name: '', cust_last_name: '',
    cust_phone_dial: '+90', cust_phone: '',
    cust_nationality: '',
    cust_driving_license_number: '', cust_license_issue_date: '',
    cust_address: '', cust_birth_date: '', cust_notes: '',
    fin_currency: 'TRY', fin_rental_amount: '', fin_deposit: '', fin_paid_amount: '',
  });

  return (
    <div style={{ minHeight: '100%', background: 'linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)', padding: '44px 40px' }}>
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
                {t('eyebrow')}
              </span>
            </div>
            <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.8px', color: '#0f1117', lineHeight: 1.1, marginBottom: 6 }}>
              {t('title')}
            </h1>
            <p style={{ fontSize: 15, color: '#6b7280', lineHeight: 1.5 }}>{t('subtitle')}</p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={() => setReplacementOpen(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                height: 44, padding: '0 16px',
                background: '#fff', color: '#374151', border: '1.5px solid #e5e7eb',
                borderRadius: 10, fontSize: 14, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
                transition: 'border-color 150ms ease, color 150ms ease',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#4ba6ea';
                (e.currentTarget as HTMLButtonElement).style.color = '#4ba6ea';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb';
                (e.currentTarget as HTMLButtonElement).style.color = '#374151';
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M17 2l4 4-4 4M21 6H9M7 22l-4-4 4-4M3 18h12"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {t('replacementCarButton')}
            </button>

            <button
              onClick={() => setModal('add')}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                height: 44, padding: '0 18px',
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
              {t('addNewBooking')}
            </button>
          </div>
        </div>

        {/* ── Month navigation ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 28 }}>
          <MonthArrow direction="left"  onClick={() => setSelectedMonth(m => addMonths(m, -1))} />
          <span style={{ fontSize: 18, fontWeight: 700, color: '#0f1117', letterSpacing: '-0.4px', minWidth: 160, textAlign: 'center' }}>
            {formatMonthLabel(selectedMonth, dateLocale)}
          </span>
          <MonthArrow direction="right" onClick={() => setSelectedMonth(m => addMonths(m, 1))} />
        </div>

        {/* ── Stat cards ── */}
        <div className="bk-stats">
          <StatCard label={t('stats.total')}     value={stats.total}     bg="#4ba6ea" loading={statsLoading} />
          <StatCard label={t('stats.confirmed')} value={stats.confirmed} bg="#22c55e" loading={statsLoading} />
          <StatCard label={t('stats.pending')}   value={stats.pending}   bg="#f97316" loading={statsLoading} />
          <StatCard label={t('stats.completed')} value={stats.completed} bg="#6b7280" loading={statsLoading} />
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
              style={{ position: 'absolute', insetInlineStart: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('filters.search')}
              style={{
                width: '100%', height: 40, paddingInlineStart: 34, paddingInlineEnd: 12,
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
            <option value="">{t('filters.allStatuses')}</option>
            <option value="confirmed">{t('status.confirmed')}</option>
            <option value="pending">{t('status.pending')}</option>
            <option value="cancelled">{t('status.cancelled')}</option>
            <option value="completed">{t('status.completed')}</option>
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
            {t('export')}
          </button>
        </div>

        {/* ── Error ── */}
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid rgba(239,68,68,0.2)', borderInlineStart: '4px solid #ef4444', borderRadius: 12, padding: '14px 18px', marginBottom: 16 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.8"/><path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"/></svg>
            <span style={{ fontSize: 14, color: '#0f1117' }}>{t('loadError')}<span style={{ color: '#6b7280' }}>{error}</span></span>
          </div>
        )}

        {/* ── Table ── */}
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #ebebeb', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
              <thead>
                <tr>
                  <Th style={{ width: 48, paddingInlineStart: 16, paddingInlineEnd: 8 }}>
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
                      {t('table.bookingNumberShort')} {sortIcon('booking_number')}
                    </span>
                  </Th>
                  <Th style={{ minWidth: 120 }}>{tc('fields.status')}</Th>
                  <Th>{tc('fields.car')}</Th>
                  <Th>{tc('fields.plate')}</Th>
                  <Th style={{ minWidth: 150 }}>{tc('fields.customer')}</Th>
                  <Th onClick={() => handleSort('start_date')} style={{ cursor: 'pointer' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      {t('table.start')} {sortIcon('start_date')}
                    </span>
                  </Th>
                  <Th onClick={() => handleSort('end_date')} style={{ cursor: 'pointer' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      {t('table.end')} {sortIcon('end_date')}
                    </span>
                  </Th>
                  <Th style={{ textAlign: 'center' }}>{t('table.kabis')}</Th>
                  <Th style={{ textAlign: 'center' }}>{t('table.invoice')}</Th>
                  <Th style={{ textAlign: 'end', paddingInlineEnd: 16 }}>{t('table.actions')}</Th>
                </tr>
              </thead>
              <tbody>
                {loading && Array.from({ length: 7 }).map((_, i) => <SkeletonRow key={i} />)}

                {!loading && sorted.length === 0 && (
                  <tr>
                    <td colSpan={11} style={{ padding: '60px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
                      {search || statusFilter ? t('table.empty') : t('table.emptyMonth')}
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
                    onPrint={() => printBookingContract(booking)}
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

        {/* ── Replacement sheets ── */}
        <div style={{
          background: '#fff', borderRadius: 14, border: '1px solid #ebebeb',
          marginTop: 20, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '14px 16px', borderBottom: '1px solid #f3f4f6',
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8, background: 'rgba(75,166,234,0.10)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4ba6ea', flexShrink: 0,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M17 2l4 4-4 4M21 6H9M7 22l-4-4 4-4M3 18h12"
                  stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              {t('replacementSheet')}
            </span>
            {!sheetsLoading && sheets.length > 0 && (
              <span style={{ fontSize: 12, color: '#9ca3af', marginInlineStart: 'auto' }}>
                {sheets.length} sheet{sheets.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {sheetsLoading ? (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
              {t('loadingSheets')}
            </div>
          ) : sheets.length === 0 ? (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
              {t('noSheets')}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                <thead>
                  <tr>
                    {[t('replacement.sheetNo'), tc('fields.customer'),
                      t('replacement.originalToReplacement'), t('replacement.period'), ''].map((h, i) => (
                      <th key={h || i} style={{
                        textAlign: i === 4 ? 'end' : 'start',
                        padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#9ca3af',
                        textTransform: 'uppercase', letterSpacing: '0.5px',
                        borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheets.map(s => (
                    <tr key={s.id} className="bk-row">
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: '#0f1117', borderBottom: '1px solid #f9fafb', whiteSpace: 'nowrap' }}>
                        {s.sheet_number}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#374151', borderBottom: '1px solid #f9fafb' }}>
                        {s.customer_name || '—'}
                        {s.original_booking_number && (
                          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                            {s.original_booking_number}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#374151', borderBottom: '1px solid #f9fafb', whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 600 }}>{s.original_plate ?? '—'}</span>
                        <span style={{ color: '#4ba6ea', margin: '0 7px', fontWeight: 700 }}>→</span>
                        <span style={{ fontWeight: 600 }}>{s.replacement_plate}</span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#6b7280', borderBottom: '1px solid #f9fafb', whiteSpace: 'nowrap' }}>
                        {s.start_date} → {s.end_date}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'end', borderBottom: '1px solid #f9fafb' }}>
                        <button
                          onClick={() => printReplacementSheet(s)}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            minHeight: 44, padding: '0 14px', borderRadius: 9,
                            border: '1px solid #e5e7eb', background: '#fff',
                            fontSize: 13, fontWeight: 600, color: '#374151',
                            cursor: 'pointer', fontFamily: 'inherit',
                            transition: 'border-color 150ms ease, color 150ms ease',
                          }}
                          onMouseEnter={e => {
                            (e.currentTarget as HTMLButtonElement).style.borderColor = '#4ba6ea';
                            (e.currentTarget as HTMLButtonElement).style.color = '#4ba6ea';
                          }}
                          onMouseLeave={e => {
                            (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb';
                            (e.currentTarget as HTMLButtonElement).style.color = '#374151';
                          }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                            <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z"
                              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          {t('reprint')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {replacementOpen && (
        <ReplacementFormModal
          onClose={() => setReplacementOpen(false)}
          onSaved={sheet => {
            showToast(`Replacement sheet ${sheet.sheet_number} created`, 'success');
            setReplacementOpen(false);
            fetchSheets();
            printReplacementSheet(sheet);
          }}
        />
      )}
      {modal === 'add' && (
        <BookingFormModal
          mode="add"
          initial={EMPTY_FORM}
          onClose={() => setModal(null)}
          onSaved={() => {
            showToast(t('toast.added'), 'success');
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
          editCustomerId={modal.booking.customer_id}
          onClose={() => setModal(null)}
          onSaved={() => {
            showToast(t('toast.updated'), 'success');
            fetchStats(selectedMonth);
            fetchBookings(selectedMonth);
          }}
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
