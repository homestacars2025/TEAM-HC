import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';
import { Trans, useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useUrlSearch } from '../hooks/useUrlSearch';
import { sortCarsByModel } from '../lib/car-picker';
import { localisedCountryName } from '../lib/countries';
import type { Booking, BookingStatus } from '../types';
import { useCurrency } from '../lib/CurrencyContext';
import PaymentFields from '../components/payments/PaymentFields';
import PaymentReceipts from '../components/payments/PaymentReceipts';
import { usePaymentAccounts } from '../hooks/usePaymentAccounts';
import { emptyPayment, hasPayment, paymentErrorKey, paymentProblem, toLira, type PaymentDraft, type PaymentReceipt } from '../lib/payments';
import { getBookingExtensions } from '../lib/queries/extensions';
import { recordPayment } from '../lib/queries/payments';
import { isExtensionLine, isZeroRental, rentalProblem } from '../lib/rentalAmount';
import { printBookingContract } from '../lib/printContract';
import { printReplacementSheet } from '../lib/printReplacementSheet';
import type { ReplacementSheet } from '../lib/printReplacementSheet';
import { fetchCurrentUsdRate } from '../lib/exchangeRate';
import { addDay, rentalDays } from '../lib/bookingDates';
import { fuelRangeProblem } from '../lib/fuelRange';
import { formatExtras, hasExtras, parseExtras, type BookingExtras } from '../lib/bookingExtras';
import type { ExpenseCar } from '../lib/custodyExpense';
import {
  firstBusyDay, getBlocks, isCarBusyError, recentCarIds, rememberCar, type CalendarBlock,
} from '../lib/queries/availability';
import { appendLedgerNote, customerBalance } from '../lib/queries/ledger';
import Button from '../components/Button';
import FuelRangeInput, { useFuelRange } from '../components/FuelRangeInput';
import BookingSheet from '../components/booking/BookingSheet';
import CarPicker from '../components/booking/CarPicker';
import DateParts from '../components/booking/DateParts';
import DateRangePicker from '../components/booking/DateRangePicker';
import { Field, FieldError, FormCard, FormError, FormNote, Stepper, SummaryBar, ZeroAmountConfirm } from '../components/booking/FormParts';
import MoneyField, { CurrencySwitch, formatMoney, formatRate, type FormCurrency } from '../components/booking/MoneyField';
import { ExtraOption, preloadOptionArt, OptionSwitch, QuantityStepper, RadioOption, type OptionArtName } from '../components/booking/OptionCards';
import PlateChip from '../components/booking/PlateChip';
import { useCarAvailability } from '../components/booking/useCarAvailability';
import BanAlert from '../components/customers/BanAlert';
import BookingTabsBar from '../components/bookings/BookingTabsBar';
import ExtensionsList from '../components/bookings/ExtensionsList';
import ReplacementsList from '../components/bookings/ReplacementsList';
import { ComplianceTriangle } from '../components/cars/Compliance';
import StatusArt from '../components/cars/StatusArt';
import CustomerAvatar from '../components/CustomerAvatar';
import BannedBadge from '../components/customers/BannedBadge';
import HomeArt from '../components/HomeArt';
import Icon3D from '../components/Icon3D';
import MonthSwitcher from '../components/MonthSwitcher';
import { StatTile } from '../components/WalletParts';
import { useTileFilter } from '../hooks/useTileFilter';
import {
  bookingInFilter, bookingMatches, bookingTiles, extensionCsvRows, extensionMatches, extensionTiles, hasPeriod, isActiveNow, isOpenSheet, readTab, sheetCsvRows, sheetInMonth, sheetMatches, TAB_FILTERS, tripProgress, type BookingExtension, type BookingFilter, type BookingTab,
} from '../lib/bookingTabs';
import { downloadCsv } from '../lib/csv';
import { istanbulDate } from '../lib/istanbulTime';
import { readMonth, shiftMonth } from '../lib/pendingInvoices';
import { formatMoney as formatLira } from '../lib/suppliers';
import CustomerSearch, { initialsOf } from '../components/customers/CustomerSearch';
import { useIssueText } from '../components/cars/Compliance';
import ConfirmDialog from '../components/custody/ConfirmDialog';
import { useCarCompliance } from '../hooks/useCarCompliance';
import {
  banForExistingCustomer, classifyTyped, customerBanMatch, customersWithPhone, findCustomers,
  isRealIdNumber, parseCustomerError,
  type BanMatch, type CustomerMatch, type PhoneSharer,
} from '../lib/queries/customers';

// ─── Raw Supabase join shapes ─────────────────────────────────────────────────

interface CarJoin {
  plate_number: string;
  model_group: { name: string } | { name: string }[] | null;
}

interface CustomerJoin {
  first_name: string;
  last_name: string;
  is_banned?: boolean;
  ban_reason?: string | null;
}

/** The columns of `customers` the booking form reads. */
interface CustomerRecord {
  first_name: string;
  last_name: string;
  phone: string | null;
  nationality: string | null;
  id_type: string | null;
  id_number: string | null;
  driving_license_number: string | null;
  license_issue_date: string | null;
  address: string | null;
  birth_date: string | null;
  notes: string | null;
  id_photo_url: string | null;
  id_photo_back_url: string | null;
  driving_license_photo_url: string | null;
  driving_license_back_url: string | null;
  entry_stamp_photo_url: string | null;
  language: string | null;
  is_banned: boolean;
  ban_reason: string | null;
}

/** A booking form is on one of these while it has no customer yet, or has one. */
type CustomerStep = 'search' | 'existing' | 'new';

interface IdOwner {
  id: string;
  name: string;
  banned: boolean;
  reason: string | null;
}

/** What someone typed as a phone number, in the two parts the form keeps it in. */
function phoneParts(typed: string): { dial: string; local: string } {
  if (typed.startsWith('+')) return parseStoredPhone(typed.replace(/[^\d+]/g, ''));
  return { dial: '+90', local: typed.replace(/\D/g, '').replace(/^0+/, '') };
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

/** `null` until the rates have loaded, so nothing is ever converted at a guessed rate. */
function useUsdRate(): number | null {
  const { rates } = useCurrency();
  return rates.find(r => r.currency === 'USD')?.rate_to_try || null;
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
    customer_banned: custJoin?.is_banned === true,
    customer_ban_reason: custJoin?.ban_reason ?? null,
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
  <tr aria-hidden="true">
    {[20, 110, 150, 130, 150, 64, 64, 90].map((width, index) => (
      // eslint-disable-next-line react/no-array-index-key
      <td key={index}><div className="hc-bk-bone" style={{ width }} /></td>
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
  today: string;
  onSelect: () => void;
  onToggle: (id: number, field: 'kabis_reported' | 'invoice_issued', current: boolean) => void;
  onEdit: () => void;
  onPrint: () => void;
  /** Absent when the signed-in user may not extend — the button is not rendered. */
  onExtend?: () => void;
}

/** Pressing it flips the flag, as the old switch did. */
const FlagChip: React.FC<{ on: boolean; label: string; onPress: () => void }> = ({ on, label, onPress }) => (
  <button type="button" aria-pressed={on} title={label} className={`hc-bk-flag ${on ? 'is-on' : ''}`} onClick={onPress}>
    <span aria-hidden="true">{on ? '✓' : '✗'}</span>{label}
  </button>
);

const BookingTableRow: React.FC<RowProps> = ({
  booking, isSelected, today, onSelect, onToggle, onEdit, onPrint, onExtend,
}) => {
  const { t } = useTranslation('bookings');
  const dateLocale = useDateLocale();
  const start = booking.start_date.slice(0, 10);
  const end = booking.end_date.slice(0, 10);
  const active = isActiveNow(booking, today);
  return (
  <tr className={isSelected ? 'is-selected' : undefined}>
    <td className="hc-bk-c-select">
      <label><input type="checkbox" className="hc-appr-check" aria-label={t('table.select', { number: booking.booking_number })} checked={isSelected} onChange={onSelect} /></label>
    </td>
    <td className="hc-bk-c-ref">
      <strong className="hc-num">{booking.booking_number}</strong>
      <StatusBadge status={booking.status} />
    </td>
    <td className="hc-bk-c-car">
      <StatusArt name={active ? 'working' : 'total'} className="hc-bk-car-art" />
      <PlateChip plate={booking.plate_number} />
      <span><bdi dir="auto">{booking.car_model}</bdi></span>
    </td>
    <td className="hc-bk-c-who">
      <CustomerAvatar size={28} />
      <span>
        <bdi dir="auto">{booking.customer_name}</bdi>
        {booking.customer_banned && <BannedBadge reason={booking.customer_ban_reason} showReason />}
      </span>
    </td>
    <td className="hc-bk-c-period">
      <span>{t('range.span', { start: formatDateDisplay(booking.start_date, dateLocale), end: formatDateDisplay(booking.end_date, dateLocale) })}</span>
      <small>{t('range.days', { count: rentalDays(start, end) })}</small>
      {active && <span role="img" aria-label={t('table.progress')} className="hc-bk-progress"><i style={{ width: `${Math.round(tripProgress(booking, today) * 100)}%` }} /></span>}
    </td>
    <td className="hc-bk-c-flag"><FlagChip on={booking.kabis_reported} label={t('table.kabis')} onPress={() => onToggle(booking.id, 'kabis_reported', booking.kabis_reported)} /></td>
    <td className="hc-bk-c-flag"><FlagChip on={booking.invoice_issued} label={t('table.invoice')} onPress={() => onToggle(booking.id, 'invoice_issued', booking.invoice_issued)} /></td>
    <td className="hc-bk-c-actions">
      {/* A cancelled booking has nothing left to extend. */}
      {onExtend && booking.status !== 'cancelled' && (
        <ActionBtn onClick={onExtend} title={t('extend.action')} hoverColor="#16a34a">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <path d="M12 13v5M9.5 15.5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </ActionBtn>
      )}
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

export function parseStoredPhone(stored: string): { dial: string; local: string } {
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

export const DialCodePicker: React.FC<{
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
    <div
      ref={ref}
      style={{ position: 'relative', flexShrink: 0 }}
      onKeyDown={e => {
        if (open && e.key === 'Escape') { e.preventDefault(); setOpen(false); setSearch(''); }
        if (open && e.key === 'Enter' && e.target instanceof HTMLInputElement) e.preventDefault();
      }}
    >
      <button type="button" className="hc-input hc-dial" onClick={() => { setOpen(o => !o); setSearch(''); }}>
        <span style={{ fontSize: 17, lineHeight: 1 }}>{selected.flag}</span>
        <span style={{ fontWeight: 500 }}>{selected.dial}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
          <path d="M6 9l6 6 6-6" stroke="#9ca3af" strokeWidth="2.2" strokeLinecap="round"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', insetInlineStart: 0, zIndex: 300,
          background: '#fff', border: '1.5px solid #e5e7eb',
          borderRadius: 10, width: 'min(272px, calc(100vw - 64px))',
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
  fin_currency: 'TRY', fin_rental_amount: '',
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

/** What a stored value is called on screen. The stored values themselves never change. */
const LOCATION_KEY: Record<string, string> = {
  'Şişli Branch': 'presets.location.sisli',
  'Kayaşehir Branch': 'presets.location.kayasehir',
  'Istanbul Airport (IST)': 'presets.location.ist',
  'Sabiha Gökçen Airport (SAW)': 'presets.location.saw',
};

const INSURANCE_KEY: Record<string, string> = {
  'Korumasız': 'none',
  'Kısmi Koruma': 'partial',
  'Orta Koruma': 'medium',
  'Tam Koruma': 'full',
};

const INSURANCE_ART: Record<string, OptionArtName> = {
  'Korumasız': 'shield-none',
  'Kısmi Koruma': 'shield-partial',
  'Orta Koruma': 'shield-medium',
  'Tam Koruma': 'shield-full',
};

const STEP_KEYS = ['customer', 'trip', 'insurance', 'delivery', 'review'] as const;

/** Compared to spot edits. Phone and money need more care, so they're handled apart. */
const BOOKING_FIELDS = ['car_id', 'start_date', 'end_date', 'pickup_location', 'dropoff_location', 'km_at_delivery', 'fuel_at_delivery', 'insurance_type', 'status'] as const;
const CUSTOMER_FIELDS = [
  'cust_id_type', 'cust_language', 'cust_id_number', 'cust_first_name', 'cust_last_name', 'cust_nationality',
  'cust_driving_license_number', 'cust_license_issue_date', 'cust_address', 'cust_birth_date', 'cust_notes',
] as const;
const MONEY_FIELDS = ['fin_rental_amount'] as const;

const icon = (children: React.ReactNode) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);

const ICONS = {
  customer: icon(<><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></>),
  document: icon(<><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h4" /></>),
  calendar: icon(<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>),
  car: icon(<><path d="M5 17H3a2 2 0 01-2-2v-4a2 2 0 012-2h1l2-4h10l2 4h1a2 2 0 012 2v4a2 2 0 01-2 2h-2" /><circle cx="7.5" cy="17.5" r="2.5" /><circle cx="16.5" cy="17.5" r="2.5" /></>),
  shield: icon(<path d="M12 2L3 7v5c0 5 3.8 9.7 9 11 5.2-1.3 9-6 9-11V7L12 2z" />),
  gauge: icon(<><path d="M4 18a9 9 0 1116 0" /><path d="M12 14l4-4" /></>),
  money: icon(<><circle cx="12" cy="12" r="9" /><path d="M15 9.5A2.5 2.5 0 0012.5 8h-1a2 2 0 000 4h1a2 2 0 010 4h-1A2.5 2.5 0 019 14.5M12 6v2M12 16v2" /></>),
  check: icon(<><circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></>),
  plus: icon(<><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>),
  swap: icon(<path d="M17 2l4 4-4 4M21 6H9M7 22l-4-4 4-4M3 18h12" />),
  note: icon(<><path d="M4 4h16v12H8l-4 4V4z" /><path d="M8 9h8M8 12h5" /></>),
};

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
            <img src={existingUrl} alt={label} style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 36, height: 36, borderRadius: 6, background: '#e0edfa', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="#4ba6ea" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 2v6h6" stroke="#4ba6ea" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
          )}
          <a href={existingUrl} target="_blank" rel="noopener noreferrer" style={{ flex: 1, fontSize: 12, color: '#3A74C2', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
            <img src={preview} alt={label} style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, flexShrink: 0, border: '1px solid rgba(75,166,234,0.2)' }} />
          ) : (
            <div style={{ width: 44, height: 44, borderRadius: 6, background: 'rgba(75,166,234,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="#4ba6ea" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 2v6h6" stroke="#4ba6ea" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#0f1117', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
            <div style={{ fontSize: 11, color: '#3A74C2', marginTop: 1 }}>{tc2('sheet.fileReady', { size: (file.size / 1024).toFixed(0) })}</div>
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
          onMouseEnter={e => { const b = e.currentTarget; b.style.borderColor = '#4ba6ea'; b.style.color = '#3A74C2'; b.style.background = 'rgba(75,166,234,0.04)'; }}
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

interface FormModalProps {
  mode: 'add' | 'edit';
  initial: BookingFormData;
  editId?: number;
  editCustomerId?: number;
  onClose: () => void;
  onSaved: () => void;
  /** After the booking is saved: the envelopes to number, and whether a payment failed. */
  onPaid: (receipts: PaymentReceipt[], failure: string | null) => void;
  onRentalFailed: () => void;
  /** Opens scrolled to the money, for someone who came here from an amount. */
  openAtFinance?: boolean;
}

const BookingFormModal: React.FC<FormModalProps> = ({
  mode, initial, editId, editCustomerId, onClose, onSaved, onPaid, onRentalFailed, openAtFinance = false,
}) => {
  const { t } = useTranslation('bookings');
  const { t: tc } = useTranslation('common');
  const { t: tf } = useTranslation('finance');
  const paymentAccounts = usePaymentAccounts();
  const [deposit, setDeposit] = useState<PaymentDraft>(emptyPayment);
  const [payment, setPayment] = useState<PaymentDraft>(emptyPayment);
  const financeCard = useRef<HTMLDivElement>(null);
  const scrolledToFinance = useRef(false);
  const rentalInputId = useId();
  const [rentalTried, setRentalTried] = useState(false);
  const [zeroConfirmed, setZeroConfirmed] = useState(false);
  // What is already on file, in lira. Changing it would orphan its envelope, so it is shown, not edited.
  const [paidBefore, setPaidBefore] = useState({ deposit: 0, payment: 0 });
  const fuelRange = useFuelRange();
  const dateLocale = useDateLocale();
  const countryName = useCountryName();
  const [form, setForm] = useState<BookingFormData>(initial);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [cars, setCars] = useState<ExpenseCar[] | null>(null);
  const [carsFailed, setCarsFailed] = useState(false);
  const [carsAttempt, setCarsAttempt] = useState(0);
  const [bookingNumLoading, setBookingNumLoading] = useState(mode === 'add');
  const { rates } = useCurrency();
  const usdRate = useUsdRate();
  const carLabelId = useId();
  const closeRef = useRef<(() => void) | null>(null);
  const submitting = useRef(false);
  const currencySwitch = useRef<{ original: Record<typeof MONEY_FIELDS[number], string>; converted: Record<typeof MONEY_FIELDS[number], string> } | null>(null);

  // The guided steps of a new booking
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [checkingStep, setCheckingStep] = useState(false);

  // What an edit is compared against, taken once the customer and the money have arrived
  const [customerLoaded, setCustomerLoaded] = useState(mode === 'add' || !editCustomerId);
  const [ledgerLoaded, setLedgerLoaded] = useState(mode === 'add' || !editId);
  const [baseline, setBaseline] = useState<{ form: BookingFormData; extras: string | null } | null>(null);

  // Location dropdown "Other" mode — true when value doesn't match a preset
  const [pickupOther,  setPickupOther]  = useState(() => !!initial.pickup_location  && !isLocationPreset(initial.pickup_location));
  const [dropoffOther, setDropoffOther] = useState(() => !!initial.dropoff_location && !isLocationPreset(initial.dropoff_location));

  // Insurance "Other" mode
  const [insuranceOther, setInsuranceOther] = useState(() =>
    !!initial.insurance_type && !isInsurancePreset(initial.insurance_type)
  );

  // Additional services, read from whichever format the booking holds them in
  const [extras, setExtras] = useState<BookingExtras>(() => parseExtras(initial.additional_services));
  const setExtra = (change: Partial<BookingExtras>) => setExtras(current => ({ ...current, ...change }));

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

  // Who this booking is for. A booking only ever points at one customer record, so an
  // existing customer is reused: inserting them again is how the duplicates came about.
  const [customerStep, setCustomerStep] = useState<CustomerStep>(mode === 'add' || !editCustomerId ? 'search' : 'existing');
  const [existingCustomerId, setExistingCustomerId] = useState<string | null>(null);
  const [customerRequired, setCustomerRequired] = useState(false);
  const [idOwner, setIdOwner] = useState<IdOwner | null>(null);
  const [phoneSharers, setPhoneSharers] = useState<PhoneSharer[]>([]);
  const [banAlert, setBanAlert] = useState<BanMatch | null>(null);
  const [editingBanned, setEditingBanned] = useState<{ full_name: string; ban_reason: string | null } | null>(null);
  /** As stored. The database rejects a repeated ID even if it didn't change, so it is only sent when it did. */
  const originalIdNumber = useRef('');

  // Field-level validation errors
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<
    'cust_id_number' | 'cust_id_type' | 'cust_first_name' | 'cust_last_name' | 'cust_nationality' | 'cust_phone' | 'cust_license_issue_date' | 'car_id' | 'dates' | 'fuel',
    string
  >>>({});

  // Refs for scroll-to-error
  const refIdNumber         = useRef<HTMLDivElement>(null);
  const refIdType           = useRef<HTMLDivElement>(null);
  const refName             = useRef<HTMLDivElement>(null);
  const refTrip             = useRef<HTMLDivElement>(null);
  const refDelivery         = useRef<HTMLDivElement>(null);
  const refNationality      = useRef<HTMLDivElement>(null);
  const refPhone            = useRef<HTMLDivElement>(null);
  const refLicenseIssueDate = useRef<HTMLDivElement>(null);
  const refCustomerSearch   = useRef<HTMLDivElement>(null);

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
    let active = true;
    setCarsFailed(false);
    const query = supabase.from('cars').select('id, plate_number, model_group(name)');
    // A booking keeps its car even if that car has since left the fleet.
    (initial.car_id ? query.or(`is_active.eq.true,id.eq.${initial.car_id}`) : query.eq('is_active', true))
      .then(({ data, error }) => {
        if (!active) return;
        if (error) { setCarsFailed(true); return; }
        setCars(sortCarsByModel(((data ?? []) as Array<{
          id: number;
          plate_number: string;
          model_group: { name: string } | { name: string }[] | null;
        }>).map(c => {
          const mg = c.model_group;
          const model = Array.isArray(mg) ? (mg[0]?.name ?? '') : (mg as { name: string } | null)?.name ?? '';
          return { id: c.id, plate_number: c.plate_number, model: model || null };
        })));
      });
    return () => { active = false; };
  }, [initial.car_id, carsAttempt]);

  useEffect(preloadOptionArt, []);

  // Auto-generate booking number (add mode only)
  useEffect(() => {
    if (mode !== 'add') return;
    let active = true;
    (async () => {
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
    })();
    return () => { active = false; };
  }, [mode]);

  const applyCustomer = useCallback((c: CustomerRecord) => {
    originalIdNumber.current = c.id_number ?? '';
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
  }, []);

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
        if (!active) return;
        if (error || !data) { setFormError(t('customerStep.errors.loadFailed')); return; }
        const customer = data as CustomerRecord;
        applyCustomer(customer);
        setCustomerLoaded(true);
        if (customer.is_banned) {
          setEditingBanned({ full_name: `${customer.first_name} ${customer.last_name}`.trim(), ban_reason: customer.ban_reason });
        }
      });
    return () => { active = false; };
  }, [mode, editCustomerId, applyCustomer, t]);

  // Fetch existing ledger rows in edit mode
  const [existingLedgerIds, setExistingLedgerIds] = useState<{ rental?: number }>({});

  useEffect(() => {
    if (mode !== 'edit' || !editId) return;
    let active = true;
    supabase
      .from('customer_accounting_ledger')
      .select('id, type, amount, direction, description')
      .eq('booking_id', editId)
      .in('type', ['rental', 'deposit', 'payment'])
      .then(({ data }) => {
        if (!active) return;
        setLedgerLoaded(true);
        if (!data) return;
        const ids: typeof existingLedgerIds = {};
        const paid = { deposit: 0, payment: 0 };
        let rental = '';
        for (const row of data as { id: number; type: string; amount: number; direction: string; description: string | null }[]) {
          if (row.type === 'rental') {
            if (isExtensionLine(row.description)) continue;
            ids.rental = row.id;
            rental = String(row.amount);
          } else if (row.type === 'deposit' || row.type === 'payment') {
            paid[row.type] += row.direction === 'IN' ? Number(row.amount) : -Number(row.amount);
          }
        }
        setExistingLedgerIds(ids);
        setPaidBefore(paid);
        setForm(f => ({ ...f, fin_currency: 'TRY', fin_rental_amount: rental }));
      });
    return () => { active = false; };
  }, [mode, editId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!openAtFinance || !ledgerLoaded || scrolledToFinance.current || !financeCard.current) return;
    scrolledToFinance.current = true;
    financeCard.current.scrollIntoView({ block: 'start' });
  });

  // Convert field amounts when currency toggle is switched. Rounding means there and back
  // doesn't land on the same number, so going back restores what was there if untouched.
  const handleFinCurrencyChange = (newCurrency: 'TRY' | 'USD') => {
    const oldCurrency = form.fin_currency;
    if (oldCurrency === newCurrency) return;
    const previous = currencySwitch.current;
    const amounts = { fin_rental_amount: form.fin_rental_amount };
    if (previous && MONEY_FIELDS.every(key => amounts[key] === previous.converted[key])) {
      currencySwitch.current = null;
      setForm(f => ({ ...f, fin_currency: newCurrency, ...previous.original }));
      return;
    }
    const usdRate = rates.find(r => r.currency === 'USD')?.rate_to_try ?? 1;
    const convert = (val: string) => {
      const num = parseFloat(val);
      if (!num || isNaN(num)) return val;
      const result = oldCurrency === 'TRY' ? num / usdRate : num * usdRate;
      return result.toFixed(2);
    };
    const converted = {
      fin_rental_amount: convert(amounts.fin_rental_amount),
    };
    currencySwitch.current = { original: amounts, converted };
    setForm(f => ({ ...f, fin_currency: newCurrency, ...converted }));
  };

  const chooseCustomer = useCallback(async (customerId: string) => {
    const { data, error } = await supabase.from('customers').select('*').eq('id', customerId).single();
    if (error || !data) { setFormError(t('customerStep.errors.loadFailed')); return; }
    const customer = data as CustomerRecord;
    applyCustomer(customer);
    setEditingBanned(customerId === String(editCustomerId) && customer.is_banned
      ? { full_name: `${customer.first_name} ${customer.last_name}`.trim(), ban_reason: customer.ban_reason }
      : null);
    setExistingCustomerId(customerId);
    setCustomerStep('existing');
    setCustomerRequired(false);
    setIdOwner(null);
    setPhoneSharers([]);
    setBanAlert(null);
    setFormError(null);
  }, [applyCustomer, editCustomerId, t]);

  /** Back to who the booking was already for, after starting to change them. */
  const keepOriginalCustomer = async () => {
    await chooseCustomer(String(editCustomerId));
    setExistingCustomerId(null);
  };

  const startNewCustomer = (typedText: string) => {
    const typed = classifyTyped(typedText);
    const phone = typed.phone ? phoneParts(typed.phone) : null;
    setForm(f => ({
      ...f,
      cust_id_number:  typed.idNumber ?? '',
      cust_first_name: typed.firstName ?? '',
      cust_last_name:  typed.lastName ?? '',
      cust_phone_dial: phone?.dial ?? f.cust_phone_dial,
      cust_phone:      phone?.local ?? '',
    }));
    setCustomerStep('new');
    setCustomerRequired(false);
  };

  /** Back to an empty search, leaving the car and dates alone. */
  const clearCustomer = () => {
    setForm(f => ({
      ...f,
      cust_id_type: initial.cust_id_type, cust_id_number: '', cust_language: initial.cust_language,
      cust_first_name: '', cust_last_name: '', cust_phone_dial: initial.cust_phone_dial, cust_phone: '',
      cust_nationality: '', cust_driving_license_number: '', cust_license_issue_date: '',
      cust_address: '', cust_birth_date: '', cust_notes: '',
    }));
    setExistingCustomerId(null);
    setEditingBanned(null);
    setExistingDocUrls({ id_photo_url: null, id_photo_back_url: null, driving_license_photo_url: null, driving_license_back_url: null, entry_stamp_photo_url: null });
    originalIdNumber.current = '';
    setIdOwner(null);
    setPhoneSharers([]);
    setBanAlert(null);
    setFormError(null);
    setFieldErrors({});
    setCustomerStep('search');
  };

  /** The customer this form is saving, or nobody yet. */
  const thisCustomerId = existingCustomerId ?? (customerStep !== 'new' && editCustomerId != null ? String(editCustomerId) : null);

  /** An edit that moves the booking to someone else, whether they're on file or new. */
  const customerSwapped = mode === 'edit'
    && (customerStep === 'new' || (!!existingCustomerId && existingCustomerId !== String(editCustomerId)));

  const checkIdOwner = async () => {
    const idNumber = form.cust_id_number.trim();
    if (idNumber === originalIdNumber.current.trim() || !isRealIdNumber(idNumber)) { setIdOwner(null); return; }
    try {
      // A few same-ID groups remain, so this can be several people. A banned one comes first.
      const owners = (await findCustomers(idNumber)).filter(m => m.match_type === 'id_number' && m.id !== thisCustomerId);
      const owner = owners.find(m => m.is_banned) ?? owners[0];
      setIdOwner(owner ? { id: owner.id, name: owner.full_name, banned: owner.is_banned, reason: owner.ban_reason } : null);
    } catch {
      // Only a courtesy: saving still reaches the check in the database.
      setIdOwner(null);
    }
  };

  const checkPhoneSharers = async () => {
    if (!form.cust_phone.trim()) { setPhoneSharers([]); return; }
    try {
      setPhoneSharers(await customersWithPhone(`${form.cust_phone_dial}${form.cust_phone}`, thisCustomerId));
    } catch {
      setPhoneSharers([]);
    }
  };

  /** After a change of step the field isn't on screen yet, hence the frame. */
  const reveal = (ref: React.RefObject<HTMLDivElement | null>) => {
    window.requestAnimationFrame(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  /** The database's refusals, in words. */
  const showSaveError = (message: string) => {
    const refusal = parseCustomerError(message);
    if (refusal?.kind === 'banned') {
      setBanAlert({ customer_id: '', full_name: refusal.name, ban_reason: refusal.reason || null, matched_on: 'customer' });
    } else if (refusal?.kind === 'duplicate') {
      if (refusal.customerId) setIdOwner({ id: refusal.customerId, name: refusal.name, banned: false, reason: null });
      setFormError(t('customerStep.errors.duplicate', { name: refusal.name }));
      if (mode === 'add') setStep(0);
      reveal(refIdNumber);
    } else if (isCarBusyError(message)) {
      setFormError(t('errors.carBusy'));
      if (mode === 'add') setStep(1);
      reveal(refTrip);
    } else {
      console.error('[Booking] save error:', message);
      setFormError(t('errors.saveFailed'));
    }
  };

  const set = <K extends keyof BookingFormData>(key: K, value: BookingFormData[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  const buildAdditionalServices = (): string | null => formatExtras(extras, initial.additional_services);

  const selectedCarId = form.car_id ? Number(form.car_id) : null;
  const selectedCar = cars?.find(car => car.id === selectedCarId) ?? null;
  const days = rentalDays(form.start_date, form.end_date);
  const recentCars = useMemo(() => (cars ? recentCarIds().flatMap(id => cars.filter(car => car.id === id)) : []), [cars]);
  const { busy, failed: availabilityFailed } = useCarAvailability(form.start_date, form.end_date, { bookingId: editId });
  const carWarning = useCarWarning(id => { set('car_id', id == null ? '' : String(id)); setFieldErrors(fe => ({ ...fe, car_id: undefined })); });

  useEffect(() => {
    if (mode === 'edit' && !baseline && customerLoaded && ledgerLoaded) setBaseline({ form, extras: buildAdditionalServices() });
  }, [mode, baseline, customerLoaded, ledgerLoaded, form]); // eslint-disable-line react-hooks/exhaustive-deps

  const changedFields = useMemo(() => {
    const changed = new Set<string>();
    if (!baseline) return changed;
    const before = baseline.form;
    for (const key of BOOKING_FIELDS) if (form[key] !== before[key]) changed.add(key);
    if ((buildAdditionalServices() ?? '') !== (baseline.extras ?? '')) changed.add('additional_services');
    // Stored in lira, so switching the form to dollars alone is not an edit.
    const rate = usdRate ?? 1;
    for (const key of MONEY_FIELDS) {
      const now = parseFloat(form[key]) || 0;
      const was = parseFloat(before[key]) || 0;
      // Empty and 0 are different answers, even if they are the same number.
      if (!form[key].trim() !== !before[key].trim()) changed.add(key);
      else if (form.fin_currency === 'USD' ? Math.abs(now * rate - was) >= rate * 0.01 : now !== was) changed.add(key);
    }
    // A different customer is one change, however many of their details differ.
    if (customerSwapped) changed.add('customer');
    else {
      for (const key of CUSTOMER_FIELDS) if (form[key] !== before[key]) changed.add(key);
      if (form.cust_phone !== before.cust_phone || form.cust_phone_dial !== before.cust_phone_dial) changed.add('cust_phone');
    }
    ([docIdPhoto, docIdPhotoBack, docDrivingLicense, docDrivingLicenseBack, docEntryStamp] as const)
      .forEach((file, index) => { if (file) changed.add(`document_${index}`); });
    // New money is a change of its own: it may be the only reason to save.
    if (hasPayment(deposit)) changed.add('deposit');
    if (hasPayment(payment)) changed.add('payment');
    return changed;
  }, [form, baseline, customerSwapped, usdRate, extras, deposit, payment, docIdPhoto, docIdPhotoBack, docDrivingLicense, docDrivingLicenseBack, docEntryStamp]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = mode === 'edit'
    ? changedFields.size > 0
    : customerStep !== 'search' || hasExtras(extras) || !!deposit.amount || !!payment.amount
      || (Object.keys(initial) as (keyof BookingFormData)[]).some(key => key !== 'booking_number' && form[key] !== initial[key]);

  /** Everything the first step asks for. */
  const validateCustomer = (): boolean => {
    if (customerStep === 'search') {
      setCustomerRequired(true);
      reveal(refCustomerSearch);
      return false;
    }
    if (idOwner) {
      setFormError(t('customerStep.errors.duplicate', { name: idOwner.name }));
      reveal(refIdNumber);
      return false;
    }

    const errors: typeof fieldErrors = {};
    if (!form.cust_id_number.trim())        errors.cust_id_number        = t('errors.idRequired');
    if (!form.cust_id_type)                 errors.cust_id_type          = t('errors.idTypeRequired');
    if (!form.cust_first_name.trim())       errors.cust_first_name       = t('errors.firstNameRequired');
    if (!form.cust_last_name.trim())        errors.cust_last_name        = t('errors.lastNameRequired');
    if (!form.cust_license_issue_date)      errors.cust_license_issue_date = t('errors.licenseDateRequired');
    if (!form.cust_phone.trim()) {
      errors.cust_phone = t('errors.phoneRequired');
    } else {
      const fullPhone = `${form.cust_phone_dial}${form.cust_phone}`;
      if (!isValidPhoneNumber(fullPhone)) errors.cust_phone = t('errors.phoneInvalid');
    }
    if (!form.cust_nationality)             errors.cust_nationality      = t('errors.nationalityRequired');

    setFieldErrors(fe => ({ ...fe, ...errors }));
    if (Object.keys(errors).length === 0) return true;

    reveal(errors.cust_id_number          ? refIdNumber
         : errors.cust_id_type            ? refIdType
         : errors.cust_first_name || errors.cust_last_name ? refName
         : errors.cust_license_issue_date ? refLicenseIssueDate
         : errors.cust_phone              ? refPhone
         : refNationality);
    return false;
  };

  const validateTrip = (): boolean => {
    const errors: typeof fieldErrors = {};
    const moved = !baseline || form.car_id !== baseline.form.car_id
      || form.start_date !== baseline.form.start_date || form.end_date !== baseline.form.end_date;
    if (!form.start_date || !form.end_date) errors.dates = t('errors.datesRequired');
    if (!form.car_id) errors.car_id = t('errors.carRequired');
    // An old booking may overlap a block already. Only a new car or new dates have to fit.
    else if (moved && form.status !== 'cancelled' && busy?.has(Number(form.car_id))) errors.car_id = t('errors.carBusy');
    setFieldErrors(fe => ({ ...fe, dates: errors.dates, car_id: errors.car_id }));
    if (Object.keys(errors).length === 0) return true;
    reveal(refTrip);
    return false;
  };

  // Optional here: a booking is often made before anyone has seen the car.
  const validateFuel = (): boolean => {
    const problem = fuelRangeProblem(form.fuel_at_delivery);
    setFieldErrors(fe => ({ ...fe, fuel: problem ? fuelRange.message(problem) : undefined }));
    if (problem) reveal(refDelivery);
    return !problem;
  };

  const goNext = async () => {
    setFormError(null);
    setBanAlert(null);
    if (step === 0) {
      if (!validateCustomer()) return;
      setCheckingStep(true);
      try {
        const phone = form.cust_phone ? `${form.cust_phone_dial}${form.cust_phone}` : null;
        const ban = await customerBanMatch(existingCustomerId, form.cust_id_number.trim() || null, phone);
        if (ban) { setBanAlert(ban); return; }
      } catch {
        // Only saves time: the save asks again, and that answer can't be skipped.
      } finally {
        setCheckingStep(false);
      }
    }
    if (step === 1 && !validateTrip()) return;
    if (step === 3 && !validateFuel()) return;
    setStep(step + 1);
    setReached(furthest => Math.max(furthest, step + 1));
  };

  /** After the booking exists. A failure here can't undo it, so it is reported instead. */
  const recordPayments = async (bookingId: number) => {
    const receipts: PaymentReceipt[] = [];
    let failure: string | null = null;
    for (const [type, draft] of [['deposit', deposit], ['payment', payment]] as const) {
      if (!hasPayment(draft)) continue;
      try {
        const done = await recordPayment(bookingId, type, draft, null);
        if (done.envelope) receipts.push(done.envelope);
      } catch (failed) {
        failure = paymentErrorKey((failed as { message?: string })?.message);
      }
    }
    onPaid(receipts, failure);
  };

  /** Writes the chosen or new customer and their documents. `null` means stop: the reason is on screen. */
  const saveChosenCustomer = async (): Promise<string | null> => {
    const phone = form.cust_phone
      ? `${form.cust_phone_dial}${form.cust_phone}`
      : null;

    // Never start anything for someone who can't be booked. No answer counts as a
    // stop too: it's better to retry than to let a banned person through.
    try {
      const ban = await customerBanMatch(existingCustomerId, form.cust_id_number.trim() || null, phone);
      if (ban) { setBanAlert(ban); return null; }
    } catch {
      setFormError(t('customerStep.errors.checkFailed'));
      return null;
    }

    // Someone already on file is updated in place; a new person is created once, so a
    // retry after a failed booking finds them already there.
    const customerFields = {
      id_type:             form.cust_id_type,
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
    };
    let savedCustomerId = existingCustomerId;
    if (savedCustomerId) {
      const { error: custError } = await supabase.from('customers').update(customerFields).eq('id', savedCustomerId);
      if (custError) { showSaveError(custError.message); return null; }
    } else {
      const { data: custData, error: custError } = await supabase
        .from('customers')
        .insert({ ...customerFields, id_number: form.cust_id_number || null })
        .select('id')
        .single();
      if (custError) { showSaveError(custError.message); return null; }
      savedCustomerId = (custData as { id: string }).id;
      originalIdNumber.current = form.cust_id_number;
      setExistingCustomerId(savedCustomerId);
    }

    // Upload documents and patch the customer
    const customerId = savedCustomerId as unknown as number;
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

    return savedCustomerId;
  };

  const save = async () => {
    setSaving(true);

    if (mode === 'add') {
      const savedCustomer = await saveChosenCustomer();
      if (!savedCustomer) return;
      const customerId = savedCustomer as unknown as number;

      // Step 4: create the booking
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

      if (bookingError) { setSaving(false); showSaveError(bookingError.message); return; }

      // Step 5: insert ledger rows (skip rows with 0 or empty amount)
      const bookingId = (bookingData as { id: number }).id;
      const carIdNum  = Number(form.car_id);
      const usdRate   = rates.find(r => r.currency === 'USD')?.rate_to_try ?? 1;
      const toTRY     = (v: number) => form.fin_currency === 'USD' ? v * usdRate : v;
      // Stamp the rate that applies right now, exactly as the Customer Wallets page does.
      // Read once per save; if it cannot be read the field is omitted rather than blocking the booking.
      const entryRate = await fetchCurrentUsdRate();
      const rateStamp = entryRate != null ? { exchange_rate_at_entry: entryRate } : {};
      const rentalAmt = parseFloat(form.fin_rental_amount);
      const { error: rentalError } = await supabase.from('customer_accounting_ledger').insert([{
        booking_id: bookingId, customer_id: customerId, car_id: carIdNum,
        type: 'rental', amount: toTRY(rentalAmt), direction: 'OUT', description: 'Rental fee', ...rateStamp,
      }]);
      if (rentalError) onRentalFailed();

      await recordPayments(bookingId);
      setSaving(false);
    } else {
      // Edit: the customer first, so a refused ID leaves the booking as it was
      let bookingCustomerId = editCustomerId;
      if (customerSwapped) {
        const savedCustomer = await saveChosenCustomer();
        if (!savedCustomer) return;
        bookingCustomerId = savedCustomer as unknown as number;
      } else if (editCustomerId) {
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
            ...(form.cust_id_number.trim() !== originalIdNumber.current.trim() && { id_number: form.cust_id_number || null }),
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

        if (custErr) { setSaving(false); showSaveError(custErr.message); return; }
      }

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
          ...(customerSwapped && { customer_id: bookingCustomerId }),
        })
        .eq('id', editId!);

      if (bookingErr) { setSaving(false); showSaveError(bookingErr.message); return; }

      // The money and paperwork of a booking follow it, or the old customer's balance
      // stays wrong. Running this again is harmless, so a failure can simply be retried.
      if (customerSwapped) {
        const moved = await Promise.all([
          supabase.from('customer_accounting_ledger').update({ customer_id: bookingCustomerId }).eq('booking_id', editId!),
          supabase.from('hgs_transactions').update({ customer_id: bookingCustomerId }).eq('booking_id', editId!),
          supabase.from('replacement_sheets').update({ customer_id: bookingCustomerId }).eq('original_booking_id', editId!),
        ]);
        if (moved.some(result => result.error)) {
          setSaving(false);
          setFormError(t('sheet.moveFailed'));
          return;
        }
      }

      // Edit: the rental line stays even at 0, because the monthly close reads it.
      const carIdNum   = Number(form.car_id);
      const usdRate    = rates.find(r => r.currency === 'USD')?.rate_to_try ?? 1;
      const toTRY      = (v: number) => form.fin_currency === 'USD' ? v * usdRate : v;
      if (form.fin_rental_amount.trim()) {
        const rentalAmt = parseFloat(form.fin_rental_amount);
        // Stamp the rate that applies right now, exactly as the Customer Wallets page does.
        // Read once per save; if it cannot be read the field is omitted rather than blocking the booking.
        const entryRate = await fetchCurrentUsdRate();
        const rateStamp = entryRate != null ? { exchange_rate_at_entry: entryRate } : {};
        // The amount is being rewritten, so the stored rate is re-stamped to match it.
        const { error: rentalError } = existingLedgerIds.rental
          ? await supabase.from('customer_accounting_ledger').update({ amount: toTRY(rentalAmt), ...rateStamp }).eq('id', existingLedgerIds.rental)
          : await supabase.from('customer_accounting_ledger').insert({
            booking_id: editId!, customer_id: bookingCustomerId!, car_id: carIdNum,
            type: 'rental', amount: toTRY(rentalAmt), direction: 'OUT', description: 'Rental fee', ...rateStamp,
          });
        if (rentalError) onRentalFailed();
      }

      await recordPayments(editId!);
      setSaving(false);
    }

    rememberCar(Number(form.car_id));
    onSaved();
    onClose();
  };

  // An old booking may have no rental line at all, and editing it shouldn't be held up by that.
  const rentalIssue = mode === 'add' || existingLedgerIds.rental || form.fin_rental_amount.trim() ? rentalProblem(form.fin_rental_amount) : null;
  const zeroToConfirm = isZeroRental(form.fin_rental_amount) && (mode === 'add' || changedFields.has('fin_rental_amount'));

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting.current || checkingStep) return;
    if (mode === 'add' && step < STEP_KEYS.length - 1) { void goNext(); return; }

    setFormError(null);
    setBanAlert(null);

    // Earlier steps can be jumped back to and changed, so all of it is checked once more.
    if (!validateCustomer()) { setStep(0); return; }
    if (!validateTrip()) { setStep(1); return; }
    if (!validateFuel()) { setStep(3); return; }
    if (rentalIssue) { setRentalTried(true); document.getElementById(rentalInputId)?.focus(); return; }
    if (zeroToConfirm && !zeroConfirmed) return;
    const paymentIssue = paymentProblem(deposit) ?? paymentProblem(payment);
    if (paymentIssue) { setFormError(tf(`payment.errors.${paymentIssue}`)); return; }

    submitting.current = true;
    try {
      await save();
    } catch (error) {
      console.error('[Booking] save error:', error);
      setFormError(t('errors.saveFailed'));
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  const customerName = `${form.cust_first_name} ${form.cust_last_name}`.trim();
  const inputClass = (invalid: unknown) => (invalid ? 'hc-input is-invalid' : 'hc-input');
  const dot = (key: string) => mode === 'edit' && changedFields.has(key);
  const shortDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' });
  const dateSpan = form.start_date && form.end_date ? t('range.span', { start: shortDate(form.start_date), end: shortDate(form.end_date) }) : '—';
  const listSeparator = dateLocale.startsWith('ar') ? '، ' : ', ';

  const insuranceName = isInsurancePreset(form.insurance_type)
    ? t(`presets.insurance.${INSURANCE_KEY[form.insurance_type]}.name`)
    : form.insurance_type;
  const counted = (key: string, count: number) => (count > 1 ? `${t(key)} ×${count}` : t(key));
  const extrasName = [
    ...(extras.childSeats > 0 ? [counted('presets.services.childSeat', extras.childSeats)] : []),
    ...(extras.drivers > 0 ? [counted('presets.services.extraDriver', extras.drivers)] : []),
    ...(extras.extraKm ? [t('presets.services.extraKm')] : []),
    ...(extras.other ? [extras.otherText.trim() || t('presets.other')] : []),
  ].join(listSeparator);
  const locationName = (value: string) => (isLocationPreset(value) ? t(LOCATION_KEY[value]) : value);

  const rental = parseFloat(form.fin_rental_amount) || 0;
  const paidLira = paidBefore.payment + toLira(payment, rates);
  const paid = form.fin_currency === 'USD' && usdRate ? paidLira / usdRate : paidLira;
  const summaryRows = [
    { label: t('summary.car'), value: selectedCar ? <PlateChip plate={selectedCar.plate_number} /> : '—' },
    { label: t('summary.dates'), value: dateSpan },
    { label: t('summary.days'), value: days || '—' },
    { label: t('summary.insurance'), value: insuranceName || '—' },
    { label: t('summary.extras'), value: extrasName || '—' },
    { label: t('summary.total'), value: <bdi dir="ltr">{formatMoney(rental, form.fin_currency)}</bdi> },
    { label: t('summary.paid'), value: <bdi dir="ltr">{formatMoney(paid, form.fin_currency)}</bdi> },
    { label: t('summary.remaining'), value: <bdi dir="ltr">{formatMoney(rental - paid, form.fin_currency)}</bdi> },
  ];

  const locationField = (key: 'pickup_location' | 'dropoff_location', label: string, other: boolean, setOther: (value: boolean) => void) => (
    <Field label={label} changed={dot(key)}>
      <select
        className="hc-input"
        aria-label={label}
        value={other ? 'other' : form[key]}
        onChange={e => {
          setOther(e.target.value === 'other');
          set(key, e.target.value === 'other' ? '' : e.target.value);
        }}
      >
        <option value="">{t('form.selectLocation')}</option>
        {LOCATION_PRESETS.map(preset => <option key={preset} value={preset}>{t(LOCATION_KEY[preset])}</option>)}
        <option value="other">{tc('actions.other')}</option>
      </select>
      {other && (
        <input className="hc-input" autoFocus={mode === 'add'} value={form[key]} onChange={e => set(key, e.target.value)} placeholder={t('form.customLocation')} aria-label={label} />
      )}
    </Field>
  );

  const customerCard = (
    <FormCard icon={ICONS.customer} title={t('form.customerInfo')}>
      {editingBanned && <div className="hc-field-wide"><BanAlert ban={editingBanned} notice /></div>}

      {customerStep === 'search' ? (
        <div ref={refCustomerSearch} className="hc-field-wide">
          <CustomerSearch
            required={customerRequired}
            onSelect={(customer: CustomerMatch) => chooseCustomer(customer.id)}
            onNew={startNewCustomer}
            flagFor={nationality => COUNTRIES.find(c => c.name === nationality)?.flag ?? ''}
            formatDate={date => formatDateDisplay(date, dateLocale)}
          />
          {mode === 'edit' && editCustomerId != null && (
            <button type="button" className="hc-cust-new" onClick={keepOriginalCustomer}>{t('sheet.keepCustomer')}</button>
          )}
        </div>
      ) : (<>
        <div className="hc-field-wide">
          <div className="hc-cust-chosen">
            <span className="flex items-center gap-2">
              {customerStep === 'existing' ? t('customerStep.existing', { name: customerName }) : t('customerStep.creating')}
              {customerSwapped && <span role="img" aria-label={t('sheet.changed')} title={t('sheet.changed')} className="hc-field-dot" />}
            </span>
            <button type="button" onClick={clearCustomer}>{t('customerStep.change')}</button>
          </div>
          {customerSwapped && <FormNote>{t('sheet.moveNote')}</FormNote>}
        </div>

        <div ref={refIdNumber}>
          <Field label={t('form.idNumber')} required changed={dot('cust_id_number')}>
            <input
              className={inputClass(fieldErrors.cust_id_number)}
              value={form.cust_id_number}
              readOnly={!!existingCustomerId && customerStep === 'existing'}
              onChange={e => {
                set('cust_id_number', e.target.value);
                setIdOwner(null);
                if (fieldErrors.cust_id_number) setFieldErrors(fe => ({ ...fe, cust_id_number: undefined }));
              }}
              placeholder={t('form.documentNumber')}
              onBlur={checkIdOwner}
            />
            <FieldError>{fieldErrors.cust_id_number}</FieldError>
            {idOwner && (
              <div role="alert" className="hc-cust-owner">
                <span>{t('customerStep.idBelongs', { name: idOwner.name })}</span>
                {idOwner.banned
                  ? <BannedBadge reason={idOwner.reason} showReason />
                  : <button type="button" onClick={() => chooseCustomer(idOwner.id)}>{t('customerStep.useThis')}</button>}
              </div>
            )}
          </Field>
        </div>

        <div ref={refIdType}>
          <Field label={t('form.idType')} required changed={dot('cust_id_type')}>
            <select
              className={inputClass(fieldErrors.cust_id_type)}
              aria-label={t('form.idType')}
              value={form.cust_id_type}
              onChange={e => { set('cust_id_type', e.target.value as 'passport' | 'national_id'); if (fieldErrors.cust_id_type) setFieldErrors(fe => ({ ...fe, cust_id_type: undefined })); }}
            >
              <option value="passport">{t('form.passport')}</option>
              <option value="national_id">{t('form.nationalId')}</option>
            </select>
            <FieldError>{fieldErrors.cust_id_type}</FieldError>
          </Field>
        </div>

        <div ref={refName}>
          <Field label={tc('fields.firstName')} required changed={dot('cust_first_name')}>
            <input
              className={inputClass(fieldErrors.cust_first_name)}
              value={form.cust_first_name}
              onChange={e => { set('cust_first_name', e.target.value); if (fieldErrors.cust_first_name) setFieldErrors(fe => ({ ...fe, cust_first_name: undefined })); }}
              placeholder={t('form.firstNamePlaceholder')}
            />
            <FieldError>{fieldErrors.cust_first_name}</FieldError>
          </Field>
        </div>

        <Field label={tc('fields.lastName')} required changed={dot('cust_last_name')}>
          <input
            className={inputClass(fieldErrors.cust_last_name)}
            value={form.cust_last_name}
            onChange={e => { set('cust_last_name', e.target.value); if (fieldErrors.cust_last_name) setFieldErrors(fe => ({ ...fe, cust_last_name: undefined })); }}
            placeholder={t('form.lastNamePlaceholder')}
          />
          <FieldError>{fieldErrors.cust_last_name}</FieldError>
        </Field>

        <Field label={t('form.drivingLicense')} changed={dot('cust_driving_license_number')}>
          <input className="hc-input" value={form.cust_driving_license_number} onChange={e => set('cust_driving_license_number', e.target.value)} placeholder={t('form.licenseNumber')} />
        </Field>

        <div ref={refLicenseIssueDate}>
          <Field label={t('form.licenseIssueDate')} required changed={dot('cust_license_issue_date')}>
            <DateParts
              label={t('form.licenseIssueDate')}
              locale={dateLocale}
              invalid={!!fieldErrors.cust_license_issue_date}
              value={form.cust_license_issue_date}
              onChange={value => { set('cust_license_issue_date', value); if (fieldErrors.cust_license_issue_date) setFieldErrors(fe => ({ ...fe, cust_license_issue_date: undefined })); }}
            />
            <FieldError>{fieldErrors.cust_license_issue_date}</FieldError>
            {form.cust_license_issue_date && (Date.now() - new Date(form.cust_license_issue_date).getTime()) / 86400000 < 365 && (
              <FormNote>{t('warnings.licenseRecent')}</FormNote>
            )}
          </Field>
        </div>

        <div ref={refPhone}>
          <Field label={tc('fields.phone')} required changed={dot('cust_phone')}>
            <div className="hc-phone-row">
              <DialCodePicker value={form.cust_phone_dial} onChange={dial => set('cust_phone_dial', dial)} />
              <input
                className={inputClass(fieldErrors.cust_phone)}
                type="tel"
                value={form.cust_phone}
                onChange={e => { set('cust_phone', e.target.value); setPhoneSharers([]); if (fieldErrors.cust_phone) setFieldErrors(fe => ({ ...fe, cust_phone: undefined })); }}
                placeholder={t('form.phonePlaceholder')}
                onBlur={checkPhoneSharers}
              />
            </div>
            <FieldError>{fieldErrors.cust_phone}</FieldError>
            {phoneSharers.length > 0 && (
              <div role="status" className="hc-cust-phone">
                {t('customerStep.phoneShared', { names: phoneSharers.map(p => p.full_name).join(listSeparator) })}
              </div>
            )}
          </Field>
        </div>

        <div ref={refNationality}>
          <Field label={tc('fields.nationality')} required changed={dot('cust_nationality')}>
            <select
              className={inputClass(fieldErrors.cust_nationality)}
              aria-label={tc('fields.nationality')}
              value={form.cust_nationality}
              onChange={e => { set('cust_nationality', e.target.value); if (fieldErrors.cust_nationality) setFieldErrors(fe => ({ ...fe, cust_nationality: undefined })); }}
            >
              <option value="">{t('form.selectCountry')}</option>
              {COUNTRIES.map(c => <option key={c.code} value={c.name}>{c.flag} {countryName(c)}</option>)}
            </select>
            <FieldError>{fieldErrors.cust_nationality}</FieldError>
          </Field>
        </div>

        <Field label={tc('fields.language')} changed={dot('cust_language')}>
          <select className="hc-input" aria-label={tc('fields.language')} value={form.cust_language} onChange={e => set('cust_language', e.target.value as CustomerLanguage)}>
            {CUSTOMER_LANGUAGES.map(l => <option key={l.value} value={l.value}>{t(l.labelKey)}</option>)}
          </select>
          <p className="mt-1 text-xs text-gray-500">{t('whatsappHint')}</p>
        </Field>

        <Field label={t('form.birthDate')} changed={dot('cust_birth_date')}>
          <DateParts label={t('form.birthDate')} locale={dateLocale} value={form.cust_birth_date} onChange={value => set('cust_birth_date', value)} />
          {form.cust_birth_date && (Date.now() - new Date(form.cust_birth_date).getTime()) / (365.25 * 86400000) < 22 && (
            <FormNote>{t('warnings.underAge')}</FormNote>
          )}
        </Field>

        <Field label={tc('fields.address')} wide changed={dot('cust_address')}>
          <input className="hc-input" value={form.cust_address} onChange={e => set('cust_address', e.target.value)} placeholder={t('form.addressPlaceholder')} />
        </Field>
      </>)}
    </FormCard>
  );

  const documentsCard = customerStep !== 'search' && (
    <FormCard icon={ICONS.document} title={t('form.customerDocuments')}>
      <DocUploadField label={t('form.idPhoto')} existingUrl={existingDocUrls.id_photo_url} file={docIdPhoto} onChange={setDocIdPhoto} />
      <DocUploadField label={t('form.idPhotoBack')} existingUrl={existingDocUrls.id_photo_back_url} file={docIdPhotoBack} onChange={setDocIdPhotoBack} />
      <DocUploadField label={t('form.drivingLicense')} existingUrl={existingDocUrls.driving_license_photo_url} file={docDrivingLicense} onChange={setDocDrivingLicense} />
      <DocUploadField label={t('form.licenseBack')} existingUrl={existingDocUrls.driving_license_back_url} file={docDrivingLicenseBack} onChange={setDocDrivingLicenseBack} />
      <DocUploadField label={t('form.entryStamp')} existingUrl={existingDocUrls.entry_stamp_photo_url} file={docEntryStamp} onChange={setDocEntryStamp} />
    </FormCard>
  );

  const tripCard = (
    <div ref={refTrip}>
      <FormCard icon={ICONS.calendar} title={t('steps.trip')}>
        <Field label={t('form.dateRange')} required wide changed={dot('start_date') || dot('end_date')}>
          <DateRangePicker
            label={t('form.dateRange')}
            locale={dateLocale}
            start={form.start_date}
            end={form.end_date}
            onChange={(start, end) => {
              setForm(f => ({ ...f, start_date: start, end_date: end }));
              setFieldErrors(fe => ({ ...fe, dates: undefined, car_id: undefined }));
            }}
          />
          <FieldError>{fieldErrors.dates}</FieldError>
        </Field>

        <Field label={tc('fields.car')} required wide changed={dot('car_id')}>
          {!form.start_date || !form.end_date ? (
            <p className="text-[13px] text-gray-500">{t('carBusy.pickDates')}</p>
          ) : (
            <CarPicker
              labelId={carLabelId}
              cars={cars}
              failed={carsFailed}
              onRetry={() => setCarsAttempt(attempt => attempt + 1)}
              recent={recentCars}
              value={selectedCarId}
              onChange={carWarning.choose}
              disabled={saving}
              busy={busy}
              showAvailability={!!busy}
              warned={carWarning.warned}
            />
          )}
          {availabilityFailed && <FormNote>{t('carBusy.checkFailed')}</FormNote>}
          <FieldError>{fieldErrors.car_id}</FieldError>
        </Field>

        {locationField('pickup_location', t('form.pickupLocation'), pickupOther, setPickupOther)}
        {locationField('dropoff_location', t('form.dropoffLocation'), dropoffOther, setDropoffOther)}
      </FormCard>
    </div>
  );

  const changedDot = (key: string) => (dot(key)
    ? <span role="img" aria-label={t('sheet.changed')} title={t('sheet.changed')} className="hc-field-dot" />
    : undefined);

  const insuranceCard = (
    <FormCard icon={ICONS.shield} title={t('form.insuranceType')} action={changedDot('insurance_type')}>
      <div role="radiogroup" aria-label={t('form.insuranceType')} className="hc-option-list hc-field-wide">
        {INSURANCE_PRESETS.map(preset => (
          <RadioOption
            key={preset}
            name="booking-insurance"
            art={INSURANCE_ART[preset]}
            selected={!insuranceOther && form.insurance_type === preset}
            title={t(`presets.insurance.${INSURANCE_KEY[preset]}.name`)}
            description={t(`presets.insurance.${INSURANCE_KEY[preset]}.desc`)}
            onSelect={() => { setInsuranceOther(false); set('insurance_type', preset); }}
            onClear={() => set('insurance_type', '')}
          />
        ))}
        <RadioOption
          name="booking-insurance"
          glyph="pen"
          selected={insuranceOther}
          title={t('presets.other')}
          description={t('presets.otherInsurance')}
          onSelect={() => { setInsuranceOther(true); set('insurance_type', ''); }}
          onClear={() => { setInsuranceOther(false); set('insurance_type', ''); }}
        />
        {insuranceOther && (
          <input className="hc-input" autoFocus={mode === 'add'} value={form.insurance_type} onChange={e => set('insurance_type', e.target.value)} placeholder={t('form.specifyInsurance')} aria-label={t('form.specifyInsurance')} />
        )}
      </div>
    </FormCard>
  );

  const extrasCard = (
    <FormCard icon={ICONS.plus} title={t('form.additionalServices')} action={changedDot('additional_services')}>
      <div className="hc-option-list hc-field-wide">
        <ExtraOption wide art="child-seat" selected={extras.childSeats > 0} title={t('presets.services.childSeat')} description={t('options.childSeat')}>
          <QuantityStepper label={t('presets.services.childSeat')} value={extras.childSeats} onChange={childSeats => setExtra({ childSeats })} />
        </ExtraOption>
        <ExtraOption wide art="extra-driver" selected={extras.drivers > 0} title={t('presets.services.extraDriver')} description={t('options.extraDriver')}>
          <QuantityStepper label={t('presets.services.extraDriver')} value={extras.drivers} onChange={drivers => setExtra({ drivers })} />
        </ExtraOption>
        <ExtraOption art="extra-km" selected={extras.extraKm} title={t('presets.services.extraKm')} description={t('options.extraKm')}>
          <OptionSwitch label={t('presets.services.extraKm')} checked={extras.extraKm} onChange={extraKm => setExtra({ extraKm })} />
        </ExtraOption>
        <ExtraOption glyph="plus" selected={extras.other} title={t('presets.other')} description={t('options.other')}>
          <OptionSwitch label={t('presets.other')} checked={extras.other} onChange={other => setExtra({ other, otherText: other ? extras.otherText : '' })} />
        </ExtraOption>
        {extras.other && (
          <input className="hc-input" autoFocus={mode === 'add'} value={extras.otherText} onChange={e => setExtra({ otherText: e.target.value })} placeholder={t('form.specifyService')} aria-label={t('form.specifyService')} />
        )}
      </div>
    </FormCard>
  );

  const deliveryCard = (
    <div ref={refDelivery}>
      <FormCard icon={ICONS.gauge} title={t('form.vehicleCondition')}>
        <Field label={t('form.kmAtDelivery')} changed={dot('km_at_delivery')}>
          <input className="hc-input" type="number" inputMode="numeric" min="0" step="1" dir="ltr" value={form.km_at_delivery} onChange={e => set('km_at_delivery', e.target.value)} placeholder={t('form.kmPlaceholder')} />
        </Field>
        <Field label={fuelRange.label} changed={dot('fuel_at_delivery')}>
          <FuelRangeInput
            className={inputClass(fieldErrors.fuel)}
            dir="ltr"
            aria-label={fuelRange.label}
            value={form.fuel_at_delivery}
            onChange={value => {
              set('fuel_at_delivery', value);
              const problem = fuelRangeProblem(value);
              setFieldErrors(fe => ({ ...fe, fuel: problem ? fuelRange.message(problem) : undefined }));
            }}
          />
          <FieldError>{fieldErrors.fuel}</FieldError>
        </Field>
      </FormCard>
    </div>
  );

  const statuses: BookingStatus[] = form.status === 'completed' ? ['pending', 'confirmed', 'cancelled', 'completed'] : ['pending', 'confirmed', 'cancelled'];

  const detailsCard = (
    <FormCard icon={ICONS.calendar} title={t('form.bookingDetails')}>
      <Field label={tc('fields.status')} wide changed={dot('status')}>
        <div role="group" aria-label={tc('fields.status')} className="hc-seg hc-seg-full">
          {statuses.map(status => (
            <button key={status} type="button" aria-pressed={form.status === status} onClick={() => set('status', status)}>{t(`status.${status}`)}</button>
          ))}
        </div>
      </Field>
      <Field label={tc('fields.notes')} wide changed={dot('cust_notes')}>
        <textarea className="hc-input" rows={2} value={form.cust_notes} onChange={e => set('cust_notes', e.target.value)} placeholder={t('form.notesPlaceholder')} />
      </Field>
    </FormCard>
  );

  const paymentCard = (
    <div ref={financeCard}>
    <FormCard
      icon={ICONS.money}
      title={t('form.financialInfo')}
      action={<CurrencySwitch value={form.fin_currency} onChange={handleFinCurrencyChange} disabled={usdRate === null} label={tc('fields.currency')} />}
    >
      <Field label={t('form.rentalAmount')} required={mode === 'add' || !!existingLedgerIds.rental} changed={dot('fin_rental_amount')}>
        <MoneyField id={rentalInputId} placeholder="" ariaLabel={t('form.rentalAmount')} currency={form.fin_currency} rate={usdRate} value={form.fin_rental_amount} onChange={value => { set('fin_rental_amount', value); setZeroConfirmed(false); }} />
        <FieldError>{rentalTried && rentalIssue ? t(`errors.rental_${rentalIssue}`) : null}</FieldError>
        {zeroToConfirm && <ZeroAmountConfirm confirmed={zeroConfirmed} onChange={setZeroConfirmed} />}
      </Field>
      {mode === 'edit' && (paidBefore.deposit !== 0 || paidBefore.payment !== 0) && (
        <dl className="hc-review hc-field-wide">
          <div><dt>{t('form.deposit')}</dt><dd><bdi dir="ltr">{formatMoney(paidBefore.deposit, 'TRY')}</bdi></dd></div>
          <div><dt>{t('form.paidAmount')}</dt><dd><bdi dir="ltr">{formatMoney(paidBefore.payment, 'TRY')}</bdi></dd></div>
        </dl>
      )}
      <PaymentFields label={tf(mode === 'edit' ? 'payment.addDeposit' : 'payment.deposit')} value={deposit} onChange={setDeposit} accounts={paymentAccounts} />
      <PaymentFields label={tf(mode === 'edit' ? 'payment.addPayment' : 'payment.payment')} value={payment} onChange={setPayment} accounts={paymentAccounts} />
    </FormCard>
    </div>
  );

  const reviewCard = (
    <FormCard icon={ICONS.check} title={t('form.review')}>
      <dl className="hc-review hc-field-wide">
        <div><dt>{t('summary.customer')}</dt><dd dir="auto">{customerName || '—'}</dd></div>
        <div>
          <dt>{t('summary.car')}</dt>
          <dd className="flex flex-wrap items-center justify-end gap-2">
            {selectedCar ? <><PlateChip plate={selectedCar.plate_number} /><span>{selectedCar.model}</span></> : '—'}
          </dd>
        </div>
        <div><dt>{t('summary.dates')}</dt><dd>{dateSpan}{days > 0 && ` · ${t('range.days', { count: days })}`}</dd></div>
        <div>
          <dt>{t('summary.locations')}</dt>
          <dd>{form.pickup_location || form.dropoff_location ? `${locationName(form.pickup_location) || '—'} · ${locationName(form.dropoff_location) || '—'}` : '—'}</dd>
        </div>
        <div><dt>{t('summary.insurance')}</dt><dd>{insuranceName || '—'}</dd></div>
        <div><dt>{t('summary.extras')}</dt><dd>{extrasName || '—'}</dd></div>
        <div><dt>{t('summary.km')}</dt><dd><bdi dir="ltr">{form.km_at_delivery || '—'}</bdi></dd></div>
        <div><dt>{fuelRange.short}</dt><dd>{fuelRange.format(form.fuel_at_delivery)}</dd></div>
      </dl>
    </FormCard>
  );

  const stepBodies = [
    <>{customerCard}{documentsCard}</>,
    tripCard,
    <>{insuranceCard}{extrasCard}</>,
    deliveryCard,
    <>{reviewCard}{detailsCard}{paymentCard}</>,
  ];

  const lastStep = STEP_KEYS.length - 1;
  const onLastStep = mode === 'edit' || step === lastStep;
  const busyLoading = saving || checkingStep;
  const submitLabel = mode === 'add'
    ? onLastStep ? t('sheet.create') : t('sheet.next')
    : changedFields.size > 0 ? t('sheet.saveChanges', { count: changedFields.size }) : t('sheet.saveNoChanges');

  return (
    <BookingSheet
      title={mode === 'add' ? t('form.newTitle') : t('form.editTitle')}
      subtitle={mode === 'add' ? t('form.newSubtitle') : t('form.editSubtitle')}
      chip={<span className="hc-bs-chip">{bookingNumLoading ? t('sheet.generatingNumber') : form.booking_number}</span>}
      stepper={mode === 'add' ? (
        <Stepper
          steps={STEP_KEYS.map(key => ({ key, label: t(`steps.${key}`), short: t(`stepsShort.${key}`) }))}
          current={step}
          reached={reached}
          onJump={index => { setFormError(null); setBanAlert(null); setStep(index); }}
        />
      ) : undefined}
      scrollKey={step}
      summary={form.car_id || form.start_date ? <SummaryBar rows={summaryRows} headline={mode === 'add' ? summaryRows[1] : summaryRows[7]} /> : undefined}
      alerts={banAlert || formError ? <>{banAlert && <BanAlert ban={banAlert} />}<FormError>{formError}</FormError></> : undefined}
      dirty={dirty}
      busy={busyLoading}
      onClose={onClose}
      onSubmit={handleSubmit}
      closeRef={closeRef}
      footer={(
        <>
          {mode === 'add' && (
            <div className="hc-bs-total">
              <span>{t('summary.total')}</span>
              <strong dir="ltr">{formatMoney(rental, form.fin_currency)}</strong>
            </div>
          )}
          {mode === 'add' && step > 0 && (
            <Button variant="secondary" disabled={busyLoading} onClick={() => setStep(current => current - 1)}>{t('sheet.back')}</Button>
          )}
          <Button variant="secondary" className={mode === 'add' && step > 0 ? 'hc-bs-cancel' : undefined} disabled={busyLoading} onClick={() => closeRef.current?.()}>
            {tc('actions.cancel')}
          </Button>
          <Button type="submit" className="hc-bs-primary" disabled={busyLoading || (mode === 'edit' && changedFields.size === 0) || (onLastStep && ((zeroToConfirm && !zeroConfirmed) || !!(paymentProblem(deposit) ?? paymentProblem(payment))))}>
            {saving ? tc('actions.saving') : submitLabel}
          </Button>
        </>
      )}
    >
      <span id={carLabelId} hidden>{tc('fields.car')}</span>
      {carWarning.dialog}
      {mode === 'add' ? stepBodies[step] : baseline ? (
        <>
          {customerCard}
          {documentsCard}
          {tripCard}
          {insuranceCard}
          {extrasCard}
          {deliveryCard}
          {detailsCard}
          {paymentCard}
        </>
      ) : (
        !formError && <p role="status" className="py-8 text-center text-sm text-gray-500">{t('sheet.loading')}</p>
      )}
    </BookingSheet>
  );
};

// ─── Delete confirm modal ─────────────────────────────────────────────────────

// ─── Extend booking ───────────────────────────────────────────────────────────

/** The one row `extend_booking` returns. Only the balance is shown to the user. */
interface ExtendResult {
  booking_id: number;
  old_end_date: string;
  new_end_date: string;
  rental_logged: number | string;
  payment_logged: number | string;
  new_balance: number | string;
}

const nextDayOf = (isoDate: string): string => addDay(isoDate, 1);

/** Further than anyone books ahead, for "anything after this day". */
const FAR_FUTURE = '2100-01-01';

/**
 * Extending a booking is one RPC, plus a note on what it wrote (see `appendLedgerNote`).
 *
 * `extend_booking` is SECURITY DEFINER and does the whole thing in a
 * transaction: moves `end_date`, forces `status` to confirmed, writes the rental
 * and the payment into `customer_accounting_ledger`, and hands back the new
 * balance. The calendar follows through its own trigger. Writing any of that
 * from here would be a second, divergent implementation of a money path — so
 * this component only gathers four values and reports what came back.
 */
const ExtendBookingModal: React.FC<{
  booking: Booking;
  onClose: () => void;
  onExtended: (newEndDate: string, newBalance: number | null, noteSaved: boolean, receipts: PaymentReceipt[], paymentFailure: string | null) => void;
}> = ({ booking, onClose, onExtended }) => {
  const { t } = useTranslation('bookings');
  const { t: tc } = useTranslation('common');
  const { t: tf } = useTranslation('finance');
  const dateLocale = useDateLocale();
  const usdRate = useUsdRate();
  const closeRef = useRef<(() => void) | null>(null);
  const submitting = useRef(false);

  // Not sent: the function derives the same day itself. It is shown so the person
  // can see which period they are actually paying for.
  const periodStart = nextDayOf(booking.end_date);

  const [newEndDate, setNewEndDate] = useState('');
  const [rentalAmount, setRentalAmount] = useState('');
  const rentalInputId = useId();
  const [rentalTried, setRentalTried] = useState(false);
  const [zeroConfirmed, setZeroConfirmed] = useState(false);
  const [rentalCurrency, setRentalCurrency] = useState<FormCurrency>('TRY');
  const [payment, setPayment] = useState<PaymentDraft>(emptyPayment);
  const paymentAccounts = usePaymentAccounts();
  const { rates } = useCurrency();
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [banAlert, setBanAlert] = useState<BanMatch | null>(
    booking.customer_banned ? { customer_id: '', full_name: booking.customer_name, ban_reason: booking.customer_ban_reason ?? null, matched_on: 'customer' } : null,
  );
  const [blocksAhead, setBlocksAhead] = useState<CalendarBlock[]>([]);
  const [oldBalance, setOldBalance] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    // Only a courtesy: the database still refuses a clash with another booking.
    getBlocks(periodStart, FAR_FUTURE, booking.car_id)
      .then(found => { if (active) setBlocksAhead(found); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [periodStart, booking.car_id]);

  useEffect(() => {
    let active = true;
    // Only for the preview: if it can't be read the balance shows as a dash.
    customerBalance(booking.customer_id)
      .then(balance => { if (active) setOldBalance(balance); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [booking.customer_id]);

  // Only another booking stops the dates, as the database does. Maintenance and the like
  // get a warning, since this car is already out with the customer either way.
  const blockedFrom = firstBusyDay(blocksAhead.filter(block => block.block_type.startsWith('booked')), periodStart, { bookingId: booking.id });
  const softBlock = newEndDate
    ? blocksAhead.find(block => !block.block_type.startsWith('booked') && block.start_date <= newEndDate)
    : undefined;

  const rentalNum = Number(rentalAmount);
  const rentalIssue = rentalProblem(rentalAmount);
  const zeroRental = isZeroRental(rentalAmount);
  const inLira = (amount: number, currency: FormCurrency) => (currency === 'USD' && usdRate !== null ? amount * usdRate : amount);
  const rentalTry = inLira(rentalNum, rentalCurrency);
  const paidTry   = toLira(payment, rates);
  const extraDays = newEndDate ? rentalDays(booking.end_date, newEndDate) : 0;
  const nextBalance = oldBalance === null ? null : oldBalance - (rentalTry || 0) + (paidTry || 0);

  const shortDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' });
  const balanceValue = (balance: number | null) => (balance === null
    ? '—'
    : <bdi dir="ltr" className={balance < 0 ? 'text-red-600' : undefined}>{formatMoney(balance, 'TRY')}</bdi>);

  const save = async () => {
    setFormError(null);

    if (!newEndDate) { setFormError(t('extend.errors.endRequired')); return; }
    if (newEndDate <= booking.end_date) {
      setFormError(t('extend.errors.endNotAfter', { current: booking.end_date }));
      return;
    }
    if (rentalIssue) {
      setRentalTried(true);
      document.getElementById(rentalInputId)?.focus();
      return;
    }
    const paymentIssue = paymentProblem(payment);
    if (paymentIssue) {
      setFormError(tf(`payment.errors.${paymentIssue}`));
      return;
    }

    setSaving(true);

    // Extending doesn't change the booking's customer, so the database trigger never
    // sees it. This is the only check there is, which is why no answer stops it too.
    try {
      const ban = await banForExistingCustomer(String(booking.customer_id));
      setBanAlert(ban);
      if (ban) { setSaving(false); return; }
    } catch {
      setSaving(false);
      setFormError(t('customerStep.errors.checkFailed'));
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.rpc('extend_booking', {
      p_booking_id:    booking.id,
      p_new_end_date:  newEndDate,
      p_rental_amount: rentalTry,
      // The payment is recorded below, the one way money reaches the ledger.
      p_paid_amount:   0,
      p_created_by:    user?.id ?? null,
    });

    if (error) {
      setSaving(false);
      const refusal = parseCustomerError(error.message);
      if (refusal?.kind === 'banned') setBanAlert({ customer_id: '', full_name: refusal.name, ban_reason: refusal.reason || null, matched_on: 'customer' });
      else if (isCarBusyError(error.message)) setFormError(t('errors.carBusy'));
      else setFormError(t('extend.errors.failed'));
      return;
    }

    const receipts: PaymentReceipt[] = [];
    let paymentFailure: string | null = null;
    let paidNow = 0;
    if (hasPayment(payment)) {
      try {
        const done = await recordPayment(booking.id, 'payment', payment, 'Extension payment');
        paidNow = Number(done.amount_try);
        if (done.envelope) receipts.push(done.envelope);
      } catch (failed) {
        paymentFailure = paymentErrorKey((failed as { message?: string })?.message);
      }
    }

    const notes = await Promise.all([
      rentalCurrency === 'USD' && usdRate !== null && rentalNum > 0
        ? appendLedgerNote(booking.id, 'Rental extension', ` ($${rentalNum} × ${formatRate(usdRate)})`) : true,
    ]);
    setSaving(false);

    // The function returns a TABLE, which PostgREST hands back as an array.
    const result = (Array.isArray(data) ? data[0] : data) as ExtendResult | undefined;
    const balance = result?.new_balance == null ? null : Number(result.new_balance);
    onExtended(newEndDate, Number.isFinite(balance as number) ? (balance as number) + paidNow : null, notes.every(Boolean), receipts, paymentFailure);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    try {
      await save();
    } catch {
      setFormError(t('extend.errors.failed'));
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  const canSave = !saving && !!newEndDate && !(zeroRental && !zeroConfirmed) && !paymentProblem(payment);
  const summaryRows = [
    { label: t('extend.oldBalance'), value: balanceValue(oldBalance) },
    { label: t('extend.charge'), value: <bdi dir="ltr">{formatMoney(-(rentalTry || 0), 'TRY')}</bdi> },
    { label: t('extend.paidNow'), value: <bdi dir="ltr">{formatMoney(paidTry || 0, 'TRY')}</bdi> },
    { label: t('extend.newBalance'), value: balanceValue(nextBalance) },
  ];

  return (
    <BookingSheet
      title={t('extend.title')}
      subtitle={t('extend.subtitle', { number: booking.booking_number, customer: booking.customer_name || '—' })}
      summary={<SummaryBar rows={summaryRows} headline={summaryRows[3]} />}
      alerts={banAlert || formError ? <>{banAlert && <BanAlert ban={banAlert} />}<FormError>{formError}</FormError></> : undefined}
      dirty={!!newEndDate || rentalAmount !== '' || payment.amount !== ''}
      busy={saving}
      onClose={onClose}
      onSubmit={handleSubmit}
      closeRef={closeRef}
      footer={(
        <>
          <Button variant="secondary" disabled={saving} onClick={() => closeRef.current?.()}>{tc('actions.cancel')}</Button>
          <Button type="submit" className="hc-bs-primary" disabled={!canSave}>{saving ? tc('actions.saving') : t('extend.submit')}</Button>
        </>
      )}
    >
      <FormCard icon={ICONS.customer} title={t('extend.currentBooking')}>
        <dl className="hc-review hc-field-wide">
          <div><dt>{t('summary.customer')}</dt><dd dir="auto">{booking.customer_name || '—'}</dd></div>
          <div>
            <dt>{t('summary.car')}</dt>
            <dd className="flex flex-wrap items-center justify-end gap-2"><PlateChip plate={booking.plate_number} /><span>{booking.car_model}</span></dd>
          </div>
          <div>
            <dt>{t('summary.dates')}</dt>
            <dd>{t('range.span', { start: formatDateDisplay(booking.start_date, dateLocale), end: formatDateDisplay(booking.end_date, dateLocale) })}</dd>
          </div>
        </dl>
      </FormCard>

      <FormCard
        icon={ICONS.calendar}
        title={t('extend.extension')}
        action={extraDays > 0 ? <span className="hc-range-count text-[13px]">{t('extend.plusDays', { count: extraDays })}</span> : undefined}
      >
        <Field label={t('extend.newEndDate')} required wide>
          <DateRangePicker
            label={t('extend.newEndDate')}
            locale={dateLocale}
            fixedStart
            start={booking.end_date}
            end={newEndDate}
            min={periodStart}
            blockedFrom={blockedFrom}
            onChange={(_, end) => setNewEndDate(end)}
          />
        </Field>
        <div className="hc-field-wide">
          <div aria-hidden="true" className="hc-timeline">
            <span className="hc-timeline-old" style={{ flex: `${rentalDays(booking.start_date, booking.end_date)} 1 0` }} />
            {extraDays > 0 && <span className="hc-timeline-new" style={{ flex: `${extraDays} 1 0` }} />}
          </div>
          <div className="hc-timeline-labels">
            <span>{shortDate(booking.start_date)}</span>
            <span>{shortDate(booking.end_date)}</span>
            {newEndDate && <span className="font-semibold text-[#0f1117]">{shortDate(newEndDate)}</span>}
          </div>
          <p className="mt-2 text-xs text-gray-500">{t('extend.startsOn', { date: formatDateDisplay(periodStart, dateLocale) })}</p>
          {softBlock && (
            <FormNote>
              {t('extend.blockAhead', {
                type: t(softBlock.block_type === 'maintenance' ? 'carBusy.maintenance' : softBlock.block_type === 'selling' ? 'carBusy.selling' : 'carBusy.replacement'),
                date: formatDateDisplay(softBlock.start_date, dateLocale),
              })}
            </FormNote>
          )}
        </div>
      </FormCard>

      <FormCard icon={ICONS.money} title={t('extend.amount')}>
        <Field label={t('extend.labelRental')} required wide>
          <MoneyField id={rentalInputId} placeholder="" ariaLabel={t('extend.labelRental')} currency={rentalCurrency} rate={usdRate} onCurrency={setRentalCurrency} value={rentalAmount} onChange={value => { setRentalAmount(value); setZeroConfirmed(false); }} />
          <FieldError>{rentalTried && rentalIssue ? t(`errors.rental_${rentalIssue}`) : null}</FieldError>
          {zeroRental && <ZeroAmountConfirm confirmed={zeroConfirmed} onChange={setZeroConfirmed} />}
        </Field>
        <PaymentFields label={t('extend.labelPaid')} value={payment} onChange={setPayment} accounts={paymentAccounts} disabled={saving} />
        <p className="hc-field-wide text-xs leading-relaxed text-gray-500">{t('extend.insuranceNote')}</p>
      </FormCard>
    </BookingSheet>
  );
};

// ─── Cars that shouldn't go out ───────────────────────────────────────────────

/**
 * A strong warning, not a block: nothing in the database stops the booking. Choosing a car
 * with a missing or expired date has to be confirmed first.
 */
function useCarWarning(onChoose: (carId: number | null) => void) {
  const { t } = useTranslation('cars');
  const compliance = useCarCompliance();
  const issueText = useIssueText();
  const [pendingId, setPendingId] = useState<number | null>(null);

  const warned = useMemo(() => {
    const badges = new Map<number, string>();
    compliance.byId.forEach((car, id) => { if (car.severity) badges.set(id, t('compliance.badge')); });
    return badges;
  }, [compliance.byId, t]);

  const choose = (carId: number | null) => {
    if (carId != null && compliance.byId.get(carId)?.severity) setPendingId(carId);
    else onChoose(carId);
  };

  const pending = pendingId != null ? compliance.byId.get(pendingId) : undefined;
  const dialog = pending ? (
    <ConfirmDialog
      title={t('compliance.confirmTitle')}
      body={t('compliance.confirmBody', { plate: pending.plate, issues: pending.issues.map(issueText).join(' · ') })}
      confirmLabel={t('compliance.confirmAccept')}
      cancelLabel={t('compliance.confirmCancel')}
      onConfirm={() => { onChoose(pending.id); setPendingId(null); }}
      onCancel={() => setPendingId(null)}
    />
  ) : null;

  return { warned, choose, dialog };
}

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
  customer_banned: boolean;
  start_date: string;
  end_date: string;
}

/**
 * A stored sheet, plus the identity fields the reprint list needs and the three
 * raw ids editing needs. They are kept off `ReplacementSheet` itself, which is
 * the print contract and has no business knowing about foreign keys.
 *
 * `calendar_block_id` is nullable: nothing in the database forces a sheet to
 * have a calendar block, so editing has to cope with a sheet that has none.
 */
type ReplacementSheetRecord = ReplacementSheet & {
  id: number;
  created_at: string;
  original_car_id: number | null;
  replacement_car_id: number | null;
  calendar_block_id: number | null;
};

/**
 * replacement_sheets has two FKs to cars, so both embeds are disambiguated by constraint
 * name — a bare `cars(...)` embed returns a 400.
 */
const SHEET_SELECT = `
  id, created_at, sheet_number, customer_id, original_booking_id,
  original_car_id, replacement_car_id, calendar_block_id,
  start_date, end_date, km_at_handover, fuel_at_handover, notes,
  customers(first_name, last_name, is_banned, ban_reason),
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
  original_car_id: number | null;
  replacement_car_id: number | null;
  calendar_block_id: number | null;
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
    customer_banned:         cust?.is_banned === true,
    customer_ban_reason:     cust?.ban_reason ?? null,
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
    original_car_id:         row.original_car_id,
    replacement_car_id:      row.replacement_car_id,
    calendar_block_id:       row.calendar_block_id,
  };
}

const todayStr = (): string => toDateStr(new Date());

// ─── Replacement form modal ───────────────────────────────────────────────────

const ReplacementFormModal: React.FC<{
  onClose: () => void;
  onSaved: (sheet: ReplacementSheetRecord) => void;
  /**
   * Present = edit an existing sheet. The original booking, its customer and the
   * original car are the facts the sheet was raised about, so they are shown but
   * never re-picked; `sheet_number` is likewise left alone, generated once at
   * creation.
   */
  sheet?: ReplacementSheetRecord;
}> = ({ onClose, onSaved, sheet }) => {
  const { t } = useTranslation('bookings');
  const { t: tc } = useTranslation('common');
  const fuelRange = useFuelRange();
  const dateLocale = useDateLocale();
  const isEdit = !!sheet;
  const closeRef = useRef<(() => void) | null>(null);
  const submitting = useRef(false);
  const originalLabelId = useId();
  const replacementLabelId = useId();
  const [cars, setCars]               = useState<ReplacementCarOption[]>([]);
  const [carsLoading, setCarsLoading] = useState(true);
  const [carsFailed, setCarsFailed]   = useState(false);
  const [carsAttempt, setCarsAttempt] = useState(0);

  const [originalCarId, setOriginalCarId] = useState(
    sheet?.original_car_id != null ? String(sheet.original_car_id) : '');
  const [carBookings, setCarBookings]         = useState<CarBookingOption[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingId, setBookingId]             = useState('');

  const [replacementCarId, setReplacementCarId] = useState(
    sheet?.replacement_car_id != null ? String(sheet.replacement_car_id) : '');
  const [startDate, setStartDate] = useState(sheet?.start_date ?? todayStr());
  const [endDate,   setEndDate]   = useState(sheet?.end_date ?? '');
  const [km,        setKm]        = useState(sheet?.km_at_handover != null ? String(sheet.km_at_handover) : '');
  const [fuel,      setFuel]      = useState(sheet?.fuel_at_handover ?? '');
  const [notes,     setNotes]     = useState(sheet?.notes ?? '');

  const [banAlert, setBanAlert]   = useState<BanMatch | null>(null);
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { busy, failed: availabilityFailed } = useCarAvailability(startDate, endDate, { blockId: sheet?.calendar_block_id });
  const carWarning = useCarWarning(id => setReplacementCarId(id == null ? '' : String(id)));

  // ── All cars (no is_active filter — a car being replaced may already be parked up) ──
  useEffect(() => {
    let active = true;
    setCarsLoading(true);
    setCarsFailed(false);
    (async () => {
      const [carsRes, availRes] = await Promise.all([
        supabase.from('cars').select('id, plate_number, model_group(name)').order('plate_number'),
        supabase.from('car_availability').select('id, status'),
      ]);
      if (!active) return;
      setCarsFailed(!!carsRes.error);

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
  }, [carsAttempt]);

  const recentCars = useMemo(() => recentCarIds().flatMap(id => cars.filter(car => car.id === id)), [cars]);

  // ── Bookings for the chosen plate — every booking, newest first, no status filter ──
  useEffect(() => {
    // Edit mode never re-picks the booking, and this effect would wipe the seed.
    if (isEdit) return;
    setBookingId('');
    setCarBookings([]);
    if (!originalCarId) return;

    let active = true;
    setBookingsLoading(true);
    (async () => {
      const { data } = await supabase
        .from('bookings')
        .select('id, booking_number, customer_id, start_date, end_date, customers(first_name, last_name, is_banned)')
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
          customer_banned: c?.is_banned === true,
          start_date: b.start_date,
          end_date: b.end_date,
        };
      }));
      setBookingsLoading(false);
    })();
    return () => { active = false; };
  }, [originalCarId, isEdit]);

  const selectedBooking = carBookings.find(b => String(b.id) === bookingId) ?? null;

  // Return date defaults to the original booking's end date, and stays editable
  // after. In edit mode the stored date is the truth and is never overwritten.
  useEffect(() => {
    if (!isEdit && selectedBooking) setEndDate(selectedBooking.end_date >= startDate ? selectedBooking.end_date : '');
  }, [selectedBooking, isEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  const originalCar    = cars.find(c => String(c.id) === originalCarId) ?? null;
  const replacementCar = cars.find(c => String(c.id) === replacementCarId) ?? null;

  const noBookings   = !isEdit && !!originalCarId && !bookingsLoading && carBookings.length === 0;
  const sameCarWarn  = !!replacementCarId && replacementCarId === originalCarId;
  const nonParkWarn  = !!replacementCar && replacementCar.status !== null && replacementCar.status !== 'parking';

  const save = async () => {
    setFormError(null);

    // Shared by both modes — the fields anyone may change.
    if (!replacementCarId)               { setFormError(t('replacement.errors.replacementCar')); return; }
    if (!startDate || !endDate)          { setFormError(t('replacement.errors.datesRequired')); return; }
    if (endDate < startDate)             { setFormError(t('replacement.errors.returnBeforeHandover')); return; }
    const fuelProblem = fuelRangeProblem(fuel);
    if (fuelProblem)                     { setFormError(fuelRange.message(fuelProblem)); return; }

    // An old sheet may overlap a block already. Only a new car or new dates have to fit.
    const moved = !sheet || String(sheet.replacement_car_id ?? '') !== replacementCarId
      || sheet.start_date !== startDate || sheet.end_date !== endDate;
    if (moved && busy?.has(Number(replacementCarId))) { setFormError(t('errors.carBusy')); return; }

    // ── Edit ─────────────────────────────────────────────────────────────────
    if (sheet) {
      setSaving(true);

      /**
       * Nothing in the database keeps `replacement_sheets` and `car_calendar` in
       * step — no trigger, no foreign key. The only tie is
       * `replacement_sheets.calendar_block_id` pointing at a `car_calendar` row,
       * and it is this code's job to move both. Miss the second write and the
       * calendar goes on reserving the old car for the old dates, which is
       * exactly how a car ends up handed to two people.
       */
      const carChanged   = String(sheet.replacement_car_id ?? '') !== replacementCarId;
      const datesChanged = sheet.start_date !== startDate || sheet.end_date !== endDate;
      const needsCalendarSync = carChanged || datesChanged;

      const { data: updated, error: updateError } = await supabase
        .from('replacement_sheets')
        .update({
          replacement_car_id: Number(replacementCarId),
          start_date:         startDate,
          end_date:           endDate,
          km_at_handover:     km.trim()   !== '' ? Number(km)  : null,
          fuel_at_handover:   fuel.trim() !== '' ? fuel.trim()  : null,
          notes:              notes.trim() !== '' ? notes.trim() : null,
          // sheet_number, original_booking_id, customer_id and original_car_id
          // are deliberately absent: they identify the sheet, not its contents.
        })
        .eq('id', sheet.id)
        .select(SHEET_SELECT)
        .single();

      if (updateError || !updated) {
        setSaving(false);
        setFormError(t('replacement.errors.saveEdit'));
        return;
      }

      if (needsCalendarSync) {
        if (sheet.calendar_block_id == null) {
          // Nothing forces a sheet to have a block, so say so rather than
          // inventing one — a stray block would reserve a car nobody asked for.
          setSaving(false);
          setFormError(t('replacement.errors.noCalendarBlock'));
          return;
        }

        const { error: calendarError } = await supabase
          .from('car_calendar')
          .update({
            car_id:     Number(replacementCarId),
            start_date: startDate,
            end_date:   endDate,
          })
          .eq('id', sheet.calendar_block_id);

        if (calendarError) {
          // The sheet is already saved, so this is not a failure to undo — it is
          // a split the person has to know about. The modal stays open with the
          // sheet's own fields intact so they can see what is now out of step.
          setSaving(false);
          console.error('[Replacement] calendar sync error:', calendarError.message);
          setFormError(t('replacement.errors.calendarOutOfSync'));
          return;
        }
      }

      setSaving(false);
      rememberCar(Number(replacementCarId));
      onSaved(mapSheetRow(updated as unknown as SheetRowRaw));
      return;
    }

    // ── Create ───────────────────────────────────────────────────────────────
    if (!originalCarId)                  { setFormError(t('replacement.errors.originalCar')); return; }
    if (!selectedBooking)                { setFormError(t('replacement.errors.booking')); return; }
    if (!selectedBooking.customer_id)    { setFormError(t('replacement.errors.noCustomer')); return; }

    setSaving(true);
    setBanAlert(null);

    // A sheet is a new car handed to this person, so a ban stops it like a booking.
    try {
      const ban = await banForExistingCustomer(selectedBooking.customer_id);
      if (ban) { setSaving(false); setBanAlert(ban); return; }
    } catch {
      setSaving(false);
      setFormError(t('customerStep.errors.checkFailed'));
      return;
    }

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
      setFormError(isCarBusyError(blockError?.message) ? t('errors.carBusy') : t('replacement.errors.blockCalendar'));
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
      setFormError(t('replacement.errors.saveSheet'));
      return;
    }

    setSaving(false);
    rememberCar(Number(replacementCarId));
    onSaved(mapSheetRow(sheetData as unknown as SheetRowRaw));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    try {
      await save();
    } catch {
      setFormError(t('replacement.errors.saveSheet'));
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  const shortDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' });
  const dateSpan = startDate && endDate ? t('range.span', { start: shortDate(startDate), end: shortDate(endDate) }) : '—';
  const days = rentalDays(startDate, endDate);
  const summaryRows = [
    { label: t('summary.car'), value: replacementCar ? <PlateChip plate={replacementCar.plate_number} /> : '—' },
    { label: t('summary.dates'), value: dateSpan },
    { label: t('summary.days'), value: days || '—' },
    { label: t('summary.customer'), value: (isEdit ? sheet?.customer_name : selectedBooking?.customer_name) || '—' },
  ];

  const dirty = isEdit
    ? String(sheet?.replacement_car_id ?? '') !== replacementCarId || sheet?.start_date !== startDate || sheet?.end_date !== endDate
      || (sheet?.km_at_handover != null ? String(sheet.km_at_handover) : '') !== km || (sheet?.fuel_at_handover ?? '') !== fuel || (sheet?.notes ?? '') !== notes
    : !!originalCarId || !!replacementCarId || !!km || !!fuel || !!notes;

  const bookingRow = (booking: CarBookingOption, onClick: () => void, chosen = false) => (
    <button key={booking.id} type="button" disabled={booking.customer_banned} onClick={onClick} className={`hc-booking-row ${chosen ? 'is-chosen' : ''}`}>
      <span aria-hidden="true" className="hc-cust-avatar">{initialsOf(booking.customer_name) || '?'}</span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span dir="auto" className="truncate text-sm font-semibold text-[#0f1117]">{booking.customer_name}</span>
          {booking.customer_banned && <BannedBadge />}
        </span>
        <span className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-gray-500">
          <span className="hc-num">{booking.booking_number ?? `#${booking.id}`}</span>
          <span>{t('range.span', { start: formatDateDisplay(booking.start_date, dateLocale), end: formatDateDisplay(booking.end_date, dateLocale) })}</span>
        </span>
      </span>
      {chosen && <span className="shrink-0 text-[13px] font-bold text-[var(--accent-strong)]">{t('replacement.changeBooking')}</span>}
    </button>
  );

  return (
    <BookingSheet
      title={isEdit ? t('replacement.editTitle') : t('replacementCarButton')}
      subtitle={isEdit ? t('replacement.editSubtitle', { number: sheet?.sheet_number ?? '—' }) : t('replacement.subtitle')}
      summary={replacementCarId || selectedBooking || isEdit ? <SummaryBar rows={summaryRows} headline={summaryRows[1]} /> : undefined}
      alerts={banAlert || formError ? <>{banAlert && <BanAlert ban={banAlert} />}<FormError>{formError}</FormError></> : undefined}
      dirty={dirty}
      busy={saving}
      onClose={onClose}
      onSubmit={handleSubmit}
      closeRef={closeRef}
      footer={(
        <>
          <Button variant="secondary" disabled={saving} onClick={() => closeRef.current?.()}>{tc('actions.cancel')}</Button>
          <Button type="submit" className="hc-bs-primary" disabled={saving || noBookings}>
            {saving ? tc('actions.saving') : isEdit ? t('replacement.saveChanges') : t('replacement.createPrint')}
          </Button>
        </>
      )}
    >
      <FormCard icon={ICONS.car} title={t('replacement.originalVehicle')}>
        <Field label={t('replacement.originalCar')} required={!isEdit} wide>
          {isEdit ? (
            <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1">
              {sheet?.original_plate ? <PlateChip plate={sheet.original_plate} /> : '—'}
              {sheet?.original_model && <span className="text-sm text-gray-600">{sheet.original_model}</span>}
            </div>
          ) : (
            <CarPicker
              labelId={originalLabelId}
              cars={carsLoading ? null : cars}
              failed={carsFailed}
              onRetry={() => setCarsAttempt(attempt => attempt + 1)}
              recent={recentCars}
              value={originalCarId ? Number(originalCarId) : null}
              onChange={id => setOriginalCarId(id == null ? '' : String(id))}
              disabled={saving}
            />
          )}
        </Field>

        <Field label={t('replacement.originalBooking')} required={!isEdit} wide>
          {isEdit ? (
            <p dir="auto" className="text-sm text-gray-600">
              {sheet?.customer_name || '—'}{sheet?.original_booking_number ? ` · ${sheet.original_booking_number}` : ''}
            </p>
          ) : !originalCarId ? (
            <p className="text-[13px] text-gray-500">{t('replacement.pickPlateFirst')}</p>
          ) : bookingsLoading ? (
            <p role="status" className="text-[13px] text-gray-500">{t('replacement.loadingBookings')}</p>
          ) : selectedBooking ? (
            bookingRow(selectedBooking, () => setBookingId(''), true)
          ) : carBookings.length > 0 ? (
            <div role="group" aria-label={t('replacement.pickBooking')} className="hc-booking-rows">
              {carBookings.map(booking => bookingRow(booking, () => setBookingId(String(booking.id))))}
            </div>
          ) : (
            <FormNote>{t('replacement.noBookingsHint')}</FormNote>
          )}
        </Field>
      </FormCard>

      <FormCard icon={ICONS.swap} title={t('replacement.replacementVehicle')}>
        <Field label={t('replacement.replacementCar')} required wide>
          <CarPicker
            labelId={replacementLabelId}
            cars={carsLoading ? null : cars}
            failed={carsFailed}
            onRetry={() => setCarsAttempt(attempt => attempt + 1)}
            recent={recentCars}
            value={replacementCarId ? Number(replacementCarId) : null}
            onChange={carWarning.choose}
            disabled={saving}
            busy={busy}
            showAvailability={!!busy}
            warned={carWarning.warned}
          />
          {availabilityFailed && <FormNote>{t('carBusy.checkFailed')}</FormNote>}
          {sameCarWarn && <FormNote>{t('replacement.sameCarWarn')}</FormNote>}
          {nonParkWarn && !sameCarWarn && replacementCar?.status && (
            <FormNote>
              <Trans
                t={t}
                i18nKey="replacement.notParking"
                values={{ status: t(AVAILABILITY_LABEL_KEY[replacementCar.status]) }}
                components={[<strong />]}
              />
            </FormNote>
          )}
        </Field>
      </FormCard>

      <FormCard icon={ICONS.calendar} title={t('replacement.dates')}>
        <Field label={`${t('replacement.handoverDate')} · ${t('replacement.returnDate')}`} required wide>
          <DateRangePicker
            label={t('replacement.dates')}
            locale={dateLocale}
            start={startDate}
            end={endDate}
            onChange={(start, end) => { setStartDate(start); setEndDate(end); }}
          />
        </Field>
      </FormCard>

      <FormCard icon={ICONS.gauge} title={t('replacement.handover')}>
        <Field label={t('replacement.kmAtHandover')}>
          <input className="hc-input" type="number" inputMode="numeric" min="0" step="1" dir="ltr" placeholder={t('replacement.kmPlaceholder')} value={km} onChange={e => setKm(e.target.value)} />
        </Field>
        <Field label={fuelRange.label}>
          <FuelRangeInput className="hc-input" dir="ltr" aria-label={fuelRange.label} value={fuel} onChange={setFuel} />
        </Field>
      </FormCard>

      <FormCard icon={ICONS.note} title={tc('fields.notes')}>
        <Field label={tc('fields.notes')} wide>
          <textarea className="hc-input" rows={2} placeholder={t('replacement.notesPlaceholder')} value={notes} onChange={e => setNotes(e.target.value)} />
        </Field>
      </FormCard>

      <span id={originalLabelId} hidden>{t('replacement.originalCar')}</span>
      <span id={replacementLabelId} hidden>{t('replacement.replacementCar')}</span>
      {carWarning.dialog}
    </BookingSheet>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

const BOOKING_SELECT = `
  id, booking_number, status, car_id, customer_id,
  start_date, end_date, kabis_reported, invoice_issued,
  pickup_location, dropoff_location, km_at_delivery, fuel_at_delivery,
  insurance_type, notes, additional_services,
  cars(plate_number, model_group(name)),
  customers(first_name, last_name, is_banned, ban_reason)
`;

const BookingsPage: React.FC = () => {
  const { t: tf } = useTranslation('finance');
  const { t } = useTranslation('bookings');
  const { t: tc } = useTranslation('common');
  const dateLocale = useDateLocale();
  const [urlParams, setUrlParams] = useSearchParams();
  const today = istanbulDate();
  const monthKey = readMonth(urlParams.get('month'));
  const selectedMonth = useMemo(() => {
    const [year, month] = monthKey.split('-').map(Number);
    return new Date(year, month - 1, 1);
  }, [monthKey]);
  const tab = readTab(urlParams.get('tab'));
  const [tileFilter, setTileFilter] = useTileFilter<string>(TAB_FILTERS[tab]);
  const [bookings, setBookings]           = useState<Booking[]>([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);
  const [search, setSearch]               = useState('');
  useUrlSearch(setSearch);
  const [statusFilter, setStatusFilter]   = useState<BookingStatus | ''>('');
  const [extensions, setExtensions]       = useState<BookingExtension[]>([]);
  const [extLoading, setExtLoading]       = useState(true);
  const [extFailed, setExtFailed]         = useState(false);
  const latestExtensions                  = useRef(0);
  const [sort, setSort]                   = useState<{ col: SortCol; dir: SortDir }>({ col: null, dir: 'asc' });
  const [selectedIds, setSelectedIds]     = useState<Set<number>>(new Set());
  const [modal, setModal]                 = useState<null | 'add' | { mode: 'edit'; booking: Booking; atFinance?: boolean }>(null);
  const [extendTarget, setExtendTarget]    = useState<Booking | null>(null);
  const [editingSheet, setEditingSheet]    = useState<ReplacementSheetRecord | null>(null);

  const [replacementOpen, setReplacementOpen] = useState(false);
  const [sheets, setSheets]               = useState<ReplacementSheetRecord[]>([]);
  const [sheetsLoading, setSheetsLoading] = useState(true);
  const [sheetsFailed, setSheetsFailed]   = useState(false);
  const [toast, setToast]                 = useState<ToastState | null>(null);
  const toastTimer                        = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const [paymentReceipts, setPaymentReceipts] = useState<PaymentReceipt[]>([]);
  // The toast outlives the one the save shows, so this one is what stays on screen.
  const afterPayment = useCallback((receipts: PaymentReceipt[], failure: string | null) => {
    if (receipts.length > 0) setPaymentReceipts(receipts);
    if (failure) {
      const message = failure === 'generic' ? tf('payment.errors.notRecorded') : `${tf('payment.errors.notRecorded')} ${tf(`payment.errors.${failure}`)}`;
      window.setTimeout(() => showToast(message, 'error'), 0);
    }
  }, [showToast, tf]);

  const afterRentalFailure = useCallback(() => {
    window.setTimeout(() => showToast(t('errors.rentalNotSaved'), 'error'), 0);
  }, [showToast, t]);

  // ── Fetch bookings ──────────────────────────────────────────────────────────
  const fetchBookings = useCallback(async (month: Date) => {
    setLoading(true);
    setError(null);
    setSelectedIds(new Set());

    const { data, error: fetchError } = await supabase
      .from('bookings')
      .select(BOOKING_SELECT)
      .gte('start_date', toDateStr(getMonthStart(month)))
      .lte('start_date', toDateStr(getMonthEnd(month)))
      .order('created_at', { ascending: false });

    setLoading(false);
    if (fetchError) { setError(fetchError.message); return; }
    setBookings(((data ?? []) as unknown as BookingRow[]).map(resolveBooking));
  }, []);

  const fetchExtensions = useCallback(async (month: string) => {
    const request = ++latestExtensions.current;
    setExtLoading(true);
    setExtFailed(false);
    try {
      const rows = await getBookingExtensions(month);
      if (request === latestExtensions.current) setExtensions(rows);
    } catch {
      if (request === latestExtensions.current) setExtFailed(true);
    } finally {
      if (request === latestExtensions.current) setExtLoading(false);
    }
  }, []);

  // The booking may start in another month from the one on screen.
  const openBooking = useCallback(async (id: number, atFinance = false) => {
    const known = bookings.find(item => item.id === id);
    if (known) { setModal({ mode: 'edit', booking: known, atFinance }); return; }
    const { data, error: readError } = await supabase.from('bookings').select(BOOKING_SELECT).eq('id', id).maybeSingle();
    if (readError || !data) { showToast(t('extensions.openFailed'), 'error'); return; }
    setModal({ mode: 'edit', booking: resolveBooking(data as unknown as BookingRow), atFinance });
  }, [bookings, showToast, t]);

  // Sent here to fix a detail on a booking, as from Pending Invoices.
  const urlEdit = urlParams.get('edit');
  useEffect(() => {
    if (!urlEdit || !/^\d+$/.test(urlEdit) || loading) return;
    void openBooking(Number(urlEdit));
    setUrlParams(current => {
      const next = new URLSearchParams(current);
      next.delete('edit');
      return next;
    }, { replace: true });
  }, [urlEdit, loading, openBooking, setUrlParams]);

  useEffect(() => {
    fetchBookings(selectedMonth);
    fetchExtensions(monthKey);
  }, [selectedMonth, monthKey, fetchBookings, fetchExtensions]);

  const refreshAfterChange = useCallback(() => {
    fetchBookings(selectedMonth);
    fetchExtensions(monthKey);
  }, [fetchBookings, fetchExtensions, selectedMonth, monthKey]);

  // ── Fetch replacement sheets (all of them: the page narrows them to the month) ──
  const fetchSheets = useCallback(async () => {
    setSheetsLoading(true);
    setSheetsFailed(false);
    const { data, error: sheetsError } = await supabase
      .from('replacement_sheets')
      .select(SHEET_SELECT)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    setSheetsLoading(false);
    if (sheetsError) { setSheetsFailed(true); return; }
    setSheets(((data ?? []) as unknown as SheetRowRaw[]).map(mapSheetRow));
  }, []);

  useEffect(() => { fetchSheets(); }, [fetchSheets]);

  // ── Filter + sort ───────────────────────────────────────────────────────────
  // The tiles count what the search and status leave, so a tile's number is what pressing it shows.
  const scopedBookings = useMemo(() => bookings.filter(item => bookingMatches(item, search) && (!statusFilter || item.status === statusFilter)), [bookings, search, statusFilter]);
  const tiles = useMemo(() => bookingTiles(scopedBookings, today), [scopedBookings, today]);
  const filtered = useMemo(
    () => scopedBookings.filter(item => bookingInFilter(item, tab === 'bookings' ? tileFilter as BookingFilter | 'all' : 'all')),
    [scopedBookings, tab, tileFilter],
  );

  const datedExtensions = useMemo(() => extensions.filter(hasPeriod), [extensions]);
  const matchingExtensions = useMemo(() => extensions.filter(item => extensionMatches(item, search) && (!statusFilter || item.booking_status === statusFilter)), [extensions, search, statusFilter]);
  const scopedExtensions = useMemo(() => matchingExtensions.filter(hasPeriod), [matchingExtensions]);
  const undatedExtensions = matchingExtensions.length - scopedExtensions.length;
  const extTiles = useMemo(() => extensionTiles(scopedExtensions), [scopedExtensions]);
  // Undated rows aren't counted, but the money in them stays on the page, last.
  const shownExtensions = useMemo(() => {
    if (tab === 'extensions' && tileFilter === 'zero') return scopedExtensions.filter(item => item.rental_amount === 0);
    return [...scopedExtensions, ...matchingExtensions.filter(item => !hasPeriod(item))];
  }, [matchingExtensions, scopedExtensions, tab, tileFilter]);

  const monthSheets = useMemo(() => sheets.filter(item => sheetInMonth(item, monthKey)), [sheets, monthKey]);
  const scopedSheets = useMemo(() => monthSheets.filter(item => sheetMatches(item, search)), [monthSheets, search]);
  const openSheets = useMemo(() => scopedSheets.filter(item => isOpenSheet(item, today)).length, [scopedSheets, today]);
  const shownSheets = useMemo(() => {
    if (tab !== 'replacements' || tileFilter === 'all') return scopedSheets;
    return scopedSheets.filter(item => isOpenSheet(item, today) === (tileFilter === 'open'));
  }, [scopedSheets, tab, tileFilter, today]);

  const goToMonth = (by: number) => setUrlParams(current => {
    const next = new URLSearchParams(current);
    next.set('month', shiftMonth(monthKey, by));
    return next;
  }, { replace: true });

  // A tile from one tab means nothing on another, so only the month carries over.
  const goToTab = (next: BookingTab) => {
    setSearch('');
    setStatusFilter('');
    setSelectedIds(new Set());
    setUrlParams(current => {
      const params = new URLSearchParams(current);
      params.set('tab', next);
      params.set('month', monthKey);
      params.delete('filter');
      return params;
    }, { replace: true });
  };

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

  const sortHeader = (col: Exclude<SortCol, null>, label: string) => (
    <button type="button" className="hc-bk-sort" onClick={() => handleSort(col)}>
      {label}
      <span aria-hidden="true" className={sort.col === col ? 'is-on' : undefined}>{sort.col !== col ? '↕' : sort.dir === 'asc' ? '↑' : '↓'}</span>
    </button>
  );

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
    const month = formatMonthLabel(selectedMonth, 'en-GB').replace(' ', '-').toLowerCase();
    if (tab === 'extensions') { downloadCsv(`extensions-${month}`, extensionCsvRows(shownExtensions)); return; }
    if (tab === 'replacements') { downloadCsv(`replacement-sheets-${month}`, sheetCsvRows(shownSheets, today)); return; }
    // English on purpose — a CSV is opened in a spreadsheet, and its columns
    // are what any saved filter or formula keys on.
    downloadCsv(`bookings-${month}`, [
      ['Booking #', 'Status', 'Car', 'Plate', 'Customer', 'Start Date', 'End Date', 'Kabis', 'Invoice'],
      ...sorted.map(b => [
        b.booking_number, b.status, b.car_model, b.plate_number, b.customer_name,
        b.start_date, b.end_date,
        b.kabis_reported ? 'Yes' : 'No',
        b.invoice_issued ? 'Yes' : 'No',
      ]),
    ]);
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
    fin_currency: 'TRY', fin_rental_amount: '',
  });

  const num = (loaded: boolean, text: string | number) => (loaded ? null : String(text));
  const emptyFiltered = search || statusFilter || tileFilter !== 'all';

  return (
    <div className="hc-bk">
      <header className="hc-bk-head">
        <div>
          <h1>{t('title')}</h1>
          <p>{t('subtitle')}</p>
        </div>
        <div className="hc-bk-head-actions">
          <Button variant="secondary" onClick={() => setReplacementOpen(true)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M17 2l4 4-4 4M21 6H9M7 22l-4-4 4-4M3 18h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {t('replacementCarButton')}
          </Button>
          <Button onClick={() => setModal('add')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
            </svg>
            {t('addNewBooking')}
          </Button>
        </div>
      </header>

      <div className="hc-bk-bar">
        <BookingTabsBar
          tab={tab}
          onChange={goToTab}
          counts={{ bookings: loading ? null : bookings.length, extensions: extLoading ? null : datedExtensions.length, replacements: sheetsLoading ? null : monthSheets.length }}
        />
        <MonthSwitcher label={formatMonthLabel(selectedMonth, dateLocale)} prevLabel={t('months.prev')} nextLabel={t('months.next')} onPrev={() => goToMonth(-1)} onNext={() => goToMonth(1)} />
      </div>

      {tab === 'bookings' && (
        <div className="hc-tiles hc-tiles-filter hc-bk-tiles">
          <StatTile tone="balance" art={<Icon3D name="total" className="hc-tile-art" />} label={t('tiles.total')} sub={t('tiles.totalSub')} value={num(loading, tiles.total)} pressed={tileFilter === 'all'} onPress={() => setTileFilter('all')} />
          <StatTile tone="received" art={<Icon3D name="confirmed" className="hc-tile-art" />} label={t('tiles.confirmed')} sub={t('tiles.confirmedSub', { n: tiles.activeNow })} value={num(loading, tiles.confirmed)} pressed={tileFilter === 'confirmed'} onPress={() => setTileFilter('confirmed')} />
          <StatTile tone="warn" art={<Icon3D name="pending" className="hc-tile-art" />} label={t('tiles.pending')} sub={t('tiles.pendingSub')} value={num(loading, tiles.pending)} pressed={tileFilter === 'pending'} onPress={() => setTileFilter('pending')} />
          <StatTile tone="paid" art={<Icon3D name="completed" className="hc-tile-art" />} label={t('tiles.completed')} sub={t('tiles.completedSub')} value={num(loading, tiles.completed)} pressed={tileFilter === 'completed'} onPress={() => setTileFilter('completed')} />
        </div>
      )}
      {tab === 'extensions' && (
        <div className="hc-tiles hc-tiles-filter hc-bk-tiles hc-bk-tiles-money">
          <StatTile tone="balance" art={<Icon3D name="total" className="hc-tile-art" />} label={t('tiles.extCount')} sub={undatedExtensions > 0 ? t('tiles.extCountUndated', { n: undatedExtensions }) : t('tiles.extCountSub')} value={num(extLoading, extTiles.count)} pressed={tileFilter === 'all'} onPress={() => setTileFilter('all')} />
          <StatTile tone="balance" art={<HomeArt name="wallet" className="hc-tile-art" />} label={t('tiles.extValue')} sub={t('tiles.extValueSub')} value={num(extLoading, formatLira(extTiles.value, 'TRY'))} />
          <StatTile tone="warn" art={<Icon3D name="pending" className="hc-tile-art" />} label={t('tiles.extAvg')} sub={t('tiles.extAvgSub')} value={num(extLoading, extTiles.avgDays ?? '—')} />
          <StatTile tone="warn" art={<ComplianceTriangle severity="missing" size={40} className="hc-tile-art" />} label={t('tiles.extZero')} sub={t('tiles.extZeroSub')} value={num(extLoading, extTiles.zero)} pressed={tileFilter === 'zero'} onPress={() => setTileFilter('zero')} />
        </div>
      )}
      {tab === 'replacements' && (
        <div className="hc-tiles hc-tiles-filter hc-bk-tiles">
          <StatTile tone="balance" art={<Icon3D name="total" className="hc-tile-art" />} label={t('tiles.sheetTotal')} sub={t('tiles.sheetTotalSub')} value={num(sheetsLoading, scopedSheets.length)} pressed={tileFilter === 'all'} onPress={() => setTileFilter('all')} />
          <StatTile tone="warn" art={<Icon3D name="pending" className="hc-tile-art" />} label={t('tiles.sheetOpen')} sub={t('tiles.sheetOpenSub')} value={num(sheetsLoading, openSheets)} pressed={tileFilter === 'open'} onPress={() => setTileFilter('open')} />
          <StatTile tone="paid" art={<Icon3D name="completed" className="hc-tile-art" />} label={t('tiles.sheetClosed')} sub={t('tiles.sheetClosedSub')} value={num(sheetsLoading, scopedSheets.length - openSheets)} pressed={tileFilter === 'closed'} onPress={() => setTileFilter('closed')} />
        </div>
      )}

      <div className="hc-bk-tools">
        <input
          type="search"
          className="hc-input !mt-0"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t(tab === 'bookings' ? 'filters.search' : tab === 'extensions' ? 'filters.searchExtensions' : 'filters.searchSheets')}
          aria-label={t(tab === 'bookings' ? 'filters.search' : tab === 'extensions' ? 'filters.searchExtensions' : 'filters.searchSheets')}
        />
        {tab !== 'replacements' && (
          <select className="hc-input !mt-0" aria-label={tc('filterBar.status')} value={statusFilter} onChange={e => setStatusFilter(e.target.value as BookingStatus | '')}>
            <option value="">{t('filters.allStatuses')}</option>
            {tab === 'bookings' && <option value="pending">{t('status.pending')}</option>}
            <option value="confirmed">{t('status.confirmed')}</option>
            <option value="completed">{t('status.completed')}</option>
            {tab === 'bookings' && <option value="cancelled">{t('status.cancelled')}</option>}
          </select>
        )}
        <Button variant="secondary" onClick={handleExport}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {t('export')}
        </Button>
      </div>

      {tab === 'bookings' && (
        <>
          {error && <p role="alert" className="hc-bk-state surface-depth">{t('loadError')}{error}</p>}
          <div className="hc-cash-table hc-bk-table hc-bk-main surface-depth">
            <table>
              <thead>
                <tr>
                  <th><input type="checkbox" className="hc-appr-check" aria-label={t('table.selectAll')} checked={allSelected} ref={el => { if (el) el.indeterminate = someSelected; }} onChange={toggleSelectAll} /></th>
                  <th>{sortHeader('booking_number', t('table.bookingNumberShort'))}</th>
                  <th>{tc('fields.car')}</th>
                  <th>{tc('fields.customer')}</th>
                  <th><span className="hc-bk-sorts">{sortHeader('start_date', t('table.start'))}{sortHeader('end_date', t('table.end'))}</span></th>
                  <th>{t('table.kabis')}</th>
                  <th>{t('table.invoice')}</th>
                  <th aria-label={t('table.actions')} />
                </tr>
              </thead>
              <tbody>
                {loading && Array.from({ length: 7 }).map((_, index) => <SkeletonRow key={index} />)}
                {!loading && sorted.map(booking => (
                  <BookingTableRow
                    key={booking.id}
                    booking={booking}
                    today={today}
                    isSelected={selectedIds.has(booking.id)}
                    onSelect={() => toggleSelectRow(booking.id)}
                    onToggle={handleToggle}
                    onEdit={() => setModal({ mode: 'edit', booking })}
                    onPrint={() => printBookingContract(booking)}
                    onExtend={() => setExtendTarget(booking)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {!loading && sorted.length === 0 && !error && <p className="hc-bk-state surface-depth">{emptyFiltered ? t('table.empty') : t('table.emptyMonth')}</p>}
          {!loading && (
            <p className="hc-bk-count">
              {t('table.showing', { shown: sorted.length, total: bookings.length })}
              {selectedIds.size > 0 && <strong>{t('table.selected', { n: selectedIds.size })}</strong>}
            </p>
          )}
        </>
      )}

      {tab === 'extensions' && (extFailed ? (
        <div className="hc-bk-state surface-depth">
          <p role="alert">{t('extensions.loadFailed')}</p>
          <Button variant="secondary" onClick={() => fetchExtensions(monthKey)}>{t('extensions.retry')}</Button>
        </div>
      ) : extLoading ? (
        <p role="status" className="hc-bk-state surface-depth">{t('extensions.loading')}</p>
      ) : shownExtensions.length === 0 ? (
        <p className="hc-bk-state surface-depth">{emptyFiltered ? t('extensions.noMatch') : t('extensions.emptyMonth')}</p>
      ) : <ExtensionsList rows={shownExtensions} onOpen={row => void openBooking(row.booking_id, true)} />)}

      {tab === 'replacements' && (sheetsFailed ? (
        <div className="hc-bk-state surface-depth">
          <p role="alert">{t('extensions.loadFailed')}</p>
          <Button variant="secondary" onClick={() => void fetchSheets()}>{t('extensions.retry')}</Button>
        </div>
      ) : sheetsLoading ? (
        <p role="status" className="hc-bk-state surface-depth">{t('loadingSheets')}</p>
      ) : shownSheets.length === 0 ? (
        <p className="hc-bk-state surface-depth">{emptyFiltered ? t('table.empty') : t('noSheetsMonth')}</p>
      ) : <ReplacementsList rows={shownSheets} today={today} onEdit={setEditingSheet} onPrint={printReplacementSheet} />)}

      {/* ── Modals ── */}
      {extendTarget && (
        <ExtendBookingModal
          booking={extendTarget}
          onClose={() => setExtendTarget(null)}
          onExtended={(newEndDate, newBalance, noteSaved, receipts, paymentFailure) => {
            setExtendTarget(null);
            afterPayment(receipts, paymentFailure);
            const done = newBalance == null
              ? t('extend.toast.done', { date: newEndDate })
              : t('extend.toast.doneWithBalance', {
                  date: newEndDate,
                  balance: newBalance.toLocaleString('en-US', {
                    minimumFractionDigits: 2, maximumFractionDigits: 2,
                  }),
                });
            showToast(noteSaved ? done : `${done} · ${t('extend.toast.noteFailed')}`, 'success');
            // The function moved end_date and forced status to confirmed, and there is
            // a new extension, so all of it is stale until refetched.
            refreshAfterChange();
          }}
        />
      )}
      {editingSheet && (
        <ReplacementFormModal
          sheet={editingSheet}
          onClose={() => setEditingSheet(null)}
          onSaved={updated => {
            setEditingSheet(null);
            showToast(t('toast.updated'), 'success');
            fetchSheets();
            // Reprinting is not implied by an edit — the person may only have
            // been correcting a note. They can reprint from the row.
            void updated;
          }}
        />
      )}
      {replacementOpen && (
        <ReplacementFormModal
          onClose={() => setReplacementOpen(false)}
          onSaved={sheet => {
            showToast(t('replacement.created', { number: sheet.sheet_number }), 'success');
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
          onPaid={afterPayment}
          onRentalFailed={afterRentalFailure}
          onSaved={() => {
            showToast(t('toast.added'), 'success');
            refreshAfterChange();
          }}
        />
      )}
      {modal !== null && modal !== 'add' && (
        <BookingFormModal
          mode="edit"
          initial={editFormData(modal.booking)}
          editId={modal.booking.id}
          editCustomerId={modal.booking.customer_id}
          openAtFinance={modal.atFinance}
          onClose={() => setModal(null)}
          onPaid={afterPayment}
          onRentalFailed={afterRentalFailure}
          onSaved={() => {
            showToast(t('toast.updated'), 'success');
            refreshAfterChange();
          }}
        />
      )}
      {toast && <Toast {...toast} />}
      {paymentReceipts.length > 0 && <PaymentReceipts receipts={paymentReceipts} onClose={() => setPaymentReceipts([])} />}

    </div>
  );
};

export default BookingsPage;
