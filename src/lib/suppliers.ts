import { CURRENCY_SYMBOLS } from './CurrencyContext';

export const SUPPLIER_CATEGORIES = ['workshop', 'mechanic', 'body_paint', 'tires', 'car_wash', 'parts', 'glass', 'electric', 'towing', 'insurance', 'notary', 'fuel', 'other'] as const;
export type SupplierCategory = typeof SUPPLIER_CATEGORIES[number];

export const SUPPLIER_CURRENCIES = ['TRY', 'USD', 'EUR'] as const;
export type SupplierCurrency = typeof SUPPLIER_CURRENCIES[number];

export const SUPPLIER_FILTERS = ['owed', 'settled', 'inactive'] as const;
export type SupplierFilter = typeof SUPPLIER_FILTERS[number] | 'all';

export interface Supplier {
  id: number;
  name: string;
  category: SupplierCategory;
  contact_person: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  district: string | null;
  tax_number: string | null;
  iban: string | null;
  bank_name: string | null;
  notes: string | null;
  is_active: boolean;
}

export type SupplierOption = Pick<Supplier, 'id' | 'name' | 'category'>;

/** One currency of one supplier, from `supplier_balances`. Positive means we owe them. */
export interface SupplierBalance {
  supplier_id: number;
  currency: SupplierCurrency;
  total_bills: number;
  total_paid: number;
  balance: number;
  last_tx: string | null;
}

export interface CashAccount {
  id: number;
  name: string;
  currencies: string[];
}

export interface SupplierTx {
  id: number;
  supplier_id: number;
  kind: 'bill' | 'payment';
  tx_date: string;
  amount: number;
  currency: SupplierCurrency;
  car_id: number | null;
  description: string | null;
  receipt_url: string | null;
  paid_from_account_id: number | null;
  custody_expense_id: number | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
  car: { plate_number: string } | null;
  account: { name: string } | null;
}

export interface SupplierTxWithRunning extends SupplierTx {
  /** The balance in this row's currency straight after it. A voided row has none. */
  running: number | null;
}

/** Always the row's own currency, never converted: this is what was billed or paid. */
export function formatMoney(amount: number, currency: SupplierCurrency): string {
  const digits = Math.abs(amount).toLocaleString(currency === 'TRY' ? 'tr-TR' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${amount < 0 ? '−' : ''}${CURRENCY_SYMBOLS[currency]}${digits}`;
}

/** `rows` oldest first. Each currency keeps its own balance, and a voided row moves neither. */
export function withRunning(rows: SupplierTx[]): SupplierTxWithRunning[] {
  const balances = new Map<string, number>();
  return rows.map(row => {
    if (row.voided_at) return { ...row, running: null };
    const next = (balances.get(row.currency) ?? 0) + (row.kind === 'bill' ? row.amount : -row.amount);
    balances.set(row.currency, next);
    return { ...row, running: next };
  });
}

export interface LedgerTotals {
  currency: SupplierCurrency;
  bills: number;
  paid: number;
  balance: number;
}

export function ledgerTotals(rows: SupplierTx[]): LedgerTotals[] {
  return SUPPLIER_CURRENCIES.flatMap(currency => {
    const own = rows.filter(row => row.currency === currency && !row.voided_at);
    if (own.length === 0) return [];
    const sum = (kind: SupplierTx['kind']) => own.filter(row => row.kind === kind).reduce((total, row) => total + row.amount, 0);
    return [{ currency, bills: sum('bill'), paid: sum('payment'), balance: sum('bill') - sum('payment') }];
  });
}

export function inSupplierFilter(supplier: Supplier, balances: SupplierBalance[], filter: SupplierFilter): boolean {
  if (filter === 'inactive') return !supplier.is_active;
  if (filter === 'owed') return balances.some(row => row.balance > 0);
  if (filter === 'settled') return !balances.some(row => row.balance > 0);
  return true;
}

/** What we owe in each currency. Currencies never add up to one figure. */
export function owedByCurrency(balances: SupplierBalance[]): Array<{ currency: SupplierCurrency; total: number }> {
  return SUPPLIER_CURRENCIES.flatMap(currency => {
    const total = balances.filter(row => row.currency === currency && row.balance > 0).reduce((sum, row) => sum + row.balance, 0);
    return total > 0 ? [{ currency, total }] : [];
  });
}

/** Spaces and case never matter, and neither do Turkish letters typed on an English keyboard. */
const searchable = (text: string): string => text.toLowerCase().replace(/[\s.-]+/g, '')
  .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/i̇/g, 'i');

export function matchesSupplier(supplier: Pick<Supplier, 'name'>, query: string): boolean {
  const needle = searchable(query);
  return !needle || searchable(supplier.name).includes(needle);
}

export const accountsFor = <T extends Pick<CashAccount, 'currencies'>>(accounts: T[], currency: SupplierCurrency): T[] =>
  accounts.filter(account => account.currencies.includes(currency));

/** `wa.me` needs the country code, and numbers here are usually written from the 0. */
export function whatsappLink(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return null;
  return `https://wa.me/${digits.startsWith('0') ? `90${digits.slice(1)}` : digits}`;
}
