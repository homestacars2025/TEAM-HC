import { rentalDays } from './bookingDates';

export const BOOKING_TABS = ['bookings', 'extensions', 'replacements'] as const;
export type BookingTab = typeof BOOKING_TABS[number];

export const readTab = (param: string | null): BookingTab =>
  (BOOKING_TABS as readonly string[]).includes(param ?? '') ? param as BookingTab : 'bookings';

export const TAB_FILTERS = {
  bookings: ['confirmed', 'pending', 'completed'],
  extensions: ['zero'],
  replacements: ['open', 'closed'],
} as const;

export type BookingFilter = typeof TAB_FILTERS.bookings[number];

interface BookingFacts {
  status: string;
  start_date: string;
  end_date: string;
}

const day = (value: string) => value.slice(0, 10);

export const isActiveNow = (booking: Pick<BookingFacts, 'status' | 'start_date' | 'end_date'>, today: string): boolean =>
  booking.status === 'confirmed' && day(booking.start_date) <= today && today <= day(booking.end_date);

export const bookingInFilter = (booking: Pick<BookingFacts, 'status'>, filter: BookingFilter | 'all'): boolean =>
  filter === 'all' || booking.status === filter;

export function bookingTiles(bookings: BookingFacts[], today: string) {
  return {
    total: bookings.length,
    confirmed: bookings.filter(item => item.status === 'confirmed').length,
    activeNow: bookings.filter(item => isActiveNow(item, today)).length,
    pending: bookings.filter(item => item.status === 'pending').length,
    completed: bookings.filter(item => item.status === 'completed').length,
  };
}

/** How far through its days an active booking is, from 0 to 1. */
export function tripProgress(booking: Pick<BookingFacts, 'start_date' | 'end_date'>, today: string): number {
  const span = rentalDays(day(booking.start_date), day(booking.end_date));
  const gone = (Date.parse(today) - Date.parse(day(booking.start_date))) / 86_400_000;
  return span > 0 ? Math.min(1, Math.max(0, gone / span)) : 0;
}

export interface BookingExtension {
  event_id: number;
  booking_id: number;
  booking_number: string;
  event_no: number;
  /** Older extensions can have no recorded period. */
  period_start: string | null;
  period_end: string | null;
  days: number | null;
  rental_amount: number;
  created_at: string;
  created_by_name: string | null;
  plate: string | null;
  car_model: string | null;
  customer_id: string | null;
  customer_name: string;
  booking_start: string;
  booking_end: string;
  booking_status: string;
  is_legacy: boolean;
}

/** The month goes by start date, so a row with no recorded period isn't counted in one. */
export const hasPeriod = (row: Pick<BookingExtension, 'period_start'>): boolean => row.period_start !== null;

export function extensionTiles(rows: Pick<BookingExtension, 'rental_amount' | 'days'>[]) {
  const dated = rows.filter(row => row.days !== null);
  return {
    count: rows.length,
    value: Math.round(rows.reduce((sum, row) => sum + row.rental_amount, 0) * 100) / 100,
    avgDays: dated.length ? Math.round((dated.reduce((sum, row) => sum + (row.days as number), 0) / dated.length) * 10) / 10 : null,
    zero: rows.filter(row => row.rental_amount === 0).length,
  };
}

const matches = (query: string, words: (string | null | undefined)[], plates: (string | null | undefined)[]) => {
  const text = query.trim().toLowerCase();
  if (!text) return true;
  const plateText = text.replace(/\s/g, '');
  return words.some(word => (word ?? '').toLowerCase().includes(text)) || plates.some(plate => (plate ?? '').toLowerCase().includes(plateText));
};

export const extensionMatches = (row: Pick<BookingExtension, 'booking_number' | 'customer_name' | 'plate' | 'car_model'>, query: string): boolean =>
  matches(query, [row.booking_number, row.customer_name, row.car_model], [row.plate]);

export const bookingMatches = (row: { booking_number: string; customer_name: string; plate_number: string }, query: string): boolean =>
  matches(query, [row.booking_number, row.customer_name], [row.plate_number]);

export interface SheetRow {
  id: number;
  sheet_number: string;
  customer_name: string;
  customer_banned?: boolean;
  customer_ban_reason?: string | null;
  original_booking_number: string | null;
  original_plate: string | null;
  replacement_plate: string;
  start_date: string;
  end_date: string;
}

export const isOpenSheet = (sheet: Pick<SheetRow, 'end_date'>, today: string): boolean => day(sheet.end_date) >= today;

export const sheetInMonth = (sheet: Pick<SheetRow, 'start_date'>, month: string): boolean => sheet.start_date.startsWith(month);

export const sheetMatches = (sheet: Pick<SheetRow, 'sheet_number' | 'customer_name' | 'original_booking_number' | 'original_plate' | 'replacement_plate'>, query: string): boolean =>
  matches(query, [sheet.sheet_number, sheet.customer_name, sheet.original_booking_number], [sheet.original_plate, sheet.replacement_plate]);

export function extensionCsvRows(rows: BookingExtension[]): (string | number | null)[][] {
  return [
    ['Booking #', 'Extension #', 'Plate', 'Car', 'Customer', 'Period start', 'Period end', 'Days', 'Amount', 'Entered by', 'Entered at', 'Booking status', 'Legacy'],
    ...rows.map(row => [
      row.booking_number, row.event_no, row.plate, row.car_model, row.customer_name, row.period_start, row.period_end, row.days,
      row.rental_amount, row.created_by_name, row.created_at, row.booking_status, row.is_legacy ? 'Yes' : 'No',
    ]),
  ];
}

export function sheetCsvRows(rows: SheetRow[], today: string): (string | number | null)[][] {
  return [
    ['Sheet #', 'Customer', 'Booking #', 'Original plate', 'Replacement plate', 'Start date', 'End date', 'Open'],
    ...rows.map(row => [row.sheet_number, row.customer_name, row.original_booking_number, row.original_plate, row.replacement_plate, row.start_date, row.end_date, isOpenSheet(row, today) ? 'Yes' : 'No']),
  ];
}
