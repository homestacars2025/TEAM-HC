import React from 'react';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '../i18n';
import { LIRA_VIEW, convertTry, formatAmount, formatTryAs, moneyView, rateNoteParts } from './money';
import { netOwed, walletTotals } from './customerWallets';
import type { CustomerSummary } from './customerWallets';

let mockCurrency = 'TRY';
const RATES = [
  { currency: 'USD', rate_to_try: 49, updated_at: '2026-11-09T08:00:00' },
  { currency: 'EUR', rate_to_try: 56.2, updated_at: '2026-11-09 08:00:00' },
];
jest.mock('./CurrencyContext', () => ({
  ...jest.requireActual('./CurrencyContext'),
  useCurrency: () => ({ currency: mockCurrency, rates: RATES }),
}));
// eslint-disable-next-line import/first
import { Money, RateNote } from '../components/Money';

describe('the money formatter', () => {
  test('lira stays lira, grouped the Turkish way, two decimals', () => {
    expect(formatTryAs(192037, LIRA_VIEW)).toBe('₺192.037,00');
  });

  test('converts lira at the latest rate and shows the symbol', () => {
    const usd = moneyView('USD', RATES);
    expect(convertTry(4900, usd)).toBe(100);
    expect(formatTryAs(192037, usd)).toBe('$3,919.12');
    expect(formatTryAs(5620, moneyView('EUR', RATES))).toBe('€100.00');
  });

  test('stays in lira until the rate has loaded, so no figure wears the wrong symbol', () => {
    expect(moneyView('USD', [])).toBe(LIRA_VIEW);
    expect(formatTryAs(100, moneyView('EUR', [{ currency: 'EUR', rate_to_try: 0 }]))).toBe('₺100,00');
  });

  test('signs only when asked', () => {
    expect(formatAmount(-12.5, 'USD')).toBe('$12.50');
    expect(formatAmount(-12.5, 'USD', { sign: 'negative' })).toBe('−$12.50');
    expect(formatAmount(12.5, 'USD', { sign: 'negative' })).toBe('$12.50');
    expect(formatAmount(12.5, 'TRY', { sign: 'always' })).toBe('+₺12,50');
    expect(formatAmount(0, 'TRY', { sign: 'always' })).toBe('₺0,00');
  });

  test('the caption names the rate and the day it was set', () => {
    expect(rateNoteParts(LIRA_VIEW, 'en-GB')).toBeNull();
    expect(rateNoteParts(moneyView('USD', RATES), 'en-GB')).toEqual({ code: 'USD', rate: '49,00 ₺', date: '9 Nov 2026' });
    expect(rateNoteParts(moneyView('USD', [{ currency: 'USD', rate_to_try: 49 }]), 'en-GB')?.date).toBeNull();
  });
});

describe('<Money> and the rate caption', () => {
  const wrap = (node: React.ReactNode) => <I18nextProvider i18n={i18n}>{node}</I18nextProvider>;
  beforeEach(async () => { await i18n.changeLanguage('en'); });

  test('in lira there is no caption', () => {
    mockCurrency = 'TRY';
    render(wrap(<><Money value={1500} /><RateNote /></>));
    expect(screen.getByText('₺1.500,00')).toHaveClass('hc-money-mono');
    expect(screen.queryByText(/Converted at/)).not.toBeInTheDocument();
  });

  test('in dollars the figure converts and the caption says at what rate', () => {
    mockCurrency = 'USD';
    render(wrap(<><Money value={4900} /><RateNote /></>));
    expect(screen.getByText('$100.00')).toBeInTheDocument();
    expect(screen.getByText('Converted at \u20661 USD = 49,00 ₺\u2069 (9 Nov 2026)')).toBeInTheDocument();
  });
});

describe('the wallets net', () => {
  const entry = (balance: number): CustomerSummary => ({ customerId: String(balance), name: '', phone: null, bookings: 1, plates: [], onRent: false, banned: false, banReason: null, balance });

  test('is owed minus credit: positive is ours to collect, negative ours to give back', () => {
    const list = [entry(-1000), entry(-500.5), entry(300), entry(0)];
    expect(walletTotals(list)).toEqual({ owes: 2, owed: 1500.5, credit: 1, held: 300, settled: 1 });
    expect(netOwed(list)).toBe(1200.5);
    expect(netOwed([entry(800), entry(-100)])).toBe(-700);
    expect(netOwed([])).toBe(0);
  });
});
