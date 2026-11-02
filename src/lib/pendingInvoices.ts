import { istanbulDate } from './istanbulTime';

export const INVOICE_FILTERS = ['ready', 'missing'] as const;
export type InvoiceFilter = typeof INVOICE_FILTERS[number];

export const ALL_MONTHS = 'all';

export interface InvoiceLine {
  type: string;
  description: string | null;
  amount: number;
  date: string;
}

export interface PendingInvoice {
  booking_id: number;
  booking_number: string;
  start_date: string;
  end_date: string;
  days: number;
  plate: string | null;
  car_brand: string | null;
  car_model: string | null;
  customer_id: string | null;
  customer_name: string;
  nationality: string | null;
  id_type: string | null;
  id_number: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  birth_date: string | null;
  rental_total: number;
  extras_total: number;
  invoice_total: number;
  net_amount: number;
  vat_amount: number;
  paid_total: number;
  lines: InvoiceLine[];
  invoice_text: string;
}

export const currentMonth = (now: Date = new Date()): string => istanbulDate(now).slice(0, 7);

export function readMonth(param: string | null, now?: Date): string {
  if (param === ALL_MONTHS) return ALL_MONTHS;
  return param && /^\d{4}-(0[1-9]|1[0-2])$/.test(param) ? param : currentMonth(now);
}

export function shiftMonth(month: string, by: number): string {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number - 1 + by, 1)).toISOString().slice(0, 7);
}

export function invoiceMatches(invoice: Pick<PendingInvoice, 'customer_name' | 'plate' | 'booking_number' | 'id_number'>, query: string): boolean {
  const text = query.trim().toLowerCase();
  if (!text) return true;
  const plateText = text.replace(/\s/g, '');
  return [invoice.customer_name, invoice.booking_number, invoice.id_number].some(value => (value ?? '').toLowerCase().includes(text))
    || (invoice.plate ?? '').toLowerCase().includes(plateText);
}

export const isMissingAmount = (invoice: Pick<PendingInvoice, 'invoice_total'>): boolean => invoice.invoice_total === 0;

/** There is something to invoice, but only fuel or a car wash: the rental itself is gone. */
export const hasNoRental = (invoice: Pick<PendingInvoice, 'rental_total' | 'invoice_total'>): boolean =>
  invoice.rental_total <= 0 && invoice.invoice_total > 0;

export const inMonth = (invoice: Pick<PendingInvoice, 'end_date'>, month: string): boolean =>
  month === ALL_MONTHS || invoice.end_date.startsWith(month);

/** Descriptions can carry an internal `‹op:598›` marker, and a line without one has only its type. */
export function lineLabel(line: Pick<InvoiceLine, 'type' | 'description'>): string {
  const description = (line.description ?? '').replace(/‹[^›]*›/g, '').trim();
  if (description) return description;
  const type = line.type.replace(/_/g, ' ').trim();
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export const inInvoiceFilter = (invoice: Pick<PendingInvoice, 'invoice_total'>, filter: InvoiceFilter | 'all'): boolean =>
  filter === 'all' || (filter === 'missing') === isMissingAmount(invoice);

const cents = (value: number) => Math.round(value * 100) / 100;

export function invoiceTotals(rows: Pick<PendingInvoice, 'invoice_total' | 'net_amount' | 'vat_amount'>[]) {
  return {
    count: rows.length,
    total: cents(rows.reduce((sum, row) => sum + row.invoice_total, 0)),
    net: cents(rows.reduce((sum, row) => sum + row.net_amount, 0)),
    vat: cents(rows.reduce((sum, row) => sum + row.vat_amount, 0)),
    missing: rows.filter(isMissingAmount).length,
  };
}

/** The total nets off rental credits, which `lines` leaves out, so the two can disagree. */
export const linesTotal = (invoice: Pick<PendingInvoice, 'lines'>): number =>
  cents(invoice.lines.reduce((sum, line) => sum + line.amount, 0));

export const linesDisagree = (invoice: Pick<PendingInvoice, 'lines' | 'invoice_total'>): boolean =>
  Math.abs(linesTotal(invoice) - invoice.invoice_total) > 0.01;

/** The column arrives in both cases. */
export function idTypeKey(value: string | null): 'passport' | 'nationalId' | null {
  if (/pass/i.test(value ?? '')) return 'passport';
  if (/national/i.test(value ?? '')) return 'nationalId';
  return null;
}

/** The form the e-Fatura portal and the invoice text both use. */
export const dottedDate = (date: string | null): string => (date ? date.split('-').reverse().join('.') : '');

const carName = (invoice: Pick<PendingInvoice, 'car_brand' | 'car_model'>) => [invoice.car_brand, invoice.car_model].filter(Boolean).join(' ');

/** Tabs and line ends, so it pastes into a spreadsheet as cells. */
export function invoiceTable(rows: [string, string | number | null][]): string {
  return rows.map(([label, value]) => `${label}\t${String(value ?? '').replace(/\s+/g, ' ')}`).join('\n');
}

const describeLine = (line: InvoiceLine) => `${line.date} ${lineLabel(line)}: ${line.amount.toFixed(2)}`;

export function invoiceCsvRows(rows: PendingInvoice[]): (string | number | null)[][] {
  return [
    ['booking_id', 'booking_number', 'start_date', 'end_date', 'days', 'plate', 'car_brand', 'car_model', 'customer_id', 'customer_name', 'nationality', 'id_type', 'id_number', 'phone', 'email', 'address', 'birth_date', 'rental_total', 'extras_total', 'invoice_total', 'net_amount', 'vat_amount', 'paid_total', 'lines', 'invoice_text'],
    ...rows.map(row => [
      row.booking_id, row.booking_number, row.start_date, row.end_date, row.days, row.plate, row.car_brand, row.car_model, row.customer_id, row.customer_name,
      row.nationality, row.id_type, row.id_number, row.phone, row.email, row.address, row.birth_date, row.rental_total, row.extras_total, row.invoice_total,
      row.net_amount, row.vat_amount, row.paid_total, row.lines.map(describeLine).join(' | '), row.invoice_text,
    ]),
  ];
}

export { carName };
