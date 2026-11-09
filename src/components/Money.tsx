import React from 'react';
import { useMoney } from '../hooks/useMoney';
import type { MoneySign } from '../lib/money';

/** A lira amount in the top bar's currency, in Geist Mono, kept left-to-right inside Arabic. */
export const Money: React.FC<{ value: number; sign?: MoneySign; decimals?: number; className?: string }> = ({ value, sign, decimals, className }) => {
  const { format } = useMoney();
  return <bdi dir="ltr" className={`hc-money-mono ${className ?? ''}`}>{format(value, { sign, decimals })}</bdi>;
};

/** "Converted at 1 USD = 49,00 ₺ (9 Nov 2026)" under a total, only when the view isn't lira. */
export const RateNote: React.FC<{ className?: string }> = ({ className }) => {
  const { rateNote } = useMoney();
  return rateNote ? <p className={`hc-rate-note ${className ?? ''}`}>{rateNote}</p> : null;
};

export default Money;
