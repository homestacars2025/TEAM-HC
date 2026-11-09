/**
 * Money on screen. Amounts are stored in lira; Accounting shows them in the currency
 * picked in the top bar, at the latest rate in `exchange_rates`, the same source as
 * the switcher. Nothing here is ever saved: forms keep their own currency.
 *
 * Not for money that is really held in another currency (cash, envelopes) or that
 * is lira by rule (staff wallet, custody): those keep their own formatting.
 */

import type { Currency } from './CurrencyContext';

const SYMBOLS: Record<Currency, string> = { TRY: '₺', USD: '$', EUR: '€', LYD: 'LD' };

export interface RateRow {
  currency: string;
  rate_to_try: number;
  updated_at?: string | null;
}

/** What to show in: the currency, its lira rate, and when that rate was set. */
export interface MoneyView {
  currency: Currency;
  /** Lira per unit; 1 for lira. */
  rate: number;
  rateDate: string | null;
}

export const LIRA_VIEW: MoneyView = { currency: 'TRY', rate: 1, rateDate: null };

/** The view for a currency. Until its rate has loaded it stays in lira, so a figure never wears the wrong symbol. */
export function moneyView(currency: Currency, rates: readonly RateRow[]): MoneyView {
  if (currency === 'TRY') return LIRA_VIEW;
  const row = rates.find(r => r.currency === currency);
  const rate = Number(row?.rate_to_try);
  if (!row || !Number.isFinite(rate) || rate <= 0) return LIRA_VIEW;
  return { currency, rate, rateDate: row.updated_at ?? null };
}

export const convertTry = (tryAmount: number, view: MoneyView): number => (view.currency === 'TRY' ? tryAmount : tryAmount / view.rate);

/**
 * `none` drops the sign (most callers say in words or colour which way it goes),
 * `negative` marks only what is below zero, `always` marks both ways.
 */
export type MoneySign = 'none' | 'negative' | 'always';

export interface MoneyOptions {
  sign?: MoneySign;
  decimals?: number;
}

/** An amount already in `currency`: symbol first, two decimals, lira grouped the Turkish way. */
export function formatAmount(amount: number, currency: Currency, { sign = 'none', decimals = 2 }: MoneyOptions = {}): string {
  const value = Number.isFinite(amount) ? amount : 0;
  const rounded = Math.round(Math.abs(value) * 10 ** decimals) / 10 ** decimals;
  const digits = rounded.toLocaleString(currency === 'TRY' ? 'tr-TR' : 'en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const mark = rounded === 0 || sign === 'none' ? '' : value < 0 ? '−' : sign === 'always' ? '+' : '';
  return `${mark}${SYMBOLS[currency]}${digits}`;
}

/** A lira amount in the view's currency. */
export const formatTryAs = (tryAmount: number, view: MoneyView, options?: MoneyOptions): string =>
  formatAmount(convertTry(tryAmount, view), view.currency, options);

/** The pieces of "Converted at 1 USD = 49,00 ₺ (9 Nov 2026)", or null in lira. */
export function rateNoteParts(view: MoneyView, locale: string): { code: Currency; rate: string; date: string | null } | null {
  if (view.currency === 'TRY') return null;
  const at = view.rateDate ? new Date(view.rateDate.includes('T') || view.rateDate.includes(' ') ? view.rateDate.replace(' ', 'T') : `${view.rateDate}T12:00:00`) : null;
  const date = at && !Number.isNaN(at.getTime())
    ? at.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Istanbul' })
    : null;
  const rate = `${view.rate.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
  return { code: view.currency, rate, date };
}
