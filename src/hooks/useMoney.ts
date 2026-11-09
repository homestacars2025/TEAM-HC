import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrency, type Currency } from '../lib/CurrencyContext';
import { convertTry, formatAmount, formatTryAs, moneyView, rateNoteParts, type MoneyOptions } from '../lib/money';
import { useDateLocale } from './useDateLocale';

/**
 * Accounting's money: a lira amount in the top bar's currency, at the latest rate.
 * `formatIn` is for an amount held in a currency of its own (a supplier bill in
 * dollars): lira follows the switcher, anything else stays as it is.
 * `rateNote` is the caption for totals when the view isn't lira.
 */
export function useMoney() {
  const { currency, rates } = useCurrency();
  const { t } = useTranslation('common');
  const locale = useDateLocale();
  const view = useMemo(() => moneyView(currency, rates), [currency, rates]);

  const format = useCallback((tryAmount: number, options?: MoneyOptions) => formatTryAs(tryAmount, view, options), [view]);
  const convert = useCallback((tryAmount: number) => convertTry(tryAmount, view), [view]);
  const formatIn = useCallback(
    (amount: number, own: Currency, options?: MoneyOptions) => (own === 'TRY' ? formatTryAs(amount, view, options) : formatAmount(amount, own, options)),
    [view],
  );

  const parts = rateNoteParts(view, locale);
  // The rate reads left to right even inside an Arabic sentence.
  const pair = parts ? `\u20661 ${parts.code} = ${parts.rate}\u2069` : '';
  const rateNote = parts
    ? (parts.date ? t('money.convertedOn', { pair, date: parts.date }) : t('money.converted', { pair }))
    : null;

  return { currency: view.currency, view, format, convert, formatIn, rateNote };
}
