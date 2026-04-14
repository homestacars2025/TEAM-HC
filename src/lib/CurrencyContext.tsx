import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Currency = 'TRY' | 'USD' | 'EUR' | 'LYD';

export const CURRENCIES: Currency[] = ['TRY', 'USD', 'EUR', 'LYD'];

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  TRY: '₺',
  USD: '$',
  EUR: '€',
  LYD: 'LD',
};

interface ExchangeRate {
  currency: string;
  rate_to_try: number;
}

interface CurrencyContextValue {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  rates: ExchangeRate[];
  symbol: string;
  /** Format a TRY-stored amount with the selected currency symbol + conversion */
  fmt: (tryAmount: number) => string;
  /** Convert a TRY-stored amount to the selected currency (number only) */
  convert: (tryAmount: number) => number;
}

// ─── Default context (TRY pass-through) ──────────────────────────────────────

const defaultFmt = (n: number) =>
  '₺' + Math.abs(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CurrencyContext = createContext<CurrencyContextValue>({
  currency:    'TRY',
  setCurrency: () => {},
  rates:       [],
  symbol:      '₺',
  fmt:         defaultFmt,
  convert:     (n) => n,
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currency, setCurrencyState] = useState<Currency>(() => {
    try { return (localStorage.getItem('hc_currency') as Currency) || 'TRY'; }
    catch { return 'TRY'; }
  });
  const [rates, setRates] = useState<ExchangeRate[]>([]);

  useEffect(() => {
    let cancelled = false;
    supabase.from('exchange_rates').select('currency, rate_to_try').then(({ data }) => {
      if (!cancelled && data) setRates(data as ExchangeRate[]);
    });
    return () => { cancelled = true; };
  }, []);

  const setCurrency = (c: Currency) => {
    setCurrencyState(c);
    try { localStorage.setItem('hc_currency', c); } catch {}
  };

  const symbol = CURRENCY_SYMBOLS[currency] ?? '₺';

  const convert = (tryAmount: number): number => {
    if (currency === 'TRY') return tryAmount;
    const rate = rates.find(r => r.currency === currency)?.rate_to_try;
    if (!rate || rate === 0) return tryAmount; // fallback if rates not loaded yet
    return tryAmount / rate;
  };

  const fmt = (tryAmount: number): string => {
    const converted = convert(Math.abs(tryAmount));
    let formatted: string;
    if (currency === 'TRY') {
      formatted = converted.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } else if (currency === 'LYD') {
      formatted = converted.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    } else {
      formatted = converted.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return symbol + formatted;
  };

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, rates, symbol, fmt, convert }}>
      {children}
    </CurrencyContext.Provider>
  );
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useCurrency = () => useContext(CurrencyContext);
